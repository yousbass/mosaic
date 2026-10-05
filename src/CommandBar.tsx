import React, { useMemo, useState } from "react";
import { CalendarDays, CheckSquare, FileBarChart, Gavel, Home, Inbox, Mail, Plug, Search, Settings, Sparkles, Plus, LayoutGrid } from "lucide-react";
import { useStore } from "./store";
import { useNav, type View } from "./nav";
import { useT } from "./ui";

interface Item { id: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void }

export function CommandBar({ onClose }: { onClose: () => void }) {
  const { s } = useStore();
  const nav = useNav();
  const t = useT();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);

  const items = useMemo<Item[]>(() => {
    const go = (v: View) => () => { nav.go(v); onClose(); };
    const base: Item[] = [
      { id: "ask", group: t("Assistant", "المساعد"), label: q ? t(`Ask Mosaic: "${q}"`, `اسأل Mosaic: "${q}"`) : t("Ask Mosaic anything", "اسأل Mosaic أي شيء"), icon: <Sparkles size={16} />, run: () => { nav.ask(q, !!q); onClose(); } },
      { id: "ne", group: t("Create", "إنشاء"), label: t("New event", "حدث جديد"), icon: <Plus size={16} />, run: () => { nav.editEvent({}); onClose(); } },
      { id: "nm", group: t("Create", "إنشاء"), label: t("New email", "بريد جديد"), icon: <Mail size={16} />, run: () => { nav.composeEmail(); onClose(); } },
      { id: "home", group: t("Go to", "انتقل إلى"), label: t("Home", "الرئيسية"), icon: <Home size={16} />, run: go({ kind: "page", id: "home" }) },
      ...s.pages.filter((p) => p.id !== "home").map((p) => ({ id: "pg" + p.id, group: t("Go to", "انتقل إلى"), label: p.name, icon: <LayoutGrid size={16} />, run: go({ kind: "page", id: p.id }) })),
      { id: "cal", group: t("Go to", "انتقل إلى"), label: t("Calendar", "التقويم"), icon: <CalendarDays size={16} />, run: go({ kind: "calendar" }) },
      { id: "inb", group: t("Go to", "انتقل إلى"), label: t("Inbox", "البريد"), icon: <Inbox size={16} />, run: go({ kind: "inbox" }) },
      { id: "tsk", group: t("Go to", "انتقل إلى"), label: t("Tasks", "المهام"), icon: <CheckSquare size={16} />, run: go({ kind: "tasks" }) },
      { id: "tnd", group: t("Go to", "انتقل إلى"), label: t("Tenders", "المناقصات"), icon: <Gavel size={16} />, run: go({ kind: "tenders" }) },
      { id: "rep", group: t("Go to", "انتقل إلى"), label: t("Reports", "التقارير"), icon: <FileBarChart size={16} />, run: go({ kind: "reports" }) },
      { id: "con", group: t("Go to", "انتقل إلى"), label: t("Connections", "الاتصالات"), icon: <Plug size={16} />, run: go({ kind: "connections" }) },
      { id: "set", group: t("Go to", "انتقل إلى"), label: t("Settings", "الإعدادات"), icon: <Settings size={16} />, run: go({ kind: "settings" }) },
    ];
    const ql = q.trim().toLowerCase();
    if (!ql) return base;
    const found: Item[] = [
      ...s.emails.filter((e) => !e.archived && (e.subject + e.fromName + e.body).toLowerCase().includes(ql)).slice(0, 5)
        .map((e) => ({ id: e.id, group: t("Mail", "البريد"), label: e.subject, hint: e.fromName, icon: <Mail size={16} />, run: go({ kind: "inbox", emailId: e.id }) })),
      ...s.events.filter((e) => e.title.toLowerCase().includes(ql) && Date.parse(e.end) > Date.now()).slice(0, 5)
        .map((e) => ({ id: e.id, group: t("Calendar", "التقويم"), label: e.title, hint: new Date(e.start).toLocaleString(), icon: <CalendarDays size={16} />, run: () => { nav.editEvent({ id: e.id }); onClose(); } })),
      ...s.tasks.filter((k) => k.status !== "done" && k.title.toLowerCase().includes(ql)).slice(0, 5)
        .map((k) => ({ id: k.id, group: t("Tasks", "المهام"), label: k.title, icon: <CheckSquare size={16} />, run: go({ kind: "tasks" }) })),
    ];
    return [base[0], ...found, ...base.slice(1).filter((b) => b.label.toLowerCase().includes(ql))];
  }, [q, s, nav, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = Math.min(i, items.length - 1);
  let lastGroup = "";
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal cmd" role="dialog" aria-modal="true" aria-label={t("Search and commands", "البحث والأوامر")}>
        <div className="cmd-input">
          <Search size={18} className="muted" />
          <input id="cmd-q" autoFocus dir="auto" value={q} placeholder={t("Search mail, meetings, tasks — or ask anything", "ابحث في البريد والاجتماعات والمهام، أو اسأل أي شيء")}
            role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={items[sel] ? "cmd-" + items[sel].id : undefined}
            onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(items.length - 1, sel + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(0, sel - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); items[sel]?.run(); }
              else if (e.key === "Escape") onClose();
            }} />
        </div>
        <div className="cmd-list" id="cmd-list" role="listbox">
          {items.map((it, idx) => {
            const head = it.group !== lastGroup ? <div className="cmd-group">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <React.Fragment key={it.id}>
                {head}
                <button id={"cmd-" + it.id} role="option" aria-selected={idx === sel} className="cmd-item" onMouseEnter={() => setI(idx)} onClick={it.run}>
                  <span className="muted">{it.icon}</span><span className="grow" dir="auto">{it.label}</span>{it.hint && <span className="small faint">{it.hint}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
