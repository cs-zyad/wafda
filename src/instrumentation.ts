/** عامل المهام داخل خادم Next كل 15 ثانية (لا يعمل على Vercel؛ هناك /api/cron) */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL || process.env.DISABLE_WORKER === "true") return;
  const { firebaseStatus } = await import("./server/db");
  if (!firebaseStatus().ok) return;
  const { runJobs } = await import("./server/domain/jobs");
  const g = globalThis as typeof globalThis & { __wafdaJobs?: NodeJS.Timeout };
  if (g.__wafdaJobs) return;
  g.__wafdaJobs = setInterval(() => runJobs().catch((e) => console.error("[jobs]", e?.message ?? e)), 15_000);
  console.log("[وفدة] عامل المهام يعمل كل 15 ثانية");
}
