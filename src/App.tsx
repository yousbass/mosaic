import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckSquare, FileBarChart, Gavel, Home, Inbox, Menu, Plug, Plus, Search, Settings, Sparkles, Crosshair, Cloud, HardDrive, CircleSlash, LayoutGrid } from "lucide-react";
import { StoreProvider, useStore } from "./store";
import { NavCtx, type ConnectRequest, type EventDraft, type Nav, type View } from "./nav";
import { JobTile, Modal, Toasts, useT, jobOf } from "./ui";
import { PageView } from "./PageView";
import { CalendarView } from "./views/CalendarView";
import { InboxView } from "./views/InboxView";
import { TasksView } from "./views/TasksView";
import { TendersView } from "./views/TendersView";
import { ReportsView } from "./views/ReportsView";
import { ConnectionsView } from "./views/ConnectionsView";
import { ConnectWizard } from "./views/ConnectWizard";
import { SettingsView } from "./views/SettingsView";
import { Assistant } from "./Assistant";
import { CommandBar } from "./CommandBar";
import { ComposeModal, EventModal, type ComposeInit } from "./modals";
import { needsYou } from "./lib/logic";
import { sameDay, uid, ymd } from "./lib/time";
import type { Page } from "./types";

export default function App() {
  return <ErrorBoundary><StoreProvider><Shell /></StoreProvider></ErrorBoundary>;
}

