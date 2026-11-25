import { ref, getDoc, where } from "../db";
import { AppError, notFound } from "../errors";
import { clamp, normalizeEmail } from "@/shared/text";
import type { EventDoc, User } from "../types";
import { audit, getSettings } from "./settings";
import { ownEvent, getEvent } from "./events";
import { createUser, getUser, issueSetupLink, userByEmail } from "./users";
import { makeMessage, flush } from "./outbox";
import { eventVars, render } from "./texts";
import { appUrl, eventView, link } from "./view";

export interface StaffMember {
  id: string; // <eventId>_<userId>
  eventId: string;
  userId: string;
  ownerId: string;
  at: number;
}

/**
 * عضو استقبال لفعالية محددة. إن لم يكن له حساب يُنشأ «مدعو» ويصله رابط إنشاء كلمة مرور
 * (صالح 7 أيام افتراضيًا، لمرة واحدة). رسالته على حساب المنصة.
 */
export async function addStaff(ownerId: string, eventId: string, input: { name: string; email: string }) {
  const e = await ownEvent(ownerId, eventId);
  if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  const email = normalizeEmail(input.email);
  if (!email) throw new AppError("validation", "البريد غير صالح");
  const name = clamp(input.name, 120);
  if (name.length < 2) throw new AppError("validation", "الاسم مطلوب");
  const user = (await userByEmail(email)) ?? (await createUser({ email, name, role: "staff" }));
  if (user.id === ownerId) throw new AppError("self", "أنت المنظّم وتستطيع التحضير دائمًا");
  if (user.status === "suspended") throw new AppError("suspended", "هذا الحساب موقوف");
  const id = `${eventId}_${user.id}`;
  const existed = !!(await getDoc("staff", id));
  if (!existed) await ref("staff", id).set({ id, eventId, userId: user.id, ownerId, at: Date.now() } satisfies StaffMember);
  if (!existed || user.status === "invited") {
    const s = await getSettings();
    const access = user.status === "invited"
      ? `أنشئ كلمة المرور من الرابط (صالح ${s.policy.staffInviteDays} أيام ولمرة واحدة):\n${link.setup(await issueSetupLink(user.id, s.policy.staffInviteDays))}`
      : `ادخل إلى صفحة التحضير: ${appUrl()}/checkin`;
    const msg = render("staff_invite", { ...eventVars(eventView(e)), staff_name: user.name, access_line: access }, "email");
    const mid = `staff_${id}_${Date.now()}`;
    await ref("messages", mid).set(makeMessage(mid, { ...msg, kind: "staff_invite", channel: "email", to: user.email, chargedTo: "platform", opCost: s.prices.confirmOpCost.email, ownerId, eventId }));
    await flush([mid]);
  }
  await audit(ownerId, "staff.add", `events/${eventId}`, { userId: user.id, email });
  return { user, existed };
}

export async function removeStaff(ownerId: string, eventId: string, userId: string) {
  await ownEvent(ownerId, eventId);
  const id = `${eventId}_${userId}`;
  if (!(await getDoc("staff", id))) throw notFound("العضو");
  await ref("staff", id).delete();
  await audit(ownerId, "staff.remove", `events/${eventId}`, { userId });
}

export async function staffOf(eventId: string) {
  const list = (await where<StaffMember>("staff", "eventId", eventId)).sort((a, b) => a.at - b.at);
  return Promise.all(list.map(async (m) => ({ ...m, user: await getUser(m.userId) })));
}

/** الفعاليات المتاحة للتحضير: فعالياته كمنظّم + المعيّن عليها */
export async function checkinEvents(userId: string) {
  const own = (await where<EventDoc>("events", "ownerId", userId)).filter((e) => e.status === "active").map((e) => ({ e, role: "owner" as const }));
  const assigned = await where<StaffMember>("staff", "userId", userId);
  const other = (await Promise.all(assigned.map((m) => getEvent(m.eventId)))).filter((e): e is EventDoc => !!e && e.status === "active").map((e) => ({ e, role: "staff" as const }));
  return [...own, ...other].sort((a, b) => a.e.startAt - b.e.startAt);
}
