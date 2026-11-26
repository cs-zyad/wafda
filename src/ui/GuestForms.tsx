"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Res } from "@/server/session";
import type { Result } from "@/server/domain/rsvp";
import { useToast } from "./client";

type Rsvp = (p: Res<Result> | null, fd: FormData) => Promise<Res<Result>>;

function Go({ children, className = "btn go lg full", name, value }: { children: React.ReactNode; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} name={name} value={value}>
      {pending ? "جارٍ الإرسال…" : children}
    </button>
  );
}

/** حالات النتيجة غير المؤكدة مع خيارات المتابعة */
function Outcome({ r }: { r: Result }) {
  if (r.status === "one_left")
    return (
      <div className="alert warn stack" role="alert">
        <b>تبقّى مقعد واحد فقط</b>
        <span>لا يتسع المكان لك ولمرافقك معًا. أكّد منفردًا{r.canWaitlist ? "، أو انضم لقائمة الانتظار بطلب مقعدين" : ""}.</span>
        <div className="row">
          <Go className="btn dark" name="single" value="1">أكّد حضوري منفردًا</Go>
          {r.canWaitlist ? <Go className="btn ghost" name="waitlist" value="1">انضم للانتظار بمقعدين</Go> : null}
        </div>
      </div>
    );
  if (r.status === "full")
    return (
      <div className="alert bad stack" role="alert">
        <b>اكتمل العدد</b>
        {r.canWaitlist ? (
          <>
            <span>انضم لقائمة الانتظار، ويصلك إشعار إن توفر مقعد.</span>
            <Go className="btn dark" name="waitlist" value="1">انضم لقائمة الانتظار</Go>
          </>
        ) : (
          <span>نعتذر، لا توجد مقاعد متاحة.</span>
        )}
      </div>
    );
  if (r.status === "duplicate")
    return (
      <div className="alert info" role="status">
        <b>وسيلة التواصل هذه مسجّلة مسبقًا.</b> {r.resent ? "أعدنا إرسال التذكرة إلى صاحب الوسيلة المسجّلة." : "أُرسلت التذكرة إليها قبل قليل؛ تحقق من الرسائل، ويمكن طلب إعادة الإرسال بعد دقائق."}
      </div>
    );
  if (r.status === "closed") return <div className="alert bad">{r.reason}</div>;
  if (r.status === "offer_expired") return <div className="alert warn">انتهت صلاحية فرصة التأكيد، وعدت لقائمة الانتظار.</div>;
  if (r.status === "offer_lost") return <div className="alert warn">نعتذر، أخذ ضيف آخر المقعد قبل تأكيدك. ما زلت في قائمة الانتظار.</div>;
  if (r.status === "waitlisted") return <div className="alert info">أنت في قائمة الانتظار.</div>;
  return null;
}

const hidesSubmit = (r?: Result | null) => !!r && (r.status === "one_left" || (r.status === "full" && r.canWaitlist));

export function RsvpForm({ action, d, companion, label = "أكّد حضورك", formKey, waitOnly, wa = true }: { action: Rsvp; d: { name: string; phone: string; email: string }; companion: boolean; label?: string; formKey?: string; waitOnly?: boolean; wa?: boolean }) {
  const toast = useToast();
  const [st, run] = useActionState(async (p: Res<Result> | null, fd: FormData) => {
    const r = await action(p, fd);
    if (!r.ok) toast(false, r.msg);
    return r;
  }, null);
  const [type, setType] = useState<"phone" | "email">(wa && (d.phone || !d.email) ? "phone" : "email");
  const r = st?.ok ? st.data : null;
  return (
    <form action={run} className="stack">
      {formKey ? <input type="hidden" name="key" value={formKey} /> : null}
      {waitOnly ? <input type="hidden" name="waitlist" value="1" /> : null}
      <label className="field">
        <span>الاسم</span>
        <input name="name" required minLength={2} maxLength={120} defaultValue={d.name} autoComplete="name" />
      </label>
      {!wa ? <input type="hidden" name="contactType" value="email" /> : null}
      {wa ? <fieldset>
        <legend className="label">أين نرسل لك التذكرة؟</legend>
        <div className="choices" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="choice"><input type="radio" name="contactType" value="phone" checked={type === "phone"} onChange={() => setType("phone")} /><span>واتساب</span></label>
          <label className="choice"><input type="radio" name="contactType" value="email" checked={type === "email"} onChange={() => setType("email")} /><span>البريد</span></label>
        </div>
      </fieldset> : null}
      {type === "phone" ? (
        <label className="field" key="p"><span>رقم الجوال (واتساب)</span><input type="tel" name="contact" required inputMode="tel" placeholder="05xxxxxxxx" defaultValue={d.phone} autoComplete="tel" /></label>
      ) : (
        <label className="field" key="e"><span>{wa ? "البريد الإلكتروني" : "بريدك الإلكتروني (تصلك عليه التذكرة)"}</span><input type="email" name="contact" required placeholder="name@example.com" defaultValue={d.email} autoComplete="email" /></label>
      )}
      {companion ? (
        <label className="check">
          <input type="checkbox" name="companion" />
          <span>معي مرافق <span className="small muted">(يُحجز مقعدان، ولمرافقك تذكرة مستقلة)</span></span>
        </label>
      ) : null}
      {r ? <Outcome r={r} /> : null}
      {!hidesSubmit(r) ? <Go>{waitOnly ? "انضم لقائمة الانتظار" : label}</Go> : null}
      <p className="tiny muted center" style={{ margin: 0 }}>يُحجز مقعدك لحظة التأكيد، ويُسجَّل حضورك الفعلي عند الدخول.</p>
    </form>
  );
}

export function ConfirmAgain({ action, label = "أكّد حضورك" }: { action: Rsvp; label?: string }) {
  const toast = useToast();
  const [st, run] = useActionState(async (p: Res<Result> | null, fd: FormData) => {
    const r = await action(p, fd);
    if (!r.ok) toast(false, r.msg);
    return r;
  }, null);
  const r = st?.ok ? st.data : null;
  return (
    <form action={run} className="stack">
      {r ? <Outcome r={r} /> : null}
      {!hidesSubmit(r) && r?.status !== "full" ? <Go>{label}</Go> : null}
    </form>
  );
}

export function Decline({ action, label = "أعتذر عن الحضور" }: { action: () => Promise<Res>; label?: string }) {
  const toast = useToast();
  return (
    <form
      action={async () => {
        const r = await action();
        toast(r.ok, r.msg ?? "");
      }}
      onSubmit={(e) => !window.confirm("تأكيد الاعتذار؟ سيُحرَّر مقعدك وتُلغى تذكرتك.") && e.preventDefault()}
    >
      <Go className="btn ghost full">{label}</Go>
    </form>
  );
}
