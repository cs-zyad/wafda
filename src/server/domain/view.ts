import type { EventDoc } from "../types";
import { fmtDate, fmtTime } from "@/shared/time";
import { brand } from "@/config/brand";

export function appUrl() {
  const a = process.env.APP_URL?.trim();
  if (a) return a.replace(/\/+$/, "");
  const v = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return v ? `https://${v}` : `http://localhost:${process.env.PORT || 3000}`;
}

export const link = {
  invitation: (t: string) => `${appUrl()}/i/${t}`,
  manage: (t: string) => `${appUrl()}/r/${t}`,
  ticket: (t: string) => `${appUrl()}/t/${t}`,
  event: (slug: string) => `${appUrl()}/e/${slug}`,
  setup: (t: string) => `${appUrl()}/set-password/${t}`,
};

/**
 * دالة العرض الوحيدة لبيانات الفعالية: صفحة الدعوة والقالب ونصوص الرسائل كلها تمر من هنا،
 * فتظهر البيانات بنفس الصياغة أينما ظهرت.
 */
export function eventView(e: Pick<EventDoc, "title" | "orgName" | "description" | "startAt" | "endAt" | "venue" | "address" | "mapUrl">, guestName = "") {
  const date = fmtDate(e.startAt);
  const time = fmtTime(e.startAt);
  const endTime = fmtTime(e.endAt);
  return {
    title: e.title,
    org: e.orgName,
    description: e.description,
    date,
    time,
    endTime,
    when: `${date}، الساعة ${time} حتى ${endTime}`,
    venue: e.venue,
    address: e.address,
    mapUrl: e.mapUrl,
    place: [e.venue, e.address].filter(Boolean).join(" — "),
    guestName,
    brand: brand.fullName,
  };
}
export type EventView = ReturnType<typeof eventView>;
