import { AnimatePresence, motion } from "framer-motion";
import { BellRing, CircleCheck, Radio, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { DISCLAIMER, LEVEL_STYLE, fmtTime } from "../lib/format";
import { onAlert, useLive } from "../lib/live";
import type { AlertItem, Level } from "../lib/types";
import { LEVEL_ICON, ic } from "./icons";
import { EmptyState, cx } from "./ui";

/* ---------------- Sound (WebAudio, no asset files) ---------------- */

let audio: AudioContext | null = null;

function soundOn(): boolean {
  try {
    return localStorage.getItem("ayu-sound") !== "off";
  } catch {
    return true;
  }
}

if (typeof window !== "undefined") {
  // Browsers only allow audio after a gesture: unlock on the first click anywhere.
  window.addEventListener(
    "pointerdown",
    () => {
      try {
        audio ??= new AudioContext();
        void audio.resume();
      } catch {
        /* no audio on this device */
      }
    },
    { once: true },
  );
}

export function chime(level: Level) {
  if (!soundOn() || !audio || audio.state !== "running") return;
  const tones = level === "Critical" ? [880, 660, 880, 660] : level === "Warning" ? [740, 560] : [620];
  tones.forEach((f, i) => {
    const t = audio!.currentTime + i * 0.17;
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(audio!.destination);
    o.start(t);
    o.stop(t + 0.32);
  });
}

export function SoundToggle() {
  const [on, setOn] = useState(soundOn);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !on;
        setOn(next);
        try {
          localStorage.setItem("ayu-sound", next ? "on" : "off");
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted hover:text-ink"
      aria-pressed={on}
    >
      {on ? <Volume2 {...ic(12)} /> : <VolumeX {...ic(12)} />}
      Sound {on ? "on" : "off"}
    </button>
  );
}

/* ---------------- Live indicator ---------------- */

export function LiveStatus() {
  const live = useLive();
  const time = live.sim ? fmtTime(live.sim.sim_time) : null;
  const tone = live.status === "live" ? (live.sim?.paused ? "paused" : "live") : live.status;
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted" role="status" aria-live="polite">
      <span className={cx("size-1.5 rounded-full", tone === "live" ? "live-dot bg-stable" : tone === "paused" ? "bg-muted" : "bg-watch")} />
      <span className={cx("hidden sm:inline", tone === "live" && "text-ink-2")}>
        {tone === "live" ? "Live" : tone === "paused" ? "Paused" : tone === "connecting" ? "Connecting" : "Reconnecting"}
      </span>
      {time && <span className="hidden text-muted sm:inline">· {time} IST</span>}
      {live.sim && live.sim.speed > 1 && <span className="hidden text-teal sm:inline">· {live.sim.speed}×</span>}
    </div>
  );
}

/* ---------------- Toasts ---------------- */

interface Toast {
  key: string;
  alert: AlertItem;
  kind: "new" | "escalated";
}

