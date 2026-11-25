// أدوات نصية خالصة (تعمل في الخادم والمتصفح).

const DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};
export const latinDigits = (s: string) => s.replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d] ?? d);

/**
 * توحيد رقم الجوال إلى E.164. السعودي: 05xxxxxxxx، 5xxxxxxxx (Excel بلا صفر)، 9665…، ‎+9665…، 009665…، والأرقام العربية.
 * الدولي الآخر: يبدأ بـ + أو 00 وطوله 8-15. يعيد null إن لم يصلح.
 */
export function normalizePhone(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let s = latinDigits(String(input)).trim();
  if (!s) return null;
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  if (/^\d(\.\d+)?e\+?\d+$/i.test(s)) s = Number(s).toFixed(0);
  s = s.replace(/[\s\-().‎‏‪-‮⁦-⁩]/g, "");
  let intl = false;
  if (s.startsWith("+")) [intl, s] = [true, s.slice(1)];
  else if (s.startsWith("00")) [intl, s] = [true, s.slice(2)];
  if (!/^\d+$/.test(s)) return null;
  if (/^9665\d{8}$/.test(s)) return `+${s}`;
  if (!intl) {
    if (/^05\d{8}$/.test(s)) return `+966${s.slice(1)}`;
    if (/^5\d{8}$/.test(s)) return `+966${s}`;
    return null;
  }
  if (s.startsWith("966")) return null;
  return s.length >= 8 && s.length <= 15 ? `+${s}` : null;
}

/** عرض الرقم السعودي بالصيغة المحلية */
export const localPhone = (p?: string | null) => (!p ? "" : /^\+9665\d{8}$/.test(p) ? `0${p.slice(4)}` : p);

export function normalizeEmail(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().toLowerCase();
  if (!s || s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return null;
  return s;
}

/** صيغ مكافئة للبحث الجزئي في الأرقام */
export function phoneSearchVariants(q: string): string[] {
  const d = latinDigits(q).replace(/\D/g, "");
  if (d.length < 3) return [];
  const out = new Set([d]);
  if (d.startsWith("00")) out.add(d.slice(2));
  if (d.startsWith("0")) {
    out.add(d.slice(1));
    out.add("966" + d.slice(1));
  }
  return [...out];
}

/** توحيد العربية للبحث */
export const normalizeArabic = (s: string) =>
  latinDigits(s)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();

/** خلية CSV آمنة من حقن الصيغ في Excel */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const clamp = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
