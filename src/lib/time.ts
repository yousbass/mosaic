// Date helpers. Weeks start on Sunday and the workweek is Sunday–Thursday,
// as in Bahrain and most of the Gulf.

export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const MIN = 60_000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay()); // back to Sunday
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function atTime(day: Date, h: number, m = 0): Date {
  const x = startOfDay(day);
  x.setHours(h, m, 0, 0);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isWorkday(d: Date): boolean {
  const g = d.getDay();
  return g >= 0 && g <= 4; // Sun..Thu
}

export function hoursBetween(startIso: string, endIso: string): number {
  return Math.max(0, (Date.parse(endIso) - Date.parse(startIso)) / HOUR);
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

export function locale(lang: "en" | "ar"): string {
  // Arabic in Bahrain with Latin digits keeps times scannable next to English data.
  return lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB";
}

export function fmtTime(iso: string, lang: "en" | "ar"): string {
  return new Date(iso).toLocaleTimeString(locale(lang), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** Local calendar date as YYYY-MM-DD (not UTC). */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parse an ISO timestamp, or a bare YYYY-MM-DD as a local date. */
export function toDate(v: string | Date): Date {
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
}

export function fmtDay(iso: string | Date, lang: "en" | "ar", opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return toDate(iso).toLocaleDateString(locale(lang), opts);
}

export function relDays(iso: string, now: Date): number {
  return Math.round((startOfDay(toDate(iso)).getTime() - startOfDay(now).getTime()) / DAY);
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function uid(prefix = "x"): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}
