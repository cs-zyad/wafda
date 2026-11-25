import type { Template } from "@/server/types";
import { LAYOUTS, COLOR_ROLES } from "@/server/domain/templates";

export function TemplateFields({ t, noVisibility }: { t?: Partial<Template>; noVisibility?: boolean }) {
  const layout = t?.layout ?? "plum_frame";
  const colors = t?.colors ?? LAYOUTS[layout].colors;
  return (
    <div className="stack">
      <div className="grid g3">
        <label className="field"><span>التخطيط</span><select name="layout" defaultValue={layout}>{Object.entries(LAYOUTS).map(([k, l]) => <option key={k} value={k}>{l.label}</option>)}</select></label>
        <label className="field"><span>الاسم</span><input name="name" required maxLength={80} defaultValue={t?.name ?? ""} /></label>
        <label className="field"><span>التصنيف</span><input name="category" maxLength={60} defaultValue={t?.category ?? ""} /></label>
      </div>
      <fieldset><legend className="label">الألوان الخمسة</legend>
        <div className="row">{COLOR_ROLES.map((r, i) => <label key={r} className="row small" style={{ gap: 6 }}><input type="color" name={`c${i}`} defaultValue={colors[i]} aria-label={r} />{r}</label>)}</div>
      </fieldset>
      {noVisibility ? null : (
        <div className="row">
          <label className="check"><input type="checkbox" name="visible" defaultChecked={t?.visible ?? true} /><span>ظاهر للمنظّمين</span></label>
          <label className="row small" style={{ gap: 6 }}>الترتيب <input type="number" name="order" defaultValue={t?.order ?? 10} style={{ width: 90 }} /></label>
        </div>
      )}
    </div>
  );
}
