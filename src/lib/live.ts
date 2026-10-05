// Live connections through the viewer's own claude.ai connectors (the `mcp`
// capability). Mosaic never sees a password or token: each call runs on
// claude.ai as the person viewing the page, and claude.ai asks them once
// before Mosaic may use a connector.
//
// Only connectors whose tool arguments were checked against the real tool
// definitions are listed in LIVE. Everything else stays a demo account.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { use } from "./platform";
import type { Connection, ConnectorId, Lang } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface McpError { code: string; server?: string; message: string; retryable?: boolean; retryAfterMs?: number; result?: unknown }
export interface ToolResult { content: unknown[]; payload?: unknown; cache?: { storedAt: number; revalidating: boolean } }
type WatchEvent = { type: "data"; result: ToolResult } | { type: "error"; error: McpError };
export interface Mcp {
  callTool(server: string, tool: string, input?: unknown, options?: { cache?: false | { staleTime?: number; gcTime?: number; refresh?: boolean }; signal?: AbortSignal }): Promise<ToolResult>;
  watchTool(server: string, tool: string, input: unknown, handler: (ev: WatchEvent) => void, options?: { cache?: { staleTime?: number; gcTime?: number }; refetchInterval?: number }): () => void;
  invalidate(server?: string, tool?: string, input?: unknown): Promise<void>;
  listTools(server?: string): Promise<{ servers: { server: string; authStatus: string; tools: { name: string }[] }[] }>;
}

export interface LiveSpec {
  server: string; // claude.ai connector display name
  tools: string[]; // exactly the tools the page calls (the published manifest)
  probe: { tool: string; input: unknown }; // a harmless read used to connect
}

export const DRIVE = "Google Drive";

export const LIVE: Partial<Record<ConnectorId, LiveSpec>> = {
  gdrive: {
    server: DRIVE,
    tools: ["list_recent_files", "search_files", "read_file_content"],
    probe: { tool: "list_recent_files", input: { pageSize: 1, excludeContentSnippets: true } },
  },
};

export const liveSpec = (id?: ConnectorId) => (id ? LIVE[id] : undefined);
export const isLive = (c?: Connection) => !!c && !c.demo && !!c.server;

export function mcp(): Promise<Mcp | null> {
  return use<Mcp>("mcp");
}

export function isMcpError(e: unknown): e is McpError {
  return !!e && typeof e === "object" && typeof (e as any).code === "string";
}

/** Errors that mean the viewer no longer allows this data: stop showing it. */
const DENIALS = ["needs_reauth", "server_not_connected", "blocked_by_policy", "approval_required", "not_in_manifest", "consent_required", "selection_required", "server_not_found"];
const NO_RUNTIME = ["not_granted", "capability_disabled", "capability_removed"];
export const isDenial = (code: string) => DENIALS.includes(code) || NO_RUNTIME.includes(code);

export type Fix = "retry" | "permissions" | "settings" | "none";

