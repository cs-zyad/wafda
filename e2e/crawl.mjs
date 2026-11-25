// زيارة سريعة لكل الصفحات بكل الأدوار: الحالة، أخطاء المتصفح، والتمرير الأفقي على الجوال.
import { chromium } from "@playwright/test";
const B = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const bad = [];
async function crawl(email, start, prefix) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/404|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(B + "/login");
  await p.fill("input[name=email]", email);
  await p.fill("input[name=password]", "Wafda@2026");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
  const seen = new Set(), q = [...start];
  while (q.length && seen.size < 150) {
    const u = q.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    errs.length = 0;
    const r = await p.goto(B + u, { waitUntil: "networkidle" });
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const st = r?.status() ?? 0;
    const expected = /\/send$/.test(u) || /^\/checkin\//.test(u);
    if (st >= 500 || (st >= 400 && !expected)) bad.push(`${email} ${u} → ${st}`);
    if (ov > 1) bad.push(`${email} ${u} → تمرير أفقي ${ov}px`);
    if (errs.length) bad.push(`${email} ${u} → ${errs.join(" | ")}`);
    for (const h of await p.$$eval("a[href^='/']", (a) => a.map((x) => x.getAttribute("href")))) if (prefix.test(h) && !h.includes("?") && !h.endsWith("/export")) q.push(h);
  }
  await ctx.close();
  return seen.size;
}
const n = [await crawl("organizer@wafda.test", ["/dashboard"], /^\/(dashboard|checkin)/), await crawl("admin@wafda.test", ["/admin"], /^\/admin/), await crawl("staff@wafda.test", ["/checkin"], /^\/checkin/)];
console.log(`صفحات: منظّم ${n[0]}، أدمن ${n[1]}، استقبال ${n[2]}`);
console.log(bad.length ? bad.join("\n") : "✓ بلا أخطاء وبلا تمرير أفقي");
await browser.close();
process.exit(bad.length ? 1 : 0);
