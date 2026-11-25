import ExcelJS from "exceljs";
import { AppError } from "../errors";
import { clamp, latinDigits, normalizeEmail, normalizePhone } from "@/shared/text";
import type { Invitation } from "../types";
import { invitationsOf, ownEvent } from "./events";
import { addInvitations } from "./invitations";

export interface Row { name: string; phone: string; email: string; companion: string }
export interface CheckedRow extends Row {
  line: number;
  status: "ok" | "duplicate" | "invalid";
  reasons: string[];
  phoneN: string | null;
  emailN: string | null;
  withCompanion: boolean;
}

const HEAD: Record<keyof Row, string[]> = {
  name: ["الاسم", "اسم", "الاسم الكامل", "اسم المدعو", "name", "full name", "guest", "guest name"],
  phone: ["الجوال", "رقم الجوال", "جوال", "الهاتف", "رقم الهاتف", "واتساب", "الواتساب", "phone", "mobile", "phone number", "whatsapp", "tel"],
  email: ["البريد", "البريد الإلكتروني", "البريد الالكتروني", "الايميل", "الإيميل", "ايميل", "email", "e-mail", "mail"],
  companion: ["مرافق", "المرافق", "مع مرافق", "يسمح بمرافق", "companion", "plus one", "plus-one", "+1"],
};
const n = (s: string) => latinDigits(String(s ?? "")).trim().toLowerCase().replace(/\s+/g, " ").replace(/[إأآ]/g, "ا");

function columns(first: string[]) {
  const map: Partial<Record<keyof Row, number>> = {};
  first.forEach((cell, i) => {
    for (const k of Object.keys(HEAD) as (keyof Row)[]) if (map[k] === undefined && HEAD[k].some((h) => n(h) === n(cell))) map[k] = i;
  });
  const found = Object.keys(map).length;
  if (found >= 2 || map.name !== undefined) return { header: true, map: { name: map.name ?? -1, phone: map.phone ?? -1, email: map.email ?? -1, companion: map.companion ?? -1 } };
  return { header: false, map: { name: 0, phone: 1, email: 2, companion: 3 } }; // بلا عناوين: الترتيب المفترض
}

function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v); // أرقام الجوال المخزنة كأرقام تُقرأ كما هي ثم تُوحَّد
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (v instanceof Date) return v.toISOString();
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("text" in v && typeof v.text === "string") return v.text;
  if ("result" in v) return text(v.result as ExcelJS.CellValue);
  if ("hyperlink" in v) return String(v.hyperlink).replace(/^mailto:/, "");
  return String(v);
}

export function parseCsv(src: string): string[][] {
  const t = src.replace(/^﻿/, "");
  const line = t.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => line.split(c).length;
  const d = count(";") > count(",") ? ";" : count("\t") > count(",") ? "\t" : ",";
  const out: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim()));
}

export async function readFile(buf: Buffer, filename: string): Promise<Row[]> {
  const f = filename.toLowerCase();
  let grid: string[][];
  if (f.endsWith(".xls")) throw new AppError("xls", "صيغة Excel القديمة (.xls) غير مدعومة. افتح الملف واحفظه بصيغة ‎.xlsx أو ‎.csv ثم ارفعه.");
  if (f.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      throw new AppError("bad_file", "تعذّرت قراءة الملف؛ تأكد أنه ‎.xlsx سليم");
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new AppError("empty", "الملف بلا أوراق");
    grid = [];
    ws.eachRow((r) => {
      const vals = Array.from({ length: Math.max(r.cellCount, 4) }, (_, i) => text(r.getCell(i + 1).value).trim());
      if (vals.some(Boolean)) grid.push(vals);
    });
  } else if (f.endsWith(".csv") || f.endsWith(".txt")) grid = parseCsv(buf.toString("utf8"));
  else throw new AppError("type", "ارفع ملفًا بصيغة ‎.xlsx أو ‎.csv");
  if (!grid.length) throw new AppError("empty", "الملف فارغ");
  if (grid.length > 5001) throw new AppError("big", "الحد الأقصى 5000 صف");
  const { header, map } = columns(grid[0]);
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  return (header ? grid.slice(1) : grid).map((r) => ({ name: at(r, map.name), phone: at(r, map.phone), email: at(r, map.email), companion: at(r, map.companion) }));
}

