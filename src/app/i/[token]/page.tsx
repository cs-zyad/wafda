import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDoc } from "@/server/db";
import { invitationByToken } from "@/server/domain/invitations";
import { getEvent } from "@/server/domain/events";
import { templateOf } from "@/server/domain/templates";
import { eventView } from "@/server/domain/view";
import { closedReason, privateRegId, ticketsOfReg } from "@/server/domain/rsvp";
import type { Registration } from "@/server/types";
import { InvitationCard } from "@/ui/InvitationCard";
import { GuestPage, State, TicketLinks } from "@/ui/Guest";
import { RsvpForm, Decline } from "@/ui/GuestForms";
import { channelReady } from "@/server/providers/messaging";
import { rsvpAction, declineAction } from "@/app/guest-actions";
import { fmtDateTime } from "@/shared/time";
import { localPhone } from "@/shared/text";

export const metadata: Metadata = { title: "دعوة", robots: { index: false } };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await invitationByToken(token);
  if (!inv) notFound();
  const e = await getEvent(inv.eventId);
  if (!e) notFound();
  const [tpl, reg] = await Promise.all([templateOf(e.templateId), getDoc<Registration>("registrations", privateRegId(inv.id))]);
  const tickets = reg ? await ticketsOfReg(reg.id) : [];
  const closed = closedReason(e);
  const inside = tickets.some((t) => t.status === "active" && t.inAt);
  const rsvp = rsvpAction.bind(null, token);
  const decline = declineAction.bind(null, token);
  const d = { name: reg?.name || inv.name, phone: localPhone(reg?.contactType === "phone" ? reg.contact : inv.phone), email: reg?.contactType === "email" ? reg.contact : inv.email || "" };

  let body: React.ReactNode;
  if (reg?.status === "confirmed")
    body = (
      <>
        <State tone="ok" icon="✓" title={inside ? "تم تسجيل حضورك" : "تم تأكيد حضورك"}>
          <p style={{ margin: 0 }}>{reg.seats > 1 ? "حُجز مقعدان: لك ولمرافقك." : "حُجز مقعدك."} {inside ? "" : "الحضور الفعلي يُسجَّل عند الدخول بمسح رمز QR."}</p>
        </State>
        <TicketLinks list={tickets} />
        {!inside && !closed ? <Decline action={decline} /> : null}
      </>
    );
  else if (reg?.status === "cancelled") body = <State tone="bad" icon="!" title="ألغى المنظّم تسجيلك في هذه الفعالية" />;
  else if (closed) body = <State tone="bad" icon="!" title={closed} />;
  else if (reg?.status === "waitlisted")
    body = (
      <>
        <State tone="info" icon="⌛" title="أنت في قائمة الانتظار">
          <p style={{ margin: 0 }}>طلبت {reg.wantSeats > 1 ? "مقعدين" : "مقعدًا واحدًا"}. يصلك إشعار إن توفر مقعد.</p>
        </State>
        <Decline action={decline} label="الخروج من قائمة الانتظار" />
      </>
    );
  else if (reg?.status === "offered")
    body = (
      <>
        <State tone="warn" icon="★" title="توفر مقعد!">
          <p style={{ margin: 0 }}>الفرصة صالحة حتى {fmtDateTime(reg.offerUntil!)}. يُحجز المقعد عند تأكيدك إن كان لا يزال متاحًا.</p>
        </State>
        <RsvpForm action={rsvp} d={d} companion={inv.companion && reg.wantSeats > 1} wa={channelReady("whatsapp")} />
        <Decline action={decline} />
      </>
    );
  else
    body = (
      <>
        {reg?.status === "declined" ? <div className="alert info">سجّلت اعتذارك سابقًا؛ يمكنك التأكيد الآن إن توفر مقعد.</div> : null}
        {inv.companion ? <p className="small muted" style={{ margin: 0 }}>دعوتك تسمح بمرافق واحد.</p> : null}
        <RsvpForm action={rsvp} d={d} companion={inv.companion} wa={channelReady("whatsapp")} />
        {!reg ? <Decline action={decline} /> : null}
      </>
    );

  return (
    <GuestPage>
      <InvitationCard layout={tpl.layout} colors={tpl.colors} v={eventView(e, inv.name)} />
      <section className="card stack" style={{ marginTop: 16 }} aria-label="تأكيد الحضور">
        {body}
      </section>
    </GuestPage>
  );
}
