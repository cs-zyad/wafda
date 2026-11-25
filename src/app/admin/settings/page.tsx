import { getSettings } from "@/server/domain/settings";
import { ActionForm, Submit } from "@/ui/client";
import { Alert, Title } from "@/ui/kit";
import { settingsAction } from "../actions";

export const metadata = { title: "الأسعار والسياسات" };
const r = (h: number) => (h / 100).toFixed(2);
const N = ({ name, label, v, step = "0.01", min = 0, max }: { name: string; label: string; v: string | number; step?: string; min?: number; max?: number }) => (
  <label className="field"><span>{label}</span><input type="number" name={name} defaultValue={v} step={step} min={min} max={max} required /></label>
);

export default async function Settings() {
  const s = await getSettings();
  return (
    <div className="medium">
      <Title sub="كل تعديل يُسجّل في سجل التدقيق. المبالغ بالريال وتُخزن بالهللة.">الباقات والتسعير وسياسات التشغيل</Title>
      <ActionForm action={settingsAction} className="stack-lg">
        <section className="card stack">
          <h2>الباقات</h2>
          <label className="check"><input type="checkbox" name="demo" defaultChecked={s.prices.demo} /><span>الأسعار تجريبية (يظهر للمنظّمين أنها «تجريبية»)</span></label>
          {s.prices.packages.map((p, i) => <div key={i} className="grid g2"><N name={`p${i}`} label={`أماكن الباقة ${i + 1}`} v={p.places} step="1" min={1} /><N name={`v${i}`} label="السعر (ر.س)" v={r(p.price)} /></div>)}
          <N name="extra" label="سعر المكان الإضافي (ر.س)" v={r(s.prices.extraPlace)} />
        </section>
        <section className="card stack">
          <h2>الرسائل</h2>
          <div className="grid g2">
            <N name="wa" label="سعر رسالة واتساب للمنظّم (ر.س)" v={r(s.prices.message.whatsapp)} />
            <N name="em" label="سعر رسالة البريد للمنظّم (ر.س)" v={r(s.prices.message.email)} />
            <N name="owa" label="تكلفة تشغيل تأكيد واتساب (تقديرية)" v={r(s.prices.confirmOpCost.whatsapp)} />
            <N name="oem" label="تكلفة تشغيل تأكيد البريد (تقديرية)" v={r(s.prices.confirmOpCost.email)} />
          </div>
        </section>
        <section className="card stack">
          <h2>سياسات التشغيل</h2>
          <fieldset><legend className="label">الرصيد غير الكافي</legend>
            <div className="choices">
              <label className="choice"><input type="radio" name="lowCredit" value="block" defaultChecked={s.policy.lowCredit === "block"} /><span>منع الإرسال كاملًا (الافتراضي)</span></label>
              <label className="choice"><input type="radio" name="lowCredit" value="partial" defaultChecked={s.policy.lowCredit === "partial"} /><span>إرسال ما يغطيه الرصيد بترتيب القائمة</span></label>
            </div>
          </fieldset>
          <div className="grid g3">
            <N name="attempts" label="محاولات الإرسال" v={s.policy.maxAttempts} step="1" min={1} max={10} />
            <N name="retry" label="مهلة إعادة المحاولة (ث، تتضاعف)" v={s.policy.retryBaseSec} step="1" max={3600} />
            <N name="offer" label="صلاحية فرصة الانتظار (ساعة)" v={s.policy.offerHours} step="1" min={1} max={336} />
            <N name="resend" label="أدنى مدة بين إعادة إرسال التذكرة (دقيقة)" v={s.policy.resendMinMinutes} step="1" max={1440} />
            <N name="staffDays" label="صلاحية دعوة الاستقبال (يوم)" v={s.policy.staffInviteDays} step="1" min={1} max={30} />
          </div>
          <Alert>إعادة الإرسال من المنظّم (بعد تصحيح الرقم مثلًا) رسالة جديدة بتكلفة جديدة.</Alert>
        </section>
        <Submit>حفظ الإعدادات</Submit>
      </ActionForm>
    </div>
  );
}
