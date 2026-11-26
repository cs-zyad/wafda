import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { ref, tx, where, getDoc } from "../db";
import { token, sha256 } from "../crypto";
import { AppError, notFound } from "../errors";
import { clamp, normalizeEmail, normalizePhone } from "@/shared/text";
import { fmtDateTime, HOUR, MINUTE } from "@/shared/time";
import type { Channel, EventDoc, Invitation, Registration, Settings, Ticket, TicketKind, User } from "../types";
import { available, eventBySlug, ownEvent } from "./events";
import { invitationByToken } from "./invitations";
import { audit, getSettings } from "./settings";
import { queueIn, flush } from "./outbox";
import { eventVars, render } from "./texts";
import { eventView, link } from "./view";
import { ledgerRef, post } from "./ledger";
import { channelReady } from "../providers/messaging";

/* ========================= النتائج ========================= */

export type TicketRef = { kind: TicketKind; token: string };
export type Result =
  | { status: "confirmed"; regId: string; manageToken: string; seats: number; tickets: TicketRef[]; again?: boolean }
  | { status: "waitlisted"; regId: string; manageToken: string; wantSeats: number; again?: boolean }
  | { status: "declined"; regId: string; manageToken: string }
  | { status: "one_left"; canWaitlist: boolean }
  | { status: "full"; canWaitlist: boolean }
  | { status: "offer_expired" | "offer_lost"; regId: string; manageToken: string }
  | { status: "duplicate"; resent: boolean }
  | { status: "closed"; reason: string };

export interface Choice {
  single?: boolean; // تبقّى مقعد: أكّد منفردًا
  waitlist?: boolean; // انضم للانتظار
}

/* ========================= قرار المقاعد (مصدر واحد) ========================= */

type Decision = { act: "confirm"; seats: number } | { act: "waitlist"; seats: number } | { act: "one_left" | "full"; canWaitlist: boolean };

export function decide(free: number, want: number, policy: EventDoc["fullPolicy"], c: Choice): Decision {
  const canWaitlist = policy === "waitlist";
  if (free >= want) return { act: "confirm", seats: want };
  if (want === 2 && free === 1) {
    if (c.single) return { act: "confirm", seats: 1 };
    if (c.waitlist && canWaitlist) return { act: "waitlist", seats: 2 };
    return { act: "one_left", canWaitlist };
  }
  if (c.waitlist && canWaitlist) return { act: "waitlist", seats: want };
  return { act: "full", canWaitlist };
}

export function closedReason(e: EventDoc): string | null {
  if (e.status === "cancelled") return "أُلغيت هذه الفعالية";
  if (e.status !== "active" || e.paidPlaces <= 0) return "التسجيل غير متاح حاليًا";
  if (e.endAt < Date.now()) return "انتهت هذه الفعالية";
  return null;
}

/* ========================= أدوات ========================= */

export const privateRegId = (invId: string) => `inv_${invId}`;
export const publicRegId = (eventId: string, key: string) => `pub_${sha256(`${eventId}:${key}`).slice(0, 32)}`;
const contactKey = (eventId: string, contact: string) => `evc:${eventId}:${sha256(contact).slice(0, 40)}`;
const ticketRef = (regId: string, k: TicketKind) => ref("tickets", `${regId}_${k}`);
const channelOf = (r: Pick<Registration, "contactType">): Channel => (r.contactType === "phone" ? "whatsapp" : "email");
const manageLink = (r: Registration, inv: Invitation | null) => (inv ? link.invitation(inv.token) : link.manage(r.manageToken));
const activeTickets = (...t: (Ticket | undefined)[]) => t.filter((x): x is Ticket => !!x && x.status === "active").map((x) => ({ kind: x.kind, token: x.token }));

export function guestInput(i: { name: string; contactType: string; contact: string }) {
  const name = clamp(i.name, 120);
  if (name.length < 2) throw new AppError("validation", "اكتب اسمك (حرفان على الأقل)");
  if (i.contactType !== "phone" && i.contactType !== "email") throw new AppError("validation", "اختر وسيلة التواصل");
  if (i.contactType === "phone" && !channelReady("whatsapp")) throw new AppError("validation", "التواصل عبر البريد الإلكتروني فقط حاليًا");
  const contact = i.contactType === "phone" ? normalizePhone(i.contact) : normalizeEmail(i.contact);
  if (!contact) throw new AppError("validation", i.contactType === "phone" ? "رقم الجوال غير صالح" : "البريد الإلكتروني غير صالح");
  return { name, contactType: i.contactType as "phone" | "email", contact };
}

