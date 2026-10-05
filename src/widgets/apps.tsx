import React, { useState } from "react";
import { ArrowUpRight, CalendarPlus, File, FileSpreadsheet, FileText, Plug, Presentation, Sparkles, Video, MessageSquare } from "lucide-react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { AppMono, Thinking, accountOf, jobOf, useJobFilter, useT } from "../ui";
import { connector } from "../data/connectors";
import { fmtDay, fmtTime, uid } from "../lib/time";
import { use, aiErrorCopy, isSampleError, type SampleFn } from "../lib/platform";
import { nextWorkingSlot } from "../modals";
import { Body, Foot, MailList, fmtBhd, timeAgo, type WidgetProps } from "./tools";
import { DriveApp } from "./drive";
import type { ConnectorId, Platform } from "../types";

/** Shown inside an app widget that has no account yet. */
export function ConnectState({ connectorId, choices, page, widgetId }: { connectorId: ConnectorId; choices?: ConnectorId[]; page: WidgetProps["page"]; widgetId: string }) {
  const { s } = useStore();
  const nav = useNav();
  const t = useT();
  const c = connector(connectorId)!;
  const job = jobOf(s, page.jobId);
  const many = !!choices && choices.length > 1;
  const allMail = many && choices!.every((x) => connector(x)?.category === "mail");
  const names = (choices ?? []).map((x) => connector(x)?.name).join(" or ");
  const namesAr = (choices ?? []).map((x) => connector(x)?.name).join(" أو ");
  return (
    <Body>
      <div className="connect-state">
        <AppMono connectorId={connectorId} size="lg" />
        <b>{many ? (allMail ? t("Connect an email account", "اربط حساب بريد") : t(`Connect ${names}`, `اربط ${namesAr}`)) : t(`Connect ${c.name}`, `اربط ${c.name}`)}{job ? t(` for ${job.name}`, ` لـ ${job.name}`) : ""}</b>
        <p>{s.lang === "ar" ? c.gives.ar : c.gives.en}</p>
        <button className="btn primary sm" onClick={() => nav.connect({ ...(choices && choices.length > 1 ? { choices } : { connectorId }), jobId: page.jobId, bind: { pageId: page.id, widgetId } })}><Plug size={14} />{t("Connect account", "اربط الحساب")}</button>
      </div>
    </Body>
  );
}

export function MailApp({ accountId }: WidgetProps) {
  const { s } = useStore();
  const acc = accountOf(s, accountId);
  return <MailList filter={(e) => e.accountId === accountId} compose={{ accountId, jobId: acc?.jobIds[0] }} />;
}

const STAGES = [
  { id: "qualified", en: "Qualified", ar: "مؤهلة", match: ["lead", "qualified"] },
  { id: "proposal", en: "Proposal", ar: "عرض", match: ["proposal"] },
  { id: "negotiation", en: "Negotiation", ar: "تفاوض", match: ["negotiation"] },
  { id: "won", en: "Won", ar: "تم الفوز", match: ["won"] },
];

