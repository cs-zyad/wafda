import { describe, it, expect, beforeAll } from "vitest";
import { ref } from "@/server/db";
import { estimate, send, scheduleReminder, runReminders, type Reminder } from "@/server/domain/sending";
import { confirmInvitation, declineInvitation } from "@/server/domain/rsvp";
import { addInvitations } from "@/server/domain/invitations";
import { dispatchDue } from "@/server/domain/outbox";
import { saveSettings } from "@/server/domain/settings";
import { setMessageProvider, messageProvider } from "@/server/providers/messaging";
import { where } from "@/server/db";
import { reset, user, event, invs, msgs, topup, credit, key } from "./helpers";

beforeAll(reset);
const many = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ name: `ضيف ${i}`, phone: `05${prefix}${String(i + 1001).slice(-4)}` }));

describe("الإرسال ورصيد الرسائل", () => {
  it("الخصم حسب القناة، والضغط المتكرر لا يكرر الخصم ولا الرسائل", async () => {
    const o = await user();
    await topup(o, 20);
    const e = await event(o, { invites: [{ name: "الاثنان", phone: "0570000001", email: "both@example.com" }, { name: "واتساب", phone: "0570000002" }, { name: "بريد", email: "mail@example.com" }] });
    const est = await estimate(o.id, e.id, "invitation", "both");
    expect(est).toMatchObject({ messages: 4, whatsapp: 2, email: 2, cost: 60 });
    const k = key();
    const [a, b] = await Promise.all([send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "both", key: k }), send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "both", key: k })]);
    expect([a.status, b.status]).toEqual(["sent", "sent"]);
    expect(await send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "both", key: k })).toMatchObject({ again: true });
    expect(await credit(o)).toBe(2000 - 60);
    const m = await msgs(e.id, "invitation");
    expect(m).toHaveLength(4);
    expect(m.every((x) => x.status === "sent" && x.chargedTo === "credit")).toBe(true);
    expect((await invs(e.id)).every((i) => i.sendStatus === "sent")).toBe(true);
    const inbox = await where<{ body: string }>("devInbox", "eventId", e.id);
    expect(inbox).toHaveLength(4);
    expect(inbox[0].body).toContain("/i/");
  });

  it("الرصيد غير الكافي — المنع: لا يُرسل ولا يُخصم شيء", async () => {
    const o = await user();
    await topup(o, 10);
    const e = await event(o, { invites: many(50, "8000") });
    expect(await send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "whatsapp", key: key() })).toEqual({ status: "low_credit", needed: 1250, balance: 1000 });
    expect(await credit(o)).toBe(1000);
    expect(await msgs(e.id)).toHaveLength(0);
  });

  it("سياسة «إرسال ما يغطيه الرصيد» بترتيب القائمة", async () => {
    await saveSettings("test", { policy: { lowCredit: "partial" } });
    try {
      const o = await user();
      await topup(o, 10);
      const list = many(50, "8100");
      const e = await event(o, { invites: list });
      expect(await send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "whatsapp", key: key() })).toMatchObject({ status: "sent", messages: 40, skippedForCredit: 10, balance: 0 });
      expect((await invs(e.id)).filter((i) => i.sendStatus === "sent").map((i) => i.name)).toEqual(list.slice(0, 40).map((i) => i.name));
    } finally {
      await saveSettings("test", { policy: { lowCredit: "block" } });
    }
  });

  it("الفشل النهائي يسترجع القيمة، والمؤقت يُعاد حتى ينجح، و«تعذّر الإرسال» مستقل عن «لم يؤكد»", async () => {
    const o = await user();
    await topup(o, 10);
    const e = await event(o, { invites: [{ name: "يفشل", phone: "0590000000" }, { name: "متقطع", phone: "0590001111" }, { name: "بريد يفشل", email: "fail@example.com" }, { name: "سليم", phone: "0590002222" }] });
    await send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "both", key: key() });
    expect(await credit(o)).toBe(1000 - 80 + 30);
    expect((await msgs(e.id)).find((m) => m.to.endsWith("1111"))).toMatchObject({ status: "queued", attempts: 1 });
    await dispatchDue();
    const m = await msgs(e.id);
    expect(m.find((x) => x.to.endsWith("1111"))!.status).toBe("sent");
    expect(m.find((x) => x.to.endsWith("0000"))).toMatchObject({ status: "failed", refunded: true });
    const l = await invs(e.id);
    expect(l.find((i) => i.name === "يفشل")).toMatchObject({ sendStatus: "failed", regStatus: "none" });
    expect(l.find((i) => i.name === "متقطع")!.sendStatus).toBe("sent");
    await dispatchDue();
    expect(await credit(o)).toBe(950);
  });

  it("3 محاولات للفشل المؤقت ثم «فشلت» مع الاسترجاع", async () => {
    const real = messageProvider("whatsapp");
    setMessageProvider({ channel: "whatsapp", label: "x", mode: "mock", send: async () => ({ ok: false, error: "مؤقت" }) });
    try {
      const o = await user();
      await topup(o, 10);
      const e = await event(o, { invites: [{ name: "متعطل", phone: "0591234567" }] });
      await send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "whatsapp", key: key() });
      await dispatchDue();
      await dispatchDue();
      expect((await msgs(e.id))[0]).toMatchObject({ status: "failed", attempts: 3, refunded: true });
      expect(await credit(o)).toBe(1000);
    } finally {
      setMessageProvider(real);
    }
  });

  it("التذكير لمن وصلته الدعوة ولم يرد فقط", async () => {
    const o = await user();
    await topup(o, 10);
    const e = await event(o, { invites: [{ name: "لم يرد", phone: "0520000101" }, { name: "أكّد", phone: "0520000102" }, { name: "اعتذر", phone: "0520000103" }, { name: "فشل", phone: "0520000000" }] });
    await send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "whatsapp", key: key() });
    await addInvitations(o.id, e.id, [{ name: "لم تُرسل", phone: "0520000104" }]);
    const l = await invs(e.id);
    await confirmInvitation(l[1].token, { name: "أكّد", contactType: "phone", contact: l[1].phone! });
    await declineInvitation(l[2].token);
    expect((await estimate(o.id, e.id, "reminder", "whatsapp")).recipients).toBe(1);
    await send({ ownerId: o.id, eventId: e.id, kind: "reminder", mode: "whatsapp", key: key() });
    expect((await msgs(e.id, "reminder")).map((m) => m.to)).toEqual([l[0].phone]);
  });

  it("التذكير المجدول يفحص الحالة لحظة التنفيذ ولا يُنفّذ مرتين", async () => {
    const o = await user();
    await topup(o, 10);
    const e = await event(o, { invites: [{ name: "أول", phone: "0520000201" }, { name: "ثاني", phone: "0520000202" }] });
    await send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "whatsapp", key: key() });
    const r = await scheduleReminder(o.id, e.id, Date.now() + 120_000, "whatsapp");
    const l = await invs(e.id);
    await confirmInvitation(l[0].token, { name: "أول", contactType: "phone", contact: l[0].phone! });
    await ref("reminders", r.id).update({ runAt: Date.now() - 1 });
    const before = await credit(o);
    const [x, y] = await Promise.all([runReminders(), runReminders()]);
    expect(x.length + y.length).toBe(1);
    expect(((await ref("reminders", r.id).get()).data() as Reminder).status).toBe("done");
    expect((await msgs(e.id, "reminder")).map((m) => m.to)).toEqual([l[1].phone]);
    await ref("reminders", r.id).update({ status: "running", lease: Date.now() - 1 });
    await runReminders();
    expect(await credit(o)).toBe(before - 25);
    expect(await msgs(e.id, "reminder")).toHaveLength(1);
  });

  it("التذكير المجدول يفشل بسبب الرصيد دون إرسال جزئي", async () => {
    const o = await user();
    await topup(o, 10);
    const e = await event(o, { invites: many(30, "8300") });
    await send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "whatsapp", key: key() });
    const r = await scheduleReminder(o.id, e.id, Date.now() + 120_000, "whatsapp");
    await ref("reminders", r.id).update({ runAt: Date.now() - 1 });
    await runReminders();
    const rem = (await ref("reminders", r.id).get()).data() as Reminder;
    expect(rem.status).toBe("failed");
    expect(rem.result).toContain("رصيد");
    expect(await msgs(e.id, "reminder")).toHaveLength(0);
    expect(await credit(o)).toBe(250);
  });

  it("مدعوون يتجاوزون الباقة يمنعون أي إرسال", async () => {
    const o = await user();
    await topup(o, 10);
    const e = await event(o, { invites: Array.from({ length: 50 }, (_, i) => ({ name: `ض${i}`, email: `g${i}@example.com` })) });
    await addInvitations(o.id, e.id, [{ name: "زائد", email: "extra@example.com", companion: true }]);
    await expect(send({ ownerId: o.id, eventId: e.id, kind: "invitation", mode: "email", key: key() })).rejects.toMatchObject({ code: "over_package" });
  });
});
