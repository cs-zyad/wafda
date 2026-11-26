// قبل next build: يتأكد من ضبط Firebase برسالة عربية واضحة، ويعبّئ البيانات التجريبية مرة واحدة إن كان DEMO_MODE=true،
// أو يهيّئ الإنتاج (scripts/bootstrap.ts) في الوضع الفعلي.
import { spawnSync } from "node:child_process";
const stop = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) stop("لم يُضبط Firebase.\n  أضف المتغير FIREBASE_SERVICE_ACCOUNT في Vercel (Settings ← Environment Variables)\n  بمحتوى ملف حساب الخدمة JSON كاملًا أو بترميز base64، ثم أعد النشر.\n  للتجربة المحلية بلا حساب: npm run dev:local");
  try {
    const t = raw.trim();
    const sa = JSON.parse(t.startsWith("{") ? t : Buffer.from(t, "base64").toString("utf8"));
    if (!sa.project_id || !sa.client_email || !sa.private_key) throw 0;
    console.log(`✓ Firebase مضبوط (${sa.project_id})`);
  } catch {
    stop("قيمة FIREBASE_SERVICE_ACCOUNT غير صالحة: انسخ محتوى ملف حساب الخدمة JSON كاملًا (فيه project_id وclient_email وprivate_key) أو base64 له.");
  }
}
if (process.env.DEMO_MODE !== "true" && process.env.VERCEL && !process.env.PAYMENT_WEBHOOK_SECRET) stop("PAYMENT_WEBHOOK_SECRET غير مضبوط (16 حرفًا عشوائيًا على الأقل) — مطلوب للوضع الفعلي.");
if (process.env.DEMO_MODE === "true") {
  console.log("… DEMO_MODE=true: البيانات التجريبية (مرة واحدة فقط)");
  const r = spawnSync("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/seed.ts"], { stdio: "inherit", env: process.env });
  if (r.status !== 0) stop("فشلت تعبئة البيانات التجريبية؛ راجع السجل أعلاه.");
} else if (process.env.VERCEL || process.env.WAFDA_BOOTSTRAP === "true") {
  console.log("… الوضع الفعلي: تهيئة الإنتاج (حذف التجريبي مرة واحدة، القوالب، حساب الأدمن)");
  const r = spawnSync("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/bootstrap.ts"], { stdio: "inherit", env: process.env });
  if (r.status !== 0) stop("فشلت تهيئة الإنتاج؛ راجع السجل أعلاه.");
}
