import {
  AnimatePresence,
  backOut,
  cubicBezier,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { BellRing, CircleCheck, HeartPulse, Stethoscope } from "lucide-react";
import { useRef, useState } from "react";
import { cx } from "./ui";

/*
 * The landing page's scroll story: a small hospital builds itself as you scroll — floors
 * drop into place, ten beds light up, an ambulance pulls in — then one bed starts to slide,
 * AYU's alert travels to the doctor's phone while NEWS2 still reads Low, and the doctor
 * reviews it. Everything is driven by scroll position, so the reader sets the pace.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const easeOut = cubicBezier(0.22, 1, 0.36, 1);

const STEPS = [
  { at: 0, lead: "Ten beds,", accent: "ten normals.", body: "A runner, a grandmother with COPD, a young man two days after surgery. AYU learns what is normal for each of them — not for the average patient." },
  { at: 0.3, lead: "Every bed,", accent: "every five minutes.", body: "Readings come from bedside monitors, nurses, patients and ASHA workers. Each one re-scores that patient against their own baseline and trend." },
  { at: 0.5, lead: "One bed starts", accent: "to slide.", body: "Bed S-04: heart rate and temperature creep up for two hours. Reading by reading, NEWS2 still calls it near-normal." },
  { at: 0.64, lead: "AYU tells the doctor", accent: "first.", body: "A Warning — with every reason named — reaches the doctor's phone while NEWS2 still reads Low." },
  { at: 0.8, lead: "Reviewed", accent: "in time.", body: "The doctor sees him within the hour. That is the whole point of AYU: time, given back to the people who need it." },
] as const;

// Scene geometry (drawn on a 900 × 600 canvas; the viewBox crops to the building).
const GROUND = 500;
const FLOOR_H = 84;
const BX = 250;
const BW = 400;
const WIN_W = 48;
const WIN_H = 40;
const winX = (i: number) => BX + 30 + i * 73;
const FLOORS = [
  { y: GROUND - FLOOR_H, in: [0.04, 0.12] },
  { y: GROUND - FLOOR_H * 2, in: [0.1, 0.18] },
  { y: GROUND - FLOOR_H * 3, in: [0.16, 0.24] },
] as const;
const ROOF_Y = GROUND - FLOOR_H * 3;
// The ten beds: two upper floors of five. Bed S-04 is the one that slides.
const BEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ i, floor: i < 5 ? 2 : 1, col: i % 5 }));
const HOT = 8; // floor 1 (middle), column 3
const bedPos = (b: { floor: number; col: number }) => ({ x: winX(b.col), y: FLOORS[b.floor].y + 22 });
const HOT_POS = bedPos(BEDS[HOT]);
const HOT_C = { x: HOT_POS.x + WIN_W - 4, y: HOT_POS.y + 4 }; // the signal leaves from the window's top-right corner
const PHONE = { x: 712, y: 214, w: 150, h: 262 };
const SIG_END = { x: PHONE.x + 10, y: PHONE.y + 92 };
const SIG_CTRL = { x: 640, y: 150 };
const SIG_PATH = `M${HOT_C.x},${HOT_C.y} Q${SIG_CTRL.x},${SIG_CTRL.y} ${SIG_END.x},${SIG_END.y}`;
const quad = (t: number, a: number, b: number, c: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

function useStep(p: MotionValue<number>) {
  const [step, setStep] = useState(0);
  useMotionValueEvent(p, "change", (v) => {
    let s = 0;
    STEPS.forEach((x, i) => {
      if (v >= x.at) s = i;
    });
    setStep((prev) => (prev === s ? prev : s));
  });
  return step;
}

export function HospitalStory() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const step = useStep(p);
  const s = STEPS[step];

  return (
    <section ref={ref} data-guide="hospital" className="relative h-[420vh] border-b border-line" aria-label="How AYU works on a ward">
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_62%_58%,var(--teal-soft),transparent_58%)]" />
        <div className="mx-auto grid w-full max-w-[1400px] items-center gap-6 px-4 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          <div className="order-2 lg:order-1">
            <div className="eyebrow flex items-center gap-3"><span className="h-px w-8 bg-line-2" />A day on the ward</div>
            <div className="relative mt-4 min-h-[210px] sm:min-h-[250px] lg:mt-8 lg:min-h-[300px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -24, filter: "blur(8px)" }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <h2 className="font-display text-[clamp(36px,5.2vw,84px)] leading-[0.94]">
                    {s.lead}{" "}
                    <span className={cx("accent", step === 2 || step === 3 ? "text-warning" : "text-teal")}>{s.accent}</span>
                  </h2>
                  <p className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-ink-2 sm:text-[17px] lg:mt-6 lg:text-[18px]">{s.body}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="mt-2 flex max-w-[460px] gap-1.5">
              {STEPS.map((_, i) => (
                <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.span className="block h-full bg-teal" animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.5 }} />
                </span>
              ))}
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <Scene p={p} step={step} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Scene({ p, step }: { p: MotionValue<number>; step: number }) {
  // Ground and road
  const groundLen = useTransform(p, [0, 0.06], [0, 1]);
  const roofY = useTransform(p, [0.22, 0.3], [-420, 0], { ease: backOut });
  const roofO = useTransform(p, [0.22, 0.26], [0, 1]);
  const signO = useTransform(p, [0.28, 0.34], [0, 1]);
  const ambX = useTransform(p, [0.36, 0.5], [-420, 0], { ease: easeOut });
  const ambO = useTransform(p, [0.36, 0.38], [0, 1]);
  // The hot bed: teal → amber → orange, then calm again once reviewed.
  const amber = useTransform(p, [0.52, 0.58, 0.84, 0.9], [0, 1, 1, 0]);
  const orange = useTransform(p, [0.58, 0.66, 0.84, 0.9], [0, 1, 1, 0]);
  const hotRing = useTransform(p, [0.56, 0.62, 0.84, 0.88], [0, 1, 1, 0]);
  // The signal and the phone
  const sigLen = useTransform(p, [0.64, 0.74], [0, 1]);
  const sigO = useTransform(p, [0.64, 0.66, 0.86, 0.9], [0, 1, 1, 0]);
  const dotT = useTransform(p, [0.64, 0.74], [0, 1]);
  const dotX = useTransform(dotT, (t) => quad(t, HOT_C.x, SIG_CTRL.x, SIG_END.x));
  const dotY = useTransform(dotT, (t) => quad(t, HOT_C.y, SIG_CTRL.y, SIG_END.y));
  const dotO = useTransform(p, [0.64, 0.65, 0.73, 0.75], [0, 1, 1, 0]);
  const phoneO = useTransform(p, [0.6, 0.66], [0, 1]);
  const phoneY = useTransform(p, [0.6, 0.68], [40, 0], { ease: easeOut });
  const checkO = useTransform(p, [0.82, 0.86], [0, 1]);

  return (
    <svg viewBox="96 150 784 414" className="h-auto max-h-[50svh] w-full lg:max-h-[80svh]" role="img" aria-label="A small hospital builds itself; one bed turns amber and AYU alerts the doctor's phone">
      <defs>
        <filter id="hs-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="hs-facade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--surface-2)" />
          <stop offset="1" stopColor="var(--surface)" />
        </linearGradient>
        <linearGradient id="hs-road" x1="0" x2="1">
          <stop offset="0" stopColor="var(--line)" stopOpacity="0" />
          <stop offset="0.2" stopColor="var(--line-2)" />
          <stop offset="0.8" stopColor="var(--line-2)" />
          <stop offset="1" stopColor="var(--line)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Ground, road and its dashes */}
      <motion.line x1={40} x2={860} y1={GROUND} y2={GROUND} stroke="var(--line-2)" strokeWidth={1.5} style={{ pathLength: groundLen }} />
      <motion.g style={{ opacity: groundLen }}>
        <rect x={40} y={GROUND + 34} width={820} height={1.5} fill="url(#hs-road)" />
        {Array.from({ length: 14 }).map((_, i) => (
          <rect key={i} x={70 + i * 58} y={GROUND + 18} width={26} height={2} rx={1} fill="var(--line-2)" />
        ))}
      </motion.g>

      {/* Floors drop in, bottom first */}
      {FLOORS.map((f, fi) => (
        <Floor key={fi} p={p} y={f.y} range={f.in} ground={fi === 0} />
      ))}

      {/* Roof, sign and antenna */}
      <motion.g style={{ y: roofY, opacity: roofO }}>
        <rect x={BX - 10} y={ROOF_Y - 14} width={BW + 20} height={14} rx={3} fill="var(--surface-2)" stroke="var(--line-2)" />
        <rect x={BX + 130} y={ROOF_Y - 58} width={140} height={40} rx={10} fill="var(--surface)" stroke="var(--line-2)" />
        <line x1={BW + BX - 40} x2={BW + BX - 40} y1={ROOF_Y - 14} y2={ROOF_Y - 64} stroke="var(--line-2)" strokeWidth={2} />
        <circle cx={BW + BX - 40} cy={ROOF_Y - 66} r={3.5} fill="var(--teal)" />
      </motion.g>
      <motion.g style={{ opacity: signO }}>
        <g filter="url(#hs-glow)">
          <rect x={BX + 146} y={ROOF_Y - 48} width={20} height={20} rx={3} fill="none" />
          <path d={`M${BX + 152},${ROOF_Y - 46} h8 v6 h6 v8 h-6 v6 h-8 v-6 h-6 v-8 h6 z`} fill="var(--critical)" />
          <text x={BX + 178} y={ROOF_Y - 31} className="fill-ink font-display" fontSize={22} letterSpacing="-0.02em">AYU</text>
          <circle cx={BX + 236} cy={ROOF_Y - 38} r={3.5} fill="var(--teal)" />
        </g>
        {/* the antenna breathes once the ward is live */}
        {step >= 1 &&
          [0, 1, 2].map((i) => (
            <motion.circle
              key={i}
              cx={BW + BX - 40}
              cy={ROOF_Y - 66}
              r={8}
              fill="none"
              stroke="var(--teal)"
              initial={{ scale: 0.4, opacity: 0.7 }}
              animate={{ scale: 3.2, opacity: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
              style={{ transformOrigin: `${BW + BX - 40}px ${ROOF_Y - 66}px` }}
            />
          ))}
      </motion.g>

      {/* The ten beds light up one by one */}
      {BEDS.map((b, k) => (
        <Bed key={b.i} p={p} at={0.3 + k * 0.016} {...bedPos(b)} hot={b.i === HOT} amber={amber} orange={orange} ring={hotRing} />
      ))}

      {/* Ambulance pulls up to the entrance */}
      <motion.g style={{ x: ambX, opacity: ambO }}>
        <Ambulance x={BX + 390} y={GROUND + 4} />
      </motion.g>

      {/* The alert: a signal arcs from bed S-04 to the doctor's phone */}
      <motion.path d={SIG_PATH} fill="none" stroke="var(--warning)" strokeWidth={2} strokeDasharray="1 7" strokeLinecap="round" style={{ pathLength: sigLen, opacity: sigO }} />
      <motion.circle r={6} fill="var(--warning)" filter="url(#hs-glow)" style={{ cx: dotX, cy: dotY, opacity: dotO }} />

      <motion.g style={{ opacity: phoneO, y: phoneY }}>
        <Phone reviewed={step >= 4} checkO={checkO} />
      </motion.g>
    </svg>
  );
}

