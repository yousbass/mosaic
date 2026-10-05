import type { ConnectorId, WidgetType } from "../types";

export interface ConnectorInfo {
  id: ConnectorId;
  name: string;
  vendor: string;
  mono: string; // two-letter monogram shown instead of a logo
  category: "mail" | "calendar" | "crm" | "meetings" | "files" | "social" | "chat" | "tenders";
  gives: { en: string; ar: string }; // what connecting adds
  live: { en: string; ar: string }; // what a real connection needs
  /** The claude.ai connector that offers this service, when one exists. */
  claudeConnector?: string;
}

export const CONNECTORS: ConnectorInfo[] = [
  { id: "outlook", name: "Outlook", vendor: "Microsoft 365", mono: "Ol", category: "mail",
    gives: { en: "Mail and calendar, including Gmail and Yahoo accounts linked inside Outlook", ar: "البريد والتقويم، بما فيها حسابات Gmail وYahoo المرتبطة داخل Outlook" },
    live: { en: "Microsoft Graph sign-in (Mail.ReadWrite, Calendars.ReadWrite)", ar: "تسجيل الدخول عبر Microsoft Graph (البريد والتقويم)" }, claudeConnector: "Microsoft 365" },
  { id: "teams", name: "Teams", vendor: "Microsoft 365", mono: "Tm", category: "meetings",
    gives: { en: "Create Teams meetings and see recent chats", ar: "إنشاء اجتماعات Teams ورؤية المحادثات الأخيرة" },
    live: { en: "Microsoft Graph sign-in (OnlineMeetings, Chat.Read)", ar: "تسجيل الدخول عبر Microsoft Graph" }, claudeConnector: "Microsoft 365" },
  { id: "m365", name: "Microsoft 365 files", vendor: "OneDrive · Word · Excel · PowerPoint", mono: "M3", category: "files",
    gives: { en: "Recent Word, Excel and PowerPoint files per job", ar: "ملفات Word وExcel وPowerPoint الأخيرة لكل وظيفة" },
    live: { en: "Microsoft Graph sign-in (Files.Read)", ar: "تسجيل الدخول عبر Microsoft Graph (الملفات)" }, claudeConnector: "Microsoft 365" },
  { id: "gdrive", name: "Google Drive", vendor: "Google", mono: "GD", category: "files",
    gives: { en: "Your real Drive files: recent, search, and AI summaries", ar: "ملفاتك الحقيقية في Drive: الأحدث والبحث وملخصات بالذكاء الاصطناعي" },
    live: { en: "Your claude.ai Google Drive connector", ar: "موصل Google Drive في حسابك على claude.ai" }, claudeConnector: "Google Drive" },
  { id: "gmail", name: "Gmail", vendor: "Google", mono: "Gm", category: "mail",
    gives: { en: "Mail from your Google account", ar: "بريد حساب Google" },
    live: { en: "Google sign-in (Gmail API)", ar: "تسجيل الدخول عبر Google" }, claudeConnector: "Gmail" },
  { id: "gcal", name: "Google Calendar", vendor: "Google", mono: "GC", category: "calendar",
    gives: { en: "Events from your Google calendars", ar: "أحداث تقويمات Google" },
    live: { en: "Google sign-in (Calendar API)", ar: "تسجيل الدخول عبر Google" }, claudeConnector: "Google Calendar" },
  { id: "yahoo", name: "Yahoo Mail", vendor: "Yahoo", mono: "Ya", category: "mail",
    gives: { en: "Mail from your Yahoo account", ar: "بريد حساب Yahoo" },
    live: { en: "Yahoo sign-in, or link it inside Outlook", ar: "تسجيل الدخول عبر Yahoo أو ربطه داخل Outlook" } },
  { id: "salesforce", name: "Salesforce", vendor: "Salesforce CRM", mono: "Sf", category: "crm",
    gives: { en: "Opportunities, tasks and to-dos; upload or download records as CSV", ar: "الفرص والمهام؛ رفع السجلات أو تنزيلها بصيغة CSV" },
    live: { en: "Salesforce connected app (REST API)", ar: "تطبيق متصل في Salesforce (REST API)" }, claudeConnector: "Salesforce - Beta" },
  { id: "zoom", name: "Zoom", vendor: "Zoom", mono: "Zm", category: "meetings",
    gives: { en: "Create Zoom meetings with one click", ar: "إنشاء اجتماعات Zoom بنقرة واحدة" },
    live: { en: "Zoom OAuth app (meeting:write)", ar: "تطبيق Zoom OAuth" }, claudeConnector: "Zoom for Claude" },
  { id: "slack", name: "Slack", vendor: "Slack", mono: "Sl", category: "chat",
    gives: { en: "Mentions and direct messages", ar: "الإشارات والرسائل المباشرة" },
    live: { en: "Slack app (channels:history, im:history)", ar: "تطبيق Slack" }, claudeConnector: "Slack" },
  { id: "linkedin", name: "LinkedIn", vendor: "LinkedIn", mono: "in", category: "social",
    gives: { en: "Write and schedule posts with AI help", ar: "كتابة المنشورات وجدولتها بمساعدة الذكاء الاصطناعي" },
    live: { en: "LinkedIn sign-in (w_member_social). Reading your feed is not allowed by LinkedIn.", ar: "تسجيل الدخول عبر LinkedIn للنشر. لا تسمح LinkedIn بقراءة الصفحة الرئيسية." } },
  { id: "instagram", name: "Instagram", vendor: "Meta", mono: "Ig", category: "social",
    gives: { en: "Plan captions and posts for a business account", ar: "تخطيط المنشورات والتعليقات لحساب تجاري" },
    live: { en: "Instagram business account via Meta Graph API", ar: "حساب Instagram تجاري عبر Meta Graph API" } },
  { id: "tenderboard", name: "Tender Board", vendor: "Public tender sources", mono: "TB", category: "tenders",
    gives: { en: "New tenders that match your keywords", ar: "المناقصات الجديدة المطابقة لكلماتك المفتاحية" },
    live: { en: "Daily read of the public tender listings", ar: "قراءة يومية لقوائم المناقصات العامة" } },
];

