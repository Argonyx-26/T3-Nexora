import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { LEVEL_STYLE } from "../lib/format";
import type { Level } from "../lib/types";

/*
 * One real run of the AYU engine (backend/app/risk), every 15 simulated minutes:
 * Priya Nair's SpO₂ drifting down ~1%/hr with RR and HR creeping up.
 * Not a mock-up — these are the scores the engine produced.
 */
const H = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 4.75, 5];
const SPO2 = [97, 97, 96, 95, 98, 96, 95, 96, 94, 94, 94, 94, 93, 93, 92, 91, 92, 91, 92, 90, 93];
const AYU = [0, 0, 4, 8, 4, 7, 16, 9, 32, 32, 42, 50, 43, 57, 66, 71, 61, 76, 68, 78, 67];
const NEWS2 = [0, 0, 1, 2, 1, 0, 2, 0, 2, 2, 2, 4, 2, 5, 5, 5, 5, 7, 5, 6, 5];
const BAND = { low: 94.5, high: 99.5 }; // her personal baseline ± 2.5σ

const ayuLevel = (s: number): Level => (s >= 75 ? "Critical" : s >= 50 ? "Warning" : s >= 25 ? "Watch" : "Stable");
const newsLevel = (t: number): Level => (t >= 7 ? "Critical" : t >= 5 ? "Warning" : "Stable");
const newsBand = (t: number) => (t >= 7 ? "High" : t >= 5 ? "Medium" : "Low");

const MILESTONES = [
  { h: 2.0, who: "AYU", text: "Watch", level: "Watch" as Level },
  { h: 2.75, who: "AYU", text: "Warning", level: "Warning" as Level },
  { h: 3.25, who: "NEWS2", text: "Medium", level: "Warning" as Level },
];

const W = 640;
const CH = 170; // chart height
const Y_MIN = 88;
const Y_MAX = 100;
const x = (h: number) => (h / 5) * W;
const y = (v: number) => 10 + (1 - (v - Y_MIN) / (Y_MAX - Y_MIN)) * (CH - 20);

/** Catmull-Rom → cubic Bézier, for a trace that reads like a monitor, not a bar chart. */
function smoothPath(pts: [number, number][]) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const TRACE = smoothPath(H.map((h, i) => [x(h), y(SPO2[i])]));
const PLAY_MS = 9000;
const HOLD_MS = 2600;

