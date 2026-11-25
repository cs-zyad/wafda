import Link from "next/link";
import { owned } from "@/server/owned";
import { invitationsOf } from "@/server/domain/events";
import { Tabs } from "@/ui/Tabs";
import { Back, Tag } from "@/ui/kit";
import { fmtDateTime } from "@/shared/time";
import { EventStatus } from "@/ui/EventStatus";

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { e } = await owned((await params).id);
  const invs = e.type === "private" ? await invitationsOf(e.id) : [];
  const base = `/dashboard/events/${e.id}`;
  const paid = e.paidPlaces > 0;
  const priv = e.type === "private";
  const steps = [
    { t: "البيانات", d: "الاسم والموعد والمكان", done: true, href: `${base}/details` },
    { t: "القالب", d: "اختيار ومعاينة", done: !!e.templateId, href: `${base}/template` },
    priv ? { t: "المدعوون", d: `${invs.length} دعوة`, done: invs.length > 0, href: `${base}/guests` } : { t: "السعة", d: `${e.maxAttendees} مكان`, done: true, href: `${base}/details` },
    { t: "الدفع", d: paid ? `${e.paidPlaces} مكان مدفوع` : "الباقة", done: paid, href: `${base}/payment` },
    priv ? { t: "الإرسال", d: "الدعوات والتذكير", done: invs.some((i) => i.sendStatus === "sent"), href: `${base}/send` } : { t: "النشر", d: "الرابط العام", done: paid, href: `${base}/payment` },
  ];
  const now = steps.findIndex((s) => !s.done);
  const tabs: [string, string][] = [
    ["", "نظرة عامة"],
    ["guests", priv ? "المدعوون" : "المسجلون"],
    ...(priv ? [["send", "الإرسال والتذكيرات"] as [string, string]] : []),
    ["waitlist", "قائمة الانتظار"],
    ["template", "القالب والمعاينة"],
    ["payment", priv ? "الباقة والدفع" : "الباقة والرابط العام"],
    ["staff", "فريق الاستقبال"],
    ["details", "البيانات"],
    ["messages", "سجل الرسائل"],
  ];
  return (
    <>
      <Back href="/dashboard">فعالياتي</Back>
      <div className="row between" style={{ alignItems: "flex-start", margin: "6px 0 14px" }}>
        <div className="grow">
          <h1 style={{ marginBottom: 2 }} className="break">{e.title}</h1>
          <div className="small muted">{fmtDateTime(e.startAt)} · {e.venue}</div>
        </div>
        <div className="row">
          <Tag>{priv ? "دعوات خاصة بالاسم" : "رابط عام"}</Tag>
          <EventStatus e={e} />
          {e.status === "active" ? <Link className="btn sm dark" href={`/checkin/${e.id}`}>التحضير</Link> : null}
        </div>
      </div>
      {e.status !== "cancelled" ? (
        <ol className="steps" aria-label="خطوات التجهيز">
          {steps.map((s, i) => (
            <li key={s.t}>
              <Link href={s.href} className={`${s.done ? "done" : ""} ${i === now ? "now" : ""}`}>
                <b>{s.done ? "✓" : `${i + 1}.`} {s.t}</b>
                <span className="muted">{s.d}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
      <Tabs base={base} items={tabs} />
      {children}
    </>
  );
}