export function SalesforceApp({ accountId }: WidgetProps) {
  const { s } = useStore();
  const nav = useNav();
  const t = useT();
  const jobs = accountOf(s, accountId)?.jobIds ?? [];
  const deals = s.deals.filter((d) => jobs.includes(d.jobId));
  const open = deals.filter((d) => !["won", "lost"].includes(d.stage)).reduce((a, d) => a + d.amount, 0);
  const crmTasks = s.tasks.filter((k) => k.source === "salesforce" && k.status !== "done" && jobs.includes(k.jobId)).length;
  return (
    <>
      <Body>
        <div className="pipe">
          {STAGES.map((st) => {
            const ds = deals.filter((d) => st.match.includes(d.stage));
            return (
              <div className="pipe-col" key={st.id}>
                <h4><span>{t(st.en, st.ar)}</span><span className="num">{ds.length}</span></h4>
                <div className="sum">{fmtBhd(ds.reduce((a, d) => a + d.amount, 0), s.lang)}</div>
                {ds.slice(0, 2).map((d) => (
                  <div className="deal" key={d.id}>
                    <b>{d.account}</b>
                    <div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                    <div className="row" style={{ justifyContent: "space-between", marginTop: 2 }}>
                      <span className="num" style={{ fontWeight: 700 }}>{fmtBhd(d.amount, s.lang)}</span>
                      <span className="tiny faint">{d.closeDate ? fmtDay(d.closeDate, s.lang, { day: "numeric", month: "short" }) : ""}</span>
                    </div>
                  </div>
                ))}
                {ds.length > 2 && <div className="tiny muted" style={{ padding: "6px 2px 0" }}>{t(`+${ds.length - 2} more`, `+${ds.length - 2} أخرى`)}</div>}
              </div>
            );
          })}
        </div>
      </Body>
      <Foot>
        <span className="small muted">{t("Open pipeline", "المسار المفتوح")} <b className="num" style={{ color: "var(--ink)" }}>{fmtBhd(open, s.lang)}</b></span>
        <span className="chip">{t(`${crmTasks} CRM tasks`, `${crmTasks} مهام`)}</span>
        <button className="btn sm ghost" style={{ marginInlineStart: "auto" }} onClick={() => nav.go({ kind: "tasks" })}>{t("Upload / download CSV", "رفع / تنزيل CSV")}<ArrowUpRight size={14} /></button>
      </Foot>
    </>
  );
}

function useUpcoming(platform: Platform, jobFilter: (x: { jobId?: string }) => boolean) {
  const { s } = useStore();
  const now = Date.now();
  return s.events.filter((e) => e.platform === platform && Date.parse(e.end) > now && jobFilter(e)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
}

function MeetingRows({ platform, page }: { platform: Platform; page: WidgetProps["page"] }) {
  const { s } = useStore();
  const nav = useNav();
  const t = useT();
  const evs = useUpcoming(platform, useJobFilter(page.jobId));
  return (
    <div className="list">
      <div className="day-label">{t("Upcoming calls", "المكالمات القادمة")}</div>
      {evs.map((e) => (
        <div className="li click" key={e.id} data-j={jobOf(s, e.jobId)?.color} role="button" tabIndex={0} onClick={() => nav.editEvent({ id: e.id })}
          onKeyDown={(k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); nav.editEvent({ id: e.id }); } }}>
          <span className="vbar" />
          <div className="li-main"><div className="li-title">{e.title}</div><div className="li-sub">{fmtDay(e.start, s.lang)} · {fmtTime(e.start, s.lang)}</div></div>
        </div>
      ))}
      {evs.length === 0 && <p className="small faint" style={{ padding: "4px 6px" }}>{t("No calls booked.", "لا مكالمات محجوزة.")}</p>}
    </div>
  );
}

function newCall(nav: ReturnType<typeof useNav>, platform: "teams" | "zoom", jobId?: string) {
  const st = nextWorkingSlot(new Date());
  nav.editEvent({ start: st.toISOString(), end: new Date(st.getTime() + 30 * 60_000).toISOString(), platform, jobId });
}

export function TeamsApp({ page, accountId }: WidgetProps) {
  const { s, update } = useStore();
  const nav = useNav();
  const t = useT();
  const keep = useJobFilter(page.jobId);
  const chats = s.chats.filter((c) => c.app === "teams" && c.accountId === accountId && keep(c)).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <Body>
        <div className="list">
          <div className="day-label">{t("Chats", "المحادثات")}</div>
          {chats.map((c) => (
            <div className="li" key={c.id}>
              <span className="avatar">{c.from.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
              <div className="li-main">
                <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><span className="li-title" style={{ fontWeight: c.unread ? 800 : 600 }}>{c.from}</span><span className="li-meta" style={{ marginInlineStart: "auto" }}>{timeAgo(c.at, s.lang)}</span></div>
                <div className="li-sub" style={{ whiteSpace: "normal" }} dir="auto">{c.text}</div>
              </div>
            </div>
          ))}
          {chats.length === 0 && <p className="small faint" style={{ padding: "4px 6px" }}>{t("No new chats.", "لا محادثات جديدة.")}</p>}
        </div>
        <MeetingRows platform="teams" page={page} />
      </Body>
      <Foot>
        <button className="btn sm primary" onClick={() => newCall(nav, "teams", page.jobId)}><CalendarPlus size={14} />{t("Teams meeting", "اجتماع Teams")}</button>
        {chats.some((c) => c.unread) && <button className="btn sm ghost" onClick={() => update((st) => ({ ...st, chats: st.chats.map((c) => chats.some((x) => x.id === c.id) ? { ...c, unread: false } : c) }))}>{t("Mark read", "عُلّمت كمقروءة")}</button>}
      </Foot>
    </>
  );
}

