import Link from "next/link";
import { owned } from "@/server/owned";
import { eventData } from "@/server/domain/stats";
import { link } from "@/server/domain/view";
import { ActionForm, Copy, Do, Submit } from "@/ui/client";
import { ImportPanel } from "@/ui/ImportPanel";
import { CH, Empty, InTag, Ltr, RegTag, SendTag, Tag } from "@/ui/kit";
import { normalizeArabic, phoneSearchVariants } from "@/shared/text";
import { fmtShort } from "@/shared/time";
import type { Registration, Ticket } from "@/server/types";
import { addGuestAction, editGuestAction, deleteGuestAction, readImportAction, recheckImportAction, commitImportAction, cancelRegAction, resendAction } from "../../../actions";

const FILTERS: [string, string, boolean][] = [["all", "الكل", true], ["none", "لم يؤكد", false], ["confirmed", "مؤكد", true], ["in", "حضر", true], ["declined", "اعتذر", true], ["waiting", "الانتظار", true], ["failed", "تعذّر الإرسال", false], ["not_sent", "لم تُرسل", false]];
const hit = (q: string, name: string, contacts: (string | null | undefined)[]) => {
  if (!q) return true;
  if (normalizeArabic(name).includes(normalizeArabic(q))) return true;
  const v = phoneSearchVariants(q);
  return contacts.some((c) => c && (c.toLowerCase().includes(q.toLowerCase()) || v.some((x) => c.replace(/\D/g, "").includes(x))));
};

function RegButtons({ id, reg, ts }: { id: string; reg?: Registration; ts: Ticket[] }) {
  if (reg?.status !== "confirmed") return null;
  return (
    <>
      <Do action={resendAction.bind(null, id, reg.id)}>إعادة إرسال التذكرة</Do>
      {!ts.some((t) => t.status === "active" && t.inAt) ? <Do action={cancelRegAction.bind(null, id, reg.id)} className="btn sm danger" confirm={`إلغاء تسجيل ${reg.name}؟ تُحرَّر المقاعد وتُلغى التذاكر.`}>إلغاء التسجيل</Do> : null}
    </>
  );
}

