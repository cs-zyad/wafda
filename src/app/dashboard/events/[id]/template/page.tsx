import { owned } from "@/server/owned";
import { templateOf, templatesFor } from "@/server/domain/templates";
import { invitationsOf } from "@/server/domain/events";
import { eventView, link } from "@/server/domain/view";
import { eventVars, render } from "@/server/domain/texts";
import { InvitationCard } from "@/ui/InvitationCard";
import { Do } from "@/ui/client";
import { Alert, Tag } from "@/ui/kit";
import { templateAction } from "../../../actions";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, e } = await owned((await params).id);
  const [list, cur, invs] = await Promise.all([templatesFor(user.id), templateOf(e.templateId), e.type === "private" ? invitationsOf(e.id) : []]);
  const sample = invs[0];
  const guest = e.type === "private" ? sample?.name ?? "اسم المدعو" : "";
  const v = eventView(e, guest);
  const ev = eventVars(v);
  const inv = sample ? link.invitation(sample.token) : link.invitation("…");
  const wa = render("invitation", { ...ev, guest_name: guest || "اسم المدعو", companion_line: sample?.companion ? "الدعوة تشمل مرافقًا واحدًا.\n" : "", invitation_link: inv }, "whatsapp");
  const mail = render("invitation", { ...ev, guest_name: guest || "اسم المدعو", companion_line: "", invitation_link: inv }, "email");
  const conf = render("confirmation", { ...ev, guest_name: guest || "اسم الضيف", ticket_link: link.ticket("…"), companion_line: `تذكرة مرافقك (شاركها معه):\n${link.ticket("…")}\n`, manage_link: e.type === "private" ? inv : link.manage("…") }, "whatsapp");
  return (
    <div className="stack-lg">
      <section className="stack">
        <h2 style={{ margin: 0 }}>اختر القالب</h2>
        <p className="small muted">التصميم ثابت؛ تعبّئ البيانات فقط. للتصميم الخاص: «طلبات التصميم»، ويظهر هنا بعد التسليم.</p>
        <div className="grid g3">
          {list.map((t) => (
            <div key={t.id} className="card stack" style={{ padding: 12, outline: e.templateId === t.id ? "2px solid var(--plum)" : undefined }}>
              <div style={{ height: 250, overflow: "hidden", borderRadius: 16, pointerEvents: "none" }} aria-hidden="true">
                <div style={{ transform: "scale(.62)", transformOrigin: "top center", width: "161%", marginInlineStart: "-30.5%" }}>
                  <InvitationCard layout={t.layout} colors={t.colors} v={v} />
                </div>
              </div>
              <div className="row between">
                <span><b>{t.name}</b> <span className="tiny muted">{t.category}</span> {t.ownerId ? <Tag tone="plum">خاص بك</Tag> : null}</span>
                {e.templateId === t.id ? <Tag tone="ok">المختار</Tag> : <Do action={templateAction.bind(null, e.id, t.id)} className="btn sm go">اختيار</Do>}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="stack">
        <h2 style={{ margin: 0 }}>المعاينة قبل الدفع والإرسال</h2>
        {!e.templateId ? <Alert tone="warn">لم تختر قالبًا بعد؛ المعاينة بالقالب الافتراضي.</Alert> : null}
        <div className="grid g2 top">
          <div className="stack">
            <h3>صفحة الدعوة كما يراها الضيف</h3>
            <InvitationCard layout={cur.layout} colors={cur.colors} v={v}>
              <div className="card small" style={{ color: "var(--plum)" }}><b>نموذج التأكيد:</b> الاسم + واتساب أو البريد{sample?.companion ? " + «معي مرافق»" : ""} ثم «{e.type === "private" ? "أكّد حضورك" : "سجّل حضورك"}».</div>
            </InvitationCard>
          </div>
          <div className="stack">
            {e.type === "private" ? (
              <>
                <h3>رسالة واتساب</h3><pre className="bubble">{wa.body}</pre>
                <h3>رسالة البريد</h3><div className="bubble mail"><b>{mail.subject}</b>{"\n\n"}{mail.body}</div>
              </>
            ) : <Alert>في الرابط العام لا تُرسل دعوات؛ تشارك الرابط بنفسك بعد الدفع.</Alert>}
            <h3>رسالة تأكيد الحضور مع التذكرة</h3><pre className="bubble">{conf.body}</pre>
            <p className="tiny muted">النصوص قوالب بمتغيرات جاهزة لقوالب واتساب المعتمدة ({wa.template}، {conf.template}).</p>
          </div>
        </div>
      </section>
    </div>
  );
}
