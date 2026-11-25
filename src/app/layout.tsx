import type { Metadata, Viewport } from "next";
import "@fontsource/noto-kufi-arabic/700.css";
import "@fontsource/noto-sans-arabic/400.css";
import "@fontsource/noto-sans-arabic/600.css";
import "@fontsource/noto-sans-arabic/700.css";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";
import "./globals.css";
import { brand } from "@/config/brand";
import { Toasts } from "@/ui/client";

/** كل الصفحات تقرأ بيانات حية؛ لا عرض مسبق ولا تخزين مؤقت */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: `${brand.fullName} — ${brand.tagline}`, template: `%s | ${brand.nameAr}` },
  description: "تجهيز الدعوة وإرسالها، تأكيد الحضور، تذكرة QR لكل شخص، وتسجيل الدخول عند الاستقبال.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: brand.colors.plum };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <Toasts>{children}</Toasts>
      </body>
    </html>
  );
}
