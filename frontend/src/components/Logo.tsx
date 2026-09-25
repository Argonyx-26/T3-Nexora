import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";

/*
 * AYU's living mark: a rounded badge in the house spectrum (teal → sky → violet) with a
 * heartbeat that keeps drawing itself across it. Each beat gives the badge a small pulse
 * and a soft glow; hovering the parent `group` quickens the rhythm. Still for reduced motion.
 */

const BEAT = "M4,17 H10 L12.5,12 L15.5,23 L18.5,8 L21,19 L23,16 H28";
const PERIOD = 1.6; // seconds per beat, ~75 bpm

export function LogoMark({ size = 30, className, fast = false }: { size?: number; className?: string; fast?: boolean }) {
  const reduce = useReducedMotion();
  const id = useId().replace(/:/g, "");
  const period = fast ? PERIOD * 0.55 : PERIOD;
  return (
    <motion.svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden
      animate={reduce ? undefined : { scale: [1, 1.08, 1, 1.04, 1] }}
      transition={{ duration: period, times: [0, 0.18, 0.32, 0.44, 1], repeat: Infinity, ease: "easeOut" }}
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="0.55" stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <radialGradient id={`s${id}`} cx="0.3" cy="0.2" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={1} y={1} width={30} height={30} rx={9} fill={`url(#g${id})`} />
      <rect x={1} y={1} width={30} height={30} rx={9} fill={`url(#s${id})`} />
      {/* faint full trace underneath, bright trace drawing over it */}
      <path d={BEAT} fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <motion.path
        d={BEAT}
        fill="none"
        stroke="#fff"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: reduce ? 1 : 0, pathOffset: 0 }}
        animate={reduce ? undefined : { pathLength: [0, 0.55, 0.3, 0], pathOffset: [0, 0.2, 0.7, 1] }}
        transition={{ duration: period, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.svg>
  );
}

/** The wordmark: living mark + "AYU", with a dot that blinks on the beat. */
export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={className ?? "inline-flex items-center gap-2.5"}>
      <span className="relative inline-grid place-items-center">
        {/* a glow ring that swells on each beat */}
        {!reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-[10px] bg-[linear-gradient(135deg,#14b8a6,#0ea5e9,#8b5cf6)] blur-md"
            animate={{ opacity: [0.15, 0.55, 0.15], scale: [0.9, 1.15, 0.9] }}
            transition={{ duration: PERIOD, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <LogoMark size={size} className="relative transition-transform duration-500 group-hover:rotate-[-8deg]" />
      </span>
      <span className="font-display text-[26px] leading-none tracking-tight">AYU</span>
      <motion.span
        aria-hidden
        className="-ml-1 size-1.5 self-end rounded-full bg-teal"
        animate={reduce ? undefined : { opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
        transition={{ duration: PERIOD, repeat: Infinity, ease: "easeOut" }}
        style={{ marginBottom: 3 }}
      />
    </span>
  );
}
