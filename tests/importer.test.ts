import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { readFile, check, commit, parseCsv, yesNo, sampleXlsx } from "@/server/domain/importer";
import { invitationsOf } from "@/server/domain/events";
import { reset, user, event } from "./helpers";

beforeAll(reset);
const xlsx = async (rows: unknown[][]) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("x");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
};

describe("الاستيراد", () => {
  it("Excel بعناوين عربية والأرقام المخزنة كأرقام (بلا صفر)", async () => {
    const rows = await readFile(await xlsx([["الاسم", "الجوال", "البريد", "مرافق"], ["سارة", 551234567, "sara@example.com", "نعم"], ["محمد", "0569876543", "", "لا"], ["نورة", 966501112222, "", ""]]), "g.xlsx");
    const c = check(rows, []);
    expect(c.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect([c[0].phoneN, c[2].phoneN, c[0].withCompanion]).toEqual(["+966551234567", "+966501112222", true]);
  });
  it("عناوين إنجليزية بترتيب مختلف، وبلا عناوين يُفترض الترتيب", async () => {
    expect((await readFile(await xlsx([["Email", "Full Name", "Plus One", "Mobile"], ["a@example.com", "Ali", "yes", "0551111111"]]), "g.xlsx"))[0]).toEqual({ name: "Ali", phone: "0551111111", email: "a@example.com", companion: "yes" });
    expect(await readFile(Buffer.from("خالد,0551234567,,نعم\nريم,,reem@example.com,لا\n"), "g.csv")).toEqual([
      { name: "خالد", phone: "0551234567", email: "", companion: "نعم" },
      { name: "ريم", phone: "", email: "reem@example.com", companion: "لا" },
    ]);
  });
  it("CSV مع BOM واقتباس وفاصلة منقوطة، ورفض .xls", async () => {
    expect(parseCsv('﻿الاسم;الجوال\n"العتيبي; سارة";0551234567\n')).toEqual([["الاسم", "الجوال"], ["العتيبي; سارة", "0551234567"]]);
    await expect(readFile(Buffer.from("x"), "old.xls")).rejects.toMatchObject({ code: "xls" });
    await expect(readFile(Buffer.from("x"), "a.pdf")).rejects.toMatchObject({ code: "type" });
  });
  it("تصنيف الصفوف مع السبب", () => {
    const c = check(
      [
        { name: "أ1", phone: "0551000001", email: "", companion: "" },
        { name: "أ2", phone: "+966551000001", email: "", companion: "" },
        { name: "أ3", phone: "0551000003", email: "", companion: "" },
        { name: "", phone: "0551000004", email: "", companion: "" },
        { name: "أ5", phone: "12345", email: "", companion: "" },
        { name: "أ6", phone: "", email: "", companion: "" },
        { name: "أ7", phone: "", email: "x@y", companion: "ربما" },
      ],
      [{ phone: "+966551000003", email: null }],
    );
    expect(c.map((r) => r.status)).toEqual(["ok", "duplicate", "duplicate", "invalid", "invalid", "invalid", "invalid"]);
    expect(c[1].reasons.join()).toContain("مكرر في الملف (الصف 2)");
    expect(c[2].reasons.join()).toContain("الحاليين");
    expect(c[6].reasons).toEqual(expect.arrayContaining(["البريد غير صالح", "قيمة المرافق غير مفهومة (نعم/لا)"]));
    expect([yesNo("YES"), yesNo(""), yesNo("ربما")]).toEqual([true, false, null]);
  });
  it("الاعتماد يعيد التحقق في الخادم ويضيف المقبول فقط", async () => {
    const o = await user();
    const e = await event(o, { pay: false });
    expect(await commit(o.id, e.id, [{ name: "مقبول", phone: "0557000001", email: "", companion: "نعم" }, { name: "مكرر", phone: "0557000001", email: "", companion: "" }, { name: "", phone: "0557000003", email: "", companion: "" }])).toEqual({ added: 1, skipped: 2 });
    expect(await commit(o.id, e.id, [{ name: "مقبول", phone: "0557000001", email: "", companion: "" }])).toEqual({ added: 0, skipped: 1 });
    const l = await invitationsOf(e.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ phone: "+966557000001", companion: true });
  });
  it("الملف النموذجي يُقرأ صحيحًا", async () => {
    expect(check(await readFile(await sampleXlsx(), "s.xlsx"), []).every((r) => r.status === "ok")).toBe(true);
  });
});