function Floor({ p, y, range, ground }: { p: MotionValue<number>; y: number; range: readonly [number, number]; ground: boolean }) {
  const dy = useTransform(p, [range[0], range[1]], [-440, 0], { ease: backOut });
  const o = useTransform(p, [range[0], range[0] + 0.03], [0, 1]);
  const shadow = useTransform(p, [range[1] - 0.02, range[1], range[1] + 0.04], [0, 0.6, 0]);
  return (
    <motion.g style={{ y: dy, opacity: o }}>
      <rect x={BX} y={y} width={BW} height={FLOOR_H} fill="url(#hs-facade)" stroke="var(--line-2)" />
      <line x1={BX} x2={BX + BW} y1={y + FLOOR_H - 0.5} y2={y + FLOOR_H - 0.5} stroke="var(--line)" />
      {ground ? (
        <g>
          {/* entrance, canopy and a lit reception */}
          <rect x={BX + 170} y={y + 26} width={60} height={FLOOR_H - 26} rx={3} fill="var(--teal-soft)" stroke="var(--line-2)" />
          <line x1={BX + 200} x2={BX + 200} y1={y + 26} y2={y + FLOOR_H} stroke="var(--line-2)" />
          <rect x={BX + 150} y={y + 16} width={100} height={8} rx={3} fill="var(--surface-2)" stroke="var(--line-2)" />
          <text x={BX + 200} y={y + 13} textAnchor="middle" className="fill-muted font-mono" fontSize={9} letterSpacing="0.14em">EMERGENCY</text>
          {[0, 1, 3, 4].map((c) => (
            <rect key={c} x={winX(c)} y={y + 28} width={WIN_W} height={30} rx={4} fill="var(--surface-2)" stroke="var(--line)" />
          ))}
        </g>
      ) : null}
      {/* a brief landing flash along the floor line */}
      <motion.rect x={BX - 20} y={y + FLOOR_H - 2} width={BW + 40} height={3} rx={1.5} fill="var(--teal)" style={{ opacity: shadow }} />
    </motion.g>
  );
}

