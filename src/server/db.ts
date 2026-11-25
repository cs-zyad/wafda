import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, type Transaction } from "firebase-admin/firestore";

/** يقبل محتوى ملف حساب الخدمة JSON مباشرة أو بترميز base64 */
export function parseServiceAccount(raw: string) {
  const t = raw.trim();
  const sa = JSON.parse(t.startsWith("{") ? t : Buffer.from(t, "base64").toString("utf8"));
  if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error("ملف حساب الخدمة ناقص (project_id / client_email / private_key)");
  return sa as { project_id: string; client_email: string; private_key: string };
}

export function firebaseStatus(): { ok: boolean; mode: "emulator" | "live" | "missing"; message: string } {
  if (process.env.FIRESTORE_EMULATOR_HOST) return { ok: true, mode: "emulator", message: `محاكي Firestore (${process.env.FIRESTORE_EMULATOR_HOST})` };
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return { ok: false, mode: "missing", message: "لم يُضبط Firebase: أضف FIREBASE_SERVICE_ACCOUNT بمحتوى ملف حساب الخدمة (JSON أو base64)، أو شغّل محليًا بـ npm run dev:local." };
  try {
    return { ok: true, mode: "live", message: `Firestore (${parseServiceAccount(raw).project_id})` };
  } catch (e) {
    return { ok: false, mode: "missing", message: `قيمة FIREBASE_SERVICE_ACCOUNT غير صالحة: ${(e as Error).message}` };
  }
}

const g = globalThis as typeof globalThis & { __wafdaFs?: Firestore };

export function db(): Firestore {
  if (g.__wafdaFs) return g.__wafdaFs;
  let app: App | undefined = getApps().find((a) => a.name === "wafda");
  if (!app) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.METADATA_SERVER_DETECTION ??= "none";
      app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-wafda" }, "wafda");
    } else {
      const st = firebaseStatus();
      if (!st.ok) throw new Error(st.message);
      const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT!);
      app = initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id }, "wafda");
    }
  }
  const fs = getFirestore(app);
  fs.settings({ ignoreUndefinedProperties: true });
  return (g.__wafdaFs = fs);
}

/**
 * معاملة بمحاولات أكثر من الافتراضي (5) لتحمّل التزاحم على وثيقة الفعالية.
 * قاعدة Firestore: كل القراءات قبل كل الكتابات.
 */
export const tx = <T>(fn: (t: Transaction) => Promise<T>) => db().runTransaction(fn, { maxAttempts: 40 });

export const col = {
  users: "users", sessions: "sessions", uniques: "uniques", rateLimits: "rateLimits", setupTokens: "setupTokens",
  events: "events", invitations: "invitations", registrations: "registrations", tickets: "tickets", staff: "eventStaff",
  messages: "messages", batches: "batches", ledger: "ledger", reminders: "reminders", devInbox: "devInbox",
  payments: "payments", webhooks: "webhookEvents", templates: "templates", designs: "designRequests", designMsgs: "designMessages",
  support: "supportTickets", supportReplies: "supportReplies", audit: "auditLog", settings: "settings", meta: "meta",
} as const;

export const ref = (c: keyof typeof col, id: string) => db().collection(col[c]).doc(id);
export const newRef = (c: keyof typeof col) => db().collection(col[c]).doc();
export async function getDoc<T>(c: keyof typeof col, id: string): Promise<T | null> {
  if (!id || id.includes("/")) return null;
  const s = await ref(c, id).get();
  return s.exists ? (s.data() as T) : null;
}
export async function where<T>(c: keyof typeof col, field: string, value: unknown): Promise<T[]> {
  return (await db().collection(col[c]).where(field, "==", value).get()).docs.map((d) => d.data() as T);
}
