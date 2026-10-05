import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { JobSelect, JobTile, Modal, jobOf, useT } from "../ui";
import { uid } from "../lib/time";
import type { AppState, Job } from "../types";

const COLORS = ["j1", "j2", "j3", "j4", "j5", "j6"];

export function SettingsView() {
  const { s, update, saveMode, resetDemo } = useStore();
  const t = useT();
  const [removing, setRemoving] = useState<Job | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const setJob = (id: string, patch: Partial<Job>) =>
    update((st) => ({ ...st, jobs: st.jobs.map((j) => j.id === id ? { ...j, ...patch } : j),
      pages: patch.name ? st.pages.map((p) => p.jobId === id ? { ...p, name: patch.name! } : p) : st.pages }));
  const addJob = () => {
    const id = uid("j");
    const used = new Set(s.jobs.map((j) => j.color));
    const color = COLORS.find((c) => !used.has(c)) ?? "j1";
    update((st) => ({ ...st, jobs: [...st.jobs, { id, name: t("New job", "وظيفة جديدة"), role: "", color, weeklyHours: 8 }],
      pages: [...st.pages, { id: "pg_" + id, name: t("New job", "وظيفة جديدة"), jobId: id, widgets: [{ id: uid("w"), type: "agenda", size: "m" }, { id: uid("w"), type: "tasks", size: "m" }, { id: uid("w"), type: "inbox", size: "m" }] }] }));
  };
  const section = (title: string, desc: string, body: React.ReactNode) => (
    <section className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div><h2 className="section-title">{title}</h2>{desc && <p className="small muted" style={{ marginTop: 4 }}>{desc}</p>}</div>
      {body}
    </section>
  );
  return (
    <div className="stack" style={{ maxWidth: 920, gap: 20 }}>
      {section(t("Your jobs", "وظائفك"), t("Each job gets a colour, a page, and a weekly hour target used in reports.", "لكل وظيفة لون وصفحة وهدف ساعات أسبوعي يُستخدم في التقارير."), <>
        {s.jobs.map((j) => (
          <div key={j.id} data-j={j.color} style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <JobTile job={j} size={38} />
              <label className="field grow" style={{ minWidth: 150 }}><span>{t("Name", "الاسم")}</span><input id={"jn-" + j.id} className="input" value={j.name} onChange={(e) => setJob(j.id, { name: e.target.value })} /></label>
              <label className="field grow" style={{ minWidth: 150 }}><span>{t("Your role", "دورك")}</span><input id={"jr-" + j.id} className="input" value={j.role} onChange={(e) => setJob(j.id, { role: e.target.value })} /></label>
              <label className="field" style={{ width: 110 }}><span>{t("Hours / week", "ساعات/أسبوع")}</span><input id={"jh-" + j.id} type="number" min={0} max={80} className="input" value={j.weeklyHours} onChange={(e) => setJob(j.id, { weeklyHours: Math.max(0, Math.min(80, Number(e.target.value) || 0)) })} /></label>
              <div className="field"><span>{t("Colour", "اللون")}</span>
                <div className="swatches">{COLORS.map((c) => <button key={c} className="swatch" data-j={c} aria-pressed={j.color === c} aria-label={t("Colour", "اللون") + " " + c} onClick={() => setJob(j.id, { color: c })} />)}</div></div>
              <button className="icon-btn" disabled={s.jobs.length < 2} aria-label={t("Remove job", "احذف الوظيفة") + " " + j.name} onClick={() => setRemoving(j)}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        <div><button className="btn" onClick={addJob} disabled={s.jobs.length >= 6}><Plus size={15} />{t("Add a job", "أضف وظيفة")}</button></div>
      </>)}
      {section(t("Mail filing rules", "قواعد تصنيف البريد"), t("Mail from these senders always goes to the chosen job. Add rules from any email in the inbox.", "البريد من هؤلاء المرسلين يذهب دائمًا إلى الوظيفة المختارة. أضف القواعد من أي رسالة في البريد."), <div className="list">
        {s.rules.map((r) => (
          <div className="li" key={r.id} style={{ alignItems: "center" }}>
            <span className="mono grow">{r.match}</span>
            <span className="chip job" data-j={jobOf(s, r.jobId)?.color}>{jobOf(s, r.jobId)?.name}</span>
            <button className="icon-btn sm" aria-label={t("Delete rule", "احذف القاعدة")} onClick={() => update((st) => ({ ...st, rules: st.rules.filter((x) => x.id !== r.id) }), t("Rule deleted", "حُذفت القاعدة"))}><Trash2 size={13} /></button>
          </div>
        ))}
        {s.rules.length === 0 && <p className="empty">{t("No rules yet.", "لا قواعد بعد.")}</p>}
      </div>)}
      {section(t("Language", "اللغة"), "", <div className="seg" style={{ alignSelf: "flex-start" }}><button aria-pressed={s.lang === "en"} onClick={() => update((st) => ({ ...st, lang: "en" }))}>English</button><button aria-pressed={s.lang === "ar"} onClick={() => update((st) => ({ ...st, lang: "ar" }))}>العربية</button></div>)}
      {section(t("Your data", "بياناتك"), saveMode === "account" ? t("Saved privately to your claude.ai account for this page. Other people who open the link see their own copy, not yours.", "تُحفظ بشكل خاص في حسابك على claude.ai لهذه الصفحة. من يفتح الرابط يرى نسخته الخاصة وليس نسختك.")
          : saveMode === "browser" ? t("Saved in this browser only.", "تُحفظ في هذا المتصفح فقط.")
          : t("Not saved: changes last until you close the page.", "غير محفوظة: تبقى التغييرات حتى إغلاق الصفحة."),
        <div className="row">
          {confirmReset
            ? <><span className="small">{t("Replace everything with the original sample data?", "استبدال كل شيء بالبيانات التجريبية الأصلية؟")}</span>
              <button className="btn danger-fill" onClick={() => { resetDemo(); setConfirmReset(false); }}>{t("Reset", "إعادة الضبط")}</button>
              <button className="btn" onClick={() => setConfirmReset(false)}>{t("Cancel", "إلغاء")}</button></>
            : <button className="btn" onClick={() => setConfirmReset(true)}>{t("Reset sample data", "إعادة ضبط البيانات التجريبية")}</button>}
        </div>)}
      {removing && <RemoveJob job={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}

function RemoveJob({ job, onClose }: { job: Job; onClose: () => void }) {
  const { s, update } = useStore();
  const t = useT();
  const [target, setTarget] = useState(s.jobs.find((j) => j.id !== job.id)!.id);
  const move = <T extends { jobId?: string }>(xs: T[]) => xs.map((x) => x.jobId === job.id ? { ...x, jobId: target } : x);
  return (
    <Modal title={t(`Remove ${job.name}?`, `حذف ${job.name}؟`)} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>{t("Cancel", "إلغاء")}</button>
        <button className="btn danger" onClick={() => {
          update((st: AppState) => ({ ...st, jobs: st.jobs.filter((j) => j.id !== job.id), pages: st.pages.filter((p) => p.jobId !== job.id),
            events: move(st.events), emails: move(st.emails), drafts: move(st.drafts), tasks: move(st.tasks), deals: move(st.deals), posts: move(st.posts),
            notes: move(st.notes), files: move(st.files), chats: move(st.chats), rules: move(st.rules), tenders: move(st.tenders),
            connections: st.connections.map((c) => ({ ...c, jobIds: c.jobIds.filter((x) => x !== job.id).length ? c.jobIds.filter((x) => x !== job.id) : [target] })),
            focusJobId: st.focusJobId === job.id ? undefined : st.focusJobId }), t("Job removed", "حُذفت الوظيفة"));
          onClose();
        }}>{t("Remove job", "احذف الوظيفة")}</button></>}>
      <p className="small">{t("Its page is deleted. Its meetings, mail, tasks and notes move to:", "تُحذف صفحتها. تنتقل اجتماعاتها وبريدها ومهامها وملاحظاتها إلى:")}</p>
      <JobSelect id="rm-target" value={target} onChange={setTarget} exclude={job.id} />
    </Modal>
  );
}

