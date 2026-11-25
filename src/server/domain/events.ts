import { z } from "zod";
import { ref, newRef, tx, getDoc, where, db } from "../db";
import { token } from "../crypto";
import { AppError, notFound } from "../errors";
import { riyadhLocalToMs } from "@/shared/time";
import type { EventDoc, Invitation, Registration, Template } from "../types";
import { audit } from "./settings";

export const eventSchema = z
  .object({
    title: z.string().trim().min(3, { error: "اسم الفعالية مطلوب (3 أحرف على الأقل)" }).max(120),
    orgName: z.string().trim().min(2, { error: "اسم الجهة المنظّمة مطلوب" }).max(120),
    description: z.string().trim().max(2000).default(""),
    start: z.string().min(1, { error: "موعد البداية مطلوب" }),
    end: z.string().min(1, { error: "موعد النهاية مطلوب" }),
    venue: z.string().trim().min(2, { error: "اسم المكان مطلوب" }).max(160),
    address: z.string().trim().max(300).default(""),
    mapUrl: z.string().trim().max(500).refine((v) => !v || /^https?:\/\//i.test(v), { error: "رابط الخريطة يبدأ بـ https://" }).default(""),
    maxAttendees: z.coerce.number({ error: "الحد الأقصى للحضور مطلوب" }).int({ error: "عدد صحيح" }).min(1, { error: "الحد الأدنى 1" }).max(20000, { error: "الحد الأعلى 20000" }),
    type: z.enum(["private", "public"], { error: "اختر نوع الدعوة" }),
    fullPolicy: z.enum(["close", "waitlist"], { error: "اختر سياسة اكتمال العدد" }),
  })
  .transform((v, ctx) => {
    const startAt = riyadhLocalToMs(v.start);
    const endAt = riyadhLocalToMs(v.end);
    if (!startAt) ctx.addIssue({ code: "custom", path: ["start"], message: "موعد البداية غير صالح" });
    if (!endAt) ctx.addIssue({ code: "custom", path: ["end"], message: "موعد النهاية غير صالح" });
    if (startAt && endAt && endAt <= startAt) ctx.addIssue({ code: "custom", path: ["end"], message: "النهاية يجب أن تكون بعد البداية" });
    return { ...v, startAt: startAt ?? 0, endAt: endAt ?? 0 };
  });
export type EventInput = z.input<typeof eventSchema>;

function parse(raw: EventInput) {
  const r = eventSchema.safeParse(raw);
  if (!r.success) throw new AppError("validation", r.error.issues[0]?.message ?? "بيانات غير صالحة");
  const { start: _s, end: _e, ...v } = r.data;
  return v;
}

/** السعة الفعلية = الأقل بين الحد الأقصى والأماكن المدفوعة */
export const capacity = (e: Pick<EventDoc, "maxAttendees" | "paidPlaces">) => Math.max(0, Math.min(e.maxAttendees, e.paidPlaces));
export const available = (e: Pick<EventDoc, "maxAttendees" | "paidPlaces" | "reserved">) => Math.max(0, capacity(e) - e.reserved);
export const isPast = (e: Pick<EventDoc, "endAt">) => e.endAt < Date.now();
/** أماكن الباقة للدعوات الخاصة: مكان لكل دعوة + مكان لكل دعوة تسمح بمرافق */
export const neededPlaces = (invs: Pick<Invitation, "companion">[]) => invs.reduce((n, i) => n + (i.companion ? 2 : 1), 0);

export async function createEvent(ownerId: string, raw: EventInput) {
  const v = parse(raw);
  const r = newRef("events");
  const now = Date.now();
  const e: EventDoc = { ...v, id: r.id, ownerId, status: "draft", templateId: null, slug: token(12), paidPlaces: 0, reserved: 0, inGuests: 0, inCompanions: 0, createdAt: now, updatedAt: now };
  await r.set(e);
  return e;
}

export async function updateEvent(ownerId: string, id: string, raw: EventInput) {
  const v = parse(raw);
  return tx(async (t) => {
    const e = (await t.get(ref("events", id))).data() as EventDoc | undefined;
    if (!e || e.ownerId !== ownerId) throw notFound("الفعالية");
    if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
    if (e.paidPlaces > 0 && v.type !== e.type) throw new AppError("locked", "لا يتغير نوع الدعوة بعد الدفع");
    if (v.maxAttendees < e.reserved) throw new AppError("below", `الحد الأقصى لا يقل عن المقاعد المحجوزة (${e.reserved})`);
    if (e.type === "public" && e.paidPlaces > 0 && v.maxAttendees > e.paidPlaces) throw new AppError("over", `الحد الأقصى يتجاوز الأماكن المدفوعة (${e.paidPlaces}). اشترِ أماكن إضافية.`);
    const patch = { ...v, updatedAt: Date.now() };
    t.update(ref("events", id), patch);
    return { ...e, ...patch };
  });
}

export const getEvent = (id: string) => getDoc<EventDoc>("events", id);

/** عزل المنظّمين: فعالية منظّم آخر = غير موجودة */
export async function ownEvent(ownerId: string, id: string) {
  const e = await getEvent(id);
  if (!e || e.ownerId !== ownerId) throw notFound("الفعالية");
  return e;
}

export async function eventBySlug(slug: string) {
  if (!slug || slug.length > 40) return null;
  return (await where<EventDoc>("events", "slug", slug))[0] ?? null;
}

export const eventsOf = async (ownerId: string) => (await where<EventDoc>("events", "ownerId", ownerId)).sort((a, b) => b.createdAt - a.createdAt);
export const invitationsOf = async (eventId: string) => (await where<Invitation>("invitations", "eventId", eventId)).sort((a, b) => a.order - b.order);
export const registrationsOf = async (eventId: string) => (await where<Registration>("registrations", "eventId", eventId)).sort((a, b) => a.createdAt - b.createdAt);
export const allEvents = async () => (await db().collection("events").get()).docs.map((d) => d.data() as EventDoc);

export async function chooseTemplate(ownerId: string, id: string, templateId: string) {
  const e = await ownEvent(ownerId, id);
  if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  const t = await getDoc<Template>("templates", templateId);
  if (!t || (t.ownerId ? t.ownerId !== ownerId : !t.visible)) throw notFound("القالب");
  await ref("events", id).update({ templateId, updatedAt: Date.now() });
}

export async function cancelEvent(ownerId: string, id: string) {
  const e = await ownEvent(ownerId, id);
  if (e.status === "cancelled") return;
  await ref("events", id).update({ status: "cancelled", updatedAt: Date.now() });
  await audit(ownerId, "event.cancel", `events/${id}`, { title: e.title });
}
