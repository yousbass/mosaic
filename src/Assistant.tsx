import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, CalendarCheck, CalendarDays, Check, Copy, FileBarChart, FileText, ListPlus, Mail, MoveRight, RotateCcw, Sparkles, Square, Undo2, X, Zap, Brain, Wand2 } from "lucide-react";
import { useStore } from "./store";
import { useNav } from "./nav";
import { JobChip, Thinking, accountOf, jobOf, useT } from "./ui";
import { Markdown } from "./lib/markdown";
import { RULES, context, makeTools, type ActionLog } from "./ai/assistant";
import { liveTools, type Source } from "./ai/liveTools";
import { use, aiErrorCopy, copyText, isSampleError, type SampleFn } from "./lib/platform";
import { fmtDay, fmtTime } from "./lib/time";
import { platformName } from "./widgets/tools";
import type { AppState } from "./types";

type Tier = "quick" | "default" | "complex";
interface Msg { role: "user" | "assistant"; content: string; actions?: (ActionLog & { undone?: boolean })[]; sources?: Source[]; error?: boolean; tier?: Tier; ms?: number }

/** What the assistant is doing while a tool runs, shown under "Working on it". */
const STEP: Record<string, [string, string]> = {
  find_free_slots: ["Checking your calendars…", "أتحقق من تقاويمك…"],
  create_meeting: ["Booking the meeting…", "أحجز الاجتماع…"],
  draft_email: ["Writing the draft…", "أكتب المسودة…"],
  add_task: ["Adding the task…", "أضيف المهمة…"],
  move_meeting: ["Moving the meeting…", "أنقل الاجتماع…"],
  search_drive: ["Searching your Google Drive…", "أبحث في Google Drive…"],
  recent_drive_files: ["Looking at your recent Drive files…", "أطّلع على أحدث ملفات Drive…"],
  read_drive_file: ["Reading a Drive file…", "أقرأ ملفًا من Drive…"],
};

// Small questions go to the fast model; anything that books, writes or plans goes to the thorough one.
const ACTION_WORDS = /\b(book|schedul|arrang|set up|mov|reschedul|draft|writ|repl|send|sent|invit|plan|creat|add|summari[sz]|report|compar)\w*/i;
const ACTION_WORDS_AR = /(^|[\s،؟.!])(رتب|رتّب|احجز|اكتب|ردّ?|جهز|جهّز|انقل|أضف|اضف|خطط|لخص|لخّص|أرسل|ارسل)/;
export function pickTier(text: string, mode: AppState["aiMode"]): Tier {
  if (mode === "fast") return "quick";
  if (mode === "thorough") return "complex";
  return text.length > 140 || ACTION_WORDS.test(text) || ACTION_WORDS_AR.test(text) ? "default" : "quick";
}