/** New and escalated alerts slide in top-right with a chime; click to open the patient. */
export function AlertToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const navigate = useNavigate();
  useEffect(
    () =>
      onAlert((alert, kind) => {
        const key = `${alert.id}-${alert.level}-${Date.now()}`;
        chime(alert.level);
        setToasts((t) => [{ key, alert, kind }, ...t.filter((x) => x.alert.id !== alert.id)].slice(0, 3));
        setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), 8000);
      }),
    [],
  );
  return (
    <div className="pointer-events-none fixed top-20 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map(({ key, alert, kind }) => {
          const s = LEVEL_STYLE[alert.level];
          return (
            <motion.button
              key={key}
              type="button"
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              onClick={() => {
                setToasts((t) => t.filter((x) => x.key !== key));
                navigate(`/patients/${alert.patient_id}`);
              }}
              className={cx("pointer-events-auto rounded-2xl border bg-surface/95 p-4 text-left shadow-2xl backdrop-blur-xl", s.border)}
            >
              <div className="flex items-center gap-2">
                <LevelIcon level={alert.level} ring />
                <span className={cx("font-mono text-[10px] uppercase tracking-[0.14em]", s.text)}>
                  {kind === "escalated" ? "Escalated" : "New alert"} · {alert.level}
                </span>
                <span className="ml-auto font-mono text-[11px] text-muted">{fmtTime(alert.updated_at ?? alert.created_at)}</span>
              </div>
              <div className="mt-2 text-[15px] font-medium">
                {alert.patient_name} <span className="font-mono text-[12px] font-normal text-muted">{alert.bed}</span>
              </div>
              <div className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{alert.summary}</div>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Alert card + panel ---------------- */

export function AlertCard({ alert, compact = false }: { alert: AlertItem; compact?: boolean }) {
  const [mode, setMode] = useState<"idle" | "ack" | "busy">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const ref = useRef<HTMLTextAreaElement>(null);
  const s = LEVEL_STYLE[alert.level];
  const isNew = alert.status === "new";

  useEffect(() => {
    if (mode === "ack") ref.current?.focus();
  }, [mode]);

  const run = async (fn: () => Promise<unknown>) => {
    setMode("busy");
    setError(undefined);
    try {
      await fn();
      setMode("idle");
      setNote("");
    } catch (e) {
      setError((e as Error).message);
      setMode("ack");
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className={cx("relative overflow-hidden rounded-2xl border bg-surface p-4", isNew ? s.border : "border-line")}
    >
      {isNew && <span className={cx("absolute inset-y-0 left-0 w-[3px]", s.dot)} />}
      <div className="flex items-center gap-2">
        <LevelIcon level={alert.level} ring={isNew} />
        <span className={cx("text-[12px] font-medium", s.text)}>{alert.level}</span>
        {alert.prev_level && alert.prev_level !== alert.level && (
          <span className="font-mono text-[10px] text-faint">from {alert.prev_level}</span>
        )}
        <span
          className={cx(
            "ml-auto rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]",
            isNew ? cx(s.soft, s.text) : "bg-surface-2 text-muted",
          )}
        >
          {isNew ? "New" : "Acknowledged"}
        </span>
      </div>
      <Link to={`/patients/${alert.patient_id}`} className="mt-2 block hover:underline">
        <span className="text-[15px] font-medium">{alert.patient_name}</span>{" "}
        <span className="font-mono text-[11px] text-muted">{alert.bed} · score {alert.score}</span>
      </Link>
      <p className={cx("mt-1 text-[13px] leading-snug text-ink-2", compact && "line-clamp-2")}>{alert.summary}</p>
      <div className="mt-1 font-mono text-[10px] text-faint">
        raised {fmtTime(alert.created_at)}
        {alert.updated_at && ` · escalated ${fmtTime(alert.updated_at)}`}
      </div>
      {alert.status === "acknowledged" && (
        <div className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-[12px] text-ink-2">
          <span className="text-muted">{alert.acknowledged_by || "Doctor"}:</span> {alert.note || "Acknowledged"}
        </div>
      )}

      {mode === "ack" || (mode === "busy" && isNew) ? (
        <div className="mt-3">
          <textarea
            ref={ref}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Note for the team (optional)"
            className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-faint focus:border-line-2"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={mode === "busy"}
              onClick={() => run(() => api.ack(alert.id, note.trim()))}
              className="h-8 rounded-full bg-ink px-4 text-[12px] font-medium text-bg hover:bg-teal disabled:opacity-60"
            >
              {mode === "busy" ? "Saving…" : "Acknowledge"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className="h-8 rounded-full px-3 text-[12px] text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          {isNew ? (
            <button
              type="button"
              onClick={() => setMode("ack")}
              className="h-8 rounded-full bg-ink px-4 text-[12px] font-medium text-bg transition-colors hover:bg-teal"
            >
              Acknowledge
            </button>
          ) : (
            <button
              type="button"
              disabled={mode === "busy"}
              onClick={() => run(() => api.resolve(alert.id))}
              className="h-8 rounded-full border border-line-2 px-4 text-[12px] font-medium hover:border-ink disabled:opacity-60"
            >
              {mode === "busy" ? "Resolving…" : "Resolve"}
            </button>
          )}
          <Link to={`/patients/${alert.patient_id}`} className="grid h-8 place-items-center rounded-full px-3 text-[12px] text-muted hover:text-ink">
            Open patient →
          </Link>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-critical">{error}</p>}
    </motion.div>
  );
}

export function AlertsPanel() {
  const live = useLive();
  const alerts = live.alerts;
  const fresh = alerts.filter((a) => a.status === "new").length;
  return (
    <div className="rounded-3xl border border-line bg-surface/60 p-5 backdrop-blur">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-display text-[26px] leading-none">
          <BellRing {...ic(20)} className={fresh > 0 ? "bell-ring text-critical" : "text-muted"} />
          Alerts
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-muted tnum">
            {fresh > 0 ? <span className="text-critical">{fresh} new</span> : `${alerts.length} open`}
          </span>
          <SoundToggle />
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">Raised when a patient's level rises. New first.</p>
      <div className="mt-4 space-y-2">
        {live.status !== "live" && !live.sim ? (
          <EmptyState title="Connecting…" icon={Radio}>Waiting for the live monitor.</EmptyState>
        ) : alerts.length === 0 ? (
          <EmptyState title="All quiet" icon={CircleCheck}>No open alerts. Anyone whose level rises appears here first, with a sound.</EmptyState>
        ) : (
          <AnimatePresence initial={false}>
            {alerts.map((a) => (
              <AlertCard key={a.id} alert={a} compact />
            ))}
          </AnimatePresence>
        )}
      </div>
      <p className="mt-4 text-[10px] leading-relaxed text-faint">{DISCLAIMER}</p>
    </div>
  );
}

/** A risk level's icon in its colour; `ring` adds a soft pulse for alerts nobody has seen yet. */
function LevelIcon({ level, ring }: { level: Level; ring?: boolean }) {
  const Icon = LEVEL_ICON[level];
  const s = LEVEL_STYLE[level];
  return (
    <span className={cx("relative grid size-6 shrink-0 place-items-center rounded-full", s.soft, s.text)}>
      {ring && <span className={cx("absolute inset-0 rounded-full", level === "Critical" ? "pulse-critical" : "")} />}
      <Icon {...ic(13)} />
    </span>
  );
}
