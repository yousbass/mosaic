import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CalendarClock, Check, Gavel, Mail, Plus, Send, Sparkles, Trash2, Video, Inbox, PartyPopper } from "lucide-react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { JobChip, SampleChip, Thinking, jobOf, onActivate, useJobFilter, useT } from "../ui";
import { Markdown } from "../lib/markdown";
import { findClashes, hoursByJob, needsYou, priorityOf } from "../lib/logic";
import { addDays, fmtDay, fmtTime, relDays, sameDay, startOfDay, startOfWeek, uid, ymd } from "../lib/time";
import { use, aiErrorCopy, isSampleError, type SampleFn } from "../lib/platform";
import { nextWorkingSlot } from "../modals";
import type { Page, Task } from "../types";

export interface WidgetProps { page: Page; accountId?: string }

export function platformName(p: string, lang: "en" | "ar") {
  if (p === "teams") return "Teams";
  if (p === "zoom") return "Zoom";
  if (p === "in-person") return lang === "ar" ? "حضوري" : "In person";
  return "";
}

export const fmtBhd = (n: number, lang: "en" | "ar") =>
  (lang === "ar" ? "د.ب " : "BHD ") + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export function toggleTask(tasks: Task[], id: string): Task[] {
  return tasks.map((k) => k.id === id ? (k.status === "done" ? { ...k, status: "todo", doneAt: undefined } : { ...k, status: "done", doneAt: new Date().toISOString() }) : k);
}

