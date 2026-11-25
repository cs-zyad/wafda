import { owned } from "@/server/owned";
import { messagesOf } from "@/server/domain/outbox";
import { CH, Empty, KIND, Ltr, MSG, Tag } from "@/ui/kit";
import { fmtShort } from "@/shared/time";
import { sar } from "@/shared/money";

export default async function Messages({ params }: { params: Promise<{ id: string }> }) {
  const { e } = await owned((await params).id);
  const list = await messagesOf({ eventId: e.id });
  const credit = list.filter((m) => m.chargedTo === "credit" && !m.refunded).reduce((n, m) => n + m.cost, 0);
  const pkg = list.filter((m) => m.chargedTo !== "credit").reduce((n, m) => n + m.opCost, 0);
  return (
    <div className="stack">
      <p className="small muted">المخصوم من الرصيد (بعد الاسترجاع): <b className="num">{sar(credit)}</b> · رسائل مشمولة في الباقة (تكلفة تشغيل تقديرية): <b className="num">{sar(pkg)}</b></p>
      {list.length ? (
        <div className="tw">
          <table>
            <thead><tr><th>الوقت</th><th>النوع</th><th>القناة</th><th>إلى</th><th>الحالة</th><th>المحاولات</th><th>التحميل</th><th>التكلفة</th></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td className="nowrap">{fmtShort(m.createdAt)}</td>
                  <td>{KIND[m.kind]}</td>
                  <td>{CH[m.channel]}</td>
                  <td><Ltr>{m.to}</Ltr></td>
                  <td><Tag tone={MSG[m.status][1]}>{MSG[m.status][0]}</Tag>{m.error && m.status !== "sent" ? <div className="tiny muted">{m.error}</div> : null}{m.refunded ? <div className="tiny">استُرجعت القيمة</div> : null}</td>
                  <td className="num">{m.attempts}</td>
                  <td>{m.chargedTo === "credit" ? "الرصيد" : m.chargedTo === "package" ? "الباقة" : "المنصة"}</td>
                  <td className="num">{m.chargedTo === "credit" ? sar(m.cost) : `${sar(m.opCost)} تشغيل`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>لا رسائل بعد.</Empty>}
    </div>
  );
}
