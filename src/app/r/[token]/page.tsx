import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEvent } from "@/server/domain/events";
import { templateOf } from "@/server/domain/templates";
import { eventView } from "@/server/domain/view";
import { closedReason, regByManageToken, ticketsOfReg } from "@/server/domain/rsvp";
import { InvitationCard } from "@/ui/InvitationCard";
import { GuestPage, State, TicketLinks } from "@/ui/Guest";
import { ConfirmAgain, Decline } from "@/ui/GuestForms";
import { manageConfirmAction, manageDeclineAction } from "@/app/guest-actions";
import { fmtDateTime } from "@/shared/time";

export const metadata: Metadata = { title: "تسجيلك", robots: { index: false } };

export default async function Manage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reg = await regByManageToken(token);
  if (!reg) notFound();
  const e = await getEvent(reg.eventId);
  if (!e) notFound();
  const [tpl, tickets] = await Promise.all([templateOf(e.templateId), ticketsOfReg(reg.id)]);
  const closed = closedReason(e);
  const inside = tickets.some((t) => t.status === "active" && t.inAt);
  const ok = manageConfirmAction.bind(null, token);
  const no = manageDeclineAction.bind(null, token);
  return (
    <GuestPage>
      <section className="card stack" aria-label="حالة التسجيل">
        <p className="small muted" style={{ margin: 0 }}>{reg.name} — {e.title}</p>
        {reg.status === "confirmed" ? (
          <>
            <State tone="ok" icon="✓" title={inside ? "تم تسجيل حضورك" : "تم تأكيد حضورك"}><p style={{ margin: 0 }}>مقعدك محجوز. اعرض رمز QR عند الدخول.</p></State>
            <TicketLinks list={tickets} />
            {!inside && !closed ? <Decline action={no} /> : null}
          </>
        ) : reg.status === "waitlisted" ? (
          <>
            <State tone="info" icon="⌛" title="أنت في قائمة الانتظار"><p style={{ margin: 0 }}>يصلك إشعار إن توفر مقعد.</p></State>
            <Decline action={no} label="الخروج من قائمة الانتظار" />
          </>
        ) : reg.status === "offered" ? (
          <>
            <State tone="warn" icon="★" title="توفر مقعد!"><p style={{ margin: 0 }}>الفرصة صالحة حتى {fmtDateTime(reg.offerUntil!)}. يُحجز المقعد عند تأكيدك إن كان لا يزال متاحًا.</p></State>
            {closed ? <div className="alert bad">{closed}</div> : <ConfirmAgain action={ok} />}
            <Decline action={no} />
          </>
        ) : reg.status === "cancelled" ? (
          <State tone="bad" icon="!" title="ألغى المنظّم تسجيلك في هذه الفعالية" />
        ) : (
          <>
            <State tone="info" icon="—" title="سجّلت اعتذارك" />
            {closed ? <div className="alert bad">{closed}</div> : <ConfirmAgain action={ok} label="أكّد حضورك من جديد" />}
          </>
        )}
      </section>
      <div style={{ marginTop: 16 }}>
        <InvitationCard layout={tpl.layout} colors={tpl.colors} v={eventView(e, reg.name)} />
      </div>
    </GuestPage>
  );
}
