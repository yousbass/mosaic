import React, { useEffect, useState } from "react";
import { Info, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { CONNECTORS, connector } from "../data/connectors";
import { AppMono, JobTile, useT } from "../ui";
import { isLive, liveSpec, mcp } from "../lib/live";
import { demoAccounts } from "../lib/accounts";
import { RemoveAccountDialog } from "./RemoveAccount";
import type { Connection } from "../types";

/** Sign-in state of each live connector, read without asking the viewer anything. */
function useLiveAuth(servers: string[]) {
  const [st, setSt] = useState<Record<string, string>>({});
  const key = servers.join("|");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void mcp().then(async (m) => {
      if (!m) { if (alive) setSt(Object.fromEntries(key.split("|").map((k) => [k, "unavailable"]))); return; }
      try {
        const r = await m.listTools();
        if (!alive) return;
        const out: Record<string, string> = {};
        for (const sv of key.split("|")) out[sv] = r.servers.find((x) => x.server === sv)?.authStatus ?? "missing";
        setSt(out);
      } catch { /* status is a nicety; the cards show call-time errors */ }
    });
    return () => { alive = false; };
  }, [key]);
  return st;
}

export function ConnectionsView() {
  const { s } = useStore();
  const nav = useNav();
  const t = useT();
  const [removing, setRemoving] = useState<string[] | null>(null);
  const liveServers = [...new Set(s.connections.filter(isLive).map((a) => a.server!))];
  const demos = demoAccounts(s);
  const orphans = s.connections.filter((a) => !s.jobs.some((j) => j.id === a.jobIds[0]));
  const auth = useLiveAuth(liveServers);
  const status = (a: Connection) => {
    if (!isLive(a)) return <span className="chip demo">{t("Demo", "تجريبي")}</span>;
    const st = auth[a.server!];
    if (st === "needs_reauth") return <span className="chip warn" title={t(`Reconnect ${a.server} in claude.ai Settings → Connectors`, `أعد ربط ${a.server} من إعدادات claude.ai`)}>{t("Reconnect", "أعد الربط")}</span>;
    if (st === "unavailable") return <span className="chip demo" title={t("Live accounts update when Mosaic is opened on claude.ai", "تتحدث الحسابات المباشرة عند فتح Mosaic على claude.ai")}>{t("Opens on claude.ai", "يعمل على claude.ai")}</span>;
    if (st === "missing") return <span className="chip warn" title={t(`Add ${a.server} in claude.ai Settings → Connectors`, `أضف ${a.server} من إعدادات claude.ai`)}>{t("Not on claude.ai", "غير مضاف في claude.ai")}</span>;
    return <span className="chip live">{t("Live", "مباشر")}</span>;
  };
  const row = (a: Connection) => (
    <div className="acct-row" key={a.id}>
      <AppMono connectorId={a.connectorId} />
      <div className="who"><b>{a.label}</b><span dir="ltr" style={{ textAlign: "start" }}>{connector(a.connectorId)?.name}{a.account ? " · " + a.account : isLive(a) ? " · claude.ai" : ""}{a.scope ? " · “" + a.scope + "”" : ""}</span></div>
      {status(a)}
      {a.jobIds.length > 1 && <span className="row" style={{ gap: 3 }} title={a.jobIds.map((j) => s.jobs.find((x) => x.id === j)?.name).join(", ")}>
        {a.jobIds.map((j) => <JobTile key={j} job={s.jobs.find((x) => x.id === j)} size={18} />)}</span>}
      <button className="icon-btn sm" aria-label={t("Edit", "تعديل") + " " + a.label} title={t("Edit", "تعديل")} onClick={() => nav.connect({ accountId: a.id })}><Pencil size={14} /></button>
      <button className="icon-btn sm danger-hover" aria-label={t("Remove", "إزالة") + " " + a.label} title={t("Remove", "إزالة")} onClick={() => setRemoving([a.id])}><Trash2 size={14} /></button>
    </div>
  );
  return (
    <div className="content-inner">
      <div className="banner live-banner"><ShieldCheck size={18} />
        <span>{t("Live accounts connect through your own claude.ai connectors, signed in as you. Mosaic never sees a password, and claude.ai asks you before Mosaic uses each one.",
          "تتصل الحسابات المباشرة عبر موصلاتك في claude.ai باسمك. لا يرى Mosaic أي كلمة مرور، ويطلب claude.ai إذنك قبل أن يستخدم Mosaic أيًا منها.")}</span>
      </div>
      <div className="banner"><Info size={18} />
        <span>{t("Accounts marked Demo show sample data. Gmail, Google Calendar, Microsoft 365, Zoom, Salesforce and Slack can go live the same way once they're connected on claude.ai. LinkedIn, Instagram and Yahoo have no claude.ai connector yet.",
          "الحسابات المعلّمة «تجريبي» تعرض بيانات تجريبية. يمكن تفعيل Gmail وGoogle Calendar وMicrosoft 365 وZoom وSalesforce وSlack بالطريقة نفسها بعد ربطها في claude.ai. لا يوجد موصل في claude.ai بعد لـ LinkedIn وInstagram وYahoo.")}</span>
      </div>
      <div className="section-head"><h3 className="section-title">{t("Your accounts, by job", "حساباتك حسب الوظيفة")}</h3><div className="grow" />
        {demos.length > 0 && <button className="btn ghost danger" onClick={() => setRemoving(demos.map((a) => a.id))}><Trash2 size={15} />{t(`Remove all demo accounts (${demos.length})`, `أزل كل الحسابات التجريبية (${demos.length})`)}</button>}
        <button className="btn primary" onClick={() => nav.connect({})}><Plus size={16} />{t("Add account", "أضف حسابًا")}</button></div>
      <div className="groups">
        {s.jobs.map((j) => {
          const accs = s.connections.filter((a) => a.jobIds[0] === j.id);
          return (
            <section className="acct-group" key={j.id} data-j={j.color} aria-label={j.name}>
              <div className="acct-group-head"><JobTile job={j} size={26} /><div className="li-main"><b>{j.name}</b><div className="tiny muted">{j.role}</div></div>
                <button className="btn sm" onClick={() => nav.connect({ jobId: j.id })}><Plus size={14} />{t("Add", "أضف")}</button></div>
              {accs.map(row)}
              {accs.length === 0 && <p className="empty">{t("No accounts yet for this job.", "لا حسابات لهذه الوظيفة بعد.")}</p>}
            </section>
          );
        })}
        {orphans.length > 0 && (
          <section className="acct-group" aria-label={t("Not linked to a job", "غير مرتبطة بوظيفة")}>
            <div className="acct-group-head"><div className="li-main"><b>{t("Not linked to a job", "غير مرتبطة بوظيفة")}</b><div className="tiny muted">{t("Their job was removed. Edit them to pick a job, or remove them.", "حُذفت وظيفتها. عدّلها لاختيار وظيفة أو أزلها.")}</div></div></div>
            {orphans.map(row)}
          </section>
        )}
      </div>
      {removing && <RemoveAccountDialog ids={removing} onClose={() => setRemoving(null)} />}
      <div className="section-head"><h3 className="section-title">{t("Apps you can add", "تطبيقات يمكنك إضافتها")}</h3></div>
      <div className="app-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {CONNECTORS.map((c) => {
          const n = s.connections.filter((a) => a.connectorId === c.id).length;
          return (
            <button key={c.id} className="app-choice" onClick={() => nav.connect({ connectorId: c.id })}>
              <AppMono connectorId={c.id} />
              <span className="li-main"><b className="small" style={{ display: "block" }}>{c.name}</b>
                <span className="tiny muted" style={{ display: "block" }}>{s.lang === "ar" ? c.gives.ar : c.gives.en}</span></span>
              {liveSpec(c.id) && <span className="chip live">{t("Live", "مباشر")}</span>}
              {n > 0 ? <span className="chip ok">{n}</span> : <Plus size={16} className="muted" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

