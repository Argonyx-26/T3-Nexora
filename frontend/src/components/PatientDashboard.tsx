import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bluetooth,
  CalendarDays,
  Check,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  HeartPulse,
  MessageCircleHeart,
  Moon,
  Pill,
  Quote,
  Send,
  ShieldAlert,
  Snowflake,
  Sparkles,
  Sun,
  Thermometer,
  Watch as WatchIcon,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { LEVEL_STYLE, fmtTime, istDateKey } from "../lib/format";
import type { ChatTurn, Level, Medication, PatientSummary, Risk, Vital } from "../lib/types";
import { LogoMark } from "./Logo";
import { Sparkline } from "./Sparkline";
import { Skeleton, cx } from "./ui";

/*
 * The patient dashboard's building blocks: today's date and a thought for the day, the
 * weather with health suggestions, an AI health summary around a glowing heart, the
 * overall health overview, a heart-rate / SpO₂ tracker, prescriptions, dose adherence,
 * and a chat assistant. Everything speaks English or Hindi, and nothing here diagnoses.
 */

export type Lang = "en" | "hi";

const P = {
  en: {
    today: "Today", thought: "Thought for the day",
    weather: "Weather · Bengaluru", weatherOff: "Weather is unavailable offline. Stay hydrated and follow your care plan.", feels: "feels like", humidity: "humidity",
    summary: "Your health summary", aiNote: "AI summary · not a diagnosis", why: "What's shaping this",
    allGood: "All your readings are within your usual range.", adherenceLabel: "Medicines taken (7 days)", trendUp: "rising", trendDown: "falling",
    overview: "Overall health", last24: "last 24 h", yourNormal: "your normal", symptoms7: "Symptoms (7 days)", noneReported: "none reported", status: "Status",
    tracker: "Heart rate & oxygen", trackerHint: "Type what your pulse oximeter shows. Devices will connect here soon.", save: "Save", saved: "Saved", devices: "Devices", soon: "Coming soon",
    smartwatch: "Smartwatch", oximeter: "Pulse oximeter", bpMonitor: "BP monitor",
    prescriptions: "My prescriptions", important: "Important — don't skip", next: "Next", timesDay: (n: number) => (n === 1 ? "Once a day" : `${n} times a day`),
    doses: "Doses & adherence", taken: "Taken", delayed: "Delayed", missed: "Missed", due: "Due", markTaken: "Taken", markMissed: "Missed", week: "Last 7 days",
    ask: "Ask AYU", assistantTitle: "AYU health assistant", assistantHint: "Ask about your readings, medicines or symptoms.",
    placeholder: "Type your question…", suggestions: ["How am I doing?", "What are my medicines?", "How are my readings?"],
    assistantNote: "Information only — not medical advice. For anything urgent, tell a nurse or call 108.", urgentTag: "Urgent",
  },
  hi: {
    today: "आज", thought: "आज का विचार",
    weather: "मौसम · बेंगलुरु", weatherOff: "ऑफ़लाइन होने से मौसम नहीं दिख रहा। पानी पीते रहें और अपनी दवाइयाँ समय पर लें।", feels: "महसूस", humidity: "नमी",
    summary: "आपकी सेहत का सार", aiNote: "AI सार · यह निदान नहीं है", why: "इसके कारण",
    allGood: "आपकी सारी रीडिंग आपकी सामान्य सीमा में है।", adherenceLabel: "ली गई दवाइयाँ (7 दिन)", trendUp: "बढ़ रहा", trendDown: "घट रहा",
    overview: "कुल सेहत", last24: "पिछले 24 घंटे", yourNormal: "आपका सामान्य", symptoms7: "लक्षण (7 दिन)", noneReported: "कोई नहीं", status: "स्थिति",
    tracker: "धड़कन और ऑक्सीजन", trackerHint: "पल्स ऑक्सीमीटर में जो दिखे, वह लिखें। जल्द ही डिवाइस यहाँ जुड़ेंगे।", save: "सेव करें", saved: "सेव हो गया", devices: "डिवाइस", soon: "जल्द आ रहा है",
    smartwatch: "स्मार्टवॉच", oximeter: "पल्स ऑक्सीमीटर", bpMonitor: "BP मशीन",
    prescriptions: "मेरी दवाइयाँ", important: "ज़रूरी — न छोड़ें", next: "अगली", timesDay: (n: number) => (n === 1 ? "दिन में 1 बार" : `दिन में ${n} बार`),
    doses: "खुराक और नियमितता", taken: "ली गई", delayed: "देर से", missed: "छूट गई", due: "लेनी है", markTaken: "ले ली", markMissed: "छूट गई", week: "पिछले 7 दिन",
    ask: "AYU से पूछें", assistantTitle: "AYU हेल्थ असिस्टेंट", assistantHint: "अपनी रीडिंग, दवाइयों या लक्षणों के बारे में पूछें।",
    placeholder: "अपना सवाल लिखें…", suggestions: ["मेरी हालत कैसी है?", "मेरी दवाइयाँ क्या हैं?", "मेरी रीडिंग कैसी है?"],
    assistantNote: "सिर्फ़ जानकारी — डॉक्टरी सलाह नहीं। कुछ भी गंभीर हो तो नर्स को बताएं या 108 पर कॉल करें।", urgentTag: "ज़रूरी",
  },
};

