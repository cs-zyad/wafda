/**
 * البيانات التجريبية عبر خدمات المنتج نفسها: الدفع بإشعار موقّع، الإرسال من الرصيد، التأكيد، التحضير.
 * لا تتكرر إن شُغّلت مرتين (علامة meta/seed). كلمة المرور لكل الحسابات: Wafda@2026
 */
import { db, ref, firebaseStatus } from "../src/server/db";
import { createUser, userByEmail, issueSetupLink, redeemSetupLink } from "../src/server/domain/users";
import { seedTemplates } from "../src/server/domain/templates";
import { createEvent, chooseTemplate, invitationsOf } from "../src/server/domain/events";
import { addInvitations } from "../src/server/domain/invitations";
import { payPackage, payTopup, handleWebhook, type Payment } from "../src/server/domain/payments";
import { sign, SIG_HEADER } from "../src/server/providers/payments";
import { send } from "../src/server/domain/sending";
import { confirmInvitation, declineInvitation, registerPublic } from "../src/server/domain/rsvp";
import { addStaff } from "../src/server/domain/staff";
import { scan } from "../src/server/domain/checkin";
import { requestDesign, quoteDesign } from "../src/server/domain/designs";
import { openTicket } from "../src/server/domain/support";
import { appUrl, link } from "../src/server/domain/view";
import { token } from "../src/server/crypto";
import { DAY } from "../src/shared/time";
import type { Role } from "../src/server/types";

const PW = "Wafda@2026";

async function pay(p: Pick<Payment, "id" | "amount" | "currency">) {
  const raw = JSON.stringify({ id: `evt_seed_${token(10)}`, type: "payment.succeeded", paymentId: p.id, amount: p.amount, currency: p.currency });
  const r = await handleWebhook(raw, new Headers({ [SIG_HEADER]: sign(raw) }));
  if (r.body.outcome !== "applied") throw new Error(`دفع تجريبي: ${r.body.outcome}`);
}
const account = async (email: string, name: string, role: Role) => (await userByEmail(email)) ?? (await createUser({ email, name, role, password: PW }));
const activate = async (email: string) => {
  const u = (await userByEmail(email))!;
  if (u.status !== "active") await redeemSetupLink(await issueSetupLink(u.id, 7), PW);
  return (await userByEmail(email))!;
};
/** موعد بعد n يوم الساعة hh بتوقيت الرياض */
const at = (days: number, hh: number) => `${new Date(Date.now() + days * DAY + 3 * 3600_000).toISOString().slice(0, 10)}T${String(hh).padStart(2, "0")}:00`;

function print(l: Record<string, string>) {
  console.log(`
═══════════════ روابط التجربة ═══════════════
كلمة المرور لكل الحسابات: ${PW}
  منظّم .............. organizer@wafda.test
  فريق استقبال ....... staff@wafda.test  (الفعاليتان 1 و2)
  أدمن ............... admin@wafda.test
  منظّم آخر .......... other@wafda.test
  استقبال فعالية أخرى  staff2@wafda.test

الدخول ................ ${l.app}/login
صندوق الرسائل ......... ${l.app}/dev/inbox
تحضير الفعالية 1 ...... ${l.app}/checkin/${l.e1}
دعوة لم ترد (فردية) ... ${l.single}
دعوة لم ترد (بمرافق) .. ${l.pair}
تذكرة ضيف حضر ........ ${l.guestTicket}
تذكرة مرافق لم يحضر .. ${l.companionTicket}
رابط عام بانتظار ...... ${l.publicWait}
رابط عام مكتمل ........ ${l.publicFull}
تذكرة فعالية أخرى ..... ${l.otherTicket}
════════════════════════════════════════════`);
}

