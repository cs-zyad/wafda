import { sampleXlsx } from "@/server/domain/importer";
export async function GET() {
  return new Response(new Uint8Array(await sampleXlsx()), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="wafda-guests-sample.xlsx"' } });
}
