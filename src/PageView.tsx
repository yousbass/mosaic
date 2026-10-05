import React, { useState } from "react";
import { ArrowDown, ArrowUp, StretchVertical, Check, Crosshair, LayoutGrid, Plus, Search, Settings2, Sparkles, Trash2, X, CalendarPlus, PenLine } from "lucide-react";
import { useStore } from "./store";
import { useNav } from "./nav";
import { WIDGETS, connector, widgetInfo } from "./data/connectors";
import { WIDGET_COMPONENTS, TOOL_ICONS, ConnectState } from "./widgets";
import { BriefContent } from "./widgets/tools";
import { AppMono, JobTile, Ring, accountOf, accountsFor, initials, jobOf, useT } from "./ui";
import { hoursByJob, needsYou } from "./lib/logic";
import { isLive } from "./lib/live";
import { addDays, fmtDay, startOfWeek, uid } from "./lib/time";
import type { AppState, Page, Widget, WidgetSize, WidgetType } from "./types";

const DRAG_LIB = "application/x-mosaic-widget";

/** The account an app widget should start with on this page. */
function defaultAccount(s: AppState, type: WidgetType, jobId?: string): string | undefined {
  const info = widgetInfo(type);
  if (info.kind !== "app" || !info.connectors) return undefined;
  const list = accountsFor(s, info.connectors, jobId);
  return jobId ? list.find((a) => a.jobIds.includes(jobId))?.id : list[0]?.id;
}