function fmtClock(h: number) {
  const mins = Math.round(h * 60);
  return `+${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

/** Plays on a loop by itself, or — given `progress` (0..1) — follows it, e.g. the scroll position. */
export function HeroMonitor({ progress }: { progress?: number }) {
  const reduce = useReducedMotion();
  const [loopT, setT] = useState(reduce ? 1 : 0); // 0 → 1 across the 5 hours
  const start = useRef<number>(0);
  const controlled = progress !== undefined;
  const t = controlled ? Math.min(1, Math.max(0, progress)) : loopT;

  useEffect(() => {
    if (reduce || controlled) return;
    let raf = 0;
    const loop = (now: number) => {
      if (!start.current) start.current = now;
      const elapsed = (now - start.current) % (PLAY_MS + HOLD_MS);
      setT(Math.min(1, elapsed / PLAY_MS));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduce, controlled]);

  const hours = t * 5;
  const idx = Math.min(H.length - 1, Math.floor(hours / 0.25));
  const aLevel = ayuLevel(AYU[idx]);
  // An alert, once raised, stays open until a doctor acknowledges it — even if the next score dips.
  const RANK: Level[] = ["Stable", "Watch", "Warning", "Critical"];
  const held = RANK[Math.max(...AYU.slice(0, idx + 1).map((v) => RANK.indexOf(ayuLevel(v))))];
  const heldOpen = RANK.indexOf(held) > RANK.indexOf(aLevel);
  const nTotal = NEWS2[idx];
  const reached = MILESTONES.filter((m) => hours >= m.h);
  const showLead = hours >= 3.25;

  return (
    <div className="relative rounded-[28px] border border-line bg-surface p-5 shadow-[0_1px_0_0_var(--line),0_30px_80px_-40px_rgba(15,118,110,0.35)] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Bed B-02 · Priya Nair, 29 · Asthma</div>
          <div className="mt-1 text-[13px] text-muted">SpO₂, simulated · one engine run</div>
        </div>
        <div className="text-right">
          <div className="eyebrow">Elapsed</div>
          <div className="font-mono text-[20px] tnum">{fmtClock(hours)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Readout label="SpO₂" value={`${SPO2[idx]}%`} />
        <Readout label="NEWS2" value={`${nTotal}`} sub={newsBand(nTotal)} level={newsLevel(nTotal)} />
        <Readout label="AYU" value={`${AYU[idx]}`} sub={heldOpen ? `${held} alert open` : aLevel} level={held} emphasis />
      </div>

      <svg viewBox={`0 0 ${W} ${CH}`} className="mt-5 w-full overflow-visible" role="img" aria-label="SpO2 slowly falling out of the patient's personal normal band over five hours">
        <defs>
          <clipPath id="hero-reveal">
            <rect x={0} y={-20} height={CH + 40} width={Math.max(0.01, x(hours))} />
          </clipPath>
          <linearGradient id="hero-stroke" x1="0" x2="1">
            <stop offset="0" stopColor="var(--teal)" />
            <stop offset="0.55" stopColor="var(--watch)" />
            <stop offset="1" stopColor="var(--critical)" />
          </linearGradient>
        </defs>
        <rect x={0} width={W} y={y(BAND.high)} height={y(BAND.low) - y(BAND.high)} fill="var(--band)" rx={6} />
        <text x={8} y={y(BAND.high) + 14} className="fill-teal font-mono" fontSize={10} letterSpacing="0.1em">
          HER PERSONAL NORMAL
        </text>
        {[92, 96].map((v) => (
          <g key={v}>
            <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line-2)" strokeDasharray="3 5" />
            <text x={W - 4} y={y(v) - 5} textAnchor="end" className="fill-faint font-mono" fontSize={10}>{v}%</text>
          </g>
        ))}
        <path d={TRACE} fill="none" stroke="var(--line-2)" strokeWidth={1.5} strokeDasharray="2 4" />
        <path d={TRACE} fill="none" stroke="url(#hero-stroke)" strokeWidth={2.5} strokeLinecap="round" clipPath="url(#hero-reveal)" />
        {MILESTONES.map((m) => (
          <motion.line
            key={m.h + m.who}
            x1={x(m.h)} x2={x(m.h)} y1={0} y2={CH}
            stroke={LEVEL_STYLE[m.level].hex}
            strokeWidth={1}
            strokeDasharray="2 3"
            initial={false}
            animate={{ opacity: hours >= m.h ? 0.7 : 0 }}
          />
        ))}
        <line x1={x(hours)} x2={x(hours)} y1={0} y2={CH} stroke="var(--ink)" strokeOpacity={0.25} />
        <circle cx={x(hours)} cy={y(SPO2[idx])} r={4.5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />
      </svg>

      <div className="mt-3 space-y-2">
        <Lane label="AYU" levels={AYU.map(ayuLevel)} hours={hours} />
        <Lane label="NEWS2" levels={NEWS2.map(newsLevel)} hours={hours} />
      </div>

      <div className="mt-5 flex min-h-[44px] flex-wrap items-center gap-2">
        <AnimatePresence initial={false}>
          {reached.map((m) => (
            <motion.span
              key={m.h + m.who}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] ${LEVEL_STYLE[m.level].soft} ${LEVEL_STYLE[m.level].text}`}
            >
              <span className="font-mono tnum opacity-80">{fmtClock(m.h)}</span>
              <span className="font-medium">{m.who} → {m.text}</span>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {showLead && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-[13px] leading-relaxed text-ink-2"
          >
            AYU raised <span className="text-watch">Watch</span> 75 minutes and <span className="text-warning">Warning</span> 30 minutes
            before NEWS2 left Low. Every point came from SpO₂ drifting within ranges NEWS2 still called near-normal.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Readout({ label, value, sub, level, emphasis }: { label: string; value: string; sub?: string; level?: Level; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl border px-3 py-2.5 transition-colors duration-500 ${emphasis && level ? `${LEVEL_STYLE[level].soft} border-transparent` : "border-line"}`}>
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="font-mono text-[22px] leading-none tnum">{value}</span>
        {sub && <span className={`text-[12px] font-medium transition-colors duration-500 ${level ? LEVEL_STYLE[level].text : "text-muted"}`}>{sub}</span>}
      </div>
    </div>
  );
}

function Lane({ label, levels, hours }: { label: string; levels: Level[]; hours: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 shrink-0 font-mono text-[10px] tracking-[0.12em] text-muted">{label}</div>
      <div className="relative flex h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        {levels.slice(1).map((lv, i) => {
          const segStart = H[i];
          const visible = hours > segStart;
          return (
            <div
              key={i}
              className={`h-full flex-1 transition-opacity duration-300 ${LEVEL_STYLE[lv].dot}`}
              style={{ opacity: visible ? (lv === "Stable" ? 0.35 : 1) : 0 }}
            />
          );
        })}
      </div>
    </div>
  );
}
