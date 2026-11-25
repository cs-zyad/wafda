import { owned } from "@/server/owned";
import { waitlistOf } from "@/server/domain/rsvp";
import { available } from "@/server/domain/events";
import { getSettings } from "@/server/domain/settings";
import { ActionForm, Submit } from "@/ui/client";
import { Key } from "@/ui/Key";
import { Alert, Empty, Ltr, Tag } from "@/ui/kit";
import { fmtShort } from "@/shared/time";
import { sar } from "@/shared/money";
import { offerAction } from "../../../actions";

export default async function Waitlist({ params }: { params: Promise<{ id: string }> }) {
  const { user, e } = await owned((await params).id);
  const [list, s] = await Promise.all([waitlistOf(user.id, e.id), getSettings()]);
  const free = available(e);
  return (
    <div className="stack">
      {e.fullPolicy !== "waitlist" ? <Alert>سياسة هذه الفعالية «إغلاق عند اكتمال العدد»، فلا تُستقبل طلبات انتظار جديدة.</Alert> : null}
      <Alert tone={free > 0 ? "ok" : "warn"}>
        المقاعد المتاحة الآن: <b className="num">{free}</b>. {free > 0 ? `اختر شخصًا وأرسل له فرصة صالحة ${s.policy.offerHours} ساعة. الفرصة لا تحجز المقعد؛ يُحجز عند تأكيده إن كان لا يزال متاحًا.` : "لا يمكن إرسال فرصة قبل توفر مقعد (اعتذار ضيف أو شراء أماكن)."} تكلفة الرسالة من رصيد الرسائل ({sar(s.prices.message.whatsapp)} واتساب / {sar(s.prices.message.email)} بريد).
      </Alert>
      {list.length ? (
        <div className="list">
          {list.map((r, i) => (
            <div key={r.id} className="item row between">
              <div className="grow">
                <b>{i + 1}. {r.name}</b> <Tag>{r.wantSeats > 1 ? "يطلب مقعدين (مع مرافق)" : "مقعد واحد"}</Tag>
                <div className="meta"><Ltr>{r.contact}</Ltr> · في الانتظار منذ {fmtShort(r.waitlistedAt ?? r.createdAt)}</div>
                {r.status === "offered" ? <Tag tone="info">وصلته فرصة — حتى {fmtShort(r.offerUntil!)}</Tag> : null}
              </div>
              {r.status === "waitlisted" ? (
                <ActionForm action={offerAction.bind(null, e.id, r.id)} confirm={`إرسال فرصة تأكيد إلى ${r.name}؟`}>
                  <Key /><Submit className="btn sm go" disabled={free < 1}>إرسال فرصة</Submit>
                </ActionForm>
              ) : null}
            </div>
          ))}
        </div>
      ) : <Empty>قائمة الانتظار فارغة.</Empty>}
    </div>
  );
}
