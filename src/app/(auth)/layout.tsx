import { PublicBar } from "@/ui/Shell";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicBar />
      <main className="wrap page">
        <div className="narrow card">{children}</div>
      </main>
    </>
  );
}
