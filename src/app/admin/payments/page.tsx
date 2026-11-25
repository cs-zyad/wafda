import { paymentsOf, webhookLogs } from "@/server/domain/payments";
import { listUsers } from "@/server/domain/users";
import { Tag, Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";
import { sar } from "@/shared/money";

export const metadata = { title: "المدفوعات" };
const P: Record<string, string> = { package: "باقة", extra_places: "أماكن إضافية", credit: "شحن رصيد", design: "تصميم" };
const O: Record<string, [string, "ok" | "neutral" | "bad" | "warn"]> = { applied: ["طُبّق", "ok"], duplicate: ["مكرر — تجاهل", "neutral"], already_paid: ["مدفوع مسبقًا — تجاهل", "neutral"], rejected: ["مرفوض", "bad"], failed: ["فشل دفع", "warn"] };

export default async function Payments() {
  const [pays, logs, users] = await Promise.all([paymentsOf(), webhookLogs(), listUsers()]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return (
    <div className="stack-lg">
      <Title>المدفوعات وإشعارات المزوّد</Title>
      <section className="stack"><h2 style={{ margin: 0 }}>المدفوعات</h2>
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
