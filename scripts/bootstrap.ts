/**
 * تهيئة الإنتاج (DEMO_MODE=false) قبل كل بناء — آمنة للتكرار:
 * 1) إن كانت القاعدة تحوي البيانات التجريبية فقط (علامة meta/seed وكل الحسابات @wafda.test) تُحذف مرة واحدة.
 *    إن وُجد أي حساب حقيقي لا يُحذف شيء تلقائيًا.
 * 2) القوالب الخمسة موجودة دائمًا.
 * 3) حساب الأدمن من ADMIN_EMAIL: يُنشأ بلا كلمة مرور ويُرسل له رابط إنشاء كلمة المرور بالبريد (مرة كل 6 أيام كحد أقصى حتى يُفعّل).
 */
import { db, ref, firebaseStatus } from "../src/server/db";
import { seedTemplates } from "../src/server/domain/templates";
import { createUser, userByEmail, issueSetupLink } from "../src/server/domain/users";
import { link } from "../src/server/domain/view";
import { makeMessage } from "../src/server/domain/outbox";
import { messageProvider, channelReady } from "../src/server/providers/messaging";
import { normalizeEmail } from "../src/shared/text";
import { DAY } from "../src/shared/time";

const DEMO_DOMAIN = "@wafda.test";

async function wipeDemo() {
  if (!(await ref("meta", "seed").get()).exists) return;
  const emails = (await db().collection("users").get()).docs.map((d) => String(d.data().email ?? ""));
  const real = emails.filter((e) => !e.endsWith(DEMO_DOMAIN));
  if (real.length) {
    console.warn(`⚠ القاعدة فيها بيانات تجريبية مع ${real.length} حساب حقيقي؛ لم يُحذف شيء تلقائيًا.`);
    return;
  }
  for (const c of await db().listCollections()) if (c.id !== "templates") await db().recursiveDelete(c);
  console.log("✓ حُذفت البيانات التجريبية (الحسابات والفعاليات والرسائل والمدفوعات التجريبية)");
}

async function admin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || "");
  if (!email) return console.warn("ℹ ADMIN_EMAIL غير مضبوط؛ لا يوجد حساب أدمن بعد.");
  const u = (await userByEmail(email)) ?? (await createUser({ email, name: "مدير المنصة", role: "admin" }));
  if (u.role !== "admin") return console.warn("⚠ بريد ADMIN_EMAIL مسجّل كحساب غير أدمن؛ لم يُغيَّر شيء.");
  if (u.status !== "invited") return console.log("✓ حساب الأدمن مفعّل");
  const mark = ref("meta", "admin_invite");
  const last = (await mark.get()).data() as { at: number; email: string } | undefined;
  if (last && last.email === email && Date.now() - last.at < 6 * DAY) return console.log("✓ رابط إنشاء كلمة مرور الأدمن أُرسل مؤخرًا؛ تحقق من بريدك");
  if (!channelReady("email")) return console.warn("⚠ البريد غير مضبوط (SMTP)؛ لا يمكن إرسال رابط الأدمن بعد.");
  const t = await issueSetupLink(u.id, 7);
  const body = `مرحبًا،\n\nأُنشئ حساب الأدمن في منصة وفدة. أنشئ كلمة المرور من الرابط (صالح 7 أيام، لمرة واحدة):\n${link.setup(t)}\n\nإن لم تطلب ذلك فتجاهل الرسالة.`;
  const m = makeMessage(`admin_invite_${Date.now()}`, { kind: "staff_invite", channel: "email", to: email, template: "wafda_admin_invite_v1", vars: {}, subject: "حساب الأدمن في وفدة", body, chargedTo: "platform" });
  const r = await messageProvider("email").send(m);
  if (!r.ok) return console.warn(`⚠ تعذّر إرسال رابط الأدمن: ${r.error}`);
  await mark.set({ at: Date.now(), email });
  console.log("✓ أُرسل رابط إنشاء كلمة مرور الأدمن إلى بريده");
}

async function main() {
  const st = firebaseStatus();
  if (!st.ok) throw new Error(st.message);
  await wipeDemo();
  await seedTemplates();
  await admin();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("✖ فشلت تهيئة الإنتاج:", e);
    process.exit(1);
  },
);
