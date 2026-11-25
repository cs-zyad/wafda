// عامل مهام مستقل: npm run worker
import { runJobs } from "../src/server/domain/jobs";

async function loop() {
  console.log("[وفدة] عامل المهام يعمل كل 15 ثانية");
  for (;;) {
    try {
      const r = await runJobs();
      if (!r.skipped && (r.sent || r.reminders || r.offers || r.batches)) console.log(new Date().toISOString(), r);
    } catch (e) {
      console.error("[jobs]", (e as Error).message);
    }
    await new Promise((ok) => setTimeout(ok, 15_000));
  }
}
void loop();
