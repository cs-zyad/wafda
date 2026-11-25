import { notFound } from "next/navigation";
import { needAdmin } from "@/server/session";
import { ticket, replies, SUPPORT_AR, KIND_AR } from "@/server/domain/support";
import { AppError } from "@/server/errors";
import { ActionForm, Submit } from "@/ui/client";
import { Back, Tag, Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";
import { supportAdminAction } from "../../actions";

export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await ticket(await needAdmin(), id).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const list = await replies(id);
  return (
    <div className="medium stack">
      <Back href="/admin/support">الدعم</Back>
      <Title sub={`${KIND_AR[t.kind]} · ${t.ownerName}`} actions={<Tag tone="info">{SUPPORT_AR[t.status]}</Tag>}>{t.subject}</Title>
      <div className="list">
        <div className="item"><div className="meta">{t.ownerName} · {fmtShort(t.createdAt)}</div><div style={{ whiteSpace: "pre-wrap" }}>{t.body}</div></div>
        {list.map((r) => <div key={r.id} className="item" style={{ background: r.admin ? "var(--lilac2)" : undefined }}><div className="meta">{r.byName}{r.admin ? " (المنصة)" : ""} · {fmtShort(r.at)}</div><div style={{ whiteSpace: "pre-wrap" }}>{r.body}</div></div>)}
      </div>
      <ActionForm action={supportAdminAction.bind(null, id)} className="card stack" reset>
        <label className="field"><span>الرد</span><textarea name="body" maxLength={4000} /></label>
        <label className="field"><span>الحالة</span><select name="status" defaultValue={t.status}>{Object.entries(SUPPORT_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <Submit>حفظ</Submit>
      </ActionForm>
    </div>
  );
}
