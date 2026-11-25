import { randomBytes } from "node:crypto";
import { db, ref, where } from "@/server/db";
import { createUser } from "@/server/domain/users";
import { createEvent, chooseTemplate, getEvent } from "@/server/domain/events";
import { seedTemplates } from "@/server/domain/templates";
import { addInvitations, type InvitationInput } from "@/server/domain/invitations";
import { payPackage, payTopup, handleWebhook, type Payment } from "@/server/domain/payments";
import { sign, SIG_HEADER } from "@/server/providers/payments";
import { saveSettings } from "@/server/domain/settings";
import { msToRiyadhLocal, DAY } from "@/shared/time";
import type { EventDoc, FullPolicy, Invitation, Message, Registration, Ticket, User } from "@/server/types";

export async function reset() {
  const res = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`reset ${res.status}`);
  await seedTemplates();
  await saveSettings("test", { policy: { retryBaseSec: 0 } }); // إعادة المحاولة بلا انتظار
}

let n = 0;
export const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}${randomBytes(3).toString("hex")}`;
export const key = () => `k-${uid()}-${randomBytes(8).toString("hex")}`;

export const user = (role: User["role"] = "organizer", name = "منظّم الاختبار") => createUser({ email: `${role}.${uid()}@wafda.test`, name, role, password: "Wafda@2026" });

/** إشعار دفع موقّع إلى نفس مسار المعالجة */
export function webhook(p: Pick<Payment, "id" | "amount" | "currency">, o: { id?: string; type?: string; amount?: number; currency?: string; badSig?: boolean } = {}) {
  const raw = JSON.stringify({ id: o.id ?? `evt_${uid()}`, type: o.type ?? "payment.succeeded", paymentId: p.id, amount: o.amount ?? p.amount, currency: o.currency ?? p.currency });
  return handleWebhook(raw, new Headers({ [SIG_HEADER]: o.badSig ? "a".repeat(64) : sign(raw) }));
}

export async function topup(u: User, riyals: number) {
  const r = await webhook((await payTopup(u.id, riyals * 100)).payment);
  if (r.body.outcome !== "applied") throw new Error("topup");
}

export async function event(owner: User, o: { type?: "private" | "public"; max?: number; policy?: FullPolicy; invites?: InvitationInput[]; pay?: boolean } = {}): Promise<EventDoc> {
  const start = Date.now() + 2 * DAY;
  const e = await createEvent(owner.id, {
    title: "فعالية الاختبار", orgName: "نادي الاختبار", description: "", start: msToRiyadhLocal(start), end: msToRiyadhLocal(start + 3 * 3600_000),
    venue: "القاعة", address: "الرياض", mapUrl: "", maxAttendees: o.max ?? 50, type: o.type ?? "private", fullPolicy: o.policy ?? "close",
  });
  await chooseTemplate(owner.id, e.id, "tpl_plum_frame");
  if (o.invites?.length) await addInvitations(owner.id, e.id, o.invites);
  if (o.pay !== false && (e.type === "public" || o.invites?.length)) {
    const r = await webhook((await payPackage(owner.id, e.id)).payment);
    if (r.body.outcome !== "applied") throw new Error(`pay ${r.body.outcome}`);
  }
  return (await getEvent(e.id))!;
}

/** مدعوون بأرقام صالحة (لا تنتهي بـ 0000/1111) */
export const guests = (count: number, companionEvery = 0): InvitationInput[] =>
  Array.from({ length: count }, (_, i) => ({ name: `ضيف رقم ${i + 1}`, phone: `05${30000001 + i}`, companion: companionEvery > 0 && i % companionEvery === 0 }));

export const invs = async (eventId: string) => (await where<Invitation>("invitations", "eventId", eventId)).sort((a, b) => a.order - b.order);
export const regs = (eventId: string) => where<Registration>("registrations", "eventId", eventId);
export const tickets = (eventId: string) => where<Ticket>("tickets", "eventId", eventId);
export const msgs = async (eventId: string, kind?: string) => (await where<Message>("messages", "eventId", eventId)).filter((m) => !kind || m.kind === kind);
export const reserved = async (eventId: string) => (await getEvent(eventId))!.reserved;
export const setMax = (eventId: string, max: number) => ref("events", eventId).update({ maxAttendees: max });
export const credit = async (u: User) => ((await ref("users", u.id).get()).data() as User).credit;
export { db };
