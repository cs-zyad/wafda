import Link from "next/link";
import { notFound } from "next/navigation";
import { demo, me } from "@/server/session";
import { getPayment } from "@/server/domain/payments";
import { Do } from "@/ui/client";
import { PublicBar } from "@/ui/Shell";
import { Alert, Tag } from "@/ui/kit";
import { sar } from "@/shared/money";
import { mockPayAction } from "../../actions";

export const metadata = { title: "دفع تجريبي" };
export default async function Checkout({ params }: { params: Promise<{ id: string }> }) {
  if (!demo()) notFound();
  const [u, p] = await Promise.all([me(), getPayment((await params).id)]);
  if (!u || !p || (p.ownerId !== u.id && u.role !== "admin")) notFound();
  const back = p.eventId ? `/dashboard/events/${p.eventId}/payment` : p.designId ? `/dashboard/designs/${p.designId}` : "/dashboard/credit";
  return (
    <>
      <PublicBar />
      <main className="wrap page"><div className="narrow stack">
        <Alert tone="warn">صفحة دفع تجريبية (محاكاة مزوّد). تُعطَّل بـ DEMO_MODE=false ويحل محلها مزوّد فعلي.</Alert>
        <div className="card stack">
          <h1 style={{ fontSize: "1.3rem" }}>{p.description}</h1>
          <div className="row between"><span className="muted">المبلغ</span><b className="num" style={{ fontSize: "1.6rem" }}>{sar(p.amount)}</b></div>
          <div className="row between"><span className="muted">الحالة</span>{p.status === "paid" ? <Tag tone="ok">مدفوع</Tag> : p.status === "failed" ? <Tag tone="bad">فشل</Tag> : <Tag tone="warn">بانتظار الدفع</Tag>}</div>
          <Do action={mockPayAction.bind(null, p.id, "pay")} className="btn go lg full" disabled={p.status === "paid"}>{p.status === "paid" ? "تم الدفع ✓" : "ادفع الآن (تجريبي)"}</Do>
          <Do action={mockPayAction.bind(null, p.id, "again")} className="btn full" disabled={!p.lastWebhook}>إعادة إرسال نفس الإشعار</Do>
          <Do action={mockPayAction.bind(null, p.id, "fail")} className="btn danger full" disabled={p.status !== "pending"}>محاكاة فشل الدفع</Do>
          <Link href={back} className="btn ghost full">العودة</Link>
          <p className="tiny muted" style={{ margin: 0 }}>صفحة العودة لا تثبت الدفع؛ التثبيت فقط بإشعار موقّع يصل للخادم، ويُسجَّل كل إشعار بمعرّفه فلا يتكرر أثره.</p>
        </div>
      </div></main>
    </>
  );
}
