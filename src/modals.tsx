import React, { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Send, Sparkles, Trash2 } from "lucide-react";
import { useStore } from "./store";
import type { EventDraft } from "./nav";
import { JobSelect, Modal, Thinking, jobOf, useT } from "./ui";
import { addDays, atTime, fmtTime, isWorkday, toLocalInput, uid } from "./lib/time";

/** The next half hour inside working hours (08:00–18:00, Sunday–Thursday). */
export function nextWorkingSlot(now: Date): Date {
  const d = new Date(now);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  if (isWorkday(d) && d.getHours() >= 8 && d.getHours() < 17) return d;
  let day = d.getHours() < 8 ? d : addDays(d, 1);
  while (!isWorkday(day)) day = addDays(day, 1);
  return atTime(day, 9);
}
import { use, aiErrorCopy, isSampleError, copyText, type SampleFn } from "./lib/platform";
import type { CalEvent, Draft, Platform } from "./types";
import { MAIL_WEB_NAME, composeLink, mailWebFor, type MailWeb } from "./lib/handoff";
import { connector } from "./data/connectors";

export function EventModal({ draft, onClose }: { draft: EventDraft; onClose: () => void }) {
  const { s, update } = useStore();
  const t = useT();
  const existing = draft.id ? s.events.find((e) => e.id === draft.id) : undefined;
  const base = useMemo(() => {
    const st = nextWorkingSlot(new Date());
    return { start: st.toISOString(), end: new Date(st.getTime() + 3_600_000).toISOString() };
  }, []);
  const [title, setTitle] = useState(existing?.title ?? draft.title ?? "");
  const [jobId, setJobId] = useState(existing?.jobId ?? draft.jobId ?? s.focusJobId ?? s.jobs[0]?.id);
  const [start, setStart] = useState(toLocalInput(existing?.start ?? draft.start ?? base.start));
  const [end, setEnd] = useState(toLocalInput(existing?.end ?? draft.end ?? base.end));
  const [platform, setPlatform] = useState<Platform>((existing?.platform ?? draft.platform ?? "teams") as Platform);
  const [location, setLocation] = useState(existing?.location ?? "");
  const [confirmDel, setConfirmDel] = useState(false);

  const okDates = !isNaN(Date.parse(start)) && !isNaN(Date.parse(end));
  const sIso = okDates ? new Date(start).toISOString() : "", eIso = okDates ? new Date(end).toISOString() : "";
  const valid = !!title.trim() && okDates && Date.parse(end) > Date.parse(start);
  const clashes = valid ? s.events.filter((e) => e.id !== existing?.id && Date.parse(e.start) < Date.parse(eIso) && Date.parse(sIso) < Date.parse(e.end)) : [];

  const save = () => {
    if (!valid) return;
    const ev: CalEvent = { ...(existing ?? { id: uid("ev"), source: "mosaic" as const, createdBy: "user" as const }),
      title: title.trim(), jobId, start: sIso, end: eIso, platform, location: location.trim() || undefined };
    update((st) => ({ ...st, events: existing ? st.events.map((e) => e.id === ev.id ? ev : e) : [...st.events, ev] }),
      existing ? t("Event updated", "تم تحديث الحدث") : t("Event added", "أُضيف الحدث"));
    onClose();
  };
  const remove = () => {
    update((st) => ({ ...st, events: st.events.filter((e) => e.id !== existing!.id) }), t("Event deleted", "حُذف الحدث"));
    onClose();
  };
  const src = existing && existing.source !== "mosaic" && existing.source !== "import" ? connector(existing.source)?.name : undefined;

  return (
    <Modal title={existing ? t("Event", "الحدث") : t("New event", "حدث جديد")} onClose={onClose}
      foot={<>
        {existing && (confirmDel
          ? <><span className="small muted grow">{t("Delete this event?", "حذف هذا الحدث؟")}</span><button className="btn danger" onClick={remove}>{t("Delete", "احذف")}</button></>
          : <button className="btn ghost danger" onClick={() => setConfirmDel(true)}><Trash2 size={15} />{t("Delete", "احذف")}</button>)}
        <div className="grow" />
        <button className="btn" onClick={onClose}>{t("Cancel", "إلغاء")}</button>
        <button className="btn primary" onClick={save} disabled={!valid}>{existing ? t("Save", "احفظ") : t("Add event", "أضف الحدث")}</button>
      </>}>
      <label className="field"><span>{t("Title", "العنوان")}</span><input id="ev-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. Proposal review with client", "مثال: مراجعة العرض مع العميل")} /></label>
      <div className="row">
        <label className="field grow"><span>{t("Starts", "يبدأ")}</span><input id="ev-start" type="datetime-local" className="input" value={start} onChange={(e) => {
          const len = Date.parse(end) - Date.parse(start);
          setStart(e.target.value);
          if (!isNaN(Date.parse(e.target.value)) && len > 0) setEnd(toLocalInput(new Date(Date.parse(e.target.value) + len).toISOString()));
        }} /></label>
        <label className="field grow"><span>{t("Ends", "ينتهي")}</span><input id="ev-end" type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <div className="row">
        <label className="field grow"><span>{t("Job", "الوظيفة")}</span><JobSelect id="ev-job" value={jobId} onChange={setJobId} /></label>
        <label className="field grow"><span>{t("Where", "المكان")}</span>
          <select id="ev-platform" className="select" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            <option value="teams">Microsoft Teams</option><option value="zoom">Zoom</option>
            <option value="in-person">{t("In person", "حضوري")}</option><option value="none">{t("No location", "بلا مكان")}</option>
          </select></label>
      </div>
      {platform === "in-person" && <label className="field"><span>{t("Location", "الموقع")}</span><input id="ev-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} /></label>}
      {(platform === "teams" || platform === "zoom") && (
        <div className="callout"><span className="mono-badge" style={{ width: 24, height: 24, fontSize: 10 }}>{platform === "teams" ? "Tm" : "Zm"}</span>
          <span className="small">{t(`A ${platform === "teams" ? "Teams" : "Zoom"} link is added when your ${platform === "teams" ? "Microsoft" : "Zoom"} account is connected live. This demo connection adds the meeting to your calendar only.`,
            `يُضاف رابط ${platform === "teams" ? "Teams" : "Zoom"} عند ربط حسابك فعليًا. هذا الاتصال التجريبي يضيف الاجتماع إلى التقويم فقط.`)}</span></div>
      )}
      {clashes.length > 0 && (
        <div className="callout" style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}>
          <AlertTriangle size={16} style={{ color: "var(--danger)", flex: "none" }} />
          <span className="small">{t("Overlaps", "يتداخل مع")}: {clashes.map((c) => `${c.title} (${jobOf(s, c.jobId)?.name}, ${fmtTime(c.start, s.lang)})`).join("; ")}</span>
        </div>
      )}
      {src && <p className="small faint">{t("From", "من")} {src}</p>}
    </Modal>
  );
}

