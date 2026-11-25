"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, ip, type Res } from "@/server/session";
import { confirmInvitation, confirmByManage, declineByManage, declineInvitation, registerPublic, type Result } from "@/server/domain/rsvp";
import { allow } from "@/server/domain/users";
import { AppError } from "@/server/errors";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const choice = (fd: FormData) => ({ single: fd.get("single") === "1", waitlist: fd.get("waitlist") === "1" });

export async function rsvpAction(token: string, _: Res<Result> | null, fd: FormData): Promise<Res<Result>> {
  return act(async () => {
    if (!(await allow(`rsvp:${await ip()}`, 60, 600_000))) throw new AppError("rate", "محاولات كثيرة؛ حاول بعد دقائق");
    const r = await confirmInvitation(token, { name: s(fd, "name"), contactType: s(fd, "contactType"), contact: s(fd, "contact"), withCompanion: fd.get("companion") === "on" }, choice(fd));
    revalidatePath(`/i/${token}`);
    return { ok: true, data: r };
  });
}

export async function declineAction(token: string): Promise<Res> {
  return act(async () => {
    await declineInvitation(token);
    revalidatePath(`/i/${token}`);
    return { ok: true, msg: "سُجّل اعتذارك. يمكنك التأكيد لاحقًا إن توفر مقعد." };
  });
}

export async function publicAction(slug: string, _: Res<Result> | null, fd: FormData): Promise<Res<Result>> {
  let to = "";
  const r = await act<Result>(async () => {
    const who = await ip();
    if (!(await allow(`pub:${who}`, 20, 600_000)) || !(await allow(`pub:${slug}:${who}`, 10, 600_000))) throw new AppError("rate", "محاولات تسجيل كثيرة من هذا الجهاز؛ حاول بعد دقائق");
    const res = await registerPublic(slug, s(fd, "key"), { name: s(fd, "name"), contactType: s(fd, "contactType"), contact: s(fd, "contact") }, choice(fd));
    if ("manageToken" in res) to = `/r/${res.manageToken}`;
    return { ok: true, data: res };
  });
  if (to) redirect(to);
  return r;
}

export async function manageConfirmAction(token: string, _: Res<Result> | null, fd: FormData): Promise<Res<Result>> {
  return act(async () => {
    const r = await confirmByManage(token, choice(fd));
    revalidatePath(`/r/${token}`);
    return { ok: true, data: r };
  });
}

export async function manageDeclineAction(token: string): Promise<Res> {
  return act(async () => {
    await declineByManage(token);
    revalidatePath(`/r/${token}`);
    return { ok: true, msg: "سُجّل اعتذارك وحُرّر مقعدك." };
  });
}
