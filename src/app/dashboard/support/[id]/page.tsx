import { notFound } from "next/navigation";
import { needOrganizer } from "@/server/session";
import { ticket, replies, SUPPORT_AR, KIND_AR } from "@/server/domain/support";
import { AppError } from "@/server/errors";
import { Back, Tag, Title } from "@/ui/kit";
import { Thread } from "@/ui/Thread";
import { replyAction } from "../../actions";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await needOrganizer();
  const t = await ticket(u, id).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const list = await replies(id);
  return (
    <div className="medium stack">
      <Back href="/dashboard/support">الدعم</Back>
      <Title sub={KIND_AR[t.kind]} actions={<Tag tone="info">{SUPPORT_AR[t.status]}</Tag>}>{t.subject}</Title>
      <Thread items={[{ id: "0", mine: true, who: t.ownerName, body: t.body, at: t.createdAt }, ...list.map((r) => ({ id: r.id, mine: !r.admin, who: r.admin ? "فريق المنصة" : r.byName, body: r.body, at: r.at }))]} action={replyAction.bind(null, id)} />
    </div>
  );
}
