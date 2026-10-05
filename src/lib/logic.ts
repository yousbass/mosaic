import type { AppState, CalEvent, Email, Job, Rule } from "../types";
import { addDays, atTime, hoursBetween, isWorkday, overlaps, startOfDay, startOfWeek, ymd, DAY, MIN } from "./time";

/** Pairs of events that overlap in time. Clashes across different jobs are flagged as cross-job. */
export interface Clash { a: CalEvent; b: CalEvent; crossJob: boolean }

export function findClashes(events: CalEvent[], from: Date, to: Date): Clash[] {
  const inRange = events
    .filter((e) => Date.parse(e.end) > from.getTime() && Date.parse(e.start) < to.getTime())
    .sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
  const out: Clash[] = [];
  for (let i = 0; i < inRange.length; i++) {
    for (let j = i + 1; j < inRange.length; j++) {
      const a = inRange[i], b = inRange[j];
      if (Date.parse(b.start) >= Date.parse(a.end)) break;
      if (overlaps(a.start, a.end, b.start, b.end)) out.push({ a, b, crossJob: a.jobId !== b.jobId });
    }
  }
  return out;
}

/** Meeting hours per job inside [from, to). */
export function hoursByJob(events: CalEvent[], jobs: Job[], from: Date, to: Date): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(jobs.map((j) => [j.id, 0]));
  for (const e of events) {
    const s = Math.max(Date.parse(e.start), from.getTime());
    const en = Math.min(Date.parse(e.end), to.getTime());
    if (en > s && e.jobId in out) out[e.jobId] += (en - s) / 3_600_000;
  }
  return out;
}

export interface Slot { start: string; end: string; reason?: string }

/**
 * Free slots of `durationMin` on workdays between `from` and `to`, inside
 * working hours (8:00–18:00), avoiding every existing event with a 15-minute buffer.
 */
export function findFreeSlots(events: CalEvent[], opts: { from: Date; to: Date; durationMin: number; limit?: number; dayStartH?: number; dayEndH?: number }): Slot[] {
  const { from, to, durationMin, limit = 6, dayStartH = 8, dayEndH = 18 } = opts;
  const buffer = 15 * MIN;
  const dur = durationMin * MIN;
  const slots: Slot[] = [];
  for (let d = startOfDay(from); d < to && slots.length < limit; d = addDays(d, 1)) {
    if (!isWorkday(d)) continue;
    let cursor = Math.max(atTime(d, dayStartH).getTime(), from.getTime());
    // round up to the next half hour
    cursor = Math.ceil(cursor / (30 * MIN)) * 30 * MIN;
    const dayEnd = atTime(d, dayEndH).getTime();
    const busy = events
      .filter((e) => Date.parse(e.start) < dayEnd && Date.parse(e.end) > cursor)
      .map((e) => [Date.parse(e.start) - buffer, Date.parse(e.end) + buffer] as const)
      .sort((a, b) => a[0] - b[0]);
    // Every gap long enough becomes a slot, at most two per day so results spread across the week.
    let perDay = 0;
    for (const [bs, be] of [...busy, [dayEnd, dayEnd] as const]) {
      if (perDay >= 2 || slots.length >= limit) break;
      if (Math.min(bs, dayEnd) - cursor >= dur) {
        slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + dur).toISOString() });
        perDay++;
      }
      cursor = Math.max(cursor, Math.ceil(be / (30 * MIN)) * 30 * MIN);
    }
  }
  return slots;
}

/** Job for an incoming email: learned rules first (exact address, then domain), else the account default. */
export function jobForSender(from: string, rules: Rule[], fallback: string): string {
  const addr = from.toLowerCase();
  const domain = addr.split("@")[1] ?? "";
  return rules.find((r) => r.match === addr)?.jobId ?? rules.find((r) => r.match === domain)?.jobId ?? fallback;
}

export interface Report {
  from: Date;
  to: Date;
  perJob: { jobId: string; hours: number; target: number; meetings: number; tasksDone: number; emails: number }[];
  totalHours: number;
  meetings: number;
  tasksDone: number;
  tasksOpen: number;
  overdue: number;
  emailsIn: number;
  draftsSent: number;
  clashes: number;
  prev: { totalHours: number; tasksDone: number; meetings: number };
}

export function reportRange(kind: "week" | "month", now: Date, offset = 0): { from: Date; to: Date } {
  if (kind === "week") {
    const from = addDays(startOfWeek(now), 7 * offset);
    return { from, to: addDays(from, 7) };
  }
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1) };
}

