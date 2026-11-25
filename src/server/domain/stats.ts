import { where } from "../db";
import type { EventDoc, Invitation, Registration, Ticket } from "../types";
import { available, capacity, invitationsOf, registrationsOf } from "./events";
import { csvCell } from "@/shared/text";
import { fmtShort } from "@/shared/time";

export function numbers(e: EventDoc, invs: Invitation[], regs: Registration[]) {
  const ok = regs.filter((r) => r.status === "confirmed");
  return {
    invitations: invs.length,
    invitedPeople: invs.reduce((n, i) => n + (i.companion ? 2 : 1), 0),
    noReply: invs.filter((i) => i.regStatus === "none").length,
    confirmedRegs: ok.length,
    confirmedPeople: ok.reduce((n, r) => n + r.seats, 0),
    inGuests: e.inGuests,
    inCompanions: e.inCompanions,
    capacity: capacity(e),
    free: available(e),
    failed: invs.filter((i) => i.sendStatus === "failed").length,
    notSent: invs.filter((i) => i.sendStatus === "not_sent").length,
    waiting: regs.filter((r) => r.status === "waitlisted" || r.status === "offered").length,
    declined: regs.filter((r) => r.status === "declined").length,
    cancelled: regs.filter((r) => r.status === "cancelled").length,
    registrations: regs.length,
  };
}

export async function eventData(e: EventDoc) {
  const [invs, regs, tickets] = await Promise.all([e.type === "private" ? invitationsOf(e.id) : [], registrationsOf(e.id), where<Ticket>("tickets", "eventId", e.id)]);
  return { invs, regs, tickets, n: numbers(e, invs, regs) };
}

const REG: Record<string, string> = { none: "لم يؤكد", confirmed: "مؤكد", declined: "اعتذر", waitlisted: "في الانتظار", offered: "وصلته فرصة", cancelled: "أُلغي" };
const SEND: Record<string, string> = { not_sent: "لم تُرسل", sending: "قيد الإرسال", sent: "أُرسلت", failed: "تعذّر الإرسال" };

/** كشف الحضور CSV: صف لكل شخص (الضيف والمرافق) مع منع حقن الصيغ */
export async function attendanceCsv(e: EventDoc) {
  const { invs, regs, tickets } = await eventData(e);
  const byReg = Object.groupBy(tickets, (t) => t.registrationId);
  const regOf = new Map(regs.map((r) => [r.id, r]));
  const rows: string[][] = [["النوع", "الاسم", "صاحب الدعوة", "الجوال", "البريد", "حالة الإرسال", "حالة التأكيد", "الحضور", "وقت الدخول", "طريقة الدخول", "سجّله"]];
  const people = (name: string, phone: string, email: string, send: string, reg: string, ts: Ticket[], companionAllowed: boolean) => {
    const g = ts.find((t) => t.kind === "guest" && t.status === "active");
    const c = ts.find((t) => t.kind === "companion" && t.status === "active");
    const cells = (t?: Ticket) => [t?.inAt ? "حضر" : "لم يحضر", t?.inAt ? fmtShort(t.inAt) : "", t?.inMethod === "manual" ? "يدوي" : t?.inMethod === "scan" ? "مسح" : "", t?.inByName ?? ""];
    rows.push(["ضيف", name, name, phone, email, send, reg, ...cells(g)]);
    if (c || companionAllowed) rows.push(["مرافق", "مرافق", name, "", "", "", c ? "مؤكد" : reg === "مؤكد" ? "بدون مرافق" : reg, ...cells(c)]);
  };
  if (e.type === "private")
    for (const i of invs) {
      const r = regOf.get(`inv_${i.id}`);
      people(r?.name || i.name, r?.contactType === "phone" ? r.contact : i.phone || "", r?.contactType === "email" ? r.contact : i.email || "", SEND[i.sendStatus], REG[i.regStatus], r ? byReg[r.id] ?? [] : [], i.companion);
    }
  else for (const r of regs) people(r.name, r.contactType === "phone" ? r.contact : "", r.contactType === "email" ? r.contact : "", "—", REG[r.status], byReg[r.id] ?? [], false);
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
