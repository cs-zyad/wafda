import Link from "next/link";
import { notFound } from "next/navigation";
import { needOrganizer } from "@/server/session";
import { getPayment } from "@/server/domain/payments";
import { getUser } from "@/server/domain/users";
import { ActionForm, Submit } from "@/ui/client";
import { Alert, Back, Tag, Title } from "@/ui/kit";
import { localPhone } from "@/shared/text";
import { sar } from "@/shared/money";
import { payContactAction } from "../../actions";

export const metadata = { title: "طلب الدفع" };

/** الدفع بالتحويل البنكي: الطلب يصل للإدارة، ونتواصل مع المنظّم على واتساب، ويتفعّل الطلب بعد تأكيد استلام المبلغ. */
export default async function Pay({ params }: { params: Promise<{ id: string }> }) {
  const u = await needOrganizer();
  const p = await getPayment((await params).id);
  if (!p || p.ownerId !== u.id) notFound();
  const user = await getUser(u.id);
  const phone = localPhone(p.contactPhone || user?.phone || "");
  const back = p.eventId ? `/dashboard/events/${p.eventId}/payment` : p.designId ? `/dashboard/designs/${p.designId}` : "/dashboard/credit";
  return (
    <div className="narrow stack-lg">
      <Back href={back}>العودة</Back>
      <Title>طلب الدفع</Title>
      <div className="card stack">
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{p.description}</h2>
        <div className="row between"><span className="muted">المبلغ</span><b className="num" style={{ fontSize: "1.6rem" }}>{sar(p.amount)}</b></div>
        <div className="row between"><span className="muted">الحالة</span>{p.status === "paid" ? <Tag tone="ok">تم الدفع</Tag> : p.status === "failed" ? <Tag tone="bad">أُلغي الطلب</Tag> : <Tag tone="warn">بانتظار التحويل</Tag>}</div>
      </div>
      {p.status === "paid" ? (
        <Alert tone="ok">تم تأكيد استلام المبلغ وتفعّل طلبك. شكرًا لك.</Alert>
      ) : p.status === "failed" ? (
        <Alert tone="bad">أُلغي هذا الطلب. إن حوّلت المبلغ أو تحتاج مساعدة، تواصل معنا من <Link href="/dashboard/support/new">الدعم</Link>.</Alert>
      ) : (
        <>
          <Alert tone="info">
            <b>وصلنا طلبك ✓</b> الدفع حاليًا بالتحويل البنكي: بنتواصل معك على واتساب ونرسل لك بيانات الحساب. بعد ما يوصلنا المبلغ نأكده، ويتفعّل طلبك تلقائيًا.
          </Alert>
          <section className="card stack">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>رقم واتساب للتواصل</h2>
            <ActionForm action={payContactAction.bind(null, p.id)} className="stack">
              <label className="field"><span>رقم الجوال (واتساب)</span><input type="tel" name="phone" required inputMode="tel" placeholder="05xxxxxxxx" defaultValue={phone} autoComplete="tel" /></label>
              <Submit className="btn go">{phone ? "تحديث الرقم" : "حفظ الرقم"}</Submit>
            </ActionForm>
          </section>
        </>
      )}
    </div>
  );
}
