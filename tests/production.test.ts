import { describe, it, expect, beforeAll } from "vitest";
import { payPackage, payTopup, getPayment, confirmManualPayment, rejectManualPayment, setPaymentContact } from "@/server/domain/payments";
import { getEvent } from "@/server/domain/events";
import { channelsFor } from "@/server/domain/invitations";
import { confirmInvitation, registerPublic } from "@/server/domain/rsvp";
import { estimate } from "@/server/domain/sending";
import { createUser } from "@/server/domain/users";
import { setMessageProvider, messageProvider, OffProvider, channelReady, emailHtml } from "@/server/providers/messaging";
import { ref } from "@/server/db";
import type { User } from "@/server/types";
import { reset, user, event, guests, invs, msgs, credit, uid, key } from "./helpers";

beforeAll(reset);

describe("الدفع اليدوي (تحويل بنكي يؤكده الأدمن)", () => {
  it("التأكيد يفعّل الباقة مرة واحدة مهما تكرر أو تزامن", async () => {
    const o = await user();
    const a = await user("admin", "أدمن الاختبار");
    const e = await event(o, { invites: guests(10), pay: false });
    const { payment } = await payPackage(o.id, e.id);
    const r = await Promise.all(Array.from({ length: 5 }, () => confirmManualPayment(a.id, payment.id)));
    expect(r.filter((x) => x === "applied")).toHaveLength(1);
    expect(await confirmManualPayment(a.id, payment.id)).toBe("already_paid");
    const ev = await getEvent(e.id);
    expect([ev!.paidPlaces, ev!.status]).toEqual([50, "active"]);
    expect((await getPayment(payment.id))!.status).toBe("paid");
  });

  it("شحن الرصيد يدويًا = قيد واحد، والإلغاء ثم التأكيد لاحقًا ممكن", async () => {
    const o = await user();
    const a = await user("admin", "أدمن الاختبار");
    const { payment } = await payTopup(o.id, 5000);
    await rejectManualPayment(a.id, payment.id);
    expect((await getPayment(payment.id))!.status).toBe("failed");
    await expect(rejectManualPayment(a.id, payment.id)).rejects.toThrow();
    expect(await confirmManualPayment(a.id, payment.id)).toBe("applied");
    expect(await credit(o)).toBe(5000);
  });

  it("رقم التواصل: من الحساب عند الإنشاء، ويُحدَّث من المنظّم نفسه فقط", async () => {
    const o = await createUser({ email: `o.${uid()}@wafda.test`, name: "منظّم بجوال", role: "organizer", password: "Wafda@2026", phone: "0551234567" });
    expect(o.phone).toBe("+966551234567");
    await expect(createUser({ email: `o.${uid()}@wafda.test`, name: "جوال خطأ", role: "organizer", password: "Wafda@2026", phone: "123" })).rejects.toThrow("رقم الجوال");
    const { payment } = await payTopup(o.id, 2000);
    expect(payment.contactPhone).toBe("+966551234567");
    const other = await user();
    await expect(setPaymentContact(other.id, payment.id, "0559999999")).rejects.toThrow();
    await setPaymentContact(o.id, payment.id, "0559999999");
    expect((await getPayment(payment.id))!.contactPhone).toBe("+966559999999");
    expect(((await ref("users", o.id).get()).data() as User).phone).toBe("+966559999999");
  });
});

describe("واتساب غير مفعّل (قبل ربط المزوّد)", () => {
  const withWaOff = async (fn: () => Promise<void>) => {
    const real = messageProvider("whatsapp");
    setMessageProvider(new OffProvider("whatsapp", "واتساب (غير مفعّل)"));
    try {
      await fn();
    } finally {
      setMessageProvider(real);
    }
  };

  it("لا يُرسل على واتساب ولا تُحسب تكلفته، والبريد يعمل", () =>
    withWaOff(async () => {
      expect(channelReady("whatsapp")).toBe(false);
      expect(channelsFor({ phone: "+966551234567", email: null, channel: null }, "both")).toEqual([]);
      expect(channelsFor({ phone: "+966551234567", email: "a@example.com", channel: null }, "both")).toEqual(["email"]);
      const o = await user();
      const e = await event(o, { invites: [{ name: "بجوال فقط", phone: "0551112222" }, { name: "ببريد", email: "b@example.com" }] });
      const est = await estimate(o.id, e.id, "invitation", "email");
      expect([est.messages, est.whatsapp, est.email]).toEqual([1, 0, 1]);
    }));

  it("الضيف يؤكد بالبريد فقط؛ ولا تُنشأ رسائل على القناة المعطلة", () =>
    withWaOff(async () => {
      const o = await user();
      const p = await event(o, { type: "public" });
      await expect(registerPublic(p.slug, key(), { name: "سارة", contactType: "phone", contact: "0551234567" })).rejects.toThrow("البريد");
      expect((await registerPublic(p.slug, key(), { name: "سارة", contactType: "email", contact: "sara@example.com" })).status).toBe("confirmed");
      const e = await event(o, { invites: guests(1) });
      const [i] = await invs(e.id);
      expect((await confirmInvitation(i.token, { name: i.name, contactType: "email", contact: "guest@example.com" })).status).toBe("confirmed");
      expect((await msgs(e.id, "confirmation")).map((m) => m.channel)).toEqual(["email"]);
    }));
});

describe("نص البريد", () => {
  it("يهرّب HTML ويجعل الروابط قابلة للضغط", () => {
    const h = emailHtml('أهلًا <b>x</b>\nhttps://wafda.vercel.app/t/abc?x=1&y=2');
    expect(h).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(h).toContain('<a href="https://wafda.vercel.app/t/abc?x=1&amp;y=2"');
    expect(h).toContain('dir="rtl"');
  });
});
