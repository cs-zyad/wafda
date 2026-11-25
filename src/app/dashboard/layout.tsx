import { Shell } from "@/ui/Shell";
import { needOrganizer } from "@/server/session";
export default async function L({ children }: { children: React.ReactNode }) {
  return <Shell user={await needOrganizer()}>{children}</Shell>;
}