function blankReg(id: string, e: EventDoc, source: Registration["source"], invitationId: string | null, g: ReturnType<typeof guestInput>): Registration {
  const now = Date.now();
  return {
    id, eventId: e.id, ownerId: e.ownerId, source, invitationId, ...g, status: "declined", seats: 0, wantSeats: 1, manageToken: token(20),
    offerUntil: null, waitlistedAt: null, confirmedAt: null, resendAt: null, seq: { confirm: 0, resend: 0, offer: 0 }, createdAt: now, updatedAt: now,
  };
}

/** التأكيد: المقاعد + التذاكر + نسخة الحالة على الدعوة + رسالة التأكيد — بعد كل القراءات داخل نفس المعاملة */
function writeConfirm(t: Transaction, p: { e: EventDoc; reg: Registration; inv: Invitation | null; seats: number; s: Settings; hadCompanion: boolean }) {
  const now = Date.now();
  const reg: Registration = { ...p.reg, status: "confirmed", seats: p.seats, wantSeats: p.seats, confirmedAt: now, offerUntil: null, updatedAt: now, seq: { ...p.reg.seq, confirm: p.reg.seq.confirm + 1 } };
  const kinds: TicketKind[] = p.seats > 1 ? ["guest", "companion"] : ["guest"];
  const tickets = kinds.map((kind) => {
    const tk: Ticket = { id: `${reg.id}_${kind}`, token: token(20), eventId: p.e.id, registrationId: reg.id, kind, guestName: reg.name, status: "active", inAt: null, inBy: null, inByName: null, inMethod: null, createdAt: now };
    t.set(ticketRef(reg.id, kind), tk);
    return { kind, token: tk.token };
  });
  if (p.seats === 1 && p.hadCompanion) t.update(ticketRef(reg.id, "companion"), { status: "cancelled" });
  t.set(ref("registrations", reg.id), reg);
  t.update(ref("events", p.e.id), { reserved: p.e.reserved + p.seats, updatedAt: now });
  if (p.inv) t.update(ref("invitations", p.inv.id), { regStatus: "confirmed" });
  // رسالة التأكيد مع التذكرة: مشمولة في الباقة، بتكلفة تشغيل تقديرية معزولة
  const ch = channelOf(reg);
  const comp = tickets.find((x) => x.kind === "companion");
  const msg = render("confirmation", { ...eventVars(eventView(p.e, reg.name)), guest_name: reg.name, ticket_link: link.ticket(tickets[0].token), companion_line: comp ? `تذكرة مرافقك (شاركها معه):\n${link.ticket(comp.token)}\n` : "", manage_link: manageLink(reg, p.inv) }, ch);
  const msgId = `conf_${reg.id}_${reg.seq.confirm}`;
  // القناة غير المفعّلة لا تُنشأ لها رسالة؛ التذكرة تظهر للضيف في الصفحة مباشرة
  if (channelReady(ch)) queueIn(t, msgId, { ...msg, kind: "confirmation", channel: ch, to: reg.contact, chargedTo: "package", opCost: p.s.prices.confirmOpCost[ch], ownerId: p.e.ownerId, eventId: p.e.id, invitationId: p.inv?.id ?? null, registrationId: reg.id });
  return { tickets, msgId };
}

/** إعادة إرسال التذكرة لصاحب الوسيلة (أو حالة التسجيل إن لم يكن مؤكدًا). مشمولة في الباقة. */
function writeResend(t: Transaction, p: { e: EventDoc; reg: Registration; inv: Invitation | null; g?: Ticket; c?: Ticket; s: Settings }) {
  const ch = channelOf(p.reg);
  const base = { ...eventVars(eventView(p.e, p.reg.name)), guest_name: p.reg.name, manage_link: manageLink(p.reg, p.inv) };
  const msg =
    p.reg.status === "confirmed" && p.g?.status === "active"
      ? render("ticket_resend", { ...base, ticket_link: link.ticket(p.g.token), companion_line: p.c?.status === "active" ? `تذكرة مرافقك:\n${link.ticket(p.c.token)}\n` : "" }, ch)
      : render("status", { ...base, status_text: p.reg.status === "waitlisted" || p.reg.status === "offered" ? "في قائمة الانتظار" : "غير مؤكد" }, ch);
  const n = p.reg.seq.resend + 1;
  const id = `resend_${p.reg.id}_${n}`;
  if (channelReady(ch)) queueIn(t, id, { ...msg, kind: "ticket_resend", channel: ch, to: p.reg.contact, chargedTo: "package", opCost: p.s.prices.confirmOpCost[ch], ownerId: p.e.ownerId, eventId: p.e.id, invitationId: p.inv?.id ?? null, registrationId: p.reg.id });
  t.update(ref("registrations", p.reg.id), { resendAt: Date.now(), seq: { ...p.reg.seq, resend: n } });
  return id;
}

