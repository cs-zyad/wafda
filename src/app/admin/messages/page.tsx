import { messagesOf } from "@/server/domain/outbox";
import { allEvents } from "@/server/domain/events";
import { CH, KIND, Ltr, MSG, Stat, Tag, Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";
import { sar } from "@/shared/money";

export const metadata = { title: "الرسائل والتكلفة" };
export default async function Messages() {
  const [list, events] = await Promise.all([messagesOf({}), allEvents()]);
  const titles = new Map(events.map((e) => [e.id, e.title]));
  const by = (c: string) => list.filter((m) => m.chargedTo === c);
  const credit = by("credit"), pkg = by("package"), plat = by("platform");
  return (
    <div className="stack-lg">
      <Title sub="عزل محاسبي: رسائل الرصيد (إيراد) مقابل رسائل الباقة والمنصة (تكلفة تشغيل).">الرسائل والتكلفة</Title>
      <div className="grid g4">
        <Stat k="رسائل الرصيد" v={credit.length} s={`إيراد ${sar(credit.filter((m) => !m.refunded).reduce((n, m) => n + m.cost, 0))} · مسترجع ${sar(credit.filter((m) => m.refunded).reduce((n, m) => n + m.cost, 0))}`} />
        <Stat k="رسائل الباقة" v={pkg.length} s={`تكلفة تقديرية ${sar(pkg.reduce((n, m) => n + m.opCost, 0))}`} />
        <Stat k="رسائل المنصة" v={plat.length} s={`تكلفة تقديرية ${sar(plat.reduce((n, m) => n + m.opCost, 0))}`} />
        <Stat k="فشلت" v={list.filter((m) => m.status === "failed").length} />
      </div>
      <div className="tw"><table>
        <thead><tr><th>الوقت</th><th>الفعالية</th><th>النوع</th><th>القناة</th><th>إلى</th><th>الحالة</th><th>المحاولات</th><th>التحميل</th><th>التكلفة</th></tr></thead>
        <tbody>{list.slice(0, 300).map((m) => (
          <tr key={m.id}><td className="nowrap">{fmtShort(m.createdAt)}</td><td className="small">{m.eventId ? titles.get(m.eventId) : "—"}</td><td>{KIND[m.kind]}</td><td>{CH[m.channel]}</td><td><Ltr>{m.to}</Ltr></td><td><Tag tone={MSG[m.status][1]}>{MSG[m.status][0]}</Tag></td><td className="num">{m.attempts}</td><td>{{ credit: "رصيد", package: "باقة", platform: "منصة" }[m.chargedTo]}</td><td className="num">{sar(m.chargedTo === "credit" ? m.cost : m.opCost)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
