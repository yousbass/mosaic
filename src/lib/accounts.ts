// Removing accounts, and optionally everything they brought into Mosaic.

import type { AppState, Connection, ConnectorId } from "../types";

/** Calendars that came in with these mail accounts (sample and synced events carry the service as their source). */
const CALENDAR_OF: Partial<Record<ConnectorId, ConnectorId>> = { outlook: "outlook", gmail: "gmail", yahoo: "yahoo", gcal: "gcal" };

export interface RemovalCounts { emails: number; chats: number; posts: number; events: number; files: number; deals: number; crmTasks: number }

/** Which data goes with these accounts. Shared data (Salesforce, files, a calendar) goes only with the last account of its kind. */
function whatGoes(s: AppState, ids: string[]) {
  const gone = new Set(ids);
  const leaving = s.connections.filter((c) => gone.has(c.id));
  const staying = s.connections.filter((c) => !gone.has(c.id));
  const lastOf = (id: ConnectorId) => leaving.some((c) => c.connectorId === id) && !staying.some((c) => c.connectorId === id);
  const calendars = new Set(leaving.map((c) => CALENDAR_OF[c.connectorId]).filter((x): x is ConnectorId => !!x && lastOf(x)));
  return {
    gone,
    email: (e: { accountId?: string }) => !!e.accountId && gone.has(e.accountId),
    event: (e: { source: string; createdBy?: string }) => calendars.has(e.source as ConnectorId) && !e.createdBy,
    files: lastOf("m365"),
    salesforce: lastOf("salesforce"),
  };
}

export function removalCounts(s: AppState, ids: string[]): RemovalCounts {
  const w = whatGoes(s, ids);
  return {
    emails: s.emails.filter(w.email).length,
    chats: s.chats.filter(w.email).length,
    posts: s.posts.filter(w.email).length,
    events: s.events.filter(w.event).length,
    files: w.files ? s.files.length : 0,
    deals: w.salesforce ? s.deals.length : 0,
    crmTasks: w.salesforce ? s.tasks.filter((k) => k.source === "salesforce").length : 0,
  };
}

/**
 * Remove accounts. Cards that showed them go back to "Connect", and drafts
 * written from them keep their text but lose the sender. With `deleteData`
 * the mail, chats, posts, calendar events, files and Salesforce records they
 * brought in are deleted too. Everything you wrote yourself stays.
 */
export function removeAccounts(s: AppState, ids: string[], deleteData: boolean): AppState {
  const w = whatGoes(s, ids);
  const base: AppState = {
    ...s,
    connections: s.connections.filter((c) => !w.gone.has(c.id)),
    pages: s.pages.map((p) => ({ ...p, widgets: p.widgets.map((x) => x.accountId && w.gone.has(x.accountId) ? { ...x, accountId: undefined } : x) })),
    drafts: s.drafts.map((d) => d.accountId && w.gone.has(d.accountId) ? { ...d, accountId: undefined } : d),
  };
  if (!deleteData) return base;
  return {
    ...base,
    emails: s.emails.filter((e) => !w.email(e)),
    chats: s.chats.filter((c) => !w.email(c)),
    posts: s.posts.filter((p) => !w.email(p)),
    events: s.events.filter((e) => !w.event(e)),
    files: w.files ? [] : s.files,
    deals: w.salesforce ? [] : s.deals,
    tasks: w.salesforce ? s.tasks.filter((k) => k.source !== "salesforce") : s.tasks,
  };
}

export const demoAccounts = (s: AppState): Connection[] => s.connections.filter((c) => c.demo);