/* ========================= المسار الموحّد للحجز ========================= */

interface BookTarget {
  eventId: string;
  regId: string;
  source: Registration["source"];
  invitationId: string | null;
  guest?: ReturnType<typeof guestInput>; // بيانات من النموذج (لإنشاء أو تحديث)
  withCompanion?: boolean;
  uniqueRef?: DocumentReference; // للرابط العام: وسيلة التواصل داخل الفعالية
}

/**
 * الحجز داخل معاملة واحدة آمنة للتزامن: تقرأ وثيقة الفعالية والتسجيل والتذاكر والدعوة (وقيد الوسيلة)،
 * ثم تقرر وتكتب. لا يمكن لطلبات متزامنة تجاوز السعة، والضغط المتكرر يعيد نفس التسجيل.
 */
async function book(target: BookTarget, choice: Choice): Promise<Result> {
  const s = await getSettings();
  const msgs: string[] = [];
  const result = await tx(async (t): Promise<Result> => {
    msgs.length = 0;
    // ---- القراءات (كلها قبل أي كتابة)
    const eRef = ref("events", target.eventId);
    const rRef = ref("registrations", target.regId);
    const invRef = target.invitationId ? ref("invitations", target.invitationId) : null;
    const [eS, rS, gS, cS, iS, uS] = await Promise.all([
      t.get(eRef), t.get(rRef), t.get(ticketRef(target.regId, "guest")), t.get(ticketRef(target.regId, "companion")),
      invRef ? t.get(invRef) : Promise.resolve(null), target.uniqueRef ? t.get(target.uniqueRef) : Promise.resolve(null),
    ]);
    const e = eS.data() as EventDoc;
    if (!e) throw notFound("الفعالية");
    const inv = (iS?.data() as Invitation | undefined) ?? null;
    if (invRef && !inv) throw notFound("الدعوة");
    let reg = (rS.data() as Registration | undefined) ?? null;
    const g = gS.data() as Ticket | undefined;
    const c = cS.data() as Ticket | undefined;

    // نفس مفتاح النموذج/الدعوة: نفس التسجيل
    if (reg?.status === "confirmed") return { status: "confirmed", regId: reg.id, manageToken: reg.manageToken, seats: reg.seats, tickets: activeTickets(g, c), again: true };
    if (reg && target.source === "public" && target.uniqueRef) {
      if (reg.status === "waitlisted" || reg.status === "offered") return { status: "waitlisted", regId: reg.id, manageToken: reg.manageToken, wantSeats: reg.wantSeats, again: true };
      return { status: "declined", regId: reg.id, manageToken: reg.manageToken };
    }
    // الرابط العام: وسيلة مسجلة مسبقًا بتسجيل آخر => لا نكشف التذكرة، بل نعيد الإرسال لصاحبها
    if (!reg && uS?.exists) {
      const otherId = uS.data()!.ref as string;
      const [oS, ogS, ocS] = await Promise.all([t.get(ref("registrations", otherId)), t.get(ticketRef(otherId, "guest")), t.get(ticketRef(otherId, "companion"))]);
      const other = oS.data() as Registration | undefined;
      if (!other) return { status: "duplicate", resent: false };
      if (other.resendAt && other.resendAt + s.policy.resendMinMinutes * MINUTE > Date.now()) return { status: "duplicate", resent: false };
      msgs.push(writeResend(t, { e, reg: other, inv: null, g: ogS.data() as Ticket | undefined, c: ocS.data() as Ticket | undefined, s }));
      return { status: "duplicate", resent: true };
    }
    const closed = closedReason(e);
    if (closed) return { status: "closed", reason: closed };
    if (reg?.status === "cancelled") return { status: "closed", reason: "ألغى المنظّم تسجيلك في هذه الفعالية" };
    if (reg?.status === "waitlisted") return { status: "waitlisted", regId: reg.id, manageToken: reg.manageToken, wantSeats: reg.wantSeats, again: true };

    if (!reg) {
      if (!target.guest) throw notFound("التسجيل");
      reg = blankReg(target.regId, e, target.source, target.invitationId, target.guest);
    } else if (target.guest) reg = { ...reg, ...target.guest };

    const want = target.source === "private" && inv?.companion ? ((target.withCompanion ?? reg.wantSeats > 1) ? 2 : 1) : 1;
    const free = available(e);
    const now = Date.now();
    const toWaitlist = (seats: number) => {
      t.set(rRef, { ...reg!, status: "waitlisted", wantSeats: seats, seats: 0, offerUntil: null, waitlistedAt: reg!.waitlistedAt ?? now, updatedAt: now });
      if (invRef) t.update(invRef, { regStatus: "waitlisted" });
      if (target.uniqueRef && !uS?.exists) t.set(target.uniqueRef, { kind: "event_contact", eventId: e.id, ref: reg!.id });
    };

    // فرصة من قائمة الانتظار
    if (reg.status === "offered") {
      if ((reg.offerUntil ?? 0) < now) {
        toWaitlist(reg.wantSeats);
        return { status: "offer_expired", regId: reg.id, manageToken: reg.manageToken };
      }
      const d = decide(free, want, e.fullPolicy, { single: choice.single });
      if (d.act === "confirm") {
        const w = writeConfirm(t, { e, reg, inv, seats: d.seats, s, hadCompanion: !!c });
        msgs.push(w.msgId);
        return { status: "confirmed", regId: reg.id, manageToken: reg.manageToken, seats: d.seats, tickets: w.tickets };
      }
      if (d.act === "one_left" && !choice.waitlist) return { status: "one_left", canWaitlist: true };
      toWaitlist(reg.wantSeats);
      return { status: "offer_lost", regId: reg.id, manageToken: reg.manageToken };
    }

    // جديد أو معتذر سابقًا
    const d = decide(free, want, e.fullPolicy, choice);
    if (d.act === "confirm") {
      if (target.uniqueRef && !uS?.exists) t.set(target.uniqueRef, { kind: "event_contact", eventId: e.id, ref: reg.id });
      const w = writeConfirm(t, { e, reg, inv, seats: d.seats, s, hadCompanion: !!c });
      msgs.push(w.msgId);
      return { status: "confirmed", regId: reg.id, manageToken: reg.manageToken, seats: d.seats, tickets: w.tickets };
    }
    if (d.act === "waitlist") {
      toWaitlist(d.seats);
      return { status: "waitlisted", regId: reg.id, manageToken: reg.manageToken, wantSeats: d.seats };
    }
    return { status: d.act, canWaitlist: d.canWaitlist };
  });
  await flush(msgs);
  return result;
}

