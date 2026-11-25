import { ref, tx, getDoc, where } from "../db";
import { sha256 } from "../crypto";
import { AppError, notFound } from "../errors";
import type { Channel, ChannelMode, EventDoc, Invitation, User } from "../types";
import { invitationsOf, neededPlaces, ownEvent } from "./events";
import { channelsFor } from "./invitations";
import { audit, getSettings } from "./settings";
import { ledgerRef, post } from "./ledger";
import { dispatchAll, makeMessage, sendPatch } from "./outbox";
import { eventVars, render } from "./texts";
import { eventView, link } from "./view";

export type SendKind = "invitation" | "reminder";
export interface BatchItem {
  invitationId: string;
  channel: Channel;
  to: string;
  cost: number;
}
export interface Batch {
  id: string;
  ownerId: string;
  eventId: string;
  kind: SendKind;
  items: BatchItem[];
  total: number;
  skippedForCredit: number;
  status: "pending" | "done";
  at: number;
}

/** التذكير فقط لمن وصلته الدعوة ولم يرد */
export const needsReminder = (i: Invitation) => i.sendStatus === "sent" && i.regStatus === "none";

async function plan(ownerId: string, eventId: string, kind: SendKind, mode: ChannelMode, ids?: string[]) {
  const e = await ownEvent(ownerId, eventId);
  if (e.type !== "private") throw new AppError("not_private", "الإرسال بالاسم للفعاليات الخاصة فقط");
  if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  if (e.endAt < Date.now()) throw new AppError("ended", "انتهت الفعالية");
  if (e.paidPlaces <= 0) throw new AppError("not_paid", "ادفع الباقة قبل إرسال الدعوات");
  const all = await invitationsOf(eventId);
  const need = neededPlaces(all);
  if (need > e.paidPlaces) throw new AppError("over_package", `المدعوون يحتاجون ${need} مكانًا والباقة ${e.paidPlaces}. اشترِ ${need - e.paidPlaces} مكانًا إضافيًا قبل أي إرسال.`);
  let targets = ids ? all.filter((i) => ids.includes(i.id)) : all.filter((i) => i.sendStatus === "not_sent");
  if (kind === "reminder") targets = (ids ? targets : all).filter(needsReminder);
  const s = await getSettings();
  const items: BatchItem[] = targets.flatMap((i) => channelsFor(i, mode).map((ch) => ({ invitationId: i.id, channel: ch, to: (ch === "whatsapp" ? i.phone : i.email)!, cost: s.prices.message[ch] })));
  return { e, s, items, recipients: targets.length };
}

/** التكلفة المتوقعة قبل الإرسال أو الجدولة */
export async function estimate(ownerId: string, eventId: string, kind: SendKind, mode: ChannelMode, ids?: string[]) {
  const p = await plan(ownerId, eventId, kind, mode, ids);
  const u = (await getDoc<User>("users", ownerId))!;
  const cost = p.items.reduce((n, i) => n + i.cost, 0);
  return { recipients: p.recipients, messages: p.items.length, whatsapp: p.items.filter((i) => i.channel === "whatsapp").length, email: p.items.filter((i) => i.channel === "email").length, cost, balance: u.credit, enough: u.credit >= cost, policy: p.s.policy.lowCredit };
}

export type SendResult =
  | { status: "sent"; batchId: string; messages: number; cost: number; balance: number; skippedForCredit: number; failed: number; again?: boolean }
  | { status: "low_credit"; needed: number; balance: number }
  | { status: "nothing" };

/**
 * الإرسال من الرصيد: الخصم وعناصر الدفعة في نفس المعاملة، ثم الرسائل بمعرّفات ثابتة <batch>_<i>.
 * نفس مفتاح منع التكرار لا يخصم مرتين ولا ينشئ رسائل مكررة.
 */
