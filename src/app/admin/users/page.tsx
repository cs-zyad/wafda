import { listUsers } from "@/server/domain/users";
import { normalizeEmail } from "@/shared/text";
import { ActionForm, Submit } from "@/ui/client";
import { Key } from "@/ui/Key";
import { Empty, Ltr, Tag, Title } from "@/ui/kit";
import { fmtShort } from "@/shared/time";
import { sar } from "@/shared/money";
import { suspendAction, adjustAction } from "../actions";

export const metadata = { title: "الحسابات" };
const ROLE = { organizer: "منظّم", staff: "استقبال", admin: "أدمن" };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const all = await listUsers();
  const n = q.trim().toLowerCase();
  const list = n ? all.filter((u) => u.name.toLowerCase().includes(n) || u.email.includes(normalizeEmail(n) ?? n)) : all;
  return (
    <div className="stack">
      <Title>الحسابات</Title>
      <form className="row" role="search"><input type="search" name="q" defaultValue={q} placeholder="بحث بالاسم أو البريد" aria-label="بحث" style={{ maxWidth: 340 }} /><button className="btn sm">بحث</button></form>
      {list.length ? <div className="list">{list.map((u) => (
        <div key={u.id} className="item">
          <div><b>{u.name}</b> <Tag>{ROLE[u.role]}</Tag> {u.status === "suspended" ? <Tag tone="bad">موقوف</Tag> : u.status === "invited" ? <Tag tone="warn">مدعو</Tag> : <Tag tone="ok">نشط</Tag>}</div>
          <div className="meta"><Ltr>{u.email}</Ltr> · منذ {fmtShort(u.createdAt)}{u.role === "organizer" ? ` · الرصيد ${sar(u.credit)}` : ""}</div>
          {u.role !== "admin" ? (
            <details style={{ marginTop: 8 }}>
              <summary className="small">إجراءات</summary>
              <div className="grid g2" style={{ marginTop: 8 }}>
                <ActionForm action={suspendAction.bind(null, u.id, u.status !== "suspended")} className="card soft stack">
                  <label className="field"><span>{u.status === "suspended" ? "سبب التفعيل" : "سبب الإيقاف"}</span><input name="reason" required maxLength={300} /></label>
                  <Submit className={u.status === "suspended" ? "btn sm go" : "btn sm danger"}>{u.status === "suspended" ? "تفعيل الحساب" : "إيقاف (ينهي الجلسات)"}</Submit>
                </ActionForm>
                {u.role === "organizer" ? (
                  <ActionForm action={adjustAction.bind(null, u.id)} className="card soft stack">
                    <Key />
                    <div className="row"><select name="dir" aria-label="الاتجاه" style={{ maxWidth: 110 }}><option value="credit">إضافة</option><option value="debit">خصم</option></select><input type="number" name="amount" step="0.01" min="0.01" required placeholder="ر.س" aria-label="المبلغ" style={{ maxWidth: 130 }} /></div>
                    <label className="field"><span>سبب التسوية (يُسجّل)</span><input name="reason" required maxLength={300} /></label>
                    <Submit className="btn sm dark">تسوية الرصيد</Submit>
                  </ActionForm>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      ))}</div> : <Empty>لا نتائج.</Empty>}
    </div>
  );
}
