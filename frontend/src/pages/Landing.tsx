import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { HeroMonitor } from "../components/HeroMonitor";
import { ArtBaseline, ArtBreath, ArtNews2, ArtTrend, ArtWard, CountUp, LiveTicker, Pulse, spotlight } from "../components/motion";
import { ThemeToggle, Wordmark } from "../components/Shell";
import { api, useQuery } from "../lib/api";
import { VitalField } from "../components/VitalField";
import { Arrow, Button, Reveal, cx } from "../components/ui";
import { DISCLAIMER, LEVEL_STYLE } from "../lib/format";
import type { Level } from "../lib/types";

const EASE = [0.22, 1, 0.36, 1] as const;

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Words rise out of a mask, one after another. */
function Words({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.1em] pr-[0.02em] align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: "110%", rotate: 4 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ duration: 1.1, delay: delay + i * 0.08, ease: EASE }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export default function Landing() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-bg">
      <TopBar />
      <Hero />
      <LiveTicker />
      <ScrollStory />
      <Stats />
      <Lenses />
      <Explain />
      <Roles />
      <BigFooter />
    </div>
  );
}

function TopBar() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setSolid(v > 40));
  return (
    <header className={cx("fixed inset-x-0 top-0 z-40 border-b transition-all duration-500", solid ? "border-line bg-bg/70 backdrop-blur-xl" : "border-transparent")}>
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:h-20 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-2">
          <span className="hidden sm:block"><Button variant="quiet" to="/patient">Patient view</Button></span>
          <Button variant="ghost" to="/doctor" className="h-9 px-4">Open ward <Arrow /></Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}


