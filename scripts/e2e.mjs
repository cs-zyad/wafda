// اختبار الرحلة كاملة (Playwright) على بناء إنتاجي منفصل + محاكي Firestore مستقل (8090).
import { spawnSync } from "node:child_process";
import { withJava, emulate } from "./java.mjs";
const r = spawnSync("npx", emulate("firebase.e2e.json", "demo-wafda-e2e", `node scripts/e2e-run.mjs ${process.argv.slice(2).join(" ")}`), { stdio: "inherit", env: withJava() });
process.exit(r.status ?? 1);