export function buildReport(s: AppState, kind: "week" | "month", now: Date, offset = 0): Report {
  const { from, to } = reportRange(kind, now, offset);
  const prevR = reportRange(kind, now, offset - 1);
  const inR = (iso: string | undefined, a: Date, b: Date) => !!iso && Date.parse(iso) >= a.getTime() && Date.parse(iso) < b.getTime();
  const weeks = (to.getTime() - from.getTime()) / (7 * DAY);
  const hrs = hoursByJob(s.events, s.jobs, from, to);
  const evs = s.events.filter((e) => inR(e.start, from, to));
  const done = s.tasks.filter((t) => t.status === "done" && inR(t.doneAt, from, to));
  const mails = s.emails.filter((e) => inR(e.receivedAt, from, to));
  const today = ymd(now);
  const prevHrs = hoursByJob(s.events, s.jobs, prevR.from, prevR.to);
  return {
    from, to,
    perJob: s.jobs.map((j) => ({
      jobId: j.id,
      hours: round1(hrs[j.id] ?? 0),
      target: round1(j.weeklyHours * weeks),
      meetings: evs.filter((e) => e.jobId === j.id).length,
      tasksDone: done.filter((t) => t.jobId === j.id).length,
      emails: mails.filter((e) => e.jobId === j.id).length,
    })),
    totalHours: round1(Object.values(hrs).reduce((a, b) => a + b, 0)),
    meetings: evs.length,
    tasksDone: done.length,
    tasksOpen: s.tasks.filter((t) => t.status !== "done").length,
    overdue: s.tasks.filter((t) => t.status !== "done" && t.due && t.due < today).length,
    emailsIn: mails.length,
    draftsSent: s.drafts.filter((d) => d.status === "sent" && inR(d.sentAt, from, to)).length,
    clashes: findClashes(s.events, from, to).filter((c) => c.crossJob).length,
    prev: {
      totalHours: round1(Object.values(prevHrs).reduce((a, b) => a + b, 0)),
      tasksDone: s.tasks.filter((t) => t.status === "done" && inR(t.doneAt, prevR.from, prevR.to)).length,
      meetings: s.events.filter((e) => inR(e.start, prevR.from, prevR.to)).length,
    },
  };
}

export function reportToMarkdown(r: Report, s: AppState, kind: "week" | "month"): string {
  const name = (id: string) => s.jobs.find((j) => j.id === id)?.name ?? id;
  const d = ymd;
  const lines = [
    `# Mosaic ${kind === "week" ? "weekly" : "monthly"} report`,
    `${d(r.from)} to ${d(new Date(r.to.getTime() - DAY))}`,
    "",
    `- Meeting hours: ${r.totalHours} (previous period ${r.prev.totalHours})`,
    `- Meetings: ${r.meetings}`,
    `- Tasks completed: ${r.tasksDone} (previous period ${r.prev.tasksDone})`,
    `- Open tasks: ${r.tasksOpen}, overdue: ${r.overdue}`,
    `- Emails received: ${r.emailsIn}, sent from Mosaic: ${r.draftsSent}`,
    `- Clashes between jobs: ${r.clashes}`,
    "",
    "| Job | Hours | Target | Meetings | Tasks done | Emails |",
    "|---|---:|---:|---:|---:|---:|",
    ...r.perJob.map((p) => `| ${name(p.jobId)} | ${p.hours} | ${p.target} | ${p.meetings} | ${p.tasksDone} | ${p.emails} |`),
  ];
  return lines.join("\n") + "\n";
}

/** Mail that needs the user: a reply or a scheduling decision, not archived and not yet answered from Mosaic. */
export function needsYou(s: AppState): Email[] {
  const answered = new Set(s.drafts.filter((d) => d.status === "sent" && d.replyTo).map((d) => d.replyTo));
  return s.emails.filter((e) => !e.archived && !answered.has(e.id) && (priorityOf(e) === "action" || priorityOf(e) === "meeting"));
}

export function priorityOf(e: Email): NonNullable<Email["priority"]> {
  if (e.priority) return e.priority;
  const t = (e.subject + " " + e.body).toLowerCase();
  if (/(unsubscribe|statement is ready|newsletter|noreply|no-reply)/.test(t + e.from)) return "skip";
  if (/(meeting|reschedul|move .*(call|meeting|walkthrough)|invite|zoom|teams)/.test(t)) return "meeting";
  if (/(please|could you|due|deadline|by (sun|mon|tue|wed|thu)|review|reply|send)/.test(t)) return "action";
  return "info";
}

const round1 = (x: number) => Math.round(x * 10) / 10;
export { hoursBetween };
