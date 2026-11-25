import Link from "next/link";
import { owned } from "@/server/owned";
import { packageSummary, paymentsOf } from "@/server/domain/payments";
import { capacity } from "@/server/domain/events";
import { link } from "@/server/domain/view";
import { ActionForm, CopyBox, Do, Submit } from "@/ui/client";
import { Alert, Stat, Tag } from "@/ui/kit";
import { fmtShort } from "@/shared/time";
import { sar } from "@/shared/money";
import { payPackageAction, extraPlacesAction } from "../../../actions";

const P: Record<string, string> = { package: "الباقة", extra_places: "أماكن إضافية", credit: "شحن", design: "تصميم" };

export default async function Payment({ params }: { params: Promise<{ id: string }> }) {
  const { user, e } = await owned((await params).id);
  const [sum, pays] = await Promise.all([packageSummary(user.id, e.id), paymentsOf(user.id)]);
  const mine = pays.filter((p) => p.eventId === e.id);
  const priv = e.type === "private";
  return (
    <div className="stack-lg">
      {sum.s.prices.demo ? <Alert>الأسعار المعروضة تجريبية وقابلة للتعديل من لوحة الأدمن.</Alert> : null}
      {e.paidPlaces <= 0 ? (
        <section className="card stack">
          <h2>ملخص الباقة قبل الدفع</h2>
          <p>{priv ? <><b className="num">{sum.invitations}</b> دعوة، منها <b className="num">{sum.withCompanion}</b> تسمح بمرافق = <b className="num">{sum.needed}</b> مكانًا.</> : <>الحد الأقصى للحضور: <b className="num">{e.maxAttendees}</b> مكانًا.</>}</p>
          {sum.quote ? <div className="grid g3"><Stat k="الباقة" v={sum.quote.label} /><Stat k="الأماكن" v={sum.quote.places} /><Stat hl k="المبلغ" v={sar(sum.quote.price)} /></div> : null}
          <p className="small muted">رسوم الدعوات والتذكيرات منفصلة وتُخصم من <Link href="/dashboard/credit">رصيد الرسائل</Link>؛ رسالة التأكيد مع التذكرة مشمولة في الباقة.</p>
          {sum.blockers.length ? <Alert tone="warn">قبل الدفع: {sum.blockers.join("، ")}.</Alert> : null}
          <Do action={payPackageAction.bind(null, e.id)} className="btn go lg" disabled={!!sum.blockers.length || e.status === "cancelled"}>{priv ? "ادفع قبل إرسال الدعوات" : "ادفع وانشر الرابط العام"}</Do>
        </section>
      ) : (
        <>
          <div className="grid g4">
            <Stat hl k="الأماكن المدفوعة" v={e.paidPlaces} />
            {priv ? <Stat k="المطلوب للمدعوين" v={sum.needed} s="دعوة + مرافق مسموح" /> : <Stat k="الحد الأقصى" v={e.maxAttendees} />}
            <Stat k="السعة الفعلية" v={capacity(e)} s="الأقل بين الحد الأقصى والمدفوع" />
            <Stat k="المحجوز" v={e.reserved} />
          </div>
          {priv && sum.missing > 0 ? <Alert tone="warn">المدعوون يحتاجون {sum.needed} مكانًا والباقة {e.paidPlaces}: اشترِ <b>{sum.missing}</b> مكانًا ({sar(sum.extraPrice)}) قبل أي إرسال.</Alert> : null}
          {!priv ? (
            <section className="card soft stack">
              <h3>الرابط العام</h3>
              <CopyBox value={link.event(e.slug)} />
              <p className="small muted" style={{ margin: 0 }}>شاركه أينما شئت؛ أي شخص يسجّل ضمن السعة والسياسة. <a href={link.event(e.slug)} target="_blank" rel="noopener">فتح الصفحة</a></p>
            </section>
          ) : null}
          <section className="card stack">
            <h3>شراء أماكن إضافية</h3>
            <p className="small muted">{sar(sum.s.prices.extraPlace)} للمكان. {!priv ? "في الرابط العام ترفع الحد الأقصى بنفس العدد. " : ""}تُضاف بعد وصول إشعار الدفع الموثّق.</p>
            <ActionForm action={extraPlacesAction.bind(null, e.id)} className="row">
              <input type="number" name="places" min={1} max={5000} defaultValue={sum.missing || 10} required aria-label="عدد الأماكن" style={{ maxWidth: 140 }} />
              <Submit className="btn dark">شراء</Submit>
            </ActionForm>
          </section>
        </>
      )}
      {mine.length ? (
        <section className="stack">
          <h3>مدفوعات الفعالية</h3>
          <div className="tw"><table>
            <thead><tr><th>الوقت</th><th>النوع</th><th>الأماكن</th><th>المبلغ</th><th>الحالة</th></tr></thead>
            <tbody>{mine.map((p) => (
              <tr key={p.id}><td className="nowrap">{fmtShort(p.createdAt)}</td><td>{P[p.purpose]}</td><td className="num">{p.places}</td><td className="num">{sar(p.amount)}</td>
                <td>{p.status === "paid" ? <Tag tone="ok">مدفوع</Tag> : p.status === "failed" ? <Tag tone="bad">فشل</Tag> : <Link href={`/dev/checkout/${p.id}`}><Tag tone="warn">بانتظار الدفع</Tag></Link>}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      ) : null}
    </div>
  );
}