function Bed({
  p, at, x, y, hot, amber, orange, ring,
}: {
  p: MotionValue<number>; at: number; x: number; y: number; hot: boolean;
  amber: MotionValue<number>; orange: MotionValue<number>; ring: MotionValue<number>;
}) {
  const lit = useTransform(p, [at, at + 0.02], [0, 1]);
  const glow = useTransform(lit, (v) => v * 0.75);
  const cx = x + WIN_W / 2;
  return (
    <g>
      <rect x={x} y={y} width={WIN_W} height={WIN_H} rx={5} fill="var(--surface-2)" stroke="var(--line)" />
      <motion.rect x={x} y={y} width={WIN_W} height={WIN_H} rx={5} fill="var(--teal)" style={{ opacity: glow }} filter="url(#hs-glow)" />
      {/* a little bed inside each window */}
      <motion.g style={{ opacity: lit }}>
        <rect x={x + 10} y={y + 24} width={28} height={6} rx={2} fill="var(--bg)" fillOpacity={0.55} />
        <rect x={x + 10} y={y + 19} width={8} height={6} rx={2} fill="var(--bg)" fillOpacity={0.55} />
      </motion.g>
      {hot && (
        <>
          <motion.rect x={x} y={y} width={WIN_W} height={WIN_H} rx={5} fill="var(--watch)" style={{ opacity: amber }} filter="url(#hs-glow)" />
          <motion.rect x={x} y={y} width={WIN_W} height={WIN_H} rx={5} fill="var(--warning)" style={{ opacity: orange }} filter="url(#hs-glow)" />
          <motion.g style={{ opacity: ring }}>
            <motion.rect
              x={x - 6} y={y - 6} width={WIN_W + 12} height={WIN_H + 12} rx={9}
              fill="none" stroke="var(--warning)" strokeWidth={1.5}
              animate={{ opacity: [0.9, 0.2, 0.9] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <text x={cx} y={y - 12} textAnchor="middle" className="fill-warning font-mono" fontSize={10} letterSpacing="0.12em">BED S-04</text>
          </motion.g>
        </>
      )}
    </g>
  );
}

function Ambulance({ x, y }: { x: number; y: number }) {
  // Sits on the road with its wheels on y; drawn facing right.
  return (
    <g transform={`translate(${x - 150}, ${y})`}>
      <rect x={0} y={-2} width={96} height={40} rx={7} fill="var(--surface)" stroke="var(--line-2)" />
      <path d="M96,6 h22 l16,16 v14 h-38 z" fill="var(--surface)" stroke="var(--line-2)" strokeLinejoin="round" />
      <path d="M100,10 h15 l10,11 h-25 z" fill="var(--teal-soft)" stroke="var(--line)" />
      <rect x={0} y={24} width={134} height={4} fill="var(--critical)" opacity={0.8} />
      <path d="M40,6 h8 v6 h6 v8 h-6 v6 h-8 v-6 h-6 v-8 h6 z" fill="var(--critical)" />
      <motion.rect
        x={24} y={-8} width={30} height={6} rx={3} fill="var(--critical)"
        animate={{ opacity: [1, 0.25, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
      <circle cx={26} cy={40} r={9} fill="var(--bg)" stroke="var(--ink-2)" strokeWidth={2} />
      <circle cx={110} cy={40} r={9} fill="var(--bg)" stroke="var(--ink-2)" strokeWidth={2} />
    </g>
  );
}

function Phone({ reviewed, checkO }: { reviewed: boolean; checkO: MotionValue<number> }) {
  const { x, y, w, h } = PHONE;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={22} fill="var(--surface)" stroke="var(--line-2)" strokeWidth={1.5} />
      <rect x={x + w / 2 - 18} y={y + 9} width={36} height={6} rx={3} fill="var(--surface-2)" />
      <text x={x + 16} y={y + 40} className="fill-muted font-mono" fontSize={9} letterSpacing="0.12em">AYU · WARD</text>
      <HeartPulse x={x + w - 30} y={y + 29} width={14} height={14} color="var(--teal)" />
      {/* the alert card */}
      <rect x={x + 10} y={y + 54} width={w - 20} height={120} rx={14} fill={reviewed ? "var(--surface-2)" : "var(--warning-soft)"} stroke="var(--line)" />
      <BellRing x={x + 20} y={y + 66} width={14} height={14} color="var(--warning)" />
      <text x={x + 40} y={y + 77} className="fill-warning" fontSize={11} fontWeight={600}>Warning</text>
      <text x={x + 20} y={y + 100} className="fill-ink" fontSize={13} fontWeight={600}>Arjun · S-04</text>
      <text x={x + 20} y={y + 118} className="fill-muted" fontSize={10}>HR above his baseline</text>
      <text x={x + 20} y={y + 132} className="fill-muted" fontSize={10}>Temp rising for 2 h</text>
      <text x={x + 20} y={y + 158} className="fill-ink-2 font-mono" fontSize={9}>NEWS2 2 · LOW</text>
      {/* the doctor's reply */}
      <rect x={x + 10} y={y + 186} width={w - 20} height={56} rx={14} fill="var(--surface-2)" stroke="var(--line)" />
      <motion.g style={{ opacity: checkO }}>
        <CircleCheck x={x + 20} y={y + 199} width={16} height={16} color="var(--stable)" />
        <text x={x + 42} y={y + 211} className="fill-ink" fontSize={11} fontWeight={600}>Reviewed</text>
        <Stethoscope x={x + 20} y={y + 219} width={12} height={12} color="var(--muted)" />
        <text x={x + 38} y={y + 229} className="fill-muted" fontSize={9}>Dr. on the way</text>
      </motion.g>
      {!reviewed && (
        <text x={x + w / 2} y={y + 219} textAnchor="middle" className="fill-faint" fontSize={10}>Tap to acknowledge</text>
      )}
    </g>
  );
}
