import { describe, it, expect, beforeAll } from "vitest";
import { confirmInvitation, registerPublic, declineInvitation, declineByManage, confirmByManage } from "@/server/domain/rsvp";
import { packageSummary } from "@/server/domain/payments";
import { reset, user, event, guests, invs, regs, tickets, msgs, reserved, setMax, key } from "./helpers";

beforeAll(reset);
const person = (i: number) => ({ name: `زائر ${i}`, contactType: "phone", contact: `05${40000001 + i}` });

describe("السعة والتزامن", () => {
  it("20 تسجيلًا متزامنًا على 5 مقاعد = 5 بالضبط", async () => {
    const o = await user();
    const e = await event(o, { type: "public", max: 5 });
    const r = await Promise.all(Array.from({ length: 20 }, (_, i) => registerPublic(e.slug, key(), person(i))));
    expect(r.filter((x) => x.status === "confirmed")).toHaveLength(5);
    expect(r.filter((x) => x.status === "full")).toHaveLength(15);
    expect(await reserved(e.id)).toBe(5);
    expect((await tickets(e.id)).filter((t) => t.status === "active")).toHaveLength(5);
  });

  it("في العامة السعة لا تتجاوز الأماكن المدفوعة حتى لو رُفع الحد الأقصى", async () => {
    const o = await user();
    const e = await event(o, { type: "public", max: 50 });
    expect(e.paidPlaces).toBe(50);
    await setMax(e.id, 90);
    const r = await Promise.all(Array.from({ length: 56 }, (_, i) => registerPublic(e.slug, key(), person(100 + i))));
    expect(r.filter((x) => x.status === "confirmed")).toHaveLength(50);
    expect(await reserved(e.id)).toBe(50);
  }, 300_000);

  it("سياسة الانتظار والإغلاق", async () => {
    const o = await user();
    const w = await event(o, { type: "public", policy: "waitlist" });
    await setMax(w.id, 4);
    const r = await Promise.all(Array.from({ length: 9 }, (_, i) => registerPublic(w.slug, key(), person(200 + i), { waitlist: true })));
    expect(r.filter((x) => x.status === "confirmed")).toHaveLength(4);
    expect(r.filter((x) => x.status === "waitlisted")).toHaveLength(5);
    expect(await registerPublic(w.slug, key(), person(300))).toEqual({ status: "full", canWaitlist: true });
    const c = await event(o, { type: "public", policy: "close" });
    await setMax(c.id, 1);
    await registerPublic(c.slug, key(), person(301));
    expect(await registerPublic(c.slug, key(), person(302), { waitlist: true })).toEqual({ status: "full", canWaitlist: false });
  });

  it("مفتاح النموذج المكرر يعيد نفس التسجيل دون تكرار", async () => {
    const o = await user();
    const e = await event(o, { type: "public" });
    const k = key();
    const r = await Promise.all(Array.from({ length: 6 }, () => registerPublic(e.slug, k, person(400))));
    expect(new Set(r.map((x) => (x.status === "confirmed" ? x.regId : "?"))).size).toBe(1);
    expect(await reserved(e.id)).toBe(1);
    expect(await tickets(e.id)).toHaveLength(1);
    expect(await msgs(e.id, "confirmation")).toHaveLength(1);
  });

  it("نفس الرقم بصيغة مختلفة لا يكرر ولا يكشف التذكرة، ويعيد الإرسال لصاحبه مرة ضمن المدة", async () => {
    const o = await user();
    const e = await event(o, { type: "public" });
    expect((await registerPublic(e.slug, key(), { name: "سارة", contactType: "phone", contact: "0551234567" })).status).toBe("confirmed");
    const dup = await registerPublic(e.slug, key(), { name: "غيرها", contactType: "phone", contact: "+966 55 123 4567" });
    expect(dup).toEqual({ status: "duplicate", resent: true });
    expect(JSON.stringify(dup)).not.toMatch(/token/i);
    expect(await registerPublic(e.slug, key(), { name: "ثالث", contactType: "phone", contact: "٠٥٥١٢٣٤٥٦٧" })).toEqual({ status: "duplicate", resent: false });
    expect(await reserved(e.id)).toBe(1);
    const re = await msgs(e.id, "ticket_resend");
    expect(re).toHaveLength(1);
    expect(re[0]).toMatchObject({ to: "+966551234567", chargedTo: "package", cost: 0 });
  });
});