export const connector = (id: string) => CONNECTORS.find((c) => c.id === id);

/** Hue for an app's monogram tile (a neutral family per app, not a logo colour). */
export const TONE: Record<string, string> = {
  outlook: "blue", teams: "indigo", m365: "sky", gdrive: "green", gmail: "red", gcal: "sky", yahoo: "violet",
  salesforce: "sky", zoom: "blue", slack: "pink", linkedin: "blue", instagram: "pink", tenderboard: "green",
};

export interface WidgetInfo {
  type: WidgetType;
  kind: "tool" | "app";
  /** Apps show one connected account; these are the services that can back it. */
  connectors?: ConnectorId[];
  en: string;
  ar: string;
  descEn: string;
  descAr: string;
  size: "s" | "m" | "l";
  tall?: boolean;
}

export const WIDGETS: WidgetInfo[] = [
  // Apps
  { type: "mail", kind: "app", connectors: ["outlook", "gmail", "yahoo"], en: "Email account", ar: "حساب بريد", descEn: "One mailbox, like your University email", descAr: "صندوق بريد واحد، مثل بريد الجامعة", size: "m", tall: true },
  { type: "linkedin", kind: "app", connectors: ["linkedin"], en: "LinkedIn", ar: "لينكدإن", descEn: "Write and schedule posts", descAr: "اكتب المنشورات وجدولها", size: "s", tall: true },
  { type: "instagram", kind: "app", connectors: ["instagram"], en: "Instagram", ar: "إنستغرام", descEn: "Plan posts and captions", descAr: "خطط للمنشورات والتعليقات", size: "s", tall: true },
  { type: "salesforce", kind: "app", connectors: ["salesforce"], en: "Salesforce", ar: "Salesforce", descEn: "Pipeline and CRM tasks", descAr: "مسار المبيعات ومهام العملاء", size: "l" },
  { type: "teams", kind: "app", connectors: ["teams"], en: "Microsoft Teams", ar: "Microsoft Teams", descEn: "Chats and Teams meetings", descAr: "المحادثات واجتماعات Teams", size: "s", tall: true },
  { type: "zoom", kind: "app", connectors: ["zoom"], en: "Zoom", ar: "Zoom", descEn: "Upcoming calls, start a new one", descAr: "المكالمات القادمة وبدء مكالمة", size: "s" },
  { type: "onedrive", kind: "app", connectors: ["gdrive", "m365"], en: "Files", ar: "الملفات", descEn: "Google Drive or OneDrive", descAr: "Google Drive أو OneDrive", size: "s", tall: true },
  { type: "slack", kind: "app", connectors: ["slack"], en: "Slack", ar: "Slack", descEn: "Mentions and direct messages", descAr: "الإشارات والرسائل المباشرة", size: "s", tall: true },
  // Tools
  { type: "brief", kind: "tool", en: "AI briefing", ar: "الموجز الذكي", descEn: "What needs you today", descAr: "ما يحتاجك اليوم", size: "l" },
  { type: "agenda", kind: "tool", en: "Agenda", ar: "جدول اليوم", descEn: "Today and tomorrow, all calendars", descAr: "اليوم والغد من كل التقويمات", size: "s", tall: true },
  { type: "inbox", kind: "tool", en: "All mail", ar: "كل البريد", descEn: "Every account in one list", descAr: "كل الحسابات في قائمة واحدة", size: "m", tall: true },
  { type: "tasks", kind: "tool", en: "Tasks", ar: "المهام", descEn: "To-dos with due dates", descAr: "المهام ومواعيدها", size: "s" },
  { type: "conflicts", kind: "tool", en: "Clashes", ar: "التعارضات", descEn: "Overlapping meetings across jobs", descAr: "اجتماعات متداخلة بين الوظائف", size: "s" },
  { type: "timesplit", kind: "tool", en: "Time per job", ar: "الوقت لكل وظيفة", descEn: "Hours this week against target", descAr: "ساعات الأسبوع مقابل الهدف", size: "s" },
  { type: "tenders", kind: "tool", en: "Tenders radar", ar: "رادار المناقصات", descEn: "Matching tenders and deadlines", descAr: "المناقصات المطابقة ومواعيدها", size: "m" },
  { type: "meet", kind: "tool", en: "Quick meeting", ar: "اجتماع سريع", descEn: "Book a Teams or Zoom call", descAr: "احجز مكالمة Teams أو Zoom", size: "s" },
  { type: "notes", kind: "tool", en: "Notes", ar: "ملاحظات", descEn: "Quick notes for this page", descAr: "ملاحظات سريعة لهذه الصفحة", size: "s" },
];

export const widgetInfo = (type: WidgetType) => WIDGETS.find((w) => w.type === type)!;
