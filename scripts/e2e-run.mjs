import { spawn, spawnSync } from "node:child_process";
const PORT = "3100";
const env = { ...process.env, GCLOUD_PROJECT: "demo-wafda-e2e", NEXT_DIST_DIR: ".next-e2e", DEMO_MODE: "true", APP_URL: `http://localhost:${PORT}`, PAYMENT_WEBHOOK_SECRET: "e2e-webhook-secret-0123456789", E2E_BASE: `http://localhost:${PORT}` };
const args = process.argv.slice(2);
const run = (c, a) => { const r = spawnSync(c, a, { stdio: "inherit", env }); if (r.status) process.exit(r.status); };
if (!args.includes("--no-build")) run("npx", ["next", "build"]);
run("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/seed.ts"]);
const server = spawn("npx", ["next", "start", "-p", PORT], { stdio: ["ignore", "inherit", "inherit"], env });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${PORT}/login`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }
const t = spawnSync("npx", ["playwright", "test", ...args.filter((a) => a !== "--no-build")], { stdio: "inherit", env });
server.kill("SIGTERM");
process.exit(t.status ?? 1);
