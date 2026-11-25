import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { available, eventBySlug } from "@/server/domain/events";
import { templateOf } from "@/server/domain/templates";
import { eventView } from "@/server/domain/view";
import { closedReason } from "@/server/domain/rsvp";
import { token } from "@/server/crypto";
import { InvitationCard } from "@/ui/InvitationCard";
import { GuestPage, State } from "@/ui/Guest";
import { RsvpForm } from "@/ui/GuestForms";
import { publicAction } from "@/app/guest-actions";

export const metadata: Metadata = { title: "التسجيل" };

export default async function PublicEvent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await eventBySlug(slug);
  if (!e || e.type !== "public" || e.paidPlaces <= 0) notFound();
  const tpl = await templateOf(e.templateId);
  const closed = closedReason(e);
  const left = available(e);
  return (
    <GuestPage>
      <InvitationCard layout={tpl.layout} colors={tpl.colors} v={eventView(e)} />
      <section className="card stack" style={{ marginTop: 16 }} aria-label="التسجيل">
        {closed ? (
          <State tone="bad" icon="!" title={closed} />
        ) : left <= 0 && e.fullPolicy === "close" ? (
          <State tone="bad" icon="!" title="اكتمل العدد">
            <p style={{ margin: 0 }}>نعتذر، لا توجد مقاعد متاحة لهذه الفعالية.</p>
          </State>
        ) : (
          <>
            {left <= 0 ? (
              <div className="alert warn"><b>اكتمل العدد.</b> انضم لقائمة الانتظار، ويصلك إشعار إن توفر مقعد.</div>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>سجّل لتصلك تذكرة QR على واتساب أو البريد.{left <= 10 ? <b> تبقّى {left} مقعد.</b> : null}</p>
            )}
            <RsvpForm action={publicAction.bind(null, slug)} d={{ name: "", phone: "", email: "" }} companion={false} label="سجّل حضورك" formKey={token(18)} waitOnly={left <= 0} />
          </>
        )}
      </section>
    </GuestPage>
  );
}
