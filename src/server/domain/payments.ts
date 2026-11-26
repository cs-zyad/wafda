import { db, ref, tx, getDoc, where } from "../db";
import { token } from "../crypto";
import { AppError, notFound } from "../errors";
import { normalizePhone } from "@/shared/text";
import type { EventDoc, User } from "../types";
import { paymentProvider, type PaymentEvent } from "../providers/payments";
import { audit, getSettings, quote } from "./settings";
import { invitationsOf, neededPlaces, ownEvent } from "./events";
import { ledgerRef, post } from "./ledger";

export type Purpose = "package" | "extra_places" | "credit" | "design";
export interface Payment {
  id: string;
  ownerId: string;
  purpose: Purpose;
  eventId: string | null;
  designId: string | null;
  places: number;
  amount: number;
  currency: "SAR";
  description: string;
  status: "pending" | "paid" | "failed";
  createdAt: number;
  paidAt: number | null;
  lastWebhook: string | null;
  /** رقم واتساب للتواصل بخصوص التحويل البنكي (الدفع اليدوي) */
  contactPhone?: string | null;
}
export interface WebhookLog {
  id: string;
  paymentId: string;
  type: string;
  outcome: "applied" | "duplicate" | "already_paid" | "rejected" | "failed";
  reason: string | null;
  amount: number;
  currency: string;
  at: number;
}

/** ملخص الباقة والتكلفة قبل التنفيذ */
export async function packageSummary(ownerId: string, eventId: string) {
  const e = await ownEvent(ownerId, eventId);
  const s = await getSettings();
  const invs = e.type === "private" ? await invitationsOf(eventId) : [];
  const needed = e.type === "private" ? neededPlaces(invs) : e.maxAttendees;
  const missing = Math.max(0, needed - e.paidPlaces);
  const blockers = [!e.templateId && "اختر قالب الدعوة", e.type === "private" && !invs.length && "أضف المدعوين"].filter(Boolean) as string[];
  return { e, s, invitations: invs.length, withCompanion: invs.filter((i) => i.companion).length, needed, missing, quote: e.paidPlaces > 0 ? null : quote(needed, s), extraPrice: missing * s.prices.extraPlace, blockers };
}

async function create(p: Pick<Payment, "ownerId" | "purpose" | "eventId" | "designId" | "places" | "amount" | "description">) {
  const owner = await getDoc<User>("users", p.ownerId);
  const pay: Payment = { ...p, id: `pay_${token(12)}`, currency: "SAR", status: "pending", createdAt: Date.now(), paidAt: null, lastWebhook: null, contactPhone: owner?.phone ?? null };
  await ref("payments", pay.id).set(pay);
  return { payment: pay, url: paymentProvider().checkoutUrl(pay.id) };
}

/** أول دفع: أصغر باقة تغطي العدد. المبلغ يُحسب في الخادم فقط. */
export async function payPackage(ownerId: string, eventId: string) {
  const sum = await packageSummary(ownerId, eventId);
  if (sum.e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  if (sum.e.paidPlaces > 0) throw new AppError("paid", "الباقة مدفوعة؛ اشترِ أماكن إضافية بدلًا من ذلك");
  if (sum.blockers.length) throw new AppError("blocked", `قبل الدفع: ${sum.blockers.join("، ")}`);
  return create({ ownerId, purpose: "package", eventId, designId: null, places: sum.quote!.places, amount: sum.quote!.price, description: `${sum.quote!.label} — ${sum.e.title}` });
}

export async function payExtraPlaces(ownerId: string, eventId: string, places: number) {
  const e = await ownEvent(ownerId, eventId);
  if (e.paidPlaces <= 0) throw new AppError("not_paid", "ادفع الباقة أولًا");
  if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  if (!Number.isInteger(places) || places < 1 || places > 5000) throw new AppError("validation", "عدد الأماكن بين 1 و5000");
  const s = await getSettings();
  return create({ ownerId, purpose: "extra_places", eventId, designId: null, places, amount: places * s.prices.extraPlace, description: `${places} مكان إضافي — ${e.title}` });
}

export async function payTopup(ownerId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 1000 || amount > 1_000_000) throw new AppError("validation", "مبلغ الشحن بين 10 و10,000 ر.س");
  return create({ ownerId, purpose: "credit", eventId: null, designId: null, places: 0, amount, description: "شحن رصيد الرسائل" });
}

export const payDesignQuote = (ownerId: string, designId: string, amount: number, title: string) => create({ ownerId, purpose: "design", eventId: null, designId, places: 0, amount, description: `تصميم خاص — ${title}` });

export const getPayment = (id: string) => getDoc<Payment>("payments", id);

/**
 * تطبيق إشعار الدفع الموثّق — المسار الوحيد لتثبيت الدفع وزيادة السعة وشحن الرصيد.
 * يسجّل كل إشعار بمعرّفه، ويتحقق من المبلغ والعملة، ويطبّق الأثر مرة واحدة داخل معاملة.
 */