/** What to tell the person for each failure, and the one action that fixes it. */
export function liveErrorCopy(e: McpError, lang: Lang, serverName?: string): { text: string; fix: Fix } {
  const sv = e.server || serverName || (lang === "ar" ? "الموصل" : "the connector");
  const ar = lang === "ar";
  switch (e.code) {
    case "needs_reauth":
      return { fix: "settings", text: ar ? `انتهت صلاحية تسجيل الدخول إلى ${sv}. أعد ربطه من claude.ai ← الإعدادات ← الموصلات، ثم حاول مرة أخرى.` : `Your ${sv} sign-in has expired. Reconnect it in claude.ai Settings → Connectors, then try again.` };
    case "server_not_connected":
      return { fix: "settings", text: ar ? `لم يُربط ${sv} بحسابك على claude.ai بعد. أضفه من الإعدادات ← الموصلات، ثم حاول مرة أخرى.` : `${sv} isn't connected to your claude.ai account yet. Add it in claude.ai Settings → Connectors, then try again.` };
    case "selection_required":
      return { fix: "retry", text: ar ? `لديك أكثر من حساب ${sv}. اختر واحدًا عندما يسألك claude.ai، ثم حاول مرة أخرى.` : `You have more than one ${sv} connected. Pick one when claude.ai asks, then try again.` };
    case "not_in_manifest":
      return { fix: "permissions", text: ar ? `${sv} متوقف لهذه الصفحة. شغّله من أذونات الصفحة.` : `${sv} is turned off for Mosaic. Turn it on in this page's permissions.` };
    case "consent_required":
      return { fix: "retry", text: ar ? `يحتاج Mosaic إلى موافقتك لاستخدام ${sv}. حاول مرة أخرى واختر «سماح».` : `Mosaic needs your OK to use ${sv}. Try again and choose Allow.` };
    case "blocked_by_policy":
      return { fix: "none", text: ar ? `تمنع سياسة مؤسستك استخدام ${sv} هنا.` : `Your organisation's policy blocks ${sv} here.` };
    case "approval_required":
      return { fix: "none", text: ar ? `تطلب مؤسستك موافقة على كل طلب إلى ${sv}، ولا تستطيع الصفحات طلبها بعد.` : `Your organisation requires approval for each ${sv} request, which pages can't ask for yet.` };
    case "server_not_found":
      return { fix: "settings", text: ar ? `لم يعد اتصال ${sv} موجودًا. أضفه مجددًا من claude.ai ← الإعدادات ← الموصلات.` : `This ${sv} connection no longer exists. Add it again in claude.ai Settings → Connectors.` };
    case "server_unavailable":
    case "rate_limited":
      return { fix: "retry", text: ar ? `لا يستجيب ${sv} الآن. حاول بعد قليل.` : `${sv} isn't answering right now. Try again in a moment.` };
    case "tool_error":
      return { fix: "none", text: ar ? `ردّ ${sv}: ${e.message}` : `${sv} said: ${e.message}` };
    case "cancelled":
      return { fix: "retry", text: ar ? "أُلغي الطلب." : "Cancelled." };
    case "not_granted":
    case "capability_disabled":
    case "capability_removed":
      return { fix: "none", text: ar ? "تعمل الاتصالات الحقيقية عند فتح Mosaic على claude.ai." : "Real connections work when Mosaic is opened on claude.ai." };
    default:
      return { fix: "retry", text: ar ? `تعذّر الوصول إلى ${sv}. حاول مرة أخرى.` : `Couldn't reach ${sv}. Try again.` };
  }
}

/** Open the page's permissions panel. Resolves false when it couldn't open. */
export async function openPermissions(): Promise<boolean> {
  const p = await use<{ manage: () => Promise<void> }>("permissions");
  if (!p) return false;
  try { await p.manage(); return true; } catch { return false; }
}

// ---------- Google Drive ----------

export interface DriveFile {
  id: string;
  title: string;
  mimeType: string;
  modifiedTime?: string;
  viewUrl?: string;
  owner?: string;
  folder: boolean;
}

/** Read the `files` list that list_recent_files and search_files return. */
export function parseDriveFiles(payload: unknown): DriveFile[] {
  const files = (payload as any)?.files;
  if (!Array.isArray(files)) return [];
  return files
    .filter((f: any) => f && typeof f.id === "string")
    .map((f: any) => ({
      id: f.id,
      title: typeof f.title === "string" && f.title ? f.title : "Untitled",
      mimeType: typeof f.mimeType === "string" ? f.mimeType : "",
      modifiedTime: typeof f.modifiedTime === "string" ? f.modifiedTime : undefined,
      viewUrl: typeof f.viewUrl === "string" && /^https:\/\//.test(f.viewUrl) ? f.viewUrl : undefined,
      owner: typeof f.owner === "string" ? f.owner : undefined,
      folder: f.mimeType === "application/vnd.google-apps.folder",
    }));
}

