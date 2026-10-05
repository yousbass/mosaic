import { describe, expect, it } from "vitest";
import { buildSample } from "./data/sample";
import { buildReport, findClashes, findFreeSlots, hoursByJob, jobForSender, priorityOf, reportToMarkdown } from "./lib/logic";
import { parseCsv, parseIcs, importSalesforceCsv, toCsv } from "./lib/importers";
import { addDays, atTime, isWorkday, startOfWeek } from "./lib/time";
import type { CalEvent } from "./types";

// A fixed Monday so results don't depend on the day the tests run.
const NOW = new Date(2026, 9, 5, 9, 0); // Mon 5 Oct 2026, 09:00 local

const ev = (s: Date, mins: number, jobId = "j1", id = Math.random().toString()): CalEvent =>
  ({ id, title: id, jobId, start: s.toISOString(), end: new Date(s.getTime() + mins * 60_000).toISOString(), source: "mosaic", platform: "none" });

describe("week helpers", () => {
  it("starts weeks on Sunday and treats Fri/Sat as weekend", () => {
    expect(startOfWeek(NOW).getDay()).toBe(0);
    expect(isWorkday(addDays(startOfWeek(NOW), 5))).toBe(false); // Friday
    expect(isWorkday(addDays(startOfWeek(NOW), 4))).toBe(true); // Thursday
  });
});

