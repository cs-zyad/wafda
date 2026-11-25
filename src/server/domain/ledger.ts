import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { ref, tx, where } from "../db";
import { sha256 } from "../crypto";
import { AppError, notFound } from "../errors";
import type { User } from "../types";
import { audit } from "./settings";

export interface LedgerEntry {
  id: string;
  userId: string;
  amount: number; // + إضافة، - خصم (هللة)
  balance: number; // الرصيد بعد القيد
  reason: "topup" | "batch" | "refund" | "offer" | "adjust";
  note: string;
  refId: string | null;
  at: number;
}

/** معرّف القيد = بصمة مفتاح منع التكرار، فلا يُطبَّق القيد مرتين أبدًا. */
export const ledgerRef = (key: string) => ref("ledger", sha256(key));

/** يكتب القيد ويحدّث الرصيد. على المستدعي قراءة المستخدم ووثيقة القيد قبل أي كتابة. */
export function post(t: Transaction, userRef: DocumentReference, balance: number, key: string, e: Omit<LedgerEntry, "id" | "balance" | "at">) {
  const r = ledgerRef(key);
  const entry: LedgerEntry = { ...e, id: r.id, balance: balance + e.amount, at: Date.now() };
  t.set(r, entry);
  t.update(userRef, { credit: entry.balance });
  return entry;
}

/** تسوية رصيد من الأدمن بسبب مسجل */
export async function adjust(actorId: string, userId: string, amount: number, note: string, key: string) {
  if (!note.trim()) throw new AppError("validation", "سبب التسوية مطلوب");
  if (!Number.isInteger(amount) || amount === 0) throw new AppError("validation", "المبلغ غير صالح");
  const ur = ref("users", userId);
  const res = await tx(async (t) => {
    const [u, l] = await Promise.all([t.get(ur), t.get(ledgerRef(`adjust:${key}`))]);
    if (!u.exists) throw notFound("الحساب");
    if (l.exists) return { dup: true, entry: l.data() as LedgerEntry };
    const bal = (u.data() as User).credit;
    if (bal + amount < 0) throw new AppError("negative", "التسوية تجعل الرصيد سالبًا");
    return { dup: false, entry: post(t, ur, bal, `adjust:${key}`, { userId, amount, reason: "adjust", note: note.trim(), refId: null }) };
  });
  if (!res.dup) await audit(actorId, "credit.adjust", `users/${userId}`, { amount, note });
  return res;
}

export const ledgerOf = async (userId: string) => (await where<LedgerEntry>("ledger", "userId", userId)).sort((a, b) => b.at - a.at);
