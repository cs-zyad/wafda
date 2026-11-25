import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/ui/client";
import { registerAction } from "@/app/auth-actions";
import { me, homeOf } from "@/server/session";

export const metadata = { title: "حساب منظّم" };

export default async function Register() {
  const u = await me();
  if (u) redirect(homeOf(u));
  return (
    <>
      <h1>حساب منظّم جديد</h1>
      <p className="small muted">لأي شخص أو جهة تنظّم فعالية: أفراد، أندية، جامعات، شركات، مراكز تدريب.</p>
      <ActionForm action={registerAction} className="stack">
        <label className="field"><span>الاسم أو اسم الجهة</span><input name="name" required maxLength={120} autoComplete="organization" /></label>
        <label className="field"><span>البريد الإلكتروني</span><input type="email" name="email" required autoComplete="email" /></label>
        <label className="field"><span>كلمة المرور</span><input type="password" name="password" required minLength={8} autoComplete="new-password" /><small>8 أحرف على الأقل</small></label>
        <Submit className="btn go full">إنشاء الحساب</Submit>
      </ActionForm>
      <p className="small muted" style={{ marginTop: 14 }}>لديك حساب؟ <Link href="/login">تسجيل الدخول</Link></p>
    </>
  );
}
