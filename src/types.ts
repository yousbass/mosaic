export type Lang = "en" | "ar";

export interface Job {
  id: string;
  name: string;
  role: string;
  color: string; // token name: j1..j6
  weeklyHours: number; // target hours of meetings + focus per week
}

export type ConnectorId =
  | "outlook" | "gmail" | "yahoo" | "salesforce" | "zoom" | "teams"
  | "m365" | "linkedin" | "instagram" | "slack" | "tenderboard" | "gcal" | "gdrive";

export interface Connection {
  id: string;
  connectorId: ConnectorId;
  label: string; // the user's own name for it, e.g. "University email"
  account: string; // email address or handle
  jobIds: string[]; // jobs this account serves; the first is where its items are filed
  connectedAt: string;
  demo: boolean; // sample data, not a live API
  /** Live accounts: the claude.ai connector (display name) that serves it, signed in as the viewer. */
  server?: string;
  /** Optional words that narrow what a live account shows on its job's pages, e.g. "Dilmun" for Drive files. */
  scope?: string;
}

export type Platform = "teams" | "zoom" | "in-person" | "none";

export interface CalEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  jobId: string;
  source: ConnectorId | "mosaic" | "import";
  location?: string;
  platform: Platform;
  attendees?: string[];
  createdBy?: "ai" | "user";
}

export interface Email {
  id: string;
  from: string;
  fromName: string;
  to?: string;
  subject: string;
  body: string;
  receivedAt: string;
  jobId: string;
  source: ConnectorId;
  accountId?: string;
  unread: boolean;
  priority?: "action" | "meeting" | "info" | "skip";
  archived?: boolean;
}

export interface Draft {
  id: string;
  to: string;
  subject: string;
  body: string;
  jobId: string;
  accountId?: string; // connection the email is sent from
  replyTo?: string; // email id
  createdBy: "ai" | "user";
  status: "draft" | "sent";
  sentAt?: string;
  /** Handed to the mail service's own compose window to send (Gmail, Outlook or Yahoo Mail). */
  sentVia?: "gmail" | "outlook" | "yahoo";
}

export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  title: string;
  due?: string; // ISO date
  jobId: string;
  status: TaskStatus;
  source: ConnectorId | "mosaic";
  priority: "high" | "normal" | "low";
  doneAt?: string;
  createdBy?: "ai" | "user";
}

export interface Deal {
  id: string;
  account: string;
  name: string;
  stage: "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
  amount: number; // BHD
  closeDate: string;
  jobId: string;
}

export interface Tender {
  id: string;
  ref: string;
  title: string;
  entity: string;
  category: string;
  deadline: string;
  valueBhd?: number;
  source: string;
  summary: string;
  saved?: boolean;
  checklist?: string[];
  jobId?: string;
}

export interface SocialPost {
  id: string;
  network: "linkedin" | "instagram";
  text: string;
  scheduledFor?: string;
  status: "draft" | "scheduled";
  jobId: string;
  accountId?: string;
}

export interface Chat {
  id: string;
  app: "teams" | "slack";
  accountId: string;
  jobId: string;
  from: string;
  text: string;
  at: string;
  unread: boolean;
}

export interface Note {
  id: string;
  text: string;
  jobId?: string;
  updatedAt: string;
}

export interface FileRef {
  id: string;
  name: string;
  app: "word" | "excel" | "powerpoint" | "pdf";
  modifiedAt: string;
  jobId: string;
}

export interface Rule {
  id: string;
  match: string; // sender address or domain, lowercased
  jobId: string;
}

/** Tools work across accounts; apps show one connected account (or connect one). */
export type ToolType = "brief" | "agenda" | "conflicts" | "inbox" | "tasks" | "timesplit" | "notes" | "tenders" | "meet";
export type AppType = "mail" | "salesforce" | "teams" | "zoom" | "linkedin" | "instagram" | "onedrive" | "slack";
export type WidgetType = ToolType | AppType;

/** Width in thirds of the page: s = 1/3, m = 2/3, l = full. */
export type WidgetSize = "s" | "m" | "l";

export interface Widget {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  tall?: boolean; // two rows high
  accountId?: string; // for apps: which connected account it shows
}

export interface Page {
  id: string;
  name: string;
  jobId?: string; // filter: only this job's items
  widgets: Widget[];
}

export interface AppState {
  version: number;
  lang: Lang;
  jobs: Job[];
  connections: Connection[];
  events: CalEvent[];
  emails: Email[];
  drafts: Draft[];
  tasks: Task[];
  deals: Deal[];
  tenders: Tender[];
  tenderKeywords: string[];
  posts: SocialPost[];
  notes: Note[];
  files: FileRef[];
  rules: Rule[];
  pages: Page[];
  chats: Chat[];
  focusJobId?: string;
  aiMode: "auto" | "fast" | "thorough";
  onboarding: { dismissed: boolean; askedAI: boolean; customized: boolean };
}
