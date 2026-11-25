// توقيت الرياض (UTC+3 بلا توقيت صيفي) وتقويم ميلادي وأرقام لاتينية.
export const TZ = "Asia/Riyadh";
const OFFSET = 3 * 3600_000;
export const MINUTE = 60_000;
export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export function riyadhLocalToMs(local: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - OFFSET : null;
}
export const msToRiyadhLocal = (ms: number) => new Date(ms + OFFSET).toISOString().slice(0, 16);

const LOC = "ar-SA-u-nu-latn-ca-gregory";
const fDate = new Intl.DateTimeFormat(LOC, { timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric" });
const fTime = new Intl.DateTimeFormat(LOC, { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const fShort = new Intl.DateTimeFormat(LOC, { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtDate = (ms: number) => fDate.format(ms);
export const fmtTime = (ms: number) => fTime.format(ms);
export const fmtShort = (ms: number) => fShort.format(ms);
export const fmtDateTime = (ms: number) => `${fDate.format(ms)}، الساعة ${fTime.format(ms)}`;
export const nowMs = () => Date.now();
