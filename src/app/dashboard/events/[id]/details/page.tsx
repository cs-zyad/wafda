import { owned } from "@/server/owned";
import { EventForm } from "@/ui/EventForm";
import { Alert } from "@/ui/kit";
import { updateEventAction } from "../../../actions";

export default async function Details({ params }: { params: Promise<{ id: string }> }) {
  const { e } = await owned((await params).id);
  return (
    <div className="stack">
      {e.paidPlaces > 0 ? <Alert>نوع الدعوة لا يتغير بعد الدفع. أي تعديل يظهر فورًا في صفحة الدعوة والرسائل القادمة لأنها من مصدر واحد.</Alert> : null}
      <div className="card"><EventForm action={updateEventAction.bind(null, e.id)} e={e} label="حفظ البيانات" /></div>
    </div>
  );
}