/* ========================= نقاط الدخول ========================= */

/** تأكيد دعوة خاصة من رابطها */
export async function confirmInvitation(invToken: string, input: { name: string; contactType: string; contact: string; withCompanion?: boolean }, choice: Choice = {}) {
  const inv = await invitationByToken(invToken);
  if (!inv) throw notFound("الدعوة");
  return book({ eventId: inv.eventId, regId: privateRegId(inv.id), source: "private", invitationId: inv.id, guest: guestInput(input), withCompanion: !!input.withCompanion }, choice);
}

/** التسجيل من الرابط العام (مفتاح منع التكرار من النموذج) */
export async function registerPublic(slug: string, key: string, input: { name: string; contactType: string; contact: string }, choice: Choice = {}) {
  if (!key || key.length < 16 || key.length > 100) throw new AppError("validation", "أعد تحميل الصفحة وحاول مرة أخرى");
  const e = await eventBySlug(slug);
  if (!e || e.type !== "public") throw notFound("الفعالية");
  const g = guestInput(input);
  return book({ eventId: e.id, regId: publicRegId(e.id, key), source: "public", invitationId: null, guest: g, uniqueRef: ref("uniques", contactKey(e.id, g.contact)) }, choice);
}

export async function regByManageToken(t: string) {
  if (!t || t.length > 40) return null;
  return (await where<Registration>("registrations", "manageToken", t))[0] ?? null;
}

/** التأكيد من صفحة الإدارة: فرصة انتظار، أو عودة بعد اعتذار */
export async function confirmByManage(manageToken: string, choice: Choice = {}) {
  const r = await regByManageToken(manageToken);
  if (!r) throw notFound("التسجيل");
  return book({ eventId: r.eventId, regId: r.id, source: r.source, invitationId: r.invitationId }, choice);
}

/* ========================= الاعتذار والإلغاء ========================= */

