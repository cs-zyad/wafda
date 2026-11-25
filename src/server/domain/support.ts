import { db, ref, newRef, getDoc, where } from "../db";
import { AppError, notFound } from "../errors";
import { clamp } from "@/shared/text";
import type { User } from "../types";
import { audit } from "./settings";

export type SupportStatus = "open" | "working" | "resolved" | "closed";
export const SUPPORT_AR: Record<SupportStatus, string> = { open: "مفتوحة", working: "قيد المعالجة", resolved: "تم الحل", closed: "مغلقة" };
export const KIND_AR = { support: "استفسار/دعم", complaint: "شكوى", billing: "فوترة ومدفوعات" } as const;

export interface Ticket { id: string; ownerId: string; ownerName: string; kind: keyof typeof KIND_AR; subject: string; body: string; eventId: string | null; status: SupportStatus; createdAt: number; updatedAt: number }
export interface Reply { id: string; ticketId: string; by: string; byName: string; admin: boolean; body: string; at: number }

export async function openTicket(u: User, i: { kind: string; subject: string; body: string; eventId?: string | null }) {
  const subject = clamp(i.subject, 160), body = clamp(i.body, 4000);
  if (subject.length < 3) throw new AppError("validation", "اكتب عنوانًا واضحًا");
  if (body.length < 5) throw new AppError("validation", "اكتب التفاصيل");
  const r = newRef("support");
  const t: Ticket = { id: r.id, ownerId: u.id, ownerName: u.name, kind: i.kind in KIND_AR ? (i.kind as Ticket["kind"]) : "support", subject, body, eventId: i.eventId || null, status: "open", createdAt: Date.now(), updatedAt: Date.now() };
  await r.set(t);
  return t;
}

export async function ticket(u: User, id: string) {
  const t = await getDoc<Ticket>("support", id);
  if (!t || (u.role !== "admin" && t.ownerId !== u.id)) throw notFound("الطلب");
  return t;
}
export const tickets = async (ownerId?: string) => (ownerId ? await where<Ticket>("support", "ownerId", ownerId) : (await db().collection("supportTickets").get()).docs.map((d) => d.data() as Ticket)).sort((a, b) => b.updatedAt - a.updatedAt);
export const replies = async (id: string) => (await where<Reply>("supportReplies", "ticketId", id)).sort((a, b) => a.at - b.at);

export async function reply(u: User, id: string, body: string, status?: SupportStatus) {
  const t = await ticket(u, id);
  const text = clamp(body, 4000);
  if (!text && !status) throw new AppError("validation", "اكتب الرد");
  if (text) {
    const r = newRef("supportReplies");
    await r.set({ id: r.id, ticketId: id, by: u.id, byName: u.name, admin: u.role === "admin", body: text, at: Date.now() } satisfies Reply);
  }
  const patch: Partial<Ticket> = { updatedAt: Date.now() };
  if (u.role === "admin" && status && status !== t.status) {
    patch.status = status;
    await audit(u.id, "support.status", `supportTickets/${id}`, { from: t.status, to: status });
  } else if (u.role !== "admin" && text && (t.status === "resolved" || t.status === "closed")) patch.status = "open";
  await ref("support", id).update(patch);
}
