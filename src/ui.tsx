import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useStore } from "./store";
import type { AppState, Connection, Job } from "./types";
import { connector, TONE } from "./data/connectors";

/** Inline bilingual copy: t("Inbox", "البريد"). */
export function useT() {
  const { s } = useStore();
  return (en: string, ar: string) => (s.lang === "ar" ? ar : en);
}

export function jobOf(s: AppState, id?: string): Job | undefined {
  return s.jobs.find((j) => j.id === id);
}

export function JobChip({ jobId }: { jobId?: string }) {
  const { s } = useStore();
  const j = jobOf(s, jobId);
  if (!j) return null;
  return <span className="chip job" data-j={j.color}>{j.name}</span>;
}

export function JobSelect({ value, onChange, id, allowAll, exclude }: { value?: string; onChange: (v: string) => void; id: string; allowAll?: string; exclude?: string }) {
  const { s } = useStore();
  return (
    <select id={id} className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {allowAll !== undefined && <option value="">{allowAll}</option>}
      {s.jobs.filter((j) => j.id !== exclude).map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
    </select>
  );
}

export function Modal({ title, onClose, children, foot, wide, labelId = "modal-title" }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode; wide?: boolean; labelId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Focus the first field once when the dialog opens; keep Tab inside the dialog.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not(.icon-btn)");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, summary")].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-labelledby={labelId} ref={ref}>
        <div className="modal-head">
          <h2 id={labelId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, dismiss, s } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.text}</span>
          {t.undo && <button onClick={() => { t.undo!(); dismiss(t.id); }}>{s.lang === "ar" ? "تراجع" : "Undo"}</button>}
        </div>
      ))}
    </div>
  );
}

export function SampleChip() {
  const t = useT();
  return <span className="chip sample" title={t("Sample data from a demo connection", "بيانات تجريبية من اتصال تجريبي")}>{t("Sample", "تجريبي")}</span>;
}

export function Thinking({ label }: { label: string }) {
  return <span className="ai-note"><span className="thinking" aria-hidden="true"><i /><i /><i /></span>{label}</span>;
}

/** Filter helper used by pages that belong to one job, and by focus mode. */
export function useJobFilter(pageJobId?: string) {
  const { s } = useStore();
  const jobId = pageJobId ?? s.focusJobId;
  return (x: { jobId?: string }) => !jobId || x.jobId === jobId;
}

/** Two-letter initials for a job or person. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((w) => !/^(of|the|and|al|el|&)$/i.test(w));
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

export function JobTile({ job, size }: { job?: Job; size?: number }) {
  if (!job) return null;
  return <span className="job-tile" data-j={job.color} style={size ? { width: size, height: size, borderRadius: size * .3, fontSize: size * .42 } : undefined} aria-hidden="true">{initials(job.name)}</span>;
}

export function AppMono({ connectorId, size }: { connectorId: string; size?: "sm" | "lg" }) {
  const c = connector(connectorId);
  return <span className={"app-mono" + (size ? " " + size : "")} data-tone={TONE[connectorId] ?? "blue"} aria-hidden="true">{c?.mono ?? "?"}</span>;
}

/** Progress ring, e.g. hours booked against a weekly target. */
export function Ring({ value, max, size = 40 }: { value: number; max: number; size?: number }) {
  const r = 15, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <svg className="ring" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle className="bg" cx="20" cy="20" r={r} />
      <circle className="fg" cx="20" cy="20" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 20 20)" />
    </svg>
  );
}

export function accountOf(s: AppState, id?: string): Connection | undefined {
  return s.connections.find((c) => c.id === id);
}

/** Connected accounts of the given services, those serving `jobId` first. */
export function accountsFor(s: AppState, connectorIds: string[], jobId?: string): Connection[] {
  const list = s.connections.filter((c) => connectorIds.includes(c.connectorId));
  return jobId ? [...list.filter((c) => c.jobIds.includes(jobId)), ...list.filter((c) => !c.jobIds.includes(jobId))] : list;
}

/** Keyboard activation for clickable rows: Enter or Space, like a button. */
export const onActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
};