/** Quote a value for a Drive query: single quotes, with ' and \ escaped. */
export function driveQuote(v: string): string {
  return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

/** A Drive search query for words a person typed; every word must appear. */
export function driveQuery(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  return words.map((w) => `fullText contains ${driveQuote(w)}`).join(" and ");
}

export type DriveKind = "doc" | "sheet" | "slides" | "pdf" | "image" | "folder" | "file";
export function driveKind(mime: string): DriveKind {
  if (mime === "application/vnd.google-apps.folder") return "folder";
  // Office types all contain "officedocument", so check slides and sheets before documents.
  if (/presentation|powerpoint/.test(mime)) return "slides";
  if (/spreadsheet|sheet|excel|csv/.test(mime)) return "sheet";
  if (/google-apps\.document|wordprocessingml|msword|opendocument\.text|text\/plain/.test(mime)) return "doc";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  return "file";
}

/** Types read_file_content can turn into text (from the tool's own description). */
const READABLE = new Set([
  "application/vnd.google-apps.document", "application/vnd.google-apps.presentation", "application/vnd.google-apps.spreadsheet",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.spreadsheet", "application/vnd.oasis.opendocument.presentation",
  "application/x-vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.text",
  "image/png", "image/jpeg", "image/jpg",
]);
export function driveReadable(mime: string): boolean {
  return READABLE.has(mime);
}

export function parseFileContent(payload: unknown): string {
  const c = (payload as any)?.fileContent;
  return typeof c === "string" ? c : "";
}

// ---------- React hooks ----------

export interface WatchState<T> {
  data?: T;
  storedAt?: number; // when this data was produced (epoch ms)
  revalidating?: boolean;
  error?: McpError;
  loading: boolean;
  unavailable: boolean; // this view can't run live connections at all
}

/**
 * Keep a read current: replays the cached answer, refreshes when stale and
 * polls on `refetchInterval`. Short outages keep the last good data;
 * a denial (signed out, turned off) removes it.
 */
export function useLiveWatch<T>(server: string, tool: string, input: unknown, parse: (payload: unknown) => T,
  opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  const enabled = opts.enabled ?? true;
  const key = useMemo(() => JSON.stringify(input ?? null), [input]);
  const [st, setSt] = useState<WatchState<T>>({ loading: enabled, unavailable: false });
  const [nonce, setNonce] = useState(0);
  const parseRef = useRef(parse);
  parseRef.current = parse;

  // Last-good data is kept only for the same read; a new query starts empty.
  const identity = `${server}|${tool}|${key}`;
  const lastIdentity = useRef(identity);

  useEffect(() => {
    if (!enabled) { setSt({ loading: false, unavailable: false }); return; }
    let alive = true;
    let unsub: (() => void) | undefined;
    const same = lastIdentity.current === identity;
    lastIdentity.current = identity;
    setSt((p) => same ? { ...p, loading: !p.data, error: undefined } : { loading: true, unavailable: false });
    void mcp().then((m) => {
      if (!alive) return;
      if (!m) { setSt({ loading: false, unavailable: true }); return; }
      unsub = m.watchTool(server, tool, JSON.parse(key), (ev) => {
        if (!alive) return;
        if (ev.type === "data") {
          setSt({ data: parseRef.current(ev.result.payload), storedAt: ev.result.cache?.storedAt ?? Date.now(),
            revalidating: !!ev.result.cache?.revalidating, loading: false, unavailable: false });
        } else {
          const code = ev.error?.code ?? "upstream_error";
          if (code === "user_changed") return;
          setSt((p) => ({ ...p, data: isDenial(code) ? undefined : p.data, storedAt: isDenial(code) ? undefined : p.storedAt,
            error: ev.error, loading: false, revalidating: false, unavailable: NO_RUNTIME.includes(code) }));
        }
      }, { refetchInterval: opts.refetchInterval });
    });
    return () => { alive = false; unsub?.(); };
  }, [enabled, identity, nonce, opts.refetchInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  const errored = useRef(false);
  errored.current = !!st.error;

  /** Refresh now. After an error the watch is started again; otherwise the cached answer is dropped so it fetches fresh. */
  const refresh = useCallback(async () => {
    if (errored.current) { setNonce((n) => n + 1); return; }
    const m = await mcp();
    if (!m) return;
    setSt((p) => ({ ...p, revalidating: true }));
    try { await m.invalidate(server, tool, JSON.parse(key)); } catch { setNonce((n) => n + 1); }
  }, [server, tool, key]);

  return { ...st, refresh };
}

/** "Updated 3 min ago" from a storedAt timestamp. */
export function freshness(storedAt: number | undefined, lang: Lang, now = Date.now()): string {
  if (!storedAt) return "";
  const m = Math.max(0, Math.round((now - storedAt) / 60_000));
  if (lang === "ar") return m < 1 ? "حُدّث الآن" : m < 60 ? `حُدّث قبل ${m} د` : `حُدّث قبل ${Math.round(m / 60)} س`;
  return m < 1 ? "Updated just now" : m < 60 ? `Updated ${m} min ago` : `Updated ${Math.round(m / 60)} h ago`;
}