export async function send(p: { ownerId: string; eventId: string; kind: SendKind; mode: ChannelMode; ids?: string[]; key: string }): Promise<SendResult> {
  if (!p.key || p.key.length < 8) throw new AppError("validation", "أعد تحميل الصفحة وحاول مرة أخرى");
  const batchId = `b_${sha256(`${p.ownerId}:${p.key}`).slice(0, 28)}`;
  const bRef = ref("batches", batchId);
  const prior = await getDoc<Batch>("batches", batchId);
  if (prior) {
    const res = await dispatchAll(await materialize(batchId));
    const u = (await getDoc<User>("users", p.ownerId))!;
    return { status: "sent", batchId, messages: prior.items.length, cost: prior.total, balance: u.credit, skippedForCredit: prior.skippedForCredit, failed: Object.values(res).filter((x) => x === "failed").length, again: true };
  }
  const pl = await plan(p.ownerId, p.eventId, p.kind, p.mode, p.ids);
  if (!pl.items.length) return { status: "nothing" };
  const uRef = ref("users", p.ownerId);
  const r = await tx(async (t) => {
    const [uS, lS, bS] = await Promise.all([t.get(uRef), t.get(ledgerRef(`batch:${batchId}`)), t.get(bRef)]);
    if (lS.exists || bS.exists) return { kind: "dup" as const };
    const bal = (uS.data() as User).credit;
    let items = pl.items;
    const full = items.reduce((n, i) => n + i.cost, 0);
    if (full > bal) {
      if (pl.s.policy.lowCredit === "block") return { kind: "low" as const, needed: full, balance: bal };
      // «إرسال ما يغطيه الرصيد» بترتيب القائمة
      let sum = 0;
      const cut = items.findIndex((i) => (sum += i.cost) > bal);
      items = items.slice(0, cut);
      if (!items.length) return { kind: "low" as const, needed: full, balance: bal };
    }
    const total = items.reduce((n, i) => n + i.cost, 0);
    const b: Batch = { id: batchId, ownerId: p.ownerId, eventId: p.eventId, kind: p.kind, items, total, skippedForCredit: pl.items.length - items.length, status: "pending", at: Date.now() };
    t.set(bRef, b);
    const entry = post(t, uRef, bal, `batch:${batchId}`, { userId: p.ownerId, amount: -total, reason: "batch", note: `${p.kind === "invitation" ? "دعوات" : "تذكير"} — ${pl.e.title} (${items.length} رسالة)`, refId: batchId });
    return { kind: "ok" as const, b, balance: entry.balance };
  });
  if (r.kind === "dup") return send(p);
  if (r.kind === "low") return { status: "low_credit", needed: r.needed, balance: r.balance };
  const res = await dispatchAll(await materialize(batchId));
  return { status: "sent", batchId, messages: r.b.items.length, cost: r.b.total, balance: r.balance, skippedForCredit: r.b.skippedForCredit, failed: Object.values(res).filter((x) => x === "failed").length };
}

/** إنشاء رسائل الدفعة بمعرّفات ثابتة؛ آمن للتكرار، والعامل يكمل الدفعات المعلّقة */
export async function materialize(batchId: string) {
  const b = await getDoc<Batch>("batches", batchId);
  if (!b) throw notFound("الدفعة");
  const ids = b.items.map((_, i) => `${batchId}_${i}`);
  if (b.status === "done") return ids;
  const e = (await getDoc<EventDoc>("events", b.eventId))!;
  const run = async (i: number) => {
    const item = b.items[i];
    await tx(async (t) => {
      const mRef = ref("messages", ids[i]);
      const iRef = ref("invitations", item.invitationId);
      const [mS, iS] = await Promise.all([t.get(mRef), t.get(iRef)]);
      if (mS.exists) return;
      const inv = iS.data() as Invitation | undefined;
      const v = eventView(e, inv?.name ?? "");
      const vars = { ...eventVars(v), guest_name: inv?.name ?? "", invitation_link: inv ? link.invitation(inv.token) : "", companion_line: b.kind === "invitation" && inv?.companion ? "الدعوة تشمل مرافقًا واحدًا.\n" : "" };
      t.set(mRef, makeMessage(ids[i], { ...render(b.kind, vars, item.channel), kind: b.kind, channel: item.channel, to: item.to, chargedTo: "credit", cost: item.cost, ownerId: b.ownerId, eventId: b.eventId, batchId, invitationId: item.invitationId }));
      if (inv && b.kind === "invitation") t.update(iRef, sendPatch(inv, item.channel, "sending"));
    });
  };
  for (let i = 0; i < ids.length; i += 10) await Promise.all(ids.slice(i, i + 10).map((_, j) => run(i + j)));
  await ref("batches", batchId).update({ status: "done" });
  return ids;
}

