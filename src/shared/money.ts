// المبالغ بالهللة كأعداد صحيحة.
export function sar(h: number): string {
  const neg = h < 0;
  const a = Math.abs(Math.round(h));
  const r = Math.floor(a / 100).toLocaleString("en-US");
  const c = a % 100;
  return `${neg ? "-" : ""}${c ? `${r}.${String(c).padStart(2, "0")}` : r} ر.س`;
}
export function toHalalas(v: unknown): number | null {
  const n = Number(String(v ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
