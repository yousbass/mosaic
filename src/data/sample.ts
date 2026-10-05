import type { AppState, CalEvent, Email, Task, Platform } from "../types";
import { addDays, atTime, startOfWeek, ymd } from "../lib/time";

// Sample data for the demo. Everything here is invented and is labelled
// "Sample" in the interface. Dates are placed around the current week so
// the demo always looks current.

export const STATE_VERSION = 5;

let n = 0;
const id = (p: string) => `${p}_${(++n).toString(36)}`;

function ev(day: Date, h: number, m: number, durMin: number, title: string, jobId: string,
  source: CalEvent["source"], platform: Platform, location?: string, attendees?: string[]): CalEvent {
  const start = atTime(day, h, m);
  return { id: id("ev"), title, jobId, source, platform, location, attendees,
    start: start.toISOString(), end: new Date(start.getTime() + durMin * 60_000).toISOString() };
}

export function buildSample(now = new Date()): AppState {
  n = 0;
  const w = startOfWeek(now); // Sunday
  const sun = w, mon = addDays(w, 1), tue = addDays(w, 2), wed = addDays(w, 3), thu = addDays(w, 4);

  const events: CalEvent[] = [
    // Lecturer
    ev(sun, 8, 0, 90, "ICE 211 lecture — Process control", "j1", "outlook", "in-person", "Building 36, Room 112"),
    ev(tue, 11, 0, 90, "ICE 211 lecture — PID tuning", "j1", "outlook", "in-person", "Building 36, Room 112"),
    ev(wed, 13, 0, 60, "Office hours", "j1", "outlook", "in-person", "Office 2.14"),
    ev(thu, 9, 0, 120, "Programme accreditation committee", "j1", "outlook", "teams", undefined, ["QA office"]),
    // Consultant
    ev(sun, 11, 0, 60, "Client kickoff — Al Noor Logistics", "j2", "outlook", "teams", undefined, ["Fatima Al Sayed", "Omar Haddad"]),
    ev(mon, 10, 0, 90, "Process review workshop", "j2", "outlook", "in-person", "Client site, Sitra"),
    ev(wed, 9, 30, 60, "Weekly sync with Dilmun Advisory partners", "j2", "outlook", "zoom"),
    ev(thu, 14, 0, 60, "Proposal walkthrough — Gulf Cold Chain", "j2", "outlook", "teams", undefined, ["Khalid Rahma"]),
    // Board (clashes with Tuesday lecture)
    ev(tue, 10, 0, 120, "Board meeting — Q3 results", "j3", "gmail", "in-person", "Pearl Coast HQ, Seef"),
    ev(mon, 16, 0, 45, "Audit committee pre-read call", "j3", "gmail", "zoom"),
    // Own business
    ev(sun, 15, 0, 45, "Supplier call — packaging quotes", "j4", "yahoo", "zoom"),
    ev(mon, 13, 0, 30, "Stand-up with studio team", "j4", "yahoo", "teams"),
    ev(wed, 16, 30, 60, "Showroom visit — new client", "j4", "yahoo", "in-person", "Seef Studio, Adliya"),
    ev(thu, 11, 30, 45, "Stand-up with studio team", "j4", "yahoo", "teams"),
  ];

  // Four earlier weeks of meetings, for the weekly and monthly reports.
  const pattern: [number, number, number, string, string][] = [
    [0, 8, 90, "Lecture", "j1"], [2, 11, 90, "Lecture", "j1"], [3, 13, 60, "Office hours", "j1"],
    [0, 11, 60, "Client meeting", "j2"], [1, 10, 90, "Workshop", "j2"], [3, 9, 60, "Partners sync", "j2"], [4, 14, 60, "Client review", "j2"],
    [1, 16, 45, "Committee call", "j3"],
    [0, 15, 45, "Supplier call", "j4"], [1, 13, 30, "Studio stand-up", "j4"], [4, 11, 45, "Studio stand-up", "j4"],
  ];
  for (let k = 1; k <= 4; k++) {
    const wk = addDays(w, -7 * k);
    pattern.forEach(([d, h, dur, t, j], i) => {
      if ((i + k) % 7 === 0) return; // some weeks are lighter
      events.push(ev(addDays(wk, d), h, 0, dur + (k % 2) * 15 * (i % 2), t, j, "outlook", "teams"));
    });
    if (k === 2) events.push(ev(addDays(wk, 2), 10, 0, 180, "Board meeting", "j3", "gmail", "in-person"));
  }

  // Each job has its own mailbox, named the way the user would name it.
  const ACCOUNT_FOR_JOB: Record<string, string> = { j1: "a1", j2: "a2", j3: "a3", j4: "a4" };
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const mail = (h: number, fromName: string, from: string, subject: string, body: string, jobId: string,
    source: Email["source"], unread = true, priority?: Email["priority"]): Email =>
    ({ id: id("em"), fromName, from, subject, body, receivedAt: ago(h), jobId, source, unread, priority, accountId: ACCOUNT_FOR_JOB[jobId] });

  const emails: Email[] = [
    mail(0.5, "Fatima Al Sayed", "fatima@alnoorlogistics.bh", "Revised scope for phase 2",
      "Hi, following Sunday's kickoff we would like to add the warehouse layout study to phase 2. Could you send a revised scope and fee by Wednesday? We need it for our budget committee on Thursday.", "j2", "outlook", true, "action"),
    mail(1.5, "Board Secretary", "secretary@pearlcoast.bh", "Board pack — Q3 results (please review)",
      "Dear members, the board pack for Tuesday's meeting is attached. Please send any questions on the financial statements by Monday 3 pm.", "j3", "gmail", true, "action"),
    mail(3, "Dr. Huda Mansoor", "h.mansoor@university.edu.bh", "Midterm marks due",
      "Reminder: midterm marks for all sections must be entered in the student system by Thursday 5 pm.", "j1", "outlook", true, "action"),
    mail(4, "Khalid Rahma", "khalid@gulfcoldchain.com", "Can we move Thursday's walkthrough?",
      "Something came up on our side. Would Wednesday afternoon work instead? Any time after 2 pm.", "j2", "outlook", true, "meeting"),
    mail(6, "Packaging Plus", "sales@packagingplus.bh", "Quotation Q-2291",
      "Please find our quotation for 5,000 printed boxes. Valid for 14 days. Delivery 3 weeks from order.", "j4", "yahoo", true, "info"),
    mail(9, "Student Affairs", "noreply@university.edu.bh", "Campus parking closure next week",
      "Parking lot B will be closed Sunday to Tuesday for resurfacing.", "j1", "outlook", false, "info"),
    mail(14, "Omar Haddad", "omar@alnoorlogistics.bh", "Data request list",
      "Attached is the list of data we can share for the process review. Some items need sign-off from our CFO.", "j2", "outlook", false, "info"),
    mail(20, "LinkedIn", "notifications@linkedin.com", "You appeared in 34 searches this week",
      "See who's looking at your profile.", "j3", "gmail", false, "skip"),
    mail(26, "Studio team", "team@seefstudio.bh", "New client brief — villa interior",
      "Client wants a concept by the 20th. Budget is around BHD 18,000. Can you join the showroom visit on Wednesday?", "j4", "yahoo", true, "action"),
    mail(30, "Tender Board alerts", "alerts@tenders.example", "3 new tenders match \"consultancy\"",
      "New tenders were published in your categories.", "j2", "outlook", false, "info"),
    mail(40, "QA Office", "qa@university.edu.bh", "Accreditation evidence folder",
      "Please upload course files for ICE 211 to the evidence folder before Thursday's committee.", "j1", "outlook", false, "action"),
    mail(2, "Dean's Office", "dean.engineering@university.edu.bh", "Lab budget — can we meet Tuesday?",
      "The Dean would like 30 minutes with you on Tuesday to go through the new process control lab budget. Does 1 pm work?", "j1", "outlook", true, "meeting"),
    mail(7, "Ali Hasan", "20231187@stu.university.edu.bh", "Request: extension for lab report 2",
      "Dear Doctor, I was ill last week and missed the session. Could I submit lab report 2 on Sunday instead of Thursday? I have attached the medical note.", "j1", "outlook", true, "action"),
    mail(22, "University Library", "library@university.edu.bh", "Your reserve list for ICE 211 is ready",
      "The three textbooks you requested are now on two-hour reserve at the main desk.", "j1", "outlook", false, "info"),
    mail(5, "Mariam Al Khalifa", "mariam@bahrainfreshfoods.bh", "Lean training — dates for November",
      "We would like to run the three-day Lean training in November. Could you propose two options and the group size you recommend?", "j2", "outlook", true, "action"),
    mail(18, "Accounts payable, Al Noor", "ap@alnoorlogistics.bh", "Invoice INV-214 received",
      "Thank you. Invoice INV-214 is approved and scheduled for payment on the 15th.", "j2", "outlook", false, "info"),
    mail(8, "Audit Committee Chair", "chair.audit@pearlcoast.bh", "Internal audit report — read before Tuesday",
      "Members, please read the internal audit report on procurement before Tuesday. I would like each of us to raise one question.", "j3", "gmail", true, "action"),
    mail(36, "Company Secretary", "cosec@pearlcoast.bh", "AGM date confirmed",
      "The AGM is confirmed for the last Thursday of next month at the Pearl Coast HQ.", "j3", "gmail", false, "info"),
    mail(3.5, "Villa client, Saar", "n.alansari@gmail.com", "Could we see the concept on Sunday?",
      "We're excited to see the first ideas. Would Sunday afternoon at the showroom work for you?", "j4", "yahoo", true, "meeting"),
    mail(12, "Studio accountant", "accounts@seefstudio.bh", "VAT return due on the 28th",
      "Please send me the purchase invoices for the quarter by the 20th so I can file the VAT return on time.", "j4", "yahoo", true, "action"),
    mail(50, "Bank", "noreply@bank.example", "Your monthly statement is ready",
      "Your statement for last month is available in online banking.", "j3", "gmail", false, "skip"),
  ];

  const due = (d: number) => ymd(addDays(startOfWeek(now), d));
  const task = (title: string, d: number | undefined, jobId: string, source: Task["source"], priority: Task["priority"] = "normal", status: Task["status"] = "todo"): Task =>
    ({ id: id("tk"), title, due: d === undefined ? undefined : due(d), jobId, source, priority, status });

  const tasks: Task[] = [
    task("Enter ICE 211 midterm marks", 4, "j1", "mosaic", "high"),
    task("Upload course files to accreditation folder", 4, "j1", "mosaic", "high", "doing"),
    task("Prepare PID tuning lab sheet", 2, "j1", "mosaic"),
    task("Send revised phase 2 scope to Al Noor", 3, "j2", "salesforce", "high"),
    task("Follow up: Gulf Cold Chain proposal", 4, "j2", "salesforce", "normal"),
    task("Log workshop notes in Salesforce", 1, "j2", "salesforce", "normal", "doing"),
    task("Review Q3 board pack", 1, "j3", "mosaic", "high"),
    task("Send questions to board secretary", 1, "j3", "mosaic"),
    task("Compare packaging quotes", 3, "j4", "mosaic"),
    task("Villa interior concept moodboard", 9, "j4", "mosaic", "normal"),
    task("Renew trade licence", 12, "j4", "mosaic", "low"),
  ];
  // Completed tasks over the past weeks, for reports.
  for (let k = 0; k < 26; k++) {
    const t = task(["Marked quiz 3", "Client report: findings section", "Read audit committee minutes", "Supplier follow-up call", "Invoice INV-214 sent", "Lab sheet updated",
      "Graded lab reports", "Workshop slides drafted", "Signed board resolution", "Showroom photos posted", "Exam questions submitted", "Salesforce pipeline cleaned",
      "Office hours notes", "Client data request sent", "Reviewed dividend policy", "Paid supplier deposit", "Moodle quiz published", "Proposal pricing checked",
      "Committee feedback sent", "Instagram post scheduled", "Course file uploaded", "Interview notes typed", "Read Q2 board pack", "Packaging sample approved",
      "Marked assignment 2", "Lean training outline"][k],
      -((k * 37) % 28) - 1, ["j1", "j2", "j3", "j4"][k % 4], k % 3 === 0 ? "salesforce" : "mosaic", "normal", "done");
    t.doneAt = atTime(addDays(startOfWeek(now), -((k * 37) % 28) - 1), 12).toISOString();
    tasks.push(t);
  }
  // A few finished earlier today, so this week's report isn't empty.
  ["Sent workshop agenda", "Approved packaging artwork", "Replied to QA office"].forEach((title, k) => {
    tasks.push({ id: id("tk"), title, jobId: ["j2", "j4", "j1"][k], status: "done", source: "mosaic", priority: "normal",
      due: ymd(now), doneAt: new Date(Math.max(startOfWeek(now).getTime() + 60_000, now.getTime() - (k + 1) * 3_600_000)).toISOString() });
  });

  const close = (d: number) => ymd(addDays(now, d));
  return {
    version: STATE_VERSION,
    lang: "en",
    jobs: [
      { id: "j1", name: "University", role: "Lecturer, Chemical Engineering", color: "j1", weeklyHours: 12 },
      { id: "j2", name: "Dilmun Advisory", role: "Process consultant", color: "j2", weeklyHours: 14 },
      { id: "j3", name: "Pearl Coast Holdings", role: "Board member", color: "j3", weeklyHours: 4 },
      { id: "j4", name: "Seef Studio", role: "Owner", color: "j4", weeklyHours: 8 },
    ],
    connections: [
      { id: "a1", connectorId: "outlook", label: "University email", account: "you@university.edu.bh", jobIds: ["j1"], connectedAt: ago(400), demo: true },
      { id: "a2", connectorId: "outlook", label: "Dilmun Advisory email", account: "you@dilmunadvisory.bh", jobIds: ["j2"], connectedAt: ago(400), demo: true },
      { id: "a3", connectorId: "gmail", label: "Board email", account: "you.personal@gmail.com", jobIds: ["j3"], connectedAt: ago(400), demo: true },
      { id: "a4", connectorId: "yahoo", label: "Seef Studio email", account: "seefstudio@yahoo.com", jobIds: ["j4"], connectedAt: ago(400), demo: true },
      { id: "a5", connectorId: "salesforce", label: "Dilmun Salesforce", account: "Dilmun Advisory org", jobIds: ["j2"], connectedAt: ago(300), demo: true },
      { id: "a6", connectorId: "teams", label: "University Teams", account: "you@university.edu.bh", jobIds: ["j1", "j2"], connectedAt: ago(300), demo: true },
      { id: "a7", connectorId: "zoom", label: "Personal Zoom", account: "you.personal@gmail.com", jobIds: ["j2", "j3", "j4"], connectedAt: ago(300), demo: true },
      { id: "a8", connectorId: "linkedin", label: "My LinkedIn", account: "linkedin.com/in/you", jobIds: ["j2"], connectedAt: ago(250), demo: true },
      { id: "a9", connectorId: "instagram", label: "Seef Studio Instagram", account: "@seefstudio", jobIds: ["j4"], connectedAt: ago(250), demo: true },
      { id: "a10", connectorId: "m365", label: "University OneDrive", account: "you@university.edu.bh", jobIds: ["j1"], connectedAt: ago(250), demo: true },
      { id: "a11", connectorId: "tenderboard", label: "Tender alerts", account: "Keywords: consultancy, logistics, training", jobIds: ["j2"], connectedAt: ago(200), demo: true },
    ],
    events,
    emails,
    drafts: [],
    tasks,
    deals: [
      { id: "d1", account: "Al Noor Logistics", name: "Phase 2 — warehouse study", stage: "proposal", amount: 14500, closeDate: close(10), jobId: "j2" },
      { id: "d2", account: "Gulf Cold Chain", name: "Cold room process audit", stage: "negotiation", amount: 9800, closeDate: close(5), jobId: "j2" },
      { id: "d3", account: "Bahrain Fresh Foods", name: "Lean training, 3 days", stage: "qualified", amount: 4200, closeDate: close(25), jobId: "j2" },
      { id: "d4", account: "Muharraq Port Services", name: "Throughput assessment", stage: "lead", amount: 22000, closeDate: close(45), jobId: "j2" },
      { id: "d5", account: "Al Noor Logistics", name: "Phase 1 — diagnostic", stage: "won", amount: 11000, closeDate: close(-12), jobId: "j2" },
      { id: "d6", account: "Villa client, Saar", name: "Interior concept", stage: "proposal", amount: 18000, closeDate: close(14), jobId: "j4" },
    ],
    tenders: [
      { id: "t1", ref: "SAMPLE-2026-0412", title: "Consultancy services for warehouse process optimisation", entity: "Ministry of Industry and Commerce", category: "Consultancy", deadline: close(9), valueBhd: 45000, source: "Tender Board",
        summary: "Two-stage tender for a 6-month study of public warehouse processes, including current-state mapping, capacity modelling and an implementation roadmap. Bidders must show three similar projects in the GCC within five years and include a team of at least one certified Lean practitioner." },
      { id: "t2", ref: "SAMPLE-2026-0398", title: "Training programme in industrial safety and process control", entity: "Vocational Training Directorate", category: "Training", deadline: close(4), valueBhd: 18000, source: "Tender Board",
        summary: "Delivery of 12 training days on process safety and basic process control for technicians. Arabic and English delivery required. Trainers must hold a relevant engineering degree and 10 years of experience." },
      { id: "t3", ref: "SAMPLE-2026-0420", title: "Cold-chain logistics feasibility study", entity: "Food Security Office", category: "Consultancy", deadline: close(16), valueBhd: 60000, source: "Tender Board",
        summary: "Feasibility study for a national cold-chain hub, including demand forecast, site options, financial model and PPP structure. Joint ventures allowed. Bid bond 2% of the bid value." },
      { id: "t4", ref: "SAMPLE-2026-0377", title: "Interior fit-out of administrative offices", entity: "Municipal Affairs", category: "Fit-out", deadline: close(2), valueBhd: 85000, source: "Tender Board",
        summary: "Design and fit-out of 1,200 m² of offices. Contractor classification grade B or above required." },
      { id: "t5", ref: "SAMPLE-2026-0431", title: "Logistics data platform — advisory support", entity: "Transport Authority", category: "Consultancy", deadline: close(21), valueBhd: 30000, source: "Tender Board",
        summary: "Advisory support for specifying a logistics data platform: requirements, vendor assessment and procurement support. 4-month duration." },
    ],
    tenderKeywords: ["consultancy", "logistics", "training", "process"],
    posts: [
      { id: "p1", network: "linkedin", text: "Three lessons from mapping a warehouse in Sitra this week: measure the waiting, not the walking…", status: "draft", jobId: "j2", accountId: "a8" },
      { id: "p3", network: "linkedin", text: "We're hiring a junior process analyst in Manama. Lean or Six Sigma basics a plus.", scheduledFor: addDays(now, 3).toISOString(), status: "scheduled", jobId: "j2", accountId: "a8" },
      { id: "p2", network: "instagram", text: "Before and after: the Adliya showroom reading corner.", scheduledFor: addDays(now, 2).toISOString(), status: "scheduled", jobId: "j4", accountId: "a9" },
      { id: "p4", network: "instagram", text: "Material board for a villa in Saar: travertine, oak, brushed brass.", status: "draft", jobId: "j4", accountId: "a9" },
    ],
    notes: [
      { id: "n1", text: "Ask Omar which data needs CFO sign-off before the workshop.", jobId: "j2", updatedAt: ago(5) },
      { id: "n2", text: "Board: question on receivables ageing, page 14.", jobId: "j3", updatedAt: ago(2) },
      { id: "n3", text: "Lab 4: bring spare thermocouples, two rigs short.", jobId: "j1", updatedAt: ago(9) },
      { id: "n4", text: "Saar villa: client prefers warm whites, no grey. Budget firm at BHD 18k.", jobId: "j4", updatedAt: ago(4) },
      { id: "n5", text: "Ask the accountant about input VAT on the showroom fit-out.", jobId: "j4", updatedAt: ago(30) },
    ],
    files: [
      { id: "f1", name: "Al Noor phase 2 scope.docx", app: "word", modifiedAt: ago(2), jobId: "j2" },
      { id: "f2", name: "ICE211 midterm marks.xlsx", app: "excel", modifiedAt: ago(7), jobId: "j1" },
      { id: "f3", name: "Q3 board pack.pdf", app: "pdf", modifiedAt: ago(10), jobId: "j3" },
      { id: "f4", name: "PID tuning lecture.pptx", app: "powerpoint", modifiedAt: ago(30), jobId: "j1" },
      { id: "f5", name: "Packaging quotes comparison.xlsx", app: "excel", modifiedAt: ago(26), jobId: "j4" },
      { id: "f6", name: "Gulf Cold Chain proposal.docx", app: "word", modifiedAt: ago(50), jobId: "j2" },
    ],
    rules: [
      { id: "r1", match: "alnoorlogistics.bh", jobId: "j2" },
      { id: "r2", match: "pearlcoast.bh", jobId: "j3" },
    ],
    pages: [
      { id: "home", name: "Home", widgets: [
        { id: "w2", type: "agenda", size: "s", tall: true },
        { id: "w3", type: "inbox", size: "m", tall: true },
        { id: "w4", type: "tasks", size: "s", tall: true },
        { id: "w5", type: "timesplit", size: "s" },
        { id: "w6", type: "conflicts", size: "s" },
        { id: "w7", type: "tenders", size: "m" },
      ] },
      { id: "pg_j1", name: "University", jobId: "j1", widgets: [
        { id: "w10", type: "mail", size: "m", tall: true, accountId: "a1" },
        { id: "w11", type: "agenda", size: "s", tall: true },
        { id: "w13", type: "teams", size: "s", tall: true, accountId: "a6" },
        { id: "w12", type: "tasks", size: "s" },
        { id: "w14", type: "onedrive", size: "s", accountId: "a10" },
        { id: "w15", type: "notes", size: "s" },
        { id: "w16", type: "meet", size: "s" },
      ] },
      { id: "pg_j2", name: "Dilmun Advisory", jobId: "j2", widgets: [
        { id: "w20", type: "salesforce", size: "l", accountId: "a5" },
        { id: "w21", type: "mail", size: "m", tall: true, accountId: "a2" },
        { id: "w22", type: "agenda", size: "s", tall: true },
        { id: "w24", type: "linkedin", size: "s", tall: true, accountId: "a8" },
        { id: "w23", type: "tasks", size: "s" },
        { id: "w26", type: "tenders", size: "s" },
        { id: "w25", type: "zoom", size: "s", accountId: "a7" },
        { id: "w27", type: "notes", size: "s" },
      ] },
      { id: "pg_j3", name: "Pearl Coast Holdings", jobId: "j3", widgets: [
        { id: "w30", type: "mail", size: "m", tall: true, accountId: "a3" },
        { id: "w31", type: "agenda", size: "s", tall: true },
        { id: "w32", type: "tasks", size: "s" },
        { id: "w33", type: "zoom", size: "s", accountId: "a7" },
        { id: "w34", type: "notes", size: "s" },
      ] },
      { id: "pg_j4", name: "Seef Studio", jobId: "j4", widgets: [
        { id: "w40", type: "mail", size: "m", tall: true, accountId: "a4" },
        { id: "w41", type: "instagram", size: "s", tall: true, accountId: "a9" },
        { id: "w42", type: "agenda", size: "s", tall: true },
        { id: "w43", type: "tasks", size: "s" },
        { id: "w44", type: "notes", size: "s" },
        { id: "w45", type: "meet", size: "s" },
        { id: "w46", type: "zoom", size: "s", accountId: "a7" },
      ] },
    ],
    chats: [
      { id: "ch1", app: "teams", accountId: "a6", jobId: "j1", from: "Dr. Huda Mansoor", text: "Could you cover my Wednesday 2 pm lab? I'm at the accreditation visit.", at: ago(1), unread: true },
      { id: "ch2", app: "teams", accountId: "a6", jobId: "j1", from: "QA Office", text: "Evidence folder link is pinned in the channel.", at: ago(5), unread: false },
      { id: "ch3", app: "teams", accountId: "a6", jobId: "j2", from: "Omar Haddad", text: "Shared the data list. CFO signs off tomorrow.", at: ago(3), unread: true },
      { id: "ch4", app: "teams", accountId: "a6", jobId: "j1", from: "Lab technician", text: "Flow rig is calibrated for Tuesday.", at: ago(20), unread: false },
    ],
    aiMode: "auto",
    onboarding: { dismissed: false, askedAI: false, customized: false },
  };
}
