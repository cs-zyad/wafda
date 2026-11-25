import Link from "next/link";
import { tickets, SUPPORT_AR, KIND_AR } from "@/server/domain/support";
import { Empty, Tag, Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";

export const metadata = { title: "الدعم والشكاوى" };
export default async function AdminSupport() {
  const list = await tickets();
  return (
    <div className="stack">
      <Title>الدعم والشكاوى</Title>
      {list.length ? <div className="list">{list.map((t) => (
        <Link key={t.id} href={`/admin/support/${t.id}`} className="item row between"><div><b>{t.subject}</b><div className="meta">{KIND_AR[t.kind]} · {t.ownerName} · {fmtShort(t.updatedAt)}</div></div><Tag tone={t.status === "open" ? "warn" : t.status === "working" ? "info" : "ok"}>{SUPPORT_AR[t.status]}</Tag></Link>
      ))}</div> : <Empty>لا طلبات.</Empty>}
    </div>
  );
}
