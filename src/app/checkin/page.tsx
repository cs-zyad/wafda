import Link from "next/link";
import { need } from "@/server/session";
import { checkinEvents } from "@/server/domain/staff";
import { Empty, Tag, Title } from "@/ui/kit";
import { fmtDateTime } from "@/shared/time";

export const metadata = { title: "التحضير" };
export default async function CheckinHome() {
  const list = await checkinEvents((await need(["organizer", "staff"])).id);
  return (
    <>
      <Title sub="تظهر فقط الفعاليات النشطة المعيّن عليها.">التحضير</Title>
      {list.length ? <div className="list">{list.map(({ e, role }) => (
        <Link key={e.id} href={`/checkin/${e.id}`} className="item row between"><div><b>{e.title}</b><div className="meta">{fmtDateTime(e.startAt)} · {e.venue}</div></div>
          <span className="row" style={{ gap: 6 }}><Tag>{role === "owner" ? "منظّم" : "استقبال"}</Tag><span className="btn sm go">فتح الماسح</span></span></Link>
      ))}</div> : <Empty>لا فعاليات نشطة معيّن عليها.</Empty>}
    </>
  );
}
