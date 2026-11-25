import Link from "next/link";
import type { ReactNode } from "react";
import type { RegStatus, SendStatus, Ticket } from "@/server/types";
import { fmtShort } from "@/shared/time";

type Tone = "ok" | "bad" | "warn" | "info" | "neutral" | "plum";
export const Tag = ({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) => <span className={`tag ${tone}`}>{children}</span>;
/** البريد والأرقام داخل عنصر LTR معزول */
export const Ltr = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <bdi dir="ltr" className={`ltr ${className}`}>
    {children}
  </bdi>
);
export const Stat = ({ k, v, s, hl }: { k: string; v: ReactNode; s?: ReactNode; hl?: boolean }) => (
  <div className={`stat${hl ? " hl" : ""}`}>
    <div className="k">{k}</div>
    <div className="v">{v}</div>
    {s ? <div className="s">{s}</div> : null}
  </div>
);
export const Alert = ({ tone = "info", children }: { tone?: "ok" | "bad" | "warn" | "info"; children: ReactNode }) => (
  <div className={`alert ${tone}`} role={tone === "bad" ? "alert" : "status"}>
    {children}
  </div>
);
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const Back = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="small muted" style={{ textDecoration: "none" }}>
    → {children}
  </Link>
);
export function Title({ children, sub, actions }: { children: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="row between" style={{ alignItems: "flex-start", marginBottom: 16 }}>
      <div className="grow">
        <h1 style={{ marginBottom: 2 }} className="break">
          {children}
        </h1>
        {sub ? <div className="muted small">{sub}</div> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export const SEND: Record<SendStatus, [string, Tone]> = { not_sent: ["لم تُرسل", "neutral"], sending: ["قيد الإرسال", "info"], sent: ["أُرسلت", "ok"], failed: ["تعذّر الإرسال", "bad"] };
export const REG: Record<RegStatus, [string, Tone]> = { none: ["لم يؤكد", "warn"], confirmed: ["مؤكد", "ok"], declined: ["اعتذر", "neutral"], waitlisted: ["في الانتظار", "info"], offered: ["وصلته فرصة", "info"], cancelled: ["أُلغي التسجيل", "bad"] };
export const SendTag = ({ s }: { s: SendStatus }) => <Tag tone={SEND[s][1]}>{SEND[s][0]}</Tag>;
export const RegTag = ({ s }: { s: RegStatus }) => <Tag tone={REG[s][1]}>{REG[s][0]}</Tag>;
export function InTag({ t, who }: { t?: Ticket; who?: string }) {
  if (!t || t.status !== "active") return null;
  const p = who ? `${who}: ` : "";
  return t.inAt ? <Tag tone="plum">{p}حضر {fmtShort(t.inAt)} ({t.inMethod === "manual" ? "يدوي" : "مسح"})</Tag> : <Tag tone="neutral">{p}لم يحضر</Tag>;
}
export const KIND: Record<string, string> = { invitation: "دعوة", reminder: "تذكير", confirmation: "تأكيد + تذكرة", waitlist_offer: "فرصة انتظار", staff_invite: "دعوة استقبال", ticket_resend: "إعادة إرسال التذكرة" };
export const MSG: Record<string, [string, Tone]> = { queued: ["في الطابور", "info"], sending: ["قيد الإرسال", "info"], sent: ["أُرسلت", "ok"], failed: ["فشلت", "bad"] };
export const CH = { whatsapp: "واتساب", email: "البريد" } as const;
