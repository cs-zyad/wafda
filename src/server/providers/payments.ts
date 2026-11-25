import { hmac, equalHex } from "../crypto";

export interface PaymentEvent {
  id: string; // معرّف الإشعار الفريد من المزوّد
  type: "payment.succeeded" | "payment.failed";
  paymentId: string;
  amount: number; // هللة
  currency: string;
}

/** واجهة مزوّد الدفع */
export interface PaymentProvider {
  label: string;
  mode: "mock" | "live";
  checkoutUrl(paymentId: string): string;
  /** يتحقق من التوقيع ويعيد الإشعار، أو null */
  verify(rawBody: string, headers: Headers): PaymentEvent | null;
}

export const SIG_HEADER = "x-wafda-signature";

export function webhookSecret() {
  const s = process.env.PAYMENT_WEBHOOK_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") throw new Error("PAYMENT_WEBHOOK_SECRET غير مضبوط");
  return "dev-only-insecure-webhook-secret";
}
export const sign = (raw: string) => hmac(webhookSecret(), raw);

/** دفع تجريبي: صفحة محلية ترسل إشعارًا موقّعًا (HMAC-SHA256) إلى نفس مسار المعالجة الفعلي */
class MockPayments implements PaymentProvider {
  label = "دفع تجريبي";
  mode = "mock" as const;
  checkoutUrl = (id: string) => `/dev/checkout/${id}`;
  verify(raw: string, headers: Headers): PaymentEvent | null {
    const sig = headers.get(SIG_HEADER) || "";
    if (!/^[0-9a-f]{64}$/.test(sig) || !equalHex(sig, sign(raw))) return null;
    try {
      const e = JSON.parse(raw);
      const okType = e.type === "payment.succeeded" || e.type === "payment.failed";
      return okType && typeof e.id === "string" && typeof e.paymentId === "string" && Number.isInteger(e.amount) && typeof e.currency === "string" ? e : null;
    } catch {
      return null;
    }
  }
}

let provider: PaymentProvider = new MockPayments();
export const paymentProvider = () => provider;
export const setPaymentProvider = (p: PaymentProvider) => void (provider = p);