/** If something breaks, show a way out instead of a blank page. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="empty" style={{ height: "100%", justifyContent: "center" }}>
        <b style={{ color: "var(--ink)", fontSize: 18 }}>Something went wrong on this screen.</b>
        <span>Your data is safe. Reload to continue, or reset to the sample data if the problem keeps happening.</span>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={() => location.reload()}>Reload</button>
          <button className="btn" onClick={() => { try { Object.keys(localStorage).filter((k) => k.startsWith("mosaic.")).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } location.reload(); }}>Reset sample data</button>
        </div>
      </div>
    );
  }
}

function useNarrow(q = "(max-width: 860px)") {
  const [n, setN] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setN(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return n;
}

const TOOL_VIEWS = ["calendar", "inbox", "tasks", "tenders", "reports", "connections", "settings"] as const;

function viewFromHash(pages: Page[]): View {
  const h = (typeof location !== "undefined" ? location.hash.slice(1) : "");
  if ((TOOL_VIEWS as readonly string[]).includes(h)) return { kind: h } as View;
  if (pages.some((p) => p.id === h)) return { kind: "page", id: h };
  return { kind: "page", id: "home" };
}

function Shell() {
  const { s, update, saveMode, ready, dismiss, toasts } = useStore();
  const t = useT();
  const narrow = useNarrow();
  const toastsRef = useRef(toasts); toastsRef.current = toasts;
  const dismissRef = useRef(dismiss); dismissRef.current = dismiss;
  const [view, setView] = useState<View>(() => viewFromHash(s.pages));
  // Pages saved to the account arrive after the first render; open the linked one when they do.
  useEffect(() => { if (ready) setView(viewFromHash(s.pages)); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [assistant, setAssistant] = useState<{ prompt: string; send: boolean; n: number } | null>(null);
  const [cmd, setCmd] = useState(false);
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [compose, setCompose] = useState<ComposeInit | null>(null);
  const [connect, setConnect] = useState<ConnectRequest | null>(null);
  const [newPage, setNewPage] = useState(false);

  useEffect(() => {
    document.documentElement.lang = s.lang;
    document.documentElement.dir = s.lang === "ar" ? "rtl" : "ltr";
  }, [s.lang]);

  // Follow the address bar (#calendar, #pg_j1…) so links and the back button work.
  useEffect(() => {
    const onHash = () => { setView(viewFromHash(s.pages)); setEditing(false); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [s.pages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd(true); }
      if (e.key === "Escape") setSideOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = useCallback((v: View) => {
    setView(v); setEditing(false); setSideOpen(false);
    toastsRef.current.forEach((x) => dismissRef.current(x.id));
    const token = v.kind === "page" ? v.id : v.kind;
    try { if (location.hash.slice(1) !== token) location.hash = token; } catch { /* sandboxed */ }
    document.getElementById("content")?.scrollTo({ top: 0 });
  }, []);

  const nav = useMemo<Nav>(() => ({
    view, go,
    ask: (prompt = "", send = false) => setAssistant((a) => ({ prompt, send, n: (a?.n ?? 0) + 1 })),
    editEvent: (d) => setEventDraft(d),
    composeEmail: (d) => setCompose(d ?? {}),
    connect: (r) => setConnect(r),
  }), [view, go]);

  const page = view.kind === "page" ? s.pages.find((p) => p.id === view.id) ?? s.pages[0] : undefined;
  const pageJob = page?.jobId ? jobOf(s, page.jobId) : undefined;
  const now = new Date();
  const waiting = needsYou(s);
  const today = ymd(now);
  const overdue = s.tasks.filter((k) => k.status !== "done" && k.due && k.due < today).length;
  const meetingsToday = s.events.filter((e) => sameDay(new Date(e.start), now)).length;
  const focus = jobOf(s, s.focusJobId);

  const titles: Record<string, string> = {
    calendar: t("Calendar", "التقويم"), inbox: t("Inbox", "البريد"), tasks: t("Tasks", "المهام"), tenders: t("Tenders", "المناقصات"),
    reports: t("Reports", "التقارير"), connections: t("Accounts", "الحسابات"), settings: t("Settings", "الإعدادات"),
  };
  const crumb = view.kind === "page" ? (pageJob ? t("Jobs", "الوظائف") : page?.id === "home" ? "" : t("Pages", "الصفحات")) : t("Everything", "كل شيء");
  const title = view.kind === "page" ? (page?.id === "home" ? t("Home", "الرئيسية") : page?.name ?? "") : titles[view.kind];

  const navBtn = (v: View, icon: React.ReactNode, label: string, count?: number, hot?: boolean, key?: string) => {
    const cur = v.kind === "page" ? view.kind === "page" && page?.id === v.id : view.kind === v.kind;
    return (
      <button key={key} className="nav-item" aria-current={cur ? "page" : undefined} onClick={() => go(v)}>
        {icon}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>{!!count && <span className={"count" + (hot ? " hot" : "")}>{count}</span>}
      </button>
    );
  };

  const jobPages = s.pages.filter((p) => p.jobId);
  const customPages = s.pages.filter((p) => !p.jobId && p.id !== "home");

  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <div className={"side-scrim" + (sideOpen ? " on" : "")} onClick={() => setSideOpen(false)} />
        <nav className={"side" + (sideOpen ? " open" : "")} aria-label={t("Main", "الرئيسية")} {...(narrow && !sideOpen ? { inert: "" } as object : {})}>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">{[...s.jobs, ...s.jobs].slice(0, 4).map((j, i) => <i key={i} data-j={j.color} />)}</span>
            <span className="brand-name">Mosaic</span>
          </div>
          <button className="side-search" onClick={() => setCmd(true)}><Search size={15} />{t("Search or ask", "ابحث أو اسأل")}<kbd>Ctrl K</kbd></button>
          <div className="side-scroll">
            <div className="nav">{navBtn({ kind: "page", id: "home" }, <Home size={18} />, t("Home", "الرئيسية"))}</div>
            <div>
              <div className="nav-label">{t("Your jobs", "وظائفك")}<button onClick={() => go({ kind: "settings" })} aria-label={t("Add or edit jobs", "أضف الوظائف أو عدّلها")}><Plus size={14} /></button></div>
              <div className="nav">
                {jobPages.map((p) => {
                  const j = jobOf(s, p.jobId);
                  return navBtn({ kind: "page", id: p.id }, <JobTile job={j} />, p.name, waiting.filter((e) => e.jobId === p.jobId).length, false, p.id);
                })}
              </div>
            </div>
            <div>
              <div className="nav-label">{t("Your pages", "صفحاتك")}<button onClick={() => setNewPage(true)} aria-label={t("New page", "صفحة جديدة")}><Plus size={14} /></button></div>
              <div className="nav">
                {customPages.map((p) => navBtn({ kind: "page", id: p.id }, <LayoutGrid size={18} />, p.name, undefined, false, p.id))}
                {customPages.length === 0 && <button className="nav-item" onClick={() => setNewPage(true)}><Plus size={18} /><span>{t("New page", "صفحة جديدة")}</span></button>}
              </div>
            </div>
            <div>
              <div className="nav-label">{t("Everything", "كل شيء")}</div>
              <div className="nav">
                {navBtn({ kind: "inbox" }, <Inbox size={18} />, t("Inbox", "البريد"), waiting.length, true)}
                {navBtn({ kind: "calendar" }, <CalendarDays size={18} />, t("Calendar", "التقويم"), meetingsToday)}
                {navBtn({ kind: "tasks" }, <CheckSquare size={18} />, t("Tasks", "المهام"), overdue, true)}
                {navBtn({ kind: "tenders" }, <Gavel size={18} />, t("Tenders", "المناقصات"))}
                {navBtn({ kind: "reports" }, <FileBarChart size={18} />, t("Reports", "التقارير"))}
                {navBtn({ kind: "connections" }, <Plug size={18} />, t("Accounts", "الحسابات"), s.connections.length)}
                {navBtn({ kind: "settings" }, <Settings size={18} />, t("Settings", "الإعدادات"))}
              </div>
            </div>
          </div>
          <div className="side-foot">
            <div className="seg" role="group" aria-label={t("Language", "اللغة")}>
              <button aria-pressed={s.lang === "en"} onClick={() => update((st) => ({ ...st, lang: "en" }))}>EN</button>
              <button aria-pressed={s.lang === "ar"} onClick={() => update((st) => ({ ...st, lang: "ar" }))}>عربي</button>
            </div>
            <span className="row tiny" style={{ gap: 5 }} title={saveMode === "account" ? t("Saved privately to your claude.ai account", "محفوظ بشكل خاص في حسابك على claude.ai") : undefined}>
              {saveMode === "account" ? <Cloud size={13} /> : saveMode === "browser" ? <HardDrive size={13} /> : <CircleSlash size={13} />}
              {saveMode === "account" ? t("Saved", "محفوظ") : saveMode === "browser" ? t("This browser", "هذا المتصفح") : t("Not saved", "غير محفوظ")}
            </span>
          </div>
        </nav>

        <main className="main">
          <header className="top">
            <button className="icon-btn menu-btn" onClick={() => setSideOpen(true)} aria-label={t("Open menu", "افتح القائمة")}><Menu size={20} /></button>
            <div className="top-title">
              {crumb && <span className="crumb hide-sm">{crumb} /</span>}
              {pageJob && <JobTile job={pageJob} />}
              <h1>{title}</h1>
            </div>
            <div className="top-actions">
              <button className="btn primary" onClick={() => nav.ask()}><Sparkles size={16} /><span className="hide-sm">{t("Ask Mosaic", "اسأل Mosaic")}</span></button>
            </div>
          </header>
          <div className="content" id="content">
            {focus && (
              <div className="content-inner" style={{ marginBottom: 16 }}>
                <div className="banner" data-j={focus.color} style={{ background: "var(--js)" }}>
                  <Crosshair size={17} style={{ color: "var(--jc)" }} />
                  <span className="grow">{t(`Focusing on ${focus.name}. Other jobs are hidden on Home and in the inbox, calendar and tasks.`, `التركيز على ${focus.name}. الوظائف الأخرى مخفية في الرئيسية والبريد والتقويم والمهام.`)}</span>
                  <button className="btn sm" onClick={() => update((st) => ({ ...st, focusJobId: undefined }))}>{t("Show all jobs", "اعرض كل الوظائف")}</button>
                </div>
              </div>
            )}
            {page && <PageView key={page.id} page={page} editing={editing} setEditing={setEditing} />}
            {view.kind !== "page" && view.kind !== "connections" && (
              <div className="content-inner">
                {view.kind === "calendar" && <CalendarView key={s.focusJobId ?? "all"} />}
                {view.kind === "inbox" && <InboxView emailId={view.emailId} />}
                {view.kind === "tasks" && <TasksView />}
                {view.kind === "tenders" && <TendersView />}
                {view.kind === "reports" && <ReportsView />}
                {view.kind === "settings" && <SettingsView />}
              </div>
            )}
            {view.kind === "connections" && <ConnectionsView />}
          </div>
        </main>
      </div>
      {assistant && <Assistant seed={assistant} onClose={() => setAssistant(null)} />}
      {cmd && <CommandBar onClose={() => setCmd(false)} />}
      {eventDraft && <EventModal draft={eventDraft} onClose={() => setEventDraft(null)} />}
      {compose && <ComposeModal init={compose} onClose={() => setCompose(null)} />}
      {connect && <ConnectWizard req={connect} onClose={() => setConnect(null)} />}
      {newPage && <NewPage onClose={() => setNewPage(false)} onMade={(id) => { go({ kind: "page", id }); setEditing(true); }} />}
      <Toasts />
    </NavCtx.Provider>
  );
}

function NewPage({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const { update } = useStore();
  const t = useT();
  const [name, setName] = useState("");
  const make = () => {
    if (!name.trim()) return;
    const id = uid("pg");
    update((st) => ({ ...st, pages: [...st.pages, { id, name: name.trim(), jobId: undefined, widgets: [] }] }));
    onClose(); onMade(id);
  };
  return (
    <Modal title={t("New page", "صفحة جديدة")} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>{t("Cancel", "إلغاء")}</button><button className="btn primary" disabled={!name.trim()} onClick={make}>{t("Create page", "أنشئ الصفحة")}</button></>}>
      <label className="field"><span>{t("Page name", "اسم الصفحة")}</span><input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") make(); }}
        placeholder={t("e.g. Social media, Side projects", "مثال: التواصل الاجتماعي، مشاريع جانبية")} /></label>
      <p className="small muted">{t("Next you'll drag in the apps and tools you want on it.", "بعدها ستسحب التطبيقات والأدوات التي تريدها.")}</p>
    </Modal>
  );
}
