import { useSyncExternalStore } from "react";
import { API_URL } from "./api";
import type { AlertItem, LiveUpdate, SimState, Vital } from "./types";

/*
 * One WebSocket for the whole app (/ws/live), shared by every screen.
 * Reconnects with backoff, keeps the last snapshot while offline, and lets screens
 * subscribe to "a new or escalated alert just arrived" for toasts and sound.
 */

export type LiveStatus = "connecting" | "live" | "offline";

export interface LiveState {
  status: LiveStatus;
  sim: SimState | null;
  patients: Record<string, LiveUpdate>;
  trail: Record<string, Vital[]>; // recent live readings per patient, for sparklines
  alerts: AlertItem[]; // open alerts, newest first
  seq: number; // bumps on every message; screens use it to refetch details
}

const TRAIL = 48;
const WS_URL = API_URL.replace(/^http/, "ws") + "/ws/live";

let state: LiveState = { status: "connecting", sim: null, patients: {}, trail: {}, alerts: [], seq: 0 };
const listeners = new Set<() => void>();
const alertListeners = new Set<(a: AlertItem, kind: "new" | "escalated") => void>();
let socket: WebSocket | null = null;
let retry = 0;
let started = false;
let pingTimer: ReturnType<typeof setInterval> | undefined;

function set(next: Partial<LiveState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function sortAlerts(list: AlertItem[]) {
  const rank = { new: 0, acknowledged: 1, resolved: 2 };
  return [...list].sort((a, b) => rank[a.status] - rank[b.status] || (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
}

function applyAlerts(incoming: AlertItem[], kind: "new" | "escalated" | "change") {
  if (!incoming.length) return state.alerts;
  const byId = new Map(state.alerts.map((a) => [a.id, a]));
  for (const a of incoming) {
    if (a.status === "resolved") byId.delete(a.id);
    else byId.set(a.id, a);
    if (kind !== "change") alertListeners.forEach((l) => l(a, kind));
    else if (a.status === "new" && a.updated_at) alertListeners.forEach((l) => l(a, "escalated"));
  }
  return sortAlerts([...byId.values()]);
}

function applyUpdates(updates: LiveUpdate[], reset = false) {
  const patients = reset ? {} : { ...state.patients };
  const trail = reset ? {} : { ...state.trail };
  for (const u of updates) {
    patients[u.patient_id] = u;
    const prev = trail[u.patient_id] ?? [];
    if (prev.length && prev[prev.length - 1].ts === u.vitals.ts) continue;
    trail[u.patient_id] = [...prev, u.vitals].slice(-TRAIL);
  }
  return { patients, trail };
}

type Message =
  | { type: "snapshot"; sim: SimState; updates: LiveUpdate[]; alerts: AlertItem[] }
  | { type: "tick" | "update"; sim: SimState; updates: LiveUpdate[]; new_alerts: AlertItem[]; alert_updates: AlertItem[] }
  | { type: "alert"; sim: SimState; alert_updates: AlertItem[] }
  | { type: "sim"; sim: SimState }
  | { type: "pong" };

function handle(msg: Message) {
  switch (msg.type) {
    case "snapshot":
      set({ sim: msg.sim, ...applyUpdates(msg.updates, true), alerts: sortAlerts(msg.alerts), seq: state.seq + 1 });
      break;
    case "tick":
    case "update": {
      const { patients, trail } = applyUpdates(msg.updates);
      let alerts = applyAlerts(msg.new_alerts, "new");
      state = { ...state, alerts };
      alerts = applyAlerts(msg.alert_updates, "escalated");
      set({ sim: msg.sim, patients, trail, alerts, seq: state.seq + 1 });
      break;
    }
    case "alert":
      set({ sim: msg.sim, alerts: applyAlerts(msg.alert_updates, "change"), seq: state.seq + 1 });
      break;
    case "sim":
      set({ sim: msg.sim });
      break;
  }
}

function connect() {
  set({ status: state.sim ? "offline" : "connecting" });
  let ws: WebSocket;
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    set({ status: "live" });
    clearInterval(pingTimer);
    pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 20_000);
  };
  ws.onmessage = (e) => {
    try {
      handle(JSON.parse(e.data as string) as Message);
    } catch {
      /* one malformed message must not break the stream */
    }
  };
  ws.onclose = () => {
    clearInterval(pingTimer);
    if (socket === ws) {
      socket = null;
      set({ status: "offline" });
      scheduleReconnect();
    }
  };
  ws.onerror = () => ws.close();
}

function scheduleReconnect() {
  const delay = Math.min(8000, 500 * 2 ** retry++);
  setTimeout(connect, delay);
}

function ensureStarted() {
  if (started || typeof window === "undefined") return;
  started = true;
  connect();
  // Reconnect at once when the laptop wakes or the network comes back.
  window.addEventListener("online", () => socket === null && connect());
}

function subscribe(l: () => void) {
  ensureStarted();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLive(): LiveState {
  return useSyncExternalStore(subscribe, () => state);
}

export function onAlert(cb: (a: AlertItem, kind: "new" | "escalated") => void) {
  ensureStarted();
  alertListeners.add(cb);
  return () => {
    alertListeners.delete(cb);
  };
}
