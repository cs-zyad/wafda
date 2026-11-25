import Link from "next/link";
import { notFound } from "next/navigation";
import { owned } from "@/server/owned";
import { estimate, needsReminder, remindersOf } from "@/server/domain/sending";
import { invitationsOf } from "@/server/domain/events";
import { getSettings } from "@/server/domain/settings";
import { getUser } from "@/server/domain/users";
import { AppError } from "@/server/errors";
import type { ChannelMode } from "@/server/types";
import { ActionForm, Do, Submit } from "@/ui/client";
import { Key } from "@/ui/Key";
import { Alert, Stat, Tag } from "@/ui/kit";
import { fmtShort, msToRiyadhLocal, nowMs } from "@/shared/time";
import { sar } from "@/shared/money";
import { sendAction, scheduleAction, cancelReminderAction } from "../../../actions";

const MODES: [ChannelMode, string][] = [["both", "واتساب + البريد"], ["whatsapp", "واتساب"], ["email", "البريد"]];
const safe = async (f: () => ReturnType<typeof estimate>) => { try { return { ok: true as const, v: await f() }; } catch (e) { return { ok: false as const, err: e instanceof AppError ? e.message : "تعذّر الحساب" }; } };

function Modes() {
  return (
    <fieldset>
      <legend className="label">القناة للقائمة كاملة</legend>
      <div className="choices">{MODES.map(([m, l]) => <label className="choice" key={m}><input type="radio" name="mode" value={m} defaultChecked={m === "both"} /><span>{l}</span></label>)}</div>
      <small className="hint">تُعدّل تلقائيًا حسب وسائل التواصل المتاحة لكل مدعو، ويمكن تعديل القناة لكل مدعو من قائمة المدعوين.</small>
    </fieldset>
  );
}
function Costs({ rows }: { rows: { label: string; r: Awaited<ReturnType<typeof safe>> }[] }) {
  return (
    <div className="tw"><table>
      <thead><tr><th>القناة</th><th>المستلمون</th><th>الرسائل</th><th>التكلفة المتوقعة</th></tr></thead>
      <tbody>{rows.map(({ label, r }) => (
        <tr key={label}><td>{label}</td>{r.ok ? <><td className="num">{r.v.recipients}</td><td className="num">{r.v.messages} <span className="tiny muted">(واتساب {r.v.whatsapp} · بريد {r.v.email})</span></td><td className="num">{sar(r.v.cost)} {r.v.enough ? null : <Tag tone="bad">الرصيد لا يكفي</Tag>}</td></> : <td colSpan={3} className="small muted">{r.err}</td>}</tr>
      ))}</tbody>
    </table></div>
  );
}

