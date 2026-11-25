import { describe, it, expect } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { normalizePhone, normalizeEmail, phoneSearchVariants, csvCell, normalizeArabic, localPhone } from "@/shared/text";
import { riyadhLocalToMs, msToRiyadhLocal } from "@/shared/time";
import { sar, toHalalas } from "@/shared/money";
import { decide } from "@/server/domain/rsvp";
import { quote, DEFAULTS } from "@/server/domain/settings";
import { neededPlaces } from "@/server/domain/events";
import { readTicketCode } from "@/server/domain/checkin";
import { simulate } from "@/server/providers/messaging";
import { token } from "@/server/crypto";

describe("توحيد الأرقام السعودية", () => {
  it.each(["0512345678", "512345678", "966512345678", "+966512345678", "00966512345678", "٠٥١٢٣٤٥٦٧٨", "+٩٦٦٥١٢٣٤٥٦٧٨", "05 1234 5678", "051-234-5678", 512345678, "512345678.0", "5.12345678E8", "‎+966 51 234 5678"])("%s", (v) => {
    expect(normalizePhone(v)).toBe("+966512345678");
  });
  it("يرفض غير الصالح ويقبل الدولي", () => {
    for (const b of ["", "123", "0412345678", "05123", "9665123", "abc", "+96651234", null]) expect(normalizePhone(b)).toBeNull();
    expect(normalizePhone("+971501234567")).toBe("+971501234567");
    expect(localPhone("+966512345678")).toBe("0512345678");
    expect(phoneSearchVariants("0512")).toEqual(expect.arrayContaining(["0512", "512", "966512"]));
  });
});

describe("أدوات", () => {
  it("البريد وCSV والتوقيت والمال والعربية", () => {
    expect(normalizeEmail(" Sara@Example.COM ")).toBe("sara@example.com");
    expect(normalizeEmail("x@y")).toBeNull();
    expect(["=1+1", "+966", "-2", "@x"].map(csvCell)).toEqual(["'=1+1", "'+966", "'-2", "'@x"]);
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    const ms = riyadhLocalToMs("2026-12-01T18:30")!;
    expect(new Date(ms).toISOString()).toBe("2026-12-01T15:30:00.000Z");
    expect(msToRiyadhLocal(ms)).toBe("2026-12-01T18:30");
    expect([sar(9900), sar(25), toHalalas("2.5")]).toEqual(["99 ر.س", "0.25 ر.س", 250]);
    expect(normalizeArabic("أحمد")).toBe(normalizeArabic("احمد"));
    expect(normalizeArabic("فاطمة")).toBe(normalizeArabic("فاطمه"));
  });
  it("الرموز 160 بت وقراءة رمز التذكرة", () => {
    const t = token();
    expect(Buffer.from(t, "base64url")).toHaveLength(20);
    expect(readTicketCode(`https://x/t/${t}`)).toBe(t);
    expect(readTicketCode(t)).toBe(t);
    expect(readTicketCode("hello")).toBeNull();
  });
  it("محاكاة حالات المزوّد", () => {
    expect(simulate("whatsapp", "+966500000000", 0)?.permanent).toBe(true);
    expect(simulate("whatsapp", "+966500001111", 0)?.ok).toBe(false);
    expect(simulate("whatsapp", "+966500001111", 1)).toBeNull();
    expect(simulate("email", "fail@x.com", 0)?.permanent).toBe(true);
    expect(simulate("email", "flaky@x.com", 0)?.permanent).toBeFalsy();
  });
});

describe("المقاعد والباقة", () => {
  it("قرار المقاعد", () => {
    expect(decide(1, 2, "close", {})).toEqual({ act: "one_left", canWaitlist: false });
    expect(decide(1, 2, "close", { single: true })).toEqual({ act: "confirm", seats: 1 });
    expect(decide(1, 2, "waitlist", { waitlist: true })).toEqual({ act: "waitlist", seats: 2 });
    expect(decide(0, 1, "waitlist", {})).toEqual({ act: "full", canWaitlist: true });
  });
  it("40 دعوة منها 10 بمرافق = 50، وتجاوز أكبر باقة", () => {
    expect(neededPlaces(Array.from({ length: 40 }, (_, i) => ({ companion: i < 10 })))).toBe(50);
    expect(quote(50, DEFAULTS)).toMatchObject({ places: 50, price: 9900 });
    expect(quote(51, DEFAULTS).places).toBe(100);
    expect(quote(1010, DEFAULTS)).toMatchObject({ places: 1010, extra: 10, price: 119900 + 2000 });
  });
});

describe("QR بلا بيانات شخصية ويُقرأ بـ jsQR", () => {
  it("فك رمز تذكرة حقيقي", () => {
    const url = `http://localhost:3000/t/${token()}`;
    const q = QRCode.create(url, { errorCorrectionLevel: "M" });
    const n = q.modules.size, s = 6, m = 4, size = (n + 2 * m) * s;
    const px = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(y, x)) for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const i = (((y + m) * s + dy) * size + (x + m) * s + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
    expect(jsQR(px, size, size)?.data).toBe(url);
  });
});
