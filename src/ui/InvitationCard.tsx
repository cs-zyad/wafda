import type { CSSProperties, ReactNode } from "react";
import type { LayoutKey } from "@/server/types";
import type { EventView } from "@/server/domain/view";
import { Mark } from "./Logo";

/**
 * التخطيطات الخمسة ثابتة في الكود؛ المنظّم يعبّي البيانات فقط.
 * كل البيانات تأتي من eventView (المصدر الوحيد). الألوان: [الخلفية، النص، المميز، الأسطح، النص الثانوي].
 */
export function InvitationCard({ layout, colors, v, children }: { layout: LayoutKey; colors: string[]; v: EventView; children?: ReactNode }) {
  const [bg, fg, accent, surface, soft] = colors;
  const style = { "--bg": bg, "--fg": fg, "--ac": accent, "--sf": surface, "--soft": soft } as CSSProperties;
  const lead = layout === "corporate" ? "يتشرف بدعوتكم لحضور" : layout === "workshop" ? "ندعوك للمشاركة في" : "يسعدنا دعوتك لحضور";
  return (
    <article className={`inv inv-${layout}`} style={style} aria-label={`دعوة: ${v.title}`}>
      <style>{CSS}</style>
      {layout === "corporate" ? <div className="inv-band" /> : null}
      {layout === "workshop" ? (
        <div className="inv-top">
          <span>{v.org}</span>
          <span className="inv-pill">ورشة / تدريب</span>
        </div>
      ) : null}
      <div className="inv-in">
        {layout === "plum_frame" ? <i className="inv-c1" /> : null}
        {layout === "plum_frame" ? <i className="inv-c2" /> : null}
        {layout !== "workshop" && v.org ? <p className="inv-org">{v.org}</p> : null}
        {v.guestName ? <p className="inv-guest">{layout === "corporate" ? "السيد/السيدة" : "عزيزنا"} {v.guestName}</p> : null}
        <p className="inv-lead">{lead}</p>
        <h2 className="inv-title">{v.title}</h2>
        {layout === "ivory_classic" ? <div className="inv-orn" aria-hidden="true">✦ ✦ ✦</div> : null}
        {v.description ? <p className="inv-desc">{v.description}</p> : null}
        <dl className="inv-meta">
          <div>
            <dt>الموعد</dt>
            <dd>
              {v.date}
              <small>الساعة {v.time} — {v.endTime}</small>
            </dd>
          </div>
          <div>
            <dt>المكان</dt>
            <dd>
              {v.venue || "—"}
              {v.address ? <small>{v.address}</small> : null}
              {v.mapUrl ? (
                <a href={v.mapUrl} target="_blank" rel="noopener noreferrer">
                  فتح الموقع على الخريطة
                </a>
              ) : null}
            </dd>
          </div>
        </dl>
        {children ? <div className="inv-slot">{children}</div> : null}
        <p className="inv-brand">
          <Mark size={15} bg={fg} fg={accent} tick={bg} /> {v.brand}
        </p>
      </div>
    </article>
  );
}

const CSS = `
.inv{background:var(--bg);color:var(--fg);border-radius:22px;overflow:hidden;box-shadow:0 10px 40px rgb(40 24 44/12%);position:relative}
.inv-in{position:relative;padding:30px 22px 18px;text-align:center}
.inv-org{margin:0 0 10px;font-weight:700;color:var(--soft);font-size:.95rem}
.inv-guest{margin:0 0 2px;font-family:var(--f-head)}
.inv-lead{margin:0 0 4px;color:var(--soft)}
.inv-title{margin:0 0 12px;font-family:var(--f-head);font-size:clamp(1.45rem,6vw,2rem);line-height:1.4;overflow-wrap:anywhere}
.inv-desc{margin:0 auto 14px;max-width:420px;color:var(--soft);font-size:.95rem;white-space:pre-line}
.inv-meta{display:grid;gap:10px;margin:14px 0 6px;text-align:right}
.inv-meta>div{background:var(--sf);border-radius:14px;padding:12px 14px}
.inv-meta dt{font-size:.8rem;font-weight:700;color:var(--soft)}
.inv-meta dd{margin:2px 0 0;font-weight:600;overflow-wrap:anywhere}
.inv-meta small{display:block;font-weight:400;color:var(--soft);font-size:.9rem}
.inv-meta a{display:inline-block;margin-top:2px;font-size:.9rem;color:inherit}
.inv-slot{margin-top:16px;text-align:right}
.inv-brand{margin:16px 0 0;display:flex;gap:6px;align-items:center;justify-content:center;font-size:.72rem;color:var(--soft)}
.inv-plum_frame .inv-in{margin:12px;border:2px solid color-mix(in srgb,var(--ac) 50%,transparent);border-radius:18px}
.inv-plum_frame .inv-title,.inv-plum_frame .inv-guest,.inv-plum_frame .inv-meta a{color:var(--ac)}
.inv-c1,.inv-c2{position:absolute;width:38px;height:38px;border:5px solid var(--ac)}
.inv-c1{top:-3px;right:-3px;border-left:0;border-bottom:0;border-top-right-radius:16px}
.inv-c2{bottom:-3px;left:-3px;border-right:0;border-top:0;border-bottom-left-radius:16px}
.inv-ivory_classic .inv-in{margin:10px;border:1px solid var(--ac);outline:1px solid var(--ac);outline-offset:-8px;border-radius:6px;padding-top:36px}
.inv-orn{color:var(--ac);letter-spacing:.4em;font-size:.8rem;margin:-4px 0 12px}
.inv-ivory_classic .inv-meta>div{background:transparent;border-top:1px solid var(--ac);border-radius:0;text-align:center}
.inv-lilac_soft .inv-in{padding-top:40px;overflow:hidden}
.inv-lilac_soft .inv-in::before{content:"";position:absolute;top:-70px;left:-70px;width:190px;height:190px;border-radius:50%;background:var(--ac);opacity:.5}
.inv-lilac_soft .inv-in>*{position:relative}
.inv-corporate{border-radius:12px}
.inv-band{height:10px;background:linear-gradient(270deg,var(--fg) 70%,var(--ac) 70%)}
.inv-corporate .inv-in{text-align:right}
.inv-corporate .inv-meta{grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))}
.inv-corporate .inv-meta>div{border-radius:8px;border-inline-start:4px solid var(--ac)}
.inv-corporate .inv-brand,.inv-workshop .inv-brand{justify-content:flex-start}
.inv-top{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:14px 18px;background:var(--fg);color:var(--bg);font-weight:700;font-size:.9rem}
.inv-pill{background:var(--bg);color:var(--fg);border-radius:99px;padding:2px 10px;font-size:.78rem}
.inv-workshop .inv-in{text-align:right;background:var(--sf)}
.inv-workshop .inv-title{border-inline-start:6px solid var(--ac);padding-inline-start:10px}
.inv-workshop .inv-meta>div{background:var(--bg)}
`;
