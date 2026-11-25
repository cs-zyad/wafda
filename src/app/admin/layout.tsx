import { Shell } from "@/ui/Shell";
import { needAdmin } from "@/server/session";
export default async function L({ children }: { children: React.ReactNode }) {
  return <Shell user={await needAdmin()}>{children}</Shell>;
}
