import Link from "next/link";
import { owned } from "@/server/owned";
import { eventData } from "@/server/domain/stats";
import { lastArrivals } from "@/server/domain/checkin";
import { link } from "@/server/domain/view";
import { Alert, Stat, Tag } from "@/ui/kit";
import { AutoRefresh, CopyBox, Do } from "@/ui/client";
import { fmtShort, HOUR, nowMs } from "@/shared/time";
import { cancelEventAction } from "../../actions";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { e } = await owned((await params).id);
  const [{ n }, recent] = await Promise.all([eventData(e), lastArrivals(e.id)]);
  const t = nowMs();
  const live = e.status === "active" && t > e.startAt - 6 * HOUR && t < e.endAt + 2 * HOUR;
  const inside = n.inGuests + n.inCompanions;
  const pct = (x: number) => (n.capacity ? Math.min(100, Math.round((x / n.capacity) * 100)) : 0);
  const base = `/dashboard/events/${e.id}`;
  const priv = e.type === "private";
  return (
    <div className="stack-lg">
      {e.status === "draft" ? (
        <Alert tone="warn">
          الفعالية مسودة. التالي: {!e.templateId ? <Link href={`${base}/template`}>اختر القالب</Link> : priv && !n.invitations ? <Link href={`${base}/guests`}>أضف المدعوين</Link> : <Link href={`${base}/payment`}>ادفع الباقة</Link>}
        </Alert>
      ) : null}
      {!priv && e.status === "active" ? (
        <div className="card soft"><div className="label" style={{ marginBottom: 6 }}>الرابط العام للتسجيل</div><CopyBox value={link.event(e.slug)} /></div>
      ) : null}
      <div className="row between">
        <h2 style={{ margin: 0 }}>الأرقام</h2>
        <div className="row"><AutoRefresh on={live} /><a className="btn sm ghost" href={`${base}/export`}>تنزيل كشف الحضور CSV</a></div>
      </div>
      <div>
        <div className="row between small" style={{ marginBottom: 6 }}>
          <span>المحجوز <b className="num">{e.reserved}</b> من سعة <b className="num">{n.capacity}</b> — حضر فعليًا <b className="num">{inside}</b></span>
          <span className="muted">متاح <b className="num">{n.free}</b></span>
        </div>
        <div className="meter" role="img" aria-label={`حضر ${pct(inside)}٪، مؤكد لم يحضر ${pct(e.reserved) - pct(inside)}٪`}>
          <span style={{ width: `${pct(inside)}%` }} />
          <span className="l" style={{ width: `${Math.max(0, pct(e.reserved) - pct(inside))}%` }} />
        </div>
        <div className="row tiny muted" style={{ marginTop: 4 }}>
          <span><i className="sw" style={{ background: "var(--plum)" }} /> حضر</span>
          <span><i className="sw" style={{ background: "var(--lime2)" }} /> مؤكد لم يحضر</span>
          <span><i className="sw" style={{ background: "var(--lilac)" }} /> متاح</span>
        </div>
      </div>
      <div className="grid g4">
        {priv ? <Stat k="الدعوات" v={n.invitations} s={`${n.invitedPeople} شخصًا بالمرافقين المسموحين`} /> : <Stat k="المسجلون" v={n.registrations} s="بكل الحالات" />}
        {priv ? <Stat k="لم يؤكد" v={n.noReply} s="دعوات بلا رد" /> : null}
        <Stat hl k="المؤكدون" v={n.confirmedPeople} s={`شخصًا — ${n.confirmedRegs} ${priv ? "دعوة" : "تسجيل"}`} />
        <Stat k="الحاضرون" v={inside} s={`${n.inGuests} ضيف + ${n.inCompanions} مرافق`} />
        <Stat k="المقاعد المتاحة" v={n.free} s={`من سعة ${n.capacity}`} />
        {priv ? <Stat k="تعذّر الإرسال" v={n.failed} s={n.notSent ? `${n.notSent} لم تُرسل بعد` : undefined} /> : null}
        <Stat k="الانتظار" v={n.waiting} />
        <Stat k="اعتذر" v={n.declined} s={n.cancelled ? `${n.cancelled} ألغاه المنظّم` : undefined} />
      </div>
      <div className="grid g2 top">
        <section className="card">
          <div className="head"><h3>آخر من حضر</h3><Link className="small" href={`/checkin/${e.id}`}>فتح التحضير</Link></div>
          {recent.length ? (
            <div className="list">
              {recent.map((r, i) => (
                <div key={i} className="row between small"><span className="break">{r.label}</span><span className="muted">{fmtShort(r.at)} <Tag>{r.method === "manual" ? "يدوي" : "مسح"}</Tag></span></div>
              ))}
            </div>
          ) : <p className="muted small">لم يحضر أحد بعد.</p>}
        </section>
        <section className="card stack">
          <h3>إجراءات</h3>
          <div className="row">
            {priv ? <Link className="btn sm" href={`${base}/send`}>الإرسال والتذكير</Link> : null}
            <Link className="btn sm" href={`${base}/guests`}>{priv ? "المدعوون" : "المسجلون"}</Link>
            <Link className="btn sm" href={`${base}/staff`}>فريق الاستقبال</Link>
          </div>
          {e.status !== "cancelled" ? <Do action={cancelEventAction.bind(null, e.id)} className="btn sm danger" confirm="إلغاء الفعالية نهائيًا؟ يتوقف التسجيل والتحضير.">إلغاء الفعالية</Do> : null}
        </section>
      </div>
    </div>
  );
}
