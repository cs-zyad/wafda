import Link from "next/link";
import { needOrganizer } from "@/server/session";
import { tickets, SUPPORT_AR, KIND_AR } from "@/server/domain/support";
import { Empty, Tag, Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";

export const metadata = { title: "الدعم والشكاوى" };
export default async function Support() {
  const list = await tickets((await needOrganizer()).id);
  return (
    <>
      <Title actions={<Link className="btn go" href="/dashboard/support/new">+ طلب جديد</Link>}>الدعم والشكاوى</Title>
      {list.length ? <div className="list">{list.map((t) => (
        <Link key={t.id} href={`/dashboard/support/${t.id}`} className="item row between"><div><b>{t.subject}</b><div className="meta">{KIND_AR[t.kind]} · {fmtShort(t.updatedAt)}</div></div>
          <Tag tone={t.status === "open" ? "warn" : t.status === "working" ? "info" : "ok"}>{SUPPORT_AR[t.status]}</Tag></Link>
      ))}</div> : <Empty>لا طلبات.</Empty>}
    </>
  );
}
