"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, needOrganizer, type Res } from "@/server/session";
import { AppError } from "@/server/errors";
import type { ChannelMode } from "@/server/types";
import { riyadhLocalToMs } from "@/shared/time";
import { sar, toHalalas } from "@/shared/money";
import { createEvent, updateEvent, cancelEvent, chooseTemplate, type EventInput } from "@/server/domain/events";
import { addInvitations, editInvitation, deleteInvitation } from "@/server/domain/invitations";
import { readFile, preview, commit, type Row, type CheckedRow } from "@/server/domain/importer";
import { send, scheduleReminder, cancelReminder } from "@/server/domain/sending";
import { cancelByOrganizer, resendTicket, sendOffer } from "@/server/domain/rsvp";
import { payPackage, payExtraPlaces, payTopup, setPaymentContact } from "@/server/domain/payments";
import { addStaff, removeStaff } from "@/server/domain/staff";
import { requestDesign, acceptQuote, payForDesign, cancelDesign, designMessage } from "@/server/domain/designs";
import { openTicket, reply } from "@/server/domain/support";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const at = (id: string) => `/dashboard/events/${id}`;
const fresh = (id: string) => revalidatePath(at(id), "layout");

const eventInput = (fd: FormData): EventInput => ({
  title: s(fd, "title"), orgName: s(fd, "orgName"), description: s(fd, "description"), start: s(fd, "start"), end: s(fd, "end"),
  venue: s(fd, "venue"), address: s(fd, "address"), mapUrl: s(fd, "mapUrl"), maxAttendees: s(fd, "maxAttendees") as unknown as number,
  type: s(fd, "type") as EventInput["type"], fullPolicy: s(fd, "fullPolicy") as EventInput["fullPolicy"],
});

/* ===== الفعالية والقالب ===== */
export async function createEventAction(_: Res | null, fd: FormData): Promise<Res> {
  let id = "";
  const r = await act(async () => void (id = (await createEvent((await needOrganizer()).id, eventInput(fd))).id));
  if (r.ok) redirect(`${at(id)}/template`);
  return r;
}
export const updateEventAction = async (id: string, _: Res | null, fd: FormData) =>
  act(async () => {
    await updateEvent((await needOrganizer()).id, id, eventInput(fd));
    fresh(id);
    return { ok: true, msg: "حُفظت البيانات" };
  });
export const cancelEventAction = async (id: string) =>
  act(async () => {
    await cancelEvent((await needOrganizer()).id, id);
    fresh(id);
    return { ok: true, msg: "أُلغيت الفعالية" };
  });
export const templateAction = async (id: string, templateId: string) =>
  act(async () => {
    await chooseTemplate((await needOrganizer()).id, id, templateId);
    fresh(id);
    return { ok: true, msg: "تم اختيار القالب" };
  });

/* ===== المدعوون والاستيراد ===== */
export const addGuestAction = async (id: string, _: Res | null, fd: FormData) =>
  act(async () => {
    await addInvitations((await needOrganizer()).id, id, [{ name: s(fd, "name"), phone: s(fd, "phone"), email: s(fd, "email"), companion: fd.get("companion") === "on" }]);
    fresh(id);
    return { ok: true, msg: "أُضيف المدعو" };
  });
export const editGuestAction = async (id: string, invId: string, _: Res | null, fd: FormData) =>
  act(async () => {
    const c = s(fd, "channel");
    await editInvitation((await needOrganizer()).id, invId, { name: s(fd, "name"), phone: s(fd, "phone"), email: s(fd, "email"), companion: fd.get("companion") === "on", channel: ["whatsapp", "email", "both"].includes(c) ? (c as ChannelMode) : null });
    fresh(id);
    return { ok: true, msg: "حُفظ التعديل" };
  });
export const deleteGuestAction = async (id: string, invId: string) =>
  act(async () => {
    await deleteInvitation((await needOrganizer()).id, invId);
    fresh(id);
    return { ok: true, msg: "حُذفت الدعوة" };
  });