export async function applyPayment(ev: PaymentEvent): Promise<WebhookLog["outcome"]> {
  const logRef = ref("webhooks", `${paymentProvider().mode}_${ev.id}`.slice(0, 300));
  const payRef = ref("payments", ev.paymentId);
  const out = await tx(async (t): Promise<WebhookLog["outcome"]> => {
    const [lS, pS] = await Promise.all([t.get(logRef), t.get(payRef)]);
    if (lS.exists) return "duplicate";
    const pay = pS.data() as Payment | undefined;
    const log = (outcome: WebhookLog["outcome"], reason: string | null = null) =>
      t.set(logRef, { id: logRef.id, paymentId: ev.paymentId, type: ev.type, outcome, reason, amount: ev.amount, currency: ev.currency, at: Date.now() } satisfies WebhookLog);
    if (!pay) return log("rejected", "عملية دفع غير معروفة"), "rejected";
    if (ev.amount !== pay.amount || ev.currency !== pay.currency) return log("rejected", `المبلغ/العملة لا تطابق (${ev.amount} ${ev.currency})`), "rejected";
    const eRef = pay.eventId ? ref("events", pay.eventId) : null;
    const uRef = ref("users", pay.ownerId);
    const dRef = pay.designId ? ref("designs", pay.designId) : null;
    const lr = ledgerRef(`topup:${pay.id}`);
    const [eS, uS, dS, topS] = await Promise.all([eRef ? t.get(eRef) : null, t.get(uRef), dRef ? t.get(dRef) : null, t.get(lr)]);
    if (ev.type === "payment.failed") {
      if (pay.status === "pending") t.update(payRef, { status: "failed" });
      return log("failed"), "failed";
    }
    if (pay.status === "paid") return log("already_paid", "مثبت مسبقًا بإشعار آخر"), "already_paid";
    const now = Date.now();
    t.update(payRef, { status: "paid", paidAt: now });
    if ((pay.purpose === "package" || pay.purpose === "extra_places") && eS?.exists) {
      const e = eS.data() as EventDoc;
      t.update(eRef!, {
        paidPlaces: e.paidPlaces + pay.places,
        updatedAt: now,
        ...(pay.purpose === "package" && e.status === "draft" ? { status: "active" } : {}),
        ...(pay.purpose === "extra_places" && e.type === "public" ? { maxAttendees: e.maxAttendees + pay.places } : {}),
      });
    } else if (pay.purpose === "credit" && !topS.exists) {
      post(t, uRef, (uS.data() as User).credit, `topup:${pay.id}`, { userId: pay.ownerId, amount: pay.amount, reason: "topup", note: "شحن رصيد الرسائل", refId: pay.id });
    } else if (pay.purpose === "design" && dS?.exists) {
      t.update(dRef!, { status: "paid", updatedAt: now });
    }
    return log("applied"), "applied";
  });
  if (out === "applied") {
    const p = (await payRef.get()).data() as Payment;
    await audit(p.ownerId, "payment.paid", `payments/${p.id}`, { purpose: p.purpose, amount: p.amount, places: p.places, eventId: p.eventId, webhook: ev.id });
  }
  return out;
}

/** نقطة دخول الـ webhook: التوقيع أولًا */
export async function handleWebhook(raw: string, headers: Headers) {
  const ev = paymentProvider().verify(raw, headers);
  if (!ev) return { status: 401, body: { error: "توقيع غير صالح" } };
  const outcome = await applyPayment(ev);
  return { status: outcome === "rejected" ? 422 : 200, body: { outcome } };
}

export const paymentsOf = async (ownerId?: string) => (ownerId ? await where<Payment>("payments", "ownerId", ownerId) : (await db().collection("payments").get()).docs.map((d) => d.data() as Payment)).sort((a, b) => b.createdAt - a.createdAt);
export const webhookLogs = async () => (await db().collection("webhookEvents").get()).docs.map((d) => d.data() as WebhookLog).sort((a, b) => b.at - a.at);
export async function ownPayment(ownerId: string, id: string) {
  const p = await getPayment(id);
  if (!p || p.ownerId !== ownerId) throw notFound("عملية الدفع");
  return p;
}

/* ===== الدفع اليدوي (تحويل بنكي) — إلى أن تُربط بوابة دفع ===== */

/** الأدمن يؤكد استلام المبلغ: يمر بنفس مسار التثبيت، ومعرّف ثابت لكل عملية فلا يتكرر الأثر مهما ضُغط الزر */
export async function confirmManualPayment(adminId: string, paymentId: string) {
  const p = await getPayment(paymentId);
  if (!p) throw notFound("عملية الدفع");
  if (p.status === "paid") return "already_paid" as const;
  const outcome = await applyPayment({ id: `admin_confirm_${p.id}`, type: "payment.succeeded", paymentId: p.id, amount: p.amount, currency: p.currency });
  await audit(adminId, "payment.manual_confirm", `payments/${p.id}`, { amount: p.amount, outcome });
  return outcome;
}

/** الأدمن يلغي طلبًا لم يُدفع (يبقى ممكنًا تأكيده لاحقًا إن وصل المبلغ) */
export async function rejectManualPayment(adminId: string, paymentId: string) {
  const p = await getPayment(paymentId);
  if (!p) throw notFound("عملية الدفع");
  if (p.status !== "pending") throw new AppError("not_pending", "الطلب ليس بانتظار الدفع");
  await ref("payments", p.id).update({ status: "failed" });
  await audit(adminId, "payment.manual_reject", `payments/${p.id}`, { amount: p.amount });
}

/** المنظّم يحدّث رقم واتساب للتواصل بخصوص الدفع (يُحفظ في حسابه أيضًا) */
export async function setPaymentContact(ownerId: string, paymentId: string, phone: string) {
  const p = await ownPayment(ownerId, paymentId);
  const n = normalizePhone(phone);
  if (!n) throw new AppError("validation", "رقم الجوال غير صالح");
  await ref("payments", p.id).update({ contactPhone: n });
  await ref("users", ownerId).update({ phone: n });
}