describe("sample data", () => {
  const s = buildSample(NOW);
  it("contains the board meeting clash with Tuesday's lecture", () => {
    const ws = startOfWeek(NOW);
    const clashes = findClashes(s.events, ws, addDays(ws, 7)).filter((c) => c.crossJob);
    expect(clashes.length).toBe(1);
    const titles = [clashes[0].a.title, clashes[0].b.title].join(" | ");
    expect(titles).toMatch(/Board meeting/);
    expect(titles).toMatch(/lecture/);
  });
  it("every item belongs to a known job", () => {
    const ids = new Set(s.jobs.map((j) => j.id));
    for (const x of [...s.events, ...s.emails, ...s.tasks, ...s.deals, ...s.files]) expect(ids.has(x.jobId)).toBe(true);
  });
  it("every page widget id is unique", () => {
    const ids = s.pages.flatMap((p) => p.widgets.map((w) => w.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("findClashes", () => {
  it("flags overlaps and marks cross-job ones", () => {
    const d = atTime(NOW, 10);
    const list = [ev(d, 60, "j1", "a"), ev(new Date(d.getTime() + 30 * 60_000), 60, "j2", "b"), ev(atTime(NOW, 14), 30, "j1", "c")];
    const c = findClashes(list, atTime(NOW, 0), atTime(NOW, 23));
    expect(c).toHaveLength(1);
    expect(c[0].crossJob).toBe(true);
  });
  it("does not flag back-to-back meetings", () => {
    const d = atTime(NOW, 10);
    expect(findClashes([ev(d, 60), ev(atTime(NOW, 11), 60)], atTime(NOW, 0), atTime(NOW, 23))).toHaveLength(0);
  });
});

describe("findFreeSlots", () => {
  it("skips busy time with a 15 minute buffer and stays in working hours", () => {
    const busy = [ev(atTime(NOW, 8), 120)]; // 08:00–10:00
    const slots = findFreeSlots(busy, { from: atTime(NOW, 8), to: atTime(NOW, 18), durationMin: 60, limit: 1 });
    expect(new Date(slots[0].start).getHours()).toBe(10);
    expect(new Date(slots[0].start).getMinutes()).toBe(30);
  });
  it("never offers Friday or Saturday", () => {
    const fri = addDays(startOfWeek(NOW), 5);
    const slots = findFreeSlots([], { from: fri, to: addDays(fri, 3), durationMin: 60 });
    for (const s of slots) expect(isWorkday(new Date(s.start))).toBe(true);
    expect(new Date(slots[0].start).getDay()).toBe(0); // Sunday
  });
  it("returns nothing when the day is full", () => {
    const slots = findFreeSlots([ev(atTime(NOW, 7), 12 * 60)], { from: atTime(NOW, 8), to: atTime(NOW, 18), durationMin: 30 });
    expect(slots).toHaveLength(0);
  });
});

describe("hoursByJob and reports", () => {
  const s = buildSample(NOW);
  it("counts only the part of an event inside the window", () => {
    const list = [ev(atTime(NOW, 23), 120, "j1")];
    const h = hoursByJob(list, s.jobs, atTime(NOW, 0), addDays(atTime(NOW, 0), 1));
    expect(h.j1).toBeCloseTo(1, 5);
  });
  it("builds weekly and monthly reports with previous-period figures", () => {
    const w = buildReport(s, "week", NOW, 0);
    expect(w.perJob).toHaveLength(4);
    expect(w.totalHours).toBeGreaterThan(10);
    expect(w.clashes).toBe(1);
    const prev = buildReport(s, "week", NOW, -1);
    expect(prev.totalHours).toBeGreaterThan(5);
    expect(w.prev.totalHours).toBe(prev.totalHours);
    const m = buildReport(s, "month", NOW, 0);
    expect(m.perJob[0].target).toBeGreaterThan(w.perJob[0].target);
    expect(reportToMarkdown(w, s, "week")).toMatch(/\| University \|/);
  });
});

describe("mail filing", () => {
  const rules = [{ id: "r", match: "client.bh", jobId: "j2" }, { id: "r2", match: "ceo@client.bh", jobId: "j3" }];
  it("prefers an exact address rule, then domain, then the account default", () => {
    expect(jobForSender("CEO@client.bh", rules, "j1")).toBe("j3");
    expect(jobForSender("someone@client.bh", rules, "j1")).toBe("j2");
    expect(jobForSender("x@other.com", rules, "j1")).toBe("j1");
  });
  it("guesses priority when the AI has not sorted a message", () => {
    const base = { id: "e", from: "a@b.c", fromName: "A", receivedAt: "", jobId: "j1", source: "outlook" as const, unread: true };
    expect(priorityOf({ ...base, subject: "Can we move the walkthrough?", body: "" })).toBe("meeting");
    expect(priorityOf({ ...base, subject: "Your statement is ready", body: "", from: "noreply@bank.com" })).toBe("skip");
    expect(priorityOf({ ...base, subject: "Scope", body: "Could you send it by Wednesday?" })).toBe("action");
  });
});

describe("importers", () => {
  it("parses .ics with folded lines, UTC and all-day events", () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Steering\r\n  committee\r\nDTSTART:20261006T060000Z\r\nDTEND:20261006T070000Z\r\nDESCRIPTION:Join https://teams.microsoft.com/l/x\r\nEND:VEVENT\r\n" +
      "BEGIN:VEVENT\r\nSUMMARY:National Day\r\nDTSTART;VALUE=DATE:20261216\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const evs = parseIcs(ics, "j2");
    expect(evs).toHaveLength(2);
    expect(evs[0].title).toBe("Steering committee");
    expect(evs[0].start).toBe("2026-10-06T06:00:00.000Z");
    expect(evs[0].platform).toBe("teams");
    expect(evs[1].jobId).toBe("j2");
  });
  it("round-trips CSV with quotes, commas and newlines", () => {
    const rows = [["Name", "Note"], ['Al "Noor"', "a, b\nc"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("reads Salesforce opportunity and task exports", () => {
    const opp = "Opportunity Name,Account Name,Stage,Amount,Close Date\nAudit,Gulf Co,Negotiation/Review,\"12,500\",30/11/2026\n";
    const r = importSalesforceCsv(opp, "j2");
    expect(r.deals[0]).toMatchObject({ name: "Audit", account: "Gulf Co", stage: "negotiation", amount: 12500, closeDate: "2026-11-30" });
    const tasks = "Subject,Due Date,Status,Priority\nCall CFO,2026-10-08,In Progress,High\nSend deck,,Completed,Normal\n";
    const t = importSalesforceCsv(tasks, "j2").tasks;
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ status: "doing", priority: "high", due: "2026-10-08", source: "salesforce" });
    expect(t[1].status).toBe("done");
  });
});

describe("undo", async () => {
  const { makeInverse } = await import("./store");
  it("reverses one action without losing later, unrelated changes", () => {
    const s0 = buildSample(NOW);
    const added = { ...s0.tasks[0], id: "new", title: "Added" };
    const s1 = { ...s0, tasks: [added, ...s0.tasks] };          // the action to undo
    const s2 = { ...s1, tasks: s1.tasks.map((t) => t.id === s0.tasks[1].id ? { ...t, status: "done" as const } : t) }; // a later change
    const undone = makeInverse(s0, s1)(s2);
    expect(undone.tasks.some((t) => t.id === "new")).toBe(false);
    expect(undone.tasks.find((t) => t.id === s0.tasks[1].id)!.status).toBe("done");
  });
  it("restores a deleted item and an edited one", () => {
    const s0 = buildSample(NOW);
    const s1 = { ...s0, notes: s0.notes.slice(1), jobs: s0.jobs.map((j, i) => i === 0 ? { ...j, name: "X" } : j) };
    const undone = makeInverse(s0, s1)(s1);
    expect(undone.notes.map((n) => n.id)).toEqual(s0.notes.map((n) => n.id));
    expect(undone.jobs[0].name).toBe(s0.jobs[0].name);
  });
});

describe("fast AI routing", async () => {
  const { pickTier } = await import("./Assistant");
  it("sends short questions to the fast model and actions to the thorough one", () => {
    expect(pickTier("What's next today?", "auto")).toBe("quick");
    expect(pickTier("Book a call with Fatima next week", "auto")).toBe("default");
    expect(pickTier("رتب اجتماع مع العميل الأسبوع القادم", "auto")).toBe("default");
    expect(pickTier("Book a call", "fast")).toBe("quick");
    expect(pickTier("hi", "thorough")).toBe("complex");
  });
});

describe("account names", async () => {
  const { suggestLabel } = await import("./views/ConnectWizard");
  it("suggests names the way people say them", () => {
    expect(suggestLabel("University", "outlook")).toBe("University email");
    expect(suggestLabel("Seef Studio", "instagram")).toBe("Seef Studio Instagram");
    expect(suggestLabel(undefined, "gmail")).toBe("Email");
  });
  it("every sample mailbox belongs to exactly one job", () => {
    const s = buildSample(NOW);
    const mail = s.connections.filter((c) => ["outlook", "gmail", "yahoo"].includes(c.connectorId));
    expect(new Set(mail.map((c) => c.jobIds[0])).size).toBe(s.jobs.length);
    for (const e of s.emails) expect(mail.find((c) => c.id === e.accountId)?.jobIds[0]).toBe(e.jobId);
  });
});

describe("markdown", async () => {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Markdown } = await import("./lib/markdown");
  const html = (t: string) => renderToStaticMarkup(React.createElement(Markdown, { text: t }));
  it("keeps numbering across blank lines and continuation lines", () => {
    const out = html("1. First\n   still first\n\n2. Second\n3. Third");
    expect(out.match(/<ol/g)?.length).toBe(1);
    expect(out).toContain("First still first");
    expect(html("3. Third\n4. Fourth")).toContain('start="3"');
  });
  it("renders bold and code without HTML injection", () => {
    const out = html("**Bold** and `x<y>` <script>alert(1)</script>");
    expect(out).toContain("<strong>Bold</strong>");
    expect(out).not.toContain("<script>");
  });
});
