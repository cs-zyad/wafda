import type { Res } from "@/server/session";
import { ActionForm, Submit } from "./client";
import { fmtShort } from "@/shared/time";

export function Thread({ items, action, title = "المراسلات" }: { items: { id: string; mine: boolean; who: string; body: string; at: number }[]; action: (p: Res | null, fd: FormData) => Promise<Res>; title?: string }) {
  return (
    <section className="card stack">
      <h3>{title}</h3>
      {items.length ? (
        <div className="list">
          {items.map((m) => (
            <div key={m.id} className="item" style={{ background: m.mine ? "var(--lilac2)" : undefined, marginInlineEnd: m.mine ? 24 : 0, marginInlineStart: m.mine ? 0 : 24 }}>
              <div className="meta">{m.who} · {fmtShort(m.at)}</div>
              <div className="break" style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
            </div>
          ))}
        </div>
      ) : <p className="small muted">لا رسائل بعد.</p>}
      <ActionForm action={action} className="stack" reset>
        <label className="field"><span className="sr">رسالتك</span><textarea name="body" required maxLength={3000} placeholder="اكتب رسالتك…" /></label>
        <Submit className="btn dark">إرسال</Submit>
      </ActionForm>
    </section>
  );
}
