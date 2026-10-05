import React, { useEffect, useState } from "react";
import { Archive, CalendarPlus, ChevronLeft, ListPlus, MailOpen, Reply, Sparkles, PenLine } from "lucide-react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { MAIL_WEB_NAME } from "../lib/handoff";
import { JobChip, JobSelect, SampleChip, Thinking, jobOf, useT } from "../ui";
import { needsYou, priorityOf } from "../lib/logic";
import { fmtDay, fmtTime, uid } from "../lib/time";
import { connector } from "../data/connectors";
import { use, aiErrorCopy, isSampleError, type SampleFn } from "../lib/platform";
import type { Email } from "../types";

type Tab = "attention" | "all" | "drafts" | "sent";

export function InboxView({ emailId }: { emailId?: string }) {
  const { s, update, toast } = useStore();
  const nav = useNav();
  const t = useT();
  const [tab, setTab] = useState<Tab>("attention");
  const [job, setJob] = useState<string>(s.focusJobId ?? "");
  const [acct, setAcct] = useState<string>("");
  const mailAccounts = s.connections.filter((c) => ["outlook", "gmail", "yahoo"].includes(c.connectorId));
  const [sel, setSel] = useState<string | undefined>(emailId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (emailId) { setSel(emailId); setTab("all"); } }, [emailId]);
  useEffect(() => { // opening a message marks it read
    if (sel) update((st) => st.emails.some((e) => e.id === sel && e.unread) ? { ...st, emails: st.emails.map((e) => e.id === sel ? { ...e, unread: false } : e) } : st);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const keep = (x: { jobId: string; accountId?: string }) => (!job || x.jobId === job) && (!acct || x.accountId === acct);
  const attention = new Set(needsYou(s).map((e) => e.id));
  const mails = s.emails.filter((e) => !e.archived && keep(e))
    .filter((e) => tab !== "attention" || attention.has(e.id) || e.id === sel)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const drafts = s.drafts.filter((d) => keep(d) && d.status === (tab === "sent" ? "sent" : "draft"));
  const cur = s.emails.find((e) => e.id === sel);

  async function triage() {
    setErr("");
    const sample = await use<SampleFn>("sample");
    if (!sample) { setErr(t("AI sorting works when Mosaic is opened on claude.ai.", "يعمل الفرز الذكي عند فتح Mosaic على claude.ai.")); return; }
    setBusy(true);
    const list = s.emails.filter((e) => !e.archived).slice(0, 25);
    const prompt = `Sort these emails for someone with several jobs. For each, choose priority: "action" (needs a reply or task from them), "meeting" (about scheduling), "info" (worth reading, no action), "skip" (notifications, marketing).\n` +
      `Also choose the job it belongs to from: ${s.jobs.map((j) => `${j.id}=${j.name} (${j.role})`).join("; ")}.\n` +
      `Reply with JSON only: [{"id": string, "priority": string, "job": string}].\n\n` +
      list.map((e) => `id=${e.id} | from ${e.fromName} <${e.from}> | ${e.subject} | ${e.body.slice(0, 200)}`).join("\n");
    try {
      const r = await sample.json<{ id: string; priority: Email["priority"]; job: string }[]>(prompt, { modelTier: "quick", cache: false });
      if (!Array.isArray(r)) throw { code: "invalid_json" };
      const okP = ["action", "meeting", "info", "skip"];
      const byId = new Map(r.filter((x) => x && typeof x.id === "string").map((x) => [x.id, x]));
      update((st) => ({ ...st, emails: st.emails.map((e) => {
        const x = byId.get(e.id);
        if (!x) return e;
        const p = okP.includes(String(x.priority)) ? x.priority : e.priority;
        const j = st.jobs.some((jj) => jj.id === x.job) ? x.job : e.jobId;
        return { ...e, priority: p, jobId: j };
      }) }), t("Inbox sorted", "تم فرز البريد"));
    } catch (e) { if (isSampleError(e) && e.code !== "cancelled") setErr(aiErrorCopy(e.code, s.lang)); }
    finally { setBusy(false); }
  }

  const tabs: [Tab, string, number][] = [
    ["attention", t("Needs you", "يحتاجك"), needsYou(s).filter(keep).length],
    ["all", t("All mail", "كل البريد"), 0],
    ["drafts", t("Drafts", "المسودات"), s.drafts.filter((d) => d.status === "draft" && keep(d)).length],
    ["sent", t("Sent", "المرسل"), 0],
  ];

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <div className="seg" role="tablist">
          {tabs.map(([id, label, n]) => <button key={id} role="tab" aria-pressed={tab === id} aria-selected={tab === id} onClick={() => setTab(id)}>{label}{n ? ` · ${n}` : ""}</button>)}
        </div>
        <div style={{ width: 180 }}><JobSelect id="inbox-job" value={job} onChange={(v) => { setJob(v); setAcct(""); }} allowAll={t("All jobs", "كل الوظائف")} /></div>
        <select id="inbox-acct" className="select" style={{ width: 210 }} value={acct} onChange={(e) => setAcct(e.target.value)} aria-label={t("Account", "الحساب")}>
          <option value="">{t("All accounts", "كل الحسابات")}</option>
          {mailAccounts.filter((a) => !job || a.jobIds.includes(job)).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <div className="grow" />
        {busy && <Thinking label={t("Sorting…", "أفرز…")} />}
        <button className="btn primary" onClick={triage} disabled={busy}><Sparkles size={15} />{t("Sort with AI", "افرز بالذكاء الاصطناعي")}</button>
        <button className="btn primary" onClick={() => nav.composeEmail({ jobId: job || undefined })}><PenLine size={15} />{t("New email", "بريد جديد")}</button>
      </div>
      {err && <p className="small" style={{ color: "var(--danger)" }}>{err}</p>}
      <div className={"split" + (cur && tab !== "drafts" && tab !== "sent" ? " has-sel" : "")}>
        <div className="panel list-panel">
          {(tab === "drafts" || tab === "sent") ? (
            <>
              {drafts.map((d) => (
                <button key={d.id} className="mail-row" data-j={jobOf(s, d.jobId)?.color} onClick={() => nav.composeEmail({ draftId: d.id })}>
                  <span className="vbar" />
                  <div className="li-main">
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><span className="li-title">{d.to || t("(no recipient)", "(بلا مستلم)")}</span>
                      {d.createdBy === "ai" && <span className="chip meeting">{t("AI draft", "مسودة ذكية")}</span>}
                      {d.sentVia && <span className="chip" style={{ marginInlineStart: "auto" }}>{t(`Via ${MAIL_WEB_NAME[d.sentVia]}`, `عبر ${MAIL_WEB_NAME[d.sentVia]}`)}</span>}</div>
                    <div className="li-sub">{d.subject || t("(no subject)", "(بلا موضوع)")}</div>
                  </div>
                </button>
              ))}
              {drafts.length === 0 && <p className="empty">{tab === "drafts" ? t("No drafts. Ask the assistant to write one.", "لا مسودات. اطلب من المساعد كتابة واحدة.") : t("Nothing sent from Mosaic yet.", "لم يُرسل شيء من Mosaic بعد.")}</p>}
            </>
          ) : (
            <>
              {mails.map((m) => {
                const p = priorityOf(m);
                return (
                  <button key={m.id} className="mail-row" data-j={jobOf(s, m.jobId)?.color} aria-current={sel === m.id} onClick={() => setSel(m.id)}>
                    <span className="vbar" />
                    <div className="li-main">
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <span className={"li-title" + (m.unread ? " unread" : "")}>{m.fromName}</span>
                        <span className="faint mono small" style={{ marginInlineStart: "auto" }}>{sameDayLabel(m.receivedAt, s.lang)}</span>
                      </div>
                      <div className="li-sub" style={{ color: "var(--ink)" }}>{m.subject}</div>
                      <div className="row small" style={{ gap: 6, marginTop: 4 }}>
                        <JobChip jobId={m.jobId} />
                        <span className="chip">{s.connections.find((c) => c.id === m.accountId)?.label ?? t("Removed account", "حساب محذوف")}</span>
                        {p === "action" && <span className="chip action">{t("Reply", "رد")}</span>}
                        {p === "meeting" && <span className="chip meeting">{t("Meeting", "اجتماع")}</span>}
                        {p === "skip" && <span className="chip">{t("Low priority", "أولوية منخفضة")}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
              {mails.length === 0 && <p className="empty">{t("Nothing here.", "لا شيء هنا.")}</p>}
            </>
          )}
        </div>
        <div className="panel reader-panel">
          {cur && tab !== "drafts" && tab !== "sent" ? <Reader m={cur} onBack={() => setSel(undefined)} onArchive={() => {
            update((st) => ({ ...st, emails: st.emails.map((e) => e.id === cur.id ? { ...e, archived: true } : e) }), t("Archived", "أُرشفت"));
            setSel(undefined);
          }} onTask={() => {
            update((st) => ({ ...st, tasks: [{ id: uid("tk"), title: cur.subject, jobId: cur.jobId, status: "todo", source: "mosaic", priority: priorityOf(cur) === "action" ? "high" : "normal", createdBy: "user" }, ...st.tasks] }));
            toast(t("Task added", "أُضيفت المهمة"));
          }} /> : <div className="empty" style={{ padding: "60px 20px" }}><MailOpen size={28} /><b style={{ color: "var(--ink)" }}>{t("Pick a message to read", "اختر رسالة لقراءتها")}</b>
            <span>{t("Mail from every account is here, tagged by job. Sort with AI to see what needs you first.", "بريد كل الحسابات هنا، مصنّف حسب الوظيفة. افرز بالذكاء الاصطناعي لترى ما يحتاجك أولًا.")}</span></div>}
        </div>
      </div>
    </div>
  );
}

function sameDayLabel(iso: string, lang: "en" | "ar") {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? fmtTime(iso, lang) : fmtDay(iso, lang, { day: "numeric", month: "short" });
}

function Reader({ m, onArchive, onTask, onBack }: { m: Email; onArchive: () => void; onTask: () => void; onBack: () => void }) {
  const { s, update } = useStore();
  const nav = useNav();
  const t = useT();
  const [always, setAlways] = useState(false);
  const domain = m.from.split("@")[1] ?? m.from;
  const changeJob = (jobId: string) => {
    update((st) => {
      const rules = always ? [...st.rules.filter((r) => r.match !== domain), { id: uid("r"), match: domain, jobId }] : st.rules;
      return { ...st, rules, emails: st.emails.map((e) => e.id === m.id || (always && e.from.toLowerCase().endsWith("@" + domain)) ? { ...e, jobId } : e) };
    }, always ? t(`Mail from ${domain} now goes to ${jobOf(s, jobId)?.name}`, `بريد ${domain} يذهب الآن إلى ${jobOf(s, jobId)?.name}`) : t("Job changed", "تم تغيير الوظيفة"));
  };
  return (
    <div className="reader">
      <button className="btn sm ghost back-btn" style={{ alignSelf: "flex-start" }} onClick={onBack}><ChevronLeft size={15} className="flip" />{t("All messages", "كل الرسائل")}</button>
      <div className="row"><JobChip jobId={m.jobId} /><span className="small muted">{s.connections.find((c) => c.id === m.accountId)?.label ?? connector(m.source)?.name}</span><SampleChip /></div>
      <h2>{m.subject}</h2>
      <div className="small muted"><b style={{ color: "var(--ink)" }}>{m.fromName}</b> &lt;{m.from}&gt; · {fmtDay(m.receivedAt, s.lang)} {fmtTime(m.receivedAt, s.lang)}</div>
      <div className="row">
        <button className="btn primary" onClick={() => nav.composeEmail({ replyTo: m.id, to: m.from, subject: m.subject.startsWith("Re:") ? m.subject : "Re: " + m.subject, jobId: m.jobId })}><Reply size={15} />{t("Reply with AI", "رد بمساعدة الذكاء الاصطناعي")}</button>
        {priorityOf(m) === "meeting" && <button className="btn" onClick={() => nav.ask(s.lang === "ar"
          ? `${m.fromName} يطلب تغيير موعد (الرسالة "${m.subject}" في بريدي). اقترح وقتًا لا يتعارض مع وظائفي، وانقل الاجتماع وجهّز ردًا بعد أن أوافق.`
          : `${m.fromName} asked to reschedule (their email "${m.subject}" is in my mail). Suggest a time that works across my jobs; once I agree, move the meeting and draft a reply.`, false)}><CalendarPlus size={15} />{t("Reschedule with AI", "أعد الجدولة بالذكاء الاصطناعي")}</button>}
        <button className="btn" onClick={onTask}><ListPlus size={15} />{t("Make a task", "حوّل لمهمة")}</button>
        <button className="btn ghost" onClick={onArchive}><Archive size={15} />{t("Archive", "أرشفة")}</button>
      </div>
      <div className="reader-body">{m.body}</div>
      <div className="callout" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <span className="small">{t("Wrong job?", "وظيفة خاطئة؟")}</span>
        <div style={{ width: 200 }}><JobSelect id="reader-job" value={m.jobId} onChange={changeJob} /></div>
        <label className="row small" style={{ gap: 6 }}><input id="reader-always" type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />{t(`Always for mail from ${domain}`, `دائمًا لبريد ${domain}`)}</label>
      </div>
    </div>
  );
}

