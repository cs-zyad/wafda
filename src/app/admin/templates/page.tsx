import { allTemplates, LAYOUTS } from "@/server/domain/templates";
import { eventView } from "@/server/domain/view";
import { InvitationCard } from "@/ui/InvitationCard";
import { TemplateFields } from "@/ui/TemplateFields";
import { ActionForm, Do, Submit } from "@/ui/client";
import { Tag, Title } from "@/ui/kit";
import { templateSaveAction, templateVisibleAction } from "../actions";

export const metadata = { title: "القوالب" };
const sample = eventView({ title: "ملتقى الشركاء السنوي", orgName: "جهة تجريبية", description: "لقاء سنوي يجمع الشركاء.", startAt: Date.UTC(2026, 11, 20, 16), endAt: Date.UTC(2026, 11, 20, 19), venue: "قاعة الملتقى", address: "الرياض", mapUrl: "https://maps.example.com" }, "سارة العتيبي");

export default async function Templates() {
  const list = await allTemplates();
  return (
    <div className="stack-lg">
      <Title sub="5 تخطيطات مبنية في الكود؛ هنا الاسم والتصنيف والألوان والظهور والترتيب.">القوالب</Title>
      <details className="card"><summary>+ إضافة قالب</summary>
        <ActionForm action={templateSaveAction.bind(null, null)} className="stack" reset><TemplateFields /><Submit>إضافة</Submit></ActionForm>
      </details>
      <div className="grid g2">
        {list.map((t) => (
          <div key={t.id} className="card stack">
            <div className="row between">
              <span><b>{t.name}</b> <span className="tiny muted">{LAYOUTS[t.layout].label} · {t.category}</span> {t.ownerId ? <Tag tone="plum">خاص بمنظّم</Tag> : t.visible ? <Tag tone="ok">ظاهر</Tag> : <Tag>مخفي</Tag>}</span>
              {!t.ownerId ? <Do action={templateVisibleAction.bind(null, t.id, !t.visible)}>{t.visible ? "إخفاء" : "إظهار"}</Do> : null}
            </div>
            <div style={{ height: 290, overflow: "hidden", borderRadius: 16 }} aria-label="معاينة">
              <div style={{ transform: "scale(.7)", transformOrigin: "top center", width: "143%", marginInlineStart: "-21.5%" }}><InvitationCard layout={t.layout} colors={t.colors} v={sample} /></div>
            </div>
            <details><summary className="small">تعديل</summary>
              <ActionForm action={templateSaveAction.bind(null, t.id)} className="stack"><TemplateFields t={t} /><Submit className="btn sm go">حفظ</Submit></ActionForm>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
