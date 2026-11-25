import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/server/types";
import { demo } from "@/server/session";
import { logoutAction } from "@/app/auth-actions";
import { Logo } from "./Logo";
import { NavLink } from "./Tabs";

const NAV: Record<User["role"], [string, string][]> = {
  organizer: [["/dashboard", "فعالياتي"], ["/dashboard/credit", "الرصيد والمدفوعات"], ["/dashboard/designs", "طلبات التصميم"], ["/dashboard/support", "الدعم"], ["/checkin", "التحضير"]],
  staff: [["/checkin", "التحضير"]],
  admin: [["/admin", "نظرة عامة"], ["/admin/users", "الحسابات"], ["/admin/events", "الفعاليات"], ["/admin/templates", "القوالب"], ["/admin/designs", "التصاميم"], ["/admin/support", "الدعم"], ["/admin/settings", "الأسعار والسياسات"], ["/admin/payments", "المدفوعات"], ["/admin/messages", "الرسائل"], ["/admin/audit", "التدقيق"]],
};

export const DemoBar = () =>
  demo() ? (
    <div className="demo">
      وضع تجريبي: الرسائل والدفع محاكاة — <Link href="/dev/inbox">صندوق الرسائل التجريبي</Link>
    </div>
  ) : null;

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  return (
    <>
      <DemoBar />
      <header className="bar">
        <div className="wrap">
          <Link href={NAV[user.role][0][0]} aria-label="الرئيسية">
            <Logo light />
          </Link>
          <nav aria-label="القائمة">
            {NAV[user.role].map(([h, l]) => (
              <NavLink key={h} href={h}>
                {l}
              </NavLink>
            ))}
            <form action={logoutAction}>
              <button type="submit" title={user.email}>
                خروج
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="wrap page">{children}</main>
    </>
  );
}

export function PublicBar() {
  return (
    <>
      <DemoBar />
      <header className="bar">
        <div className="wrap">
          <Link href="/" aria-label="الرئيسية">
            <Logo light />
          </Link>
          <nav>
            <Link href="/login">دخول</Link>
            <Link href="/register">حساب منظّم</Link>
          </nav>
        </div>
      </header>
    </>
  );
}