export function PageView({ page, editing, setEditing }: { page: Page; editing: boolean; setEditing: (v: boolean) => void }) {
  const { s, update } = useStore();
  const nav = useNav();
  const t = useT();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const setWidgets = (fn: (w: Widget[]) => Widget[], label?: string) =>
    update((st) => ({ ...st, onboarding: { ...st.onboarding, customized: true }, pages: st.pages.map((p) => p.id === page.id ? { ...p, widgets: fn(p.widgets) } : p) }), label);

  const move = (id: string, to: number) => setWidgets((ws) => {
    const from = ws.findIndex((w) => w.id === id);
    if (from < 0) return ws;
    const next = [...ws];
    const [w] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to > from ? to - 1 : to)), 0, w);
    return next;
  });

  const addWidget = (type: WidgetType, at?: number) => {
    const info = widgetInfo(type);
    const w: Widget = { id: uid("w"), type, size: info.size, tall: info.tall, accountId: defaultAccount(s, type, page.jobId) };
    setWidgets((ws) => { const n = [...ws]; n.splice(at ?? n.length, 0, w); return n; }, t(`${info.en} added`, `أُضيف ${info.ar}`));
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const libType = e.dataTransfer.getData(DRAG_LIB) as WidgetType;
    if (libType) addWidget(libType, index);
    else if (dragId) {
      const from = page.widgets.findIndex((w) => w.id === dragId);
      move(dragId, from >= 0 && from < index ? index + 1 : index); // dropping on a card takes its place
    }
    setDragId(null); setOverId(null);
  };
  const dragOver = (e: React.DragEvent, id: string) => {
    if (editing || e.dataTransfer.types.includes(DRAG_LIB)) { e.preventDefault(); setOverId(id); }
  };

  const grid = (
    <div className="bento" onDragLeave={(e) => { if (e.currentTarget === e.target) setOverId(null); }}>
      {page.widgets.map((w, i) => (
        <WidgetCard key={w.id} w={w} page={page} index={i} count={page.widgets.length} editing={editing}
          over={overId === w.id} dragging={dragId === w.id}
          onDragStart={(e) => { setDragId(w.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", w.id); }}
          onDragEnd={() => { setDragId(null); setOverId(null); }}
          onDragOver={(e) => dragOver(e, w.id)}
          onDrop={(e) => onDrop(e, i)}
          setWidgets={setWidgets} move={move} />
      ))}
      {editing && (
        <div className={"drop-slot" + (overId === "__end" ? " drag-over" : "")} onDragOver={(e) => dragOver(e, "__end")} onDrop={(e) => onDrop(e, page.widgets.length)}>
          <span className="row"><Plus size={18} />{t("Drop here to add at the end", "أفلت هنا للإضافة في النهاية")}</span>
        </div>
      )}
      {!editing && page.widgets.length === 0 && (
        <div className="card l" style={{ gridColumn: "1 / -1" }}>
          <div className="empty" style={{ margin: "auto" }}>
            <LayoutGrid size={28} />
            <b style={{ color: "var(--ink)" }}>{t("Build this page your way", "ابنِ هذه الصفحة كما تريد")}</b>
            <span>{t("Drag in the apps and tools you need: an email account, LinkedIn, your tasks, a calendar.", "اسحب التطبيقات والأدوات التي تحتاجها: حساب بريد، لينكدإن، مهامك، تقويم.")}</span>
            <button className="btn primary" onClick={() => setEditing(true)}><Settings2 size={15} />{t("Add apps and tools", "أضف التطبيقات والأدوات")}</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="content-inner">
      {page.jobId ? <JobHero page={page} onCustomize={() => setEditing(true)} editing={editing} />
        : page.id === "home" ? <HomeHero /> : <CustomHero page={page} onCustomize={() => setEditing(true)} editing={editing} />}
      {editing && (
        <div className="customize-bar">
          <Settings2 size={18} />
          <div className="grow"><b>{t(`Customizing ${page.id === "home" ? "Home" : page.name}`, `تخصيص ${page.id === "home" ? "الرئيسية" : page.name}`)}</b>
            <div className="tiny" style={{ opacity: .75 }}>{t("Drag apps and tools from the panel. Drag cards to reorder, pick a size, or remove them.", "اسحب التطبيقات والأدوات من اللوحة. اسحب البطاقات لترتيبها، واختر الحجم أو احذفها.")}</div></div>
          {page.id !== "home" && !page.jobId && <button className="btn sm danger-fill" onClick={() => {
            update((st) => ({ ...st, pages: st.pages.filter((p) => p.id !== page.id) }), t("Page deleted", "حُذفت الصفحة"));
            nav.go({ kind: "page", id: "home" });
          }}><Trash2 size={14} />{t("Delete page", "احذف الصفحة")}</button>}
          <button className="btn sm primary" onClick={() => setEditing(false)}><Check size={15} />{t("Done", "تم")}</button>
        </div>
      )}
      {editing ? <div className="edit-wrap">{grid}<Library page={page} onAdd={(type) => addWidget(type)} /></div> : grid}
    </div>
  );
}

function WidgetCard({ w, page, index, count, editing, over, dragging, onDragStart, onDragEnd, onDragOver, onDrop, setWidgets, move }: {
  w: Widget; page: Page; index: number; count: number; editing: boolean; over: boolean; dragging: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void;
  setWidgets: (fn: (w: Widget[]) => Widget[], label?: string) => void; move: (id: string, to: number) => void;
}) {
  const { s } = useStore();
  const nav = useNav();
  const t = useT();
  const info = widgetInfo(w.type);
  const C = WIDGET_COMPONENTS[w.type];
  const acc = accountOf(s, w.accountId);
  const isApp = info.kind === "app";
  const appConnector = acc?.connectorId ?? info.connectors?.[0];
  const title = isApp ? (acc?.label ?? t(info.en, info.ar)) : t(info.en, info.ar);
  const sub = isApp ? (acc ? (isLive(acc) ? `${connector(acc.connectorId)?.name} · ${t("Live", "مباشر")}` : `${connector(acc.connectorId)?.name} · ${acc.account}`) : t("Not connected", "غير متصل"))
    : page.jobId ? jobOf(s, page.jobId)?.name : t(info.descEn, info.descAr);
  const options = isApp ? accountsFor(s, info.connectors!, page.jobId) : [];
  const set = (patch: Partial<Widget>) => setWidgets((ws) => ws.map((x) => x.id === w.id ? { ...x, ...patch } : x));

  return (
    <section className={`card ${w.size}${w.tall ? " tall" : ""}${editing ? " editing" : ""}${over ? " drag-over" : ""}${dragging ? " dragging" : ""}`}
      aria-label={title} draggable={editing} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="card-head">
        {isApp && appConnector ? <AppMono connectorId={appConnector} /> : <span className="tool-ic">{TOOL_ICONS[w.type]}</span>}
        <div className="titles"><h3 dir="auto">{title}</h3>{sub && <div className={"sub" + (isLive(acc) ? " is-live" : "")} dir="auto">{sub}</div>}</div>
      </div>
      {editing && (
        <div className="edit-bar" title={t("Drag the card to move it", "اسحب البطاقة لنقلها")}>
          <div className="size-seg" role="group" aria-label={t("Width", "العرض")}>
            {(["s", "m", "l"] as WidgetSize[]).map((z) => <button key={z} aria-pressed={w.size === z} onClick={() => set({ size: z })} aria-label={z === "s" ? t("One third wide", "ثلث العرض") : z === "m" ? t("Two thirds wide", "ثلثا العرض") : t("Full width", "عرض كامل")}>{z.toUpperCase()}</button>)}
          </div>
          <button className="icon-btn sm" aria-pressed={!!w.tall} onClick={() => set({ tall: !w.tall })} aria-label={t("Double height", "ضعف الارتفاع")} title={t("Double height", "ضعف الارتفاع")}
            style={w.tall ? { background: "var(--primary)", color: "var(--on-primary)" } : undefined}><StretchVertical size={14} /></button>
          <div className="grow" />
          <button className="icon-btn sm" aria-label={t("Move earlier", "انقل للأمام")} onClick={() => move(w.id, index - 1)} disabled={index === 0}><ArrowUp size={14} /></button>
          <button className="icon-btn sm" aria-label={t("Move later", "انقل للخلف")} onClick={() => move(w.id, index + 2)} disabled={index === count - 1}><ArrowDown size={14} /></button>
          <button className="icon-btn sm" aria-label={t("Remove", "إزالة") + " " + title} onClick={() => setWidgets((ws) => ws.filter((x) => x.id !== w.id), t(`${title} removed`, `أزيلت ${title}`))}><X size={15} /></button>
          {isApp && (
            <select id={"acc-" + w.id} className="mini-select" style={{ flexBasis: "100%", marginInlineStart: 0, padding: "3px 8px" }} aria-label={t("Account", "الحساب")} value={w.accountId ?? ""}
              onChange={(e) => e.target.value === "__new" ? nav.connect({ ...(info.connectors!.length > 1 ? { choices: info.connectors } : { connectorId: info.connectors![0] }), jobId: page.jobId, bind: { pageId: page.id, widgetId: w.id } }) : set({ accountId: e.target.value || undefined })}>
              <option value="">{t("Choose an account…", "اختر حسابًا…")}</option>
              {options.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              <option value="__new">{t("+ Connect another account", "+ اربط حسابًا آخر")}</option>
            </select>
          )}
        </div>
      )}
      <div style={{ display: "contents" }} {...(editing ? { inert: "" } as object : {})}>
        {isApp && !acc ? <ConnectState connectorId={info.connectors![0]} choices={info.connectors} page={page} widgetId={w.id} /> : <C page={page} accountId={w.accountId} />}
      </div>
    </section>
  );
}

function Library({ page, onAdd }: { page: Page; onAdd: (t: WidgetType) => void }) {
  const { s } = useStore();
  const t = useT();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"app" | "tool">("app");
  const list = WIDGETS.filter((w) => w.kind === tab && (!q || (w.en + w.ar + w.descEn).toLowerCase().includes(q.toLowerCase())));
  return (
    <aside className="library" aria-label={t("Apps and tools", "التطبيقات والأدوات")}>
      <div className="library-head">
        <b>{t("Add to this page", "أضف إلى هذه الصفحة")}</b>
        <div className="seg" role="tablist" style={{ alignSelf: "stretch" }}>
          <button role="tab" aria-selected={tab === "app"} aria-pressed={tab === "app"} onClick={() => setTab("app")} style={{ flex: 1 }}>{t("Apps", "التطبيقات")}</button>
          <button role="tab" aria-selected={tab === "tool"} aria-pressed={tab === "tool"} onClick={() => setTab("tool")} style={{ flex: 1 }}>{t("Tools", "الأدوات")}</button>
        </div>
        <label className="row" style={{ flexWrap: "nowrap", border: "1px solid var(--line)", borderRadius: 10, padding: "0 10px", background: "var(--surface-2)" }}>
          <Search size={15} className="faint" />
          <input id="lib-q" className="input" style={{ border: 0, background: "none", boxShadow: "none", padding: "6px 0", minHeight: 34 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search", "بحث")} aria-label={t("Search apps and tools", "ابحث في التطبيقات والأدوات")} />
        </label>
      </div>
      <div className="library-list">
        <p className="tiny muted" style={{ padding: "0 4px 4px" }}>{t("Drag onto the page, or click to add at the end.", "اسحب إلى الصفحة، أو انقر للإضافة في النهاية.")}</p>
        {list.map((w) => {
          const has = w.kind === "app" ? !!defaultAccount(s, w.type, page.jobId) : true;
          return (
            <button key={w.type} className="lib-item" draggable
              onDragStart={(e) => { e.dataTransfer.setData(DRAG_LIB, w.type); e.dataTransfer.effectAllowed = "copy"; }}
              onClick={() => onAdd(w.type)}>
              {w.kind === "app" ? <AppMono connectorId={w.connectors![0]} /> : <span className="tool-ic">{TOOL_ICONS[w.type]}</span>}
              <span className="li-main"><b>{t(w.en, w.ar)}</b><span className="d">{t(w.descEn, w.descAr)}</span></span>
              <span className="state">{w.kind === "app" && (has ? <span className="chip ok">{t("Ready", "جاهز")}</span> : <span className="chip">{t("Connect", "اربط")}</span>)}</span>
            </button>
          );
        })}
        {list.length === 0 && <p className="empty">{t("Nothing matches.", "لا نتائج.")}</p>}
      </div>
    </aside>
  );
}

/* ---------------- page headers ---------------- */

function JobHero({ page, onCustomize, editing }: { page: Page; onCustomize: () => void; editing: boolean }) {
  const { s, update } = useStore();
  const nav = useNav();
  const t = useT();
  const job = jobOf(s, page.jobId);
  if (!job) return null;
  const ws = startOfWeek(new Date());
  const hrs = hoursByJob(s.events, s.jobs, ws, addDays(ws, 7))[job.id] ?? 0;
  const meetings = s.events.filter((e) => e.jobId === job.id && Date.parse(e.start) >= ws.getTime() && Date.parse(e.start) < addDays(ws, 7).getTime()).length;
  const open = s.tasks.filter((k) => k.jobId === job.id && k.status !== "done").length;
  const waiting = needsYou(s).filter((e) => e.jobId === job.id).length;
  const accounts = s.connections.filter((a) => a.jobIds.includes(job.id));
  const focusing = s.focusJobId === job.id;
  return (
    <header className="hero job" data-j={job.color}>
      <div className="hero-top">
        <span className="hero-mark" aria-hidden="true">{initials(job.name)}</span>
        <div className="li-main">
          <h2>{job.name}</h2>
          <p className="role">{job.role}</p>
        </div>
        {!editing && (
          <div className="hero-actions">
            <button className="btn" aria-pressed={focusing} onClick={() => update((st) => ({ ...st, focusJobId: focusing ? undefined : job.id }))} aria-label={t("Focus on this job", "ركّز على هذه الوظيفة")} title={t("Show only this job across Mosaic", "اعرض هذه الوظيفة فقط في Mosaic")}>
              <Crosshair size={15} /><span className="lbl">{focusing ? t("Focusing", "مركّز") : t("Focus", "تركيز")}</span></button>
            <button className="btn" onClick={onCustomize} aria-label={t("Customize", "خصّص")}><Settings2 size={15} /><span className="lbl">{t("Customize", "خصّص")}</span></button>
            <button className="btn primary" onClick={() => nav.ask(t(`What should I do next for ${job.name}?`, `ما الذي يجب أن أفعله الآن في ${job.name}؟`), true)}><Sparkles size={15} />{t("Ask about this job", "اسأل عن هذه الوظيفة")}</button>
          </div>
        )}
      </div>
      <div className="stats">
        <div className="stat"><Ring value={hrs} max={job.weeklyHours} /><div><div className="v">{hrs.toFixed(1)}<span className="small muted" style={{ fontWeight: 600 }}>/{job.weeklyHours}{t("h", "س")}</span></div><div className="l">{t("Hours this week", "ساعات الأسبوع")}</div></div></div>
        <button className="stat" onClick={() => nav.go({ kind: "calendar" })}><span className="tool-ic"><CalendarPlus size={16} /></span><div><div className="v">{meetings}</div><div className="l">{t("Meetings this week", "اجتماعات الأسبوع")}</div></div></button>
        <button className="stat" onClick={() => nav.go({ kind: "inbox" })}><span className="tool-ic"><PenLine size={16} /></span><div><div className="v">{waiting}</div><div className="l">{t("Emails to answer", "رسائل للرد")}</div></div></button>
        <button className="stat" onClick={() => nav.go({ kind: "tasks" })}><span className="tool-ic"><Check size={16} /></span><div><div className="v">{open}</div><div className="l">{t("Open tasks", "مهام مفتوحة")}</div></div></button>
      </div>
      <div className="accounts-row">
        {accounts.map((a) => (
          <button key={a.id} className="acct-pill" onClick={() => nav.connect({ accountId: a.id })} title={a.account}>
            <AppMono connectorId={a.connectorId} size="sm" /><span>{a.label}</span>{isLive(a) && <i className="live-dot" aria-label={t("Live", "مباشر")} />}{a.jobIds[0] !== job.id && <span className="tiny muted">· {t("shared", "مشترك")}</span>}
          </button>
        ))}
        <button className="acct-pill add" onClick={() => nav.connect({ jobId: job.id })}><Plus size={14} />{t("Add account", "أضف حسابًا")}</button>
      </div>
    </header>
  );
}

function CustomHero({ page, onCustomize, editing }: { page: Page; onCustomize: () => void; editing: boolean }) {
  const t = useT();
  return (
    <header className="hero">
      <div className="hero-top">
        <span className="hero-mark" style={{ background: "var(--ink-2)" }}><LayoutGrid size={22} /></span>
        <div className="li-main"><h2>{page.name}</h2><p className="role">{t("Your own page", "صفحتك الخاصة")}</p></div>
        {!editing && <div className="hero-actions"><button className="btn" onClick={onCustomize}><Settings2 size={15} />{t("Customize", "خصّص")}</button></div>}
      </div>
    </header>
  );
}

function HomeHero() {
  const { s, update } = useStore();
  const nav = useNav();
  const t = useT();
  const [q, setQ] = useState("");
  const now = new Date();
  const h = now.getHours();
  const greet = s.lang === "ar" ? (h < 12 ? "صباح الخير" : "مساء الخير") : (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  const hijri = (() => { try { return now.toLocaleDateString(s.lang === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-latn" : "en-GB-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; } })();
  const ws = startOfWeek(now);
  const hrs = hoursByJob(s.events, s.jobs, ws, addDays(ws, 7));
  const waiting = needsYou(s);
  const home = s.pages.find((p) => p.id === "home")!;
  const ob = s.onboarding;
  const steps = [
    { done: s.connections.some((c) => !/^a\d+$/.test(c.id)), en: "Add an account for a job", ar: "أضف حسابًا لوظيفة", go: () => nav.connect({}) },
    { done: ob.customized, en: "Drag an app onto a job page", ar: "اسحب تطبيقًا إلى صفحة وظيفة", go: () => nav.go({ kind: "page", id: s.pages.find((p) => p.jobId)?.id ?? "home" }) },
    { done: ob.askedAI, en: "Ask Mosaic something", ar: "اسأل Mosaic شيئًا", go: () => nav.ask() },
  ];
  const ask = (text: string) => { if (text.trim()) { nav.ask(text.trim(), true); setQ(""); } };
  return (
    <>
      <header className="hero">
        <div className="hero-top">
          <div className="li-main">
            <h2 className="greet">{greet}</h2>
            <p className="greet-sub">{fmtDay(now, s.lang, { weekday: "long", day: "numeric", month: "long" })}{hijri ? " · " + hijri : ""}</p>
          </div>
        </div>
        <BriefContent page={home} compact />
        <form className="askbar" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <Sparkles size={18} className="spark" />
          <input id="home-ask" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Ask Mosaic, e.g. “book a call with Fatima next week”", "اسأل Mosaic، مثلًا «رتب اجتماعًا مع فاطمة الأسبوع القادم»")} aria-label={t("Ask Mosaic", "اسأل Mosaic")} />
          <button className="btn primary sm" type="submit" disabled={!q.trim()}>{t("Ask", "اسأل")}</button>
        </form>
      </header>

      <div className="section-head"><h3>{t("Your jobs", "وظائفك")}</h3><span className="chip">{s.jobs.length}</span></div>
      <div className="jobs-strip">
        {s.jobs.map((j) => {
          const page = s.pages.find((p) => p.jobId === j.id);
          const h = hrs[j.id] ?? 0;
          const today = s.events.filter((e) => e.jobId === j.id && new Date(e.start).toDateString() === now.toDateString()).length;
          const mail = waiting.filter((e) => e.jobId === j.id).length;
          return (
            <button key={j.id} className="job-card" data-j={j.color} onClick={() => { if (page) nav.go({ kind: "page", id: page.id }); }}>
              <div className="top-line"><JobTile job={j} size={30} /><div className="li-main"><b>{j.name}</b><div className="tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.role}</div></div></div>
              <div className="facts"><span><b>{today}</b> {t("meetings today", "اجتماعات اليوم")}</span><span><b>{mail}</b> {t("to answer", "للرد")}</span><span><b>{h.toFixed(1)}</b>/{j.weeklyHours}{t("h", "س")}</span></div>
              <div className={"bar" + (h > j.weeklyHours ? " over" : "")}><i style={{ width: Math.min(100, (h / Math.max(1, j.weeklyHours)) * 100) + "%" }} /></div>
            </button>
          );
        })}
      </div>

      {!ob.dismissed && steps.some((x) => !x.done) && (
        <div className="checklist-card">
          <div><b>{t("Get set up", "ابدأ الإعداد")}</b><div className="tiny muted">{t(`${steps.filter((x) => x.done).length} of ${steps.length} done`, `أنجزت ${steps.filter((x) => x.done).length} من ${steps.length}`)}</div></div>
          <ol>{steps.map((x) => <li key={x.en} className={x.done ? "done" : ""}><button onClick={x.go}><span className="tick"><Check size={12} /></span>{t(x.en, x.ar)}</button></li>)}</ol>
          <button className="icon-btn sm" aria-label={t("Hide setup steps", "أخفِ خطوات الإعداد")} onClick={() => update((st) => ({ ...st, onboarding: { ...st.onboarding, dismissed: true } }))}><X size={15} /></button>
        </div>
      )}

      <div className="section-head"><h3>{t("Today at a glance", "يومك باختصار")}</h3></div>
    </>
  );
}