async function main() {
  const st = firebaseStatus();
  if (!st.ok) throw new Error(st.message);
  const mark = await ref("meta", "seed").get();
  if (mark.exists) {
    console.log("✓ البيانات التجريبية موجودة مسبقًا؛ لم يُكرر شيء.");
    return print(mark.data()!.links);
  }
  if (process.argv.includes("--if-empty") && !(await db().collection("users").limit(1).get()).empty) return console.log("ℹ القاعدة فيها بيانات بلا علامة تجريبية؛ تخطّي.");
  try {
    await ref("meta", "seed_lock").create({ at: Date.now() });
  } catch {
    return console.log("ℹ تعبئة أخرى تعمل أو توقفت؛ احذف meta/seed_lock إن لزم.");
  }
  console.log("… إنشاء البيانات التجريبية");
  await seedTemplates();
  const org = await account("organizer@wafda.test", "نادي التقنية", "organizer");
  const admin = await account("admin@wafda.test", "أدمن وفدة", "admin");
  const other = await account("other@wafda.test", "شركة أخرى", "organizer");
  await pay((await payTopup(org.id, 10000)).payment); // رصيد 100 ر.س
  await pay((await payTopup(other.id, 2000)).payment);
  const place = { orgName: "نادي التقنية — جامعة الملك سعود", venue: "قاعة الملتقى", address: "حي الملقا، الرياض", mapUrl: "https://maps.google.com/?q=24.8,46.6" };

  // 1) دعوات خاصة مدفوعة بسياسة انتظار
  const e1 = await createEvent(org.id, { ...place, title: "ملتقى النادي السنوي", description: "لقاء سنوي لأعضاء النادي وشركائه: عروض مشاريع، وتكريم، وعشاء.", start: at(2, 18), end: at(2, 22), maxAttendees: 60, type: "private", fullPolicy: "waitlist" });
  await chooseTemplate(org.id, e1.id, "tpl_plum_frame");
  await addInvitations(org.id, e1.id, [
    { name: "سارة العتيبي", phone: "0551000101" },
    { name: "خالد الدوسري", phone: "0551000102", companion: true },
    { name: "نورة الشهري", phone: "0551000103" },
    { name: "محمد القحطاني", phone: "0551000104", email: "mohammed@example.com", companion: true },
    { name: "ريم الزهراني", phone: "0551000105" },
    { name: "فهد الحربي", phone: "0551230000" }, // ينتهي بـ 0000 = فشل إرسال
    { name: "هند السبيعي", email: "hind@example.com" },
  ]);
  await pay((await payPackage(org.id, e1.id)).payment);
  await send({ ownerId: org.id, eventId: e1.id, kind: "invitation", mode: "both", key: `seed-${token(8)}` });
  await addInvitations(org.id, e1.id, [{ name: "عبدالله المطيري", phone: "0551000108" }, { name: "لمى العنزي", phone: "0551000109", email: "lama@example.com" }]); // لم تُرسل
  const l1 = await invitationsOf(e1.id);
  const inv = (n: string) => l1.find((i) => i.name === n)!;
  await confirmInvitation(inv("نورة الشهري").token, { name: "نورة الشهري", contactType: "phone", contact: "0551000103" });
  const mo = await confirmInvitation(inv("محمد القحطاني").token, { name: "محمد القحطاني", contactType: "email", contact: "mohammed@example.com", withCompanion: true });
  await declineInvitation(inv("ريم الزهراني").token);
  await addStaff(org.id, e1.id, { name: "عضو الاستقبال", email: "staff@wafda.test" });
  const staff = await activate("staff@wafda.test");
  if (mo.status === "confirmed") await scan(staff, e1.id, mo.tickets[0].token);

  // 2) رابط عام مدفوع بقائمة انتظار
  const e2 = await createEvent(org.id, { ...place, title: "ورشة تصميم واجهات المستخدم", description: "ورشة عملية لثلاث ساعات. أحضر حاسبك.", start: at(5, 16), end: at(5, 19), maxAttendees: 40, type: "public", fullPolicy: "waitlist" });
  await chooseTemplate(org.id, e2.id, "tpl_workshop");
  await pay((await payPackage(org.id, e2.id)).payment);
  await addStaff(org.id, e2.id, { name: "عضو الاستقبال", email: "staff@wafda.test" });
  const r2 = [];
  for (const [n, t, c] of [["أحمد السالم", "phone", "0552000201"], ["جود الغامدي", "email", "jood@example.com"], ["تركي العمري", "phone", "0552000203"], ["دانة الرشيد", "email", "dana@example.com"]]) r2.push(await registerPublic(e2.slug, `seed-${token(12)}`, { name: n, contactType: t, contact: c }));
  if (r2[0].status === "confirmed") await scan(org, e2.id, r2[0].tickets[0].token);

  // 3) رابط عام مكتمل بسياسة إغلاق
  const e3 = await createEvent(org.id, { ...place, title: "جلسة حوارية: مستقبل الذكاء الاصطناعي", description: "مقاعد محدودة.", start: at(7, 19), end: at(7, 21), maxAttendees: 3, type: "public", fullPolicy: "close" });
  await chooseTemplate(org.id, e3.id, "tpl_corporate");
  await pay((await payPackage(org.id, e3.id)).payment);
  for (const [n, t, c] of [["سلمان الفيفي", "phone", "0553000301"], ["مها الجهني", "phone", "0553000302"], ["بندر الشمري", "email", "bandar@example.com"]]) await registerPublic(e3.slug, `seed-${token(12)}`, { name: n, contactType: t, contact: c });

  // 4) مسودة
  const e4 = await createEvent(org.id, { ...place, title: "حفل تخرج الدفعة", description: "", start: at(20, 17), end: at(20, 21), maxAttendees: 120, type: "private", fullPolicy: "close" });

  // 5) فعالية لمنظّم آخر + استقبالها
  const e5 = await createEvent(other.id, { orgName: "شركة أخرى", title: "اجتماع الشركاء الربعي", description: "اجتماع داخلي.", start: at(3, 10), end: at(3, 13), venue: "مقر الشركة", address: "طريق الملك فهد، الرياض", mapUrl: "", maxAttendees: 20, type: "private", fullPolicy: "close" });
  await chooseTemplate(other.id, e5.id, "tpl_corporate");
  await addInvitations(other.id, e5.id, [{ name: "شريك أول", email: "partner1@example.com" }, { name: "شريك ثاني", phone: "0554000502" }]);
  await pay((await payPackage(other.id, e5.id)).payment);
  const oth = await confirmInvitation((await invitationsOf(e5.id))[0].token, { name: "شريك أول", contactType: "email", contact: "partner1@example.com" });
  await addStaff(other.id, e5.id, { name: "استقبال فعالية أخرى", email: "staff2@wafda.test" });
  await activate("staff2@wafda.test");

  // تصاميم ودعم
  await requestDesign(org.id, { title: "قالب بهوية النادي", details: "نريد قالبًا بألوان النادي (أزرق وذهبي) مع الشعار في الأعلى.", refUrl: "https://example.com/brand", eventId: e1.id });
  const d2 = await requestDesign(org.id, { title: "قالب حفل التخرج", details: "تصميم احتفالي لحفل التخرج مع مساحة لصورة الدفعة.", eventId: e4.id });
  await quoteDesign(admin.id, d2.id, { amount: 25000, notes: "يشمل جولتي تعديل، والتسليم خلال 3 أيام عمل.", days: 7 });
  await openTicket(org, { kind: "complaint", subject: "تأخر وصول رسالة لأحد المدعوين", body: "أحد المدعوين يقول إن الدعوة لم تصله رغم ظهور «أُرسلت».", eventId: e1.id });

  const tk = (r: typeof mo, i: number) => (r.status === "confirmed" && r.tickets[i] ? link.ticket(r.tickets[i].token) : "");
  const links = { app: appUrl(), e1: e1.id, single: link.invitation(inv("سارة العتيبي").token), pair: link.invitation(inv("خالد الدوسري").token), guestTicket: tk(mo, 0), companionTicket: tk(mo, 1), publicWait: link.event(e2.slug), publicFull: link.event(e3.slug), otherTicket: tk(oth, 0) };
  await ref("meta", "seed").set({ at: Date.now(), links });
  await ref("meta", "seed_lock").delete();
  console.log("✓ اكتملت البيانات التجريبية");
  print(links);
}

main().then(
  () => process.exit(0),
  async (e) => {
    console.error("✖ فشلت التعبئة:", e);
    await ref("meta", "seed_lock").delete().catch(() => {});
    process.exit(1);
  },
);
