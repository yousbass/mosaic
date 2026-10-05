import type { CalEvent, Deal, Task } from "../types";
import { uid } from "./time";

/** Parse an iCalendar (.ics) file into events. Handles folded lines, UTC and floating times, all-day events. */
export function parseIcs(text: string, jobId: string): CalEvent[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const out: CalEvent[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const get = (key: string) => {
      const m = body.match(new RegExp(`^${key}(?:;[^:\\n]*)?:(.*)$`, "m"));
      return m ? m[1].trim() : undefined;
    };
    const s = parseIcsDate(get("DTSTART"));
    let e = parseIcsDate(get("DTEND"));
    if (!s) continue;
    if (!e) e = new Date(s.getTime() + 3_600_000);
    const location = unescapeIcs(get("LOCATION"));
    const desc = (get("DESCRIPTION") ?? "") + " " + (location ?? "");
    out.push({
      id: uid("ev"),
      title: unescapeIcs(get("SUMMARY")) || "Untitled event",
      start: s.toISOString(),
      end: e.toISOString(),
      jobId,
      source: "import",
      location,
      platform: /teams\.microsoft/i.test(desc) ? "teams" : /zoom\.us/i.test(desc) ? "zoom" : location ? "in-person" : "none",
    });
  }
  return out;
}

function parseIcsDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return undefined;
  const [, y, mo, d, h = "0", mi = "0", se = "0", z] = m;
  return z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se))
    : new Date(+y, +mo - 1, +d, +h, +mi, +se);
}

const unescapeIcs = (v?: string) => v?.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export function toCsv(rows: (string | number | undefined)[][]): string {
  return rows.map((r) => r.map((v) => {
    let s = v === undefined ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formulas
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";
}

const STAGES: Deal["stage"][] = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];

/**
 * Salesforce report export → opportunities or tasks. Recognises the standard
 * column names ("Opportunity Name", "Account Name", "Stage", "Amount", "Close Date",
 * or "Subject", "Due Date", "Status", "Priority").
 */
export function importSalesforceCsv(text: string, jobId: string): { deals: Deal[]; tasks: Task[] } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { deals: [], tasks: [] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iName = col("opportunity name", "name"), iAcc = col("account name", "account"), iStage = col("stage");
  const iAmt = col("amount"), iClose = col("close date"), iSubj = col("subject"), iDue = col("due date", "activity date");
  const iStatus = col("status"), iPri = col("priority");
  const deals: Deal[] = [], tasks: Task[] = [];
  for (const r of rows.slice(1)) {
    if (iSubj >= 0 && iStage < 0) {
      const status = (r[iStatus] ?? "").toLowerCase();
      const done = status.includes("complet");
      tasks.push({ id: uid("tk"), title: r[iSubj] || "Salesforce task", due: normDate(r[iDue]), jobId, source: "salesforce",
        status: done ? "done" : status.includes("progress") ? "doing" : "todo", doneAt: done ? new Date().toISOString() : undefined,
        priority: /high/i.test(r[iPri] ?? "") ? "high" : /low/i.test(r[iPri] ?? "") ? "low" : "normal" });
    } else if (iName >= 0) {
      const st = (r[iStage] ?? "").toLowerCase();
      const stage = STAGES.find((s) => st.includes(s)) ?? (st.includes("closed won") ? "won" : st.includes("closed lost") ? "lost" : "lead");
      deals.push({ id: uid("d"), name: r[iName], account: r[iAcc] ?? "", stage,
        amount: Number(String(r[iAmt] ?? "0").replace(/[^\d.-]/g, "")) || 0, closeDate: normDate(r[iClose]) ?? "", jobId });
    }
  }
  return { deals, tasks };
}

function normDate(v?: string): string | undefined {
  if (!v) return undefined;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); // day/month/year, as used in Bahrain
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return undefined;
}
