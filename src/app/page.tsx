import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicBar } from "@/ui/Shell";
import { me, homeOf, demo } from "@/server/session";
import { brand } from "@/config/brand";

export default async function Home() {
  const u = await me();
  if (u) redirect(homeOf(u));
  return (
    <>
      <PublicBar />
      <section className="hero">
        <div className="wrap">
          <span className="tag plum">{brand.fullName}</span>
          <h1 style={{ marginTop: 14 }}>{brand.tagline}</h1>
          <p>جهّز الدعوة وأرسلها بواتساب أو البريد، واستلم تأكيدات الحضور مع تذكرة QR مستقلة لكل ضيف ومرافقه، ثم سجّل الدخول عند الباب بمسح سريع من الجوال.</p>
          <div className="row" style={{ marginTop: 20 }}>
            <Link className="btn go lg" href="/register">أنشئ فعاليتك</Link>
            <Link className="btn lg ghost" href="/login" style={{ color: "var(--ivory)", borderColor: "rgb(255 255 255 / 30%)" }}>تسجيل الدخول</Link>
          </div>
        </div>
      </section>
      <main className="wrap page stack-lg">
        <div className="grid g3">
          {[
            ["جهّز", "البيانات مرة واحدة تظهر كما هي في صفحة الدعوة ورسائل واتساب والبريد."],
            ["أرسل وتابع", "من دُعي، ومن أكّد، ومن اعتذر، ومن تعذّر الإرسال إليه، مع تذكير لمن لم يرد."],
            ["استقبل", "مسح QR من الجوال: دخل، أو حضر مسبقًا، أو تذكرة لا تخص الفعالية."],
          ].map(([t, d]) => (
            <div className="card" key={t}>
              <h3>{t}</h3>
              <p className="muted" style={{ margin: 0 }}>{d}</p>
            </div>
          ))}
        </div>
        {demo() ? (
          <div className="card soft small">
            <b>حسابات التجربة</b> — كلمة المرور <bdi className="ltr">Wafda@2026</bdi>: <bdi className="ltr">organizer@wafda.test</bdi>، <bdi className="ltr">staff@wafda.test</bdi>، <bdi className="ltr">admin@wafda.test</bdi>
          </div>
        ) : null}
      </main>
    </>
  );
}