/* ------------------------------------------------------------------ 5 · Daily */

const QUOTES: { en: string; hi: string }[] = [
  { en: "Small steps every day add up to big changes.", hi: "रोज़ के छोटे कदम बड़ा बदलाव लाते हैं।" },
  { en: "Rest is part of healing, not a pause from it.", hi: "आराम भी इलाज का हिस्सा है।" },
  { en: "Take your medicines on time — your future self will thank you.", hi: "दवा समय पर लें — आने वाला कल आपको धन्यवाद देगा।" },
  { en: "A glass of water and a deep breath are a good start.", hi: "एक गिलास पानी और एक गहरी साँस — अच्छी शुरुआत है।" },
  { en: "You are not alone; your care team is with you.", hi: "आप अकेले नहीं हैं; आपकी देखभाल टीम आपके साथ है।" },
  { en: "Progress, not perfection.", hi: "पूर्णता नहीं, प्रगति मायने रखती है।" },
  { en: "Every good day starts with one kind thought.", hi: "हर अच्छा दिन एक अच्छे विचार से शुरू होता है।" },
  { en: "Listen to your body; it speaks before it shouts.", hi: "अपने शरीर की सुनें; वह पहले धीरे से कहता है।" },
  { en: "Healing takes time, and that is okay.", hi: "ठीक होने में समय लगता है, और यह ठीक है।" },
  { en: "A short walk and a smile can lift the whole day.", hi: "थोड़ी सैर और एक मुस्कान पूरा दिन बदल सकती है।" },
  { en: "Ask questions — understanding your health is strength.", hi: "सवाल पूछें — अपनी सेहत को समझना ताकत है।" },
  { en: "Today is a good day to take care of yourself.", hi: "आज अपना ख्याल रखने का अच्छा दिन है।" },
];

function dayOfYear(d: Date) {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

export function DailyCard({ lang, name }: { lang: Lang; name: string }) {
  const t = P[lang];
  const now = new Date();
  const hour = now.getHours();
  const greet = lang === "hi" ? (hour < 12 ? "सुप्रभात" : hour < 17 ? "नमस्ते" : "शुभ संध्या") : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const q = QUOTES[dayOfYear(now) % QUOTES.length];
  const date = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "long", day: "numeric", month: "long" }).format(now);
  const reduce = useReducedMotion();
  const Icon = hour >= 6 && hour < 18 ? Sun : Moon;
  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-line bg-surface p-6">
      <motion.span
        aria-hidden
        className="absolute -top-8 -right-8 text-watch opacity-20"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      >
        <Icon size={140} strokeWidth={1} />
      </motion.span>
      <div className="eyebrow flex items-center gap-2"><CalendarDays size={13} strokeWidth={1.75} aria-hidden />{t.today}</div>
      <div className="mt-2 font-display text-[28px] leading-tight">{greet}, {name}</div>
      <div className="mt-1 text-[14px] text-muted">{date}</div>
      <div className="mt-5 flex gap-3 rounded-2xl bg-surface-2 p-4">
        <Quote size={18} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-teal" />
        <div>
          <div className="text-[11px] tracking-wide text-muted uppercase">{t.thought}</div>
          <p className="mt-1 text-[16px] leading-relaxed text-ink">{q[lang]}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 6 · Weather */

interface WeatherNow {
  temp: number;
  feels: number;
  humidity: number;
  precip: number;
  code: number;
  isDay: boolean;
}

// RV University, Bengaluru — a fixed spot, so the stage never shows a location prompt.
const LAT = 12.9237;
const LON = 77.4987;
let weatherCache: { at: number; data: WeatherNow } | null = null;

