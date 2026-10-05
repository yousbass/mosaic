import React, { useRef, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { useStore } from "../store";
import { JobChip, JobSelect, Modal, jobOf, useT } from "../ui";
import { fmtDay, relDays, uid } from "../lib/time";
import { importSalesforceCsv, toCsv } from "../lib/importers";
import { saveFile } from "../lib/platform";
import type { Task, TaskStatus } from "../types";

export function TasksView() {
  const { s, update, toast } = useStore();
  const t = useT();
  const [job, setJob] = useState(s.focusJobId ?? "");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [adding, setAdding] = useState(false);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const cols: { id: TaskStatus; en: string; ar: string }[] = [
    { id: "todo", en: "To do", ar: "للعمل" }, { id: "doing", en: "In progress", ar: "قيد التنفيذ" }, { id: "done", en: "Done this week", ar: "أُنجز هذا الأسبوع" }];
  const keep = (x: Task) => !job || x.jobId === job;
  const setStatus = (id: string, status: TaskStatus) =>
    update((st) => ({ ...st, tasks: st.tasks.map((k) => k.id === id ? { ...k, status, doneAt: status === "done" ? new Date().toISOString() : undefined } : k) }));

  const exportCsv = async () => {
    const rows = [["Subject", "Job", "Status", "Priority", "Due Date", "Source"],
      ...s.tasks.filter(keep).map((k) => [k.title, jobOf(s, k.jobId)?.name, k.status === "done" ? "Completed" : k.status === "doing" ? "In Progress" : "Not Started", k.priority, k.due, k.source])];
    if (!(await saveFile("mosaic-tasks.csv", toCsv(rows)))) toast(t("Saving files isn't available in this view.", "حفظ الملفات غير متاح هنا."));
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <div style={{ width: 200 }}><JobSelect id="tasks-job" value={job} onChange={setJob} allowAll={t("All jobs", "كل الوظائف")} /></div>
        <div className="grow" />
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} />{t("Upload Salesforce CSV", "ارفع ملف Salesforce")}</button>
        <input ref={fileRef} id="sf-file" type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv({ name: f.name, text: await f.text() }); e.target.value = ""; }} />
        <button className="btn" onClick={exportCsv}><Download size={15} />{t("Download CSV", "نزّل CSV")}</button>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={15} />{t("New task", "مهمة جديدة")}</button>
      </div>
      <div className="board">
        {cols.map((c) => {
          const list = s.tasks.filter(keep).filter((k) => k.status === c.id && (c.id !== "done" || (k.doneAt ?? "") >= weekAgo))
            .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
          return (
            <div key={c.id} className={"col" + (over === c.id ? " drag-over" : "")}
              onDragOver={(e) => { e.preventDefault(); setOver(c.id); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); if (drag) setStatus(drag, c.id); setDrag(null); setOver(null); }}>
              <h3>{t(c.en, c.ar)} <span className="num">{list.length}</span></h3>
              {list.map((k) => {
                const d = k.due ? relDays(k.due, now) : undefined;
                return (
                  <div key={k.id} className="tcard" data-j={jobOf(s, k.jobId)?.color} draggable onDragStart={() => setDrag(k.id)} onDragEnd={() => setDrag(null)}>
                    <span className="vbar" />
                    <button className="check" role="checkbox" aria-checked={k.status === "done"} aria-label={t("Done", "تم")}
                      onClick={() => setStatus(k.id, k.status === "done" ? "todo" : "done")}>{k.status === "done" ? "✓" : ""}</button>
                    <div className="li-main">
                      <div className={k.status === "done" ? "done-text" : ""} style={{ fontWeight: 550 }}>{k.title}</div>
                      <div className="row small" style={{ gap: 6, marginTop: 4 }}>
                        <JobChip jobId={k.jobId} />
                        {k.source === "salesforce" && <span className="chip">Salesforce</span>}
                        {k.priority === "high" && k.status !== "done" && <span className="chip warn">{t("High", "عالية")}</span>}
                        {d !== undefined && k.status !== "done" && <span className={"chip" + (d < 0 ? " action" : "")}>{d < 0 ? t(`${-d}d overdue`, `متأخرة ${-d} يوم`) : fmtDay(k.due!, s.lang)}</span>}
                        <select id={"st-" + k.id} className="mini-select" aria-label={t("Move to", "انقل إلى")}
                          value={k.status} onChange={(e) => setStatus(k.id, e.target.value as TaskStatus)}>
                          {cols.map((cc) => <option key={cc.id} value={cc.id}>{t(cc.en, cc.ar)}</option>)}
                        </select>
                      </div>
                    </div>
                    <button className="icon-btn sm" aria-label={t("Delete task", "احذف المهمة")} onClick={() => update((st) => ({ ...st, tasks: st.tasks.filter((x) => x.id !== k.id) }), t("Task deleted", "حُذفت المهمة"))}><Trash2 size={13} /></button>
                  </div>
                );
              })}
              {list.length === 0 && <p className="empty">{t("Drop tasks here", "أفلت المهام هنا")}</p>}
            </div>
          );
        })}
      </div>
      {adding && <NewTask jobId={job || undefined} onClose={() => setAdding(false)} />}
      {csv && <SfImport file={csv} onClose={() => setCsv(null)} />}
    </div>
  );
}

