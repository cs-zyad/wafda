import { NextResponse } from "next/server";
import { me, sameOrigin } from "@/server/session";
import { accessTo, findAttendee, manualIn, scan } from "@/server/domain/checkin";
import { getEvent } from "@/server/domain/events";
import { AppError } from "@/server/errors";

/** واجهة الماسح: الجلسة والصلاحية والفعالية تُتحقق في الخادم */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  if (!sameOrigin(req.headers)) return NextResponse.json({ error: "مصدر غير موثوق" }, { status: 403 });
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return NextResponse.json({ error: "طلب غير صالح" }, { status: 415 });
  const u = await me();
  if (!u) return NextResponse.json({ error: "سجّل الدخول" }, { status: 401 });
  const { eventId } = await params;
  if (!(await accessTo(u, eventId))) return NextResponse.json({ error: "الفعالية غير موجودة" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { op?: string; value?: string };
  const value = String(body.value ?? "").slice(0, 300);
  try {
    const out =
      body.op === "scan" ? await scan(u, eventId, value, "scan")
      : body.op === "code" ? await scan(u, eventId, value, "manual")
      : body.op === "manual" ? await manualIn(u, eventId, value)
      : body.op === "search" ? { hits: await findAttendee(u, eventId, value) }
      : null;
    if (!out) return NextResponse.json({ error: "عملية غير معروفة" }, { status: 400 });
    const e = await getEvent(eventId);
    return NextResponse.json({ ...out, count: (e?.inGuests ?? 0) + (e?.inCompanions ?? 0), reserved: e?.reserved ?? 0 });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
