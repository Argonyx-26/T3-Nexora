import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";

/*
 * Ayu, the landing page's guide: a little doctor holding a heart balloon who floats down
 * the right edge as you scroll — down with you, back up if you scroll up. While you move,
 * his legs kick and he leans into the motion; when you stop, he blinks, waves and says
 * something about the section you're looking at. Click him for a fact.
 *
 * Sections opt in with a `data-guide` attribute whose value is a key in LINES.
 */

const LINES: Record<string, string> = {
  hero: "Namaste! I'm Ayu 👋 Scroll down — I'll show you around.",
  hospital: "Watch a hospital build itself, bed by bed. Keep going!",
  story: "This is Priya. See how NEWS2 still says Low?",
  stats: "65 minutes earlier. That's time a doctor gets back.",
  lenses: "I look at every patient three ways, every 5 minutes.",
  explain: "No black box — every point of my score has a name.",
  roles: "Doctor or patient? Pick your door!",
  footer: "Thanks for scrolling with me! 🙏",
};

const FACTS = [
  "I check all ten beds every five minutes.",
  "I speak English and हिंदी.",
  "I still work with no internet.",
  "I never say less than NEWS2 does.",
  "The doctor always decides. I just help them see sooner.",
];

export function Buddy() {
  const reduce = useReducedMotion();
  const { scrollY, scrollYProgress } = useScroll();
  // Smooth the ride; the balloon lags a little more than the boy, so the string sways.
  const p = useSpring(scrollYProgress, { stiffness: 90, damping: 22, mass: 0.6 });
  const top = useTransform(p, (v) => `calc(84px + ${v} * (100svh - 84px - 236px))`);
  const vel = useVelocity(scrollY);
  const tilt = useSpring(useTransform(vel, [-2500, 0, 2500], [-10, 0, 10]), { stiffness: 120, damping: 18 });
  const sway = useSpring(useTransform(vel, [-2500, 0, 2500], [10, 0, -10]), { stiffness: 60, damping: 10 });

  const [moving, setMoving] = useState(false);
  const [key, setKey] = useState("hero");
  const [bubble, setBubble] = useState<string | null>(null);
  const [wave, setWave] = useState(0);
  const fact = useRef(0);
  const idle = useRef<number | undefined>(undefined);
  const hide = useRef<number | undefined>(undefined);

  const say = (text: string, ms = 4200) => {
    setBubble(text);
    setWave((w) => w + 1);
    window.clearTimeout(hide.current);
    hide.current = window.setTimeout(() => setBubble(null), ms);
  };

  // Which section is in the middle of the screen?
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-guide]")];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setKey(e.target.getAttribute("data-guide") ?? "hero");
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Moving while scrolling; when the page settles, speak about the section in view.
  useMotionValueEvent(scrollY, "change", () => {
    setMoving(true);
    setBubble(null);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setMoving(false), 180);
  });
  const lastSaid = useRef("");
  useEffect(() => {
    if (moving) return;
    const t = window.setTimeout(() => {
      if (lastSaid.current !== key) {
        lastSaid.current = key;
        say(LINES[key] ?? LINES.hero);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [moving, key]);

  // Say hello once, shortly after the page opens.
  useEffect(() => {
    const t = window.setTimeout(() => {
      lastSaid.current = "hero";
      say(LINES.hero, 5200);
    }, 1600);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(idle.current);
      window.clearTimeout(hide.current);
    };
  }, []);

  return (
    <motion.div
      className="pointer-events-none fixed right-1 z-40 hidden w-[124px] sm:right-3 md:block"
      style={{ top }}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 1.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence>
        {bubble && (
          <motion.div
            key={bubble}
            initial={{ opacity: 0, scale: 0.85, x: 12 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="absolute top-[100px] right-[112px] w-max max-w-[230px] origin-right rounded-2xl rounded-br-md border border-line-2 bg-surface/95 px-3.5 py-2.5 text-[13px] leading-snug text-ink shadow-[0_18px_50px_-20px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            role="status"
          >
            {bubble}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-label="Ayu, your guide. Click for a fact."
        onClick={() => {
          say(FACTS[fact.current % FACTS.length]);
          fact.current += 1;
        }}
        className="pointer-events-auto block w-full cursor-pointer rounded-3xl focus-visible:outline-2"
      >
        <motion.div style={{ rotate: reduce ? 0 : tilt, transformOrigin: "50% 20%" }}>
          <Character moving={moving && !reduce} wave={wave} sway={sway} reduce={!!reduce} />
        </motion.div>
      </button>
    </motion.div>
  );
}

function Character({ moving, wave, sway, reduce }: { moving: boolean; wave: number; sway: ReturnType<typeof useSpring>; reduce: boolean }) {
  const loop = (duration: number) => ({ duration, repeat: Infinity, ease: "easeInOut" as const });
  const skin = "#c98d62";
  const skinShade = "#b27650";
  const hair = "#2a1b14";
  const scrubs = "var(--teal)";
  return (
    <svg viewBox="0 0 120 200" className="h-auto w-full overflow-visible drop-shadow-[0_14px_22px_rgba(0,0,0,0.28)]" aria-hidden>
      {/* the heart balloon, swaying on its string */}
      <motion.g style={{ rotate: sway, transformOrigin: "88px 104px" }}>
        <motion.g animate={reduce ? undefined : { y: [0, -3, 0] }} transition={loop(3.2)}>
          <path d="M88,104 C86,90 92,76 88,60" fill="none" stroke="var(--muted)" strokeWidth={1.2} />
          <path
            d="M88,60 C74,48 62,38 62,24 C62,13 71,6 79,6 C84,6 87,9 88,13 C89,9 92,6 97,6 C105,6 114,13 114,24 C114,38 102,48 88,60 Z"
            fill="#f43f5e"
          />
          <path d="M70,18 C72,13 76,11 80,11" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" />
          <path d="M68,30 h8 l3,-7 l4,14 l3,-9 l2,2 h10" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M86,60 l2,4 l2,-4 z" fill="#e11d48" />
        </motion.g>
      </motion.g>

      <motion.g animate={reduce ? undefined : { y: [0, -2.5, 0] }} transition={loop(2.4)}>
        {/* legs: kick while moving, dangle when still */}
        <motion.g
          style={{ transformOrigin: "54px 160px" }}
          animate={reduce ? undefined : { rotate: moving ? [-22, 18, -22] : [-5, 4, -5] }}
          transition={loop(moving ? 0.45 : 2.6)}
        >
          <rect x={49} y={158} width={10} height={24} rx={5} fill="#1e293b" />
          <ellipse cx={53} cy={184} rx={8} ry={4.5} fill="#f8fafc" stroke="#cbd5e1" />
        </motion.g>
        <motion.g
          style={{ transformOrigin: "66px 160px" }}
          animate={reduce ? undefined : { rotate: moving ? [18, -22, 18] : [4, -5, 4] }}
          transition={loop(moving ? 0.45 : 2.6)}
        >
          <rect x={61} y={158} width={10} height={24} rx={5} fill="#1e293b" />
          <ellipse cx={67} cy={184} rx={8} ry={4.5} fill="#f8fafc" stroke="#cbd5e1" />
        </motion.g>

        {/* body: scrubs, pocket, badge */}
        <path d="M40,134 C40,126 48,121 60,121 C72,121 80,126 80,134 L80,160 C80,164 77,166 73,166 L47,166 C43,166 40,164 40,160 Z" fill={scrubs} />
        <path d="M52,121 L60,133 L68,121" fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={2} strokeLinejoin="round" />
        <rect x={66} y={142} width={9} height={8} rx={2} fill="#fff" fillOpacity={0.25} />
        <rect x={45} y={140} width={13} height={7} rx={2} fill="#fff" />
        <text x={51.5} y={145.6} textAnchor="middle" fontSize={4.6} fontWeight={700} fill="#0f766e" fontFamily="ui-sans-serif, system-ui">AYU</text>
        {/* stethoscope */}
        <path d="M50,124 C46,136 50,146 58,148 C66,150 72,142 70,130" fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" />
        <circle cx={58} cy={150} r={3.4} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1.4} />

        {/* the balloon arm, holding the string up */}
        <path d="M78,130 C84,124 87,116 88,106" fill="none" stroke={scrubs} strokeWidth={8} strokeLinecap="round" />
        <circle cx={88} cy={104} r={4.6} fill={skin} />
        {/* the waving arm */}
        <motion.g
          key={wave}
          style={{ transformOrigin: "42px 130px" }}
          initial={{ rotate: 0 }}
          animate={reduce || wave === 0 ? { rotate: 0 } : { rotate: [0, 115, 95, 120, 95, 0] }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        >
          <path d="M42,130 C36,136 33,144 32,152" fill="none" stroke={scrubs} strokeWidth={8} strokeLinecap="round" />
          <circle cx={32} cy={154} r={4.6} fill={skin} />
        </motion.g>

        {/* head */}
        <rect x={55} y={114} width={10} height={9} rx={3} fill={skinShade} />
        <circle cx={38} cy={100} r={5} fill={skinShade} />
        <circle cx={82} cy={100} r={5} fill={skinShade} />
        <circle cx={60} cy={98} r={22} fill={skin} />
        <path d="M37,98 C35,84 40,77 46,74 L47,66 L54,71 L59,62 L65,70 L72,64 L73,74 C80,78 85,86 83,98 C80,90 74,86 68,87 C62,82 52,82 46,87 C42,89 39,93 37,98 Z" fill={hair} />
        {/* head mirror, the cartoon doctor's badge of office */}
        <circle cx={60} cy={80} r={5.5} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1.2} />
        <circle cx={60} cy={80} r={2} fill="#94a3b8" />
        {/* face: eyes blink, cheeks, smile */}
        <motion.g
          style={{ transformOrigin: "60px 99px" }}
          animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1, 1] }}
          transition={{ duration: 4.2, times: [0, 0.9, 0.93, 0.96, 1], repeat: Infinity }}
        >
          <ellipse cx={52} cy={99} rx={3.2} ry={3.8} fill="#1f1510" />
          <ellipse cx={68} cy={99} rx={3.2} ry={3.8} fill="#1f1510" />
          <circle cx={53.2} cy={97.6} r={1.1} fill="#fff" />
          <circle cx={69.2} cy={97.6} r={1.1} fill="#fff" />
        </motion.g>
        <path d="M48,92 q4,-3 8,0" fill="none" stroke={hair} strokeWidth={1.6} strokeLinecap="round" />
        <path d="M64,92 q4,-3 8,0" fill="none" stroke={hair} strokeWidth={1.6} strokeLinecap="round" />
        <circle cx={46} cy={106} r={3.2} fill="#f472b6" fillOpacity={0.35} />
        <circle cx={74} cy={106} r={3.2} fill="#f472b6" fillOpacity={0.35} />
        <path d="M54,107 q6,6 12,0" fill="#7f1d1d" stroke="#7f1d1d" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    </svg>
  );
}
