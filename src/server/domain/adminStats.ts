import { AggregateField } from "firebase-admin/firestore";
import { db } from "../db";

/** مؤشرات الأدمن بعمليات تجميع في Firestore (count/sum) بدل قراءة المجموعات كاملة */
async function agg(collection: string, filters: [string, unknown][], sumField?: string) {
  let q: FirebaseFirestore.Query = db().collection(collection);
  for (const [f, v] of filters) q = q.where(f, "==", v);
  const s = await q.aggregate(sumField ? { n: AggregateField.count(), total: AggregateField.sum(sumField) } : { n: AggregateField.count() }).get();
  const d = s.data() as { n: number; total?: number };
  return { n: d.n, total: d.total ?? 0 };
}

export async function overview() {
  const [organizers, suspended, events, active, drafts, paid, credit, refunded, pkgMsgs, platformMsgs, failedMsgs, tickets, inside, review, paidDesigns, open, working] = await Promise.all([
    agg("users", [["role", "organizer"]]),
    agg("users", [["status", "suspended"]]),
    agg("events", []),
    agg("events", [["status", "active"]]),
    agg("events", [["status", "draft"]]),
    agg("payments", [["status", "paid"]], "amount"),
    agg("messages", [["chargedTo", "credit"]], "cost"),
    agg("messages", [["chargedTo", "credit"], ["refunded", true]], "cost"),
    agg("messages", [["chargedTo", "package"]], "opCost"),
    agg("messages", [["chargedTo", "platform"]], "opCost"),
    agg("messages", [["status", "failed"]]),
    agg("tickets", [["status", "active"]]),
    agg("events", [], "inGuests"),
    agg("designRequests", [["status", "review"]]),
    agg("designRequests", [["status", "paid"]]),
    agg("supportTickets", [["status", "open"]]),
    agg("supportTickets", [["status", "working"]]),
  ]);
  const companions = await agg("events", [], "inCompanions");
  return {
    organizers: organizers.n, suspended: suspended.n, events: events.n, active: active.n, drafts: drafts.n,
    paidTotal: paid.total, paidCount: paid.n,
    messageRevenue: credit.total - refunded.total, refunded: refunded.total,
    confirmCost: pkgMsgs.total, platformCost: platformMsgs.total, failedMsgs: failedMsgs.n,
    tickets: tickets.n, inside: inside.total + companions.total,
    pendingDesigns: review.n + paidDesigns.n, openSupport: open.n + working.n,
  };
}
