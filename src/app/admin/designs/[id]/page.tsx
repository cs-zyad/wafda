import { notFound } from "next/navigation";
import { getDesign, designMessages, DESIGN_AR } from "@/server/domain/designs";
import { getUser } from "@/server/domain/users";
import { ActionForm, Submit } from "@/ui/client";
import { Thread } from "@/ui/Thread";
import { TemplateFields } from "@/ui/TemplateFields";
import { Back, Ltr, Tag, Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";
import { sar } from "@/shared/money";
import { designAdminAction } from "../../actions";

export default async function AdminDesign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getDesign(id);
  if (!d) notFound();
  const [msgs, owner] = await Promise.all([designMessages(id), getUser(d.ownerId)]);
  const a = (op: "quote" | "reject" | "start" | "deliver" | "msg") => designAdminAction.bind(null, id, op);
  return (
    <div className="medium stack">
      <Back href="/admin/designs">طلبات التصميم</Back>
      <Title sub={<>{owner?.name} (<Ltr>{owner?.email}</Ltr>)</>} actions={<Tag tone="info">{DESIGN_AR[d.status]}</Tag>}>{d.title}</Title>
      <div className="card">
        <p style={{ whiteSpace: "pre-wrap" }}>{d.details}</p>
        {d.refUrl ? <a className="ltr small" href={d.refUrl} target="_blank" rel="noopener noreferrer">{d.refUrl}</a> : null}
        {d.quote ? <p className="small muted">آخر عرض: {sar(d.quote.amount)} · حتى {fmtShort(d.quote.until)}</p> : null}
      </div>
      {d.status === "review" || d.status === "quoted" ? (
        <div className="grid g2 top">
          <ActionForm action={a("quote")} className="card stack">
            <h3>عرض سعر</h3>
            <label className="field"><span>المبلغ (ر.س)</span><input type="number" name="amount" min={1} step="0.01" required /></label>
            <label className="field"><span>الصلاحية (أيام)</span><input type="number" name="days" min={1} max={60} defaultValue={7} required /></label>
            <label className="field"><span>ملاحظات</span><textarea name="notes" maxLength={1000} /></label>
            <Submit>إرسال العرض</Submit>
          </ActionForm>
          <ActionForm action={a("reject")} className="card stack" confirm="رفض الطلب؟">
            <h3>رفض</h3>
            <label className="field"><span>السبب</span><input name="reason" required maxLength={500} /></label>
            <Submit className="btn danger">رفض الطلب</Submit>
          </ActionForm>
        </div>
      ) : null}
      {d.status === "paid" ? <ActionForm action={a("start")}><Submit className="btn dark">بدء التنفيذ</Submit></ActionForm> : null}
      {d.status === "paid" || d.status === "working" ? (
        <ActionForm action={a("deliver")} className="card stack">
          <h3>التسليم كقالب خاص بهذا المنظّم</h3>
          <TemplateFields t={{ name: `${d.title} (خاص)`, category: "خاص" }} noVisibility />
          <Submit>تسليم القالب</Submit>
        </ActionForm>
      ) : null}
      <Thread items={msgs.map((m) => ({ id: m.id, mine: m.admin, who: m.admin ? `${m.byName} (المنصة)` : m.byName, body: m.body, at: m.at }))} action={a("msg")} />
    </div>
  );
}
