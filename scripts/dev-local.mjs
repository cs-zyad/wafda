// تشغيل محلي بلا حساب Firebase: محاكي Firestore الرسمي مع حفظ البيانات بين التشغيلات،
// ثم البيانات التجريبية (مرة واحدة)، ثم خادم Next.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { withJava, emulate } from "./java.mjs";

const env = withJava();
const port = env.PORT || "3000";
Object.assign(env, { DEMO_MODE: env.DEMO_MODE ?? "true", GCLOUD_PROJECT: "demo-wafda", APP_URL: env.APP_URL ?? `http://localhost:${port}` });
mkdirSync(".emulator-data", { recursive: true });
const lan = process.argv.includes("--lan") ? " -H 0.0.0.0" : "";
const child = spawn("npx", emulate("firebase.json", "demo-wafda", `npx tsx --tsconfig tsconfig.json scripts/seed.ts --if-empty && npx next dev -p ${port}${lan}`, ["--import", ".emulator-data", "--export-on-exit", ".emulator-data"]), { stdio: "inherit", env });
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill("SIGINT"));
child.on("exit", (c) => process.exit(c ?? 0));