export default async function Guests({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; f?: string }> }) {
  const { e } = await owned((await params).id);
  const { q = "", f = "all" } = await searchParams;
  const { invs, regs, tickets } = await eventData(e);
  const regOf = new Map(regs.map((r) => [r.id, r]));
  const tOf = Object.groupBy(tickets, (t) => t.registrationId);
  const inside = (rid?: string) => !!rid && (tOf[rid] ?? []).some((t) => t.status === "active" && t.inAt);
  const base = `/dashboard/events/${e.id}/guests`;
  const priv = e.type === "private";
  const nav = (
    <form className="row" role="search" action={base}>
      <input type="search" name="q" defaultValue={q} placeholder="بحث بالاسم أو الجوال أو البريد" aria-label="بحث" style={{ maxWidth: 320 }} />
      <input type="hidden" name="f" value={f} />
      <button className="btn sm">بحث</button>
      <div className="pills">
        {FILTERS.filter(([, , both]) => priv || both).map(([k, l]) => (
          <Link key={k} href={`${base}?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={f === k ? "true" : undefined}>{l}</Link>
        ))}
      </div>
    </form>
  );

  if (!priv) {
    const list = regs.filter((r) => hit(q, r.name, [r.contact])).filter((r) => f === "all" || (f === "in" ? inside(r.id) : f === "waiting" ? r.status === "waitlisted" || r.status === "offered" : r.status === f));
    return (
      <div className="stack">
        <p className="small muted">كشف الرابط العام: المسجلون والحاضرون (حالة «مدعو ولم يؤكد» تخص الدعوات الخاصة فقط).</p>
        {nav}
        {list.length ? (
          <div className="list">
            {list.map((r) => (
              <div className="item" key={r.id}>
                <div className="row between"><b>{r.name}</b><span className="row" style={{ gap: 6 }}><RegTag s={r.status} /><InTag t={(tOf[r.id] ?? []).find((t) => t.kind === "guest")} /></span></div>
                <div className="meta">{r.contactType === "phone" ? "واتساب" : "البريد"}: <Ltr>{r.contact}</Ltr> · سجّل {fmtShort(r.createdAt)}</div>
                <div className="row" style={{ marginTop: 8, gap: 6 }}><RegButtons id={e.id} reg={r} ts={tOf[r.id] ?? []} /></div>
              </div>
            ))}
          </div>
        ) : <Empty>لا مسجلين مطابقين.</Empty>}
      </div>
    );
  }

  const list = invs
    .filter((i) => hit(q, regOf.get(`inv_${i.id}`)?.name || i.name, [i.phone, i.email, regOf.get(`inv_${i.id}`)?.contact]))
    .filter((i) => (f === "all" ? true : f === "in" ? inside(`inv_${i.id}`) : f === "waiting" ? i.regStatus === "waitlisted" || i.regStatus === "offered" : f === "failed" || f === "not_sent" ? i.sendStatus === f : i.regStatus === f));
  return (
    <div className="stack-lg">
      <div className="grid g2 top">
        <section className="card">
          <h3>إضافة مدعو</h3>
          <ActionForm action={addGuestAction.bind(null, e.id)} className="stack" reset>
            <label className="field"><span>الاسم</span><input name="name" required maxLength={120} /></label>
            <div className="grid g2">
              <label className="field"><span>الجوال</span><input type="tel" name="phone" placeholder="05xxxxxxxx" /></label>
              <label className="field"><span>البريد</span><input type="email" name="email" placeholder="name@example.com" /></label>
            </div>
            <label className="check"><input type="checkbox" name="companion" /><span>يسمح بمرافق واحد (مكانان في الباقة)</span></label>
            <Submit>إضافة</Submit>
          </ActionForm>
        </section>
        <section className="card">
          <div className="head"><h3>استيراد من Excel</h3><a className="btn sm ghost" href="/api/sample-import">تنزيل ملف نموذجي</a></div>
          <p className="small muted">الأعمدة: الاسم، الجوال، البريد، مرافق (نعم/لا). يقبل ‎.xlsx و‎.csv بعناوين عربية أو إنجليزية، وبدون عناوين يُفترض هذا الترتيب.</p>
          <ImportPanel read={readImportAction.bind(null, e.id)} recheck={recheckImportAction.bind(null, e.id)} commit={commitImportAction.bind(null, e.id)} />
        </section>
      </div>
      <section className="stack">
        <h2 style={{ margin: 0 }}>المدعوون <span className="small muted">({invs.length} دعوة)</span></h2>
        {nav}
        {list.length ? (
          <div className="list">
            {list.map((i) => {
              const reg = regOf.get(`inv_${i.id}`);
              const ts = reg ? tOf[reg.id] ?? [] : [];
              return (
                <div className="item" key={i.id}>
                  <div className="row between">
                    <div><b>{reg?.name || i.name}</b> {i.companion ? <Tag>يسمح بمرافق</Tag> : null}</div>
                    <span className="row" style={{ gap: 6 }}><SendTag s={i.sendStatus} /><RegTag s={i.regStatus} /></span>
                  </div>
                  <div className="meta">
                    {i.phone ? <>جوال <Ltr>{i.phone}</Ltr> </> : null}
                    {i.email ? <>· بريد <Ltr>{i.email}</Ltr> </> : null}
                    {i.channel ? <>· القناة: {i.channel === "both" ? "الاثنان" : CH[i.channel]} </> : null}
                    {reg?.status === "confirmed" ? <>· أكّد عبر {reg.contactType === "phone" ? "واتساب" : "البريد"} — {reg.seats > 1 ? "مع مرافق" : "منفرد"}</> : null}
                  </div>
                  {reg?.status === "confirmed" ? (
                    <div className="row" style={{ gap: 6, marginTop: 6 }}>
                      <InTag t={ts.find((t) => t.kind === "guest")} who="الضيف" />
                      {reg.seats > 1 ? <InTag t={ts.find((t) => t.kind === "companion")} who="المرافق" /> : null}
                    </div>
                  ) : null}
                  <div className="row" style={{ gap: 6, marginTop: 8 }}>
                    <Copy text={link.invitation(i.token)} label="نسخ رابط الدعوة" />
                    <RegButtons id={e.id} reg={reg} ts={ts} />
                    <details>
                      <summary className="btn sm ghost" style={{ listStyle: "none" }}>تعديل</summary>
                      <div className="card soft stack" style={{ marginTop: 8 }}>
                        <ActionForm action={editGuestAction.bind(null, e.id, i.id)} className="stack">
                          <label className="field"><span>الاسم</span><input name="name" defaultValue={i.name} required /></label>
                          <div className="grid g2">
                            <label className="field"><span>الجوال</span><input type="tel" name="phone" defaultValue={i.phone ?? ""} /></label>
                            <label className="field"><span>البريد</span><input type="email" name="email" defaultValue={i.email ?? ""} /></label>
                          </div>
                          <label className="field"><span>قناة الإرسال لهذا المدعو</span>
                            <select name="channel" defaultValue={i.channel ?? ""}><option value="">حسب اختيار القائمة</option><option value="whatsapp">واتساب</option><option value="email">البريد</option><option value="both">الاثنان</option></select>
                          </label>
                          <label className="check"><input type="checkbox" name="companion" defaultChecked={i.companion} /><span>يسمح بمرافق</span></label>
                          <Submit className="btn sm go">حفظ</Submit>
                        </ActionForm>
                        {i.regStatus !== "confirmed" ? <Do action={deleteGuestAction.bind(null, e.id, i.id)} className="btn sm danger" confirm={`حذف دعوة ${i.name}؟`}>حذف الدعوة</Do> : null}
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <Empty>{invs.length ? "لا نتائج مطابقة." : "لم تُضف مدعوين بعد."}</Empty>}
      </section>
    </div>
  );
}