export interface ComposeInit { to?: string; subject?: string; body?: string; jobId?: string; accountId?: string; replyTo?: string; draftId?: string }

export function ComposeModal({ init, onClose }: { init: ComposeInit; onClose: () => void }) {
  const { s, update, toast } = useStore();
  const t = useT();
  const existing = init.draftId ? s.drafts.find((d) => d.id === init.draftId) : undefined;
  const replyOf = init.replyTo ? s.emails.find((e) => e.id === init.replyTo) : undefined;
  const [to, setTo] = useState(existing?.to ?? init.to ?? "");
  const [subject, setSubject] = useState(existing?.subject ?? init.subject ?? "");
  const [body, setBody] = useState(existing?.body ?? init.body ?? "");
  const [jobId, setJobId] = useState(existing?.jobId ?? init.jobId ?? replyOf?.jobId ?? s.focusJobId ?? s.jobs[0]?.id);
  const [instr, setInstr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const accounts = s.connections.filter((c) => ["outlook", "gmail", "yahoo"].includes(c.connectorId));
  const firstValid = [existing?.accountId, init.accountId, replyOf?.accountId].find((id) => accounts.some((a) => a.id === id));
  const [from, setFrom] = useState(firstValid ?? accounts.find((a) => a.jobIds[0] === jobId)?.id ?? accounts.find((a) => a.jobIds.includes(jobId))?.id ?? accounts[0]?.id ?? "");

  async function aiWrite() {
    setErr("");
    const sample = await use<SampleFn>("sample");
    if (!sample) { setErr(t("AI writing works when Mosaic is opened on claude.ai.", "تعمل الكتابة الذكية عند فتح Mosaic على claude.ai.")); return; }
    setBusy(true);
    const job = jobOf(s, jobId);
    const prompt = `Write an email body. Sender: ${job?.role} at ${job?.name}.` +
      (replyOf ? `\nIt replies to this email from ${replyOf.fromName} <${replyOf.from}>, subject "${replyOf.subject}":\n${replyOf.body}` : "") +
      `\nTo: ${to || "(not set)"}. Subject: ${subject || "(write one)"}.` +
      (body ? `\nCurrent draft to improve:\n${body}` : "") +
      `\nInstructions from the sender: ${instr || "clear, polite, concise"}.` +
      `\nWrite in the language of the email being replied to, or ${s.lang === "ar" ? "Arabic" : "English"} if none. ` +
      `Reply with JSON only: {"subject": string, "body": string}. Sign off with "Best regards," and no name.`;
    try {
      const r = await sample.json<{ subject?: string; body?: string }>(prompt, { modelTier: "default", cache: false });
      if (r?.body) setBody(String(r.body));
      if (r?.subject && !subject) setSubject(String(r.subject));
    } catch (e) { if (isSampleError(e) && e.code !== "cancelled") setErr(aiErrorCopy(e.code, s.lang)); }
    finally { setBusy(false); }
  }

  const persist = (status: "draft" | "sent", via?: MailWeb) => {
    const d: Draft = { id: existing?.id ?? uid("dr"), to, subject, body, jobId, accountId: from, replyTo: init.replyTo ?? existing?.replyTo,
      createdBy: existing?.createdBy ?? "user", status, sentAt: status === "sent" ? new Date().toISOString() : undefined, sentVia: via };
    update((st) => ({ ...st, drafts: existing ? st.drafts.map((x) => x.id === d.id ? d : x) : [d, ...st.drafts],
      emails: status === "sent" && d.replyTo ? st.emails.map((e) => e.id === d.replyTo ? { ...e, unread: false } : e) : st.emails }));
    if (status === "draft") toast(t("Draft saved", "حُفظت المسودة"));
    onClose();
  };
  const valid = !!(to.trim() && subject.trim() && body.trim());
  const fromAcc = accounts.find((a) => a.id === from);
  const web = mailWebFor(fromAcc?.connectorId);
  const link = web && valid ? composeLink(web, fromAcc!.account, { to: to.trim(), subject, body }) : null;
  const handOff = async () => {
    if (!web || !link) return;
    // Copy as a fallback: very long messages don't fit in the link, and Yahoo sometimes ignores the body.
    const copied = (!link.bodyInLink || web === "yahoo") ? await copyText(body) : false;
    persist("sent", web);
    toast(copied
      ? t(`Opened in ${MAIL_WEB_NAME[web]}. The message is copied: paste it in, then press Send.`, `فُتحت في ${MAIL_WEB_NAME[web]}. نُسخت الرسالة: الصقها ثم اضغط «إرسال».`)
      : t(`Opened in ${MAIL_WEB_NAME[web]}. Press Send there to deliver it.`, `فُتحت في ${MAIL_WEB_NAME[web]}. اضغط «إرسال» هناك لإيصالها.`));
  };

  return (
    <Modal wide title={replyOf ? t("Reply", "رد") : existing ? t("Draft", "مسودة") : t("New email", "بريد جديد")} onClose={onClose}
      foot={<>
        <button className="btn ghost" onClick={async () => { if (await copyText(`${subject}\n\n${body}`)) toast(t("Copied", "نُسخ")); }}>{t("Copy text", "انسخ النص")}</button>
        <div className="grow" />
        <button className="btn" onClick={() => persist("draft")} disabled={!body.trim()}>{t("Save draft", "احفظ المسودة")}</button>
        {web && link
          ? <a className="btn primary" href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => { void handOff(); }}><Send size={15} />{t(`Send with ${MAIL_WEB_NAME[web]}`, `أرسل عبر ${MAIL_WEB_NAME[web]}`)}<ExternalLink size={13} /></a>
          : <button className="btn primary" disabled><Send size={15} />{web ? t(`Send with ${MAIL_WEB_NAME[web]}`, `أرسل عبر ${MAIL_WEB_NAME[web]}`) : t("Send", "أرسل")}</button>}
      </>}>
      <div className="row">
        <label className="field grow"><span>{t("From", "من")}</span>
          <select id="mail-from" className="select" value={from} onChange={(e) => { setFrom(e.target.value); const a = accounts.find((x) => x.id === e.target.value); if (a?.jobIds[0]) setJobId(a.jobIds[0]); }}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.account}</option>)}
          </select></label>
        <label className="field" style={{ minWidth: 180 }}><span>{t("Job", "الوظيفة")}</span><JobSelect id="mail-job" value={jobId} onChange={setJobId} /></label>
      </div>
      <label className="field"><span>{t("To", "إلى")}</span><input id="mail-to" className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.bh" /></label>
      <label className="field"><span>{t("Subject", "الموضوع")}</span><input id="mail-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label className="field"><span>{t("Message", "الرسالة")}</span><textarea id="mail-body" className="textarea" style={{ minHeight: 200 }} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <div className="callout" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <Sparkles size={16} style={{ color: "var(--accent)", flex: "none" }} />
        <input id="mail-instr" className="input grow" style={{ minWidth: 160 }} value={instr} onChange={(e) => setInstr(e.target.value)}
          placeholder={replyOf ? t("e.g. Agree, offer Wednesday 2 pm", "مثال: وافق واقترح الأربعاء 2 ظهرًا") : t("Tell the AI what to write", "أخبر المساعد بما يكتب")} />
        <button className="btn primary" onClick={aiWrite} disabled={busy}>{body ? t("Rewrite", "أعد الكتابة") : t("Write it", "اكتبها")}</button>
        {busy && <Thinking label={t("Writing…", "أكتب…")} />}
      </div>
      {err && <p className="small" style={{ color: "var(--danger)" }}>{err}</p>}
      {replyOf && <details><summary className="small muted" style={{ cursor: "pointer" }}>{t("Original message", "الرسالة الأصلية")}</summary><p className="small muted" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{replyOf.body}</p></details>}
    </Modal>
  );
}