export function Body({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) {
  return <div className="card-body" style={pad ? undefined : { padding: 0 }}>{children}</div>;
}
export function Foot({ children }: { children: React.ReactNode }) {
  return <div className="card-foot">{children}</div>;
}

/* ---------------- AI briefing ---------------- */
export function Brief({ page }: WidgetProps) {
  return <Body><BriefContent page={page} /></Body>;
}

/** Today's shape and what needs the user, used by the briefing card and the Home header. */
export function BriefContent({ page, compact }: WidgetProps & { compact?: boolean }) {
  const { s, update } = useStore();
  const nav = useNav();
  const t = useT();
  const keep = useJobFilter(page.jobId);
  const now = new Date();
  const today = ymd(now);
  const clashes = findClashes(s.events, startOfDay(now), addDays(startOfWeek(now), 7)).filter((c) => c.crossJob && (keep(c.a) || keep(c.b)));
  const waiting = needsYou(s).filter(keep);
  const actionMail = waiting.filter((e) => priorityOf(e) === "action");
  const dueSoon = s.tasks.filter((x) => x.status !== "done" && x.due && x.due <= ymd(addDays(now, 1)) && keep(x));
  const tenders = s.tenders.filter((x) => relDays(x.deadline, now) >= 0 && relDays(x.deadline, now) <= 5);
  const todays = s.events.filter((e) => sameDay(new Date(e.start), now) && keep(e));
  const next = s.events.filter((e) => Date.parse(e.start) > now.getTime() && keep(e)).sort((a, b) => a.start.localeCompare(b.start))[0];
  const [ai, setAi] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function write() {
    setErr(""); setBusy(true); setAi("");
    const sample = await use<SampleFn>("sample");
    if (!sample) { setBusy(false); setErr(t("The AI briefing works when Mosaic is opened on claude.ai.", "يعمل الموجز الذكي عند فتح Mosaic على claude.ai.")); return; }
    const { context } = await import("../ai/assistant");
    try {
      await sample(
        `Write a short briefing for someone who works these jobs${page.jobId ? `, focused on ${jobOf(s, page.jobId)?.name}` : ""}. ${s.lang === "ar" ? "Write in Arabic." : "Write in English."}\n` +
        `Format: one short sentence on the shape of the day, then at most 4 bullets ("- "), each starting with the job name in **bold**, ordered by urgency. ` +
        `Mention clashes between jobs first and how to fix them. Under 100 words.\n\n${context(s, now)}`,
        { modelTier: "quick", cache: { gcTime: 30 * 60_000 }, onText: ({ text }: { text: string }) => setAi(text) });
    } catch (e) {
      if (isSampleError(e) && e.code !== "cancelled") setErr(aiErrorCopy(e.code, s.lang));
    } finally { setBusy(false); }
  }

  const items: { ic: string; icon: React.ReactNode; text: React.ReactNode; act: React.ReactNode; key: string }[] = [];
  clashes.slice(0, 2).forEach((c) => items.push({
    key: "c" + c.a.id + c.b.id, ic: "red", icon: <AlertTriangle size={15} />,
    text: <><b>{t("Clash", "تعارض")}</b> · {c.a.title.split(" — ")[0]} × {c.b.title.split(" — ")[0]} <span className="muted">({fmtDay(c.a.start, s.lang)})</span></>,
    act: <button className="btn sm soft" onClick={() => nav.ask(s.lang === "ar"
      ? `لدي تعارض بين "${c.a.title}" و"${c.b.title}". اقترح أفضل حل ووقتًا جديدًا للاجتماع الذي يمكن نقله.`
      : `I have a clash between "${c.a.title}" and "${c.b.title}". Suggest the best fix and a new time for the one that can move.`, true)}>{t("Fix", "حل")}</button>,
  }));
  actionMail.slice(0, 2).forEach((m) => items.push({
    key: m.id, ic: "blue", icon: <Mail size={15} />,
    text: <><b>{m.fromName}</b> · {m.subject}</>,
    act: <button className="btn sm" onClick={() => nav.go({ kind: "inbox", emailId: m.id })}>{t("Open", "فتح")}</button>,
  }));
  dueSoon.slice(0, 2).forEach((x) => items.push({
    key: x.id, ic: "amber", icon: <CalendarClock size={15} />,
    text: <><b>{x.due! < today ? t("Overdue", "متأخرة") : t("Due soon", "قريبًا")}</b> · {x.title}</>,
    act: <button className="btn sm" onClick={() => update((st) => ({ ...st, tasks: toggleTask(st.tasks, x.id) }), t("Task completed", "تم إنجاز المهمة"))}><Check size={14} />{t("Done", "تم")}</button>,
  }));
  tenders.slice(0, 1).forEach((x) => items.push({
    key: x.id, ic: "green", icon: <Gavel size={15} />,
    text: <><b>{t(`Tender closes in ${relDays(x.deadline, now)}d`, `مناقصة تغلق خلال ${relDays(x.deadline, now)} يوم`)}</b> · {x.title}</>,
    act: <button className="btn sm" onClick={() => nav.go({ kind: "tenders" })}>{t("View", "عرض")}</button>,
  }));

  return (
      <div className={"brief" + (compact ? " compact" : "")}>
        <div className="stack" style={{ gap: 12, minHeight: 0 }}>
          <p className="brief-lead">
            {s.lang === "ar"
              ? <>لديك <em>{todays.length} اجتماعات</em> اليوم، و<em>{waiting.length} رسائل</em> تحتاجك{clashes.length ? <>، و<em>{clashes.length} تعارض</em> بين وظائفك</> : null}.</>
              : <>You have <em>{todays.length} meeting{todays.length === 1 ? "" : "s"}</em> today, <em>{waiting.length} email{waiting.length === 1 ? "" : "s"}</em> waiting on you{clashes.length ? <> and <em>{clashes.length} clash{clashes.length === 1 ? "" : "es"}</em> between jobs</> : null}.</>}
          </p>
          {ai ? <div style={{ overflowY: "auto", minHeight: 0 }}><Markdown text={ai} /></div> : next && (
            <div className="next-up" data-j={jobOf(s, next.jobId)?.color}>
              <span className="vbar" />
              <span className="when">{fmtTime(next.start, s.lang)}</span>
              <div className="li-main">
                <div className="tiny muted">{t("Next up", "التالي")}{sameDay(new Date(next.start), now) ? "" : " · " + fmtDay(next.start, s.lang)}</div>
                <div className="li-title">{next.title}</div>
                <div className="li-sub">{jobOf(s, next.jobId)?.name}{next.platform !== "none" ? " · " + platformName(next.platform, s.lang) : ""}</div>
              </div>
              <button className="btn sm" onClick={() => nav.editEvent({ id: next.id })}>{t("Details", "التفاصيل")}</button>
            </div>
          )}
          {err && <p className="err">{err}</p>}
          <div className="row" style={{ marginTop: compact ? 0 : "auto" }}>
            <button className="btn soft sm" onClick={write} disabled={busy}><Sparkles size={14} />{ai ? t("Rewrite summary", "أعد كتابة الملخص") : t("Write a summary of my day", "اكتب ملخص يومي")}</button>
            {busy && !ai && <Thinking label={t("Reading your day…", "أقرأ يومك…")} />}
          </div>
        </div>
        <div className="brief-items">
          {items.length === 0 && <div className="empty"><PartyPopper size={22} />{t("Nothing urgent. A good day to get ahead.", "لا شيء عاجل. يوم مناسب للتقدم.")}</div>}
          {items.slice(0, 5).map((i) => (
            <div className="brief-item" key={i.key}>
              <span className={"ic " + i.ic}>{i.icon}</span>
              <div className="grow small" style={{ minWidth: 0 }}>{i.text}</div>
              {i.act}
            </div>
          ))}
        </div>
      </div>
  );
}

/* ---------------- Agenda ---------------- */
export function Agenda({ page }: WidgetProps) {
  const { s } = useStore();
  const nav = useNav();
  const t = useT();
  const keep = useJobFilter(page.jobId);
  const now = new Date();
  const clashIds = useMemo(() => new Set(findClashes(s.events, startOfDay(now), addDays(now, 8)).filter((c) => c.crossJob).flatMap((c) => [c.a.id, c.b.id])), [s.events]); // eslint-disable-line react-hooks/exhaustive-deps
  // The coming week, grouped by day; today always shows, other days only when something is booked.
  const days = Array.from({ length: 7 }, (_, d) => addDays(startOfDay(now), d));
  let shown = 0;
  return (
    <>
      <Body>
        <div className="list">
          {days.map((d, i) => {
            const evs = s.events.filter((e) => sameDay(new Date(e.start), d) && keep(e)).sort((a, b) => a.start.localeCompare(b.start));
            if ((i > 0 && !evs.length) || shown >= 12) return null;
            shown += evs.length;
            return (
              <React.Fragment key={i}>
                <div className="day-label">{i === 0 ? t("Today", "اليوم") : i === 1 ? t("Tomorrow", "غدًا") : fmtDay(d, s.lang, { weekday: "long" })} · {fmtDay(d, s.lang, { day: "numeric", month: "short" })}</div>
                {evs.length === 0 && <p className="small faint" style={{ padding: "4px 6px 8px" }}>{t("Nothing else today.", "لا شيء آخر اليوم.")}</p>}
                {evs.map((e) => {
                  const j = jobOf(s, e.jobId);
                  const past = Date.parse(e.end) < now.getTime();
                  return (
                    <div className="li click" data-j={j?.color} key={e.id} role="button" tabIndex={0} onClick={() => nav.editEvent({ id: e.id })}
                      onKeyDown={onActivate(() => nav.editEvent({ id: e.id }))} style={past ? { opacity: .5 } : undefined}>
                      <span className="li-time">{fmtTime(e.start, s.lang)}</span>
                      <span className="vbar" />
                      <div className="li-main">
                        <div className="li-title">{e.title}</div>
                        <div className="li-sub">{page.jobId ? "" : j?.name + " · "}{platformName(e.platform, s.lang) || e.location}</div>
                      </div>
                      {clashIds.has(e.id) && <span className="chip action">{t("Clash", "تعارض")}</span>}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </Body>
      <Foot>
        <button className="btn sm" onClick={() => nav.editEvent({ jobId: page.jobId })}><Plus size={14} />{t("Event", "حدث")}</button>
        <button className="btn sm ghost" style={{ marginInlineStart: "auto" }} onClick={() => nav.go({ kind: "calendar" })}>{t("Week", "الأسبوع")}<ArrowUpRight size={14} /></button>
      </Foot>
    </>
  );
}

/* ---------------- Clashes ---------------- */
export function Conflicts({ page }: WidgetProps) {
  const { s } = useStore();
  const nav = useNav();
  const t = useT();
  const keep = useJobFilter(page.jobId);
  const now = new Date();
  const list = findClashes(s.events, startOfDay(now), addDays(startOfWeek(now), 14)).filter((c) => c.crossJob && (keep(c.a) || keep(c.b)));
  if (!list.length) return <Body><div className="empty"><Check size={22} />{t("No clashes in the next two weeks.", "لا تعارضات في الأسبوعين القادمين.")}</div></Body>;
  return (
    <Body>
      <div className="list">
        {list.map((c) => (
          <div className="li" key={c.a.id + c.b.id} style={{ flexDirection: "column", gap: 6 }}>
            <div className="small muted">{fmtDay(c.a.start, s.lang)} · {fmtTime(c.b.start, s.lang)}–{fmtTime(c.a.end < c.b.end ? c.a.end : c.b.end, s.lang)}</div>
            {[c.a, c.b].map((e) => (
              <div key={e.id} className="row" style={{ gap: 6, flexWrap: "nowrap", width: "100%" }}>
                <span className="li-title grow">{e.title}</span><JobChip jobId={e.jobId} />
              </div>
            ))}
            <button className="btn sm soft" onClick={() => nav.ask(s.lang === "ar"
              ? `لدي تعارض بين "${c.a.title}" و"${c.b.title}". اقترح أفضل حل.`
              : `I have a clash between "${c.a.title}" and "${c.b.title}". Suggest the best fix and a new time for the one that can move.`, true)}>
              <Sparkles size={13} />{t("Find a fix", "اقترح حلًا")}
            </button>
          </div>
        ))}
      </div>
    </Body>
  );
}

/* ---------------- Mail list (shared by All mail and the per-account mail app) ---------------- */
export function MailList({ filter, compose, limit = 8 }: { filter: (e: import("../types").Email) => boolean; compose: { jobId?: string; accountId?: string }; limit?: number }) {
  const { s } = useStore();
  const nav = useNav();
  const t = useT();
  const mails = s.emails.filter((e) => !e.archived && filter(e)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const shown = mails.filter((e) => priorityOf(e) !== "skip").slice(0, limit);
  const answerIds = new Set(needsYou(s).map((e) => e.id));
  const toAnswer = mails.filter((e) => answerIds.has(e.id)).length;
  return (
    <>
      <Body>
        <div className="list">
          {shown.map((m) => {
            const p = priorityOf(m);
            return (
              <div className="li click" key={m.id} role="button" tabIndex={0} onClick={() => nav.go({ kind: "inbox", emailId: m.id })}
                onKeyDown={onActivate(() => nav.go({ kind: "inbox", emailId: m.id }))}>
                {m.unread ? <span className="unread-dot" aria-label={t("Unread", "غير مقروءة")} /> : <span style={{ width: 7, flex: "none" }} />}
                <div className="li-main">
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <span className="li-title" style={{ fontWeight: m.unread ? 800 : 600 }}>{m.fromName}</span>
                    {p === "action" && <span className="chip action">{t("Reply", "رد")}</span>}
                    {p === "meeting" && <span className="chip meeting">{t("Meeting", "اجتماع")}</span>}
                    <span className="li-meta" style={{ marginInlineStart: "auto" }}>{timeAgo(m.receivedAt, s.lang)}</span>
                  </div>
                  <div className="li-sub" style={{ color: "var(--ink-2)" }}>{m.subject}</div>
                  <div className="li-sub">{m.body}</div>
                </div>
              </div>
            );
          })}
          {shown.length === 0 && <div className="empty"><Inbox size={22} />{t("You're all caught up.", "لا جديد في البريد.")}</div>}
        </div>
      </Body>
      <Foot>
        <button className="btn sm primary" onClick={() => nav.composeEmail(compose)}><Send size={13} />{t("Write", "اكتب")}</button>
        {toAnswer > 0 && <span className="chip ai">{t(`${toAnswer} to answer`, `${toAnswer} للرد`)}</span>}
        <button className="btn sm ghost" style={{ marginInlineStart: "auto" }} onClick={() => nav.go({ kind: "inbox" })}>{t("Open inbox", "افتح البريد")}<ArrowUpRight size={14} /></button>
      </Foot>
    </>
  );
}

export function timeAgo(iso: string, lang: "en" | "ar") {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return fmtTime(iso, lang);
  const days = -relDays(iso, now);
  if (days === 1) return lang === "ar" ? "أمس" : "Yesterday";
  return fmtDay(iso, lang, { day: "numeric", month: "short" });
}

export function AllMail({ page }: WidgetProps) {
  const keep = useJobFilter(page.jobId);
  return <MailList filter={keep} compose={{ jobId: page.jobId }} />;
}

/* ---------------- Tasks ---------------- */
export function Tasks({ page }: WidgetProps) {
  const { s, update } = useStore();
  const nav = useNav();
  const t = useT();
  const keep = useJobFilter(page.jobId);
  const [title, setTitle] = useState("");
  const now = new Date();
  const list = s.tasks.filter((x) => x.status !== "done" && keep(x))
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || (a.priority === "high" ? -1 : 1));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const jobId = page.jobId ?? s.focusJobId ?? s.jobs[0]?.id;
    update((st) => ({ ...st, tasks: [{ id: uid("tk"), title: title.trim(), jobId, status: "todo", source: "mosaic", priority: "normal", createdBy: "user" }, ...st.tasks] }));
    setTitle("");
  };
  return (
    <>
      <Body>
        <div className="list">
          {list.map((x) => {
            const j = jobOf(s, x.jobId);
            const d = x.due ? relDays(x.due, now) : undefined;
            return (
              <div className="li" key={x.id} data-j={j?.color}>
                <button className="check" role="checkbox" aria-checked={false} aria-label={t("Mark done", "تمّت") + ": " + x.title}
                  onClick={() => update((st) => ({ ...st, tasks: toggleTask(st.tasks, x.id) }), t("Nice work. Task completed.", "أحسنت. تم إنجاز المهمة."))} />
                <div className="li-main">
                  <div className="li-title" style={{ whiteSpace: "normal", fontWeight: 600 }}>{x.title}</div>
                  <div className="row tiny" style={{ gap: 5, marginTop: 3 }}>
                    {!page.jobId && <JobChip jobId={x.jobId} />}
                    {x.source === "salesforce" && <span className="chip">Salesforce</span>}
                    {x.priority === "high" && <span className="chip warn">{t("High", "عالية")}</span>}
                    {d !== undefined && <span className={"chip" + (d < 0 ? " action" : "")}>{d < 0 ? t(`${-d}d late`, `متأخرة ${-d} يوم`) : d === 0 ? t("Today", "اليوم") : d === 1 ? t("Tomorrow", "غدًا") : fmtDay(x.due!, s.lang, { weekday: "short", day: "numeric" })}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {list.length === 0 && <div className="empty"><PartyPopper size={22} />{t("All done here.", "أنجزت كل شيء هنا.")}</div>}
        </div>
      </Body>
      <Foot>
        <form onSubmit={add} className="addline grow">
          <input id={"addtask-" + page.id} className="input grow" placeholder={t("Add a task…", "أضف مهمة…")} value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t("New task", "مهمة جديدة")} />
          <button className="icon-btn sm" type="submit" aria-label={t("Add", "أضف")}><Plus size={16} /></button>
        </form>
        <button className="btn sm ghost" onClick={() => nav.go({ kind: "tasks" })} aria-label={t("Open task board", "افتح لوحة المهام")}><ArrowUpRight size={14} /></button>
      </Foot>
    </>
  );
}

/* ---------------- Time per job ---------------- */
export function TimeSplit({ page }: WidgetProps) {
  const { s } = useStore();
  const t = useT();
  const ws = startOfWeek(new Date());
  const hrs = hoursByJob(s.events, s.jobs, ws, addDays(ws, 7));
  const jobs = s.jobs.filter((j) => !page.jobId || j.id === page.jobId);
  return (
    <Body>
      <div className="stack" style={{ gap: 12 }}>
        {jobs.map((j) => {
          const h = hrs[j.id] ?? 0;
          const pct = Math.min(100, (h / Math.max(1, j.weeklyHours)) * 100);
          return (
            <div key={j.id} data-j={j.color} className="stack" style={{ gap: 5 }}>
              <div className="row small" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <span className="row" style={{ gap: 7, flexWrap: "nowrap", minWidth: 0 }}><i className="dot" /><span className="li-title" style={{ fontSize: 13 }}>{j.name}</span></span>
                <span className="num muted" style={{ flex: "none" }}><b style={{ color: "var(--ink)" }}>{h.toFixed(1)}</b> / {j.weeklyHours}{t("h", "س")}</span>
              </div>
              <div className={"bar" + (h > j.weeklyHours ? " over" : "")} role="img" aria-label={`${j.name}: ${h.toFixed(1)} / ${j.weeklyHours}`}><i style={{ width: pct + "%" }} /></div>
            </div>
          );
        })}
        <p className="tiny faint">{t("Booked meeting hours this week against each job's target.", "ساعات الاجتماعات هذا الأسبوع مقابل هدف كل وظيفة.")}</p>
      </div>
    </Body>
  );
}

/* ---------------- Tenders ---------------- */
export function TendersW() {
  const { s } = useStore();
  const nav = useNav();
  const t = useT();
  const now = new Date();
  const list = [...s.tenders].filter((x) => relDays(x.deadline, now) >= 0).sort((a, b) => a.deadline.localeCompare(b.deadline));
  return (
    <>
      <Body>
        <div className="list">
          {list.map((x) => {
            const d = relDays(x.deadline, now);
            return (
              <div className="li click" key={x.id} role="button" tabIndex={0} onClick={() => nav.go({ kind: "tenders" })} onKeyDown={onActivate(() => nav.go({ kind: "tenders" }))}>
                <div className={"countdown" + (d <= 3 ? " urgent" : "")}><b>{d}</b><span>{t("days", "يوم")}</span></div>
                <div className="li-main">
                  <div className="li-title" style={{ whiteSpace: "normal" }}>{x.title}</div>
                  <div className="li-sub">{x.entity}{x.valueBhd ? " · " + fmtBhd(x.valueBhd, s.lang) : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Body>
      <Foot><span className="tiny muted grow">{t("Watching", "مراقبة")}: {s.tenderKeywords.join(", ")}</span><SampleChip /></Foot>
    </>
  );
}

/* ---------------- Quick meeting ---------------- */
export function Meet({ page }: WidgetProps) {
  const nav = useNav();
  const t = useT();
  const make = (platform: "teams" | "zoom") => {
    const st = nextWorkingSlot(new Date());
    nav.editEvent({ title: "", start: st.toISOString(), end: new Date(st.getTime() + 30 * 60_000).toISOString(), platform, jobId: page.jobId });
  };
  return (
    <Body>
      <div className="stack">
        <div className="meet-big">
          <button onClick={() => make("teams")}><span className="app-mono" data-tone="indigo">Tm</span><b>Teams</b><span className="tiny muted">{t("Schedule a call", "جدولة مكالمة")}</span></button>
          <button onClick={() => make("zoom")}><span className="app-mono" data-tone="blue">Zm</span><b>Zoom</b><span className="tiny muted">{t("Schedule a call", "جدولة مكالمة")}</span></button>
        </div>
        <button className="btn soft" onClick={() => nav.ask(t("Find a 45-minute slot next week for a client meeting and set up a Teams call.", "ابحث عن 45 دقيقة الأسبوع القادم لاجتماع مع عميل وجهّز مكالمة Teams."))}>
          <Video size={15} />{t("Let AI pick a time", "دع المساعد يختار الوقت")}
        </button>
      </div>
    </Body>
  );
}

/* ---------------- Notes ---------------- */
export function Notes({ page }: WidgetProps) {
  const { s, update } = useStore();
  const t = useT();
  const keep = useJobFilter(page.jobId);
  const [text, setText] = useState("");
  const list = s.notes.filter(keep).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    update((st) => ({ ...st, notes: [{ id: uid("n"), text: text.trim(), jobId: page.jobId ?? st.focusJobId, updatedAt: new Date().toISOString() }, ...st.notes] }));
    setText("");
  };
  return (
    <>
      <Body>
        <div className="list">
          {list.map((n) => (
            <div className="li" key={n.id}>
              <div className="li-main"><div className="small" style={{ whiteSpace: "pre-wrap" }} dir="auto">{n.text}</div>
                <div className="row tiny faint" style={{ gap: 6, marginTop: 3 }}>{!page.jobId && <JobChip jobId={n.jobId} />}{fmtDay(n.updatedAt, s.lang)}</div></div>
              <button className="icon-btn sm" aria-label={t("Delete note", "احذف الملاحظة")}
                onClick={() => update((st) => ({ ...st, notes: st.notes.filter((x) => x.id !== n.id) }), t("Note deleted", "حُذفت الملاحظة"))}><Trash2 size={13} /></button>
            </div>
          ))}
          {list.length === 0 && <div className="empty">{t("No notes yet.", "لا ملاحظات بعد.")}</div>}
        </div>
      </Body>
      <Foot>
        <form onSubmit={add} className="addline grow">
          <input id={"note-" + page.id} className="input grow" placeholder={t("Jot something down…", "دوّن ملاحظة…")} value={text} onChange={(e) => setText(e.target.value)} aria-label={t("New note", "ملاحظة جديدة")} />
          <button className="icon-btn sm" type="submit" aria-label={t("Add", "أضف")}><Plus size={16} /></button>
        </form>
      </Foot>
    </>
  );
}