export function Assistant({ onClose, seed }: { onClose: () => void; seed?: { prompt: string; send: boolean; n: number } }) {
  const { s, update, get, toast } = useStore();
  const nav = useNav();
  const t = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState("");
  const [step, setStep] = useState("");
  const [avail, setAvail] = useState<"checking" | "yes" | "no">("checking");
  const ctl = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false); // guards double sends before React state updates

  // Esc closes the panel; focus returns to where it was.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".scrim")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  useEffect(() => { use<SampleFn>("sample").then((x) => setAvail(x ? "yes" : "no")); }, []);
  useEffect(() => () => ctl.current?.abort(), []); // closing the panel stops a running request
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, partial]);
  useEffect(() => {
    if (!seed) return;
    setInput(seed.prompt);
    if (seed.send && seed.prompt) void send(seed.prompt);
    else inputRef.current?.focus();
  }, [seed?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(textArg?: string, history0?: Msg[]) {
    const text = (textArg ?? input).trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setInput("");
    const history: Msg[] = [...(history0 ?? msgs), { role: "user", content: text }];
    setMsgs(history);
    if (!get().onboarding.askedAI) update((st) => ({ ...st, onboarding: { ...st.onboarding, askedAI: true } }));
    const sample = await use<SampleFn>("sample");
    if (!sample) {
      busyRef.current = false;
      setMsgs([...history, { role: "assistant", error: true, content: t("The assistant works when Mosaic is opened on claude.ai, where it uses your Claude account. Everything else in Mosaic works here.", "يعمل المساعد عند فتح Mosaic على claude.ai باستخدام حساب Claude الخاص بك. باقي ميزات Mosaic تعمل هنا.") }]);
      return;
    }
    const tier = pickTier(text, get().aiMode);
    setBusy(true); setPartial("");
    const started = performance.now();
    const actions: ActionLog[] = [];
    const sources: Source[] = [];
    const limits = await sample.limits().catch(() => null);
    const all = limits?.tools ? [
      ...makeTools(get, (fn) => update(fn), (a) => actions.push(a)),
      ...liveTools(get, (x) => { if (!sources.some((y) => y.title === x.title && y.url === x.url)) sources.push(x); }),
    ].slice(0, limits.tools.maxCount || 16) : [];
    // Show what each tool is doing while it runs.
    const tools = all.length ? all.map((tool) => ({ ...tool, execute: (input: Record<string, unknown>, c: { signal: AbortSignal }) => {
      setStep(tool.name);
      return (tool.execute as (i: unknown, c: unknown) => unknown)(input, c);
    } })) : undefined;
    setStep("");
    ctl.current = new AbortController();
    const turns = [
      { role: "user" as const, content: RULES(get().lang) + (tools ? "" : "\n(Actions are unavailable in this view: answer and suggest steps instead.)") + "\n\nThe user's current data:\n" + context(get(), new Date()) },
      ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    ];
    try {
      const r = await sample(turns, { tools, signal: ctl.current.signal, modelTier: tier, ...(tools ? {} : { cache: false }), onText: ({ text }: { text: string }) => { setPartial(text); setStep(""); } });
      setMsgs([...history, { role: "assistant", content: r.text, actions: [...actions], sources: [...sources], tier: r.modelTierApplied ?? tier, ms: performance.now() - started }]);
    } catch (e) {
      const code = isSampleError(e) ? e.code : "upstream_error";
      const kept = isSampleError(e) ? e.text : undefined;
      setMsgs([...history, { role: "assistant", content: code === "cancelled" ? (kept || t("Stopped.", "توقف.")) : (kept ? kept + "\n\n" : "") + aiErrorCopy(code, get().lang), error: code !== "cancelled", actions: [...actions], sources: [...sources] }]);
    } finally { setBusy(false); setPartial(""); setStep(""); ctl.current = null; busyRef.current = false; }
  }

  // Try again: first undo what the previous answer did, so nothing is booked or drafted twice.
  const regenerate = () => {
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const idx = msgs.lastIndexOf(lastUser);
    msgs.slice(idx + 1).forEach((m) => m.actions?.forEach((a) => { if (!a.undone) revert(a); }));
    void send(lastUser.content, msgs.slice(0, idx));
  };

  const revert = (a: ActionLog) => update((st) => {
    if (a.kind === "event") return { ...st, events: st.events.filter((e) => e.id !== a.id) };
    if (a.kind === "move" && a.prev) return { ...st, events: st.events.map((e) => e.id === a.id ? a.prev! : e) };
    if (a.kind === "draft") return { ...st, drafts: st.drafts.filter((d) => d.id !== a.id || d.status === "sent") };
    if (a.kind === "task") return { ...st, tasks: st.tasks.filter((k) => k.id !== a.id) };
    return st;
  });

  const undoAction = (mi: number, ai: number) => {
    revert(msgs[mi].actions![ai]);
    setMsgs((cur) => cur.map((m, i) => i !== mi ? m : { ...m, actions: m.actions!.map((x, j) => j === ai ? { ...x, undone: true } : x) }));
  };

  const starters = [
    { icon: <CalendarDays size={16} />, en: "Plan my day", ar: "خطط يومي", pEn: "What needs me today? Put it in order across my jobs.", pAr: "ما الذي يحتاجني اليوم؟ رتبه حسب الأولوية بين وظائفي." },
    { icon: <CalendarCheck size={16} />, en: "Book a meeting", ar: "احجز اجتماعًا", pEn: "Book a 45-minute Teams call with Fatima next week that doesn't clash with any job, and draft the invite.", pAr: "رتب اجتماع مع العميل الأسبوع القادم وجهز دعوة" },
    { icon: <Mail size={16} />, en: "Answer my mail", ar: "رد على بريدي", pEn: "Which emails need a reply? Draft replies for the two most urgent.", pAr: "أي الرسائل تحتاج ردًا؟ اكتب ردين على أهم رسالتين." },
    { icon: <FileBarChart size={16} />, en: "Review my week", ar: "راجع أسبوعي", pEn: "How is my week going against each job's hours? Anything at risk?", pAr: "كيف يسير أسبوعي مقارنة بساعات كل وظيفة؟ هل من مخاطر؟" },
  ];

  const modeBtn = (m: AppState["aiMode"], icon: React.ReactNode, en: string, ar: string, tip: string) => (
    <button type="button" aria-pressed={s.aiMode === m} title={tip} onClick={() => update((st) => ({ ...st, aiMode: m }))}>{icon}{t(en, ar)}</button>
  );

  return (
    <aside className="drawer" aria-label={t("Mosaic assistant", "مساعد Mosaic")}>
      <div className="drawer-head">
        <span className="ai-mark"><Sparkles size={17} /></span>
        <div className="li-main"><h2>{t("Mosaic assistant", "مساعد Mosaic")}</h2><div className="tiny muted">{t("AI · sees all your jobs · never sends without you", "ذكاء اصطناعي · يرى كل وظائفك · لا يرسل دون موافقتك")}</div></div>
        {msgs.length > 0 && !busy && <button className="btn sm ghost" onClick={() => setMsgs([])}>{t("New chat", "محادثة جديدة")}</button>}
        <button className="icon-btn" onClick={onClose} aria-label={t("Close", "إغلاق")}><X size={18} /></button>
      </div>
      <div className="chat" ref={listRef} aria-live="polite">
        {msgs.length === 0 && (
          <div className="welcome">
            <h3>{t("How can I help?", "كيف أساعدك؟")}</h3>
            <p className="muted small">{t("I can see every job's calendar, mail and tasks. I'll book meetings that don't clash, write emails in your voice, and keep you on top of each job.",
              "أرى تقويم كل وظيفة وبريدها ومهامها. أحجز اجتماعات بلا تعارض، وأكتب الرسائل بأسلوبك، وأبقيك متابعًا لكل وظيفة.")}</p>
            {avail === "no" && <div className="callout"><Sparkles size={16} style={{ color: "var(--warn)", flex: "none" }} /><span className="small">{t("The assistant needs Mosaic to be open on claude.ai.", "يحتاج المساعد أن يكون Mosaic مفتوحًا على claude.ai.")}</span></div>}
            <div className="starter-grid">
              {starters.map((x) => (
                <button key={x.en} className="starter" onClick={() => send(s.lang === "ar" ? x.pAr : x.pEn)}>
                  <span className="ic teal" style={{ width: 28, height: 28 }}>{x.icon}</span>
                  <b>{t(x.en, x.ar)}</b><span dir="auto">{s.lang === "ar" ? x.pAr : x.pEn}</span>
                </button>
              ))}
            </div>
            {s.lang !== "ar" && <button className="starter" style={{ flexDirection: "row", alignItems: "center" }} onClick={() => send("رتب اجتماع مع العميل الأسبوع القادم وجهز دعوة")}>
              <span className="ic teal" style={{ width: 28, height: 28 }}><Wand2 size={15} /></span><span dir="rtl" style={{ color: "var(--ink)" }}>رتب اجتماع مع العميل الأسبوع القادم وجهز دعوة</span></button>}
          </div>
        )}
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="msg-user" dir="auto">{m.content}</div>
        ) : (
          <div key={i} className="msg-bot">
            <span className="ai-mark sm"><Sparkles size={14} /></span>
            <div className="body">
              {m.actions?.map((a, j) => <React.Fragment key={j}>{actionCard(a, () => undoAction(i, j))}</React.Fragment>)}
              <Markdown text={m.content} className={m.error ? "err" : ""} />
              {!!m.sources?.length && (
                <div className="sources" aria-label={t("Files read", "الملفات المقروءة")}>
                  <span className="tiny muted">{t("Read from your Drive", "قُرئ من Drive")}</span>
                  {m.sources.map((x, j) => x.url
                    ? <a key={j} className="source-chip" href={x.url} target="_blank" rel="noopener noreferrer" dir="auto"><FileText size={12} />{x.title}</a>
                    : <span key={j} className="source-chip" dir="auto"><FileText size={12} />{x.title}</span>)}
                </div>
              )}
              <div className="msg-meta">
                {m.tier && <span className="row" style={{ gap: 4 }} title={t("Which model answered", "النموذج الذي أجاب")}>{m.tier === "quick" ? <Zap size={12} /> : <Brain size={12} />}{m.tier === "quick" ? t("Fast", "سريع") : m.tier === "complex" ? t("Thorough", "متعمق") : t("Standard", "قياسي")}{m.ms && m.ms > 300 ? ` · ${(m.ms / 1000).toFixed(1)}s` : ""}</span>}
                <span className="grow" />
                <div className="msg-tools">
                  <button className="icon-btn sm" aria-label={t("Copy answer", "انسخ الإجابة")} onClick={async () => { if (await copyText(m.content)) toast(t("Copied", "نُسخ")); }}><Copy size={13} /></button>
                  {i === msgs.length - 1 && !busy && <button className="icon-btn sm" aria-label={t("Try again", "حاول مجددًا")} onClick={regenerate}><RotateCcw size={13} /></button>}
                </div>
              </div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="msg-bot">
            <span className="ai-mark sm"><Sparkles size={14} /></span>
            <div className="body">{partial ? <Markdown text={partial} /> : null}
              {(!partial || step) && <Thinking label={step && STEP[step] ? t(STEP[step][0], STEP[step][1]) : t("Working on it…", "أعمل على ذلك…")} />}</div>
          </div>
        )}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <div className="composer-box">
          <textarea ref={inputRef} id="assistant-input" dir="auto" rows={2} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
            placeholder={t("Ask in English or Arabic…", "اكتب بالعربية أو الإنجليزية…")} aria-label={t("Message", "الرسالة")} />
          <div className="composer-row">
            <div className="mode-seg" role="group" aria-label={t("Speed", "السرعة")}>
              {modeBtn("auto", <Wand2 size={12} />, "Auto", "تلقائي", t("Fast model for quick questions, thorough model for actions", "نموذج سريع للأسئلة القصيرة ومتعمق للمهام"))}
              {modeBtn("fast", <Zap size={12} />, "Fast", "سريع", t("Quickest answers for small tasks", "أسرع إجابة للمهام الصغيرة"))}
              {modeBtn("thorough", <Brain size={12} />, "Thorough", "متعمق", t("Most careful reasoning, slower", "أدق تفكير، أبطأ"))}
            </div>
            {busy
              ? <button type="button" className="send-btn" style={{ background: "var(--ink)" }} onClick={() => ctl.current?.abort()} aria-label={t("Stop", "إيقاف")}><Square size={14} /></button>
              : <button type="submit" className="send-btn" disabled={!input.trim()} aria-label={t("Send", "إرسال")}><ArrowUp size={18} /></button>}
          </div>
        </div>
        <span className="tiny faint">{t("Uses your Claude account. Everything it creates can be undone.", "يستخدم حساب Claude. يمكن التراجع عن كل ما يُنشئه.")}</span>
      </form>
    </aside>
  );

  function actionCard(a: ActionLog & { undone?: boolean }, onUndo: () => void) {
    const st = get();
    const ev = a.kind === "event" || a.kind === "move" ? st.events.find((e) => e.id === a.id) : undefined;
    const dr = a.kind === "draft" ? st.drafts.find((d) => d.id === a.id) : undefined;
    const tk = a.kind === "task" ? st.tasks.find((k) => k.id === a.id) : undefined;
    const sent = dr?.status === "sent";
    const kind = a.kind === "event" ? t("Meeting booked", "حُجز اجتماع") : a.kind === "move" ? t("Meeting moved", "نُقل اجتماع") : a.kind === "draft" ? (sent ? t("Sent", "أُرسلت") : t("Needs your review", "تحتاج مراجعتك")) : t("Task added", "أُضيفت مهمة");
    const icon = a.kind === "event" ? <CalendarCheck size={12} /> : a.kind === "move" ? <MoveRight size={12} /> : a.kind === "draft" ? <Mail size={12} /> : <ListPlus size={12} />;
    return (
      <div className={"act-card" + (a.undone ? " undone" : "")}>
        <div className="act-main">
          {ev ? (
            <span className="date-block" data-j={jobOf(st, ev.jobId)?.color}><span>{fmtDay(ev.start, st.lang, { weekday: "short" })}</span><b>{new Date(ev.start).getDate()}</b></span>
          ) : <span className={"ic " + (dr ? "blue" : "amber")}>{dr ? <Mail size={16} /> : <Check size={16} />}</span>}
          <div className="li-main">
            <span className="act-kind" style={a.kind === "draft" && !sent ? { color: "var(--warn)" } : undefined}>{icon}{a.undone ? t("Undone", "تم التراجع") : kind}</span>
            <div className="li-title" dir="auto">{ev?.title ?? dr?.subject ?? tk?.title ?? a.label}</div>
            <div className="li-sub" dir="auto">
              {ev && <>{fmtTime(ev.start, st.lang)}–{fmtTime(ev.end, st.lang)}{ev.platform !== "none" ? " · " + platformName(ev.platform, st.lang) : ""}{a.kind === "move" && a.prev ? ` · ${t("was", "كان")} ${fmtDay(a.prev.start, st.lang)} ${fmtTime(a.prev.start, st.lang)}` : ""}</>}
              {dr && <>{t("To", "إلى")} {dr.to} · {t("from", "من")} {accountOf(st, dr.accountId)?.label ?? ""}</>}
              {tk && <>{tk.due ? fmtDay(tk.due, st.lang) : t("No due date", "بلا موعد")}</>}
            </div>
          </div>
          {(ev || dr || tk) && <JobChip jobId={ev?.jobId ?? dr?.jobId ?? tk?.jobId} />}
        </div>
        {!a.undone && !sent && (
          <div className="act-foot">
            {dr && <button className="btn sm primary" onClick={() => nav.composeEmail({ draftId: a.id })}>{t("Review and send", "راجع وأرسل")}</button>}
            {ev && <button className="btn sm" onClick={() => nav.editEvent({ id: a.id })}>{t("Open", "افتح")}</button>}
            <button className="btn sm ghost" onClick={onUndo}><Undo2 size={13} />{t("Undo", "تراجع")}</button>
          </div>
        )}
      </div>
    );
  }
}
