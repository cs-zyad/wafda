import nodemailer, { type Transporter } from "nodemailer";
import { ref } from "../db";
import { isDemo } from "../env";
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
  /** mock = تجريبي، live = فعلي، off = القناة غير مفعّلة (لا تُعرض ولا يُرسل عليها) */
  mode: "mock" | "live" | "off";
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

/** قناة غير مفعّلة بعد: لا تُعرض في الواجهات، وأي رسالة تصلها تفشل نهائيًا (وتُسترجع قيمتها إن كانت من الرصيد). */
export class OffProvider implements MessageProvider {
  mode = "off" as const;
  constructor(public channel: Channel, public label: string) {}
  async send(): Promise<SendOutcome> {
    return { ok: false, permanent: true, error: "القناة غير مفعّلة بعد" };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** نص الرسالة كما هو، مع روابط قابلة للضغط واتجاه عربي */
export function emailHtml(body: string) {
  const html = esc(body)
    .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#5b2a6e;word-break:break-all" dir="ltr">${u}</a>`)
    .replace(/\n/g, "<br>");
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.9;color:#28182c;text-align:right">${html}</div>`;
}

/** بريد فعلي عبر SMTP (مثل Gmail بكلمة مرور تطبيق، أو أي مزوّد بريد لاحقًا) */
class SmtpProvider implements MessageProvider {
  channel = "email" as const;
  mode = "live" as const;
  label = "البريد (SMTP)";
  private t: Transporter | null = null;
  private transport() {
    const port = Number(process.env.SMTP_PORT || 465);
    return (this.t ??= nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }));
  }
  async send(m: Message): Promise<SendOutcome> {
    try {
      const r = await this.transport().sendMail({ from: process.env.EMAIL_FROM || `"وفدة" <${process.env.SMTP_USER}>`, to: m.to, subject: m.subject || "وفدة", text: m.body, html: emailHtml(m.body) });
      return { ok: true, providerId: r.messageId };
    } catch (e) {
      const code = (e as { responseCode?: number }).responseCode ?? 0;
      // 5xx = رفض نهائي (عنوان غير موجود مثلًا)؛ غير ذلك مؤقت ويُعاد بالمحاولات
      return { ok: false, permanent: code >= 500 && code < 600, error: `البريد: ${(e as Error).message}`.slice(0, 300) };
    }
  }
}

export const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const providers: Record<Channel, MessageProvider> = isDemo()
  ? { whatsapp: new InboxProvider("whatsapp", "واتساب (تجريبي)"), email: new InboxProvider("email", "البريد (تجريبي)") }
  : { whatsapp: new OffProvider("whatsapp", "واتساب (غير مفعّل)"), email: smtpConfigured() ? new SmtpProvider() : new OffProvider("email", "البريد (غير مفعّل: اضبط SMTP)") };

export const messageProvider = (c: Channel) => providers[c];
export const setMessageProvider = (p: MessageProvider) => void (providers[p.channel] = p);
/** هل القناة متاحة للإرسال (تجريبية أو فعلية)؟ */
export const channelReady = (c: Channel) => providers[c].mode !== "off";
export const messagingStatus = () => Object.values(providers).map((p) => ({ channel: p.channel, label: p.label, mode: p.mode }));