function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const headY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const fieldScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);

  return (
    <section ref={ref} className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <div className="bg-grid absolute inset-x-0 top-0 -z-20 h-[42%] opacity-50 [mask-image:radial-gradient(ellipse_at_25%_0%,black,transparent_70%)]" />
      <motion.div
        aria-hidden
        style={{ opacity: fade }}
        className="absolute -top-80 left-[10%] -z-20 h-[620px] w-[1100px] rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] opacity-50 blur-3xl"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, delay: 0.4 }}
        style={{ scale: fieldScale }}
        className="absolute inset-x-0 bottom-0 -z-10 h-[62%] origin-bottom"
      >
        <VitalField className="h-full w-full" />
        {/* Fades drawn as overlays, not CSS masks: Chromium drops a masked canvas entirely. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--bg)_0%,transparent_34%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--bg)_0%,color-mix(in_srgb,var(--bg)_70%,transparent)_30%,transparent_62%)]" />
      </motion.div>

      <motion.div style={{ y: headY, opacity: fade }} className="relative mx-auto w-full max-w-[1400px] px-4 pt-32 sm:px-8 sm:pt-40">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="inline-flex items-center gap-3 rounded-full border border-line bg-surface/60 py-1.5 pr-2 pl-3 backdrop-blur-md"
        >
          <span className="live-dot size-1.5 rounded-full bg-stable" />
          <span className="eyebrow text-ink-2">Live · early health-risk detection</span>
          <Pulse className="h-4 w-14" />
        </motion.div>

        <h1 className="mt-8 font-display text-[clamp(54px,10.5vw,176px)] leading-[0.84]">
          <Words text="Every patient" delay={0.15} />
          <br />
          <Words text="has their own" delay={0.35} />
          <br />
          <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span
              className="accent text-shine inline-block text-[1.08em]"
              initial={{ y: "110%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.7, ease: EASE }}
            >
              normal.
            </motion.span>
          </span>
        </h1>

        <div className="mt-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 1.1, ease: EASE }}
            className="max-w-[520px] text-[17px] leading-relaxed text-ink-2 sm:text-[19px]"
          >
            Hospitals score everyone against the same thresholds. AYU learns what is normal for{" "}
            <span className="text-ink">each patient</span>, watches which way they are heading, and explains every alert in plain
            language — hours before the usual score moves.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 1.25, ease: EASE }}
            className="flex flex-wrap items-center gap-3"
          >
            <Button to="/doctor" className="h-13 px-7 text-[15px]">Open the ward dashboard <Arrow /></Button>
            <Button variant="ghost" to="/patient" className="h-13 px-7 text-[15px] backdrop-blur-md">I'm a patient</Button>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        style={{ opacity: fade }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="relative mt-auto flex justify-center pt-16 pb-8"
      >
        <div className="flex flex-col items-center gap-3">
          <span className="eyebrow">Scroll</span>
          <span className="relative h-10 w-px overflow-hidden bg-line-2">
            <motion.span className="absolute inset-x-0 top-0 h-4 bg-teal" animate={{ y: [-16, 40] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
          </span>
        </div>
      </motion.div>
    </section>
  );
}

/* ---------------- Scroll story ---------------- */

const STEPS: { at: number; lead: string; accent: string; level: Level | null; body: string }[] = [
  { at: 0, lead: "Priya's", accent: "normal.", level: null, body: "Seven days of her own readings taught AYU that SpO₂ around 97% is normal for her. The shaded band is hers alone." },
  { at: 1, lead: "A quiet", accent: "slide.", level: null, body: "SpO₂ starts drifting about 1% an hour. Reading by reading, NEWS2 still calls her near-normal." },
  { at: 2, lead: "AYU:", accent: "Watch.", level: "Watch", body: "The three-hour slope is steep and sustained, and SpO₂ has left her band. AYU raises Watch. NEWS2 reads 2 — Low." },
  { at: 2.75, lead: "AYU:", accent: "Warning.", level: "Warning", body: "Review within the hour, with every point of the score explained. NEWS2 is 4 — still Low." },
  { at: 3.25, lead: "NEWS2", accent: "catches up.", level: "Warning", body: "Thirty minutes later NEWS2 reaches Medium. AYU was already there — and at Watch 75 minutes before." },
];

function ScrollStory() {
  const desktop = useMedia("(min-width: 1024px)");
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", setP);
  const progress = Math.min(1, p * 1.08);
  const hours = progress * 5;
  let step = 0;
  STEPS.forEach((s, i) => {
    if (hours >= s.at) step = i;
  });
  const s = STEPS[step];

  if (!desktop) {
    return (
      <section className="border-b border-line py-20">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
          <div className="eyebrow">Watch AYU catch it</div>
          <h2 className="mt-4 font-display text-[44px] leading-[0.95]">A quiet <span className="accent text-teal">slide.</span></h2>
          <div className="mt-8"><HeroMonitor /></div>
          <ol className="mt-10 space-y-6">
            {STEPS.map((x, i) => (
              <li key={i} className="border-t border-line pt-4">
                <div className="font-mono text-[12px] text-muted">0{i + 1}</div>
                <div className="mt-1 text-[20px] font-semibold">{x.lead} {x.accent}</div>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{x.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative h-[460vh] border-b border-line">
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_75%_50%,var(--teal-soft),transparent_60%)]" />
        <div className="mx-auto grid w-full max-w-[1400px] items-center gap-16 px-8 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <div className="eyebrow flex items-center gap-3"><span className="h-px w-8 bg-line-2" />Watch AYU catch it</div>
            <div className="mt-10 flex items-baseline gap-3 font-mono text-[13px] text-muted">
              <span className="text-ink">0{step + 1}</span>/ 05
            </div>
            <div className="relative mt-4 min-h-[330px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -30, filter: "blur(8px)" }}
                  transition={{ duration: 0.55, ease: EASE }}
                >
                  <h2 className="font-display text-[clamp(52px,6vw,96px)] leading-[0.92]">
                    {s.lead}{" "}
                    <span className={cx("accent", s.level ? LEVEL_STYLE[s.level].text : "text-teal")}>{s.accent}</span>
                  </h2>
                  <p className="mt-7 max-w-[460px] text-[18px] leading-relaxed text-ink-2">{s.body}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="mt-6 flex max-w-[460px] gap-1.5">
              {STEPS.map((_, i) => (
                <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.span className="block h-full bg-teal" animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.5 }} />
                </span>
              ))}
            </div>
          </div>
          <HeroMonitor progress={progress} />
        </div>
      </div>
    </section>
  );
}

/* ---------------- Numbers ---------------- */

function Stats() {
  // Live numbers from the evaluation; if the API isn't reachable (e.g. a static preview), show the single-run figures.
  const ev = useQuery((s) => api.leadTime(s), []);
  const u = ev.data?.summary.urgent;
  const f = ev.data?.summary.first;
  const items: { node: ReactNode; label: string }[] = u && f && ev.data
    ? [
        { node: <CountUp value={Math.round((u.lead_h_median ?? 0) * 60)} suffix=" min" />, label: `median head start over NEWS2 to urgent review, across ${ev.data.summary.runs} simulated deteriorations` },
        { node: <><CountUp value={u.ayu_first} /><span className="text-[0.45em] text-muted"> / {ev.data.summary.runs}</span></>, label: `runs where AYU escalated first — NEWS2 was first in ${u.news2_first}` },
        { node: <CountUp value={u.news2_never} />, label: `deteriorations NEWS2 never escalated on within ${ev.data.config.horizon_h} hours; ${u.ayu_never === 0 ? "AYU caught every one" : `AYU missed ${u.ayu_never}`}` },
        { node: <CountUp value={f.rest_ayu_alarms} />, label: `false first alerts at rest, against ${f.rest_news2_alarms} for NEWS2, over ${ev.data.summary.rest_patient_days} patient-days` },
      ]
    : [
        { node: <CountUp value={75} suffix=" min" />, label: "earlier than NEWS2 to Watch, in one simulated SpO₂ drift" },
        { node: <CountUp value={0.1} decimals={1} prefix="≈" suffix="%" />, label: "false trend flags on resting patients" },
        { node: <CountUp value={3} suffix=" h" />, label: "trend window, corrected for autocorrelation" },
        { node: <CountUp value={10} />, label: "patients on a live, simulated ward" },
      ];
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <Reveal
            key={i}
            delay={i * 0.08}
            className={cx("border-line px-4 py-14 sm:px-8", i % 2 === 0 && "border-r", i < 2 && "border-b lg:border-b-0", i === 1 && "lg:border-r")}
          >
            <div className="font-display text-[clamp(40px,5vw,76px)] leading-none tnum">{it.node}</div>
            <p className="mt-4 max-w-[260px] text-[14px] leading-relaxed text-muted">{it.label}</p>
          </Reveal>
        ))}
      </div>
      {ev.data && (
        <div className="mx-auto max-w-[1400px] border-t border-line px-4 py-5 sm:px-8">
          <Link to="/evaluation" className="group inline-flex items-center gap-2 text-[14px] text-ink-2 hover:text-ink">
            See the full evaluation — method, every scenario, and its limits <Arrow />
          </Link>
        </div>
      )}
    </section>
  );
}

