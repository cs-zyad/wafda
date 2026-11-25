"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanResult, Hit } from "@/server/domain/checkin";
import { fmtTime } from "@/shared/time";

type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector }
}

export function Scanner({ eventId, count: c0, reserved: r0 }: { eventId: string; count: number; reserved: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const last = useRef({ text: "", at: 0 });
  const busy = useRef(false);
  const [cam, setCam] = useState<"off" | "starting" | "on" | "insecure" | "error">("off");
  const [camErr, setCamErr] = useState("");
  const [engine, setEngine] = useState("");
  const [res, setRes] = useState<ScanResult | null>(null);
  const [count, setCount] = useState(c0);
  const [reserved, setReserved] = useState(r0);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [err, setErr] = useState("");

  const call = useCallback(async (op: string, value: string) => {
    const r = await fetch(`/api/checkin/${eventId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, value }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "خطأ");
    setCount(j.count);
    setReserved(j.reserved);
    return j;
  }, [eventId]);

  const check = useCallback(async (op: "scan" | "code" | "manual", value: string) => {
    if (busy.current) return;
    busy.current = true;
    setErr("");
    try {
      const j = (await call(op, value)) as ScanResult;
      setRes(j);
      navigator.vibrate?.(j.result === "ok" ? 150 : [90, 60, 90]);
      if (op === "manual") setHits(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      busy.current = false;
    }
  }, [call]);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCam("off");
  }, []);

  const start = useCallback(async () => {
    if (!window.isSecureContext) return setCam("insecure");
    setCam("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      stream.current = s;
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      setCam("on");
      let det: Detector | null = null;
      if (window.BarcodeDetector && new URLSearchParams(location.search).get("engine") !== "jsqr") {
        try {
          det = new window.BarcodeDetector({ formats: ["qr_code"] });
          await det.detect(v);
        } catch {
          det = null;
        }
      }
      const jsQR = det ? null : (await import("jsqr")).default;
      setEngine(det ? "BarcodeDetector" : "jsQR");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const loop = async () => {
        if (!stream.current) return;
        try {
          if (v.readyState >= 2 && !busy.current) {
            let text: string | null = null;
            if (det) text = (await det.detect(v))[0]?.rawValue ?? null;
            else if (jsQR) {
              const w = Math.min(v.videoWidth, 640), h = Math.round((v.videoHeight / v.videoWidth) * w);
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(v, 0, 0, w, h);
              text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
            const now = Date.now();
            if (text && !(text === last.current.text && now - last.current.at < 3500)) {
              last.current = { text, at: now };
              await check("scan", text);
            }
          }
        } catch {}
        setTimeout(loop, 120);
      };
      loop();
    } catch (e) {
      setCam("error");
      setCamErr((e as Error).name === "NotAllowedError" ? "لم يُسمح باستخدام الكاميرا؛ فعّل الإذن من إعدادات المتصفح." : "تعذّر تشغيل الكاميرا على هذا الجهاز.");
    }
  }, [check]);

  useEffect(() => stop, [stop]);

  return (
    <div className="stack">
      <div className="row between">
        <div className="stat" style={{ padding: "8px 14px" }}>
          <span className="k">الحاضرون </span><b className="num" style={{ fontSize: "1.4rem" }} data-testid="count">{count}</b> <span className="s">من {reserved} محجوز</span>
        </div>
        {cam === "on" ? <button className="btn sm ghost" onClick={stop}>إيقاف الكاميرا</button> : <button className="btn go" onClick={start} disabled={cam === "starting"}>{cam === "starting" ? "جارٍ التشغيل…" : "تشغيل الكاميرا"}</button>}
      </div>
      <div className={`cam${cam === "on" || cam === "starting" ? "" : " hidden"}`}><video ref={video} playsInline muted aria-label="معاينة الكاميرا" /></div>
      {cam === "on" && engine ? <p className="tiny muted center" style={{ margin: 0 }}>وجّه الكاميرا نحو رمز QR ({engine})</p> : null}
      {cam === "insecure" ? <div className="alert warn">الكاميرا على الجوال تحتاج اتصالًا آمنًا (HTTPS). افتح المنصة من رابطها الآمن، أو استخدم البدائل بالأسفل: إدخال الرمز أو رابط التذكرة، أو البحث بالاسم أو الجوال.</div> : null}
      {cam === "error" ? <div className="alert bad">{camErr} استخدم البدائل بالأسفل.</div> : null}
      <div aria-live="assertive" data-testid="result">{res ? <Show r={res} /> : <div className="res idle">جاهز للمسح</div>}</div>
      {err ? <div className="alert bad">{err}</div> : null}
      <details className="card" open={cam === "insecure" || cam === "error"}>
        <summary>إدخال الرمز أو رابط التذكرة يدويًا</summary>
        <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("code") ?? ""); if (v) check("code", v); }}>
          <input name="code" placeholder="الصق الرمز أو الرابط" className="ltr-in grow" aria-label="الرمز أو الرابط" />
          <button className="btn dark">تحقق</button>
        </form>
      </details>
      <details className="card" open={hits !== null}>
        <summary>تعذّر عرض الرمز؟ ابحث بالاسم أو الجوال أو البريد</summary>
        <form className="row" style={{ marginTop: 10 }} onSubmit={async (e) => { e.preventDefault(); setErr(""); try { setHits((await call("search", String(new FormData(e.currentTarget).get("q") ?? ""))).hits); } catch (x) { setErr((x as Error).message); } }}>
          <input type="search" name="q" required minLength={2} placeholder="الاسم أو جزء من الجوال أو البريد" aria-label="بحث عن ضيف" className="grow" />
          <button className="btn dark">بحث</button>
        </form>
        {hits ? (hits.length ? (
          <div className="list" style={{ marginTop: 10 }}>
            {hits.map((h) => (
              <div key={h.regId} className="item">
                <b>{h.name}</b> <span className="meta"><bdi dir="ltr">{h.hint}</bdi></span>
                <div className="stack" style={{ marginTop: 8 }}>
                  {h.tickets.map((t) => (
                    <div key={t.id} className="row between">
                      <span>{t.label}</span>
                      {t.status !== "active" ? <span className="tag bad">ملغاة</span> : t.inAt ? <span className="tag plum">حضر {fmtTime(t.inAt)} ({t.inMethod === "manual" ? "يدوي" : "مسح"})</span> : <button className="btn sm go" onClick={() => check("manual", t.id)}>تسجيل الحضور يدويًا</button>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="small muted">لا نتائج مؤكدة داخل هذه الفعالية.</p>) : null}
      </details>
    </div>
  );
}

function Show({ r }: { r: ScanResult }) {
  if (r.result === "ok") return <div className="res ok" role="status">✓ تم تسجيل الدخول<b>{r.label}</b><span className="small">الساعة {fmtTime(r.at)}</span></div>;
  if (r.result === "already") return <div className="res again" role="status">! حضر مسبقًا<b>{r.label}</b><span className="small">الساعة {fmtTime(r.at)} — {r.method === "manual" ? "يدويًا" : "بالمسح"}{r.by ? ` بواسطة ${r.by}` : ""}</span></div>;
  if (r.result === "cancelled") return <div className="res bad" role="alert">✕ تذكرة ملغاة<b>{r.label}</b><span className="small">اعتذر صاحبها أو أُلغي تسجيله</span></div>;
  if (r.result === "wrong_event") return <div className="res bad" role="alert">✕ هذه التذكرة لا تخص هذه الفعالية</div>;
  if (r.result === "event_cancelled") return <div className="res bad">✕ الفعالية ملغاة</div>;
  return <div className="res bad" role="alert">✕ رمز غير معروف</div>;
}
