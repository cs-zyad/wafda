import { paymentsOf, webhookLogs } from "@/server/domain/payments";
import { listUsers } from "@/server/domain/users";
import { Alert, Empty, Ltr, Tag, Title } from "@/ui/kit";
import { Do } from "@/ui/client";
import { paymentProvider } from "@/server/providers/payments";
import { localPhone } from "@/shared/text";
import { confirmPaymentAction, rejectPaymentAction } from "../actions";
import { fmtShort } from "@/shared/time";
import { sar } from "@/shared/money";

export const metadata = { title: "المدفوعات" };
const P: Record<string, string> = { package: "باقة", extra_places: "أماكن إضافية", credit: "شحن رصيد", design: "تصميم" };
const O: Record<string, [string, "ok" | "neutral" | "bad" | "warn"]> = { applied: ["طُبّق", "ok"], duplicate: ["مكرر — تجاهل", "neutral"], already_paid: ["مدفوع مسبقًا — تجاهل", "neutral"], rejected: ["مرفوض", "bad"], failed: ["فشل دفع", "warn"] };

export default async function Payments() {
  const [pays, logs, users] = await Promise.all([paymentsOf(), webhookLogs(), listUsers()]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const byId = new Map(users.map((u) => [u.id, u]));
  const pending = pays.filter((p) => p.status === "pending");
  const wa = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
  return (
    <div className="stack-lg">
      <Title sub={`طريقة الدفع الحالية: ${paymentProvider().label}`}>المدفوعات وإشعارات المزوّد</Title>
      <section className="stack"><h2 style={{ margin: 0 }}>طلبات بانتظار الدفع ({pending.length})</h2>
        {paymentProvider().mode === "manual" ? <Alert>تواصل مع المنظّم على واتساب وأرسل له بيانات التحويل. بعد ما يوصلك المبلغ اضغط «تأكيد الاستلام»، فيتفعّل طلبه تلقائيًا (الباقة أو الأماكن أو الرصيد أو التصميم). لا تؤكد قبل ما تتحقق من وصول المبلغ.</Alert> : null}
        {pending.length ? (
          <div className="list">{pending.map((p) => {
            const o = byId.get(p.ownerId);
            const phone = p.contactPhone || o?.phone || "";
            return (
              <div key={p.id} className="item stack">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div><b>{p.description}</b><div className="meta">{o?.name} · <Ltr>{o?.email}</Ltr>{phone ? <> · <Ltr>{localPhone(phone)}</Ltr></> : null} · {fmtShort(p.createdAt)}</div></div>
                  <b className="num">{sar(p.amount)}</b>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {phone ? <a className="btn sm" href={wa(phone, `السلام عليكم ${o?.name ?? ""}، معك فريق وفدة بخصوص طلبك: ${p.description} بمبلغ ${sar(p.amount)}. نرسل لك بيانات التحويل البنكي؟`)} target="_blank" rel="noopener noreferrer">تواصل على واتساب</a> : <span className="small muted">لا يوجد رقم جوال — تواصل بالبريد</span>}
                  <Do action={confirmPaymentAction.bind(null, p.id)} className="btn sm go" confirm={`تأكيد استلام ${sar(p.amount)} من ${o?.name ?? "المنظّم"}؟ سيتفعّل طلبه فورًا.`}>تأكيد الاستلام</Do>
                  <Do action={rejectPaymentAction.bind(null, p.id)} className="btn sm danger" confirm="إلغاء هذا الطلب؟">إلغاء الطلب</Do>
                </div>
              </div>
            );
          })}</div>
        ) : <Empty>لا توجد طلبات بانتظار الدفع.</Empty>}
      </section>
      <section className="stack"><h2 style={{ margin: 0 }}>كل المدفوعات</h2>
        <div className="tw"><table><thead><tr><th>الوقت</th><th>المنظّم</th><th>النوع</th><th>الوصف</th><th>المبلغ</th><th>الحالة</th></tr></thead>
          <tbody>{pays.map((p) => <tr key={p.id}><td className="nowrap">{fmtShort(p.createdAt)}</td><td>{names.get(p.ownerId)}</td><td>{P[p.purpose]}</td><td className="small">{p.description}</td><td className="num">{sar(p.amount)}</td><td><Tag tone={p.status === "paid" ? "ok" : p.status === "failed" ? "bad" : "warn"}>{{ paid: "مدفوع", failed: "فشل", pending: "بانتظار" }[p.status]}</Tag></td></tr>)}</tbody>
        </table></div>
      </section>
      <section className="stack"><h2 style={{ margin: 0 }}>إشعارات المزوّد (webhooks)</h2>
        <div className="tw"><table><thead><tr><th>الوقت</th><th>المعرّف</th><th>النوع</th><th>المبلغ</th><th>النتيجة</th></tr></thead>
          <tbody>{logs.map((l) => <tr key={l.id}><td className="nowrap">{fmtShort(l.at)}</td><td className="ltr tiny">{l.id}</td><td className="ltr small">{l.type}</td><td className="num">{sar(l.amount)} <span className="tiny ltr">{l.currency}</span></td><td><Tag tone={O[l.outcome][1]}>{O[l.outcome][0]}</Tag>{l.reason ? <div className="tiny muted">{l.reason}</div> : null}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}
