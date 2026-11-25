import { db, ref, newRef, tx, getDoc, where } from "../db";
import { AppError, notFound } from "../errors";
import { clamp } from "@/shared/text";
import { DAY } from "@/shared/time";
import type { User } from "../types";
import { audit } from "./settings";
import { payDesignQuote } from "./payments";
import { saveTemplate, type TemplateInput } from "./templates";
import { ownEvent } from "./events";

export type DesignStatus = "review" | "quoted" | "accepted" | "paid" | "working" | "delivered" | "rejected" | "cancelled";
export const DESIGN_AR: Record<DesignStatus, string> = { review: "بانتظار المراجعة", quoted: "وصل عرض السعر", accepted: "مقبول بانتظار الدفع", paid: "مدفوع", working: "قيد التنفيذ", delivered: "تم التسليم", rejected: "مرفوض", cancelled: "ملغى" };

export interface Design {
  id: string;
  ownerId: string;
  eventId: string | null;
  title: string;
  details: string;
  refUrl: string;
  status: DesignStatus;
  quote: { amount: number; notes: string; days: number; until: number } | null;
  templateId: string | null;
  rejectReason: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface DesignMsg { id: string; designId: string; by: string; byName: string; admin: boolean; body: string; at: number }

export const getDesign = (id: string) => getDoc<Design>("designs", id);
async function own(ownerId: string, id: string) {
  const d = await getDesign(id);
  if (!d || d.ownerId !== ownerId) throw notFound("الطلب");
  return d;
}

export async function requestDesign(ownerId: string, i: { title: string; details: string; refUrl?: string; eventId?: string | null }) {
  const title = clamp(i.title, 120), details = clamp(i.details, 3000), refUrl = clamp(i.refUrl, 500);
  if (title.length < 3) throw new AppError("validation", "عنوان الطلب مطلوب");
  if (details.length < 10) throw new AppError("validation", "اكتب تفاصيل كافية (10 أحرف على الأقل)");
  if (refUrl && !/^https?:\/\//i.test(refUrl)) throw new AppError("validation", "الرابط المرجعي يبدأ بـ https://");
  if (i.eventId) await ownEvent(ownerId, i.eventId);
  const r = newRef("designs");
  const d: Design = { id: r.id, ownerId, eventId: i.eventId || null, title, details, refUrl, status: "review", quote: null, templateId: null, rejectReason: null, createdAt: Date.now(), updatedAt: Date.now() };
  await r.set(d);
  return d;
}

export const designsOf = async (ownerId?: string) => (ownerId ? await where<Design>("designs", "ownerId", ownerId) : (await db().collection("designRequests").get()).docs.map((x) => x.data() as Design)).sort((a, b) => b.updatedAt - a.updatedAt);
export const designMessages = async (id: string) => (await where<DesignMsg>("designMsgs", "designId", id)).sort((a, b) => a.at - b.at);

export async function designMessage(u: User, id: string, body: string) {
  const d = await getDesign(id);
  if (!d || (u.role !== "admin" && d.ownerId !== u.id)) throw notFound("الطلب");
  const text = clamp(body, 3000);
  if (!text) throw new AppError("validation", "اكتب الرسالة");
  const r = newRef("designMsgs");
  await r.set({ id: r.id, designId: id, by: u.id, byName: u.name, admin: u.role === "admin", body: text, at: Date.now() } satisfies DesignMsg);
  await ref("designs", id).update({ updatedAt: Date.now() });
}

async function move(id: string, from: DesignStatus[], patch: Partial<Design>, guard?: (d: Design) => void) {
  return tx(async (t) => {
    const d = (await t.get(ref("designs", id))).data() as Design | undefined;
    if (!d) throw notFound("الطلب");
    if (!from.includes(d.status)) throw new AppError("state", `غير متاح والطلب «${DESIGN_AR[d.status]}»`);
    guard?.(d);
    t.update(ref("designs", id), { ...patch, updatedAt: Date.now() });
  });
}

export async function quoteDesign(adminId: string, id: string, q: { amount: number; notes: string; days: number }) {
  if (!Number.isInteger(q.amount) || q.amount < 100) throw new AppError("validation", "المبلغ غير صالح");
  if (!Number.isInteger(q.days) || q.days < 1 || q.days > 60) throw new AppError("validation", "صلاحية العرض بين 1 و60 يومًا");
  await move(id, ["review", "quoted"], { status: "quoted", quote: { amount: q.amount, notes: clamp(q.notes, 1000), days: q.days, until: Date.now() + q.days * DAY } });
  await audit(adminId, "design.quote", `designRequests/${id}`, q);
}
export async function rejectDesign(adminId: string, id: string, reason: string) {
  await move(id, ["review", "quoted", "accepted"], { status: "rejected", rejectReason: clamp(reason, 500) || "—" });
  await audit(adminId, "design.reject", `designRequests/${id}`, { reason });
}
export async function acceptQuote(ownerId: string, id: string) {
  await own(ownerId, id);
  await move(id, ["quoted"], { status: "accepted" }, (d) => {
    if (!d.quote || d.quote.until < Date.now()) throw new AppError("expired", "انتهت صلاحية العرض؛ اطلب عرضًا جديدًا عبر المراسلات");
  });
}
export async function payForDesign(ownerId: string, id: string) {
  const d = await own(ownerId, id);
  if (d.status !== "accepted" || !d.quote) throw new AppError("state", "اقبل عرض السعر أولًا");
  return payDesignQuote(ownerId, id, d.quote.amount, d.title);
}
export async function cancelDesign(ownerId: string, id: string) {
  await own(ownerId, id);
  await move(id, ["review", "quoted", "accepted"], { status: "cancelled" });
}
export async function startDesign(adminId: string, id: string) {
  await move(id, ["paid"], { status: "working" });
  await audit(adminId, "design.start", `designRequests/${id}`);
}
/** التسليم كقالب خاص بهذا المنظّم يظهر له عند اختيار القالب */
export async function deliverDesign(adminId: string, id: string, tpl: Omit<TemplateInput, "visible" | "order">) {
  const d = await getDesign(id);
  if (!d) throw notFound("الطلب");
  if (d.status !== "working" && d.status !== "paid") throw new AppError("state", "التسليم بعد الدفع فقط");
  const tid = await saveTemplate(adminId, null, { ...tpl, visible: true, order: 0 }, d.ownerId);
  await move(id, ["working", "paid"], { status: "delivered", templateId: tid });
  await audit(adminId, "design.deliver", `designRequests/${id}`, { templateId: tid });
  return tid;
}
