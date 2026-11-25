import { ActionForm, Submit } from "@/ui/client";
import { Alert, Ltr } from "@/ui/kit";
import { setPasswordAction } from "@/app/auth-actions";
import { inspectSetupLink } from "@/server/domain/users";

export const metadata = { title: "إنشاء كلمة المرور" };

export default async function SetPassword({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await inspectSetupLink(token);
  return (
    <>
      <h1>إنشاء كلمة المرور</h1>
      {!r.ok ? (
        <Alert tone="bad">{r.reason}. اطلب من المنظّم إعادة إرسال الرابط.</Alert>
      ) : (
        <>
          <p className="muted">مرحبًا {r.user.name} (<Ltr>{r.user.email}</Ltr>). هذا الرابط يُستخدم مرة واحدة.</p>
          <ActionForm action={setPasswordAction.bind(null, token)} className="stack">
            <label className="field"><span>كلمة المرور</span><input type="password" name="password" required minLength={8} autoComplete="new-password" /></label>
            <label className="field"><span>تأكيد كلمة المرور</span><input type="password" name="password2" required minLength={8} autoComplete="new-password" /></label>
            <Submit className="btn go full">حفظ والدخول</Submit>
          </ActionForm>
        </>
      )}
    </>
  );
}
