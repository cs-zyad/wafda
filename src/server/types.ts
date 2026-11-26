// نموذج البيانات (وثائق Firestore). الأوقات بالميلي ثانية، والمبالغ بالهللة.

export type Role = "organizer" | "staff" | "admin";
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: "active" | "invited" | "suspended";
  passwordHash?: string;
  /** جوال/واتساب للتواصل (المنظّم) */
  phone?: string;
  credit: number; // رصيد الرسائل (هللة)
  createdAt: number;
}

export type EventType = "private" | "public";
export type FullPolicy = "close" | "waitlist";
export interface EventDoc {
  id: string;
  ownerId: string;
  status: "draft" | "active" | "cancelled";
  type: EventType;
  title: string;
  orgName: string;
  description: string;
  startAt: number;
  endAt: number;
  venue: string;
  address: string;
  mapUrl: string;
  maxAttendees: number;
  fullPolicy: FullPolicy;
  templateId: string | null;
  slug: string; // الرابط العام
  paidPlaces: number; // أماكن الباقة المدفوعة
  reserved: number; // المقاعد المحجوزة فعليًا (الحقيقة الوحيدة للسعة)
  inGuests: number; // الحاضرون (ضيوف)
  inCompanions: number; // الحاضرون (مرافقون)
  createdAt: number;
  updatedAt: number;
}

export type Channel = "whatsapp" | "email";
export type ChannelMode = Channel | "both";
export type SendStatus = "not_sent" | "sending" | "sent" | "failed";
export type RegStatus = "none" | "confirmed" | "declined" | "waitlisted" | "offered" | "cancelled";

export interface Invitation {
  id: string;
  eventId: string;
  ownerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  companion: boolean; // تسمح بمرافق واحد
  token: string; // رابط الدعوة (160 بت)
  channel: ChannelMode | null; // تعديل القناة لهذا المدعو
  send: Record<Channel, SendStatus>;
  sendStatus: SendStatus; // الحالة المجمّعة
  sentAt: number | null;
  regStatus: RegStatus; // نسخة من حالة التسجيل (تُحدَّث في نفس المعاملة)
  order: number;
  createdAt: number;
}

export interface Registration {
  id: string; // inv_<invitationId> أو pub_<hash>
  eventId: string;
  ownerId: string;
  source: EventType;
  invitationId: string | null;
  name: string;
  contactType: "phone" | "email";
  contact: string;
  status: Exclude<RegStatus, "none">;
  seats: number; // المحجوز فعليًا
  wantSeats: number; // المطلوب (للانتظار)
  manageToken: string;
  offerUntil: number | null;
  waitlistedAt: number | null;
  confirmedAt: number | null;
  resendAt: number | null;
  seq: { confirm: number; resend: number; offer: number };
  createdAt: number;
  updatedAt: number;
}

export type TicketKind = "guest" | "companion";
export interface Ticket {
  id: string; // <registrationId>_<kind>
  token: string; // محتوى QR (160 بت، بلا بيانات شخصية)
  eventId: string;
  registrationId: string;
  kind: TicketKind;
  guestName: string;
  status: "active" | "cancelled";
  inAt: number | null;
  inBy: string | null;
  inByName: string | null;
  inMethod: "scan" | "manual" | null;
  createdAt: number;
}

export type MessageKind = "invitation" | "reminder" | "confirmation" | "waitlist_offer" | "staff_invite" | "ticket_resend";
export interface Message {
  id: string;
  ownerId: string | null;
  eventId: string | null;
  batchId: string | null;
  invitationId: string | null;
  registrationId: string | null;
  kind: MessageKind;
  channel: Channel;
  to: string;
  template: string; // مفتاح قالب واتساب المعتمد
  vars: Record<string, string>;
  subject: string;
  body: string;
  status: "queued" | "sending" | "sent" | "failed";
  attempts: number;
  nextAt: number;
  lease: number | null;
  chargedTo: "credit" | "package" | "platform";
  cost: number; // المخصوم من الرصيد
  opCost: number; // تكلفة تشغيل تقديرية
  refunded: boolean;
  error: string | null;
  log: { at: number; s: string; note?: string }[];
  createdAt: number;
  sentAt: number | null;
}

export type LayoutKey = "plum_frame" | "ivory_classic" | "lilac_soft" | "corporate" | "workshop";
export interface Template {
  id: string;
  layout: LayoutKey;
  name: string;
  category: string;
  colors: string[]; // 5 ألوان: الخلفية، النص، المميز، الأسطح، النص الثانوي
  visible: boolean;
  order: number;
  ownerId: string | null; // قالب خاص بمنظّم
  createdAt: number;
}

export interface Settings {
  prices: {
    demo: boolean;
    packages: { places: number; price: number }[];
    extraPlace: number;
    message: Record<Channel, number>;
    confirmOpCost: Record<Channel, number>;
  };
  policy: {
    lowCredit: "block" | "partial";
    maxAttempts: number;
    retryBaseSec: number;
    offerHours: number;
    resendMinMinutes: number;
    staffInviteDays: number;
  };
}
