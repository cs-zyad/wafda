import { describe, it, expect, beforeAll } from "vitest";
import { payPackage, payExtraPlaces, payTopup, getPayment } from "@/server/domain/payments";
import { createEvent, getEvent } from "@/server/domain/events";
import { addInvitations } from "@/server/domain/invitations";
import { ledgerOf } from "@/server/domain/ledger";
import { msToRiyadhLocal, DAY } from "@/shared/time";
import { reset, user, event, guests, webhook, credit, uid } from "./helpers";

beforeAll(reset);

describe("الدفع عبر إشعار موقّع فقط", () => {
  it("تكرار نفس الإشعار متتابعًا ومتزامنًا لا يكرر زيادة المقاعد", async () => {
    const o = await user();
    const e = await event(o, { invites: guests(10), pay: false });
    const { payment } = await payPackage(o.id, e.id);
    expect(payment.amount).toBe(9900);
    const id = `evt_${uid()}`;
    expect((await webhook(payment, { id })).body.outcome).toBe("applied");
    expect((await webhook(payment, { id })).body.outcome).toBe("duplicate");
    expect((await Promise.all(Array.from({ length: 5 }, () => webhook(payment, { id })))).every((r) => r.body.outcome === "duplicate")).toBe(true);
    expect((await webhook(payment)).body.outcome).toBe("already_paid");
    const ev = await getEvent(e.id);
    expect([ev!.paidPlaces, ev!.status]).toEqual([50, "active"]);
  });

  it("إشعارات متزامنة بمعرّفات مختلفة لنفس الشحن = شحن واحد", async () => {
    const o = await user();
    const { payment } = await payTopup(o.id, 5000);
    const r = await Promise.all(Array.from({ length: 6 }, () => webhook(payment)));
    expect(r.filter((x) => x.body.outcome === "applied")).toHaveLength(1);
    expect(await credit(o)).toBe(5000);
    expect((await ledgerOf(o.id)).filter((l) => l.reason === "topup")).toHaveLength(1);
  });

  it("رفض التوقيع الخاطئ والمبلغ والعملة الخاطئين، ومحاكاة فشل الدفع", async () => {
    const o = await user();
    const { payment } = await payTopup(o.id, 2000);
    expect((await webhook(payment, { badSig: true })).status).toBe(401);
    expect((await webhook(payment, { amount: 1 })).body.outcome).toBe("rejected");
    expect((await webhook(payment, { currency: "USD" })).body.outcome).toBe("rejected");
    expect(await credit(o)).toBe(0);
    const f = await payTopup(o.id, 2000);
    expect((await webhook(f.payment, { type: "payment.failed" })).body.outcome).toBe("failed");
    expect((await getPayment(f.payment.id))!.status).toBe("failed");
    expect((await webhook(payment)).body.outcome).toBe("applied");
    expect(await credit(o)).toBe(2000);
  });

  it("الأماكن الإضافية ترفع الحد الأقصى في العامة بنفس العدد", async () => {
    const o = await user();
    const e = await event(o, { type: "public", max: 40 });
    const { payment } = await payExtraPlaces(o.id, e.id, 15);
    expect(payment.amount).toBe(3000);
    await webhook(payment);
    const ev = await getEvent(e.id);
    expect([ev!.paidPlaces, ev!.maxAttendees]).toEqual([65, 55]);
  });

  it("الدفع يشترط القالب والمدعوين، ولا يتكرر", async () => {
    const o = await user();
    const s = Date.now() + 3 * DAY;
    const e = await createEvent(o.id, { title: "بلا قالب", orgName: "جهة", start: msToRiyadhLocal(s), end: msToRiyadhLocal(s + 3600_000), venue: "مكان", maxAttendees: 10, type: "private", fullPolicy: "close" });
    await expect(payPackage(o.id, e.id)).rejects.toMatchObject({ code: "blocked" });
    await addInvitations(o.id, e.id, guests(2));
    await expect(payPackage(o.id, e.id)).rejects.toMatchObject({ code: "blocked" });
    const paid = await event(o, { invites: guests(2) });
    await expect(payPackage(o.id, paid.id)).rejects.toMatchObject({ code: "paid" });
  });
});