export default async function Send({ params }: { params: Promise<{ id: string }> }) {
  const { user, e } = await owned((await params).id);
  if (e.type !== "private") notFound();
  const [invs, s, u, rems] = await Promise.all([invitationsOf(e.id), getSettings(), getUser(user.id), remindersOf(e.id)]);
  const failedIds = invs.filter((i) => i.sendStatus === "failed").map((i) => i.id);
  const pending = invs.filter((i) => i.sendStatus === "not_sent").length;
  const remind = invs.filter(needsReminder).length;
  const est = (k: "invitation" | "reminder", ids?: string[]) => Promise.all(MODES.map(async ([m, label]) => ({ label, r: await safe(() => estimate(user.id, e.id, k, m, ids)) })));
  const [first, again, rem] = await Promise.all([est("invitation"), failedIds.length ? est("invitation", failedIds) : Promise.resolve([]), est("reminder")]);
  const blocked = first[0].r.ok ? null : first[0].r.err;
  return (
    <div className="stack-lg">
      <div className="grid g4">
        <Stat hl k="رصيد الرسائل" v={sar(u?.credit ?? 0)} s={<Link href="/dashboard/credit">شحن الرصيد</Link>} />
        <Stat k="سعر الرسالة" v={sar(s.prices.message.whatsapp)} s={`واتساب — البريد ${sar(s.prices.message.email)}${s.prices.demo ? " (تجريبية)" : ""}`} />
        <Stat k="لم تُرسل" v={pending} />
        <Stat k="بحاجة لتذكير" v={remind} s="وصلتهم الدعوة ولم يردوا" />
      </div>
      <Alert>رسوم الدعوات والتذكيرات من رصيد الرسائل حسب القناة. رسالة تأكيد الحضور مع التذكرة <b>مشمولة في الباقة</b>. عند عدم كفاية الرصيد: {s.policy.lowCredit === "block" ? "يُمنع الإرسال كاملًا (لا يُرسل ولا يُخصم شيء)" : "يُرسل ما يغطيه الرصيد بترتيب القائمة"}.</Alert>
      {blocked ? <Alert tone="warn">{blocked} <Link href={`/dashboard/events/${e.id}/payment`}>الباقة والدفع</Link></Alert> : null}
      <section className="card stack">
        <h2>الدعوة الأولى</h2>
        <p className="small muted">لكل من لم تصله الدعوة بعد ({pending} مدعو).</p>
        <Costs rows={first} />
        <ActionForm action={sendAction.bind(null, e.id)} className="stack" confirm="تأكيد الإرسال؟ تُخصم التكلفة من رصيد الرسائل.">
          <Key /><input type="hidden" name="kind" value="invitation" /><Modes />
          <Submit disabled={!!blocked || !pending}>إرسال الدعوات</Submit>
        </ActionForm>
      </section>
      {failedIds.length ? (
        <section className="card stack">
          <h2>إعادة الإرسال لمن تعذّر الإرسال إليهم ({failedIds.length})</h2>
          <p className="small muted">صحّح الرقم أو البريد أولًا من قائمة المدعوين. إعادة الإرسال رسالة جديدة بتكلفة جديدة.</p>
          <Costs rows={again} />
          <ActionForm action={sendAction.bind(null, e.id)} className="stack" confirm="تأكيد إعادة الإرسال؟">
            <Key /><input type="hidden" name="kind" value="invitation" />{failedIds.map((x) => <input key={x} type="hidden" name="ids" value={x} />)}<Modes />
            <Submit className="btn dark">إعادة الإرسال</Submit>
          </ActionForm>
        </section>
      ) : null}
      <section className="card stack">
        <h2>تذكير من لم يؤكد</h2>
        <p className="small muted">فقط لمن وصلته الدعوة ولم يرد ({remind} مدعو).</p>
        <Costs rows={rem} />
        <div className="grid g2 top">
          <ActionForm action={sendAction.bind(null, e.id)} className="card soft stack" confirm="إرسال التذكير الآن؟">
            <h3>الآن</h3><Key /><input type="hidden" name="kind" value="reminder" /><Modes />
            <Submit className="btn dark" disabled={!remind || !!blocked}>إرسال التذكير الآن</Submit>
          </ActionForm>
          <ActionForm action={scheduleAction.bind(null, e.id)} className="card soft stack">
            <h3>جدولة</h3>
            <label className="field"><span>الموعد (بتوقيت الرياض)</span><input type="datetime-local" name="runAt" required min={msToRiyadhLocal(nowMs())} max={msToRiyadhLocal(e.endAt)} /></label>
            <Modes />
            <small className="hint">عند التنفيذ يُعاد فحص كل مدعو، فلا يصل لمن أكّد أو اعتذر في الأثناء. التكلفة أعلاه تقديرية بحسب الحالة الآن.</small>
            <Submit className="btn dark" disabled={!!blocked}>جدولة التذكير</Submit>
          </ActionForm>
        </div>
        {rems.length ? (
          <div className="tw"><table>
            <thead><tr><th>الموعد</th><th>القناة</th><th>الحالة</th><th>النتيجة</th><th></th></tr></thead>
            <tbody>{rems.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmtShort(r.runAt)}</td>
                <td>{MODES.find(([m]) => m === r.mode)?.[1]}</td>
                <td><Tag tone={r.status === "done" ? "ok" : r.status === "failed" ? "bad" : r.status === "cancelled" ? "neutral" : "info"}>{{ scheduled: "مجدول", running: "قيد التنفيذ", done: "نُفّذ", failed: "فشل", cancelled: "ملغى" }[r.status]}</Tag></td>
                <td className="small">{r.result ?? "—"}</td>
                <td>{r.status === "scheduled" ? <Do action={cancelReminderAction.bind(null, e.id, r.id)}>إلغاء</Do> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : null}
      </section>
    </div>
  );
}
