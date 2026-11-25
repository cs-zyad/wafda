import { me } from "@/server/session";
import { getEvent } from "@/server/domain/events";
import { attendanceCsv } from "@/server/domain/stats";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await me();
  if (!u) return new Response("سجّل الدخول", { status: 401 });
  const e = await getEvent((await params).id);
  if (!e || e.ownerId !== u.id) return new Response("غير موجودة", { status: 404 });
  return new Response(await attendanceCsv(e), {
    headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="attendance-${e.id}.csv"; filename*=UTF-8''${encodeURIComponent(`كشف-الحضور-${e.title}.csv`)}` },
  });
}
