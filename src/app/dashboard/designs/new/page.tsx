import { needOrganizer } from "@/server/session";
import { eventsOf } from "@/server/domain/events";
import { ActionForm, Submit } from "@/ui/client";
import { Back, Title } from "@/ui/kit";
import { requestDesignAction } from "../../actions";

export default async function NewDesign() {
  const events = await eventsOf((await needOrganizer()).id);
  return (
    <div className="medium">
      <Back href="/dashboard/designs">طلبات التصميم</Back>
      <Title>طلب تصميم خاص</Title>
      <div className="card">
        <ActionForm action={requestDesignAction} className="stack">
          <label className="field"><span>العنوان</span><input name="title" required minLength={3} maxLength={120} placeholder="مثال: قالب بهوية النادي" /></label>
          <label className="field"><span>التفاصيل</span><textarea name="details" required minLength={10} maxLength={3000} placeholder="الألوان، الشعار، الأسلوب…" /></label>
          <label className="field"><span>رابط مرجعي (اختياري)</span><input type="url" name="refUrl" placeholder="https://" /></label>
          <label className="field"><span>الفعالية (اختياري)</span><select name="eventId" defaultValue=""><option value="">بدون</option>{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
          <Submit>إرسال الطلب</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
