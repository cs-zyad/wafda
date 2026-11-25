import Link from "next/link";
import { needOrganizer } from "@/server/session";
import { designsOf, DESIGN_AR } from "@/server/domain/designs";
import { Empty, Tag, Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";

export const metadata = { title: "طلبات التصميم" };
export default async function Designs() {
  const list = await designsOf((await needOrganizer()).id);
  return (
    <>
      <Title sub="اطلب قالبًا بهويتك: نراجع ونرسل عرض سعر، وبعد الدفع والتنفيذ يظهر لك القالب عند الاختيار." actions={<Link className="btn go" href="/dashboard/designs/new">+ طلب جديد</Link>}>طلبات التصميم الخاص</Title>
      {list.length ? (
        <div className="list">{list.map((d) => (
          <Link key={d.id} href={`/dashboard/designs/${d.id}`} className="item row between"><div><b>{d.title}</b><div className="meta">آخر تحديث {fmtShort(d.updatedAt)}</div></div>
            <Tag tone={d.status === "delivered" ? "ok" : d.status === "quoted" || d.status === "accepted" ? "warn" : d.status === "rejected" || d.status === "cancelled" ? "neutral" : "info"}>{DESIGN_AR[d.status]}</Tag></Link>
        ))}</div>
      ) : <Empty>لا طلبات بعد.</Empty>}
    </>
  );
}