const YES = ["نعم", "ايوه", "yes", "y", "1", "true", "✓", "✔", "x", "مع مرافق"].map(n);
const NO = ["لا", "no", "n", "0", "false", "", "-", "بدون"].map(n);
export const yesNo = (v: string) => (YES.includes(n(v)) ? true : NO.includes(n(v)) ? false : null);

/** مقبول / مكرر (داخل الملف أو مع الحاليين) / يحتاج تصحيحًا — مع السبب */
export function check(rows: Row[], existing: Pick<Invitation, "phone" | "email">[], first = 2): CheckedRow[] {
  const ph = new Set(existing.map((i) => i.phone).filter(Boolean));
  const em = new Set(existing.map((i) => i.email).filter(Boolean));
  const seenP = new Map<string, number>(), seenE = new Map<string, number>();
  return rows.map((r, i) => {
    const line = first + i;
    const reasons: string[] = [];
    const name = clamp(r.name, 120);
    const phoneN = r.phone ? normalizePhone(r.phone) : null;
    const emailN = r.email ? normalizeEmail(r.email) : null;
    const comp = yesNo(r.companion);
    if (!name) reasons.push("الاسم مفقود");
    if (r.phone && !phoneN) reasons.push("رقم الجوال غير صالح");
    if (r.email && !emailN) reasons.push("البريد غير صالح");
    if (!r.phone && !r.email) reasons.push("لا جوال ولا بريد");
    if (comp === null) reasons.push("قيمة المرافق غير مفهومة (نعم/لا)");
    let status: CheckedRow["status"] = reasons.length ? "invalid" : "ok";
    if (status === "ok") {
      if (phoneN && ph.has(phoneN)) reasons.push("الجوال موجود في المدعوين الحاليين");
      if (emailN && em.has(emailN)) reasons.push("البريد موجود في المدعوين الحاليين");
      if (phoneN && seenP.has(phoneN)) reasons.push(`الجوال مكرر في الملف (الصف ${seenP.get(phoneN)})`);
      if (emailN && seenE.has(emailN)) reasons.push(`البريد مكرر في الملف (الصف ${seenE.get(emailN)})`);
      if (reasons.length) status = "duplicate";
      else {
        if (phoneN) seenP.set(phoneN, line);
        if (emailN) seenE.set(emailN, line);
      }
    }
    return { ...r, name, line, status, reasons, phoneN, emailN, withCompanion: !!comp };
  });
}

export async function preview(ownerId: string, eventId: string, rows: Row[]) {
  const e = await ownEvent(ownerId, eventId);
  if (e.type !== "private") throw new AppError("not_private", "الاستيراد للدعوات الخاصة فقط");
  return check(rows, await invitationsOf(eventId));
}

/** الاعتماد يعيد التحقق في الخادم ولا يضيف إلا المقبول */
export async function commit(ownerId: string, eventId: string, rows: Row[]) {
  if (rows.length > 5000) throw new AppError("big", "الحد الأقصى 5000 صف");
  const c = await preview(ownerId, eventId, rows);
  const ok = c.filter((r) => r.status === "ok");
  await addInvitations(ownerId, eventId, ok.map((r) => ({ name: r.name, phone: r.phoneN, email: r.emailN, companion: r.withCompanion })));
  return { added: ok.length, skipped: c.length - ok.length };
}

export async function sampleXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("المدعوون", { views: [{ rightToLeft: true }] });
  ws.columns = [{ header: "الاسم", key: "name", width: 26 }, { header: "الجوال", key: "phone", width: 18 }, { header: "البريد", key: "email", width: 28 }, { header: "مرافق", key: "companion", width: 10 }];
  ws.addRow({ name: "سارة العتيبي", phone: "0551234567", email: "sara@example.com", companion: "نعم" });
  ws.addRow({ name: "محمد القحطاني", phone: "0569876543", email: "", companion: "لا" });
  ws.addRow({ name: "نورة الشهري", phone: "", email: "noura@example.com", companion: "لا" });
  ws.getRow(1).font = { bold: true };
  ws.getColumn("phone").numFmt = "@";
  return Buffer.from(await wb.xlsx.writeBuffer());
}