export const readImportAction = async (id: string, fd: FormData): Promise<Res<CheckedRow[]>> =>
  act(async () => {
    const u = await needOrganizer();
    const f = fd.get("file");
    if (!(f instanceof File) || !f.size) throw new AppError("validation", "اختر ملفًا");
    if (f.size > 4 << 20) throw new AppError("validation", "حجم الملف أكبر من 4 ميجابايت");
    return { ok: true, data: await preview(u.id, id, await readFile(Buffer.from(await f.arrayBuffer()), f.name)) };
  });
export const recheckImportAction = async (id: string, rows: Row[]): Promise<Res<CheckedRow[]>> => act(async () => ({ ok: true, data: await preview((await needOrganizer()).id, id, rows) }));
export const commitImportAction = async (id: string, rows: Row[]) =>
  act(async () => {
    const r = await commit((await needOrganizer()).id, id, rows);
    fresh(id);
    return { ok: true, msg: `أُضيف ${r.added} مدعوًا${r.skipped ? `، واستُبعد ${r.skipped} صفًا` : ""}` };
  });

/* ===== الإرسال والتذكيرات ===== */
export const sendAction = async (id: string, _: Res | null, fd: FormData) =>
  act(async () => {
    const ids = fd.getAll("ids").map(String).filter(Boolean);
    const r = await send({ ownerId: (await needOrganizer()).id, eventId: id, kind: s(fd, "kind") === "reminder" ? "reminder" : "invitation", mode: (s(fd, "mode") || "both") as ChannelMode, ids: ids.length ? ids : undefined, key: s(fd, "key") });
    fresh(id);
    if (r.status === "low_credit") throw new AppError("low", `رصيد الرسائل غير كافٍ: المطلوب ${sar(r.needed)} والرصيد ${sar(r.balance)}. لم يُرسل ولم يُخصم شيء.`);
    if (r.status === "nothing") return { ok: true, msg: "لا يوجد من يحتاج الإرسال الآن" };
    return { ok: true, msg: `${r.again ? "نُفّذ هذا الإرسال سابقًا — " : ""}أُرسلت ${r.messages} رسالة بتكلفة ${sar(r.cost)}. الرصيد الآن ${sar(r.balance)}.${r.failed ? ` تعذّر ${r.failed} (استُرجعت قيمتها).` : ""}${r.skippedForCredit ? ` تُرك ${r.skippedForCredit} لعدم كفاية الرصيد.` : ""}` };
  });
export const scheduleAction = async (id: string, _: Res | null, fd: FormData) =>
  act(async () => {
    const t = riyadhLocalToMs(s(fd, "runAt"));
    if (!t) throw new AppError("validation", "اختر الموعد");
    await scheduleReminder((await needOrganizer()).id, id, t, (s(fd, "mode") || "both") as ChannelMode);
    fresh(id);
    return { ok: true, msg: "جُدول التذكير؛ يصل فقط لمن لا يزال بحاجة للتأكيد لحظة التنفيذ" };
  });
export const cancelReminderAction = async (id: string, rid: string) =>
  act(async () => {
    await cancelReminder((await needOrganizer()).id, rid);
    fresh(id);
    return { ok: true, msg: "أُلغي التذكير" };
  });

/* ===== التسجيلات والانتظار ===== */
export const cancelRegAction = async (id: string, regId: string) =>
  act(async () => {
    await cancelByOrganizer((await needOrganizer()).id, regId);
    fresh(id);
    return { ok: true, msg: "أُلغي التسجيل وحُرّرت المقاعد" };
  });
export const resendAction = async (id: string, regId: string) =>
  act(async () => {
    await resendTicket((await needOrganizer()).id, regId);
    fresh(id);
    return { ok: true, msg: "أُعيد إرسال التذكرة" };
  });
export const offerAction = async (id: string, regId: string, _: Res | null, fd: FormData) =>
  act(async () => {
    await sendOffer((await needOrganizer()).id, regId, s(fd, "key"));
    fresh(id);
    return { ok: true, msg: "أُرسلت فرصة التأكيد" };
  });

