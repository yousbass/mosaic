import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "./types";
import { buildSample, STATE_VERSION } from "./data/sample";
import { use } from "./lib/platform";

// App state lives in one object. Each top-level key is saved as its own
// document in the viewer's private area of the artifact store
// (data/users/<id>/<key>), so one large collection never hits the
// per-document size limit. Without the store, the browser's local storage
// is used, and without that, state lasts for the visit.

type Key = keyof AppState;
const KEYS: Key[] = ["lang", "jobs", "connections", "events", "emails", "drafts", "tasks", "deals",
  "tenders", "tenderKeywords", "posts", "notes", "files", "rules", "pages", "chats", "focusJobId", "aiMode", "onboarding"];
const LS = "mosaic.state.v" + STATE_VERSION;

export type SaveMode = "account" | "browser" | "visit";

interface Toast { id: number; text: string; undo?: () => void }

interface Store {
  s: AppState;
  /** Current state, readable synchronously (used by AI tools between renders). */
  get: () => AppState;
  update: (fn: (s: AppState) => AppState, undoLabel?: string) => void;
  toast: (text: string) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  saveMode: SaveMode;
  ready: boolean;
  resetDemo: () => void;
}

const Ctx = createContext<Store | null>(null);

function lsRead(): AppState | null {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return null;
    const v = JSON.parse(raw) as AppState;
    return v.version === STATE_VERSION ? { ...buildSample(), ...v } : null;
  } catch {
    return null;
  }
}
function lsWrite(s: AppState) {
  try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
function canUseLs() {
  try { localStorage.setItem("mosaic.probe", "1"); localStorage.removeItem("mosaic.probe"); return true; } catch { return false; }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Build a function that reverses the change from `prev` to `next` on whatever
 * the state is later. Lists of items with ids are reversed item by item, so
 * undoing one action leaves other changes made since then in place.
 */
export function makeInverse(prev: AppState, next: AppState): (cur: AppState) => AppState {
  const changed = KEYS.filter((k) => prev[k] !== next[k]);
  return (cur) => {
    const out: any = { ...cur };
    for (const k of changed) {
      const a = prev[k] as any, b = next[k] as any;
      if (Array.isArray(a) && Array.isArray(b) && [...a, ...b].every((x) => x && typeof x === "object" && "id" in x)) {
        const before = new Map(a.map((x: any) => [x.id, x]));
        const after = new Map(b.map((x: any) => [x.id, x]));
        let list: any[] = (out[k] as any[]).filter((x) => !(after.has(x.id) && !before.has(x.id))); // drop added
        list = list.map((x) => (after.has(x.id) && before.has(x.id) && after.get(x.id) !== before.get(x.id) ? before.get(x.id) : x)); // revert edited
        const present = new Set(list.map((x) => x.id));
        a.forEach((x: any, i: number) => { if (!after.has(x.id) && !present.has(x.id)) list.splice(Math.min(i, list.length), 0, x); }); // restore removed
        // keep the original order when the action only reordered items
        if (a.length === b.length && a.every((x: any) => after.has(x.id)) && list.length === a.length) {
          const pos = new Map(a.map((x: any, i: number) => [x.id, i]));
          list.sort((x, y) => (pos.get(x.id) as number) - (pos.get(y.id) as number));
        }
        out[k] = list;
      } else {
        out[k] = a;
      }
    }
    return out as AppState;
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const initial = useMemo(() => lsRead(), []);
  const [s, setS] = useState<AppState>(() => initial ?? buildSample());
  const [saveMode, setSaveMode] = useState<SaveMode>(initial ? "browser" : "visit");
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const ref = useRef<AppState>(s);
  const touched = useRef<Set<Key>>(new Set()); // keys edited before the account store answered
  const readyRef = useRef(false);
  const dbRef = useRef<{ db: any; base: string } | null>(null);
  const saved = useRef<Partial<AppState>>({});
  const timer = useRef<number | undefined>();
  const retry = useRef<number | undefined>();
  const writing = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback(async (state: AppState, all = false) => {
    const target = dbRef.current;
    if (!target) { lsWrite(state); return; }
    const changed = KEYS.filter((k) => all || saved.current[k] !== state[k]);
    if (!changed.length) return;
    // Writes to the same documents run one after another.
    writing.current = writing.current.then(async () => {
      let failed = false;
      for (const k of changed) {
        try {
          await target.db.doc(`${target.base}/${k}`).set({ v: state[k] ?? null });
          saved.current[k] = state[k] as any;
        } catch { failed = true; }
      }
      if (all) await target.db.doc(`${target.base}/meta`).set({ version: STATE_VERSION }).catch(() => { failed = true; });
      if (failed) {
        window.clearTimeout(retry.current);
        retry.current = window.setTimeout(() => { void persist(ref.current, all); }, 5000);
      }
    });
    await writing.current;
  }, []);

  // Connect to the account store once, and load the viewer's saved state.
  useEffect(() => {
    let cancelled = false;
    const finish = () => { readyRef.current = true; setReady(true); };
    (async () => {
      const [db, user] = await Promise.all([use<any>("db"), use<any>("user")]);
      const uidv = user ? await user.id().catch(() => null) : null;
      if (cancelled) return;
      if (!db || !uidv) {
        if (canUseLs()) setSaveMode("browser");
        finish();
        return;
      }
      const base = `data/users/${uidv}`;
      try {
        const meta = await db.doc(`${base}/meta`).get();
        const has = meta.exists && meta.data()?.version === STATE_VERSION;
        if (has) {
          const snaps = await Promise.all(KEYS.map((k) => db.doc(`${base}/${k}`).get()));
          if (cancelled) return;
          const loaded: any = { ...buildSample(), version: STATE_VERSION };
          snaps.forEach((snap: any, i: number) => { const v = snap.exists ? snap.data()?.v : undefined; if (v !== undefined && v !== null) loaded[KEYS[i]] = v; });
          saved.current = { ...loaded };
          // Edits made while loading win for the keys they touched.
          const merged = { ...loaded } as any;
          touched.current.forEach((k) => { merged[k] = (ref.current as any)[k]; });
          ref.current = merged;
          setS(merged);
        }
        dbRef.current = { db, base };
        setSaveMode("account");
        if (!has) await persist(ref.current, true);
      } catch {
        setSaveMode(canUseLs() ? "browser" : "visit");
      }
      finish();
    })();
    return () => { cancelled = true; };
  }, [persist]);

  // Save after edits settle, and right away when the page is hidden or closed.
  useEffect(() => {
    if (!ready) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void persist(ref.current); }, 600);
    return () => window.clearTimeout(timer.current);
  }, [s, ready, persist]);
  useEffect(() => {
    const flush = () => { if (readyRef.current) void persist(ref.current); };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onVis); };
  }, [persist]);

  const toast = useCallback((text: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    setToasts([{ id, text, undo }]); // one message at a time
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), undo ? 8000 : 4000);
  }, []);

  const commit = useCallback((next: AppState) => {
    const prev = ref.current;
    if (next === prev) return;
    if (!readyRef.current) KEYS.forEach((k) => { if (prev[k] !== next[k]) touched.current.add(k); });
    ref.current = next;
    setS(next);
  }, []);

  const update = useCallback((fn: (s: AppState) => AppState, undoLabel?: string) => {
    const prev = ref.current;
    const next = fn(prev);
    if (next === prev) return;
    commit(next);
    if (undoLabel) {
      const inverse = makeInverse(prev, next);
      toast(undoLabel, () => commit(inverse(ref.current)));
    }
  }, [commit, toast]);

  const resetDemo = useCallback(() => {
    commit({ ...buildSample(), lang: ref.current.lang });
  }, [commit]);

  const value = useMemo<Store>(() => ({
    s, get: () => ref.current, update, toast: (t: string) => toast(t), toasts,
    dismiss: (id) => setToasts((t) => t.filter((x) => x.id !== id)), saveMode, ready, resetDemo,
  }), [s, update, toast, toasts, saveMode, ready, resetDemo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
