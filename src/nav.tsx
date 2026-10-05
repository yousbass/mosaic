import { createContext, useContext } from "react";
import type { ConnectorId } from "./types";

export type View =
  | { kind: "page"; id: string }
  | { kind: "calendar" } | { kind: "inbox"; emailId?: string } | { kind: "tasks" }
  | { kind: "tenders" } | { kind: "reports" } | { kind: "connections" } | { kind: "settings" };

export interface EventDraft { id?: string; title?: string; start?: string; end?: string; jobId?: string; platform?: string }

export interface ConnectRequest {
  connectorId?: ConnectorId;
  choices?: ConnectorId[]; // limit the app list, e.g. to mail services
  jobId?: string;
  accountId?: string; // edit an existing account
  bind?: { pageId: string; widgetId: string }; // put the new account into this widget
}

export interface Nav {
  view: View;
  go: (v: View) => void;
  ask: (prompt?: string, send?: boolean) => void; // open the assistant, optionally with a prompt
  editEvent: (d: EventDraft) => void;
  composeEmail: (d?: { to?: string; subject?: string; body?: string; jobId?: string; accountId?: string; replyTo?: string; draftId?: string }) => void;
  connect: (r: ConnectRequest) => void;
}

export const NavCtx = createContext<Nav | null>(null);
export function useNav(): Nav {
  const v = useContext(NavCtx);
  if (!v) throw new Error("useNav outside provider");
  return v;
}
