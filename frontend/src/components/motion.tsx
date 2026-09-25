import { animate, motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { api, useQuery } from "../lib/api";
import { LEVEL_STYLE, fmtVital } from "../lib/format";

/** Set --mx / --my on a `.spotlight` element so its glow follows the pointer. */
export function spotlight(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

/** Counts up to `value` the first time it scrolls into view. */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", className }: { value: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, value, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: setN });
    return () => c.stop();
  }, [inView, value, reduce]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {n.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** An endless strip of the ward's real latest readings, straight from the API. */
export function LiveTicker() {
  const q = useQuery((s) => api.patients(s), [], 15_000);
  const items = q.data?.length
    ? q.data.map((p) => ({ id: p.id, name: p.name, bed: p.bed, level: p.risk.level, hr: p.latest.hr, spo2: p.latest.spo2, sbp: p.latest.sbp, score: p.risk.score }))
    : null;
  if (!items) {
    return <div className="h-14 border-y border-line" />;
  }
  const row = (key: string) => (
    <div key={key} className="flex shrink-0 items-center">
      {items.map((p) => (
        <div key={p.id} className="flex items-center gap-4 px-7 font-mono text-[12px] tracking-wide whitespace-nowrap">
          <span className={`size-1.5 rounded-full ${LEVEL_STYLE[p.level].dot}`} />
          <span className="text-ink">{p.name.toUpperCase()}</span>
          <span className="text-faint">{p.bed}</span>
          <span className="text-muted">HR <span className="text-ink-2">{fmtVital("hr", p.hr)}</span></span>
          <span className="text-muted">SpO₂ <span className="text-ink-2">{fmtVital("spo2", p.spo2)}</span></span>
          <span className="text-muted">SBP <span className="text-ink-2">{fmtVital("sbp", p.sbp)}</span></span>
          <span className={LEVEL_STYLE[p.level].text}>AYU {p.score}</span>
          <span className="pl-3 text-faint">/</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="relative overflow-hidden border-y border-line bg-surface/40 py-4 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]" aria-label="Latest readings across the ward">
      <div className="marquee flex w-max">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

/* ---- Small generative visuals for cards (no images, all drawn) ---- */

export function Pulse({ className }: { className?: string }) {
  const path = "M0,20 L40,20 L48,20 L54,6 L60,34 L66,14 L70,20 L120,20 L128,20 L134,6 L140,34 L146,14 L150,20 L200,20";
  return (
    <svg viewBox="0 0 200 40" className={className} aria-hidden>
      <path d={path} fill="none" stroke="var(--line-2)" strokeWidth={1.2} />
      <motion.path
        d={path}
        fill="none"
        stroke="var(--teal)"
        strokeWidth={1.6}
        strokeLinecap="round"
        initial={{ pathLength: 0.15, pathOffset: 0 }}
        animate={{ pathOffset: [0, 0.85] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        style={{ filter: "drop-shadow(0 0 6px var(--glow))" }}
      />
    </svg>
  );
}

/** Lens 01 — the NEWS2 chart filling in, parameter by parameter. */
export function ArtNews2() {
  const params = [["RR", 2], ["SpO₂", 2], ["O₂", 0], ["Temp", 0], ["SBP", 0], ["HR", 1], ["AVPU", 0]] as const;
  return (
    <div className="flex h-28 items-end gap-2">
      {params.map(([k, v], i) => (
        <div key={k} className="flex flex-1 flex-col items-center gap-2">
          <motion.div
            className={`w-full rounded-md ${v === 0 ? "bg-surface-2" : v === 1 ? "bg-watch/70" : "bg-warning/80"}`}
            initial={{ height: 6 }}
            whileInView={{ height: 10 + v * 26 }}
            viewport={{ once: false, margin: "-40px" }}
            transition={{ duration: 0.8, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
          />
          <span className="font-mono text-[9px] text-muted">{k}</span>
        </div>
      ))}
    </div>
  );
}

/** Lens 02 — one trace wandering inside its own shaded band, forever. */
export function ArtBaseline() {
  const d = "M0,58 C20,50 30,64 50,56 S80,44 100,54 S130,66 150,52 S180,46 200,58 S230,64 250,52 S280,46 300,56 S330,64 350,54 S380,48 400,58";
  return (
    <div className="relative h-28">
      <div className="absolute top-2 left-1 font-mono text-[9px] tracking-[0.14em] text-teal">PERSONAL NORMAL · 7 DAYS</div>
      <svg viewBox="0 0 200 112" className="h-full w-full overflow-hidden" preserveAspectRatio="none" aria-hidden>
        <rect x={0} y={36} width={200} height={40} fill="var(--band)" rx={6} />
        <line x1={0} x2={200} y1={56} y2={56} stroke="var(--teal)" strokeOpacity={0.25} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <motion.path
          d={d}
          fill="none"
          stroke="var(--teal)"
          strokeWidth={1.8}
          vectorEffect="non-scaling-stroke"
          animate={{ x: [0, -200] }}
          transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
        />
      </svg>
    </div>
  );
}

/** Lens 03 — a slope being fitted through a slow fall. */
export function ArtTrend() {
  const pts = [18, 22, 20, 30, 27, 36, 40, 38, 50, 55, 52, 64, 70, 68, 80];
  return (
    <svg viewBox="0 0 200 112" className="h-28 w-full" aria-hidden>
      {pts.map((y, i) => (
        <motion.circle
          key={i}
          cx={8 + i * 13}
          cy={y + 10}
          r={2.4}
          fill="var(--ink-2)"
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 0.8, scale: 1 }}
          viewport={{ once: false, margin: "-40px" }}
          transition={{ delay: i * 0.05 }}
        />
      ))}
      <motion.line
        x1={6} y1={26} x2={192} y2={92}
        stroke="var(--watch)"
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: false, margin: "-40px" }}
        transition={{ duration: 1, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.5))" }}
      />
      <motion.text x={196} y={108} textAnchor="end" className="fill-watch font-mono" fontSize={9} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.6 }}>
        −0.9%/hr · 3 h
      </motion.text>
    </svg>
  );
}
