import { NextResponse } from "next/server";
import { handleWebhook } from "@/server/domain/payments";

/** الإشعار الموثّق من مزوّد الدفع — المسار الوحيد لتثبيت الدفع وزيادة السعة وشحن الرصيد */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 64_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  try {
    const r = await handleWebhook(raw, req.headers);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error("[webhook]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 }); // المزوّد يعيد المحاولة؛ المعالجة آمنة للتكرار
  }
}
