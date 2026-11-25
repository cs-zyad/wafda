import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runJobs } from "@/server/domain/jobs";

/** Vercel Cron يرسل Authorization: Bearer CRON_SECRET */
export async function GET(req: Request) {
  const want = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const got = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runJobs());
}
