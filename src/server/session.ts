import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";
import type { Role, User } from "./types";
import { AppError } from "./errors";
import { SESSION_COOKIE, SESSION_DAYS, sessionUser } from "./domain/users";

/** المستخدم الحالي من كوكي الجلسة HttpOnly */
export const me = cache(async () => sessionUser((await cookies()).get(SESSION_COOKIE)?.value));

export const homeOf = (u: Pick<User, "role">) => (u.role === "admin" ? "/admin" : u.role === "staff" ? "/checkin" : "/dashboard");

export async function need(roles?: Role[]): Promise<User> {
  const u = await me();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.role)) redirect(homeOf(u));
  return u;
}
export const needOrganizer = () => need(["organizer"]);
export const needAdmin = () => need(["admin"]);

export async function setSession(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !(process.env.APP_URL || "").startsWith("http://"),
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}
export const clearSession = async () => (await cookies()).delete(SESSION_COOKIE);

export async function ip() {
  const h = await headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export function trustedHosts(): string[] {
  return [process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`].filter(Boolean).flatMap((u) => {
    try {
      return [new URL(u as string).host];
    } catch {
      return [];
    }
  });
}

/** حماية CSRF إضافية فوق فحص Next المدمج: Sec-Fetch-Site وOrigin يجب أن يكونا من نفس الموقع */
export function sameOrigin(h: Headers) {
  const site = h.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!origin || !host) return true;
  try {
    return [host, ...trustedHosts()].includes(new URL(origin).host);
  } catch {
    return false;
  }
}

export type Res<T = unknown> = { ok: true; msg?: string; data?: T } | { ok: false; msg: string };

/** غلاف إجراءات الخادم: يتحقق من المصدر، ويحوّل أخطاء المنتج لرسائل عربية */
export async function act<T = unknown>(fn: () => Promise<Res<T> | void>): Promise<Res<T>> {
  try {
    if (!sameOrigin(await headers())) throw new AppError("csrf", "طلب مرفوض: مصدر غير موثوق", 403);
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { ok: false, msg: e.message };
    console.error(e);
    return { ok: false, msg: "حدث خطأ غير متوقع. حاول مرة أخرى." };
  }
}

export const demo = () => process.env.DEMO_MODE === "true" || (process.env.NODE_ENV !== "production" && process.env.DEMO_MODE !== "false");
