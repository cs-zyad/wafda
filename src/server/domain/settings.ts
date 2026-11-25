import type { Transaction } from "firebase-admin/firestore";
import { ref, newRef } from "../db";
import type { Settings } from "../types";

/** قيم تجريبية مقترحة، مُعلّمة demo=true، وقابلة للتعديل من لوحة الأدمن. */
export const DEFAULTS: Settings = {
  prices: {
    demo: true,
    packages: [
      { places: 50, price: 9900 },
      { places: 100, price: 17900 },
      { places: 250, price: 39900 },
      { places: 500, price: 69900 },
      { places: 1000, price: 119900 },
    ],
    extraPlace: 200,
    message: { whatsapp: 25, email: 5 },
    confirmOpCost: { whatsapp: 25, email: 5 },
  },
  policy: { lowCredit: "block", maxAttempts: 3, retryBaseSec: 60, offerHours: 48, resendMinMinutes: 10, staffInviteDays: 7 },
};

export async function getSettings(): Promise<Settings> {
  const d = ((await ref("settings", "global").get()).data() || {}) as Partial<Settings>;
  return { prices: { ...DEFAULTS.prices, ...d.prices }, policy: { ...DEFAULTS.policy, ...d.policy } };
}

export async function saveSettings(actorId: string, patch: { prices?: Partial<Settings["prices"]>; policy?: Partial<Settings["policy"]> }) {
  const before = await getSettings();
  const after: Settings = { prices: { ...before.prices, ...patch.prices }, policy: { ...before.policy, ...patch.policy } };
  await ref("settings", "global").set({ ...after, updatedAt: Date.now() });
  await audit(actorId, "settings.update", "settings/global", { before, after });
  return after;
}

/** أصغر باقة تغطي العدد؛ وإن تجاوز أكبر باقة تُضاف أماكن بسعر المكان الإضافي. */
export function quote(places: number, s: Settings) {
  const n = Math.max(1, Math.ceil(places));
  const pk = [...s.prices.packages].sort((a, b) => a.places - b.places);
  const fit = pk.find((p) => p.places >= n);
  if (fit) return { places: fit.places, price: fit.price, extra: 0, label: `باقة ${fit.places} مكان` };
  const big = pk[pk.length - 1];
  return { places: n, price: big.price + (n - big.places) * s.prices.extraPlace, extra: n - big.places, label: `باقة ${big.places} مكان + ${n - big.places} مكان إضافي` };
}

export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  target: string;
  details: unknown;
  at: number;
}

/** سجل التدقيق: الدفع، الإعدادات، الصلاحيات، الإلغاء، التسويات. */
export async function audit(actorId: string, action: string, target: string, details: unknown = {}, t?: Transaction) {
  const r = newRef("audit");
  const e: AuditEntry = { id: r.id, actorId, action, target, details: JSON.parse(JSON.stringify(details ?? {})), at: Date.now() };
  if (t) t.set(r, e);
  else await r.set(e);
}
