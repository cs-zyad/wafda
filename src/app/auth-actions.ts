"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { act, ip, homeOf, setSession, clearSession, sameOrigin, type Res } from "@/server/session";
import { allow, closeSession, createUser, login, openSession, sessionUser, SESSION_COOKIE, redeemSetupLink } from "@/server/domain/users";
import { AppError } from "@/server/errors";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function loginAction(_: Res | null, fd: FormData): Promise<Res> {
  let to = "/dashboard";
  const r = await act(async () => {
    const { user, token } = await login(s(fd, "email"), s(fd, "password"), await ip());
    await setSession(token);
    const next = s(fd, "next");
    to = next.startsWith("/") && !next.startsWith("//") ? next : homeOf(user);
  });
  if (r.ok) redirect(to);
  return r;
}

export async function registerAction(_: Res | null, fd: FormData): Promise<Res> {
  const r = await act(async () => {
    if (!(await allow(`register:${await ip()}`, 10, 3600_000))) throw new AppError("rate", "محاولات كثيرة؛ حاول لاحقًا");
    if (!s(fd, "phone").trim()) throw new AppError("validation", "رقم الجوال مطلوب");
    const u = await createUser({ email: s(fd, "email"), name: s(fd, "name"), role: "organizer", password: s(fd, "password"), phone: s(fd, "phone") });
    await setSession(await openSession(u.id));
  });
  if (r.ok) redirect("/dashboard");
  return r;
}

export async function logoutAction() {
  if (!sameOrigin(await headers())) return;
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (t) await closeSession(t);
  await clearSession();
  redirect("/login");
}

export async function setPasswordAction(link: string, _: Res | null, fd: FormData): Promise<Res> {
  let to = "/checkin";
  const r = await act(async () => {
    if (s(fd, "password") !== s(fd, "password2")) throw new AppError("mismatch", "كلمتا المرور غير متطابقتين");
    const { token } = await redeemSetupLink(link, s(fd, "password"));
    await setSession(token);
    const u = await sessionUser(token);
    if (u) to = homeOf(u);
  });
  if (r.ok) redirect(to);
  return r;
}
