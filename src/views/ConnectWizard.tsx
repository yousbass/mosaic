import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Lock, PlugZap, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { useNav, type ConnectRequest } from "../nav";
import { CONNECTORS, WIDGETS, connector } from "../data/connectors";
import { AppMono, Modal, jobOf, useT } from "../ui";
import { uid } from "../lib/time";
import { isLive, isMcpError, liveErrorCopy, liveSpec, mcp, openPermissions, type McpError } from "../lib/live";
import type { AppState, Connection, ConnectorId, Widget } from "../types";
import { RemoveAccountDialog } from "./RemoveAccount";

/** A little sample data for a newly connected demo account, so its card isn't empty. */
export function seedFor(c: Connection, s: AppState): Partial<AppState> {
  const now = Date.now();
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const jobId = c.jobIds[0];
  const job = s.jobs.find((j) => j.id === jobId);
  const id = () => uid("x");
  if (["outlook", "gmail", "yahoo"].includes(c.connectorId)) {
    return { emails: [
      { id: id(), accountId: c.id, jobId, source: c.connectorId, from: "welcome@mosaic.example", fromName: "Mosaic", subject: `${c.label} is connected`, body: `New mail to ${c.account} will appear here and on the ${job?.name ?? "job"} page.`, receivedAt: at(0), unread: true, priority: "info" },
    ] };
  }
  if (c.connectorId === "linkedin" || c.connectorId === "instagram") {
    const network = c.connectorId;
    return { posts: [
      { id: id(), network, accountId: c.id, jobId, status: "draft", text: network === "linkedin" ? `What I learned this week as ${job?.role ?? "a professional"}: small changes, measured well, beat big plans.` : "Behind the scenes this week." },
    ] };
  }
  if (c.connectorId === "teams" || c.connectorId === "slack") {
    return { chats: [{ id: id(), app: c.connectorId, accountId: c.id, jobId, from: "Mosaic", text: `${c.label} is connected. New messages will show here.`, at: at(0), unread: true }] };
  }
  return {};
}

const NOUN: Partial<Record<ConnectorId, string>> = { outlook: "email", gmail: "email", yahoo: "email", gcal: "calendar", m365: "OneDrive", gdrive: "Drive" };

/** Suggest a name the way people say it: "University email", "Seef Studio Instagram". */
export function suggestLabel(jobName: string | undefined, id: ConnectorId): string {
  const c = connector(id)!;
  const noun = NOUN[id] ?? c.name;
  return jobName ? `${jobName} ${noun}` : noun.charAt(0).toUpperCase() + noun.slice(1);
}

const VENDOR_SIGNIN: Partial<Record<ConnectorId, string>> = {
  outlook: "Microsoft", teams: "Microsoft", m365: "Microsoft", gmail: "Google", gcal: "Google", gdrive: "Google", yahoo: "Yahoo",
  salesforce: "Salesforce", zoom: "Zoom", slack: "Slack", linkedin: "LinkedIn", instagram: "Meta",
};

/** Wait, then try a harmless read once more (used only for retryable failures). */
const pause = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** Connect a live account: check the viewer has the connector, then make one harmless read (claude.ai asks for consent here). */
export async function probeLive(cid: ConnectorId): Promise<McpError | null> {
  const spec = liveSpec(cid);
  if (!spec) return { code: "bad_request", message: "Not a live connector" };
  const m = await mcp();
  if (!m) return { code: "capability_disabled", message: "" };
  const listed = await m.listTools(spec.server).catch(() => null);
  if (listed && !listed.servers.some((x) => x.server === spec.server)) return { code: "server_not_connected", server: spec.server, message: "" };
  for (let attempt = 0; ; attempt++) {
    try {
      await m.callTool(spec.server, spec.probe.tool, spec.probe.input, { cache: false });
      return null;
    } catch (e) {
      const err: McpError = isMcpError(e) ? e : { code: "upstream_error", message: String(e) };
      if (attempt === 0 && err.retryable) { await pause(Math.min(60_000, err.retryAfterMs ?? 800) + Math.random() * 400); continue; }
      return err;
    }
  }
}

/** The app card that shows a service, e.g. the Files card for Google Drive. */
export const widgetTypeFor = (cid: ConnectorId) => WIDGETS.find((w) => w.kind === "app" && w.connectors?.includes(cid))?.type;

