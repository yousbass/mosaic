// Real sending without an API of our own: open the mail service's own compose
// window, pre-filled, in the account the message is from. The person presses
// Send there, so nothing is ever sent without them.

import type { ConnectorId } from "../types";

export type MailWeb = "gmail" | "outlook" | "yahoo";

export interface Message { to: string; subject: string; body: string; cc?: string }

/** Past this length the body is left out of the link and copied instead. */
export const MAX_URL = 7000;

const PERSONAL_MS = /@(outlook|hotmail|live|msn)\.[a-z.]+$/i;

export function mailWebFor(connectorId?: ConnectorId): MailWeb | undefined {
  return connectorId === "gmail" || connectorId === "outlook" || connectorId === "yahoo" ? connectorId : undefined;
}

export const MAIL_WEB_NAME: Record<MailWeb, string> = { gmail: "Gmail", outlook: "Outlook", yahoo: "Yahoo Mail" };

const q = (o: Record<string, string | undefined>) =>
  Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");

const validEmail = (a: string) => /^[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]+$/.test(a.trim());

/** The compose link for one service, or null when the body must be copied instead (too long). */
function build(web: MailWeb, account: string, m: Message, withBody: boolean): string {
  const body = withBody ? m.body : undefined;
  if (web === "gmail") {
    // /u/<address>/ picks that Google account when the browser is signed in to several.
    const who = validEmail(account) ? encodeURIComponent(account.trim()) : "0";
    return `https://mail.google.com/mail/u/${who}/?` + q({ tf: "cm", to: m.to, cc: m.cc, su: m.subject, body });
  }
  if (web === "outlook") {
    const base = PERSONAL_MS.test(account.trim()) ? "https://outlook.live.com/mail/0/deeplink/compose" : "https://outlook.office.com/mail/deeplink/compose";
    return base + "?" + q({ to: m.to, cc: m.cc, subject: m.subject, body });
  }
  return "https://compose.mail.yahoo.com/?" + q({ to: m.to, cc: m.cc, subject: m.subject, body });
}

/** Link that opens the message ready to send, and whether the body had to be left out (it's then copied). */
export function composeLink(web: MailWeb, account: string, m: Message): { url: string; bodyInLink: boolean } {
  const full = build(web, account, m, true);
  if (full.length <= MAX_URL) return { url: full, bodyInLink: true };
  return { url: build(web, account, m, false), bodyInLink: false };
}
