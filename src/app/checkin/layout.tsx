import { Shell } from "@/ui/Shell";
import { need } from "@/server/session";
export default async function L({ children }: { children: React.ReactNode }) {
  return <Shell user={await need(["organizer", "staff"])}>{children}</Shell>;
}
