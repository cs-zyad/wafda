"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { act, demo, me, type Res } from "@/server/session";
import { ref } from "@/server/db";
import { token } from "@/server/crypto";
import { AppError } from "@/server/errors";
import { getPayment } from "@/server/domain/payments";
import { sign, SIG_HEADER } from "@/server/providers/payments";

const LABEL: Record<string, string> = {
  applied: "وصل الإشعار الموقّع وطُبّق الأثر",
  duplicate: "نفس الإشعار وصل مرة أخرى — تجاهله الخادم ولم يتكرر الأثر",
  already_paid: "الدفع مثبت مسبقًا — لم يتكرر الأثر",
  failed: "سُجّل فشل الدفع",
  rejected: "رفض الخادم الإشعار",
};

/** يرسل إشعارًا موقّعًا عبر HTTP إلى نفس مسار المعالجة الفعلي /api/payments/webhook */
export const mockPayAction = async (id: string, op: "pay" | "fail" | "again") =>
  act(async (): Promise<Res> => {
    if (!demo()) throw new AppError("off", "الوضع التجريبي معطّل");
    const [u, p] = await Promise.all([me(), getPayment(id)]);
    if (!u || !p || (p.ownerId !== u.id && u.role !== "admin")) throw new AppError("not_found", "عملية الدفع غير موجودة", 404);
    let body = p.lastWebhook ?? "";
    if (op !== "again") {
      body = JSON.stringify({ id: `evt_${token(12)}`, type: op === "pay" ? "payment.succeeded" : "payment.failed", paymentId: p.id, amount: p.amount, currency: p.currency });
      await ref("payments", p.id).update({ lastWebhook: body });
    } else if (!body) throw new AppError("none", "لم يُرسل إشعار بعد");
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host ?? "") ? "http" : "https");
    const res = await fetch(`${proto}://${host}/api/payments/webhook`, { method: "POST", headers: { "content-type": "application/json", [SIG_HEADER]: sign(body) }, body, cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { outcome?: string; error?: string };
    revalidatePath(`/dev/checkout/${p.id}`);
    if (!j.outcome) throw new AppError("webhook", `فشل الإشعار (${res.status}) ${j.error ?? ""}`);
    return { ok: true, msg: `${LABEL[j.outcome] ?? j.outcome} (HTTP ${res.status})` };
  });
