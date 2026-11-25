import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ticketByToken, holderLabel } from "@/server/domain/checkin";
import { getEvent } from "@/server/domain/events";
import { eventView, link } from "@/server/domain/view";
import { qrSvg } from "@/server/qr";
import { GuestPage } from "@/ui/Guest";
import { Share } from "@/ui/client";
import { Tag } from "@/ui/kit";
import { fmtShort } from "@/shared/time";

export const metadata: Metadata = { title: "التذكرة", robots: { index: false } };

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await ticketByToken(token);
  if (!t) notFound();
  const e = await getEvent(t.eventId);
  if (!e) notFound();
  const v = eventView(e);
  const url = link.ticket(t.token);
  const svg = t.status === "active" ? await qrSvg(url) : null;
  return (
    <GuestPage>
      <article className="ticket" aria-label="تذكرة الدخول">
        <header>
          <div className="small" style={{ opacity: 0.8 }}>{v.org}</div>
          <h1>{v.title}</h1>
        </header>
        <div className="stack" style={{ padding: 18 }}>
          <div className="row between">
            <div>
              <div className="tiny muted">{t.kind === "companion" ? "تذكرة مرافق" : "صاحب التذكرة"}</div>
              <div style={{ fontFamily: "var(--f-head)", fontSize: "1.25rem" }}>{holderLabel(t)}</div>
            </div>
            {t.status !== "active" ? <Tag tone="bad">تذكرة ملغاة</Tag> : t.inAt ? <Tag tone="plum">دخل {fmtShort(t.inAt)}</Tag> : <Tag tone="ok">صالحة — مقعد محجوز</Tag>}
          </div>
          {svg ? <div className="qr" role="img" aria-label="رمز QR للدخول" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="alert bad">هذه التذكرة ملغاة ولا تصلح للدخول.</div>}
          {svg ? <p className="center small muted" style={{ margin: 0 }}>اعرض الرمز على فريق الاستقبال. رفع إضاءة الشاشة يسرّع المسح.</p> : null}
          <dl className="kv small">
            <dt>الموعد</dt>
            <dd>{v.when}</dd>
            <dt>المكان</dt>
            <dd>{v.place || "—"}{v.mapUrl ? <> — <a href={v.mapUrl} target="_blank" rel="noopener noreferrer">الخريطة</a></> : null}</dd>
          </dl>
          {t.kind === "companion" && t.status === "active" ? <Share url={url} title={`تذكرة مرافق — ${v.title}`} text={`تذكرتك لحضور «${v.title}» مرافقًا لـ ${t.guestName}`} /> : null}
          <p className="tiny muted center" style={{ margin: 0 }}>كل رمز لشخص واحد ويُستخدم للدخول مرة واحدة.</p>
        </div>
      </article>
    </GuestPage>
  );
}