export async function finishPendingBatches() {
  let n = 0;
  for (const b of await where<Batch>("batches", "status", "pending")) n += (await materialize(b.id)).length;
  return n;
}

/* ========================= التذكيرات المجدولة ========================= */

export interface Reminder {
  id: string;
  ownerId: string;
  eventId: string;
  runAt: number;
  mode: ChannelMode;
  status: "scheduled" | "running" | "done" | "failed" | "cancelled";
  lease: number | null;
  result: string | null;
  at: number;
}

export async function scheduleReminder(ownerId: string, eventId: string, runAt: number, mode: ChannelMode) {
  const e = await ownEvent(ownerId, eventId);
  if (e.paidPlaces <= 0) throw new AppError("not_paid", "ادفع الباقة أولًا");
  if (runAt < Date.now() + 60_000) throw new AppError("validation", "اختر موعدًا مستقبليًا");
  if (runAt > e.endAt) throw new AppError("validation", "الموعد بعد نهاية الفعالية");
  const r = ref("reminders", `rem_${sha256(`${eventId}:${runAt}:${Math.random()}`).slice(0, 20)}`);
  const rem: Reminder = { id: r.id, ownerId, eventId, runAt, mode, status: "scheduled", lease: null, result: null, at: Date.now() };
  await r.set(rem);
  return rem;
}

export async function cancelReminder(ownerId: string, id: string) {
  await tx(async (t) => {
    const rem = (await t.get(ref("reminders", id))).data() as Reminder | undefined;
    if (!rem || rem.ownerId !== ownerId) throw notFound("التذكير");
    if (rem.status !== "scheduled") throw new AppError("started", "لا يُلغى تذكير بدأ أو انتهى");
    t.update(ref("reminders", id), { status: "cancelled" });
  });
}

export const remindersOf = async (eventId: string) => (await where<Reminder>("reminders", "eventId", eventId)).sort((a, b) => b.runAt - a.runAt);

/** ينفّذ التذكيرات المستحقة: يفحص حالة كل مدعو لحظة التنفيذ، ولا ينفّذ المهمة مرتين (حجز + مفتاح ثابت) */
export async function runReminders() {
  const now = Date.now();
  const due = [...(await where<Reminder>("reminders", "status", "scheduled")).filter((r) => r.runAt <= now), ...(await where<Reminder>("reminders", "status", "running")).filter((r) => (r.lease ?? 0) < now)];
  const out: { id: string; status: string }[] = [];
  for (const r of due) {
    const got = await tx(async (t) => {
      const cur = (await t.get(ref("reminders", r.id))).data() as Reminder;
      const n = Date.now();
      if (!((cur.status === "scheduled" && cur.runAt <= n) || (cur.status === "running" && (cur.lease ?? 0) < n))) return false;
      t.update(ref("reminders", r.id), { status: "running", lease: n + 5 * 60_000 });
      return true;
    });
    if (!got) continue;
    let status: Reminder["status"] = "done";
    let result: string;
    try {
      const res = await send({ ownerId: r.ownerId, eventId: r.eventId, kind: "reminder", mode: r.mode, key: `reminder:${r.id}` });
      if (res.status === "sent") result = `أُرسلت ${res.messages} رسالة بتكلفة ${(res.cost / 100).toFixed(2)} ر.س${res.skippedForCredit ? `؛ وتُرك ${res.skippedForCredit} لعدم كفاية الرصيد` : ""}`;
      else if (res.status === "nothing") result = "لا يوجد من يحتاج تذكيرًا لحظة التنفيذ";
      else {
        status = "failed";
        result = `فشل: رصيد الرسائل غير كافٍ (المطلوب ${(res.needed / 100).toFixed(2)} ر.س والرصيد ${(res.balance / 100).toFixed(2)} ر.س). لم يُرسل شيء.`;
      }
    } catch (e) {
      status = "failed";
      result = `فشل: ${(e as Error).message}`;
    }
    await ref("reminders", r.id).update({ status, result, lease: null });
    if (status === "failed") await audit("system", "reminder.failed", `reminders/${r.id}`, { result });
    out.push({ id: r.id, status });
  }
  return out;
}
