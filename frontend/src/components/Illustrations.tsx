import { motion, useReducedMotion } from "framer-motion";
import { cx } from "./ui";

/*
 * Flat, friendly illustrations drawn in SVG (no image files, so they stay sharp, theme with
 * the page and work offline). Same visual language as Ayu, the landing page's guide.
 */

const SKIN_A = "#c98d62";
const SKIN_A_SHADE = "#b27650";
const SKIN_B = "#a86b45";
const SKIN_B_SHADE = "#8f5838";
const SKIN_C = "#d9a27c";
const HAIR = "#2a1b14";
const GREY = "#cbd5e1";

function Blink({ cx, cy, children }: { cx: number; cy: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.g
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1, 1] }}
      transition={{ duration: 4.6, times: [0, 0.9, 0.93, 0.96, 1], repeat: Infinity, delay: (cx % 7) * 0.3 }}
    >
      {children}
    </motion.g>
  );
}

const bob = (d = 3, delay = 0) => ({
  animate: { y: [0, -3, 0] },
  transition: { duration: d, repeat: Infinity, ease: "easeInOut" as const, delay },
});

/** A doctor checking the ward on her tablet; one bed glows amber. */
export function DoctorArt({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 240 220" className={cx("overflow-visible", className)} role="img" aria-label="A doctor checking the ward on a tablet">
      <ellipse cx={120} cy={210} rx={70} ry={7} fill="#000" opacity={0.12} />
      <motion.g {...(reduce ? {} : bob(3.4))}>
        {/* legs */}
        <rect x={100} y={168} width={14} height={38} rx={6} fill="#334155" />
        <rect x={124} y={168} width={14} height={38} rx={6} fill="#334155" />
        <ellipse cx={106} cy={207} rx={11} ry={5} fill="#1e293b" />
        <ellipse cx={132} cy={207} rx={11} ry={5} fill="#1e293b" />
        {/* white coat over teal scrubs */}
        <path d="M84,112 C84,98 100,90 120,90 C140,90 156,98 156,112 L160,176 C160,180 157,182 153,182 L87,182 C83,182 80,180 80,176 Z" fill="#f8fafc" stroke={GREY} />
        <path d="M108,92 L120,112 L132,92 Z" fill="var(--teal)" />
        <path d="M120,112 L120,180" stroke={GREY} />
        <rect x={132} y={128} width={16} height={12} rx={3} fill="none" stroke={GREY} />
        <path d="M134,128 v-4 M138,128 v-6" stroke="#0ea5e9" strokeWidth={2} strokeLinecap="round" />
        {/* stethoscope */}
        <path d="M106,96 C98,114 104,130 116,132 C126,134 134,122 132,100" fill="none" stroke="#64748b" strokeWidth={2.4} strokeLinecap="round" />
        <circle cx={116} cy={135} r={4.2} fill="#e2e8f0" stroke="#64748b" strokeWidth={1.6} />
        {/* arms holding the tablet */}
        <path d="M86,118 C80,134 84,146 98,150" fill="none" stroke="#f8fafc" strokeWidth={13} strokeLinecap="round" />
        <path d="M86,118 C80,134 84,146 98,150" fill="none" stroke={GREY} strokeWidth={1} strokeLinecap="round" opacity={0.6} />
        <path d="M154,118 C160,134 156,146 142,150" fill="none" stroke="#f8fafc" strokeWidth={13} strokeLinecap="round" />
        {/* the tablet: a tiny ward */}
        <g>
          <rect x={92} y={128} width={56} height={40} rx={6} fill="#0f172a" />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = 98 + (i % 3) * 16;
            const y = 134 + Math.floor(i / 3) * 16;
            const hot = i === 4;
            return hot ? (
              <motion.rect
                key={i} x={x} y={y} width={12} height={11} rx={2.5} fill="#fbbf24"
                animate={reduce ? undefined : { opacity: [1, 0.45, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            ) : (
              <rect key={i} x={x} y={y} width={12} height={11} rx={2.5} fill="#2dd4bf" opacity={0.85} />
            );
          })}
        </g>
        <circle cx={98} cy={150} r={6} fill={SKIN_A} />
        <circle cx={142} cy={150} r={6} fill={SKIN_A} />
        {/* head */}
        <rect x={113} y={78} width={14} height={14} rx={4} fill={SKIN_A_SHADE} />
        <circle cx={120} cy={62} r={24} fill={SKIN_A} />
        <path d="M95,64 C92,40 110,32 122,33 C138,34 148,46 145,64 C140,52 132,47 120,47 C108,47 100,54 95,64 Z" fill={HAIR} />
        <circle cx={140} cy={36} r={10} fill={HAIR} />
        <Blink cx={120} cy={64}>
          <ellipse cx={111} cy={64} rx={2.8} ry={3.4} fill="#1f1510" />
          <ellipse cx={129} cy={64} rx={2.8} ry={3.4} fill="#1f1510" />
        </Blink>
        <circle cx={105} cy={71} r={3.4} fill="#f472b6" opacity={0.3} />
        <circle cx={135} cy={71} r={3.4} fill="#f472b6" opacity={0.3} />
        <path d="M113,73 q7,6 14,0" fill="none" stroke="#7f1d1d" strokeWidth={2} strokeLinecap="round" />
        <circle cx={120} cy={50} r={2.2} fill="#f43f5e" />
      </motion.g>
      {/* a pinging notification above the tablet */}
      <motion.g
        animate={reduce ? undefined : { y: [0, -4, 0], opacity: [0.9, 1, 0.9] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <rect x={152} y={70} width={78} height={26} rx={13} fill="#fbbf24" />
        <text x={191} y={87} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#422006" fontFamily="ui-sans-serif, system-ui">Watch · B-02</text>
        <path d="M168,96 l-6,8 l12,-4 z" fill="#fbbf24" />
      </motion.g>
    </svg>
  );
}

/** A grandmother and an ASHA worker; the phone says she's fine, in Hindi. */
export function PatientArt({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 260 220" className={className} role="img" aria-label="An ASHA worker checking on a grandmother with a phone">
      <ellipse cx={130} cy={210} rx={100} ry={7} fill="#000" opacity={0.12} />

      {/* grandmother, in a lilac sari, with glasses */}
      <motion.g {...(reduce ? {} : bob(3.8, 0.4))}>
        <path d="M48,120 C48,104 60,96 76,96 C92,96 104,104 104,120 L110,206 L42,206 Z" fill="#a78bfa" />
        <path d="M60,98 C72,120 92,150 108,190" fill="none" stroke="#7c3aed" strokeWidth={9} strokeLinecap="round" opacity={0.75} />
        <path d="M50,124 C44,140 48,156 60,160" fill="none" stroke="#a78bfa" strokeWidth={11} strokeLinecap="round" />
        <circle cx={62} cy={160} r={5.5} fill={SKIN_B} />
        {/* walking stick */}
        <path d="M62,160 L56,206" stroke="#92400e" strokeWidth={3} strokeLinecap="round" />
        <rect x={70} y={84} width={12} height={14} rx={4} fill={SKIN_B_SHADE} />
        <circle cx={76} cy={68} r={22} fill={SKIN_B} />
        <path d="M54,66 C52,48 64,42 76,42 C90,42 100,50 98,66 C94,56 86,52 76,52 C66,52 58,58 54,66 Z" fill="#e5e7eb" />
        <circle cx={76} cy={42} r={9} fill="#e5e7eb" />
        <Blink cx={76} cy={70}>
          <ellipse cx={68} cy={70} rx={2.4} ry={3} fill="#1f1510" />
          <ellipse cx={84} cy={70} rx={2.4} ry={3} fill="#1f1510" />
        </Blink>
        <circle cx={68} cy={70} r={6} fill="none" stroke="#475569" strokeWidth={1.6} />
        <circle cx={84} cy={70} r={6} fill="none" stroke="#475569" strokeWidth={1.6} />
        <path d="M74,70 h4" stroke="#475569" strokeWidth={1.6} />
        <circle cx={76} cy={62} r={1.8} fill="#dc2626" />
        <path d="M70,80 q6,5 12,0" fill="none" stroke="#7f1d1d" strokeWidth={1.8} strokeLinecap="round" />
      </motion.g>

      {/* ASHA worker, in a pink sari with her badge, holding the phone */}
      <motion.g {...(reduce ? {} : bob(3.2))}>
        <path d="M150,116 C150,100 164,92 182,92 C200,92 214,100 214,116 L220,206 L144,206 Z" fill="#f472b6" />
        <path d="M160,94 C176,118 196,150 214,190" fill="none" stroke="#db2777" strokeWidth={9} strokeLinecap="round" opacity={0.8} />
        <rect x={188} y={124} width={20} height={11} rx={2.5} fill="#fff" />
        <text x={198} y={132.4} textAnchor="middle" fontSize={6.4} fontWeight={800} fill="#db2777" fontFamily="ui-sans-serif, system-ui">ASHA</text>
        {/* arm up, holding the phone out to the grandmother */}
        <path d="M156,120 C142,124 132,128 124,122" fill="none" stroke="#f472b6" strokeWidth={11} strokeLinecap="round" />
        <circle cx={122} cy={121} r={5.5} fill={SKIN_C} />
        <rect x={108} y={98} width={24} height={40} rx={5} fill="#0f172a" />
        <rect x={110.5} y={102} width={19} height={31} rx={3} fill="#ecfdf5" />
        <motion.path
          d="M114,118 l4,4 l8,-9" fill="none" stroke="#16a34a" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1, 1, 0] }}
          transition={{ duration: 3.2, times: [0, 0.3, 0.85, 1], repeat: Infinity }}
        />
        <rect x={176} y={80} width={12} height={14} rx={4} fill={SKIN_C} />
        <circle cx={182} cy={64} r={22} fill={SKIN_C} />
        <path d="M159,66 C156,44 170,38 182,38 C196,38 206,46 205,66 C200,54 192,50 182,50 C172,50 164,56 159,66 Z" fill={HAIR} />
        <path d="M204,58 C212,70 210,90 202,100" fill="none" stroke={HAIR} strokeWidth={7} strokeLinecap="round" />
        <Blink cx={182} cy={66}>
          <ellipse cx={174} cy={66} rx={2.6} ry={3.2} fill="#1f1510" />
          <ellipse cx={190} cy={66} rx={2.6} ry={3.2} fill="#1f1510" />
        </Blink>
        <circle cx={182} cy={56} r={2.2} fill="#dc2626" />
        <circle cx={168} cy={73} r={3.2} fill="#f472b6" opacity={0.35} />
        <circle cx={196} cy={73} r={3.2} fill="#f472b6" opacity={0.35} />
        <path d="M175,76 q7,6 14,0" fill="none" stroke="#7f1d1d" strokeWidth={2} strokeLinecap="round" />
      </motion.g>

      {/* the speech bubble: "you're fine" in Hindi */}
      <motion.g
        initial={{ opacity: 0, scale: 0.8 }}
        animate={reduce ? { opacity: 1, scale: 1 } : { opacity: [0, 1, 1, 0], scale: [0.8, 1, 1, 0.9] }}
        transition={{ duration: 3.2, times: [0, 0.25, 0.85, 1], repeat: Infinity }}
        style={{ transformOrigin: "120px 70px" }}
      >
        <rect x={86} y={46} width={82} height={26} rx={13} fill="#16a34a" />
        <text x={127} y={63} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#fff" fontFamily="ui-sans-serif, system-ui">आप ठीक हैं ✓</text>
        <path d="M118,72 l2,8 l6,-8 z" fill="#16a34a" />
      </motion.g>
    </svg>
  );
}
