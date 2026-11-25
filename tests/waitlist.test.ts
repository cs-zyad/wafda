import { describe, it, expect, beforeAll } from "vitest";
import { ref } from "@/server/db";
import { confirmInvitation, declineInvitation, declineByManage, registerPublic, confirmByManage, sendOffer, expireOffers } from "@/server/domain/rsvp";
import type { Registration } from "@/server/types";
import { reset, user, event, guests, invs, reserved, setMax, topup, credit, key } from "./helpers";

beforeAll(reset);
const status = async (id: string) => ((await ref("registrations", id).get()).data() as Registration).status;

describe("قائمة الانتظار", () => {
  it("فرصة بلا مقعد ممنوعة، والفرصة لا تحجز، وتُخصم من الرصيد مرة واحدة، والتأكيد يحجز", async () => {
    const o = await user();
    await topup(o, 10);
    const e = await event(o, { invites: guests(2), policy: "waitlist" });
    await setMax(e.id, 1);
    const l = await invs(e.id);
    const c = (i: number, x = {}) => confirmInvitation(l[i].token, { name: l[i].name, contactType: "phone", contact: l[i].phone! }, x);
    await c(0);
    const w = await c(1, { waitlist: true });
    if (w.status !== "waitlisted") throw new Error();
    await expect(sendOffer(o.id, w.regId, key())).rejects.toMatchObject({ code: "no_seat" });
    await declineInvitation(l[0].token);
    const k = key();
    expect((await sendOffer(o.id, w.regId, k)).again).toBe(false);
    expect((await sendOffer(o.id, w.regId, k)).again).toBe(true);
    expect(await credit(o)).toBe(1000 - 25);
    expect(await reserved(e.id)).toBe(0);
    expect((await invs(e.id))[1].regStatus).toBe("offered");
    expect((await c(1)).status).toBe("confirmed");
    expect(await reserved(e.id)).toBe(1);
  });

  it("أخذ المقعد قبل تأكيد صاحب الفرصة يعيده للانتظار", async () => {
    const o = await user();
    await topup(o, 10);
    const e = await event(o, { type: "public", policy: "waitlist" });
    await setMax(e.id, 1);
    const p = (n: string, ph: string, x = {}) => registerPublic(e.slug, key(), { name: n, contactType: "phone", contact: ph }, x);
    const a = await p("أحمد", "0561000001");
    const b = await p("بدر", "0561000002", { waitlist: true });
    const c = await p("جود", "0561000003", { waitlist: true });
    if (a.status !== "confirmed" || b.status !== "waitlisted" || c.status !== "waitlisted") throw new Error();
    await declineByManage(a.manageToken);
    await sendOffer(o.id, b.regId, key());
    await sendOffer(o.id, c.regId, key());
    expect((await confirmByManage(c.manageToken)).status).toBe("confirmed");
    expect((await confirmByManage(b.manageToken)).status).toBe("offer_lost");
    expect(await status(b.regId)).toBe("waitlisted");
    expect(await reserved(e.id)).toBe(1);
  });

  it("الفرصة المنتهية تعود للانتظار تلقائيًا، وتأكيدها بعد الانتهاء مرفوض", async () => {
    const o = await user();
    await topup(o, 10);
    const e = await event(o, { invites: guests(3), policy: "waitlist" });
    await setMax(e.id, 1);
    const l = await invs(e.id);
    const c = (i: number, x = {}) => confirmInvitation(l[i].token, { name: l[i].name, contactType: "phone", contact: l[i].phone! }, x);
    await c(0);
    const w1 = await c(1, { waitlist: true });
    const w2 = await c(2, { waitlist: true });
    if (w1.status !== "waitlisted" || w2.status !== "waitlisted") throw new Error();
    await declineInvitation(l[0].token);
    await sendOffer(o.id, w1.regId, key());
    await sendOffer(o.id, w2.regId, key());
    for (const id of [w1.regId, w2.regId]) await ref("registrations", id).update({ offerUntil: Date.now() - 1 });
    expect((await c(2)).status).toBe("offer_expired");
    expect(await expireOffers()).toBe(1);
    expect([await status(w1.regId), await status(w2.regId)]).toEqual(["waitlisted", "waitlisted"]);
    expect((await invs(e.id))[1].regStatus).toBe("waitlisted");
  });

  it("الرصيد غير الكافي يمنع الفرصة", async () => {
    const o = await user();
    const e = await event(o, { invites: guests(2), policy: "waitlist" });
    await setMax(e.id, 1);
    const l = await invs(e.id);
    await confirmInvitation(l[0].token, { name: "أحمد", contactType: "phone", contact: l[0].phone! });
    const w = await confirmInvitation(l[1].token, { name: "بدر", contactType: "phone", contact: l[1].phone! }, { waitlist: true });
    if (w.status !== "waitlisted") throw new Error();
    await declineInvitation(l[0].token);
    await expect(sendOffer(o.id, w.regId, key())).rejects.toMatchObject({ code: "low_credit" });
  });
});
