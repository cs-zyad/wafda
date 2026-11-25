"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ base, items }: { base: string; items: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="أقسام الفعالية">
      {items.map(([seg, label]) => {
        const href = seg ? `${base}/${seg}` : base;
        return (
          <Link key={seg} href={href} aria-current={(seg ? path.startsWith(href) : path === base) ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const on = href === path || (href !== "/dashboard" && href !== "/admin" && path.startsWith(href));
  return (
    <Link href={href} aria-current={on ? "page" : undefined}>
      {children}
    </Link>
  );
}
