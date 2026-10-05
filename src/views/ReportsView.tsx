import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Sparkles } from "lucide-react";
import { useStore } from "../store";
import { Thinking, jobOf, useT } from "../ui";
import { Markdown } from "../lib/markdown";
import { buildReport, findClashes, reportToMarkdown } from "../lib/logic";
import { fmtDay, ymd, DAY } from "../lib/time";
import { toCsv } from "../lib/importers";
import { use, aiErrorCopy, isSampleError, saveFile, type SampleFn } from "../lib/platform";

export function ReportsView() {
  const { s, toast } = useStore();
  const t = useT();
  const [kind, setKind] = useState<"week" | "month">("week");
  const [offset, setOffset] = useState(0);
  const [ai, setAi] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const now = new Date();
  const r = buildReport(s, kind, now, offset);
  const last = new Date(r.to.getTime() - DAY);
  const firstClash = findClashes(s.events, r.from, r.to).find((c) => c.crossJob);
  const rangeLabel = kind === "week"
    ? `${fmtDay(r.from, s.lang, { day: "numeric", month: "short" })} – ${fmtDay(last, s.lang, { day: "numeric", month: "short", year: "numeric" })}`
    : fmtDay(r.from, s.lang, { month: "long", year: "numeric" });

  const delta = (cur: number, prev: number) => {
    if (!prev) return <span className="d flat">—</span>;
    const p = Math.round(((cur - prev) / prev) * 100);
    return <span className={"d " + (p > 0 ? "up" : p < 0 ? "down" : "flat")}>{p > 0 ? "▲" : p < 0 ? "▼" : "•"} {Math.abs(p)}% {t("vs previous", "عن السابق")}</span>;
  };

  async function narrative() {
    setErr(""); setAi("");
    const sample = await use<SampleFn>("sample");
    if (!sample) { setErr(t("The written summary works when Mosaic is opened on claude.ai.", "يعمل الملخص المكتوب عند فتح Mosaic على claude.ai.")); return; }
    setBusy(true);
    try {
      await sample(`Write a ${kind === "week" ? "weekly" : "monthly"} review for someone balancing several jobs, from these figures. ` +
        `${s.lang === "ar" ? "Write in Arabic." : "Write in English."} 4 to 6 short bullets starting with "• ": where time went against each job's target, what got done, ` +
        `risks (overdue tasks, clashes, over-target jobs), and one concrete suggestion for next ${kind}. Under 140 words. Plain text.\n\n` +
        reportToMarkdown(r, s, kind) + `\nJob roles: ${s.jobs.map((j) => `${j.name} = ${j.role}`).join("; ")}`,
        { modelTier: "default", cache: { gcTime: 60 * 60_000 }, onText: ({ text }: { text: string }) => setAi(text) });
    } catch (e) { if (isSampleError(e) && e.code !== "cancelled") setErr(aiErrorCopy(e.code, s.lang)); }
    finally { setBusy(false); }
  }

  const exportMd = async () => {
    const md = reportToMarkdown(r, s, kind) + (ai ? "\n## Summary\n\n" + ai + "\n" : "");
    if (!(await saveFile(`mosaic-${kind}-report-${ymd(r.from)}.md`, md))) toast(t("Saving files isn't available in this view.", "حفظ الملفات غير متاح هنا."));
  };
  const exportCsv = async () => {
    const rows = [["Job", "Hours", "Target", "Meetings", "Tasks done", "Emails"], ...r.perJob.map((p) => [jobOf(s, p.jobId)?.name, p.hours, p.target, p.meetings, p.tasksDone, p.emails])];
    if (!(await saveFile(`mosaic-${kind}-report-${ymd(r.from)}.csv`, toCsv(rows)))) toast(t("Saving files isn't available in this view.", "حفظ الملفات غير متاح هنا."));
  };

  // chart scale
  const maxV = Math.max(4, ...r.perJob.flatMap((p) => [p.hours, p.target]));
  const step = maxV > 40 ? 10 : maxV > 16 ? 5 : 2;
  const top = Math.ceil(maxV / step) * step;
  const W = 640, rowH = 44, padL = 150, padR = 20, padT = 10, H = padT + r.perJob.length * rowH + 28;
  const x = (v: number) => padL + (v / top) * (W - padL - padR);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <div className="seg"><button aria-pressed={kind === "week"} onClick={() => { setKind("week"); setOffset(0); setAi(""); }}>{t("Weekly", "أسبوعي")}</button>
          <button aria-pressed={kind === "month"} onClick={() => { setKind("month"); setOffset(0); setAi(""); }}>{t("Monthly", "شهري")}</button></div>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" aria-label={t("Previous", "السابق")} onClick={() => { setOffset(offset - 1); setAi(""); }}><ChevronLeft size={18} className="flip" /></button>
          <b className="num" style={{ minWidth: 150, textAlign: "center" }}>{rangeLabel}</b>
          <button className="icon-btn" aria-label={t("Next", "التالي")} onClick={() => { setOffset(offset + 1); setAi(""); }} disabled={offset >= 0}><ChevronRight size={18} className="flip" /></button>
        </div>
        <div className="grow" />
        <button className="btn" onClick={exportMd}><Download size={15} />{t("Report (.md)", "التقرير (.md)")}</button>
        <button className="btn" onClick={exportCsv}><Download size={15} />CSV</button>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="l">{t("Meeting hours", "ساعات الاجتماعات")}</div><div className="v num">{r.totalHours}</div>{delta(r.totalHours, r.prev.totalHours)}</div>
        <div className="kpi"><div className="l">{t("Meetings", "الاجتماعات")}</div><div className="v num">{r.meetings}</div>{delta(r.meetings, r.prev.meetings)}</div>
        <div className="kpi"><div className="l">{t("Tasks completed", "المهام المنجزة")}</div><div className="v num">{r.tasksDone}</div>{delta(r.tasksDone, r.prev.tasksDone)}</div>
        <div className="kpi"><div className="l">{t("Clashes between jobs", "التعارضات بين الوظائف")}</div><div className="v num" style={{ color: r.clashes ? "var(--danger)" : undefined }}>{r.clashes}</div>
          <span className="d flat">{firstClash ? `${firstClash.a.title.split(" — ")[0]} × ${firstClash.b.title.split(" — ")[0]}` : t("None this period", "لا شيء في هذه الفترة")}</span></div>
      </div>
      <div className="rep-grid">
        <section className="card">
          <div className="card-head"><h3>{t("Hours per job against target", "الساعات لكل وظيفة مقابل الهدف")}</h3></div>
          <div className="card-body">
            <svg className="chart chart-svg" style={{ direction: "ltr" }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Bar chart of hours per job", "مخطط الساعات لكل وظيفة")}>
              {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => (
                <g key={v}><line className="grid-l" x1={x(v)} x2={x(v)} y1={padT} y2={H - 22} /><text x={x(v)} y={H - 6} textAnchor="middle">{v}h</text></g>
              ))}
              {r.perJob.map((p, i) => {
                const j = jobOf(s, p.jobId)!;
                const y = padT + i * rowH + 10;
                return (
                  <g key={p.jobId} data-j={j.color}>
                    <text x={padL - 10} y={y + 14} textAnchor="end" style={{ fill: "var(--ink)", fontFamily: "var(--f-body)", fontSize: 12.5 }}>{j.name.length > 20 ? j.name.slice(0, 19) + "…" : j.name}</text>
                    <rect x={padL} y={y} width={Math.max(2, x(p.hours) - padL)} height={20} rx={4} style={{ fill: "var(--jc)" }} />
                    <line className="target" x1={x(p.target)} x2={x(p.target)} y1={y - 4} y2={y + 24} />
                    <text x={Math.min(x(p.hours) + 6, W - padR - 30)} y={y + 14} style={{ fill: "var(--ink)" }}>{p.hours}</text>
                  </g>
                );
              })}
            </svg>
            <div className="chart-list stack" style={{ gap: 12 }}>
              {r.perJob.map((p) => { const j = jobOf(s, p.jobId)!; return (
                <div key={p.jobId} data-j={j.color} className="stack" style={{ gap: 5 }}>
                  <div className="row small" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}><span className="row" style={{ gap: 7 }}><i className="dot" />{j.name}</span><span className="num"><b>{p.hours}</b> / {p.target}{t("h", "س")}</span></div>
                  <div className={"bar" + (p.hours > p.target ? " over" : "")}><i style={{ width: Math.min(100, (p.hours / Math.max(1, p.target)) * 100) + "%" }} /></div>
                </div>); })}
            </div>
            <p className="small faint">{t("Bars: booked hours. Vertical line: the job's target for this period.", "الأشرطة: الساعات المحجوزة. الخط العمودي: هدف الوظيفة لهذه الفترة.")}</p>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h3>{t("Summary", "الملخص")}</h3></div>
          <div className="card-body stack">
            {ai ? <Markdown text={ai} /> : !busy && <p className="small muted">{t("Get a short written review of this period, with one suggestion for the next.", "احصل على مراجعة قصيرة لهذه الفترة مع اقتراح للفترة التالية.")}</p>}
            {busy && !ai && <Thinking label={t("Writing the review…", "أكتب المراجعة…")} />}
            {err && <p className="small" style={{ color: "var(--danger)" }}>{err}</p>}
            <div><button className="btn primary" onClick={narrative} disabled={busy}><Sparkles size={15} />{ai ? t("Rewrite", "أعد الكتابة") : t("Write the review", "اكتب المراجعة")}</button></div>
          </div>
        </section>
        <section className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-head"><h3>{t("By job", "حسب الوظيفة")}</h3></div>
          <div className="card-body tbl-wrap">
            <table className="t">
              <thead><tr><th>{t("Job", "الوظيفة")}</th><th className="n">{t("Hours", "الساعات")}</th><th className="n">{t("Target", "الهدف")}</th><th className="n">{t("Meetings", "الاجتماعات")}</th><th className="n">{t("Tasks done", "مهام منجزة")}</th><th className="n">{t("Emails", "الرسائل")}</th></tr></thead>
              <tbody>{r.perJob.map((p) => { const j = jobOf(s, p.jobId)!; return (
                <tr key={p.jobId}><td><span className="row" style={{ gap: 8 }}><i className="dot" data-j={j.color} />{j.name}</span></td>
                  <td className="n" style={{ color: p.hours > p.target ? "var(--danger)" : undefined, fontWeight: 600 }}>{p.hours}</td><td className="n">{p.target}</td>
                  <td className="n">{p.meetings}</td><td className="n">{p.tasksDone}</td><td className="n">{p.emails}</td></tr>); })}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
