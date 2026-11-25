import Link from "next/link";
import { designsOf, DESIGN_AR } from "@/server/domain/designs";
import { listUsers } from "@/server/domain/users";
import { Empty, Tag, Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";

export const metadata = { title: "طلبات التصميم" };
export default async function AdminDesigns() {
  const [list, users] = await Promise.all([designsOf(), listUsers()]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return (
    <div className="stack">
      <Title>طلبات التصميم</Title>
      {list.length ? <div className="list">{list.map((d) => (
        <Link key={d.id} href={`/admin/designs/${d.id}`} className="item row between"><div><b>{d.title}</b><div className="meta">{names.get(d.ownerId)} · {fmtShort(d.updatedAt)}</div></div><Tag tone={d.status === "review" || d.status === "paid" ? "warn" : "info"}>{DESIGN_AR[d.status]}</Tag></Link>
      ))}</div> : <Empty>لا طلبات.</Empty>}
    </div>
  );
}
