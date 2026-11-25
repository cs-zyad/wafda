import Link from "next/link";
import { needOrganizer } from "@/server/session";
import { capacity, eventsOf, isPast } from "@/server/domain/events";
import { getUser } from "@/server/domain/users";
import { Empty, Stat, Tag, Title } from "@/ui/kit";
import { fmtDateTime } from "@/shared/time";
import { sar } from "@/shared/money";
import type { EventDoc } from "@/server/types";
import { EventStatus } from "@/ui/EventStatus";

export const metadata = { title: "فعالياتي" };

const Row = ({ e }: { e: EventDoc }) => (
  <Link href={`/dashboard/events/${e.id}`} className="item">
    <div className="row between">
      <b className="break">{e.title}</b>
      <span className="row" style={{ gap: 6 }}>
        <Tag>{e.type === "private" ? "دعوات خاصة" : "رابط عام"}</Tag>
        <EventStatus e={e} />
      </span>
    </div>
    <div className="meta">{fmtDateTime(e.startAt)} · {e.venue}</div>
    {e.status === "active" ? <div className="meta">محجوز <span className="num">{e.reserved}</span> من <span className="num">{capacity(e)}</span> · حضر <span className="num">{e.inGuests + e.inCompanions}</span></div> : null}
  </Link>
);

export default async function Dashboard() {
  const u = await needOrganizer();
  const [list, fresh] = await Promise.all([eventsOf(u.id), getUser(u.id)]);
  const active = list.filter((e) => e.status === "active" && !isPast(e)).sort((a, b) => a.startAt - b.startAt);
  const drafts = list.filter((e) => e.status === "draft");
  const old = list.filter((e) => e.status === "cancelled" || (e.status === "active" && isPast(e)));
  const section = (t: string, l: EventDoc[], none: string) => (
    <section className="stack">
      <h2 style={{ margin: 0 }}>{t}</h2>
      {l.length ? <div className="list">{l.map((e) => <Row key={e.id} e={e} />)}</div> : <Empty>{none}</Empty>}
    </section>
  );
  return (
    <>
      <Title sub="من دُعي، ومن أكّد، ومن حضر — في مكان واحد." actions={<Link className="btn go" href="/dashboard/events/new">+ فعالية جديدة</Link>}>أهلًا {u.name}</Title>
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <Stat hl k="رصيد الرسائل" v={sar(fresh?.credit ?? 0)} s={<Link href="/dashboard/credit">شحن الرصيد</Link>} />
        <Stat k="نشطة" v={active.length} />
        <Stat k="مسودات" v={drafts.length} />
        <Stat k="سابقة وملغاة" v={old.length} />
      </div>
      <div className="grid g2 top">
        {section("الفعاليات النشطة", active, "لا فعاليات نشطة.")}
        <div className="stack-lg">
          {section("المسودات", drafts, "لا مسودات.")}
          {section("السابقة والملغاة", old, "لا شيء بعد.")}
        </div>
      </div>
    </>
  );
}
