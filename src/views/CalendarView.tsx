import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Upload } from "lucide-react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { JobSelect, Modal, jobOf, useT } from "../ui";
import { findClashes } from "../lib/logic";
import { addDays, fmtDay, fmtTime, isWorkday, sameDay, startOfWeek, atTime } from "../lib/time";
import { parseIcs } from "../lib/importers";

const H0 = 7, H1 = 21, ROW = 52;

function useNarrow() {
  const q = "(max-width: 640px)";
  const [n, setN] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setN(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return n;
}

export function CalendarView() {
  const { s, update } = useStore();
  const nav = useNav();
  const t = useT();
  const [offset, setOffset] = useState(0);
  const [weekend, setWeekend] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set(s.focusJobId ? s.jobs.filter((j) => j.id !== s.focusJobId).map((j) => j.id) : []));
  const [importText, setImportText] = useState<{ name: string; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const ws = addDays(startOfWeek(now), offset * 7);
  const narrow = useNarrow();
  const [dayIdx, setDayIdx] = useState(() => Math.min(6, Math.max(0, now.getDay())));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => weekend || isWorkday(d));
  const days = narrow ? [weekDays.find((d) => d.getDay() === dayIdx) ?? weekDays[0]] : weekDays;
  const clashes = useMemo(() => findClashes(s.events, ws, addDays(ws, 7)).filter((c) => c.crossJob), [s.events, offset]); // eslint-disable-line react-hooks/exhaustive-deps
  const clashIds = new Set(clashes.flatMap((c) => [c.a.id, c.b.id]));
  const clashCount = clashes.length;

  // Lay out overlapping events side by side.
  function layout(day: Date) {
    const evs = s.events.filter((e) => sameDay(new Date(e.start), day)).sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
    const cols: string[][] = [];
    const place = new Map<string, { col: number; cols: number }>();
    let group: string[] = [], groupEnd = 0;
    const flush = () => { const n = Math.max(1, ...group.map((id) => place.get(id)!.col + 1)); group.forEach((id) => (place.get(id)!.cols = n)); group = []; cols.length = 0; };
    for (const e of evs) {
      if (Date.parse(e.start) >= groupEnd) flush();
      let c = cols.findIndex((col) => Date.parse(s.events.find((x) => x.id === col[col.length - 1])!.end) <= Date.parse(e.start));
      if (c < 0) { c = cols.length; cols.push([]); }
      cols[c].push(e.id);
      place.set(e.id, { col: c, cols: 1 });
      group.push(e.id);
      groupEnd = Math.max(groupEnd, Date.parse(e.end));
    }
    flush();
    return evs.map((e) => ({ e, ...place.get(e.id)! }));
  }

  const onFile = async (f?: File) => {
    if (!f) return;
    setImportText({ name: f.name, text: await f.text() });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label={t("Previous week", "الأسبوع السابق")}><ChevronLeft size={18} className="flip" /></button>
          <button className="btn sm" onClick={() => setOffset(0)}>{t("This week", "هذا الأسبوع")}</button>
          <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label={t("Next week", "الأسبوع التالي")}><ChevronRight size={18} className="flip" /></button>
        </div>
        <b>{fmtDay(ws, s.lang, { day: "numeric", month: "long" })} – {fmtDay(addDays(ws, 6), s.lang, { day: "numeric", month: "long", year: "numeric" })}</b>
        <div className="grow" />
        <label className="row small muted" style={{ gap: 6 }}><input id="cal-weekend" type="checkbox" checked={weekend} onChange={(e) => setWeekend(e.target.checked)} />{t("Show Fri & Sat", "إظهار الجمعة والسبت")}</label>
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} />{t("Import .ics", "استيراد ‎.ics")}</button>
        <input ref={fileRef} id="ics-file" type="file" accept=".ics,text/calendar" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn primary" onClick={() => nav.editEvent({})}><Plus size={15} />{t("New event", "حدث جديد")}</button>
      </div>
      <div className="legend" role="group" aria-label={t("Show jobs", "إظهار الوظائف")}>
        {s.jobs.map((j) => (
          <button key={j.id} aria-pressed={!hidden.has(j.id)} onClick={() => { const n = new Set(hidden); n.has(j.id) ? n.delete(j.id) : n.add(j.id); setHidden(n); }}>
            <i className="dot" data-j={j.color} />{j.name}
          </button>
        ))}
        {clashCount > 0 && <span className="chip action" style={{ alignSelf: "center" }}>{t(`${clashCount} ${clashCount === 1 ? "clash" : "clashes"} between jobs this week`, `${clashCount} تعارض بين الوظائف هذا الأسبوع`)}</span>}
      </div>
      {narrow && (
        <div className="seg" role="tablist" aria-label={t("Day", "اليوم")} style={{ alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" }}>
          {weekDays.map((d) => (
            <button key={d.toISOString()} role="tab" aria-selected={d.getDay() === days[0].getDay()} aria-pressed={d.getDay() === days[0].getDay()} onClick={() => setDayIdx(d.getDay())}>
              {fmtDay(d, s.lang, { weekday: "short" })} <span className="num">{d.getDate()}</span>
            </button>
          ))}
        </div>
      )}
      <div className="cal-wrap">
        <div className="cal" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, minWidth: narrow ? 0 : undefined }}>
          <div className="cal-hcell" />
          {days.map((d) => (
            <div key={d.toISOString()} className={"cal-hcell" + (sameDay(d, now) ? " today" : "")}>
              <span className={isWorkday(d) ? "" : "wkend"}>{fmtDay(d, s.lang, { weekday: "short" })}</span>
              <b className="num">{d.getDate()}</b>
            </div>
          ))}
          <div className="cal-hours">
            {Array.from({ length: H1 - H0 }, (_, i) => <div className="cal-hour" key={i}>{String(H0 + i).padStart(2, "0")}:00</div>)}
          </div>
          {days.map((d) => (
            <div key={d.toISOString()} className={"cal-col" + (isWorkday(d) ? "" : " weekend")} style={{ height: (H1 - H0) * ROW }}
              onDoubleClick={(e) => {
                const y = e.nativeEvent.offsetY;
                if (e.target !== e.currentTarget) return;
                const h = H0 + Math.floor(y / ROW * 2) / 2;
                const st = atTime(d, Math.floor(h), (h % 1) * 60);
                nav.editEvent({ start: st.toISOString(), end: new Date(st.getTime() + 3_600_000).toISOString() });
              }}
              title={t("Double-click to add an event", "انقر مرتين لإضافة حدث")}>
              {sameDay(d, now) && now.getHours() >= H0 && now.getHours() < H1 &&
                <div className="now-line" style={{ top: ((now.getHours() - H0) + now.getMinutes() / 60) * ROW }} aria-hidden="true" />}
              {layout(d).map(({ e, col, cols }) => {
                const st = new Date(e.start), en = new Date(e.end);
                const top = Math.max(0, (st.getHours() - H0 + st.getMinutes() / 60) * ROW);
                const height = Math.max(22, ((en.getTime() - st.getTime()) / 3_600_000) * ROW - 2);
                const j = jobOf(s, e.jobId);
                const w = 100 / cols;
                return (
                  <button key={e.id} data-j={j?.color} className={"cal-ev" + (clashIds.has(e.id) ? " clash" : "") + (hidden.has(e.jobId) ? " dim" : "")}
                    style={{ top, height, insetInlineStart: `calc(${col * w}% + 3px)`, width: `calc(${w}% - 6px)`, insetInlineEnd: "auto" }}
                    onClick={() => nav.editEvent({ id: e.id })} title={`${e.title} · ${j?.name}`}
                    aria-label={`${e.title}, ${j?.name}, ${fmtTime(e.start, s.lang)}–${fmtTime(e.end, s.lang)}${clashIds.has(e.id) ? ", " + t("clash", "تعارض") : ""}`}>
                    <b>{e.title}</b>
                    <span>{fmtTime(e.start, s.lang)}–{fmtTime(e.end, s.lang)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="small faint">{t("Red outline: meetings from different jobs that overlap. Double-click an empty slot to add an event.", "الإطار الأحمر: اجتماعات متداخلة من وظائف مختلفة. انقر مرتين على وقت فارغ لإضافة حدث.")}</p>
      {importText && <IcsImport file={importText} onClose={() => setImportText(null)} onImport={(evs) => {
        update((st) => ({ ...st, events: [...st.events, ...evs] }), t(`Imported ${evs.length} events`, `استُورد ${evs.length} حدث`));
        setImportText(null);
      }} />}
    </div>
  );
}

function IcsImport({ file, onClose, onImport }: { file: { name: string; text: string }; onClose: () => void; onImport: (e: ReturnType<typeof parseIcs>) => void }) {
  const { s } = useStore();
  const t = useT();
  const [jobId, setJobId] = useState(s.jobs[0]?.id);
  const evs = useMemo(() => parseIcs(file.text, jobId), [file.text, jobId]);
  const recent = evs.filter((e) => Date.parse(e.end) > Date.now() - 120 * 86_400_000);
  return (
    <Modal title={t("Import calendar file", "استيراد ملف التقويم")} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>{t("Cancel", "إلغاء")}</button>
        <button className="btn primary" disabled={!recent.length} onClick={() => onImport(recent)}>{t(`Import ${recent.length} events`, `استورد ${recent.length} حدث`)}</button></>}>
      <p className="small muted">{file.name}: {t(`${evs.length} events found. Events older than four months are skipped.`, `وُجد ${evs.length} حدث. يتم تجاهل الأحداث الأقدم من أربعة أشهر.`)}</p>
      <label className="field"><span>{t("Which job are these for?", "لأي وظيفة هذه الأحداث؟")}</span><JobSelect id="ics-job" value={jobId} onChange={setJobId} /></label>
      <div className="list" style={{ maxHeight: 220, overflowY: "auto" }}>
        {recent.slice(0, 30).map((e) => <div className="li" key={e.id}><span className="li-time">{fmtTime(e.start, s.lang)}</span><div className="li-main"><div className="li-title">{e.title}</div><div className="li-sub">{fmtDay(e.start, s.lang)}</div></div></div>)}
      </div>
    </Modal>
  );
}
