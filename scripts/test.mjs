// الاختبارات الآلية على محاكي Firestore الرسمي (منفذ 8085، لا يتعارض مع خادم التطوير).
import { spawnSync } from "node:child_process";
import { withJava, emulate } from "./java.mjs";
const r = spawnSync("npx", emulate("firebase.test.json", "demo-wafda-test", `npx vitest run ${process.argv.slice(2).join(" ")}`), { stdio: "inherit", env: withJava() });
process.exit(r.status ?? 1);
