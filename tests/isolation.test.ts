import { describe, it, expect, beforeAll } from "vitest";
import { ownEvent, updateEvent, cancelEvent, chooseTemplate } from "@/server/domain/events";
import { addInvitations, editInvitation, deleteInvitation } from "@/server/domain/invitations";
import { send, estimate, scheduleReminder } from "@/server/domain/sending";
import { packageSummary, payPackage, payExtraPlaces, ownPayment } from "@/server/domain/payments";
import { confirmInvitation, cancelByOrganizer, resendTicket, sendOffer, waitlistOf } from "@/server/domain/rsvp";
import { addStaff, removeStaff } from "@/server/domain/staff";
import { scan, findAttendee } from "@/server/domain/checkin";
import { reset, user, event, guests, invs, uid, key } from "./helpers";

beforeAll(reset);

describe("عزل المنظّمين", () => {
  it("كل عمليات منظّم على فعالية منظّم آخر = غير موجودة", async () => {
    const a = await user("organizer", "منظّم أ");
    const b = await user("organizer", "منظّم ب");
    const e = await event(a, { invites: guests(2, 1) });
    const [i] = await invs(e.id);
    const r = await confirmInvitation(i.token, { name: "ضيف", contactType: "phone", contact: i.phone! });
    if (r.status !== "confirmed") throw new Error();
    const { payment } = await payExtraPlaces(a.id, e.id, 1);
    const ops: [string, () => Promise<unknown>][] = [
      ["ownEvent", () => ownEvent(b.id, e.id)],
      ["updateEvent", () => updateEvent(b.id, e.id, { title: "تسلل", orgName: "جهة", start: "2030-01-01T10:00", end: "2030-01-01T12:00", venue: "مكان", maxAttendees: 5, type: "private", fullPolicy: "close" })],
      ["cancelEvent", () => cancelEvent(b.id, e.id)],
      ["chooseTemplate", () => chooseTemplate(b.id, e.id, "tpl_plum_frame")],
      ["addInvitations", () => addInvitations(b.id, e.id, [{ name: "تسلل", phone: "0500000001" }])],
      ["editInvitation", () => editInvitation(b.id, i.id, { name: "تسلل", phone: "0500000001" })],
      ["deleteInvitation", () => deleteInvitation(b.id, i.id)],
      ["send", () => send({ ownerId: b.id, eventId: e.id, kind: "invitation", mode: "both", key: key() })],
      ["estimate", () => estimate(b.id, e.id, "invitation", "both")],
      ["scheduleReminder", () => scheduleReminder(b.id, e.id, Date.now() + 3600_000, "both")],
      ["packageSummary", () => packageSummary(b.id, e.id)],
      ["payPackage", () => payPackage(b.id, e.id)],
      ["payExtraPlaces", () => payExtraPlaces(b.id, e.id, 2)],
      ["ownPayment", () => ownPayment(b.id, payment.id)],
      ["cancelByOrganizer", () => cancelByOrganizer(b.id, r.regId)],
      ["resendTicket", () => resendTicket(b.id, r.regId)],
      ["sendOffer", () => sendOffer(b.id, r.regId, key())],
      ["waitlistOf", () => waitlistOf(b.id, e.id)],
      ["addStaff", () => addStaff(b.id, e.id, { name: "عضو", email: `x.${uid()}@wafda.test` })],
      ["removeStaff", () => removeStaff(b.id, e.id, b.id)],
      ["scan", () => scan(b, e.id, r.tickets[0].token)],
      ["findAttendee", () => findAttendee(b, e.id, "ضيف")],
    ];
    for (const [name, op] of ops) await expect(op(), name).rejects.toMatchObject({ code: "not_found" });
    await expect(ownEvent(a.id, e.id)).resolves.toMatchObject({ id: e.id });
  });
});
