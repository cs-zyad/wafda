import Link from "next/link";
import type { ReactNode } from "react";
import type { Ticket } from "@/server/types";
import { fmtShort } from "@/shared/time";
import { brand } from "@/config/brand";
import { Mark } from "./Logo";
import { DemoBar } from "./Shell";

export const GuestPage = ({ children }: { children: ReactNode }) => (
  <>
    <DemoBar />
    <main className="guest">
      {children}
      <p className="center tiny muted" style={{ marginTop: 26 }}>
        <Mark size={14} /> {brand.fullName} — {brand.tagline}
      </p>
    </main>
  </>
);

export const State = ({ tone, icon, title, children }: { tone: "ok" | "warn" | "bad" | "info"; icon: string; title: string; children?: ReactNode }) => (
  <div className={`state ${tone}`} role="status">
    <div className="ic" aria-hidden="true">{icon}</div>
    <h2 style={{ margin: "0 0 4px" }}>{title}</h2>
    {children}
  </div>
);

/** «عرض التذكرة» لكل شخص: المدعو، والمرافق بتذكرة مستقلة */
export function TicketLinks({ list }: { list: Ticket[] }) {
  return (
    <div className="list">
      {list.filter((t) => t.status === "active").sort((a) => (a.kind === "guest" ? -1 : 1)).map((t) => (
        <div key={t.id} className="item row between">
          <div>
            <b>{t.kind === "guest" ? "تذكرتك" : "تذكرة المرافق"}</b>
            <div className="meta">{t.inAt ? `دخل ${fmtShort(t.inAt)}` : t.kind === "companion" ? "شاركها مع مرافقك؛ يدخل بها في أي وقت" : "مقعد محجوز — يُسجّل الحضور عند الدخول"}</div>
          </div>
          <Link className={`btn sm ${t.kind === "guest" ? "go" : "dark"}`} href={`/t/${t.token}`}>عرض التذكرة</Link>
        </div>
      ))}
    </div>
  );
}
