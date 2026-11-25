import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/ui/client";
import { loginAction } from "@/app/auth-actions";
import { me, homeOf } from "@/server/session";

export const metadata = { title: "تسجيل الدخول" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await me();
  if (u) redirect(homeOf(u));
  const { next = "" } = await searchParams;
  return (
    <>
      <h1>تسجيل الدخول</h1>
      <ActionForm action={loginAction} className="stack">
        <input type="hidden" name="next" value={next} />
        <label className="field"><span>البريد الإلكتروني</span><input type="email" name="email" required autoComplete="email" /></label>
        <label className="field"><span>كلمة المرور</span><input type="password" name="password" required autoComplete="current-password" /></label>
        <Submit className="btn go full">دخول</Submit>
      </ActionForm>
      <p className="small muted" style={{ marginTop: 14 }}>ليس لديك حساب؟ <Link href="/register">أنشئ حساب منظّم</Link></p>
    </>
  );
}
