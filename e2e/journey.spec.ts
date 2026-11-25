import { test, expect, chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

/**
 * الرحلة كاملة بالترتيب المطلوب، على مقاسات جوال وكمبيوتر:
 * إنشاء ← قالب ← مدعوون ← دفع ← إرسال ← دعوة من الصندوق على الجوال (منفرد + مع مرافق) ← مسح QR بكاميرا افتراضية
 * ← «حضر مسبقًا» ← المرافق يدويًا ← منع غير المعيّن (واجهة + API) ← اللوحة وCSV ← العام والمكتمل ← العزل ← كل الصفحات.
 */
const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const ART = path.resolve("e2e/.artifacts");
mkdirSync(ART, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const shot = (p: Page, n: string) => p.screenshot({ path: path.join(ART, `${n}.png`), fullPage: true });
const toast = (p: Page, text: string | RegExp) => expect(p.locator(".toast").filter({ hasText: text })).toBeVisible();

async function login(p: Page, email: string) {
  await p.goto("/login");
  await p.getByLabel("البريد الإلكتروني").fill(email);
  await p.getByLabel("كلمة المرور").fill("Wafda@2026");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.getByRole("button", { name: "دخول" }).click()]);
}

test.describe.serial("رحلة وفدة", () => {
  let browser: Browser, org: BrowserContext, p: Page;
  let eventId = "", guestTicket = "", companionTicket = "";

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    org = await b.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
    p = await org.newPage();
    p.on("dialog", (d) => d.accept());
    await login(p, "organizer@wafda.test");
  });

  test("1. إنشاء ← القالب ← المدعوون ← الدفع ← الإرسال", async () => {
    await p.goto("/dashboard/events/new");
    const d = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    await p.getByLabel("اسم الفعالية").fill("أمسية اختبار الرحلة");
    await p.getByLabel("الجهة المنظّمة").fill("فريق الجودة");
    await p.getByLabel("الوصف").fill("فعالية آلية لاختبار الرحلة كاملة.");
    await p.getByLabel("البداية").fill(`${d}T18:00`);
    await p.getByLabel("النهاية").fill(`${d}T21:00`);
    await p.getByLabel("المكان").fill("القاعة الرئيسية");
    await p.getByLabel("العنوان").fill("الرياض");
    await p.getByLabel("الحد الأقصى للحضور").fill("30");
    await p.getByLabel("خاصة بالاسم").check();
    await p.getByLabel("قائمة انتظار").check();
    await p.getByRole("button", { name: "حفظ المسودة والمتابعة للقالب" }).click();
    await p.waitForURL(/\/template$/);
    eventId = p.url().split("/")[5];
    await p.getByRole("button", { name: "اختيار" }).first().click();
    await toast(p, "تم اختيار القالب");
    await expect(p.getByText("المختار", { exact: true })).toBeVisible();
    await shot(p, "01-template");

    await p.goto(`/dashboard/events/${eventId}/guests`);
    for (const [name, phone, email, comp] of [["ضيف الرحلة", "0559990001", "", true], ["ضيفة البريد", "", "e2e.guest@example.com", false]] as const) {
      await p.getByLabel("الاسم", { exact: true }).first().fill(name);
      await p.getByLabel("الجوال", { exact: true }).first().fill(phone);
      await p.getByLabel("البريد", { exact: true }).first().fill(email);
      if (comp) await p.getByLabel("يسمح بمرافق واحد").check();
      await p.getByRole("button", { name: "إضافة", exact: true }).click();
      await toast(p, "أُضيف المدعو");
      await expect(p.locator(".item b", { hasText: name })).toBeVisible();
    }

    await p.goto(`/dashboard/events/${eventId}/payment`);
    await expect(p.getByText(/= 3 مكانًا/)).toBeVisible();
    await p.getByRole("button", { name: "ادفع قبل إرسال الدعوات" }).click();
    await p.waitForURL(/\/dev\/checkout\//);
    await p.getByRole("button", { name: "ادفع الآن (تجريبي)" }).click();
    await toast(p, "وصل الإشعار الموقّع وطُبّق الأثر");
    await p.getByRole("button", { name: "إعادة إرسال نفس الإشعار" }).click();
    await toast(p, "تجاهله الخادم");
    await expect(p.getByRole("button", { name: "تم الدفع ✓" })).toBeDisabled();
    await shot(p, "02-checkout");
    await p.goto(`/dashboard/events/${eventId}/payment`);
    await expect(p.locator(".stat", { hasText: "الأماكن المدفوعة" })).toContainText("50");

    await p.goto(`/dashboard/events/${eventId}/send`);
    await p.getByRole("button", { name: "إرسال الدعوات" }).click();
    await toast(p, /أُرسلت 2 رسالة/);
    await shot(p, "03-send");
  });

  test("2. الدعوة من صندوق الرسائل على الجوال: مع مرافق ومنفردًا", async () => {
    const c = await browser.newContext({ baseURL: BASE, ...PHONE });
    const m = await c.newPage();
    m.on("dialog", (d) => d.accept());
    await m.goto("/dev/inbox?to=%2B966559990001");
    await shot(m, "04-inbox");
    await m.locator('a[href*="/i/"]').first().click();
    await expect(m.getByRole("heading", { name: "أمسية اختبار الرحلة" })).toBeVisible();
    await expect(m.getByLabel("رقم الجوال (واتساب)")).toHaveValue("0559990001");
    await m.getByLabel("معي مرافق").check();
    await shot(m, "05-invitation");
    await m.getByRole("button", { name: "أكّد حضورك" }).click();
    await expect(m.getByRole("heading", { name: "تم تأكيد حضورك" })).toBeVisible();
    await expect(m.getByText("حُجز مقعدان")).toBeVisible();
    await shot(m, "06-confirmed");
    const hrefs = await m.getByRole("link", { name: "عرض التذكرة" }).evaluateAll((a) => a.map((x) => x.getAttribute("href")!));
    expect(hrefs).toHaveLength(2);
    [guestTicket, companionTicket] = hrefs.map((h) => h.split("/t/")[1]);
    expect(guestTicket).not.toBe(companionTicket);
    await m.goto(`/t/${companionTicket}`);
    await expect(m.getByText("مرافق — ضيف الرحلة")).toBeVisible();
    await expect(m.getByRole("button", { name: "مشاركة التذكرة مع المرافق" })).toBeVisible();
    await shot(m, "07-companion-ticket");
    expect(await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

    await m.goto("/dev/inbox?to=e2e.guest%40example.com");
    await m.locator('a[href*="/i/"]').first().click();
    await expect(m.getByLabel("البريد الإلكتروني")).toHaveValue("e2e.guest@example.com");
    await m.getByRole("button", { name: "أكّد حضورك" }).click();
    await expect(m.getByText("حُجز مقعدك.")).toBeVisible();
    await m.goto("/dev/inbox?to=e2e.guest%40example.com");
    await expect(m.getByText("تم تأكيد حضورك").first()).toBeVisible(); // رسالة التأكيد مع التذكرة
    await c.close();
  });

  test("3-4. مسح QR بكاميرا افتراضية (BarcodeDetector ثم jsQR) ← «حضر مسبقًا» ← المرافق يدويًا", async () => {
    const png = path.join(ART, "qr.png"), y4m = path.join(ART, "qr.y4m");
    await QRCode.toFile(png, `${BASE}/t/${guestTicket}`, { width: 560, margin: 4 });
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", png, "-t", "3", "-r", "10", "-vf", "scale=560:560,pad=960:720:(ow-iw)/2:(oh-ih)/2:white", "-pix_fmt", "yuv420p", y4m]);
    const cam = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`] });
    const c = await cam.newContext({ baseURL: BASE, ...PHONE, permissions: ["camera"] });
    const s = await c.newPage();
    await login(s, "organizer@wafda.test");
    await s.goto(`/checkin/${eventId}`);
    await s.getByRole("button", { name: "تشغيل الكاميرا" }).click();
    const res = s.getByTestId("result");
    await expect(res).toContainText("تم تسجيل الدخول", { timeout: 30_000 });
    await expect(res).toContainText("ضيف الرحلة");
    await expect(s.getByTestId("count")).toHaveText("1");
    await shot(s, "08-scan-ok");
    await expect(res).toContainText("حضر مسبقًا", { timeout: 30_000 });
    await expect(res).toContainText("بالمسح");
    await shot(s, "09-scan-again");
    await s.getByRole("button", { name: "إيقاف الكاميرا" }).click();

    await s.getByText("تعذّر عرض الرمز؟").click();
    await s.getByLabel("بحث عن ضيف").fill("ضيف الرحلة");
    await s.getByRole("button", { name: "بحث", exact: true }).click();
    await s.getByRole("button", { name: "تسجيل الحضور يدويًا" }).click();
    await expect(res).toContainText("مرافق — ضيف الرحلة");
    await expect(s.getByTestId("count")).toHaveText("2");
    await shot(s, "10-manual-companion");
    await s.getByText("إدخال الرمز أو رابط التذكرة يدويًا").click();
    await s.getByLabel("الرمز أو الرابط").fill(`${BASE}/t/${companionTicket}`);
    await s.getByRole("button", { name: "تحقق" }).click();
    await expect(res).toContainText("حضر مسبقًا");

    await s.goto(`/checkin/${eventId}?engine=jsqr`);
    await s.getByRole("button", { name: "تشغيل الكاميرا" }).click();
    await expect(s.getByText("(jsQR)")).toBeVisible();
    await expect(s.getByTestId("result")).toContainText("حضر مسبقًا", { timeout: 30_000 });
    await cam.close();
  });

  test("5. منع عضو غير معيّن في الواجهة وفي API", async () => {
    const c = await browser.newContext({ baseURL: BASE, ...PHONE });
    const s = await c.newPage();
    await login(s, "staff2@wafda.test");
    expect((await s.goto(`/checkin/${eventId}`))?.status()).toBe(404);
    expect((await s.request.post(`/api/checkin/${eventId}`, { data: { op: "scan", value: guestTicket } })).status()).toBe(404);
    expect((await s.request.post(`/api/checkin/${eventId}`, { data: { op: "search", value: "ضيف" } })).status()).toBe(404);
    await s.goto("/checkin");
    await expect(s.getByText("أمسية اختبار الرحلة")).toHaveCount(0);
    await c.close();
  });

  test("6. النتيجة في اللوحة وفي CSV", async () => {
    await p.goto(`/dashboard/events/${eventId}`);
    await expect(p.locator(".stat", { hasText: "الحاضرون" })).toContainText("1 ضيف + 1 مرافق");
    await expect(p.locator(".stat", { hasText: "المؤكدون" })).toContainText("3");
    await shot(p, "11-overview");
    await p.goto(`/dashboard/events/${eventId}/guests`);
    await expect(p.getByText(/الضيف: حضر/)).toBeVisible();
    await expect(p.getByText(/المرافق: حضر/)).toBeVisible();
    await shot(p, "12-guests");
    const csv = (await (await p.request.get(`/dashboard/events/${eventId}/export`)).text()).trim().split(/\r?\n/);
    expect(csv[0]).toContain("النوع");
    expect(csv.filter((l) => l.includes("ضيف الرحلة") && l.includes("حضر"))).toHaveLength(2);
    expect(csv.some((l) => l.startsWith("مرافق") && l.includes("يدوي"))).toBe(true);
    expect(csv.some((l) => l.includes("ضيفة البريد") && l.includes("لم يحضر"))).toBe(true);
  });

  test("7. الرابط العام والرابط المكتمل", async () => {
    const urlOf = async (title: RegExp) => {
      await p.goto("/dashboard");
      await p.getByRole("link", { name: title }).click();
      await p.getByRole("link", { name: "الباقة والرابط العام" }).click();
      return p.locator(".copy input").inputValue();
    };
    const open = await urlOf(/ورشة تصميم واجهات المستخدم/);
    const full = await urlOf(/جلسة حوارية/);
    const c = await browser.newContext({ baseURL: BASE, ...PHONE });
    const m = await c.newPage();
    await m.goto(open);
    await m.getByLabel("الاسم").fill("زائرة الرابط العام");
    await m.getByLabel("رقم الجوال (واتساب)").fill("0558887766");
    await shot(m, "13-public-form");
    await m.getByRole("button", { name: "سجّل حضورك" }).click();
    await m.waitForURL(/\/r\//);
    await expect(m.getByRole("heading", { name: "تم تأكيد حضورك" })).toBeVisible();
    await shot(m, "14-public-confirmed");
    await m.goto(open);
    await m.getByLabel("الاسم").fill("شخص آخر");
    await m.getByLabel("رقم الجوال (واتساب)").fill("+966 55 888 7766");
    await m.getByRole("button", { name: "سجّل حضورك" }).click();
    await expect(m.getByText("وسيلة التواصل هذه مسجّلة مسبقًا.")).toBeVisible();
    await expect(m.getByRole("link", { name: "عرض التذكرة" })).toHaveCount(0);
    await m.goto(full);
    await expect(m.getByRole("heading", { name: "اكتمل العدد" })).toBeVisible();
    await expect(m.getByRole("button", { name: "سجّل حضورك" })).toHaveCount(0);
    await shot(m, "15-public-full");
    await c.close();
  });

  test("8. عزل المنظّمين", async () => {
    const c = await browser.newContext({ baseURL: BASE });
    const o = await c.newPage();
    await login(o, "other@wafda.test");
    for (const t of ["", "/guests", "/send", "/payment", "/staff", "/messages", "/export"]) expect((await o.goto(`/dashboard/events/${eventId}${t}`))?.status(), t).toBe(404);
    expect((await o.request.post(`/api/checkin/${eventId}`, { data: { op: "scan", value: guestTicket } })).status()).toBe(404);
    await c.close();
  });

  test("9. كل صفحات المنظّم والأدمن بلا أخطاء وبلا تمرير أفقي على الجوال", async () => {
    const problems: string[] = [];
    const crawl = async (email: string, start: string, prefix: RegExp) => {
      const c = await browser.newContext({ baseURL: BASE, ...PHONE, deviceScaleFactor: 1 });
      const s = await c.newPage();
      const errs: string[] = [];
      s.on("pageerror", (e) => errs.push(e.message));
      s.on("console", (m) => m.type() === "error" && !/404|Failed to load resource/.test(m.text()) && errs.push(m.text()));
      await login(s, email);
      const seen = new Set<string>(), q = [start];
      while (q.length && seen.size < 150) {
        const u = q.shift()!;
        if (seen.has(u)) continue;
        seen.add(u);
        errs.length = 0;
        const st = (await s.goto(u, { waitUntil: "networkidle" }))?.status() ?? 0;
        const ov = await s.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (st >= 500 || (st >= 400 && !/\/send$|^\/checkin\//.test(u))) problems.push(`${email} ${u} → ${st}`);
        if (ov > 1) problems.push(`${email} ${u} → تمرير أفقي ${ov}px`);
        if (errs.length) problems.push(`${email} ${u} → ${errs.join(" | ")}`);
        for (const h of await s.$$eval("a[href^='/']", (a) => a.map((x) => x.getAttribute("href")!))) if (prefix.test(h) && !h.includes("?") && !h.endsWith("/export")) q.push(h);
      }
      await c.close();
      return seen.size;
    };
    const n = [await crawl("organizer@wafda.test", "/dashboard", /^\/(dashboard|checkin)/), await crawl("admin@wafda.test", "/admin", /^\/admin/), await crawl("staff@wafda.test", "/checkin", /^\/checkin/)];
    console.log(`زيارة ${n[0]} صفحة منظّم، ${n[1]} أدمن، ${n[2]} استقبال`);
    expect(problems, problems.join("\n")).toEqual([]);
    expect(n[0]).toBeGreaterThan(40);
  });
});
