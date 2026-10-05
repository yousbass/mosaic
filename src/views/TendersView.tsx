import React, { useState } from "react";
import { Bookmark, BookmarkCheck, ClipboardPaste, ListChecks, Plus, X, CalendarPlus } from "lucide-react";
import { useStore } from "../store";
import { JobChip, JobSelect, Modal, SampleChip, Thinking, useT } from "../ui";
import { fmtDay, relDays, uid } from "../lib/time";
import { fmtBhd } from "../widgets/tools";
import { use, aiErrorCopy, isSampleError, type SampleFn } from "../lib/platform";
import type { Tender } from "../types";

export function TendersView() {
  const { s, update, toast } = useStore();
  const t = useT();
  const [kw, setKw] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [paste, setPaste] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const now = new Date();

  const score = (x: Tender) => s.tenderKeywords.filter((k) => (x.title + " " + x.summary + " " + x.category).toLowerCase().includes(k.toLowerCase())).length;
  const list = s.tenders.filter((x) => relDays(x.deadline, now) >= 0 && (!onlySaved || x.saved))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  async function checklist(x: Tender) {
    setErr("");
    const sample = await use<SampleFn>("sample");
    if (!sample) { setErr(t("The checklist works when Mosaic is opened on claude.ai.", "تعمل القائمة عند فتح Mosaic على claude.ai.")); return; }
    setBusyId(x.id);
    try {
      const r = await sample.json<string[]>(
        `From this tender notice, list what a bidder needs to prepare to apply: documents, qualifications, team, guarantees, deadlines. ` +
        `6 to 10 short items, most important first. ${s.lang === "ar" ? "Write the items in Arabic." : ""} Reply with a JSON array of strings only.\n\n` +
        `Title: ${x.title}\nEntity: ${x.entity}\nReference: ${x.ref}\nDeadline: ${x.deadline}\nValue: ${x.valueBhd ?? "not stated"} BHD\nNotice: ${x.summary}`,
        { modelTier: "default", cache: { gcTime: 24 * 3_600_000 } });
      if (!Array.isArray(r)) throw { code: "invalid_json" };
      update((st) => ({ ...st, tenders: st.tenders.map((y) => y.id === x.id ? { ...y, checklist: r.map(String).slice(0, 12) } : y) }));
    } catch (e) { if (isSampleError(e) && e.code !== "cancelled") setErr(aiErrorCopy(e.code, s.lang)); }
    finally { setBusyId(null); }
  }

  const addKw = (e: React.FormEvent) => {
    e.preventDefault();
    const k = kw.trim().toLowerCase();
    if (k && !s.tenderKeywords.includes(k)) update((st) => ({ ...st, tenderKeywords: [...st.tenderKeywords, k] }));
    setKw("");
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="panel" style={{ padding: 14 }}>
        <div className="row" style={{ marginBottom: 8 }}><b>{t("Keywords you watch", "الكلمات المفتاحية المراقبة")}</b><SampleChip /><div className="grow" />
          <button className="btn" onClick={() => setPaste(true)}><ClipboardPaste size={15} />{t("Paste a tender notice", "الصق إعلان مناقصة")}</button></div>
        <div className="row">
          {s.tenderKeywords.map((k) => (
            <span key={k} className="chip" style={{ fontSize: 12.5, padding: "3px 6px 3px 10px" }}>{k}
              <button className="icon-btn sm" style={{ width: 18, height: 18 }} aria-label={t("Remove keyword", "احذف الكلمة") + " " + k}
                onClick={() => update((st) => ({ ...st, tenderKeywords: st.tenderKeywords.filter((x) => x !== k) }))}><X size={12} /></button></span>
          ))}
          <form onSubmit={addKw} className="row"><input id="kw-new" className="input" style={{ width: 180 }} value={kw} onChange={(e) => setKw(e.target.value)} placeholder={t("Add keyword", "أضف كلمة")} />
            <button className="btn sm" type="submit"><Plus size={14} /></button></form>
        </div>
        <p className="small faint" style={{ marginTop: 8 }}>{t("When the Tender Board source is connected live, new notices matching these keywords appear here each morning.", "عند ربط مصدر مجلس المناقصات فعليًا، تظهر الإعلانات المطابقة هنا كل صباح.")}</p>
      </div>
      <div className="row">
        <div className="seg"><button aria-pressed={!onlySaved} onClick={() => setOnlySaved(false)}>{t("Open tenders", "المناقصات المفتوحة")}</button><button aria-pressed={onlySaved} onClick={() => setOnlySaved(true)}>{t("Saved", "المحفوظة")}</button></div>
        {err && <span className="small" style={{ color: "var(--danger)" }}>{err}</span>}
      </div>
      <div className="panel">
        {list.map((x) => {
          const d = relDays(x.deadline, now);
          const sc = score(x);
          return (
            <div className="tender" key={x.id}>
              <div className={"countdown" + (d <= 3 ? " urgent" : "")}><b className="num">{d}</b><span>{d === 1 ? t("day left", "يوم متبقٍ") : t("days left", "أيام متبقية")}</span></div>
              <div className="li-main">
                <div className="row small muted" style={{ gap: 8 }}><span className="mono">{x.ref}</span><span>{x.entity}</span>
                  {sc > 0 && <span className="chip ok">{t(`${sc} keyword match${sc > 1 ? "es" : ""}`, `${sc} تطابق`)}</span>}{x.jobId && <JobChip jobId={x.jobId} />}</div>
                <h3 style={{ fontSize: 15.5, margin: "4px 0", fontWeight: 700 }} dir="auto">{x.title}</h3>
                <p className="small muted" style={{ maxWidth: "75ch" }}>{x.summary}</p>
                <div className="row small" style={{ marginTop: 6, gap: 10 }}>
                  <span>{t("Closes", "يغلق")} <b>{fmtDay(x.deadline, s.lang, { weekday: "short", day: "numeric", month: "long" })}</b></span>
                  {x.valueBhd && <span>{t("Estimated value", "القيمة التقديرية")} <b className="num">{fmtBhd(x.valueBhd, s.lang)}</b></span>}
                  <span className="faint">{x.source}</span>
                </div>
                {x.checklist && (
                  <div className="callout" style={{ marginTop: 10, display: "block" }}>
                    <b className="small">{t("What you need to apply", "ما تحتاجه للتقديم")}</b>
                    <ol className="tlist small">{x.checklist.map((c, i) => <li key={i}>{c}</li>)}</ol>
                  </div>
                )}
                {busyId === x.id && <div style={{ marginTop: 8 }}><Thinking label={t("Reading the notice…", "أقرأ الإعلان…")} /></div>}
              </div>
              <div className="t-actions row" style={{ gap: 4, flexWrap: "nowrap", alignItems: "flex-start" }}>
                <button className="btn sm soft" onClick={() => checklist(x)} disabled={busyId === x.id}><ListChecks size={14} />{x.checklist ? t("Redo checklist", "أعد القائمة") : t("What do I need?", "ماذا أحتاج؟")}</button>
                <button className="icon-btn sm" aria-pressed={!!x.saved} aria-label={x.saved ? t("Saved", "محفوظة") : t("Save", "احفظ")} title={x.saved ? t("Saved", "محفوظة") : t("Save", "احفظ")}
                  style={x.saved ? { color: "var(--primary)" } : undefined}
                  onClick={() => update((st) => ({ ...st, tenders: st.tenders.map((y) => y.id === x.id ? { ...y, saved: !y.saved } : y) }))}>
                  {x.saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}</button>
                <button className="icon-btn sm" aria-label={t("Add the deadline to my tasks", "أضف الموعد إلى مهامي")} title={t("Add the deadline to my tasks", "أضف الموعد إلى مهامي")} onClick={() => {
                  const job = x.jobId ?? s.connections.find((c) => c.connectorId === "tenderboard")?.jobIds[0] ?? s.jobs[0].id;
                  update((st) => ({ ...st, tasks: [{ id: uid("tk"), title: `${t("Submit bid", "قدّم العطاء")}: ${x.title}`, jobId: job, due: x.deadline, status: "todo", source: "mosaic", priority: "high", createdBy: "user" }, ...st.tasks],
                    tenders: st.tenders.map((y) => y.id === x.id ? { ...y, saved: true, jobId: job } : y) }));
                  toast(t("Deadline added to your tasks", "أُضيف الموعد إلى مهامك"));
                }}><CalendarPlus size={16} /></button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <p className="empty" style={{ padding: 30 }}>{t("No open tenders here.", "لا مناقصات مفتوحة هنا.")}</p>}
      </div>
      {paste && <PasteTender onClose={() => setPaste(false)} />}
    </div>
  );
}

function PasteTender({ onClose }: { onClose: () => void }) {
  const { s, update } = useStore();
  const t = useT();
  const [text, setText] = useState("");
  const [job, setJob] = useState(s.jobs[0]?.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setErr("");
    const sample = await use<SampleFn>("sample");
    if (!sample) { setErr(t("Reading a notice works when Mosaic is opened on claude.ai.", "تعمل قراءة الإعلان عند فتح Mosaic على claude.ai.")); return; }
    setBusy(true);
    try {
      const r = await sample.json<{ title?: string; entity?: string; ref?: string; deadline?: string; value_bhd?: number; category?: string; summary?: string; checklist?: string[] }>(
        `Extract the key facts from this tender notice. Reply with JSON only: {"title": string, "entity": string, "ref": string, "deadline": "YYYY-MM-DD", "value_bhd": number|null, "category": string, "summary": string (2-3 sentences), "checklist": string[] (6-10 things a bidder must prepare)}. ` +
        `${s.lang === "ar" ? "Write summary and checklist in Arabic." : "Write summary and checklist in English."} If a field is missing, use an empty string.\n\n${text.slice(0, 20000)}`,
        { modelTier: "default", cache: false });
      if (!r || typeof r !== "object") throw { code: "invalid_json" };
      const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(r.deadline)) ? String(r.deadline) : new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
      update((st) => ({ ...st, tenders: [{ id: uid("t"), ref: String(r.ref || "—"), title: String(r.title || t("Pasted tender", "مناقصة ملصقة")), entity: String(r.entity || ""),
        category: String(r.category || ""), deadline, valueBhd: typeof r.value_bhd === "number" ? r.value_bhd : undefined, source: t("Pasted", "ملصق"),
        summary: String(r.summary || ""), checklist: Array.isArray(r.checklist) ? r.checklist.map(String) : undefined, saved: true, jobId: job }, ...st.tenders] }), t("Tender added", "أُضيفت المناقصة"));
      onClose();
    } catch (e) { if (isSampleError(e) && e.code !== "cancelled") setErr(aiErrorCopy(e.code, s.lang)); }
    finally { setBusy(false); }
  }
  return (
    <Modal wide title={t("Paste a tender notice", "الصق إعلان مناقصة")} onClose={onClose}
      foot={<>{busy && <Thinking label={t("Reading…", "أقرأ…")} />}<div className="grow" /><button className="btn" onClick={onClose}>{t("Cancel", "إلغاء")}</button>
        <button className="btn primary" onClick={go} disabled={busy || text.trim().length < 40}>{t("Read it and add", "اقرأه وأضفه")}</button></>}>
      <p className="small muted">{t("Paste the text of a notice from the Tender Board or any portal, in Arabic or English. Mosaic pulls out the deadline, value and what you need to apply.", "الصق نص إعلان من مجلس المناقصات أو أي بوابة، بالعربية أو الإنجليزية. يستخرج Mosaic الموعد والقيمة وما تحتاجه للتقديم.")}</p>
      <textarea id="tender-paste" className="textarea" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} />
      <label className="field"><span>{t("Job", "الوظيفة")}</span><JobSelect id="tender-job" value={job} onChange={setJob} /></label>
      {err && <p className="small" style={{ color: "var(--danger)" }}>{err}</p>}
    </Modal>
  );
}
