import { owned } from "@/server/owned";
import { staffOf } from "@/server/domain/staff";
import { ActionForm, Do, Submit } from "@/ui/client";
import { Alert, Empty, Ltr, Tag } from "@/ui/kit";
import { fmtShort } from "@/shared/time";
import { addStaffAction, removeStaffAction } from "../../../actions";

export default async function Staff({ params }: { params: Promise<{ id: string }> }) {
  const { e } = await owned((await params).id);
  const team = await staffOf(e.id);
  const add = addStaffAction.bind(null, e.id);
  return (
    <div className="grid g2 top">
      <section className="card stack">
        <h2>إضافة عضو استقبال</h2>
        <p className="small muted">يعمل على هذه الفعالية فقط، ووظيفته المسح والتحضير. إن لم يكن له حساب يصله رابط إنشاء كلمة مرور صالح 7 أيام ولمرة واحدة. أنت كمنظّم تحضّر دائمًا.</p>
        <ActionForm action={add} className="stack" reset>
          <label className="field"><span>الاسم</span><input name="name" required maxLength={120} /></label>
          <label className="field"><span>البريد</span><input type="email" name="email" required /></label>
          <Submit>إضافة وإرسال الدعوة</Submit>
        </ActionForm>
      </section>
      <section className="stack">
        <h2 style={{ margin: 0 }}>الفريق</h2>
        <Alert>صفحة التحضير للفريق: ‎/checkin من الجوال (الكاميرا تحتاج HTTPS).</Alert>
        {team.length ? (
          <div className="list">
            {team.map((m) => (
              <div key={m.id} className="item row between">
                <div>
                  <b>{m.user?.name}</b> {m.user?.status === "invited" ? <Tag tone="warn">مدعو — لم يُنشئ كلمة المرور</Tag> : m.user?.status === "suspended" ? <Tag tone="bad">موقوف</Tag> : <Tag tone="ok">نشط</Tag>}
                  <div className="meta"><Ltr>{m.user?.email}</Ltr> · أُضيف {fmtShort(m.at)}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {m.user?.status === "invited" ? (
                    <ActionForm action={add}><input type="hidden" name="name" value={m.user.name} /><input type="hidden" name="email" value={m.user.email} /><Submit className="btn sm ghost">إعادة إرسال الرابط</Submit></ActionForm>
                  ) : null}
                  <Do action={removeStaffAction.bind(null, e.id, m.userId)} className="btn sm danger" confirm="إزالة العضو من الفعالية؟">إزالة</Do>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty>لا أعضاء بعد.</Empty>}
      </section>
    </div>
  );
}