function NewTask({ jobId, onClose }: { jobId?: string; onClose: () => void }) {
  const { s, update } = useStore();
  const t = useT();
  const [title, setTitle] = useState("");
  const [job, setJob] = useState(jobId ?? s.jobs[0]?.id);
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const save = () => {
    if (!title.trim()) return;
    update((st) => ({ ...st, tasks: [{ id: uid("tk"), title: title.trim(), jobId: job, due: due || undefined, priority, status: "todo", source: "mosaic", createdBy: "user" }, ...st.tasks] }), t("Task added", "أُضيفت المهمة"));
    onClose();
  };
  return (
    <Modal title={t("New task", "مهمة جديدة")} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>{t("Cancel", "إلغاء")}</button><button className="btn primary" onClick={save} disabled={!title.trim()}>{t("Add task", "أضف المهمة")}</button></>}>
      <label className="field"><span>{t("Task", "المهمة")}</span><input id="nt-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} /></label>
      <div className="row">
        <label className="field grow"><span>{t("Job", "الوظيفة")}</span><JobSelect id="nt-job" value={job} onChange={setJob} /></label>
        <label className="field grow"><span>{t("Due", "الاستحقاق")}</span><input id="nt-due" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="field grow"><span>{t("Priority", "الأولوية")}</span>
          <select id="nt-pri" className="select" value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])}>
            <option value="high">{t("High", "عالية")}</option><option value="normal">{t("Normal", "عادية")}</option><option value="low">{t("Low", "منخفضة")}</option>
          </select></label>
      </div>
    </Modal>
  );
}

function SfImport({ file, onClose }: { file: { name: string; text: string }; onClose: () => void }) {
  const { s, update } = useStore();
  const t = useT();
  const sfJob = s.connections.find((c) => c.connectorId === "salesforce")?.jobIds[0] ?? s.jobs[0]?.id;
  const [job, setJob] = useState(sfJob);
  const r = importSalesforceCsv(file.text, job);
  const total = r.deals.length + r.tasks.length;
  return (
    <Modal title={t("Import from Salesforce", "استيراد من Salesforce")} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>{t("Cancel", "إلغاء")}</button>
        <button className="btn primary" disabled={!total} onClick={() => {
          update((st) => ({ ...st, deals: [...st.deals, ...r.deals], tasks: [...r.tasks, ...st.tasks] }), t(`Imported ${total} records`, `استُورد ${total} سجل`));
          onClose();
        }}>{t("Import", "استيراد")}</button></>}>
      <p className="small muted">{file.name}</p>
      {total === 0
        ? <p className="small">{t("No opportunities or tasks found. Export a Salesforce report as CSV with columns such as Opportunity Name, Stage, Amount, Close Date — or Subject, Due Date, Status, Priority.",
            "لم يُعثر على فرص أو مهام. صدّر تقريرًا من Salesforce بصيغة CSV يحتوي أعمدة مثل Opportunity Name وStage وAmount وClose Date، أو Subject وDue Date وStatus وPriority.")}</p>
        : <p>{t(`Found ${r.deals.length} opportunities and ${r.tasks.length} tasks.`, `وُجدت ${r.deals.length} فرصة و${r.tasks.length} مهمة.`)}</p>}
      <label className="field"><span>{t("Job", "الوظيفة")}</span><JobSelect id="sf-job" value={job} onChange={setJob} /></label>
    </Modal>
  );
}
