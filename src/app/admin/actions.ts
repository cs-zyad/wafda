"use server";

import { revalidatePath } from "next/cache";
import { act, needAdmin, type Res } from "@/server/session";
import { AppError } from "@/server/errors";
import { toHalalas, sar } from "@/shared/money";
import { token } from "@/server/crypto";
import { setSuspended } from "@/server/domain/users";
import { adjust } from "@/server/domain/ledger";
import { saveTemplate, type TemplateInput } from "@/server/domain/templates";
import { ref } from "@/server/db";
import { audit, getSettings, saveSettings } from "@/server/domain/settings";
import { quoteDesign, rejectDesign, startDesign, deliverDesign, designMessage } from "@/server/domain/designs";
import { reply, type SupportStatus } from "@/server/domain/support";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const tpl = (fd: FormData): TemplateInput => ({ layout: s(fd, "layout"), name: s(fd, "name"), category: s(fd, "category"), colors: [0, 1, 2, 3, 4].map((i) => s(fd, `c${i}`)), visible: fd.get("visible") === "on", order: Number(s(fd, "order") || 99) });

export const suspendAction = async (userId: string, on: boolean, _: Res | null, fd: FormData) =>
  act(async () => {
    const a = await needAdmin();
    if (userId === a.id) throw new AppError("self", "لا تستطيع إيقاف حسابك");
    await setSuspended(a.id, userId, on, s(fd, "reason"));
    revalidatePath("/admin/users");
    return { ok: true, msg: on ? "أُوقف الحساب وأُنهيت جلساته" : "فُعّل الحساب" };
  });

export const adjustAction = async (userId: string, _: Res | null, fd: FormData) =>
  act(async () => {
    const a = await needAdmin();
    const amt = toHalalas(s(fd, "amount"));
    if (!amt) throw new AppError("validation", "أدخل مبلغًا");
    const r = await adjust(a.id, userId, (s(fd, "dir") === "debit" ? -1 : 1) * amt, s(fd, "reason"), s(fd, "key") || token());
    revalidatePath("/admin/users");
    return { ok: true, msg: r.dup ? "نُفّذت هذه التسوية سابقًا" : `تمت التسوية؛ الرصيد ${sar(r.entry.balance)}` };
  });

export const templateSaveAction = async (id: string | null, _: Res | null, fd: FormData) =>
  act(async () => {
    await saveTemplate((await needAdmin()).id, id, tpl(fd));
    revalidatePath("/admin/templates");
    return { ok: true, msg: "حُفظ القالب" };
  });

export const templateVisibleAction = async (id: string, visible: boolean) =>
  act(async () => {
    const a = await needAdmin();
    await ref("templates", id).update({ visible });
    await audit(a.id, visible ? "template.show" : "template.hide", `templates/${id}`);
    revalidatePath("/admin/templates");
    return { ok: true, msg: visible ? "أصبح ظاهرًا" : "أُخفي القالب" };
  });

export const designAdminAction = async (id: string, op: "quote" | "reject" | "start" | "deliver" | "msg", _: Res | null, fd: FormData) =>
  act(async () => {
    const a = await needAdmin();
    if (op === "quote") {
      const amt = toHalalas(s(fd, "amount"));
      if (!amt) throw new AppError("validation", "أدخل المبلغ");
      await quoteDesign(a.id, id, { amount: amt, notes: s(fd, "notes"), days: Number(s(fd, "days") || 7) });
    } else if (op === "reject") await rejectDesign(a.id, id, s(fd, "reason"));
    else if (op === "start") await startDesign(a.id, id);
    else if (op === "deliver") {
      const t = tpl(fd);
      await deliverDesign(a.id, id, { layout: t.layout, name: t.name, category: t.category || "خاص", colors: t.colors });
    } else await designMessage(a, id, s(fd, "body"));
    revalidatePath(`/admin/designs/${id}`);
    return { ok: true, msg: op === "msg" ? undefined : "تم" };
  });

export const supportAdminAction = async (id: string, _: Res | null, fd: FormData) =>
  act(async () => {
    const st = s(fd, "status");
    await reply(await needAdmin(), id, s(fd, "body"), (["open", "working", "resolved", "closed"].includes(st) ? st : undefined) as SupportStatus | undefined);
    revalidatePath(`/admin/support/${id}`);
    return { ok: true, msg: "حُفظ" };
  });

export const settingsAction = async (_: Res | null, fd: FormData) =>
  act(async () => {
    const a = await needAdmin();
    const cur = await getSettings();
    const money = (k: string) => { const v = toHalalas(s(fd, k)); if (v === null) throw new AppError("validation", "قيمة مالية غير صالحة"); return v; };
    const int = (k: string, lo: number, hi: number) => { const v = Number(s(fd, k)); if (!Number.isInteger(v) || v < lo || v > hi) throw new AppError("validation", `قيمة خارج النطاق (${lo}–${hi})`); return v; };
    const packages = cur.prices.packages.map((_, i) => ({ places: int(`p${i}`, 1, 100000), price: money(`v${i}`) })).sort((x, y) => x.places - y.places);
    if (new Set(packages.map((p) => p.places)).size !== packages.length) throw new AppError("validation", "أحجام الباقات يجب أن تختلف");
    await saveSettings(a.id, {
      prices: { demo: fd.get("demo") === "on", packages, extraPlace: money("extra"), message: { whatsapp: money("wa"), email: money("em") }, confirmOpCost: { whatsapp: money("owa"), email: money("oem") } },
      policy: { lowCredit: s(fd, "lowCredit") === "partial" ? "partial" : "block", maxAttempts: int("attempts", 1, 10), retryBaseSec: int("retry", 0, 3600), offerHours: int("offer", 1, 336), resendMinMinutes: int("resend", 0, 1440), staffInviteDays: int("staffDays", 1, 30) },
    });
    revalidatePath("/admin/settings");
    return { ok: true, msg: "حُفظت الإعدادات وسُجّلت في سجل التدقيق" };
  });
