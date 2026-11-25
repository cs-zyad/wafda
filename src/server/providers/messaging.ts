import { ref } from "../db";
import type { Channel, Message } from "../types";

export interface SendOutcome {
  ok: boolean;
  permanent?: boolean;
  error?: string;
  providerId?: string;
}

/** واجهة مزوّد الرسائل. منطق المنتج لا يعرف إلا هذه الواجهة. */
export interface MessageProvider {
  channel: Channel;
  label: string;
  mode: "mock" | "live";
  send(m: Message): Promise<SendOutcome>;
}

/**
 * محاكاة الحالات: رقم ينتهي بـ 0000 أو بريد فيه fail = فشل نهائي؛
 * رقم ينتهي بـ 1111 أو بريد فيه flaky = فشل مؤقت في المحاولة الأولى ثم نجاح.
 */
export function simulate(channel: Channel, to: string, attempts: number): SendOutcome | null {
  const hard = channel === "whatsapp" ? to.endsWith("0000") : to.includes("fail");
  const flaky = channel === "whatsapp" ? to.endsWith("1111") : to.includes("flaky");
  if (hard) return { ok: false, permanent: true, error: "الوجهة مرفوضة لدى المزوّد (محاكاة فشل نهائي)" };
  if (flaky && attempts === 0) return { ok: false, error: "انقطاع مؤقت لدى المزوّد (محاكاة)" };
  return null;
}

/** المزوّد التجريبي: يضع الرسائل في صندوق الرسائل التجريبي /dev/inbox */
class InboxProvider implements MessageProvider {
  mode = "mock" as const;
  constructor(public channel: Channel, public label: string) {}
  async send(m: Message): Promise<SendOutcome> {
    const s = simulate(m.channel, m.to, m.attempts);
    if (s) return s;
    await ref("devInbox", m.id).set({ id: m.id, channel: m.channel, to: m.to, subject: m.subject, body: m.body, kind: m.kind, template: m.template, eventId: m.eventId, at: Date.now() });
    return { ok: true, providerId: `inbox_${m.id}` };
  }
}

const providers: Record<Channel, MessageProvider> = {
  whatsapp: new InboxProvider("whatsapp", "واتساب (تجريبي)"),
  email: new InboxProvider("email", "البريد (تجريبي)"),
};
export const messageProvider = (c: Channel) => providers[c];
export const setMessageProvider = (p: MessageProvider) => void (providers[p.channel] = p);
export const messagingStatus = () => Object.values(providers).map((p) => ({ channel: p.channel, label: p.label, mode: p.mode }));
