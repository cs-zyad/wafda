import Link from "next/link";
import { needOrganizer } from "@/server/session";
import { getUser } from "@/server/domain/users";
import { ledgerOf } from "@/server/domain/ledger";
import { paymentsOf } from "@/server/domain/payments";
import { getSettings } from "@/server/domain/settings";
import { ActionForm, Submit } from "@/ui/client";
import { Alert, Empty, Stat, Tag, Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";
import { sar } from "@/shared/money";
import { topupAction } from "../actions";

export const metadata = { title: "الرصيد والمدفوعات" };
const WHY: Record<string, string> = { topup: "شحن", batch: "إرسال رسائل", refund: "استرجاع رسالة فشلت", offer: "فرصة انتظار", adjust: "تسوية من الإدارة" };
const P: Record<string, string> = { package: "باقة فعالية", extra_places: "أماكن إضافية", credit: "شحن رصيد", design: "تصميم خاص" };

export default async function Credit() {
  const u = await needOrganizer();
  const [fresh, ledger, pays, s] = await Promise.all([getUser(u.id), ledgerOf(u.id), paymentsOf(u.id), getSettings()]);
  return (
    <div className="stack-lg">
      <Title sub="رصيد الرسائل منفصل عن باقات الفعاليات.">الرصيد والمدفوعات</Title>
      <div className="grid g2 top">
        <div className="stack">
          <Stat hl k="رصيد الرسائل" v={sar(fresh?.credit ?? 0)} />
          <p className="small muted">واتساب {sar(s.prices.message.whatsapp)} للرسالة، البريد {sar(s.prices.message.email)}{s.prices.demo ? " (تجريبية)" : ""}. الرسالة التي تفشل نهائيًا تُسترجع قيمتها تلقائيًا.</p>
        </div>
        <section className="card">
          <h3>شحن الرصيد</h3>
          <ActionForm action={topupAction} className="stack">
            <label className="field"><span>المبلغ (ر.س)</span><input type="number" name="amount" min={10} max={10000} defaultValue={50} required inputMode="numeric" /><small>من 10 إلى 10,000 ر.س. يُضاف بعد وصول إشعار الدفع الموثّق.</small></label>
            <Submit>متابعة للدفع</Submit>
          </ActionForm>
        </section>
      </div>
      <section className="stack">
        <h2 style={{ margin: 0 }}>حركة الرصيد</h2>
        {ledger.length ? (
          <div className="tw"><table>
            <thead><tr><th>الوقت</th><th>الحركة</th><th>التفاصيل</th><th>المبلغ</th><th>الرصيد بعدها</th></tr></thead>
            <tbody>{ledger.map((l) => (
              <tr key={l.id}><td className="nowrap">{fmtShort(l.at)}</td><td>{WHY[l.reason]}</td><td className="small">{l.note}</td>
                <td className="num" style={{ color: l.amount < 0 ? "var(--bad)" : "var(--ok)" }}><bdi dir="ltr">{l.amount > 0 ? "+" : ""}{(l.amount / 100).toFixed(2)}</bdi></td><td className="num">{sar(l.balance)}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>لا حركات بعد.</Empty>}
      </section>
      <section className="stack">
        <h2 style={{ margin: 0 }}>سجل المدفوعات</h2>
        {pays.length ? (
          <div className="tw"><table>
            <thead><tr><th>الوقت</th><th>النوع</th><th>الوصف</th><th>المبلغ</th><th>الحالة</th></tr></thead>
            <tbody>{pays.map((p) => (
              <tr key={p.id}><td className="nowrap">{fmtShort(p.createdAt)}</td><td>{P[p.purpose]}</td><td className="small">{p.description}</td><td className="num">{sar(p.amount)}</td>
                <td>{p.status === "paid" ? <Tag tone="ok">مدفوع</Tag> : p.status === "failed" ? <Tag tone="bad">فشل</Tag> : <Link href={`/dev/checkout/${p.id}`}><Tag tone="warn">بانتظار الدفع</Tag></Link>}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>لا مدفوعات بعد.</Empty>}
        <Alert>تثبيت الدفع وزيادة السعة وشحن الرصيد تتم فقط بإشعار موقّع من مزوّد الدفع إلى الخادم، لا من صفحة العودة.</Alert>
      </section>
    </div>
  );
}
