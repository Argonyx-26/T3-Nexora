import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Character } from "./Buddy";
import { cx } from "./ui";

/*
 * Small drawn and animated pieces for the app's screens (the landing page has its own).
 * All SVG, so they are crisp, theme-aware and work offline.
 */

/** A heart that beats at the given rate — e.g. the patient's live heart rate. */
export function BeatingHeart({ bpm, size = 22, className }: { bpm?: number | null; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const period = 60 / Math.min(180, Math.max(40, bpm || 72));
  return (
    <motion.svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cx("shrink-0 text-critical", className)}
      aria-hidden
      animate={reduce ? undefined : { scale: [1, 1.22, 1, 1.1, 1] }}
      transition={{ duration: period, times: [0, 0.14, 0.3, 0.42, 1], repeat: Infinity, ease: "easeOut" }}
      style={{ filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--critical) 55%, transparent))" }}
    >
      <path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
      <path d="M5 12h3l1.5-3 2 6 1.5-4 1 1h5" fill="none" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </motion.svg>
  );
}

/** A slow ECG strip that scrolls behind a header, in the patient's level colour and at their pace. */
export function PulseStrip({ bpm, color = "var(--teal)", className }: { bpm?: number | null; color?: string; className?: string }) {
  const reduce = useReducedMotion();
  const beat = "l20,0 l6,-10 l6,22 l6,-34 l6,26 l5,-4 l40,0";
  const d = `M0,40 ${Array.from({ length: 10 }).map(() => beat).join(" ")}`;
  const period = 60 / Math.min(180, Math.max(40, bpm || 72));
  return (
    <svg viewBox="0 0 890 60" preserveAspectRatio="none" className={cx("pointer-events-none", className)} aria-hidden>
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        animate={reduce ? undefined : { x: [0, -89] }}
        transition={{ duration: period, repeat: Infinity, ease: "linear" }}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
    </svg>
  );
}

/** "All quiet": a cup of chai, steam curling up. */
export function ChaiArt({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 120 100" className={className} role="img" aria-label="A cup of chai: all quiet">
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d={`M${48 + i * 12},40 c-6,-8 6,-12 0,-20 c-6,-8 6,-12 0,-18`}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={2.2}
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={reduce ? { opacity: 0.5 } : { opacity: [0, 0.7, 0], y: [6, -6, -14] }}
          transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
        />
      ))}
      <path d="M30,46 h56 l-6,34 c-1,6 -6,10 -12,10 h-20 c-6,0 -11,-4 -12,-10 z" fill="var(--surface-2)" stroke="var(--line-2)" strokeWidth={1.5} />
      <path d="M33,52 h50" stroke="#b45309" strokeWidth={6} strokeLinecap="round" opacity={0.55} />
      <path d="M86,54 c14,0 14,20 -2,20" fill="none" stroke="var(--line-2)" strokeWidth={4} strokeLinecap="round" />
      <ellipse cx={58} cy={94} rx={36} ry={4} fill="var(--line)" />
    </svg>
  );
}

/** A pill bottle with pills hopping out, one after another. */
export function PillsArt({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const pills = [
    { x: 74, c: "#2dd4bf" },
    { x: 88, c: "#a78bfa" },
    { x: 102, c: "#f472b6" },
  ];
  return (
    <svg viewBox="0 0 120 80" className={className} aria-hidden>
      <rect x={16} y={20} width={40} height={52} rx={8} fill="var(--surface-2)" stroke="var(--line-2)" strokeWidth={1.5} />
      <rect x={12} y={10} width={48} height={14} rx={5} fill="var(--teal)" />
      <rect x={22} y={34} width={28} height={20} rx={4} fill="var(--surface)" stroke="var(--line)" />
      <path d="M28,44 h16 M36,36 v16" stroke="var(--critical)" strokeWidth={3} strokeLinecap="round" />
      {pills.map((p, i) => (
        <motion.g
          key={i}
          animate={reduce ? undefined : { y: [0, -14, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.2, delay: i * 0.25, ease: "easeOut" }}
        >
          <rect x={p.x - 6} y={60} width={12} height={20} rx={6} transform={`rotate(-30 ${p.x} 70)`} fill={p.c} />
        </motion.g>
      ))}
    </svg>
  );
}

/** Two runners on two lanes: AYU reaches the flag first, NEWS2 later; the gap is the head start. */
export function RaceArt({ className, minutes = 65 }: { className?: string; minutes?: number }) {
  const reduce = useReducedMotion();
  const [k, setK] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setK((x) => x + 1), 6200);
    return () => window.clearInterval(t);
  }, [reduce]);
  const lane = (y: number, label: string, color: string, dur: number, delay: number) => (
    <g>
      <line x1={70} x2={400} y1={y} y2={y} stroke="var(--line-2)" strokeDasharray="2 6" />
      <text x={10} y={y + 4} className="font-mono" fontSize={11} fill={color} letterSpacing="0.08em">{label}</text>
      <motion.g
        key={`${label}-${k}`}
        initial={{ x: 0 }}
        animate={{ x: reduce ? 320 : 320 }}
        transition={{ duration: reduce ? 0 : dur, delay: reduce ? 0 : delay, ease: [0.3, 0.1, 0.3, 1] }}
      >
        <circle cx={78} cy={y} r={9} fill={color} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
        <path d={`M${70},${y} h-18`} stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
      </motion.g>
    </g>
  );
  return (
    <svg viewBox="0 0 440 120" className={className} role="img" aria-label={`AYU reaches urgent review about ${minutes} minutes before NEWS2`}>
      {lane(38, "AYU", "var(--teal)", 2.2, 0.3)}
      {lane(86, "NEWS2", "var(--muted)", 3.4, 0.3)}
      {/* finish flag */}
      <line x1={404} x2={404} y1={14} y2={108} stroke="var(--ink-2)" strokeWidth={2} />
      {[0, 1, 2, 3].map((r) =>
        [0, 1].map((c) => (
          <rect key={`${r}${c}`} x={406 + c * 8} y={14 + r * 8} width={8} height={8} fill={(r + c) % 2 ? "var(--ink)" : "var(--surface)"} stroke="var(--line-2)" strokeWidth={0.5} />
        )),
      )}
      <motion.g
        key={`gap-${k}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 2.6, duration: 0.5 }}
      >
        <rect x={300} y={50} width={96} height={24} rx={12} fill="var(--teal-soft)" />
        <text x={348} y={66} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--teal)">+{minutes} min</text>
      </motion.g>
    </svg>
  );
}

/** Ayu, waving: for headers on the app's screens. */
export function AyuWave({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [wave, setWave] = useState(1);
  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setWave((w) => w + 1), 5000);
    return () => window.clearInterval(t);
  }, [reduce]);
  return (
    <div className={className} aria-hidden>
      <Character wave={wave} reduce={!!reduce} />
    </div>
  );
}

/** Ayu lost: floating away on his balloon (for the 404). */
export function AyuLost({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      aria-hidden
      animate={reduce ? undefined : { y: [0, -14, 0], rotate: [-4, 4, -4] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
    >
      <Character moving reduce={!!reduce} />
    </motion.div>
  );
}
