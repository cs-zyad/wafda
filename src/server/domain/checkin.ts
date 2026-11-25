import { ref, tx, where, getDoc } from "../db";
import { notFound } from "../errors";
import { normalizeArabic, normalizeEmail, phoneSearchVariants } from "@/shared/text";
import type { EventDoc, Registration, Ticket, User } from "../types";

type Actor = Pick<User, "id" | "name" | "status">;

/** المنظّم يحضّر دائمًا في فعالياته؛ عضو الاستقبال في الفعاليات المعيّن عليها فقط */
export async function accessTo(u: Pick<User, "id" | "status">, eventId: string): Promise<EventDoc | null> {
  if (u.status !== "active") return null;
  const e = await getDoc<EventDoc>("events", eventId);
  if (!e) return null;
  if (e.ownerId === u.id) return e;
  return (await getDoc("staff", `${eventId}_${u.id}`)) ? e : null;
}
async function mustAccess(u: Actor, eventId: string) {
  const e = await accessTo(u, eventId);
  if (!e) throw notFound("الفعالية");
  return e;
}

/** رمز التذكرة من نص الرمز أو من رابط التذكرة */
export function readTicketCode(raw: string): string | null {
  const s = String(raw || "").trim();
  const m = /\/t\/([A-Za-z0-9_-]{16,64})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{16,64}$/.test(s) ? s : null;
}

export const holderLabel = (t: Pick<Ticket, "kind" | "guestName">) => (t.kind === "companion" ? `مرافق — ${t.guestName}` : t.guestName);

export type ScanResult =
  | { result: "ok"; label: string; kind: Ticket["kind"]; at: number }
  | { result: "already"; label: string; kind: Ticket["kind"]; at: number; method: Ticket["inMethod"]; by: string | null }
  | { result: "cancelled"; label: string }
  | { result: "wrong_event" }
  | { result: "event_cancelled" }
  | { result: "not_found" };

/** مسار تسجيل الحضور الوحيد (مسح أو يدوي) داخل معاملة: مسحان متزامنان من جهازين = حضور واحد */
async function markIn(ticketId: string, eventId: string, actor: Actor, method: "scan" | "manual"): Promise<ScanResult> {
  return tx(async (t) => {
    const tr = ref("tickets", ticketId);
    const er = ref("events", eventId);
    const [tS, eS] = await Promise.all([t.get(tr), t.get(er)]);
    const tk = tS.data() as Ticket | undefined;
    if (!tk) return { result: "not_found" };
    if (tk.eventId !== eventId) return { result: "wrong_event" }; // بلا أي بيانات
    const e = eS.data() as EventDoc;
    if (e.status === "cancelled") return { result: "event_cancelled" };
    if (tk.status !== "active") return { result: "cancelled", label: holderLabel(tk) };
    if (tk.inAt) return { result: "already", label: holderLabel(tk), kind: tk.kind, at: tk.inAt, method: tk.inMethod, by: tk.inByName };
    const at = Date.now();
    t.update(tr, { inAt: at, inBy: actor.id, inByName: actor.name, inMethod: method });
    t.update(er, tk.kind === "guest" ? { inGuests: e.inGuests + 1 } : { inCompanions: e.inCompanions + 1 });
    return { result: "ok", label: holderLabel(tk), kind: tk.kind, at };
  });
}

export async function scan(actor: Actor, eventId: string, raw: string, method: "scan" | "manual" = "scan"): Promise<ScanResult> {
  await mustAccess(actor, eventId);
  const code = readTicketCode(raw);
  if (!code) return { result: "not_found" };
  const t = (await where<Ticket>("tickets", "token", code))[0];
  return t ? markIn(t.id, eventId, actor, method) : { result: "not_found" };
}

export async function manualIn(actor: Actor, eventId: string, ticketId: string) {
  await mustAccess(actor, eventId);
  if (!/^[A-Za-z0-9_-]+_(guest|companion)$/.test(ticketId)) return { result: "not_found" } as ScanResult;
  return markIn(ticketId, eventId, actor, "manual");
}

export interface Hit {
  regId: string;
  name: string;
  hint: string;
  tickets: { id: string; label: string; status: Ticket["status"]; inAt: number | null; inMethod: Ticket["inMethod"] }[];
}

/** «تعذّر عرض الرمز»: بالاسم أو أي جزء من الجوال بأي صيغة أو البريد — داخل الفعالية فقط */
export async function findAttendee(actor: Actor, eventId: string, q: string): Promise<Hit[]> {
  await mustAccess(actor, eventId);
  const query = q.trim();
  if (query.length < 2) return [];
  const nq = normalizeArabic(query);
  const pv = phoneSearchVariants(query);
  const eq = normalizeEmail(query) ?? (query.includes("@") ? query.toLowerCase() : null);
  const regs = (await where<Registration>("registrations", "eventId", eventId)).filter(
    (r) =>
      r.status === "confirmed" &&
      (normalizeArabic(r.name).includes(nq) || (r.contactType === "phone" && pv.some((v) => r.contact.replace(/\D/g, "").includes(v))) || (r.contactType === "email" && !!eq && r.contact.includes(eq))),
  );
  const tickets = await where<Ticket>("tickets", "eventId", eventId);
  return regs.slice(0, 20).map((r) => ({
    regId: r.id,
    name: r.name,
    hint: r.contactType === "email" ? r.contact.replace(/^(.{2}).*(@.*)$/, "$1***$2") : `…${r.contact.slice(-4)}`,
    tickets: tickets
      .filter((t) => t.registrationId === r.id)
      .sort((a) => (a.kind === "guest" ? -1 : 1))
      .map((t) => ({ id: t.id, label: holderLabel(t), status: t.status, inAt: t.inAt, inMethod: t.inMethod })),
  }));
}

export async function lastArrivals(eventId: string, n = 8) {
  return (await where<Ticket>("tickets", "eventId", eventId))
    .filter((t) => t.inAt)
    .sort((a, b) => b.inAt! - a.inAt!)
    .slice(0, n)
    .map((t) => ({ label: holderLabel(t), at: t.inAt!, method: t.inMethod, by: t.inByName }));
}

export async function ticketByToken(code: string) {
  if (!code || code.length > 64) return null;
  return (await where<Ticket>("tickets", "token", code))[0] ?? null;
}
