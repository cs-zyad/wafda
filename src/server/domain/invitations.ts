import { db, ref, tx, newRef, getDoc, where } from "../db";
import { token } from "../crypto";
import { AppError, notFound } from "../errors";
import { clamp, normalizeEmail, normalizePhone } from "@/shared/text";
import type { ChannelMode, EventDoc, Invitation, Registration } from "../types";
import { ownEvent } from "./events";

export interface InvitationInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  companion?: boolean;
  channel?: ChannelMode | null;
}

export function checkInvitation(i: InvitationInput) {
  const name = clamp(i.name, 120);
  if (!name) throw new AppError("validation", "الاسم مطلوب");
  const rawPhone = String(i.phone ?? "").trim();
  const rawEmail = String(i.email ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (rawPhone && !phone) throw new AppError("validation", "رقم الجوال غير صالح");
  if (rawEmail && !email) throw new AppError("validation", "البريد غير صالح");
  if (!phone && !email) throw new AppError("validation", "أدخل رقم الجوال أو البريد");
  return { name, phone, email, companion: !!i.companion, channel: i.channel ?? null };
}

export function makeInvitation(e: EventDoc, v: ReturnType<typeof checkInvitation>, order: number): Invitation {
  return {
    ...v, id: newRef("invitations").id, eventId: e.id, ownerId: e.ownerId, token: token(20),
    send: { whatsapp: "not_sent", email: "not_sent" }, sendStatus: "not_sent", sentAt: null, regStatus: "none", order, createdAt: Date.now(),
  };
}

export async function addInvitations(ownerId: string, eventId: string, list: InvitationInput[]) {
  const e = await ownEvent(ownerId, eventId);
  if (e.type !== "private") throw new AppError("not_private", "الدعوات بالاسم للفعاليات الخاصة فقط");
  if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  const base = Date.now();
  const invs = list.map((i, n) => makeInvitation(e, checkInvitation(i), base + n));
  for (let i = 0; i < invs.length; i += 400) {
    const b = db().batch();
    invs.slice(i, i + 400).forEach((x) => b.set(ref("invitations", x.id), x));
    await b.commit();
  }
  return invs;
}

async function ownInvitation(ownerId: string, id: string) {
  const inv = await getDoc<Invitation>("invitations", id);
  if (!inv || inv.ownerId !== ownerId) throw notFound("الدعوة");
  return inv;
}

export async function editInvitation(ownerId: string, id: string, input: InvitationInput) {
  await ownInvitation(ownerId, id);
  const v = checkInvitation(input);
  await tx(async (t) => {
    const inv = (await t.get(ref("invitations", id))).data() as Invitation;
    const reg = (await t.get(ref("registrations", `inv_${id}`))).data() as Registration | undefined;
    if (inv.companion && !v.companion && reg?.status === "confirmed" && reg.seats > 1) throw new AppError("companion_confirmed", "المدعو أكّد مع مرافق؛ ألغِ تسجيله أولًا قبل إلغاء المرافق");
    t.update(ref("invitations", id), v);
  });
}

export async function deleteInvitation(ownerId: string, id: string) {
  const inv = await ownInvitation(ownerId, id);
  if (inv.regStatus === "confirmed") throw new AppError("confirmed", "لا تُحذف دعوة مؤكدة؛ ألغِ التسجيل أولًا");
  await ref("invitations", id).delete();
}

export async function invitationByToken(t: string) {
  if (!t || t.length > 40) return null;
  return (await where<Invitation>("invitations", "token", t))[0] ?? null;
}

/** القناة الفعلية لكل مدعو: اختيار القائمة أو تعديله، ثم تعديل تلقائي حسب وسائل التواصل المتاحة */
export function channelsFor(inv: Pick<Invitation, "phone" | "email" | "channel">, listMode: ChannelMode) {
  const mode = inv.channel ?? listMode;
  const out: ("whatsapp" | "email")[] = [];
  if (mode !== "email" && inv.phone) out.push("whatsapp");
  if (mode !== "whatsapp" && inv.email) out.push("email");
  if (!out.length) out.push(inv.phone ? "whatsapp" : "email");
  return out.filter((c) => (c === "whatsapp" ? inv.phone : inv.email));
}