/** يحرر المقاعد ويلغي التذاكر؛ ممنوع بعد تسجيل حضور أي تذكرة. تكراره آمن. */
async function release(regId: string, by: "guest" | "organizer", fromInvitation?: Invitation) {
  return tx(async (t) => {
    const rRef = ref("registrations", regId);
    let reg = (await t.get(rRef)).data() as Registration | undefined;
    const eventId = reg?.eventId ?? fromInvitation?.eventId;
    if (!eventId) throw notFound("التسجيل");
    const invId = reg?.invitationId ?? fromInvitation?.id ?? null;
    const [eS, gS, cS, iS] = await Promise.all([t.get(ref("events", eventId)), t.get(ticketRef(regId, "guest")), t.get(ticketRef(regId, "companion")), invId ? t.get(ref("invitations", invId)) : Promise.resolve(null)]);
    const e = eS.data() as EventDoc;
    const status = by === "guest" ? "declined" : "cancelled";
    const now = Date.now();
    if (!reg) {
      // المدعو يعتذر قبل أن يؤكد
      const inv = fromInvitation!;
      reg = blankReg(regId, e, "private", inv.id, { name: inv.name, contactType: inv.phone ? "phone" : "email", contact: (inv.phone || inv.email)! });
      t.set(rRef, { ...reg, status });
      if (iS?.exists) t.update(iS.ref, { regStatus: status });
      return { changed: true };
    }
    if (reg.status === "declined" || reg.status === "cancelled") return { changed: false };
    const tickets = [gS, cS].filter((x) => x.exists).map((x) => x.data() as Ticket);
    if (reg.status === "confirmed" && tickets.some((x) => x.status === "active" && x.inAt)) throw new AppError("checked_in", "سُجّل الحضور، فلا يمكن الاعتذار أو الإلغاء");
    if (reg.status === "confirmed") {
      t.update(eS.ref, { reserved: Math.max(0, e.reserved - reg.seats), updatedAt: now });
      [gS, cS].forEach((x) => x.exists && t.update(x.ref, { status: "cancelled" }));
    }
    t.update(rRef, { status, seats: 0, offerUntil: null, updatedAt: now });
    if (iS?.exists) t.update(iS.ref, { regStatus: status });
    return { changed: true };
  });
}

export async function declineInvitation(invToken: string) {
  const inv = await invitationByToken(invToken);
  if (!inv) throw notFound("الدعوة");
  return release(privateRegId(inv.id), "guest", inv);
}

export async function declineByManage(manageToken: string) {
  const r = await regByManageToken(manageToken);
  if (!r) throw notFound("التسجيل");
  return release(r.id, "guest");
}

async function ownReg(ownerId: string, regId: string) {
  const r = await getDoc<Registration>("registrations", regId);
  if (!r || r.ownerId !== ownerId) throw notFound("التسجيل");
  return r;
}

export async function cancelByOrganizer(ownerId: string, regId: string) {
  const r = await ownReg(ownerId, regId);
  const out = await release(regId, "organizer");
  if (out.changed) await audit(ownerId, "registration.cancel", `registrations/${regId}`, { name: r.name });
  return out;
}

/** المنظّم يعيد إرسال التذكرة (بحد أدنى للمدة بين كل إعادة) */
export async function resendTicket(ownerId: string, regId: string) {
  await ownReg(ownerId, regId);
  const s = await getSettings();
  const ids: string[] = [];
  await tx(async (t) => {
    ids.length = 0;
    const reg = (await t.get(ref("registrations", regId))).data() as Registration;
    const [eS, gS, cS, iS] = await Promise.all([t.get(ref("events", reg.eventId)), t.get(ticketRef(regId, "guest")), t.get(ticketRef(regId, "companion")), reg.invitationId ? t.get(ref("invitations", reg.invitationId)) : Promise.resolve(null)]);
    if (reg.status !== "confirmed") throw new AppError("not_confirmed", "لا توجد تذكرة لهذا التسجيل");
    if (reg.resendAt && reg.resendAt + s.policy.resendMinMinutes * MINUTE > Date.now()) throw new AppError("too_soon", `أُعيد الإرسال قبل قليل؛ انتظر ${s.policy.resendMinMinutes} دقائق بين كل إعادة`);
    ids.push(writeResend(t, { e: eS.data() as EventDoc, reg, inv: (iS?.data() as Invitation) ?? null, g: gS.data() as Ticket, c: cS.data() as Ticket | undefined, s }));
  });
  await flush(ids);
}

/* ========================= قائمة الانتظار ========================= */

