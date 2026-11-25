import { describe, it, expect, beforeAll } from "vitest";
import { ref } from "@/server/db";
import { requestDesign, quoteDesign, acceptQuote, payForDesign, startDesign, deliverDesign, getDesign, cancelDesign } from "@/server/domain/designs";
import { templatesFor } from "@/server/domain/templates";
import { openTicket, reply, ticket } from "@/server/domain/support";
import { reset, user, webhook } from "./helpers";

beforeAll(reset);

describe("التصميم الخاص والدعم", () => {
  it("مراجعة ← عرض ← قبول ← دفع بإشعار ← تنفيذ ← تسليم كقالب خاص للمنظّم وحده", async () => {
    const [o, x, a] = await Promise.all([user(), user(), user("admin", "أدمن")]);
    const d = await requestDesign(o.id, { title: "قالب النادي", details: "ألوان النادي مع الشعار" });
    await expect(acceptQuote(o.id, d.id)).rejects.toMatchObject({ code: "state" });
    await quoteDesign(a.id, d.id, { amount: 30000, notes: "جولتا تعديل", days: 5 });
    await expect(acceptQuote(x.id, d.id)).rejects.toMatchObject({ code: "not_found" });
    await acceptQuote(o.id, d.id);
    await expect(startDesign(a.id, d.id)).rejects.toMatchObject({ code: "state" });
    const { payment } = await payForDesign(o.id, d.id);
    expect(payment.amount).toBe(30000);
    expect((await webhook(payment)).body.outcome).toBe("applied");
    expect((await getDesign(d.id))!.status).toBe("paid");
    await startDesign(a.id, d.id);
    const tid = await deliverDesign(a.id, d.id, { layout: "lilac_soft", name: "قالب النادي الخاص", category: "خاص", colors: ["#E8DEED", "#28182C", "#DDF480", "#FFFFFF", "#65586B"] });
    expect(await getDesign(d.id)).toMatchObject({ status: "delivered", templateId: tid });
    expect((await templatesFor(o.id)).some((t) => t.id === tid)).toBe(true);
    expect((await templatesFor(x.id)).some((t) => t.id === tid)).toBe(false);
  });
  it("العرض المنتهي لا يُقبل، والإلغاء قبل الدفع", async () => {
    const [o, a] = await Promise.all([user(), user("admin", "أدمن")]);
    const d = await requestDesign(o.id, { title: "ينتهي", details: "تفاصيل كافية للطلب" });
    await quoteDesign(a.id, d.id, { amount: 10000, notes: "", days: 1 });
    await ref("designs", d.id).update({ "quote.until": Date.now() - 1 });
    await expect(acceptQuote(o.id, d.id)).rejects.toMatchObject({ code: "expired" });
    await cancelDesign(o.id, d.id);
    expect((await getDesign(d.id))!.status).toBe("cancelled");
  });
  it("الشكوى: حالات وردود ومعزولة", async () => {
    const [o, x, a] = await Promise.all([user(), user(), user("admin", "أدمن")]);
    const t = await openTicket(o, { kind: "complaint", subject: "شكوى تجريبية", body: "تفاصيل الشكوى" });
    await expect(ticket(x, t.id)).rejects.toMatchObject({ code: "not_found" });
    await reply(a, t.id, "نعمل عليها", "working");
    expect((await ticket(o, t.id)).status).toBe("working");
    await reply(a, t.id, "", "resolved");
    await reply(o, t.id, "ما زالت المشكلة");
    expect((await ticket(o, t.id)).status).toBe("open");
  });
});