/* ===== الدفع والرصيد ===== */
async function goPay(make: () => Promise<{ url: string }>) {
  let url = "";
  const r = await act(async () => void (url = (await make()).url));
  if (r.ok) redirect(url);
  return r;
}
export const payPackageAction = async (id: string) => goPay(async () => payPackage((await needOrganizer()).id, id));
export const extraPlacesAction = async (id: string, _: Res | null, fd: FormData) => goPay(async () => payExtraPlaces((await needOrganizer()).id, id, Number(s(fd, "places"))));
export const topupAction = async (_: Res | null, fd: FormData) =>
  goPay(async () => {
    const a = toHalalas(s(fd, "amount"));
    if (!a) throw new AppError("validation", "أدخل مبلغًا صحيحًا");
    return payTopup((await needOrganizer()).id, a);
  });

export const payContactAction = async (payId: string, _: Res | null, fd: FormData) =>
  act(async () => {
    await setPaymentContact((await needOrganizer()).id, payId, s(fd, "phone"));
    revalidatePath(`/dashboard/pay/${payId}`);
    return { ok: true, msg: "حُفظ الرقم؛ بنتواصل معك عليه" };
  });

/* ===== فريق الاستقبال ===== */
export const addStaffAction = async (id: string, _: Res | null, fd: FormData) =>
  act(async () => {
    const r = await addStaff((await needOrganizer()).id, id, { name: s(fd, "name"), email: s(fd, "email") });
    fresh(id);
    return { ok: true, msg: r.user.status === "invited" ? "أُرسل للعضو رابط إنشاء كلمة المرور (صالح 7 أيام)" : r.existed ? "العضو مضاف مسبقًا" : "أُضيف العضو وأُبلغ بالبريد" };
  });
export const removeStaffAction = async (id: string, userId: string) =>
  act(async () => {
    await removeStaff((await needOrganizer()).id, id, userId);
    fresh(id);
    return { ok: true, msg: "أُزيل العضو" };
  });

/* ===== التصاميم والدعم ===== */
export async function requestDesignAction(_: Res | null, fd: FormData): Promise<Res> {
  let id = "";
  const r = await act(async () => void (id = (await requestDesign((await needOrganizer()).id, { title: s(fd, "title"), details: s(fd, "details"), refUrl: s(fd, "refUrl"), eventId: s(fd, "eventId") || null })).id));
  if (r.ok) redirect(`/dashboard/designs/${id}`);
  return r;
}
export const acceptQuoteAction = async (id: string) =>
  act(async () => {
    await acceptQuote((await needOrganizer()).id, id);
    revalidatePath(`/dashboard/designs/${id}`);
    return { ok: true, msg: "قُبل العرض؛ أكمل الدفع" };
  });
export const payDesignAction = async (id: string) => goPay(async () => payForDesign((await needOrganizer()).id, id));
export const cancelDesignAction = async (id: string) =>
  act(async () => {
    await cancelDesign((await needOrganizer()).id, id);
    revalidatePath(`/dashboard/designs/${id}`);
    return { ok: true, msg: "أُلغي الطلب" };
  });
export const designMsgAction = async (id: string, _: Res | null, fd: FormData) =>
  act(async () => {
    await designMessage(await needOrganizer(), id, s(fd, "body"));
    revalidatePath(`/dashboard/designs/${id}`);
  });
export async function openTicketAction(_: Res | null, fd: FormData): Promise<Res> {
  let id = "";
  const r = await act(async () => void (id = (await openTicket(await needOrganizer(), { kind: s(fd, "kind"), subject: s(fd, "subject"), body: s(fd, "body"), eventId: s(fd, "eventId") || null })).id));
  if (r.ok) redirect(`/dashboard/support/${id}`);
  return r;
}
export const replyAction = async (id: string, _: Res | null, fd: FormData) =>
  act(async () => {
    await reply(await needOrganizer(), id, s(fd, "body"));
    revalidatePath(`/dashboard/support/${id}`);
  });