/**
 * المنظّم يرسل فرصة لشخص في الانتظار: لا تحجز المقعد، ممنوعة بلا مقعد متاح، وتُخصم من رصيد الرسائل.
 */
export async function sendOffer(ownerId: string, regId: string, key: string) {
  await ownReg(ownerId, regId);
  const s = await getSettings();
  const ids: string[] = [];
  const out = await tx(async (t) => {
    ids.length = 0;
    const lKey = `offer:${regId}:${key}`;
    const ur = ref("users", ownerId);
    const [rS, uS, lS] = await Promise.all([t.get(ref("registrations", regId)), t.get(ur), t.get(ledgerRef(lKey))]);
    const reg = rS.data() as Registration;
    const [eS, iS] = await Promise.all([t.get(ref("events", reg.eventId)), reg.invitationId ? t.get(ref("invitations", reg.invitationId)) : Promise.resolve(null)]);
    if (lS.exists) return { again: true, until: reg.offerUntil };
    const e = eS.data() as EventDoc;
    if (reg.status !== "waitlisted") throw new AppError("not_waiting", "هذا الشخص ليس في قائمة الانتظار");
    const closed = closedReason(e);
    if (closed) throw new AppError("closed", closed);
    if (available(e) < 1) throw new AppError("no_seat", "لا يوجد مقعد متاح الآن؛ انتظر اعتذار ضيف أو اشترِ أماكن إضافية");
    const ch = channelOf(reg);
    if (!channelReady(ch)) throw new AppError("channel_off", "لا يمكن إرسال الفرصة: وسيلة تواصل هذا الشخص (واتساب) غير مفعّلة بعد");
    const price = s.prices.message[ch];
    const bal = (uS.data() as User).credit;
    if (bal < price) throw new AppError("low_credit", "رصيد الرسائل لا يكفي لإرسال الفرصة؛ اشحن الرصيد أولًا");
    const now = Date.now();
    const until = now + s.policy.offerHours * HOUR;
    const inv = (iS?.data() as Invitation) ?? null;
    const n = reg.seq.offer + 1;
    const id = `offer_${reg.id}_${n}`;
    t.update(rS.ref, { status: "offered", offerUntil: until, updatedAt: now, seq: { ...reg.seq, offer: n } });
    if (iS?.exists) t.update(iS.ref, { regStatus: "offered" });
    post(t, ur, bal, lKey, { userId: ownerId, amount: -price, reason: "offer", note: `فرصة انتظار — ${e.title}`, refId: id });
    const msg = render("waitlist_offer", { ...eventVars(eventView(e, reg.name)), guest_name: reg.name, offer_until: fmtDateTime(until), manage_link: manageLink(reg, inv) }, ch);
    queueIn(t, id, { ...msg, kind: "waitlist_offer", channel: ch, to: reg.contact, chargedTo: "credit", cost: price, ownerId, eventId: e.id, invitationId: inv?.id ?? null, registrationId: reg.id });
    ids.push(id);
    return { again: false, until };
  });
  await flush(ids);
  return out;
}

/** الفرص المنتهية تعود للانتظار تلقائيًا */
export async function expireOffers() {
  const now = Date.now();
  let n = 0;
  for (const r of await where<Registration>("registrations", "status", "offered")) {
    if ((r.offerUntil ?? 0) >= now) continue;
    const changed = await tx(async (t) => {
      const cur = (await t.get(ref("registrations", r.id))).data() as Registration;
      if (cur.status !== "offered" || (cur.offerUntil ?? 0) >= Date.now()) return false;
      t.update(ref("registrations", r.id), { status: "waitlisted", offerUntil: null, updatedAt: Date.now() });
      if (cur.invitationId) t.update(ref("invitations", cur.invitationId), { regStatus: "waitlisted" });
      return true;
    });
    if (changed) n++;
  }
  return n;
}

export async function waitlistOf(ownerId: string, eventId: string) {
  await ownEvent(ownerId, eventId);
  return (await where<Registration>("registrations", "eventId", eventId))
    .filter((r) => r.status === "waitlisted" || r.status === "offered")
    .sort((a, b) => (a.waitlistedAt ?? a.createdAt) - (b.waitlistedAt ?? b.createdAt));
}

export async function ticketsOfReg(regId: string) {
  const [g, c] = await Promise.all([ticketRef(regId, "guest").get(), ticketRef(regId, "companion").get()]);
  return [g, c].filter((x) => x.exists).map((x) => x.data() as Ticket);
}
