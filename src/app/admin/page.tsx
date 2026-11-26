import Link from "next/link";
import { overview } from "@/server/domain/adminStats";
import { db, col, firebaseStatus } from "@/server/db";
import { messagingStatus } from "@/server/providers/messaging";
import { paymentProvider } from "@/server/providers/payments";
import { Alert, Stat, Tag, Title } from "@/ui/kit";
import { sar } from "@/shared/money";

export const metadata = { title: "لوحة الأدمن" };
export default async function Admin() {
  const [o, pendingPays] = await Promise.all([overview(), db().collection(col.payments).where("status", "==", "pending").count().get().then((r) => r.data().count)]);
  const fb = firebaseStatus();
  const pay = paymentProvider();
  return (
    <div className="stack-lg">
      <Title sub="عمليات المنصة في مكان واحد.">لوحة الأدمن</Title>
      {pendingPays ? <Alert tone="warn"><b className="num">{pendingPays}</b> طلب دفع بانتظار التأكيد — <Link href="/admin/payments">افتح المدفوعات</Link></Alert> : null}
      <div className="grid g4">
        <Stat k="المنظّمون" v={o.organizers} s={`${o.suspended} حساب موقوف`} />
        <Stat k="الفعاليات" v={o.events} s={`${o.active} نشطة · ${o.drafts} مسودة`} />
        <Stat hl k="إجمالي المدفوع" v={sar(o.paidTotal)} s={`${o.paidCount} عملية`} />
        <Stat k="إيراد الرسائل" v={sar(o.messageRevenue)} s={`بعد استرجاع ${sar(o.refunded)}`} />
        <Stat k="تكلفة رسائل التأكيد" v={sar(o.confirmCost)} s="على الباقات (تقديرية ومعزولة)" />
        <Stat k="التذاكر والحضور" v={o.tickets} s={`حضر ${o.inside}`} />
        <Stat k="ينتظر إجراء" v={o.pendingDesigns + o.openSupport} s={`${o.pendingDesigns} تصميم · ${o.openSupport} دعم`} />
        <Stat k="رسائل فشلت" v={o.failedMsgs} s={`تكلفة رسائل المنصة ${sar(o.platformCost)}`} />
      </div>
      <section className="card">
        <h2>حالة الربط</h2>
        <div className="tw"><table>
          <thead><tr><th>الخدمة</th><th>المزوّد</th><th>الحالة</th></tr></thead>
          <tbody>
            <tr><td>قاعدة البيانات</td><td>Firebase Firestore</td><td>{fb.ok ? <Tag tone="ok">{fb.mode === "emulator" ? "محاكي محلي" : "فعلي"}</Tag> : <Tag tone="bad">غير مضبوط</Tag>}</td></tr>
            {messagingStatus().map((p) => <tr key={p.channel}><td>{p.channel === "whatsapp" ? "واتساب" : "البريد"}</td><td>{p.label}</td><td>{p.mode === "mock" ? <Tag tone="warn">تجريبي</Tag> : p.mode === "off" ? <Tag tone="bad">غير مفعّل</Tag> : <Tag tone="ok">فعلي</Tag>}</td></tr>)}
            <tr><td>الدفع</td><td>{pay.label}</td><td>{pay.mode === "mock" ? <Tag tone="warn">تجريبي</Tag> : pay.mode === "manual" ? <Tag tone="info">يدوي</Tag> : <Tag tone="ok">فعلي</Tag>}</td></tr>
          </tbody>
        </table></div>
      </section>
      <div className="row"><Link className="btn" href="/admin/designs">طلبات التصميم</Link><Link className="btn" href="/admin/support">الدعم</Link><Link className="btn" href="/admin/payments">المدفوعات والإشعارات</Link></div>
    </div>
  );
}
