import { allEvents, capacity } from "@/server/domain/events";
import { listUsers } from "@/server/domain/users";
import { EventStatus } from "@/ui/EventStatus";
import { Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";

export const metadata = { title: "الفعاليات" };
export default async function AdminEvents() {
  const [events, users] = await Promise.all([allEvents(), listUsers()]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return (
    <div className="stack">
      <Title sub="للمتابعة؛ إدارة الفعالية من حساب صاحبها.">كل الفعاليات</Title>
      <div className="tw"><table>
        <thead><tr><th>الفعالية</th><th>المنظّم</th><th>النوع</th><th>الحالة</th><th>الموعد</th><th>مدفوع</th><th>محجوز/السعة</th><th>حضر</th></tr></thead>
        <tbody>{events.sort((a, b) => b.createdAt - a.createdAt).map((e) => (
          <tr key={e.id}><td>{e.title}</td><td>{names.get(e.ownerId)}</td><td>{e.type === "private" ? "خاصة" : "عامة"}</td><td><EventStatus e={e} /></td><td className="nowrap">{fmtShort(e.startAt)}</td><td className="num">{e.paidPlaces}</td><td className="num">{e.reserved}/{capacity(e)}</td><td className="num">{e.inGuests + e.inCompanions}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
