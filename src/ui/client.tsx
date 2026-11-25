"use client";

import { createContext, useActionState, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { Res } from "@/server/session";

/* ===== إشعارات عائمة على مستوى الموقع: تبقى ظاهرة حتى لو اختفى النموذج بعد إعادة العرض ===== */
type Toast = { id: number; ok: boolean; text: string };
const Ctx = createContext<(ok: boolean, text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function Toasts({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((ok: boolean, text: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, ok, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), ok ? 6000 : 10000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} role={t.ok ? "status" : "alert"} className={`alert toast ${t.ok ? "ok" : "bad"}`} onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

type Action = (prev: Res | null, fd: FormData) => Promise<Res>;

/** نموذج لإجراء خادم: حالة انتظار، تأكيد اختياري، ونتيجة في إشعار عائم */
export function ActionForm({ action, children, className, reset, confirm }: { action: Action; children: ReactNode; className?: string; reset?: boolean; confirm?: string }) {
  const toast = useToast();
  const ref = useRef<HTMLFormElement>(null);
  const [, run] = useActionState(async (prev: Res | null, fd: FormData) => {
    const r = await action(prev, fd);
    if (!r.ok || r.msg) toast(r.ok, r.msg ?? "");
    if (r.ok && reset) ref.current?.reset();
    return r;
  }, null);
  return (
    <form ref={ref} action={run} className={className} onSubmit={(e) => confirm && !window.confirm(confirm) && e.preventDefault()}>
      {children}
    </form>
  );
}

export function Submit({ children, className = "btn go", busy = "جارٍ التنفيذ…", disabled, name, value }: { children: ReactNode; className?: string; busy?: string; disabled?: boolean; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending} name={name} value={value}>
      {pending ? busy : children}
    </button>
  );
}

export function Copy({ text, label = "نسخ", className = "btn sm ghost" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = Object.assign(document.createElement("textarea"), { value: text });
          document.body.append(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "تم النسخ ✓" : label}
    </button>
  );
}

export const CopyBox = ({ value, label = "نسخ الرابط" }: { value: string; label?: string }) => (
  <div className="copy">
    <input readOnly value={value} aria-label="الرابط" onFocus={(e) => e.currentTarget.select()} />
    <Copy text={value} label={label} className="btn sm dark" />
  </div>
);

export function Share({ url, title, text }: { url: string; title: string; text: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn go full"
      onClick={async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title, text, url });
          } catch {}
          return;
        }
        await navigator.clipboard.writeText(url);
        toast(true, "نُسخ رابط التذكرة؛ أرسله لمرافقك.");
      }}
    >
      مشاركة التذكرة مع المرافق
    </button>
  );
}

/** تحديث تلقائي أثناء الفعالية */
export function AutoRefresh({ on, every = 15 }: { on: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), every * 1000);
    return () => clearInterval(t);
  }, [on, every, router]);
  return on ? <span className="tag info">تحديث تلقائي كل {every} ث</span> : null;
}

/** زر لإجراء خادم بلا حقول (مع تأكيد اختياري ونتيجة في إشعار) */
export function Do({ action, children, className = "btn sm ghost", confirm, disabled }: { action: () => Promise<Res>; children: ReactNode; className?: string; confirm?: string; disabled?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy || disabled}
      aria-busy={busy}
      onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        setBusy(true);
        try {
          const r = await action();
          if (!r.ok || r.msg) toast(r.ok, r.msg ?? "");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "…" : children}
    </button>
  );
}
