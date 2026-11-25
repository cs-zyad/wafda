import type { Channel } from "../types";
import type { EventView } from "./view";

/**
 * نصوص الرسائل كقوالب بمتغيرات {{name}}، جاهزة لتتحول إلى قوالب واتساب معتمدة
 * (WhatsApp Business message templates). لكل قالب مفتاح ثابت ومتغيرات مسمّاة.
 */
export const TEXTS = {
  invitation: {
    key: "wafda_invitation_v1",
    subject: "دعوة: {{event_title}}",
    body: "مرحبًا {{guest_name}}،\nيسعد {{org_name}} دعوتك لحضور «{{event_title}}».\nالموعد: {{event_when}}\nالمكان: {{event_place}}\n{{companion_line}}أكّد حضورك من الرابط:\n{{invitation_link}}",
  },
  reminder: {
    key: "wafda_reminder_v1",
    subject: "تذكير: {{event_title}}",
    body: "مرحبًا {{guest_name}}،\nتذكير بدعوتك لحضور «{{event_title}}» في {{event_when}}.\nلم يصلنا ردك بعد. أكّد حضورك أو اعتذر من الرابط:\n{{invitation_link}}",
  },
  confirmation: {
    key: "wafda_confirmation_v1",
    subject: "تم تأكيد حضورك: {{event_title}}",
    body: "{{guest_name}}، تم تأكيد حضورك لـ «{{event_title}}».\nالموعد: {{event_when}}\nالمكان: {{event_place}}\nتذكرتك (اعرض رمز QR عند الدخول):\n{{ticket_link}}\n{{companion_line}}لإدارة حضورك أو الاعتذار:\n{{manage_link}}",
  },
  ticket_resend: {
    key: "wafda_ticket_resend_v1",
    subject: "تذكرتك: {{event_title}}",
    body: "{{guest_name}}، هذه تذكرتك لـ «{{event_title}}» ({{event_when}}):\n{{ticket_link}}\n{{companion_line}}لإدارة حضورك:\n{{manage_link}}",
  },
  status: {
    key: "wafda_registration_status_v1",
    subject: "تسجيلك في {{event_title}}",
    body: "{{guest_name}}، حالة تسجيلك في «{{event_title}}»: {{status_text}}.\nلمتابعة تسجيلك:\n{{manage_link}}",
  },
  waitlist_offer: {
    key: "wafda_waitlist_offer_v1",
    subject: "توفر مقعد: {{event_title}}",
    body: "{{guest_name}}، توفر مقعد في «{{event_title}}» ({{event_when}}).\nالفرصة صالحة حتى {{offer_until}}، والمقعد يُحجز عند تأكيدك إن كان لا يزال متاحًا.\nأكّد حضورك من الرابط:\n{{manage_link}}",
  },
  staff_invite: {
    key: "wafda_staff_invite_v1",
    subject: "انضمامك لفريق الاستقبال: {{event_title}}",
    body: "مرحبًا {{staff_name}}،\nأضافك {{org_name}} لفريق الاستقبال في «{{event_title}}» ({{event_when}}).\n{{access_line}}",
  },
} as const;
export type TextKey = keyof typeof TEXTS;

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? "");

export function render(key: TextKey, vars: Record<string, string>, channel: Channel) {
  const t = TEXTS[key];
  const body = fill(t.body, vars);
  return { template: t.key, vars, subject: fill(t.subject, vars), body: channel === "email" ? `${body}\n\n— وفدة | WAFDA` : body };
}

export const eventVars = (v: EventView) => ({ event_title: v.title, org_name: v.org || v.brand, event_when: v.when, event_place: v.place || "يُعلن لاحقًا" });
