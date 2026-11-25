import { db } from "@/server/db";
import { listUsers } from "@/server/domain/users";
import type { AuditEntry } from "@/server/domain/settings";
import { Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";

export const metadata = { title: "سجل التدقيق" };
export default async function Audit() {
  const [qs, users] = await Promise.all([db().collection("auditLog").orderBy("at", "desc").limit(500).get(), listUsers()]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return (
    <div className="stack">
      <Title sub="الدفع، الإعدادات، الصلاحيات، الإلغاء، التسويات.">سجل التدقيق</Title>
      <div className="tw"><table>
        <thead><tr><th>الوقت</th><th>المنفّذ</th><th>العملية</th><th>الهدف</th><th>التفاصيل</th></tr></thead>
        <tbody>{qs.docs.map((d) => d.data() as AuditEntry).map((a) => (
          <tr key={a.id}><td className="nowrap">{fmtShort(a.at)}</td><td>{names.get(a.actorId) ?? a.actorId}</td><td className="ltr small">{a.action}</td><td className="ltr tiny">{a.target}</td>
            <td><details><summary className="tiny">عرض</summary><pre className="ltr tiny" style={{ whiteSpace: "pre-wrap", maxWidth: 420, overflowWrap: "anywhere" }}>{JSON.stringify(a.details, null, 1)}</pre></details></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