export function ZoomApp({ page }: WidgetProps) {
  const nav = useNav();
  const t = useT();
  return (
    <>
      <Body><MeetingRows platform="zoom" page={page} /></Body>
      <Foot><button className="btn sm primary" onClick={() => newCall(nav, "zoom", page.jobId)}><Video size={14} />{t("New Zoom call", "مكالمة Zoom جديدة")}</button></Foot>
    </>
  );
}

export function SlackApp({ page, accountId }: WidgetProps) {
  const { s } = useStore();
  const t = useT();
  const keep = useJobFilter(page.jobId);
  const chats = s.chats.filter((c) => c.app === "slack" && c.accountId === accountId && keep(c));
  return (
    <Body>
      {chats.length ? <div className="list">{chats.map((c) => (
        <div className="li" key={c.id}><span className="avatar">{c.from[0]}</span><div className="li-main"><div className="li-title">{c.from}</div><div className="li-sub" style={{ whiteSpace: "normal" }}>{c.text}</div></div></div>
      ))}</div> : <div className="empty"><MessageSquare size={22} />{t("No mentions. New ones appear here once the account is live.", "لا إشارات. ستظهر هنا عند تفعيل الحساب.")}</div>}
    </Body>
  );
}

export function OneDriveApp({ page, accountId }: WidgetProps) {
  const { s } = useStore();
  if (accountOf(s, accountId)?.connectorId === "gdrive") return <DriveApp page={page} accountId={accountId} />;
  return <OneDriveSample page={page} />;
}

function OneDriveSample({ page }: { page: WidgetProps["page"] }) {
  const { s } = useStore();
  const t = useT();
  const keep = useJobFilter(page.jobId);
  const icon = (a: string) => a === "excel" ? <FileSpreadsheet size={16} /> : a === "powerpoint" ? <Presentation size={16} /> : a === "word" ? <FileText size={16} /> : <File size={16} />;
  const tone = (a: string) => a === "excel" ? "green" : a === "powerpoint" ? "red" : a === "word" ? "blue" : "violet";
  const list = s.files.filter(keep).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return (
    <Body>
      <div className="list">
        {list.map((f) => (
          <div className="li" key={f.id}>
            <span className="app-mono sm" data-tone={tone(f.app)} style={{ width: 28, height: 28 }}>{icon(f.app)}</span>
            <div className="li-main"><div className="li-title">{f.name}</div><div className="li-sub">{t("Edited", "عُدّل")} {timeAgo(f.modifiedAt, s.lang)}</div></div>
          </div>
        ))}
        {list.length === 0 && <div className="empty">{t("No recent files.", "لا ملفات حديثة.")}</div>}
      </div>
    </Body>
  );
}

