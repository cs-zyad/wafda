"use client";

import { useState, useTransition } from "react";
import type { Res } from "@/server/session";
import type { CheckedRow, Row } from "@/server/domain/importer";
import { useToast } from "./client";

const ST = { ok: ["مقبول", "ok"], duplicate: ["مكرر", "warn"], invalid: ["يحتاج تصحيحًا", "bad"] } as const;
const raw = (r: CheckedRow): Row => ({ name: r.name, phone: r.phone, email: r.email, companion: r.companion });

export function ImportPanel({ read, recheck, commit }: { read: (fd: FormData) => Promise<Res<CheckedRow[]>>; recheck: (rows: Row[]) => Promise<Res<CheckedRow[]>>; commit: (rows: Row[]) => Promise<Res> }) {
  const toast = useToast();
  const [rows, setRows] = useState<CheckedRow[]>([]);
  const [out, setOut] = useState<Set<number>>(new Set());
  const [busy, go] = useTransition();
  const kept = rows.filter((r) => !out.has(r.line));
  const count = (s: CheckedRow["status"]) => kept.filter((r) => r.status === s).length;
  const edit = (line: number, k: keyof Row, v: string) => setRows((l) => l.map((r) => (r.line === line ? { ...r, [k]: v } : r)));
  const load = (r: Res<CheckedRow[]>, lines?: number[]) => {
    if (!r.ok) return toast(false, r.msg);
    setRows((r.data ?? []).map((x, i) => (lines ? { ...x, line: lines[i] } : x)));
    setOut(new Set());
  };
  return (
    <div className="stack">
      <form className="row" action={(fd) => go(async () => load(await read(fd)))}>
        <input type="file" name="file" accept=".xlsx,.csv,.xls" required aria-label="ملف المدعوين" className="grow" />
        <button className="btn dark" disabled={busy}>{busy ? "…" : "معاينة الاستيراد"}</button>
      </form>
      {rows.length ? (
        <>
          <div className="row">
            <span className="tag ok">مقبول {count("ok")}</span>
            <span className="tag warn">مكرر {count("duplicate")}</span>
            <span className="tag bad">يحتاج تصحيحًا {count("invalid")}</span>
            {out.size ? <span className="tag neutral">مستبعد {out.size}</span> : null}
          </div>
          <div className="tw">
            <table>
              <thead><tr><th>الصف</th><th>الحالة</th><th>الاسم</th><th>الجوال</th><th>البريد</th><th>مرافق</th><th>استبعاد</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} style={{ opacity: out.has(r.line) ? 0.45 : 1 }}>
                    <td className="num">{r.line}</td>
                    <td style={{ minWidth: 150 }}><span className={`tag ${ST[r.status][1]}`}>{ST[r.status][0]}</span>{r.reasons.length ? <div className="tiny muted">{r.reasons.join("، ")}</div> : null}</td>
                    <td><input value={r.name} onChange={(e) => edit(r.line, "name", e.target.value)} aria-label="الاسم" style={{ minWidth: 140 }} /></td>
                    <td><input type="tel" value={r.phone} onChange={(e) => edit(r.line, "phone", e.target.value)} aria-label="الجوال" style={{ minWidth: 130 }} /></td>
                    <td><input type="email" value={r.email} onChange={(e) => edit(r.line, "email", e.target.value)} aria-label="البريد" style={{ minWidth: 170 }} /></td>
                    <td><input value={r.companion} onChange={(e) => edit(r.line, "companion", e.target.value)} aria-label="مرافق" placeholder="نعم/لا" style={{ width: 80 }} /></td>
                    <td><input type="checkbox" aria-label="استبعاد" checked={out.has(r.line)} onChange={(e) => setOut((s) => { const x = new Set(s); if (e.target.checked) x.add(r.line); else x.delete(r.line); return x; })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => go(async () => load(await recheck(kept.map(raw)), kept.map((k) => k.line)))}>إعادة التحقق</button>
            <button type="button" className="btn go" disabled={busy || !count("ok")} onClick={() => go(async () => { const r = await commit(kept.map(raw)); toast(r.ok, r.msg ?? ""); if (r.ok) setRows([]); })}>اعتماد المقبول ({count("ok")})</button>
            <span className="small muted">الاعتماد يعيد التحقق في الخادم ولا يضيف إلا المقبول.</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
