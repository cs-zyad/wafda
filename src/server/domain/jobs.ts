import { dispatchDue } from "./outbox";
import { finishPendingBatches, runReminders } from "./sending";
import { expireOffers } from "./rsvp";

let busy = false;

/** العامل الدوري: الدفعات المعلّقة، التذكيرات المجدولة، الفرص المنتهية، إعادة محاولة الرسائل */
export async function runJobs() {
  if (busy) return { skipped: true };
  busy = true;
  try {
    const batches = await finishPendingBatches();
    const reminders = await runReminders();
    const offers = await expireOffers();
    const sent = Object.keys(await dispatchDue()).length;
    return { skipped: false, batches, reminders: reminders.length, offers, sent };
  } finally {
    busy = false;
  }
}
