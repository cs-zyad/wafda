import type { EventDoc } from "@/server/types";
import type { Res } from "@/server/session";
import { msToRiyadhLocal } from "@/shared/time";
import { ActionForm, Submit } from "./client";

export function EventForm({ action, e, label }: { action: (p: Res | null, fd: FormData) => Promise<Res>; e?: EventDoc; label: string }) {
  const locked = !!e && e.paidPlaces > 0;
  return (
    <ActionForm action={action} className="stack">
      <div className="grid g2">
        <label className="field"><span>اسم الفعالية</span><input name="title" required minLength={3} maxLength={120} defaultValue={e?.title} placeholder="مثال: ملتقى النادي السنوي" /></label>
        <label className="field"><span>الجهة المنظّمة (تظهر في الدعوة)</span><input name="orgName" required maxLength={120} defaultValue={e?.orgName} placeholder="مثال: نادي التقنية" /></label>
      </div>
      <label className="field"><span>الوصف</span><textarea name="description" maxLength={2000} defaultValue={e?.description} placeholder="نبذة قصيرة تظهر في الدعوة" /></label>
      <div className="grid g2">
        <label className="field"><span>البداية (بتوقيت الرياض)</span><input type="datetime-local" name="start" required defaultValue={e ? msToRiyadhLocal(e.startAt) : ""} /></label>
        <label className="field"><span>النهاية (بتوقيت الرياض)</span><input type="datetime-local" name="end" required defaultValue={e ? msToRiyadhLocal(e.endAt) : ""} /></label>
      </div>
      <div className="grid g3">
        <label className="field"><span>المكان</span><input name="venue" required maxLength={160} defaultValue={e?.venue} placeholder="مثال: قاعة الملتقى" /></label>
        <label className="field"><span>العنوان</span><input name="address" maxLength={300} defaultValue={e?.address} placeholder="الحي، المدينة" /></label>
        <label className="field"><span>رابط الخريطة</span><input type="url" name="mapUrl" maxLength={500} defaultValue={e?.mapUrl} placeholder="https://maps.google.com/…" /></label>
      </div>
      <div className="grid g3">
        <label className="field">
          <span>الحد الأقصى للحضور</span>
          <input type="number" name="maxAttendees" required min={1} max={20000} defaultValue={e?.maxAttendees ?? 50} inputMode="numeric" />
          <small>السعة الفعلية = الأقل بين الحد الأقصى والأماكن المدفوعة.</small>
        </label>
        <fieldset>
          <legend className="label">نوع الدعوة</legend>
          <div className="stack" style={{ gap: 6 }}>
            {locked ? <input type="hidden" name="type" value={e!.type} /> : null}
            <label className="choice"><input type="radio" name="type" value="private" defaultChecked={!e || e.type === "private"} disabled={locked} /><span><b>خاصة بالاسم</b><br /><span className="small muted">قائمة مدعوين، ولكل مدعو رابطه</span></span></label>
            <label className="choice"><input type="radio" name="type" value="public" defaultChecked={e?.type === "public"} disabled={locked} /><span><b>رابط عام</b><br /><span className="small muted">أي شخص يسجّل ضمن السعة</span></span></label>
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">عند اكتمال العدد</legend>
          <div className="stack" style={{ gap: 6 }}>
            <label className="choice"><input type="radio" name="fullPolicy" value="close" defaultChecked={!e || e.fullPolicy === "close"} /><span>إغلاق التسجيل برسالة «اكتمل العدد»</span></label>
            <label className="choice"><input type="radio" name="fullPolicy" value="waitlist" defaultChecked={e?.fullPolicy === "waitlist"} /><span>قائمة انتظار</span></label>
          </div>
        </fieldset>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}><Submit>{label}</Submit></div>
    </ActionForm>
  );
}