/** LinkedIn and Instagram: write posts with AI help, keep drafts and a schedule. */
export function SocialApp({ page, accountId, network }: WidgetProps & { network: "linkedin" | "instagram" }) {
  const { s, update, toast } = useStore();
  const t = useT();
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const acc = accountOf(s, accountId);
  const posts = s.posts.filter((p) => p.network === network && (p.accountId ? p.accountId === accountId : true));
  const job = jobOf(s, page.jobId ?? acc?.jobIds[0]);

  async function draft() {
    setErr("");
    const sample = await use<SampleFn>("sample");
    if (!sample) { setErr(t("AI writing works when Mosaic is opened on claude.ai.", "تعمل الكتابة الذكية عند فتح Mosaic على claude.ai.")); return; }
    setBusy(true); setText("");
    try {
      await sample(`Write one ${network === "linkedin" ? "LinkedIn post (under 110 words, professional, first person, short paragraphs, ends with a question)" : "Instagram caption (under 45 words, warm, 3 relevant hashtags)"}` +
        ` about: ${topic || "a lesson from this week's work"}.${job ? ` The author is ${job.role} at ${job.name}.` : ""} ${s.lang === "ar" ? "Write in Arabic." : ""} Reply with the post text only.`,
        { modelTier: "quick", cache: false, onText: ({ text }: { text: string }) => setText(text) });
    } catch (e) { if (isSampleError(e) && e.code !== "cancelled") setErr(aiErrorCopy(e.code, s.lang)); }
    finally { setBusy(false); }
  }
  const save = (schedule: boolean) => {
    if (!text.trim()) return;
    const when = new Date(); when.setDate(when.getDate() + 1); when.setHours(9, 0, 0, 0);
    update((st) => ({ ...st, posts: [{ id: uid("p"), network, text: text.trim(), status: schedule ? "scheduled" : "draft", scheduledFor: schedule ? when.toISOString() : undefined, jobId: job?.id ?? st.jobs[0].id, accountId }, ...st.posts] }));
    setText(""); setTopic(""); toast(schedule ? t("Scheduled for tomorrow 09:00", "جُدول غدًا 09:00") : t("Saved to drafts", "حُفظ في المسودات"));
  };
  return (
    <>
      <Body>
        <div className="stack">
          {(text || busy) ? (
            <>
              {busy && !text && <Thinking label={t("Writing…", "أكتب…")} />}
              <textarea id={"post-" + page.id + network} className="textarea" dir="auto" value={text} onChange={(e) => setText(e.target.value)} aria-label={t("Post text", "نص المنشور")} style={{ minHeight: 120 }} />
              <div className="row">
                <button className="btn sm primary" onClick={() => save(true)} disabled={!text.trim()}>{t("Schedule", "جدول")}</button>
                <button className="btn sm" onClick={() => save(false)} disabled={!text.trim()}>{t("Save draft", "احفظ المسودة")}</button>
                <button className="btn sm ghost" onClick={() => setText("")}>{t("Discard", "تجاهل")}</button>
              </div>
            </>
          ) : posts.map((p) => (
            <div className="post" key={p.id}>
              <p dir="auto">{p.text}</p>
              <span className={"chip" + (p.status === "scheduled" ? " ok" : "")} style={{ alignSelf: "flex-start" }}>
                {p.status === "scheduled" ? t("Scheduled", "مجدول") + " · " + fmtDay(p.scheduledFor!, s.lang) : t("Draft", "مسودة")}</span>
            </div>
          ))}
          {!text && !busy && posts.length === 0 && <div className="empty">{t("No posts yet. Type a topic below and Mosaic drafts it for you.", "لا منشورات بعد. اكتب موضوعًا بالأسفل وسيكتبه Mosaic لك.")}</div>}
          {err && <p className="err">{err}</p>}
        </div>
      </Body>
      <Foot>
        <input id={"topic-" + page.id + network} className="input grow" style={{ minHeight: 34, padding: "6px 10px" }} value={topic} onChange={(e) => setTopic(e.target.value)}
          placeholder={network === "linkedin" ? t("Post about…", "منشور عن…") : t("Caption for…", "تعليق عن…")} aria-label={t("Topic", "الموضوع")}
          onKeyDown={(e) => { if (e.key === "Enter") void draft(); }} />
        <button className="btn sm soft" onClick={draft} disabled={busy} aria-label={t("Write with AI", "اكتب بالذكاء الاصطناعي")}><Sparkles size={14} /></button>
      </Foot>
    </>
  );
}

export const LinkedInApp = (p: WidgetProps) => <SocialApp {...p} network="linkedin" />;
export const InstagramApp = (p: WidgetProps) => <SocialApp {...p} network="instagram" />;