describe("الدعوات الخاصة والمرافق", () => {
  it("تأكيدات متزامنة لنفس الدعوة لا تكرر الحجز ولا التذاكر ولا رسالة التأكيد", async () => {
    const o = await user();
    const e = await event(o, { invites: guests(2, 1) });
    const [i] = await invs(e.id);
    const r = await Promise.all(Array.from({ length: 10 }, () => confirmInvitation(i.token, { name: i.name, contactType: "phone", contact: i.phone!, withCompanion: true })));
    expect(r.every((x) => x.status === "confirmed")).toBe(true);
    expect(await reserved(e.id)).toBe(2);
    expect(await tickets(e.id)).toHaveLength(2);
    const conf = await msgs(e.id, "confirmation");
    expect(conf).toHaveLength(1);
    expect(conf[0]).toMatchObject({ chargedTo: "package", cost: 0 });
    expect(conf[0].opCost).toBeGreaterThan(0);
  });

  it("رمزا المدعو والمرافق مستقلان، والمرافق باسم «مرافق» مرتبط بالمدعو", async () => {
    const o = await user();
    const e = await event(o, { invites: guests(1, 1) });
    const [i] = await invs(e.id);
    const r = await confirmInvitation(i.token, { name: "نورة", contactType: "email", contact: "noura@example.com", withCompanion: true });
    if (r.status !== "confirmed") throw new Error();
    expect(r.tickets.map((t) => t.kind)).toEqual(["guest", "companion"]);
    expect(r.tickets[0].token).not.toBe(r.tickets[1].token);
    expect(Buffer.from(r.tickets[0].token, "base64url")).toHaveLength(20);
    expect((await tickets(e.id)).every((t) => t.guestName === "نورة")).toBe(true);
  });

  it("مدعوون مختلفون مع مرافقين متزامنين لا يتجاوزون السعة", async () => {
    const o = await user();
    const e = await event(o, { invites: guests(12, 1) });
    await setMax(e.id, 7);
    const list = await invs(e.id);
    const r = await Promise.all(list.map((i) => confirmInvitation(i.token, { name: i.name, contactType: "phone", contact: i.phone!, withCompanion: true }, { single: true })));
    const seats = r.reduce((n, x) => n + (x.status === "confirmed" ? x.seats : 0), 0);
    expect(seats).toBe(7);
    expect(await reserved(e.id)).toBe(7);
    expect((await regs(e.id)).filter((x) => x.status === "confirmed").reduce((n, x) => n + x.seats, 0)).toBe(7);
  });

  it("مقعد واحد متبقٍ وطلب مرافق: تنبيه، التأكيد منفردًا، أو الانتظار بمقعدين", async () => {
    const o = await user();
    const e = await event(o, { invites: guests(4, 1), policy: "waitlist" });
    await setMax(e.id, 3);
    const l = await invs(e.id);
    const go = (i: number, c = {}) => confirmInvitation(l[i].token, { name: l[i].name, contactType: "phone", contact: l[i].phone!, withCompanion: true }, c);
    await go(0);
    expect(await go(1)).toEqual({ status: "one_left", canWaitlist: true });
    expect(await go(2, { waitlist: true })).toMatchObject({ status: "waitlisted", wantSeats: 2 });
    expect(await go(1, { single: true })).toMatchObject({ status: "confirmed", seats: 1 });
    expect(await reserved(e.id)).toBe(3);
    expect((await invs(e.id))[2].regStatus).toBe("waitlisted");
  });

  it("الاعتذار يحرر المقاعد وتكراره آمن، والمعتذر يعود إن توفر مقعد", async () => {
    const o = await user();
    const e = await event(o, { invites: guests(2, 1) });
    await setMax(e.id, 2);
    const l = await invs(e.id);
    await confirmInvitation(l[0].token, { name: "أحمد", contactType: "phone", contact: l[0].phone!, withCompanion: true });
    const d = await Promise.all([1, 2, 3].map(() => declineInvitation(l[0].token)));
    expect(d.filter((x) => x.changed)).toHaveLength(1);
    expect(await reserved(e.id)).toBe(0);
    expect((await tickets(e.id)).every((t) => t.status === "cancelled")).toBe(true);
    await confirmInvitation(l[1].token, { name: "بدر", contactType: "phone", contact: l[1].phone! });
    expect(await confirmInvitation(l[0].token, { name: "أحمد", contactType: "phone", contact: l[0].phone!, withCompanion: true })).toEqual({ status: "one_left", canWaitlist: false });
    expect(await confirmInvitation(l[0].token, { name: "أحمد", contactType: "phone", contact: l[0].phone!, withCompanion: true }, { single: true })).toMatchObject({ status: "confirmed", seats: 1 });
    expect(await reserved(e.id)).toBe(2);
    expect((await tickets(e.id)).filter((t) => t.status === "active")).toHaveLength(2);
  });

  it("الاعتذار قبل التأكيد = «اعتذر»، والعام يعتذر ويعود من صفحة الإدارة", async () => {
    const o = await user();
    const e = await event(o, { invites: guests(1) });
    await declineInvitation((await invs(e.id))[0].token);
    expect((await invs(e.id))[0].regStatus).toBe("declined");
    const p = await event(o, { type: "public" });
    const r = await registerPublic(p.slug, key(), person(500));
    if (r.status !== "confirmed") throw new Error();
    await declineByManage(r.manageToken);
    expect(await reserved(p.id)).toBe(0);
    expect((await confirmByManage(r.manageToken)).status).toBe("confirmed");
    expect(await reserved(p.id)).toBe(1);
  });

  it("حساب الباقة: 40 دعوة منها 10 بمرافق = 50 مكانًا، والتسجيل مغلق قبل الدفع", async () => {
    const o = await user();
    const e = await event(o, { invites: guests(40, 4), pay: false });
    const s = await packageSummary(o.id, e.id);
    expect(s).toMatchObject({ invitations: 40, withCompanion: 10, needed: 50 });
    expect(s.quote).toMatchObject({ places: 50, price: 9900 });
    const [i] = await invs(e.id);
    expect((await confirmInvitation(i.token, { name: "أحمد", contactType: "phone", contact: i.phone! })).status).toBe("closed");
  });
});