function useWeather() {
  const [state, setState] = useState<{ data?: WeatherNow; failed?: boolean }>(() => (weatherCache ? { data: weatherCache.data } : {}));
  useEffect(() => {
    if (weatherCache && Date.now() - weatherCache.at < 15 * 60_000) return;
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 4000);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,is_day&timezone=Asia%2FKolkata`,
      { signal: ctl.signal },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        const c = j.current;
        const data: WeatherNow = {
          temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m,
          precip: c.precipitation, code: c.weather_code, isDay: c.is_day === 1,
        };
        weatherCache = { at: Date.now(), data };
        setState({ data });
      })
      .catch(() => setState((s) => (s.data ? s : { failed: true })))
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, []);
  return state;
}

function weatherLook(code: number, isDay: boolean): { icon: LucideIcon; en: string; hi: string; rainy: boolean } {
  if (code >= 95) return { icon: CloudLightning, en: "Thunderstorm", hi: "आंधी-तूफ़ान", rainy: true };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: CloudRain, en: "Rain", hi: "बारिश", rainy: true };
  if (code >= 51 && code <= 57) return { icon: CloudDrizzle, en: "Drizzle", hi: "बूंदाबांदी", rainy: true };
  if (code >= 71 && code <= 77) return { icon: Snowflake, en: "Snow", hi: "बर्फ़", rainy: false };
  if (code === 45 || code === 48) return { icon: CloudFog, en: "Fog", hi: "कोहरा", rainy: false };
  if (code === 3) return { icon: Cloud, en: "Cloudy", hi: "बादल", rainy: false };
  if (code === 1 || code === 2) return { icon: isDay ? CloudSun : Cloud, en: "Partly cloudy", hi: "हल्के बादल", rainy: false };
  return { icon: isDay ? Sun : Moon, en: isDay ? "Clear" : "Clear night", hi: isDay ? "साफ़ मौसम" : "साफ़ रात", rainy: false };
}

/** Wellness tips from the weather, tuned to the patient's conditions. Never medical orders. */
export function weatherTips(w: WeatherNow, conditions: string[], lang: Lang): string[] {
  const c = conditions.join(" ").toLowerCase();
  const breathing = /asthma|copd/.test(c);
  const heart = /heart|cardiac|post-mi/.test(c);
  const diabetes = /diabetes/.test(c);
  const hi = lang === "hi";
  const tips: string[] = [];
  const look = weatherLook(w.code, w.isDay);
  if (look.rainy || w.precip > 0.2) tips.push(hi ? "बारिश हो रही है — बाहर जाएं तो छाता साथ रखें।" : "It's raining — consider carrying an umbrella.");
  if (w.temp >= 35) tips.push(hi ? "बहुत गर्मी है — पानी पीते रहें और लंबे समय तक धूप में न रहें।" : "It's very hot outside — stay hydrated and avoid long exposure.");
  else if (w.temp >= 31) tips.push(hi ? "आज गर्मी ज़्यादा है — बाहर जाने से पहले सावधानी बरतें।" : "High temperatures today — take precautions before going outside.");
  if (w.temp <= 16) tips.push(hi ? "ठंड है — गर्म कपड़े पहनें।" : "It's cold — dress warmly.");
  if (breathing && (w.humidity >= 80 || w.temp <= 18)) tips.push(hi ? "नमी/ठंड से साँस पर असर हो सकता है — अपना इनहेलर पास रखें।" : "Damp or cool air can tighten breathing — keep your inhaler with you.");
  if (heart && w.temp >= 31) tips.push(hi ? "गर्मी में ज़्यादा मेहनत से बचें; पानी कितना पीना है, यह डॉक्टर की सलाह से करें।" : "Avoid heavy exertion in the heat; follow your doctor's advice on how much to drink.");
  if (diabetes && w.temp >= 31) tips.push(hi ? "गर्मी में शुगर जल्दी बदल सकती है — रीडिंग पर ध्यान दें।" : "Heat can shift blood sugar — keep an eye on your readings.");
  if (!tips.length) tips.push(hi ? "मौसम अच्छा है — डॉक्टर की सलाह हो तो थोड़ी सैर करें।" : "Pleasant weather — a short walk is good, if your doctor agrees.");
  return tips.slice(0, 3);
}

export function WeatherCard({ lang, conditions }: { lang: Lang; conditions: string[] }) {
  const t = P[lang];
  const { data, failed } = useWeather();
  const reduce = useReducedMotion();
  const look = data ? weatherLook(data.code, data.isDay) : null;
  const tips = useMemo(() => (data ? weatherTips(data, conditions, lang) : []), [data, conditions, lang]);
  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-line bg-[linear-gradient(160deg,var(--sky-soft,transparent),transparent_60%)] bg-surface p-6">
      <div className="eyebrow flex items-center gap-2"><Thermometer size={13} strokeWidth={1.75} aria-hidden />{t.weather}</div>
      {!data && !failed ? (
        <Skeleton className="mt-4 h-24" />
      ) : !data ? (
        <p className="mt-4 text-[14px] leading-relaxed text-muted">{t.weatherOff}</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-4">
            {look && (
              <motion.span
                className="text-sky-500"
                animate={reduce ? undefined : look.rainy ? { y: [0, 2, 0] } : { rotate: [0, 8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <look.icon size={48} strokeWidth={1.4} aria-hidden />
              </motion.span>
            )}
            <div>
              <div className="font-display text-[40px] leading-none tnum">{Math.round(data.temp)}°</div>
              <div className="text-[13px] text-muted">{look?.[lang]} · {t.feels} {Math.round(data.feels)}° · {t.humidity} {Math.round(data.humidity)}%</div>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {tips.map((tip) => (
              <li key={tip} className="flex gap-2 text-[14px] leading-snug text-ink-2">
                <Sparkles size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-teal" />
                {tip}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 7 · AI summary + glowing heart */

type Glow = "good" | "fair" | "watch" | "warning" | "critical";
const GLOW: Record<Glow, { color: string; label: { en: string; hi: string } }> = {
  good: { color: "#39ff88", label: { en: "Steady", hi: "स्थिर" } },
  fair: { color: "#c6f432", label: { en: "Mostly steady", hi: "ज़्यादातर स्थिर" } },
  watch: { color: "#fbbf24", label: { en: "Some changes", hi: "कुछ बदलाव" } },
  warning: { color: "#fb923c", label: { en: "Needs review", hi: "जाँच ज़रूरी" } },
  critical: { color: "#f87171", label: { en: "Needs attention now", hi: "तुरंत ध्यान दें" } },
};

/** Recent trends, adherence and vitals, folded into one glow state (the risk level leads). */
export function glowFor(risk: Risk): Glow {
  if (risk.level === "Critical") return "critical";
  if (risk.level === "Warning") return "warning";
  if (risk.level === "Watch") return "watch";
  const concerns =
    Object.values(risk.trends).filter((x) => x?.flagged).length +
    Object.values(risk.deviations).filter((x) => x?.flagged).length +
    (risk.adherence.pct !== null && risk.adherence.pct < 90 ? 1 : 0);
  return concerns === 0 ? "good" : "fair";
}

function GlowingHeart({ color, bpm }: { color: string; bpm?: number | null }) {
  const reduce = useReducedMotion();
  const period = 60 / Math.min(180, Math.max(40, bpm || 72));
  return (
    <div className="relative grid size-44 shrink-0 place-items-center sm:size-52">
      <motion.span
        aria-hidden
        className="absolute inset-4 rounded-full blur-3xl"
        style={{ background: color }}
        animate={reduce ? { opacity: 0.35 } : { opacity: [0.25, 0.55, 0.25], scale: [0.9, 1.08, 0.9] }}
        transition={{ duration: period, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.svg
        viewBox="0 0 120 110"
        className="relative w-36 sm:w-44"
        aria-hidden
        animate={reduce ? undefined : { scale: [1, 1.1, 1, 1.05, 1] }}
        transition={{ duration: period, times: [0, 0.14, 0.3, 0.42, 1], repeat: Infinity, ease: "easeOut" }}
        style={{ filter: `drop-shadow(0 0 18px ${color}) drop-shadow(0 0 40px ${color}66)` }}
      >
        <defs>
          <radialGradient id="heart-shine" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M60,104 C60,104 8,72 8,36 C8,18 21,6 37,6 C47,6 55,12 60,20 C65,12 73,6 83,6 C99,6 112,18 112,36 C112,72 60,104 60,104 Z" fill={color} />
        <path d="M60,104 C60,104 8,72 8,36 C8,18 21,6 37,6 C47,6 55,12 60,20 C65,12 73,6 83,6 C99,6 112,18 112,36 C112,72 60,104 60,104 Z" fill="url(#heart-shine)" />
        <motion.path
          d="M18,52 H40 L47,38 L55,68 L64,28 L71,58 L76,50 H102"
          fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 1 }}
          animate={reduce ? undefined : { pathLength: [0, 1, 1], opacity: [1, 1, 0.4] }}
          transition={{ duration: period * 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.svg>
    </div>
  );
}

export function HealthSummary({ risk, lang, hr, title, sentence }: { risk?: Risk; lang: Lang; hr?: number | null; title: string; sentence: string }) {
  const t = P[lang];
  if (!risk) return <Skeleton className="h-72 rounded-[28px]" />;
  const glow = glowFor(risk);
  const g = GLOW[glow];
  const s = LEVEL_STYLE[risk.level as Level];
  const reasons = risk.factors.filter((f) => f.contribution > 0).slice(0, 3);
  const trends = Object.entries(risk.trends).filter(([, v]) => v?.flagged);
  return (
    <div className={cx("relative overflow-hidden rounded-[28px] border border-line p-6 sm:p-8", s.soft)}>
      <div className="flex flex-col items-center gap-6 md:flex-row md:items-center">
        <GlowingHeart color={g.color} bpm={hr} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">{t.summary}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line-2 px-2 py-0.5 text-[10px] tracking-wide text-muted uppercase">
              <Sparkles size={11} strokeWidth={1.75} aria-hidden />{t.aiNote}
            </span>
          </div>
          <h1 className={cx("mt-3 font-display text-[clamp(34px,5vw,56px)] leading-[1.02]", s.text)}>{title}</h1>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink">{sentence}</p>
          <div className="mt-5">
            <div className="text-[12px] text-muted">{t.why}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12px]" style={{ color: g.color }}>
                <HeartPulse size={13} strokeWidth={1.75} aria-hidden />{g.label[lang]}
              </span>
              {risk.adherence.pct !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12px] text-ink-2">
                  <Pill size={13} strokeWidth={1.75} aria-hidden />{t.adherenceLabel}: {Math.round(risk.adherence.pct)}%
                </span>
              )}
              {trends.map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12px] text-watch">
                  <Wind size={13} strokeWidth={1.75} aria-hidden />{k.toUpperCase()} {v && v.slope_per_hr > 0 ? t.trendUp : t.trendDown}
                </span>
              ))}
            </div>
            {reasons.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">{t.allGood}</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {reasons.map((f) => (
                  <li key={f.factor} className="flex gap-2 text-[13px] text-ink-2">
                    <span className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", s.dot)} />
                    {f.headline}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 4 · Overall health overview */

export function Overview({ p, risk, vitals, symptomsCount, lang, labels }: {
  p: PatientSummary; risk?: Risk; vitals?: Vital[]; symptomsCount?: number; lang: Lang;
  labels: { hr: string; spo2: string; bp: string; temp: string };
}) {
  const t = P[lang];
  const band = (k: "hr" | "spo2" | "sbp" | "temp") => {
    const b = risk?.baselines[k];
    return b ? { low: b.mean - 2 * b.std, high: b.mean + 2 * b.std } : undefined;
  };
  const series = (k: "hr" | "spo2" | "sbp" | "temp") => vitals?.map((v) => v[k] as number) ?? [];
  const normal = (k: "hr" | "spo2" | "sbp" | "temp", d = 0) => {
    const b = band(k);
    return b ? `${b.low.toFixed(d)}–${b.high.toFixed(d)}` : "—";
  };
  const tiles: { key: "hr" | "spo2" | "sbp" | "temp"; label: string; value: string; unit: string; d?: number }[] = [
    { key: "hr", label: labels.hr, value: `${Math.round(p.latest.hr)}`, unit: "bpm" },
    { key: "spo2", label: labels.spo2, value: `${Math.round(p.latest.spo2)}`, unit: "%" },
    { key: "sbp", label: labels.bp, value: `${Math.round(p.latest.sbp)}/${Math.round(p.latest.dbp)}`, unit: "mmHg" },
    { key: "temp", label: labels.temp, value: p.latest.temp.toFixed(1), unit: "°C", d: 1 },
  ];
  const s = LEVEL_STYLE[p.risk.level];
  return (
    <section>
      <div className="eyebrow flex items-center gap-2"><HeartPulse size={13} strokeWidth={1.75} aria-hidden />{t.overview} · {t.last24}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((x, i) => (
          <motion.div
            key={x.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-line bg-surface p-4"
          >
            <div className="text-[12px] text-muted">{x.label}</div>
            <div className="mt-1 font-mono text-[24px] leading-none tnum">{x.value}<span className="ml-1 text-[11px] text-muted">{x.unit}</span></div>
            <div className="mt-3">
              {vitals ? <Sparkline values={series(x.key)} band={band(x.key)} color="var(--teal)" height={30} /> : <Skeleton className="h-7" />}
            </div>
            <div className="mt-1 text-[11px] text-faint">{t.yourNormal} {normal(x.key, x.d)}</div>
          </motion.div>
        ))}
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-[12px] text-muted">{t.adherenceLabel}</div>
          <AdherenceRing pct={risk?.adherence.pct ?? null} />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-[12px] text-muted">{t.symptoms7}</div>
          <div className="mt-2 font-display text-[36px] leading-none tnum">{symptomsCount ?? "—"}</div>
          <div className="mt-2 text-[12px] text-faint">{symptomsCount === 0 ? t.noneReported : ""}</div>
        </div>
        <div className={cx("col-span-2 rounded-2xl p-4", s.soft)}>
          <div className="text-[12px] text-muted">{t.status}</div>
          <div className={cx("mt-2 font-display text-[32px] leading-none", s.text)}>{p.risk.level}</div>
          <div className="mt-2 font-mono text-[12px] text-ink-2">AYU {p.risk.score}/100 · NEWS2 {p.risk.news2}</div>
        </div>
      </div>
    </section>
  );
}

function AdherenceRing({ pct }: { pct: number | null }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = pct ?? 0;
  const color = pct === null ? "var(--line-2)" : v >= 90 ? "var(--stable)" : v >= 70 ? "var(--watch)" : "var(--critical)";
  return (
    <div className="mt-2 flex items-center gap-3">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
        <circle cx={32} cy={32} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={7} />
        <motion.circle
          cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v / 100) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="font-display text-[30px] leading-none tnum">{pct === null ? "—" : `${Math.round(v)}%`}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ 3 · BPM / SpO₂ tracker */

export function PulseOxTracker({ patientId, vitals, source, lang, onSaved }: {
  patientId: string; vitals?: Vital[]; source: "patient" | "asha"; lang: Lang; onSaved: () => void;
}) {
  const t = P[lang];
  const [hr, setHr] = useState("");
  const [spo2, setSpo2] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "error"; msg?: string }>({ kind: "idle" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const h = Number(hr);
    const o = Number(spo2);
    const values: { hr?: number; spo2?: number } = {};
    if (hr && h >= 20 && h <= 250) values.hr = h;
    if (spo2 && o >= 50 && o <= 100) values.spo2 = o;
    if (!values.hr && !values.spo2) {
      setState({ kind: "error", msg: lang === "hi" ? "सही रीडिंग लिखें।" : "Enter a valid reading." });
      return;
    }
    setState({ kind: "busy" });
    try {
      await api.logVitals(patientId, values, source);
      setHr("");
      setSpo2("");
      setState({ kind: "ok", msg: t.saved });
      onSaved();
    } catch (err) {
      setState({ kind: "error", msg: (err as Error).message });
    }
  };
  const devices: { icon: LucideIcon; label: string }[] = [
    { icon: WatchIcon, label: t.smartwatch },
    { icon: HeartPulse, label: t.oximeter },
    { icon: Thermometer, label: t.bpMonitor },
  ];
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="eyebrow flex items-center gap-2"><HeartPulse size={13} strokeWidth={1.75} aria-hidden />{t.tracker}</div>
      <p className="mt-2 text-[13px] text-muted">{t.trackerHint}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(["hr", "spo2"] as const).map((k) => (
          <div key={k} className="rounded-2xl bg-surface-2 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-muted">{k === "hr" ? "BPM" : "SpO₂ %"} · {t.last24}</span>
              <span className="font-mono text-[18px] tnum">{vitals?.length ? Math.round(vitals[vitals.length - 1][k]) : "—"}</span>
            </div>
            <div className="mt-2">{vitals ? <Sparkline values={vitals.map((v) => v[k])} color={k === "hr" ? "var(--critical)" : "var(--sky, var(--teal))"} height={54} /> : <Skeleton className="h-12" />}</div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
        <label className="block">
          <span className="text-[12px] text-muted">BPM</span>
          <input inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} aria-label="Heart rate, beats per minute"
            className="mt-1 h-11 w-28 rounded-xl border border-line bg-bg px-3 font-mono text-[16px] outline-none focus:border-line-2" />
        </label>
        <label className="block">
          <span className="text-[12px] text-muted">SpO₂ %</span>
          <input inputMode="numeric" value={spo2} onChange={(e) => setSpo2(e.target.value)} aria-label="Oxygen saturation, percent"
            className="mt-1 h-11 w-28 rounded-xl border border-line bg-bg px-3 font-mono text-[16px] outline-none focus:border-line-2" />
        </label>
        <button type="submit" disabled={state.kind === "busy"} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-bg transition-colors hover:bg-teal disabled:opacity-60">
          <Check size={15} strokeWidth={1.75} aria-hidden />{t.save}
        </button>
        {state.msg && <span className={cx("text-[13px]", state.kind === "error" ? "text-critical" : "text-stable")} role="status">{state.msg}</span>}
      </form>
      <div className="mt-5 border-t border-line pt-4">
        <div className="text-[12px] text-muted">{t.devices}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {devices.map((d) => (
            <span key={d.label} className="inline-flex items-center gap-2 rounded-full border border-dashed border-line-2 px-3 py-1.5 text-[13px] text-muted" aria-disabled>
              <d.icon size={14} strokeWidth={1.75} aria-hidden />{d.label}
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] tracking-wide uppercase"><Bluetooth size={10} aria-hidden />{t.soon}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 1 · Prescriptions */

export function Prescriptions({ meds, lang, now }: { meds?: Medication[]; lang: Lang; now?: string }) {
  const t = P[lang];
  return (
    <section className="h-full rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="eyebrow flex items-center gap-2"><Pill size={13} strokeWidth={1.75} aria-hidden />{t.prescriptions}</div>
      {!meds ? (
        <Skeleton className="mt-4 h-40" />
      ) : (
        <ul className="mt-4 space-y-3">
          {meds.map((m, i) => {
            const next = now ? m.doses.find((d) => d.status === "pending" && d.scheduled_at >= now) : undefined;
            return (
              <motion.li
                key={m.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="rounded-2xl border border-line p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-[16px] font-medium">{m.name} <span className="font-normal text-muted">{m.dose}</span></div>
                  {m.critical && <span className="inline-flex items-center gap-1 rounded-full bg-critical-soft px-2.5 py-0.5 text-[11px] text-critical"><ShieldAlert size={12} aria-hidden />{t.important}</span>}
                </div>
                <div className="mt-1 text-[13px] text-muted">{m.purpose} · {t.timesDay(m.times.length)}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {m.times.map((tm) => <span key={tm} className="rounded-full bg-surface-2 px-2.5 py-0.5 font-mono text-[12px]">{tm}</span>)}
                  {next && <span className="ml-auto text-[12px] text-teal">{t.next}: {fmtTime(next.scheduled_at)}</span>}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ 2 · Doses & adherence */

type DoseState = "taken" | "delayed" | "missed" | "pending";
const LATE_MS = 30 * 60_000;
const doseState = (status: string, scheduled: string, recorded: string | null): DoseState =>
  status === "taken" ? (recorded && Date.parse(recorded) - Date.parse(scheduled) > LATE_MS ? "delayed" : "taken") : (status as DoseState);

const DOSE_STYLE: Record<DoseState, string> = {
  taken: "bg-stable",
  delayed: "bg-watch",
  missed: "bg-critical",
  pending: "bg-surface-2 border border-line-2",
};

export function AdherenceTracker({ meds, lang, now, onChanged }: { meds?: Medication[]; lang: Lang; now?: string; onChanged: () => void }) {
  const t = P[lang];
  const today = now ? istDateKey(now) : "";
  const days = useMemo(() => {
    const keys = new Set<string>();
    meds?.forEach((m) => m.doses.forEach((d) => keys.add(istDateKey(d.scheduled_at))));
    return [...keys].sort().filter((k) => k <= today).slice(-7);
  }, [meds, today]);
  const todays = meds
    ?.flatMap((m) => m.doses.filter((d) => istDateKey(d.scheduled_at) === today).map((d) => ({ m, d })))
    .sort((a, b) => a.d.scheduled_at.localeCompare(b.d.scheduled_at));
  const label: Record<DoseState, string> = { taken: t.taken, delayed: t.delayed, missed: t.missed, pending: t.due };
  return (
    <section className="h-full rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="eyebrow flex items-center gap-2"><Check size={13} strokeWidth={1.75} aria-hidden />{t.doses}</div>
      {!todays ? (
        <Skeleton className="mt-4 h-40" />
      ) : (
        <>
          <ul className="mt-4 divide-y divide-line">
            {todays.map(({ m, d }) => {
              const st = doseState(d.status, d.scheduled_at, d.recorded_at);
              const canMark = st === "pending" && now !== undefined && Date.parse(d.scheduled_at) <= Date.parse(now) + 60 * 60_000;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="w-12 font-mono text-[13px] text-muted tnum">{fmtTime(d.scheduled_at)}</span>
                  <span className="min-w-0 flex-1 text-[14px]">{m.name}</span>
                  {canMark ? (
                    <span className="flex gap-1.5">
                      <DoseButton label={t.markTaken} tone="ok" onClick={async () => { await api.recordDose(d.id, "taken"); onChanged(); }} />
                      <DoseButton label={t.markMissed} tone="miss" onClick={async () => { await api.recordDose(d.id, "missed"); onChanged(); }} />
                    </span>
                  ) : (
                    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px]",
                      st === "taken" && "bg-stable-soft text-stable", st === "delayed" && "bg-watch-soft text-watch",
                      st === "missed" && "bg-critical-soft text-critical", st === "pending" && "border border-line-2 text-muted")}>
                      {label[st]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {days.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex items-center justify-between text-[12px] text-muted">
                <span>{t.week}</span>
                <span className="flex items-center gap-3">
                  {(["taken", "delayed", "missed"] as DoseState[]).map((k) => (
                    <span key={k} className="inline-flex items-center gap-1"><span className={cx("size-2 rounded-sm", DOSE_STYLE[k])} />{label[k]}</span>
                  ))}
                </span>
              </div>
              <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((day, i) => {
                  const ds = meds!.flatMap((m) => m.doses.filter((d) => istDateKey(d.scheduled_at) === day && (!now || d.scheduled_at <= now)));
                  return (
                    <div key={day} className="flex flex-col items-center gap-1">
                      <div className="flex flex-col gap-1">
                        {ds.map((d, j) => (
                          <motion.span
                            key={d.id}
                            className={cx("block size-3.5 rounded-[4px]", DOSE_STYLE[doseState(d.status, d.scheduled_at, d.recorded_at)])}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: i * 0.05 + j * 0.02 }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-faint">{new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "narrow" }).format(new Date(day))}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DoseButton({ label, tone, onClick }: { label: string; tone: "ok" | "miss"; onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
      className={cx("h-9 rounded-full px-4 text-[13px] font-medium transition-colors disabled:opacity-60",
        tone === "ok" ? "bg-ink text-bg hover:bg-teal" : "border border-line-2 text-muted hover:text-critical")}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ 8 · Assistant */

export function AssistantChat({ patientId, lang }: { patientId: string; lang: Lang }) {
  const t = P[lang];
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<(ChatTurn & { urgent?: boolean })[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  // Block bodies on purpose: an effect must return nothing but a cleanup (scrollIntoView can return a Promise).
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);
  useEffect(() => {
    setTurns([]);
  }, [patientId]);

  const send = async (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    const history = turns.map(({ role, text }) => ({ role, text }));
    setTurns((x) => [...x, { role: "user", text: m }]);
    setText("");
    setBusy(true);
    try {
      const r = await api.chat(patientId, m, lang, history);
      setTurns((x) => [...x, { role: "assistant", text: r.reply, urgent: r.urgent }]);
    } catch (e) {
      setTurns((x) => [...x, { role: "assistant", text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-ink py-2 pr-5 pl-2 text-[14px] font-medium text-bg shadow-[0_18px_50px_-15px_rgba(0,0,0,0.6)] hover:bg-teal sm:right-6 sm:bottom-6"
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        aria-expanded={open}
      >
        <LogoMark size={30} />
        {open ? <X size={16} aria-hidden /> : <MessageCircleHeart size={16} aria-hidden />}
        {t.ask}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed right-4 bottom-20 left-4 z-40 flex max-h-[72dvh] flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-[0_30px_90px_-30px_rgba(0,0,0,0.7)] sm:left-auto sm:w-[400px] sm:right-6 sm:bottom-24"
            role="dialog"
            aria-label={t.assistantTitle}
            lang={lang}
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <LogoMark size={32} />
              <div className="min-w-0">
                <div className="text-[15px] font-medium">{t.assistantTitle}</div>
                <div className="truncate text-[12px] text-muted">{t.assistantHint}</div>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {turns.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {t.suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line-2 px-3 py-1.5 text-[13px] text-ink-2 hover:border-teal hover:text-teal">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {turns.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cx("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed",
                    m.role === "user" ? "ml-auto rounded-br-md bg-ink text-bg" : m.urgent ? "rounded-bl-md border border-critical/40 bg-critical-soft text-critical" : "rounded-bl-md bg-surface-2 text-ink")}
                >
                  {m.urgent && <div className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"><ShieldAlert size={12} aria-hidden />{t.urgentTag}</div>}
                  <div>{m.text}</div>
                </motion.div>
              ))}
              {busy && (
                <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-3" aria-label="Typing">
                  {[0, 1, 2].map((i) => (
                    <motion.span key={i} className="size-1.5 rounded-full bg-muted" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </div>
              )}
              <div ref={end} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
              className="flex items-center gap-2 border-t border-line p-3"
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.placeholder}
                maxLength={500}
                aria-label={t.placeholder}
                className="h-11 flex-1 rounded-full border border-line bg-bg px-4 text-[14px] outline-none focus:border-line-2"
              />
              <button type="submit" disabled={busy || !text.trim()} className="grid size-11 shrink-0 place-items-center rounded-full bg-teal text-bg disabled:opacity-40" aria-label="Send">
                <Send size={16} aria-hidden />
              </button>
            </form>
            <p className="px-4 pb-3 text-[11px] leading-relaxed text-faint">{t.assistantNote}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
