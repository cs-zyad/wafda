import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";

/** رمز عشوائي صعب التخمين: 20 بايت = 160 بت (base64url) */
export const token = (bytes = 20) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (secret: string, s: string) => createHmac("sha256", secret).update(s).digest("hex");
export function equalHex(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
