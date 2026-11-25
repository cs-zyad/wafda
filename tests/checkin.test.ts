import { describe, it, expect, beforeAll } from "vitest";
import { confirmInvitation, declineInvitation, registerPublic } from "@/server/domain/rsvp";
import { scan, manualIn, findAttendee } from "@/server/domain/checkin";
import { addStaff } from "@/server/domain/staff";
import { getEvent } from "@/server/domain/events";
import { userByEmail, useSetupLink } from "@/server/domain/users";
import { where } from "@/server/db";
import type { Message } from "@/server/types";
import { reset, user, event, guests, invs, uid, key } from "./helpers";

beforeAll(reset);

async function setup() {
  const o = await user();
  const e = await event(o, { invites: guests(2, 1) });
  const l = await invs(e.id);
  const r = await confirmInvitation(l[0].token, { name: "محمد العتيبي", contactType: "phone", contact: "0551112233", withCompanion: true });
  if (r.status !== "confirmed") throw new Error();
  return { o, e, l, regId: r.regId, g: r.tickets[0].token, c: r.tickets[1].token };
}

describe("التحضير", () => {
  it("مسح صالح، ثم «حضر مسبقًا» بالوقت والطريقة، ثم المرافق يدويًا", async () => {
    const { o, e, g, regId } = await setup();
    expect(await scan(o, e.id, g)).toMatchObject({ result: "ok", label: "محمد العتيبي" });
    expect(await scan(o, e.id, `https://x.test/t/${g}`)).toMatchObject({ result: "already", method: "scan", by: o.name });
    expect(await manualIn(o, e.id, `${regId}_companion`)).toMatchObject({ result: "ok", label: "مرافق — محمد العتيبي" });
    expect(await manualIn(o, e.id, `${regId}_companion`)).toMatchObject({ result: "already", method: "manual" });
    const ev = await getEvent(e.id);
    expect([ev!.inGuests, ev!.inCompanions]).toEqual([1, 1]);
  });

  it("مسح متزامن من أجهزة متعددة + تحضير يدوي متزامن = حضور واحد", async () => {
    const { o, e, g, regId } = await setup();
    const r = await Promise.all([...Array.from({ length: 8 }, () => scan(o, e.id, g)), manualIn(o, e.id, `${regId}_guest`), manualIn(o, e.id, `${regId}_guest`)]);
    expect(r.filter((x) => x.result === "ok")).toHaveLength(1);
    expect(r.filter((x) => x.result === "already")).toHaveLength(9);
    expect((await getEvent(e.id))!.inGuests).toBe(1);
  });

  it("عضو غير معيّن ممنوع، والمعيّن (عبر رابط كلمة المرور لمرة واحدة) يعمل على فعاليته فقط", async () => {
    const { o, e, g } = await setup();
    const stranger = await user("staff", "غريب");
    await expect(scan(stranger, e.id, g)).rejects.toMatchObject({ code: "not_found" });
    await expect(findAttendee(stranger, e.id, "محمد")).rejects.toMatchObject({ code: "not_found" });
    const email = `st.${uid()}@wafda.test`;
    await addStaff(o.id, e.id, { name: "عضو استقبال", email });
    expect((await userByEmail(email))!.status).toBe("invited");
    const m = (await where<Message>("messages", "to", email))[0];
    expect(m.chargedTo).toBe("platform");
    const t = /set-password\/([\w-]+)/.exec(m.body)![1];
    await useSetupLink(t, "Wafda@2026");
    await expect(useSetupLink(t, "Wafda@2026")).rejects.toMatchObject({ code: "used_link" });
    const st = (await userByEmail(email))!;
    expect(await scan(st, e.id, g)).toMatchObject({ result: "ok" });
    const other = await event(o, { invites: guests(1) });
    await expect(scan(st, other.id, g)).rejects.toMatchObject({ code: "not_found" });
  });

  it("تذكرة فعالية أخرى لا تكشف بياناتها، والملغاة رسالة واضحة، والمجهولة مرفوضة", async () => {
    const a = await setup();
    const b = await setup();
    expect(await scan(a.o, a.e.id, b.g)).toEqual({ result: "wrong_event" });
    const pub = await event(a.o, { type: "public" });
    const r = await registerPublic(pub.slug, key(), { name: "سلمى", contactType: "email", contact: "salma@example.com" });
    if (r.status !== "confirmed") throw new Error();
    expect(await scan(a.o, a.e.id, r.tickets[0].token)).toEqual({ result: "wrong_event" });
    await declineInvitation(a.l[0].token);
    expect(await scan(a.o, a.e.id, a.g)).toMatchObject({ result: "cancelled", label: "محمد العتيبي" });
    expect(await scan(a.o, a.e.id, "zzzzzzzzzzzzzzzzzzzzzzzz")).toEqual({ result: "not_found" });
  });

  it("لا اعتذار بعد تسجيل الحضور", async () => {
    const { o, e, l, g } = await setup();
    await scan(o, e.id, g);
    await expect(declineInvitation(l[0].token)).rejects.toMatchObject({ code: "checked_in" });
  });

  it("البحث بالاسم وأي جزء من الجوال بأي صيغة — داخل الفعالية فقط", async () => {
    const a = await setup();
    const b = await setup();
    for (const q of ["محمد", "العتيبى", "0551112233", "+966 55 111", "1112233", "٠٥٥١١١"]) {
      const h = await findAttendee(a.o, a.e.id, q);
      expect(h, q).toHaveLength(1);
      expect(h[0].tickets.map((t) => t.label)).toEqual(["محمد العتيبي", "مرافق — محمد العتيبي"]);
    }
    expect(await findAttendee(a.o, a.e.id, "غير موجود")).toHaveLength(0);
    await expect(findAttendee(b.o, a.e.id, "محمد")).rejects.toMatchObject({ code: "not_found" });
  });
});
