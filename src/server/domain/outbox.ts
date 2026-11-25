import type { Transaction } from "firebase-admin/firestore";
import { db, ref, tx, where } from "../db";
import type { Channel, Invitation, Message, SendStatus, Settings, User } from "../types";
import { messageProvider, type SendOutcome } from "../providers/messaging";
import { getSettings } from "./settings";
import { ledgerRef, post } from "./ledger";

export type NewMessage = Pick<Message, "kind" | "channel" | "to" | "template" | "vars" | "subject" | "body" | "chargedTo"> &
  Partial<Pick<Message, "ownerId" | "eventId" | "batchId" | "invitationId" | "registrationId" | "cost" | "opCost">>;

export function makeMessage(id: string, m: NewMessage): Message {
  const now = Date.now();
  return {
    id, ownerId: null, eventId: null, batchId: null, invitationId: null, registrationId: null, cost: 0, opCost: 0, ...m,
    status: "queued", attempts: 0, nextAt: now, lease: null, refunded: false, error: null, log: [{ at: now, s: "queued" }], createdAt: now, sentAt: null,
  };
}

/** إضافة رسالة داخل معاملة قائمة بمعرّف ثابت (إعادة المحاولة لا تكررها) */
export const queueIn = (t: Transaction, id: string, m: NewMessage) => t.set(ref("messages", id), makeMessage(id, m));

const LEASE = 60_000;

/** حجز الرسالة حتى لا يرسلها عاملان معًا */
async function claim(id: string) {
  return tx(async (t) => {
    const r = ref("messages", id);
    const m = (await t.get(r)).data() as Message | undefined;
    const now = Date.now();
    if (!m || !((m.status === "queued" && m.nextAt <= now) || (m.status === "sending" && (m.lease ?? 0) < now))) return null;
    t.update(r, { status: "sending", lease: now + LEASE });
    return m;
  });
}

export function sendPatch(inv: Invitation, channel: Channel, s: SendStatus): Partial<Invitation> {
  const send = { ...inv.send, [channel]: s };
  const all = Object.values(send);
  const agg: SendStatus = all.includes("sent") ? "sent" : all.includes("sending") ? "sending" : all.includes("failed") ? "failed" : "not_sent";
  return { send, sendStatus: agg, ...(s === "sent" ? { sentAt: Date.now() } : {}) };
}

async function settle(id: string, out: SendOutcome, s: Settings) {
  await tx(async (t) => {
    const r = ref("messages", id);
    const m = (await t.get(r)).data() as Message;
    if (m.status !== "sending") return;
    const attempts = m.attempts + 1;
    const final = !out.ok && (out.permanent || attempts >= s.policy.maxAttempts);
    const refund = final && m.chargedTo === "credit" && m.cost > 0 && !m.refunded && !!m.ownerId;
    // القراءات
    const invRef = m.invitationId && m.kind === "invitation" ? ref("invitations", m.invitationId) : null;
    const inv = invRef ? ((await t.get(invRef)).data() as Invitation | undefined) : undefined;
    const ur = refund ? ref("users", m.ownerId!) : null;
    const u = ur ? ((await t.get(ur)).data() as User | undefined) : undefined;
    const lr = refund ? ledgerRef(`refund:${id}`) : null;
    const lExists = lr ? (await t.get(lr)).exists : true;
    // الكتابات
    const now = Date.now();
    if (out.ok) {
      t.update(r, { status: "sent", attempts, sentAt: now, lease: null, error: null, log: [...m.log, { at: now, s: "sent", note: `محاولة ${attempts}` }] });
    } else if (final) {
      t.update(r, { status: "failed", attempts, lease: null, error: out.error ?? "فشل الإرسال", refunded: refund, log: [...m.log, { at: now, s: "failed", note: `${out.error ?? ""} — محاولة ${attempts}${refund ? " — استُرجعت القيمة" : ""}` }] });
      if (refund && u && !lExists) post(t, ur!, u.credit, `refund:${id}`, { userId: m.ownerId!, amount: m.cost, reason: "refund", note: "استرجاع رسالة فشلت", refId: id });
    } else {
      t.update(r, { status: "queued", attempts, lease: null, nextAt: now + s.policy.retryBaseSec * 1000 * 2 ** (attempts - 1), error: out.error ?? null, log: [...m.log, { at: now, s: "retry", note: `${out.error ?? ""} — محاولة ${attempts}` }] });
    }
    if (inv) t.update(invRef!, sendPatch(inv, m.channel, out.ok ? "sent" : final ? "failed" : "sending"));
  });
}

/** يرسل رسالة واحدة إن كانت مستحقة؛ آمن للتكرار */
export async function dispatch(id: string, s?: Settings) {
  const settings = s ?? (await getSettings());
  const m = await claim(id);
  if (!m) return "skipped";
  let out: SendOutcome;
  try {
    out = await messageProvider(m.channel).send(m);
  } catch (e) {
    out = { ok: false, error: (e as Error).message };
  }
  await settle(id, out, settings);
  return ((await ref("messages", id).get()).data() as Message).status;
}

export async function dispatchAll(ids: string[], concurrency = 8) {
  const s = await getSettings();
  const q = [...ids];
  const out: Record<string, string> = {};
  await Promise.all(Array.from({ length: Math.min(concurrency, q.length) }, async () => { while (q.length) { const id = q.shift()!; out[id] = await dispatch(id, s); } }));
  return out;
}

/** للمستدعين بعد الالتزام: الإرسال الفوري، والفشل يتكفّل به العامل الدوري */
export async function flush(ids: string[]) {
  if (!ids.length) return;
  try {
    await dispatchAll(ids);
  } catch (e) {
    console.error("[outbox]", e);
  }
}

/** العامل: كل المستحق (جديد، إعادة محاولة، عالق) */
export async function dispatchDue(limit = 300) {
  const now = Date.now();
  const [q, s] = await Promise.all([where<Message>("messages", "status", "queued"), where<Message>("messages", "status", "sending")]);
  const ids = [...q.filter((m) => m.nextAt <= now), ...s.filter((m) => (m.lease ?? 0) < now)].sort((a, b) => a.nextAt - b.nextAt).slice(0, limit).map((m) => m.id);
  return dispatchAll(ids);
}

export async function messagesOf(f: { eventId?: string; ownerId?: string }) {
  const list = f.eventId ? await where<Message>("messages", "eventId", f.eventId) : f.ownerId ? await where<Message>("messages", "ownerId", f.ownerId) : (await db().collection("messages").get()).docs.map((d) => d.data() as Message);
  return list.sort((a, b) => b.createdAt - a.createdAt);
}
