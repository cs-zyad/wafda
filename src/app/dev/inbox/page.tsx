import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { demo } from "@/server/session";
import { PublicBar } from "@/ui/Shell";
import { Alert, Empty, KIND, Ltr, Tag } from "@/ui/kit";
import { fmtShort } from "@/shared/time";

export const metadata = { title: "صندوق الرسائل التجريبي", robots: { index: false } };
type M = { id: string; channel: "whatsapp" | "email"; to: string; subject: string; body: string; kind: string; template: string; at: number };

const Linkify = ({ text }: { text: string }) => <>{text.split(/(https?:\/\/\S+)/g).map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} className="ltr" style={{ wordBreak: "break-all" }}>{p}</a> : <span key={i}>{p}</span>))}</>;

export default async function Inbox({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  if (!demo()) notFound();
  const to = ((await searchParams).to ?? "").trim();
  const q = to ? db().collection("devInbox").where("to", "==", to) : db().collection("devInbox").orderBy("at", "desc").limit(200);
  const list = (await q.get()).docs.map((d) => d.data() as M).sort((a, b) => b.at - a.at);
  return (
    <>
      <PublicBar />
      <main className="wrap page"><div className="medium stack" style={{ marginInline: "auto" }}>
        <h1>صندوق الرسائل التجريبي</h1>
        <Alert>رسائل واتساب والبريد في الوضع التجريبي تظهر هنا. محاكاة: رقم ينتهي بـ <Ltr>0000</Ltr> أو بريد فيه <Ltr>fail</Ltr> = فشل نهائي؛ رقم ينتهي بـ <Ltr>1111</Ltr> أو بريد فيه <Ltr>flaky</Ltr> = فشل مؤقت ثم نجاح.</Alert>
        <form className="row" role="search"><input type="search" name="to" defaultValue={to} placeholder="تصفية بالمستلم (+9665… أو البريد)" className="ltr-in" aria-label="المستلم" style={{ maxWidth: 360 }} /><button className="btn sm">تصفية</button></form>
        {list.length ? <div className="list">{list.map((m) => (
          <article key={m.id} className="item stack" style={{ gap: 6 }}>
            <div className="row between"><span className="row" style={{ gap: 6 }}><Tag tone={m.channel === "whatsapp" ? "ok" : "info"}>{m.channel === "whatsapp" ? "واتساب" : "البريد"}</Tag><Tag>{KIND[m.kind] ?? m.kind}</Tag><Ltr className="small">{m.to}</Ltr></span><span className="tiny muted">{fmtShort(m.at)}</span></div>
            {m.channel === "email" ? <b className="small">{m.subject}</b> : null}
            <div className={`bubble${m.channel === "email" ? " mail" : ""}`}><Linkify text={m.body} /></div>
            <span className="tiny muted ltr">template: {m.template}</span>
          </article>
        ))}</div> : <Empty>لا رسائل.</Empty>}
      </div></main>
    </>
  );
}
