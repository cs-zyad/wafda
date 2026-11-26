import type { NextConfig } from "next";

/** المصادر المسموح لها باستدعاء Server Actions خلف وسيط (مثل Codespaces) — من APP_URL */
const hosts = [process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
  .filter(Boolean)
  .flatMap((u) => {
    try {
      return [new URL(u as string).host];
    } catch {
      return [];
    }
  });

const config: NextConfig = {
  // بناء منفصل لاختبار المتصفح دون التعارض مع خادم التطوير
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  serverExternalPackages: ["firebase-admin", "exceljs", "nodemailer"],
  allowedDevOrigins: ["*.app.github.dev", "127.0.0.1", ...hosts.map((h) => h.split(":")[0])],
  experimental: { serverActions: { allowedOrigins: hosts, bodySizeLimit: "5mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default config;
