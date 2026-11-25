import { needOrganizer } from "@/server/session";
import { eventsOf } from "@/server/domain/events";
import { ActionForm, Submit } from "@/ui/client";
import { Back, Title } from "@/ui/kit";
import { openTicketAction } from "../../actions";

export default async function NewTicket() {
  const events = await eventsOf((await needOrganizer()).id);
  return (
    <div className="medium">
      <Back href="/dashboard/support">الدعم</Back>
      <Title>طلب دعم أو شكوى</Title>
      <div className="card">
        <ActionForm action={openTicketAction} className="stack">
          <label className="field"><span>النوع</span><select name="kind" defaultValue="support"><option value="support">استفسار/دعم</option><option value="complaint">شكوى</option><option value="billing">فوترة ومدفوعات</option></select></label>
          <label className="field"><span>العنوان</span><input name="subject" required minLength={3} maxLength={160} /></label>
          <label className="field"><span>التفاصيل</span><textarea name="body" required maxLength={4000} /></label>
          <label className="field"><span>الفعالية (اختياري)</span><select name="eventId" defaultValue=""><option value="">بدون</option>{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
          <Submit>إرسال</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
