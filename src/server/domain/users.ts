import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db, ref, newRef, tx, getDoc, where } from "../db";
import { token, sha256 } from "../crypto";
import { AppError, notFound } from "../errors";
import { normalizeEmail, clamp } from "@/shared/text";
import { DAY } from "@/shared/time";
import type { Role, User } from "../types";
import { audit } from "./settings";

const scryptP = promisify(scrypt) as (p: string, s: Buffer, n: number, o: object) => Promise<Buffer>;
const P = { N: 16384, r: 8, p: 1, maxmem: 64 << 20 };

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scryptP(pw, salt, 64, P);
  return `scrypt$${P.N}$${P.r}$${P.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function checkPassword(pw: string, stored?: string) {
  if (!stored) {
    await scryptP(pw, randomBytes(16), 64, P); // توقيت ثابت تقريبًا
    return false;
  }
  const [alg, n, r, p, s, k] = stored.split("$");
  if (alg !== "scrypt") return false;
  const key = Buffer.from(k, "base64");
  const got = await scryptP(pw, Buffer.from(s, "base64"), key.length, { N: +n, r: +r, p: +p, maxmem: P.maxmem });
  return timingSafeEqual(got, key);
}
export const passwordProblem = (pw: string) => (pw.length < 8 ? "كلمة المرور يجب ألا تقل عن 8 أحرف" : pw.length > 200 ? "كلمة المرور طويلة جدًا" : null);

export const getUser = (id: string) => getDoc<User>("users", id);
export async function userByEmail(raw: string) {
  const e = normalizeEmail(raw);
  if (!e) return null;
  const u = await getDoc<{ ref: string }>("uniques", `email:${e}`);
  return u ? getUser(u.ref) : null;
}

export async function createUser(i: { email: string; name: string; role: Role; password?: string }) {
  const email = normalizeEmail(i.email);
  if (!email) throw new AppError("validation", "البريد الإلكتروني غير صالح");
  const name = clamp(i.name, 120);
  if (name.length < 2) throw new AppError("validation", "الاسم مطلوب");
  if (i.password) {
    const p = passwordProblem(i.password);
    if (p) throw new AppError("validation", p);
  }
  const passwordHash = i.password ? await hashPassword(i.password) : undefined;
  const r = newRef("users");
  const u: User = { id: r.id, email, name, role: i.role, status: passwordHash ? "active" : "invited", passwordHash, credit: 0, createdAt: Date.now() };
  await tx(async (t) => {
    const uq = ref("uniques", `email:${email}`);
    if ((await t.get(uq)).exists) throw new AppError("email_taken", "هذا البريد مسجّل مسبقًا");
    t.set(uq, { kind: "email", ref: r.id });
    t.set(r, u);
  });
  return u;
}

/* ===== الجلسات: رمز عشوائي للمتصفح، وبصمته فقط في القاعدة ===== */
export const SESSION_COOKIE = "wafda_s";
export const SESSION_DAYS = 14;

export async function openSession(userId: string) {
  const t = token(32);
  await ref("sessions", sha256(t)).set({ userId, expiresAt: Date.now() + SESSION_DAYS * DAY });
  return t;
}
export async function sessionUser(t?: string | null): Promise<User | null> {
  if (!t || t.length > 80) return null;
  const s = await getDoc<{ userId: string; expiresAt: number }>("sessions", sha256(t));
  if (!s || s.expiresAt < Date.now()) return null;
  const u = await getUser(s.userId);
  return u?.status === "active" ? u : null;
}
export const closeSession = (t: string) => ref("sessions", sha256(t)).delete();
export async function closeAllSessions(userId: string) {
  const qs = await db().collection("sessions").where("userId", "==", userId).get();
  if (!qs.empty) {
    const b = db().batch();
    qs.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
}

/** حد المحاولات بنافذة ثابتة */
export async function allow(key: string, limit: number, windowMs: number) {
  return tx(async (t) => {
    const r = ref("rateLimits", sha256(key));
    const d = (await t.get(r)).data();
    const now = Date.now();
    if (!d || d.start + windowMs < now) {
      t.set(r, { n: 1, start: now });
      return true;
    }
    if (d.n >= limit) return false;
    t.update(r, { n: d.n + 1 });
    return true;
  });
}

export async function login(email: string, password: string, ip: string) {
  const e = normalizeEmail(email) || "-";
  if (!(await allow(`login:ip:${ip}`, 30, 15 * 60_000)) || !(await allow(`login:e:${e}`, 10, 15 * 60_000))) {
    throw new AppError("rate_limited", "محاولات كثيرة. حاول بعد 15 دقيقة.", 429);
  }
  const u = await userByEmail(e);
  const ok = await checkPassword(password, u?.passwordHash);
  if (!u || !ok) throw new AppError("bad_login", "البريد أو كلمة المرور غير صحيحة");
  if (u.status === "suspended") throw new AppError("suspended", "هذا الحساب موقوف. تواصل مع الدعم.");
  if (u.status !== "active") throw new AppError("inactive", "الحساب غير مفعّل بعد؛ استخدم رابط إنشاء كلمة المرور.");
  return { user: u, token: await openSession(u.id) };
}

/* ===== رابط إنشاء كلمة المرور: صالح لمدة محددة ويُستخدم مرة واحدة ===== */
export async function issueSetupLink(userId: string, days: number) {
  const t = token(24);
  await ref("setupTokens", sha256(t)).set({ userId, expiresAt: Date.now() + days * DAY, usedAt: null });
  return t;
}
export async function inspectSetupLink(t: string) {
  const d = await getDoc<{ userId: string; expiresAt: number; usedAt: number | null }>("setupTokens", sha256(t));
  if (!d) return { ok: false as const, reason: "الرابط غير صالح" };
  if (d.usedAt) return { ok: false as const, reason: "استُخدم هذا الرابط مسبقًا" };
  if (d.expiresAt < Date.now()) return { ok: false as const, reason: "انتهت صلاحية الرابط" };
  const user = await getUser(d.userId);
  return user ? { ok: true as const, user } : { ok: false as const, reason: "الحساب غير موجود" };
}
export async function redeemSetupLink(t: string, password: string) {
  const p = passwordProblem(password);
  if (p) throw new AppError("validation", p);
  const hash = await hashPassword(password);
  const userId = await tx(async (x) => {
    const r = ref("setupTokens", sha256(t));
    const d = (await x.get(r)).data();
    if (!d) throw new AppError("bad_link", "الرابط غير صالح");
    if (d.usedAt) throw new AppError("used_link", "استُخدم هذا الرابط مسبقًا");
    if (d.expiresAt < Date.now()) throw new AppError("expired_link", "انتهت صلاحية الرابط");
    const ur = ref("users", d.userId);
    const u = (await x.get(ur)).data() as User | undefined;
    if (!u) throw new AppError("bad_link", "الحساب غير موجود");
    if (u.status === "suspended") throw new AppError("suspended", "هذا الحساب موقوف");
    x.update(r, { usedAt: Date.now() });
    x.update(ur, { passwordHash: hash, status: "active" });
    return u.id;
  });
  return { userId, token: await openSession(userId) };
}

/* ===== إدارة الحسابات ===== */
export async function setSuspended(actorId: string, userId: string, suspended: boolean, reason: string) {
  const u = await getUser(userId);
  if (!u) throw notFound("الحساب");
  if (u.role === "admin") throw new AppError("forbidden", "لا يمكن إيقاف حساب أدمن");
  if (!reason.trim()) throw new AppError("validation", "اكتب السبب");
  await ref("users", userId).update({ status: suspended ? "suspended" : u.passwordHash ? "active" : "invited" });
  if (suspended) await closeAllSessions(userId);
  await audit(actorId, suspended ? "user.suspend" : "user.activate", `users/${userId}`, { reason });
}

export const listUsers = async () => (await db().collection("users").get()).docs.map((d) => d.data() as User).sort((a, b) => b.createdAt - a.createdAt);
