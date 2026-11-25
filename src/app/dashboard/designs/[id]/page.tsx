import { notFound } from "next/navigation";
import { needOrganizer } from "@/server/session";
import { getDesign, designMessages, DESIGN_AR } from "@/server/domain/designs";
import { templateOf } from "@/server/domain/templates";
import { Do } from "@/ui/client";
import { Alert, Back, Tag, Title } from "@/ui/kit";
import { Thread } from "@/ui/Thread";
import { fmtShort, nowMs } from "@/shared/time";
import { sar } from "@/shared/money";
import { acceptQuoteAction, payDesignAction, cancelDesignAction, designMsgAction } from "../../actions";

export default async function Design({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await needOrganizer();
  const d = await getDesign(id);
  if (!d || d.ownerId !== u.id) notFound();
  const [msgs, tpl] = await Promise.all([designMessages(id), d.templateId ? templateOf(d.templateId) : null]);
  const expired = !!d.quote && d.quote.until < nowMs();
  return (
    <div className="medium stack">
      <Back href="/dashboard/designs">طلبات التصميم</Back>
      <Title actions={<Tag tone="info">{DESIGN_AR[d.status]}</Tag>}>{d.title}</Title>
      <div className="card"><p style={{ whiteSpace: "pre-wrap" }}>{d.details}</p>{d.refUrl ? <a className="ltr small" href={d.refUrl} target="_blank" rel="noopener noreferrer">{d.refUrl}</a> : null}</div>
      {d.quote ? (
        <div className="card stack">
          <h3>عرض السعر</h3>
          <p style={{ margin: 0 }}>المبلغ <b>{sar(d.quote.amount)}</b> · صالح حتى {fmtShort(d.quote.until)} {expired ? <Tag tone="bad">منتهي</Tag> : null}</p>
          {d.quote.notes ? <p className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{d.quote.notes}</p> : null}
          <div className="row">
            {d.status === "quoted" && !expired ? <Do action={acceptQuoteAction.bind(null, d.id)} className="btn go">قبول العرض</Do> : null}
            {d.status === "accepted" ? <Do action={payDesignAction.bind(null, d.id)} className="btn go">ادفع {sar(d.quote.amount)}</Do> : null}
          </div>
        </div>
      ) : null}
      {d.status === "rejected" ? <Alert tone="bad">رُفض الطلب: {d.rejectReason}</Alert> : null}
      {d.status === "delivered" ? <Alert tone="ok">تم التسليم: القالب «{tpl?.name}» متاح لك الآن عند اختيار قالب أي فعالية.</Alert> : null}
      {["review", "quoted", "accepted"].includes(d.status) ? <Do action={cancelDesignAction.bind(null, d.id)} confirm="إلغاء الطلب؟">إلغاء الطلب</Do> : null}
      <Thread items={msgs.map((m) => ({ id: m.id, mine: !m.admin, who: m.admin ? "فريق المنصة" : m.byName, body: m.body, at: m.at }))} action={designMsgAction.bind(null, d.id)} />
    </div>
  );
}