export function ConnectWizard({ req, onClose }: { req: ConnectRequest; onClose: () => void }) {
  const { s, update, toast } = useStore();
  const nav = useNav();
  const t = useT();
  const editing = req.accountId ? s.connections.find((c) => c.id === req.accountId) : undefined;
  const [step, setStep] = useState<1 | 2 | 3>(editing || req.connectorId ? 2 : 1);
  const [cid, setCid] = useState<ConnectorId | undefined>(editing?.connectorId ?? req.connectorId);
  const [jobs, setJobs] = useState<string[]>(editing?.jobIds ?? (req.jobId ? [req.jobId] : s.focusJobId ? [s.focusJobId] : []));
  const firstJob = jobOf(s, jobs[0]);
  const [label, setLabel] = useState(editing?.label ?? "");
  const [labelTouched, setLabelTouched] = useState(!!editing);
  const [account, setAccount] = useState(editing?.account ?? "");
  const [phase, setPhase] = useState<"ready" | "working" | "done" | "error">("ready");
  const [liveErr, setLiveErr] = useState<McpError | null>(null);
  const [permNote, setPermNote] = useState("");
  const [scope, setScope] = useState(editing?.scope ?? "");
  const [made, setMade] = useState<Connection | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Move focus to the new step's first field so keyboard users don't lose their place.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".modal input:not([type=checkbox]), .modal .app-choice, .modal .signin .btn.primary");
    el?.focus();
  }, [step, phase]);
  const shownLabel = labelTouched ? label : cid ? suggestLabel(firstJob?.name, cid) : "";
  const c = cid ? connector(cid) : undefined;
  const isMail = cid === "outlook" || cid === "gmail" || cid === "yahoo";
  const spec = liveSpec(cid);
  const live = editing ? isLive(editing) : !!spec;
  const accountOk = live ? true : !!account.trim() && (!isMail || /\S+@\S+\.\S+/.test(account));
  const valid = !!cid && !!shownLabel.trim() && accountOk && jobs.length > 0;

  const groups = useMemo(() => [
    { en: "Email and calendar", ar: "البريد والتقويم", cats: ["mail", "calendar"] },
    { en: "Meetings and chat", ar: "الاجتماعات والمحادثات", cats: ["meetings", "chat"] },
    { en: "Work apps", ar: "تطبيقات العمل", cats: ["crm", "files", "tenders"] },
    { en: "Social", ar: "التواصل الاجتماعي", cats: ["social"] },
  ], []);

  const save = () => {
    if (!valid || !cid) return;
    if (editing) {
      update((st) => ({ ...st, connections: st.connections.map((x) => x.id === editing.id ? { ...x, label: shownLabel.trim(), account: account.trim(), jobIds: jobs, scope: scope.trim() || undefined } : x) }), t("Account updated", "تم تحديث الحساب"));
      onClose();
      return;
    }
    setStep(3);
  };

  /** Save the new account (and put it into the card that asked for it). */
  const finish = (extra: Partial<Connection>) => {
    if (!cid) return;
    const conn: Connection = { id: uid("a"), connectorId: cid, label: shownLabel.trim(), account: account.trim(), jobIds: jobs, connectedAt: new Date().toISOString(), demo: true, ...extra };
    update((st) => {
      const seed = conn.demo ? seedFor(conn, st) : {};
      return {
        ...st,
        connections: [...st.connections, conn],
        emails: seed.emails ? [...seed.emails, ...st.emails] : st.emails,
        posts: seed.posts ? [...seed.posts, ...st.posts] : st.posts,
        chats: seed.chats ? [...seed.chats, ...st.chats] : st.chats,
        pages: req.bind ? st.pages.map((p) => p.id === req.bind!.pageId ? { ...p, widgets: p.widgets.map((w) => w.id === req.bind!.widgetId ? { ...w, accountId: conn.id } : w) } : p) : st.pages,
      };
    });
    setMade(conn);
    setPhase("done");
    toast(t(`${shownLabel.trim()} connected`, `تم ربط ${shownLabel.trim()}`));
  };

  const signIn = () => {
    if (!cid) return;
    setPhase("working");
    window.setTimeout(() => {
      if (!alive.current) return; // closed while signing in: connect nothing
      finish({ demo: true });
    }, 1100);
  };

  const signInLive = async () => {
    if (!cid || !spec) return;
    setPhase("working"); setLiveErr(null); setPermNote("");
    const err = await probeLive(cid);
    if (!alive.current) return; // closed while connecting: connect nothing
    if (err) { setLiveErr(err); setPhase("error"); return; }
    finish({ demo: false, server: spec.server, scope: scope.trim() || undefined });
  };

  /** Put the new account on its job's page when no card asked for it. */
  const jobPage = s.pages.find((p) => p.jobId === jobs[0]);
  const place = () => {
    if (!made || !jobPage || !cid) return;
    const type = widgetTypeFor(cid);
    if (!type) return;
    const info = WIDGETS.find((w) => w.type === type)!;
    const w: Widget = { id: uid("w"), type, size: info.size, tall: info.tall, accountId: made.id };
    update((st) => ({ ...st, pages: st.pages.map((p) => p.id === jobPage.id ? { ...p, widgets: [w, ...p.widgets] } : p) }));
    onClose();
    nav.go({ kind: "page", id: jobPage.id });
  };
  const alreadyOnPage = !!made && s.pages.some((p) => p.widgets.some((w) => w.accountId === made.id));

  const vendor = c ? VENDOR_SIGNIN[c.id] ?? c.name : "";
  const errCopy = liveErr ? liveErrorCopy(liveErr, s.lang, spec?.server) : null;
  if (editing && confirmRemove) return <RemoveAccountDialog ids={[editing.id]} onClose={() => setConfirmRemove(false)} onDone={onClose} />;
  const title = editing ? t("Edit account", "تعديل الحساب") : step === 1 ? t("Add an account", "أضف حسابًا") : c ? t(`Connect ${c.name}`, `اربط ${c.name}`) : "";
  return (
    <Modal title={title} onClose={onClose} wide={step === 1}
      foot={step === 2 ? <>
        {editing && <button className="btn ghost danger" onClick={() => setConfirmRemove(true)}><Trash2 size={15} />{t("Remove account", "أزل الحساب")}</button>}
        <div className="grow" />
        {!editing && !req.connectorId && <button className="btn ghost" onClick={() => setStep(1)}><ArrowLeft size={15} className="flip" />{t("Back", "رجوع")}</button>}
        <button className="btn primary" onClick={save} disabled={!valid}>{editing ? t("Save", "احفظ") : t("Continue", "متابعة")}</button>
      </> : step === 3 ? <>
        <div className="grow" />
        {phase === "done" ? <>
          {made && !req.bind && !alreadyOnPage && jobPage && widgetTypeFor(made.connectorId) && <button className="btn" onClick={place}>{t(`Show it on the ${jobPage.name} page`, `اعرضه في صفحة ${jobPage.name}`)}</button>}
          <button className="btn primary" onClick={onClose}>{t("Done", "تم")}</button>
        </> : <button className="btn ghost" onClick={() => { setStep(2); setPhase("ready"); setLiveErr(null); }} disabled={phase === "working"}>{t("Back", "رجوع")}</button>}
      </> : undefined}>
      {!editing && <div className="steps" aria-hidden="true"><i className={step >= 1 ? "on" : ""} /><i className={step >= 2 ? "on" : ""} /><i className={step >= 3 ? "on" : ""} /></div>}

      {step === 1 && <p className="small muted" style={{ marginTop: -4 }}>{t("Apps marked Live connect for real through your claude.ai account. The others are demo accounts with sample data for now.",
        "التطبيقات المعلّمة «مباشر» تتصل فعليًا عبر حسابك على claude.ai. البقية حسابات تجريبية ببيانات تجريبية حاليًا.")}</p>}
      {step === 1 && groups.filter((g) => CONNECTORS.some((x) => g.cats.includes(x.category) && (!req.choices || req.choices.includes(x.id)))).map((g) => (
        <div key={g.en} className="stack" style={{ gap: 8 }}>
          <b className="small">{t(g.en, g.ar)}</b>
          <div className="app-grid">
            {CONNECTORS.filter((x) => g.cats.includes(x.category) && (!req.choices || req.choices.includes(x.id))).map((x) => (
              <button key={x.id} className="app-choice" aria-pressed={cid === x.id} onClick={() => { setCid(x.id); setStep(2); }}>
                <AppMono connectorId={x.id} />
                <span className="li-main"><b className="small" style={{ display: "block" }}>{x.name}</b><span className="tiny muted">{x.vendor}</span></span>
                {liveSpec(x.id) ? <span className="chip live">{t("Live", "مباشر")}</span> : <span className="tiny faint">{t("Demo", "تجريبي")}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {step === 2 && c && (
        <>
          <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
            <AppMono connectorId={c.id} size="lg" />
            <div className="li-main"><b>{c.name}</b> {live && <span className="chip live">{t("Live", "مباشر")}</span>}<p className="small muted">{s.lang === "ar" ? c.gives.ar : c.gives.en}</p></div>
          </div>
          {editing && live && <div className="banner live-banner"><ShieldCheck size={18} /><span>{t(`Live through your claude.ai ${editing.server} connector, signed in as you.`, `مباشر عبر موصل ${editing.server} في حسابك على claude.ai، باسمك.`)}</span></div>}
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <span>{t("Which job is this for?", "لأي وظيفة هذا الحساب؟")}</span>
            <div className="job-pick">
              {s.jobs.map((j) => (
                <label key={j.id} data-j={j.color}>
                  <input id={"cw-job-" + j.id} type="checkbox" checked={jobs.includes(j.id)} onChange={(e) => setJobs(e.target.checked ? [...jobs, j.id] : jobs.filter((x) => x !== j.id))} />{j.name}
                </label>
              ))}
            </div>
            <span className="hint">{t("Pick more than one if you use this account for several jobs. Its items are filed under the first.", "اختر أكثر من وظيفة إن كنت تستخدم الحساب لعدة وظائف. تُصنّف عناصره تحت الأولى.")}</span>
          </fieldset>
          <label className="field"><span>{t("Name it", "سمِّه")}</span>
            <input id="cw-label" className="input" value={shownLabel} onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }} placeholder={t("e.g. University email", "مثال: بريد الجامعة")} />
            <span className="hint">{t("This is how it appears on your pages, e.g. “University email” or “Dilmun Advisory email”.", "هكذا يظهر في صفحاتك، مثل «بريد الجامعة» أو «بريد Dilmun Advisory».")}</span></label>
          {live ? <>
            <label className="field"><span>{t(`${vendor} account (optional)`, `حساب ${vendor} (اختياري)`)}</span>
              <input id="cw-account" className="input" dir="ltr" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="name@gmail.com" />
              <span className="hint">{t("Just a reminder for you. claude.ai decides which account is used.", "للتذكير فقط. يحدد claude.ai الحساب المستخدم.")}</span></label>
            {cid === "gdrive" && <label className="field"><span>{t("Only show files that mention (optional)", "اعرض فقط الملفات التي تذكر (اختياري)")}</span>
              <input id="cw-scope" className="input" dir="auto" value={scope} onChange={(e) => setScope(e.target.value)} placeholder={firstJob ? firstJob.name : t("e.g. Dilmun", "مثال: Dilmun")} />
              <span className="hint">{t("Leave empty to show your most recent files.", "اتركه فارغًا لعرض أحدث ملفاتك.")}</span></label>}
          </> : <label className="field"><span>{isMail ? t("Email address", "البريد الإلكتروني") : c.category === "tenders" ? t("Keywords to watch", "الكلمات المراقبة") : t("Account or handle", "الحساب أو المعرّف")}</span>
            <input id="cw-account" className="input" dir="ltr" value={account} onChange={(e) => setAccount(e.target.value)}
              placeholder={isMail ? "name@company.bh" : c.category === "social" ? "@yourname" : c.category === "tenders" ? "consultancy, training" : "name@company.bh"} />
            {isMail && account && !/\S+@\S+\.\S+/.test(account) && <span className="err">{t("Enter a full email address, like name@company.bh.", "أدخل بريدًا كاملًا مثل name@company.bh.")}</span>}</label>}
        </>
      )}

      {step === 3 && c && spec && (
        <div className="signin">
          <AppMono connectorId={c.id} size="lg" />
          {phase === "done" ? <>
            <span className="ic green" style={{ width: 40, height: 40, borderRadius: 20 }}><Check size={20} /></span>
            <b>{t(`${shownLabel} is connected`, `تم ربط ${shownLabel}`)}</b>
            <p className="small muted">{req.bind ? t("Your real files are now showing on your page.", "تظهر ملفاتك الحقيقية الآن في صفحتك.") : t("Your real files can now show on any page.", "يمكن الآن عرض ملفاتك الحقيقية في أي صفحة.")}</p>
          </> : phase === "error" && errCopy ? <>
            <span className="ic amber" style={{ width: 40, height: 40, borderRadius: 20 }}><PlugZap size={20} /></span>
            <b>{t("Not connected yet", "لم يتم الربط بعد")}</b>
            <p className="small" style={{ maxWidth: "46ch" }} role="alert">{errCopy.text}</p>
            {permNote && <p className="tiny muted">{permNote}</p>}
            <div className="row" style={{ justifyContent: "center" }}>
              {errCopy.fix === "permissions" && <button className="btn" onClick={async () => {
                if (!(await openPermissions())) setPermNote(t("Open the page's Permissions menu at the top of this view.", "افتح قائمة الأذونات في أعلى هذه الصفحة."));
              }}>{t("Open permissions", "افتح الأذونات")}</button>}
              {errCopy.fix !== "none" && <button className="btn primary" onClick={signInLive}><RefreshCw size={15} />{t("Try again", "حاول مرة أخرى")}</button>}
            </div>
          </> : <>
            <b>{t("Connect through claude.ai", "الربط عبر claude.ai")}</b>
            <p className="small muted" style={{ maxWidth: "46ch" }}>{t(`Mosaic uses the ${spec.server} connector on your claude.ai account. claude.ai asks you once to allow it, and Mosaic never sees your password.`,
              `يستخدم Mosaic موصل ${spec.server} في حسابك على claude.ai. يطلب claude.ai موافقتك مرة واحدة، ولا يرى Mosaic كلمة مرورك.`)}</p>
            <button className="btn primary" onClick={signInLive} disabled={phase === "working"}>
              {phase === "working" ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={15} />}
              {phase === "working" ? t("Waiting for claude.ai…", "بانتظار claude.ai…") : t(`Connect ${c.name}`, `اربط ${c.name}`)}
            </button>
            <p className="tiny faint" style={{ maxWidth: "46ch" }}>{t("Mosaic only reads your files: it lists, searches and opens them to summarise. It never changes or deletes anything.",
              "يقرأ Mosaic ملفاتك فقط: يعرضها ويبحث فيها ويفتحها لتلخيصها. لا يغيّر أو يحذف شيئًا.")}</p>
          </>}
        </div>
      )}

      {step === 3 && c && !spec && (
        <div className="signin">
          <AppMono connectorId={c.id} size="lg" />
          {phase === "done" ? <>
            <span className="ic green" style={{ width: 40, height: 40, borderRadius: 20 }}><Check size={20} /></span>
            <b>{t(`${shownLabel} is connected`, `تم ربط ${shownLabel}`)}</b>
            <p className="small muted">{req.bind ? t("It's now showing on your page.", "يظهر الآن في صفحتك.") : t("Add it to any page from Customize, or it appears where this app is already placed.", "أضفه إلى أي صفحة من «خصّص»، أو يظهر حيث وُضع هذا التطبيق.")}</p>
          </> : <>
            <b>{t(`Sign in to ${vendor}`, `سجّل الدخول إلى ${vendor}`)}</b>
            <p className="small muted" dir="ltr">{account}</p>
            <button className="btn primary" onClick={signIn} disabled={phase === "working"}>
              {phase === "working" ? <Loader2 size={16} className="spin" /> : <Lock size={15} />}
              {phase === "working" ? t("Connecting…", "جارٍ الربط…") : t(`Continue to ${vendor}`, `المتابعة إلى ${vendor}`)}
            </button>
            <p className="tiny faint" style={{ maxWidth: "46ch" }}>{c.claudeConnector
              ? t(`Demo connection with sample data. A real ${c.name} connection through claude.ai's ${c.claudeConnector} connector is next on the list.`, `اتصال تجريبي ببيانات تجريبية. الربط الحقيقي مع ${c.name} عبر موصل ${c.claudeConnector} في claude.ai هو التالي.`)
              : t(`Demo connection: no password is asked for and nothing leaves this page. ${c.name} has no claude.ai connector yet, so a live connection needs ${c.live.en}.`,
                `اتصال تجريبي: لا تُطلب كلمة مرور ولا يغادر شيء هذه الصفحة. لا يوجد موصل ${c.name} في claude.ai بعد، لذا يحتاج الاتصال الفعلي إلى ${c.live.ar}.`)}</p>
          </>}
        </div>
      )}
    </Modal>
  );
}
