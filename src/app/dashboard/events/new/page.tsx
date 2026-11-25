import { EventForm } from "@/ui/EventForm";
import { Back, Title } from "@/ui/kit";
import { createEventAction } from "../../actions";

export const metadata = { title: "فعالية جديدة" };
export default function NewEvent() {
  return (
    <div className="medium">
      <Back href="/dashboard">فعالياتي</Back>
      <Title sub="الخطوة 1 من 5: البيانات. بعدها تختار القالب وتعاين الدعوة.">فعالية جديدة</Title>
      <div className="card"><EventForm action={createEventAction} label="حفظ المسودة والمتابعة للقالب" /></div>
    </div>
  );
}
