import { notFound } from "next/navigation";
import { needOrganizer } from "./session";
import { ownEvent } from "./domain/events";
import { AppError } from "./errors";

/** فعالية يملكها المنظّم الحالي، وإلا 404 (عزل المنظّمين) */
export async function owned(id: string) {
  const user = await needOrganizer();
  try {
    return { user, e: await ownEvent(user.id, id) };
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
}
