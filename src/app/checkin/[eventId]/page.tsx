import { notFound } from "next/navigation";
import { need } from "@/server/session";
import { accessTo } from "@/server/domain/checkin";
import { Scanner } from "@/ui/Scanner";
import { Back } from "@/ui/kit";

export const metadata = { title: "ماسح التحضير" };
export default async function ScanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const u = await need(["organizer", "staff"]);
  const e = await accessTo(u, (await params).eventId);
  if (!e) notFound();
  return (
    <div style={{ maxWidth: 560, marginInline: "auto" }}>
      <Back href="/checkin">الفعاليات</Back>
      <h1 className="break" style={{ fontSize: "1.25rem", margin: "6px 0 12px" }}>{e.title}</h1>
      <Scanner eventId={e.id} count={e.inGuests + e.inCompanions} reserved={e.reserved} />
    </div>
  );
}