/* ---------------- Lenses ---------------- */

function Lenses() {
  const lenses = [
    { n: "01", title: "The hospital standard", art: <ArtNews2 />, body: "NEWS2, scored exactly as the Royal College of Physicians charts it, plus a qSOFA sepsis screen. AYU is never less alarming than NEWS2.", ex: [["SpO₂ 93%", "+2"], ["RR 22", "+2"], ["HR 95", "+1"], ["NEWS2", "5 · Medium"]] },
    { n: "02", title: "This patient's normal", art: <ArtBaseline />, body: "Seven days of their own readings, not the average patient's. The last six hours are left out, so a slow decline can't teach itself to look normal.", ex: [["Ramesh · SBP 150", "his normal"], ["Arjun · SBP 150", "z +4.7"], ["Vikram · HR 78", "+50% for a runner"], ["NEWS2 on all three", "0"]] },
    { n: "03", title: "Which way they're heading", art: <ArtTrend />, body: "A three-hour slope on every vital, counted only when it is steep and sustained. A fall that stays inside 'normal' is still a fall.", ex: [["SpO₂", "−0.9%/hr"], ["Window", "3 h"], ["Significance", "≥ 3 SE"], ["False flags at rest", "≈ 0.1%"]] },
  ];
  return (
    <section className="border-b border-line py-28 sm:py-36">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
        <Reveal>
          <div className="eyebrow">How AYU reads a patient</div>
          <h2 className="mt-5 max-w-4xl font-display text-[clamp(42px,6vw,96px)] leading-[0.92]">
            Three lenses on every reading, <span className="accent text-muted">every five minutes.</span>
          </h2>
        </Reveal>
        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {lenses.map((l, i) => (
            <Reveal key={l.n} delay={i * 0.1}>
              <div onPointerMove={spotlight} className="spotlight group flex h-full flex-col overflow-hidden rounded-[28px] border border-line bg-surface p-8 transition-colors duration-500 hover:border-line-2">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-[12px] text-teal">{l.n}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-line-2 to-transparent" />
                </div>
                <div className="mt-8">{l.art}</div>
                <h3 className="mt-8 font-display text-[34px] leading-[1]">{l.title}</h3>
                <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{l.body}</p>
                <dl className="mt-auto pt-10">
                  {l.ex.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 text-[13px]">
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-mono tnum">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Explainability ---------------- */

// Real engine output for the drifting-SpO₂ case.
const DEMO_FACTORS = [
  { name: "SpO₂ falling 0.9%/hr", note: "over the last 3 h", pts: 12.6 },
  { name: "SpO₂ below personal baseline", note: "94% vs her 97% · z −2.9", pts: 9.2 },
  { name: "Heart rate above personal baseline", note: "NEWS2 still scores this as normal", pts: 8.5 },
  { name: "NEWS2 1 (Low)", note: "SpO₂ +1", pts: 4.0 },
];

function Explain() {
  const total = Math.round(DEMO_FACTORS.reduce((s, f) => s + f.pts, 0));
  const offsets = DEMO_FACTORS.map((_, i) => DEMO_FACTORS.slice(0, i).reduce((s, f) => s + f.pts, 0));
  return (
    <section className="border-b border-line py-28 sm:py-36">
      <div className="mx-auto grid max-w-[1400px] items-center gap-16 px-4 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <div className="eyebrow">Explainable by construction</div>
          <h2 className="mt-5 font-display text-[clamp(42px,6vw,96px)] leading-[0.92]">
            Every point has <span className="accent text-shine">a name.</span>
          </h2>
          <p className="mt-8 max-w-[480px] text-[18px] leading-relaxed text-ink-2">
            No black box. The score is the sum of named factors a doctor can check at the bedside — and each says when NEWS2
            would still have called it normal.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <div onPointerMove={spotlight} className="spotlight rounded-[32px] border border-line bg-surface p-7 sm:p-10">
            <div className="flex items-end justify-between">
              <div>
                <div className="eyebrow">AYU score</div>
                <div className="mt-2 flex items-baseline gap-4">
                  <CountUp value={total} className="font-display text-[96px] leading-[0.8] text-watch" />
                  <span className={cx("rounded-full px-3 py-1 text-[13px] font-medium", LEVEL_STYLE.Watch.soft, LEVEL_STYLE.Watch.text)}>Watch</span>
                </div>
              </div>
              <div className="text-right">
                <div className="eyebrow">NEWS2</div>
                <div className="mt-2 font-display text-[40px] leading-none">1<span className="ml-2 font-sans text-[13px] font-normal text-muted">Low</span></div>
              </div>
            </div>
            <div className="mt-10 space-y-5">
              {DEMO_FACTORS.map((f, i) => (
                <div key={f.name}>
                  <div className="flex items-baseline justify-between gap-4 text-[15px]">
                    <span className="font-medium">{f.name}</span>
                    <span className="font-mono tnum text-muted">+{f.pts.toFixed(1)}</span>
                  </div>
                  <div className="relative mt-2 h-2 rounded-full bg-surface-2">
                    <motion.div
                      className="absolute inset-y-0 rounded-full bg-teal shadow-[0_0_18px_-2px_var(--glow)]"
                      style={{ left: `${(offsets[i] / total) * 100}%` }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(f.pts / total) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: 0.3 + i * 0.25, ease: EASE }}
                    />
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted">{f.note}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Roles ---------------- */

function Roles() {
  return (
    <section className="py-28 sm:py-36">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
        <Reveal>
          <h2 className="font-display text-[clamp(42px,6vw,96px)] leading-[0.92]">
            Continue <span className="accent text-muted">as…</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <RoleCard to="/doctor" who="Doctor" line="The ward, sorted by risk. Why each patient is there, and what to do next." meta="10 beds · live" art={<div className="w-40 sm:w-44"><ArtWard /></div>} />
          <RoleCard to="/patient" who="Patient" line="Your status in plain words and your medicines for today — in English or हिंदी. Works for ASHA workers too." meta="English · हिंदी" art={<ArtBreath />} />
        </div>
      </div>
    </section>
  );
}

function RoleCard({ to, who, line, meta, art }: { to: string; who: string; line: string; meta: string; art: ReactNode }) {
  return (
    <Reveal>
      <Link
        to={to}
        onPointerMove={spotlight}
        className="spotlight group relative flex min-h-[420px] flex-col justify-between overflow-hidden rounded-[32px] border border-line bg-surface p-8 transition-all duration-500 hover:border-line-2 sm:p-11"
      >
        <div className="flex items-start justify-between gap-6">
          <span className="eyebrow">{meta}</span>
          <div className="transition-transform duration-700 group-hover:scale-105">{art}</div>
        </div>
        <div>
          <div className="flex items-end justify-between gap-6">
            <div className="font-display text-[clamp(60px,8vw,128px)] leading-[0.85]">{who}</div>
            <span className="grid size-14 shrink-0 place-items-center rounded-full border border-line-2 text-[22px] transition-all duration-500 group-hover:border-teal group-hover:bg-teal group-hover:text-bg">→</span>
          </div>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-ink-2">{line}</p>
        </div>
      </Link>
    </Reveal>
  );
}

/* ---------------- Footer ---------------- */

function BigFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line">
      <div className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <p className="max-w-md text-[15px] leading-relaxed">
            <span className="font-medium text-ink">{DISCLAIMER}</span>
          </p>
          <Button to="/doctor">Open the ward <Arrow /></Button>
        </div>
        <div
          aria-hidden
          className="mt-16 select-none font-display text-[clamp(120px,30vw,460px)] leading-[0.75] text-transparent [-webkit-text-stroke:1px_var(--line-2)] [mask-image:linear-gradient(to_bottom,black_30%,transparent)]"
        >
          AYU
        </div>
        <div className="flex flex-col gap-2 border-t border-line py-6 font-mono text-[11px] tracking-wide text-muted sm:flex-row sm:justify-between">
          <span>Team AYU · Ishan Sharma · Aryan Verma · Harshit Kandpal · Vinay</span>
          <span>Argonyx'26 · RV University</span>
        </div>
      </div>
    </footer>
  );
}
