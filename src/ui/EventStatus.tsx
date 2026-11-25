import type { EventDoc } from "@/server/types";
import { Tag } from "./kit";
import { nowMs } from "@/shared/time";

export function EventStatus({ e }: { e: EventDoc }) {
  return e.status === "cancelled" ? <Tag tone="bad">ملغاة</Tag> : e.status === "draft" ? <Tag tone="warn">مسودة</Tag> : e.endAt < nowMs() ? <Tag>انتهت</Tag> : <Tag tone="ok">نشطة</Tag>;
}
