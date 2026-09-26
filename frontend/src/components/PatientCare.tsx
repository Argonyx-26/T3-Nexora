import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  BatteryFull,
  CalendarDays,
  BatteryLow,
  BatteryMedium,
  BellRing,
  CalendarHeart,
  Check,
  CircleCheck,
  ClipboardList,
  HandHeart,
  History,
  Moon,
  NotebookPen,
  PhoneCall,
  Pill,
  Radio,
  Send,
  ShieldCheck,
  Siren,
  Stethoscope,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, useQuery } from "../lib/api";
import { LEVEL_STYLE, RED_FLAG_SYMPTOMS, SYMPTOM_LABEL, fmtTime, istDateKey } from "../lib/format";
import { onAlert, useLive } from "../lib/live";
import type { AlertItem, Checkin, Factor, Level, ReadingSource, Risk, SymptomLog, TimelineEvent } from "../lib/types";
import { Skeleton, cx } from "./ui";

/*
 * The patient's side of care: a daily check-in, a symptom tracker with severity and trends,
 * smart alerts in plain words, the care team's status on each alert, and a personal health
 * timeline. English or Hindi throughout; informational, never a diagnosis.
 */

type Lang = "en" | "hi";

const LEVEL_T: Record<Lang, Record<Level, string>> = {
  en: { Stable: "Stable", Watch: "Watch", Warning: "Warning", Critical: "Critical" },
  hi: { Stable: "स्थिर", Watch: "निगरानी", Warning: "चेतावनी", Critical: "गंभीर" },
};

const C = {
  en: {
    checkin: "Daily check-in", checkinHint: "Three taps. How are you today?", mood: "Mood", energy: "Energy", sleep: "Sleep last night",
    low: "Low", okay: "Okay", good: "Good", poor: "Poor", anything: "Anything bothering you?", notePh: "Add a note (optional)",
    submit: "Check in", done: "Checked in for today", again: "Check in again", thanks: "Thank you — your care team can see this.", week: "Your week",
    symptoms: "Symptom tracker", symptomsHint: "Tick what you feel, then tell us how bad and how long.", severity: "How bad?", duration: "For how long?",
    frequency: "How often?", mild: "Mild", moderate: "Moderate", severe: "Severe", today: "Today", days: "1–3 days", longer: "Longer",
    once: "Once", onOff: "On and off", constant: "All the time", send: "Send to my care team", sent: "Sent — your care team can see it.",
    pickOne: "Tick at least one symptom.", redflag: "This can be serious. Please tell a nurse or call 108 now.", trends: "Trends · 7 days", recent: "Recently reported",
    none: "Nothing reported in the last 7 days.", unspecified: "Not rated",
    alerts: "Smart health alerts", noAlerts: "No alerts. AYU is watching quietly in the background.", triggered: "What triggered this",
    alsoWatching: "Also keeping an eye on", toldTeam: "Your care team has been told", seen: "Seen by your care team", closed: "Closed by your care team",
    newChange: "AYU noticed a change — your care team has been told.",
    care: "Care team", careWard: (w: string, b: string) => `${w} · Bed ${b}`, connected: "Connected to the ward dashboard",
    step1: "Sent to care team", step2: "Seen", step3: "Resolved", nothingOpen: "Nothing needs your care team right now.",
    callBell: "Use the call bell, or tell the nurse on duty", emergency: "Emergency", lastUpdate: "Last update",
    timeline: "Your health timeline", timelineHint: "Everything important, in order.", all: "All", status: "Status", meds: "Medicines", readings: "Readings",
    alertsF: "Alerts", checkins: "Check-ins", showMore: "Show more", empty: "Nothing here yet.", todayL: "Today", yesterday: "Yesterday",
  },
  hi: {
    checkin: "रोज़ की जाँच", checkinHint: "बस तीन टैप। आज आप कैसे हैं?", mood: "मन", energy: "ऊर्जा", sleep: "कल रात की नींद",
    low: "कम", okay: "ठीक", good: "अच्छी", poor: "खराब", anything: "कोई तकलीफ़?", notePh: "कुछ लिखना चाहें (वैकल्पिक)",
    submit: "जाँच दर्ज करें", done: "आज की जाँच हो गई", again: "फिर से दर्ज करें", thanks: "धन्यवाद — आपकी देखभाल टीम इसे देख सकती है।", week: "आपका हफ़्ता",
    symptoms: "लक्षण ट्रैकर", symptomsHint: "जो महसूस हो रहा है उस पर टिक करें, फिर बताएं कितना और कब से।", severity: "कितना?", duration: "कब से?",
    frequency: "कितनी बार?", mild: "हल्का", moderate: "मध्यम", severe: "तेज़", today: "आज से", days: "1–3 दिन", longer: "ज़्यादा",
    once: "एक बार", onOff: "रुक-रुक कर", constant: "लगातार", send: "देखभाल टीम को भेजें", sent: "भेज दिया — आपकी टीम इसे देख सकती है।",
    pickOne: "कम से कम एक लक्षण चुनें।", redflag: "यह गंभीर हो सकता है। कृपया अभी नर्स को बताएं या 108 पर कॉल करें।", trends: "रुझान · 7 दिन", recent: "हाल में बताए गए",
    none: "पिछले 7 दिनों में कुछ नहीं बताया गया।", unspecified: "बिना स्तर",
    alerts: "स्मार्ट हेल्थ अलर्ट", noAlerts: "कोई अलर्ट नहीं। AYU चुपचाप नज़र रख रहा है।", triggered: "इसकी वजह",
    alsoWatching: "इन पर भी नज़र है", toldTeam: "आपकी देखभाल टीम को बता दिया गया है", seen: "आपकी टीम ने देख लिया", closed: "आपकी टीम ने बंद किया",
    newChange: "AYU ने एक बदलाव देखा — आपकी देखभाल टीम को बता दिया गया है।",
    care: "देखभाल टीम", careWard: (w: string, b: string) => `${w} · बेड ${b}`, connected: "वार्ड डैशबोर्ड से जुड़ा है",
    step1: "टीम को भेजा गया", step2: "देख लिया", step3: "सुलझ गया", nothingOpen: "अभी देखभाल टीम के लिए कुछ नहीं है।",
    callBell: "कॉल बेल दबाएं, या ड्यूटी पर नर्स को बताएं", emergency: "आपातकाल", lastUpdate: "आख़िरी अपडेट",
    timeline: "आपकी सेहत की टाइमलाइन", timelineHint: "हर ज़रूरी बात, क्रम से।", all: "सभी", status: "स्थिति", meds: "दवाइयाँ", readings: "रीडिंग",
    alertsF: "अलर्ट", checkins: "जाँच", showMore: "और देखें", empty: "अभी यहाँ कुछ नहीं है।", todayL: "आज", yesterday: "कल",
  },
};

/* ------------------------------------------------------------------ shared: tones and plain-language factors */

type Tone = "stable" | "watch" | "warning" | "critical" | "sky" | "teal" | "violet" | "muted";
const TONE: Record<Tone, string> = {
  stable: "bg-stable-soft text-stable",
  watch: "bg-watch-soft text-watch",
  warning: "bg-warning-soft text-warning",
  critical: "bg-critical-soft text-critical",
  sky: "bg-sky-soft text-sky",
  teal: "bg-teal-soft text-teal",
  violet: "bg-violet-soft text-violet",
  muted: "bg-surface-2 text-muted",
};
const levelTone = (l: Level | null | undefined): Tone => (l === "Critical" ? "critical" : l === "Warning" ? "warning" : l === "Watch" ? "watch" : "stable");

const VITAL_NAME: Record<Lang, Record<string, string>> = {
  en: { hr: "heart rate", spo2: "oxygen level", sbp: "blood pressure", dbp: "blood pressure", rr: "breathing rate", temp: "temperature", glucose: "blood sugar" },
  hi: { hr: "धड़कन", spo2: "ऑक्सीजन", sbp: "ब्लड प्रेशर", dbp: "ब्लड प्रेशर", rr: "साँस की गति", temp: "तापमान", glucose: "ब्लड शुगर" },
};

/** A clinical factor, said the way a patient would understand it. */
export function friendlyFactor(f: Factor, lang: Lang): string {
  const hi = lang === "hi";
  const m = f.factor.match(/^(hr|spo2|sbp|dbp|rr|temp|glucose)_(baseline|trend)$/);
  if (m) {
    const name = VITAL_NAME[lang][m[1]];
    const down = /below|falling|down|lower|decreas/i.test(f.message);
    if (m[2] === "baseline") return hi ? `आपका ${name} आपके सामान्य से ${down ? "कम" : "ज़्यादा"} है` : `Your ${name} is ${down ? "lower" : "higher"} than your usual`;
    return hi ? `आपका ${name} कुछ घंटों से ${down ? "घट" : "बढ़"} रहा है` : `Your ${name} has been ${down ? "falling" : "rising"} for a few hours`;
  }
  if (f.kind === "news2") return hi ? "अस्पताल की सामान्य जाँच (NEWS2) का स्कोर बढ़ा है" : "The standard ward check (NEWS2) has gone up";
  if (f.kind === "qsofa") return hi ? "संक्रमण के लिए देखे जाने वाले संकेत" : "Signs your care team checks for infection";
  if (f.kind === "symptom") {
    const key = f.factor.replace(/^symptom_/, "");
    const label = SYMPTOM_LABEL[key]?.[lang] ?? f.headline;
    return hi ? `आपने बताया: ${label}` : `You reported: ${label}`;
  }
  if (f.kind === "adherence" || f.kind === "medication") return hi ? "कुछ दवाइयों की खुराक छूटी है" : "Some medicine doses were missed";
  if (f.kind === "escalation") return hi ? "एक रीडिंग पर जल्द ध्यान देना ज़रूरी है" : "A reading needs prompt review";
  return f.headline;
}

function Section({ icon: Icon, title, hint, children, className, right }: { icon: LucideIcon; title: string; hint?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={cx("rounded-3xl border border-line bg-surface p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow flex items-center gap-2"><Icon size={13} strokeWidth={1.75} aria-hidden />{title}</div>
          {hint && <p className="mt-2 text-[13px] text-muted">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ 14 · Daily check-in */

const MOODS = [
  { v: 1, e: "😣", en: "Awful", hi: "बहुत बुरा" },
  { v: 2, e: "🙁", en: "Not good", hi: "ठीक नहीं" },
  { v: 3, e: "😐", en: "Okay", hi: "ठीक-ठाक" },
  { v: 4, e: "🙂", en: "Good", hi: "अच्छा" },
  { v: 5, e: "😄", en: "Great", hi: "बहुत अच्छा" },
];
const QUICK = ["fatigue", "cough", "dizziness", "breathlessness", "fever_chills", "severe_headache"];

export function DailyCheckin({ patientId, lang, now, source, onSaved }: { patientId: string; lang: Lang; now?: string; source: ReadingSource; onSaved: () => void }) {
  const t = C[lang];
  const reduce = useReducedMotion();
  const list = useQuery((s) => api.checkins(patientId, s), [patientId]);
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const today = now ? istDateKey(now) : "";
  const todays = list.data?.find((c) => istDateKey(c.ts) === today);
  const showForm = !todays || editing;

  const submit = async () => {
    if (!mood || !energy || !sleep) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.addCheckin(patientId, { mood, energy, sleep, note, symptoms: picked, source });
      setMood(null);
      setEnergy(null);
      setSleep(null);
      setPicked([]);
      setNote("");
      setEditing(false);
      list.reload();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const energyOpts: { v: number; icon: LucideIcon; label: string }[] = [
    { v: 1, icon: BatteryLow, label: t.low },
    { v: 2, icon: BatteryMedium, label: t.okay },
    { v: 3, icon: BatteryFull, label: t.good },
  ];
  const sleepOpts = [
    { v: 1, n: 1, label: t.poor },
    { v: 2, n: 2, label: t.okay },
    { v: 3, n: 3, label: t.good },
  ];
  const week = (list.data ?? []).slice().reverse().slice(-7);

  return (
    <Section icon={CalendarHeart} title={t.checkin} hint={showForm ? t.checkinHint : undefined}
      className="relative overflow-hidden bg-[linear-gradient(135deg,var(--violet-soft,transparent),transparent_55%)]">
      <AnimatePresence mode="wait">
        {!showForm && todays ? (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex flex-wrap items-center gap-5">
            <motion.svg viewBox="0 0 52 52" className="size-14 text-stable" aria-hidden>
              <motion.circle cx={26} cy={26} r={23} fill="none" stroke="currentColor" strokeWidth={3} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 0.6 }} />
              <motion.path d="M15 27 l7 7 l15 -16" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.5 }} />
            </motion.svg>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[26px] leading-tight">{t.done} <span aria-hidden>{MOODS[todays.mood - 1].e}</span></div>
              <p className="mt-1 text-[13px] text-muted">{t.thanks}</p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="h-10 rounded-full border border-line-2 px-4 text-[13px] text-muted hover:text-ink">{t.again}</button>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 space-y-5">
            <div>
              <div className="text-[12px] text-muted">{t.mood}</div>
              <div className="mt-2 flex gap-1.5 sm:gap-2" role="radiogroup" aria-label={t.mood}>
                {MOODS.map((m) => (
                  <motion.button
                    key={m.v}
                    type="button"
                    role="radio"
                    aria-checked={mood === m.v}
                    onClick={() => setMood(m.v)}
                    whileHover={reduce ? undefined : { y: -3 }}
                    whileTap={{ scale: 0.92 }}
                    className={cx("flex min-w-[56px] flex-1 flex-col items-center gap-1 rounded-2xl border px-1.5 py-2.5 transition-colors sm:max-w-[96px]",
                      mood === m.v ? "border-violet bg-violet-soft" : "border-line hover:border-line-2")}
                  >
                    <motion.span className="text-[30px] leading-none" animate={mood === m.v && !reduce ? { scale: [1, 1.25, 1] } : { scale: 1 }} transition={{ duration: 0.4 }}>{m.e}</motion.span>
                    <span className="text-[11px] text-muted">{m[lang]}</span>
                  </motion.button>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="text-[12px] text-muted">{t.energy}</div>
                <div className="mt-2 flex gap-2">
                  {energyOpts.map((o) => (
                    <button key={o.v} type="button" aria-pressed={energy === o.v} onClick={() => setEnergy(o.v)}
                      className={cx("inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[13px] transition-colors",
                        energy === o.v ? "border-teal bg-teal-soft text-teal" : "border-line text-ink-2 hover:border-line-2")}>
                      <o.icon size={16} strokeWidth={1.75} aria-hidden />{o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-muted">{t.sleep}</div>
                <div className="mt-2 flex gap-2">
                  {sleepOpts.map((o) => (
                    <button key={o.v} type="button" aria-pressed={sleep === o.v} onClick={() => setSleep(o.v)}
                      className={cx("inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-xl border text-[13px] transition-colors",
                        sleep === o.v ? "border-sky bg-sky-soft text-sky" : "border-line text-ink-2 hover:border-line-2")}>
                      {Array.from({ length: o.n }).map((_, i) => <Moon key={i} size={12} strokeWidth={1.75} aria-hidden />)}
                      <span className="ml-1">{o.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[12px] text-muted">{t.anything}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {QUICK.map((k) => {
                  const on = picked.includes(k);
                  return (
                    <button key={k} type="button" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== k) : [...p, k]))}
                      className={cx("h-9 rounded-full border px-3.5 text-[13px] transition-colors", on ? "border-teal bg-teal-soft text-teal" : "border-line hover:border-line-2")}>
                      {SYMPTOM_LABEL[k]?.[lang] ?? k}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t.notePh} aria-label={t.notePh}
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-[14px] outline-none focus:border-line-2" />
              <button type="button" onClick={submit} disabled={busy || !mood || !energy || !sleep}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-bg transition-colors hover:bg-teal disabled:opacity-40">
                <Check size={15} strokeWidth={1.75} aria-hidden />{t.submit}
              </button>
            </div>
            {error && <p className="text-[13px] text-critical">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
      {week.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="text-[12px] text-muted">{t.week}</div>
          <div className="mt-2 flex gap-2">
            {week.map((c: Checkin, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 px-2.5 py-1.5" title={MOODS[c.mood - 1][lang]}>
                <span className="text-[20px] leading-none">{MOODS[c.mood - 1].e}</span>
                <span className="text-[10px] text-faint">{fmtTime(c.ts)}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ 10 · Symptom tracker */

const SYMPTOM_ORDER = Object.keys(SYMPTOM_LABEL).sort((a, b) => Number(RED_FLAG_SYMPTOMS.has(b)) - Number(RED_FLAG_SYMPTOMS.has(a)));
const SEV_TONE = { mild: "bg-sky", moderate: "bg-watch", severe: "bg-critical", "": "bg-line-2" } as const;

export function SymptomTracker({ patientId, lang, source, log, now, onSent }: { patientId: string; lang: Lang; source: ReadingSource; log?: SymptomLog[]; now?: string; onSent: () => void }) {
  const t = C[lang];
  const [picked, setPicked] = useState<string[]>([]);
  const [severity, setSeverity] = useState<"" | "mild" | "moderate" | "severe">("");
  const [duration, setDuration] = useState<"" | "today" | "days" | "week">("");
  const [frequency, setFrequency] = useState<"" | "once" | "on_off" | "constant">("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "error"; msg?: string; red?: boolean }>({ kind: "idle" });
  const red = picked.some((k) => RED_FLAG_SYMPTOMS.has(k));

  const send = async () => {
    if (!picked.length) {
      setState({ kind: "error", msg: t.pickOne });
      return;
    }
    setState({ kind: "busy" });
    try {
      await api.reportSymptoms(patientId, picked, source, note, { severity, duration, frequency });
      setState({ kind: "ok", msg: t.sent, red });
      setPicked([]);
      setSeverity("");
      setDuration("");
      setFrequency("");
      setNote("");
      onSent();
    } catch (e) {
      setState({ kind: "error", msg: (e as Error).message });
    }
  };

  // 7-day trend: reports per day, stacked by severity.
  type DayRow = { day: string; mild: number; moderate: number; severe: number; "": number };
  const trend = useMemo((): DayRow[] => {
    if (!log) return [];
    const byDay = new Map<string, Omit<DayRow, "day">>();
    for (const r of log) {
      const d = istDateKey(r.ts);
      const row = byDay.get(d) ?? { mild: 0, moderate: 0, severe: 0, "": 0 };
      row[r.severity || ""] += 1;
      byDay.set(d, row);
    }
    // Always the last seven days, so one busy day doesn't fill the whole chart.
    const end = now ? Date.parse(now) : Date.now();
    const days = Array.from({ length: 7 }, (_, i) => istDateKey(new Date(end - (6 - i) * 86_400_000).toISOString()));
    return days.map((d) => ({ day: d, ...(byDay.get(d) ?? { mild: 0, moderate: 0, severe: 0, "": 0 }) }));
  }, [log, now]);
  const maxDay = Math.max(1, ...trend.map((d) => d.mild + d.moderate + d.severe + d[""]));

  const Seg = <T extends string>({ value, set, opts }: { value: T; set: (v: T) => void; opts: { v: T; label: string; dot?: string }[] }) => (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => set(value === o.v ? ("" as T) : o.v)}
          className={cx("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors",
            value === o.v ? "border-ink bg-ink text-bg" : "border-line hover:border-line-2")}>
          {o.dot && <span className={cx("size-2 rounded-full", o.dot)} />}{o.label}
        </button>
      ))}
    </div>
  );

  return (
    <Section icon={ClipboardList} title={t.symptoms} hint={t.symptomsHint}>
      <div className="mt-4 flex flex-wrap gap-2">
        {SYMPTOM_ORDER.map((k) => {
          const on = picked.includes(k);
          const isRed = RED_FLAG_SYMPTOMS.has(k);
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => { setPicked((p) => (on ? p.filter((x) => x !== k) : [...p, k])); if (state.kind !== "busy") setState({ kind: "idle" }); }}
              className={cx("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] transition-colors",
                on ? (isRed ? "border-critical bg-critical-soft text-critical" : "border-teal bg-teal-soft text-teal") : "border-line hover:border-line-2")}>
              {isRed && <span className="size-1.5 rounded-full bg-critical" aria-hidden />}
              {SYMPTOM_LABEL[k][lang]}
            </button>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {picked.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-5 grid gap-4 rounded-2xl bg-surface-2 p-4 md:grid-cols-3">
              <div><div className="mb-2 text-[12px] text-muted">{t.severity}</div>
                <Seg value={severity} set={setSeverity} opts={[{ v: "mild", label: t.mild, dot: "bg-sky" }, { v: "moderate", label: t.moderate, dot: "bg-watch" }, { v: "severe", label: t.severe, dot: "bg-critical" }]} /></div>
              <div><div className="mb-2 text-[12px] text-muted">{t.duration}</div>
                <Seg value={duration} set={setDuration} opts={[{ v: "today", label: t.today }, { v: "days", label: t.days }, { v: "week", label: t.longer }]} /></div>
              <div><div className="mb-2 text-[12px] text-muted">{t.frequency}</div>
                <Seg value={frequency} set={setFrequency} opts={[{ v: "once", label: t.once }, { v: "on_off", label: t.onOff }, { v: "constant", label: t.constant }]} /></div>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t.notePh} aria-label={t.notePh}
                className="h-11 rounded-full border border-line bg-bg px-4 text-[14px] outline-none focus:border-line-2 md:col-span-3" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {(red || state.red) && (
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-critical-soft px-4 py-3 text-[14px] font-medium text-critical" role="alert">
          <TriangleAlert size={18} strokeWidth={1.75} aria-hidden className="mt-px shrink-0" />{t.redflag}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={send} disabled={state.kind === "busy"} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-bg transition-colors hover:bg-teal disabled:opacity-60">
          <Send size={15} strokeWidth={1.75} aria-hidden />{t.send}
        </button>
        {state.msg && <span className={cx("text-[13px]", state.kind === "error" ? "text-critical" : "text-stable")} role="status">{state.msg}</span>}
      </div>

      <div className="mt-6 grid gap-6 border-t border-line pt-5 md:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span>{t.trends}</span>
            <span className="flex gap-2.5">
              {(["mild", "moderate", "severe"] as const).map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={cx("size-2 rounded-full", SEV_TONE[k])} />{t[k]}</span>)}
            </span>
          </div>
          {!log ? <Skeleton className="mt-3 h-28" /> : log.length === 0 ? <p className="mt-3 text-[13px] text-muted">{t.none}</p> : (
            <div className="mt-3 flex h-28 items-end gap-2">
              {trend.map((d, i) => {
                const total = d.mild + d.moderate + d.severe + d[""];
                return (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <motion.div className={cx("flex w-full flex-col-reverse overflow-hidden rounded-md", total === 0 && "bg-surface-2")} initial={{ height: 0 }} animate={{ height: total ? `${(total / maxDay) * 92}px` : "4px" }} transition={{ duration: 0.6, delay: i * 0.05 }}>
                      {(["", "mild", "moderate", "severe"] as const).map((k) => d[k] > 0 && <span key={k} className={SEV_TONE[k]} style={{ flex: d[k] }} />)}
                    </motion.div>
                    <span className="text-[10px] text-faint">{new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "narrow" }).format(new Date(d.day))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <div className="text-[12px] text-muted">{t.recent}</div>
          {!log ? <Skeleton className="mt-3 h-28" /> : log.length === 0 ? <p className="mt-3 text-[13px] text-muted">{t.none}</p> : (
            <ul className="mt-2 divide-y divide-line">
              {log.slice(0, 5).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                  <span className={cx("size-2 rounded-full", SEV_TONE[r.severity || ""])} />
                  <span className="font-medium">{lang === "hi" ? r.label_hi : r.label_en}</span>
                  {r.severity && <span className="text-muted">· {t[r.severity]}</span>}
                  {r.duration && <span className="text-muted">· {r.duration === "today" ? t.today : r.duration === "days" ? t.days : t.longer}</span>}
                  {r.frequency && <span className="text-muted">· {r.frequency === "once" ? t.once : r.frequency === "on_off" ? t.onOff : t.constant}</span>}
                  <span className="ml-auto font-mono text-[11px] text-faint">{fmtTime(r.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ 12 · Smart alerts + 13 · Care team */

function usePatientAlerts(patientId: string) {
  const live = useLive();
  const key = live.alerts.filter((a) => a.patient_id === patientId).map((a) => `${a.id}:${a.level}:${a.status}`).join(",");
  return useQuery((s) => api.patientAlerts(patientId, s), [patientId, key]);
}

const ALERT_TITLE: Record<Lang, Record<Level, string>> = {
  en: { Stable: "AYU noticed a change", Watch: "AYU noticed a small change", Warning: "AYU noticed an important change", Critical: "Your readings need attention now" },
  hi: { Stable: "AYU ने बदलाव देखा", Watch: "AYU ने थोड़ा बदलाव देखा", Warning: "AYU ने एक ज़रूरी बदलाव देखा", Critical: "आपकी रीडिंग पर तुरंत ध्यान ज़रूरी" },
};
const LEVEL_ICON: Record<Level, LucideIcon> = { Stable: ShieldCheck, Watch: Activity, Warning: TriangleAlert, Critical: Siren };

export function SmartAlerts({ patientId, lang, risk }: { patientId: string; lang: Lang; risk?: Risk }) {
  const t = C[lang];
  const alerts = usePatientAlerts(patientId);
  const [banner, setBanner] = useState(false);
  useEffect(
    () =>
      onAlert((a) => {
        if (a.patient_id !== patientId) return;
        setBanner(true);
        window.setTimeout(() => setBanner(false), 8000);
      }),
    [patientId],
  );
  const list = (alerts.data ?? []).slice(0, 4);
  const watching = risk ? Object.entries(risk.trends).filter(([, v]) => v?.flagged).map(([k, v]) => ({ k, down: (v?.slope_per_hr ?? 0) < 0 })) : [];
  return (
    <Section icon={BellRing} title={t.alerts} className="h-full">
      <AnimatePresence>
        {banner && (
          <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden rounded-2xl bg-warning-soft px-4 py-3 text-[14px] font-medium text-warning" role="status">
            <span className="flex items-center gap-2"><BellRing size={16} aria-hidden className="bell-ring" />{t.newChange}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {!alerts.data ? <Skeleton className="mt-4 h-40" /> : list.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-stable-soft p-4 text-[14px] text-stable">
          <ShieldCheck size={22} strokeWidth={1.75} aria-hidden className="shrink-0" />{t.noAlerts}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((a, i) => <AlertNote key={a.id} a={a} lang={lang} i={i} />)}
        </ul>
      )}
      {watching.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="text-[12px] text-muted">{t.alsoWatching}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {watching.map((w) => (
              <span key={w.k} className="rounded-full bg-watch-soft px-3 py-1 text-[12px] text-watch">
                {lang === "hi" ? `${VITAL_NAME.hi[w.k]} ${w.down ? "घट रहा" : "बढ़ रहा"}` : `${VITAL_NAME.en[w.k]} ${w.down ? "falling" : "rising"}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function AlertNote({ a, lang, i }: { a: AlertItem; lang: Lang; i: number }) {
  const t = C[lang];
  const Icon = LEVEL_ICON[a.level];
  const reasons = a.factors.filter((f) => f.contribution > 0).slice(0, 3).map((f) => friendlyFactor(f, lang));
  const status = a.status === "resolved" ? t.closed : a.status === "acknowledged" ? t.seen : t.toldTeam;
  return (
    <motion.li initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
      className={cx("relative rounded-2xl border p-4", a.status === "new" ? LEVEL_STYLE[a.level].border : "border-line", a.status === "resolved" && "opacity-70")}>
      <div className="flex items-start gap-3">
        <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", TONE[levelTone(a.level)])}>
          <Icon size={17} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[15px] font-medium">{ALERT_TITLE[lang][a.level]}</span>
            <span className="font-mono text-[11px] text-faint">{fmtTime(a.updated_at ?? a.created_at)}</span>
          </div>
          {reasons.length > 0 && (
            <>
              <div className="mt-2 text-[11px] tracking-wide text-muted uppercase">{t.triggered}</div>
              <ul className="mt-1 space-y-0.5">
                {reasons.map((r) => <li key={r} className="text-[13px] text-ink-2">• {r}</li>)}
              </ul>
            </>
          )}
          <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-teal"><Radio size={12} aria-hidden />{status}</div>
        </div>
      </div>
      {a.status === "new" && <span className="absolute top-3 right-3 size-2 rounded-full bg-critical pulse-critical" aria-hidden />}
    </motion.li>
  );
}

export function CareTeam({ patientId, lang, ward, bed }: { patientId: string; lang: Lang; ward: string; bed: string }) {
  const t = C[lang];
  const reduce = useReducedMotion();
  const alerts = usePatientAlerts(patientId);
  const current = alerts.data?.find((a) => a.status !== "resolved") ?? alerts.data?.[0];
  const steps = current
    ? [
        { label: t.step1, at: current.created_at, done: true },
        { label: t.step2, at: current.acknowledged_at, done: !!current.acknowledged_at, extra: current.acknowledged_by ? `${current.acknowledged_by}${current.note ? ` · “${current.note.split("\n").pop()}”` : ""}` : "" },
        { label: t.step3, at: current.resolved_at, done: !!current.resolved_at },
      ]
    : [];
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <Section icon={Stethoscope} title={t.care} className="h-full">
      <div className="mt-3 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-teal-soft text-teal"><Stethoscope size={20} strokeWidth={1.6} aria-hidden /></span>
        <div>
          <div className="text-[15px] font-medium">{t.careWard(ward, bed)}</div>
          <div className="inline-flex items-center gap-1.5 text-[12px] text-stable"><span className="live-dot size-1.5 rounded-full bg-stable" />{t.connected}</div>
        </div>
      </div>
      {!alerts.data ? <Skeleton className="mt-4 h-28" /> : !current ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-stable-soft px-4 py-3 text-[14px] text-stable"><CircleCheck size={18} aria-hidden />{t.nothingOpen}</div>
      ) : (
        <ol className="relative mt-5 space-y-4 pl-8">
          <span className="absolute top-2 bottom-2 left-[11px] w-0.5 rounded-full bg-surface-2" aria-hidden />
          <motion.span className="absolute top-2 left-[11px] w-0.5 origin-top rounded-full bg-teal" aria-hidden
            initial={{ height: 0 }} animate={{ height: `${((doneCount - 1) / 2) * 100}%` }} transition={{ duration: reduce ? 0 : 0.8 }} />
          {steps.map((s, i) => (
            <li key={s.label} className="relative">
              <span className={cx("absolute -left-8 grid size-6 place-items-center rounded-full border-2", s.done ? "border-teal bg-teal text-bg" : "border-line-2 bg-surface text-faint")}>
                {s.done ? <Check size={13} strokeWidth={2.5} aria-hidden /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <div className={cx("text-[14px]", s.done ? "font-medium text-ink" : "text-muted")}>{s.label}</div>
              <div className="text-[12px] text-muted">{s.at ? fmtTime(s.at) : "—"}{i === 1 && s.extra ? ` · ${s.extra}` : ""}</div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-5 space-y-2 border-t border-line pt-4 text-[13px]">
        <div className="flex items-center gap-2 text-ink-2"><BellRing size={15} strokeWidth={1.75} aria-hidden className="text-muted" />{t.callBell}</div>
        <a href="tel:108" className="inline-flex items-center gap-2 font-medium text-critical hover:underline"><PhoneCall size={15} strokeWidth={1.75} aria-hidden />{t.emergency}: 108</a>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ 9 · Personal health timeline */

type Filter = "all" | TimelineEvent["kind"];
const KIND_ICON: Record<TimelineEvent["kind"], LucideIcon> = {
  status: Activity, symptom: ClipboardList, dose: Pill, reading: NotebookPen, alert: BellRing, checkin: CalendarHeart,
  note: Stethoscope, appointment: CalendarDays,
};

function eventView(e: TimelineEvent, lang: Lang): { title: string; detail?: string; tone: Tone; icon: LucideIcon } {
  const hi = lang === "hi";
  const L = (l: string | null | undefined) => (l ? LEVEL_T[lang][l as Level] ?? l : "");
  const by = e.source === "asha" ? (hi ? "आशा कार्यकर्ता ने" : "by an ASHA worker") : e.source === "staff" ? (hi ? "स्टाफ़ ने" : "by staff") : "";
  switch (e.kind) {
    case "status":
      return {
        title: hi ? `स्थिति बदली: ${L(e.level)}` : `Status changed to ${L(e.level)}`,
        detail: hi ? `पहले ${L(e.prev_level)} · AYU ${e.values.score ?? ""}` : `from ${L(e.prev_level)} · AYU ${e.values.score ?? ""}`,
        tone: levelTone(e.level), icon: KIND_ICON.status,
      };
    case "symptom": {
      const sev = e.severity ? C[lang][e.severity as "mild" | "moderate" | "severe"] : "";
      return {
        title: hi ? `लक्षण बताया: ${e.label_hi}` : `Reported ${e.label_en?.toLowerCase()}`,
        detail: [sev, by, e.source === "sim" ? "" : e.note].filter(Boolean).join(" · ") || undefined,
        tone: e.level === "Critical" || e.severity === "severe" ? "critical" : e.severity === "moderate" ? "watch" : "sky", icon: KIND_ICON.symptom,
      };
    }
    case "dose":
      return {
        title: hi
          ? `${e.medicine} ${e.sub === "missed" ? "छूट गई" : e.sub === "delayed" ? "देर से ली" : "ली गई"}`
          : `${e.medicine} ${e.sub === "missed" ? "missed" : e.sub === "delayed" ? "taken late" : "taken"}`,
        tone: e.sub === "missed" ? "critical" : e.sub === "delayed" ? "watch" : "stable", icon: KIND_ICON.dose,
      };
    case "reading": {
      const v = e.values;
      const parts = [
        v.hr != null && `HR ${Math.round(v.hr)}`, v.spo2 != null && `SpO₂ ${Math.round(v.spo2)}%`,
        v.sbp != null && `BP ${Math.round(v.sbp)}/${Math.round(v.dbp ?? 0)}`, v.temp != null && `${v.temp.toFixed(1)}°C`,
      ].filter(Boolean);
      return { title: hi ? "रीडिंग दर्ज की" : "Reading added", detail: [parts.join(" · "), by].filter(Boolean).join(" · "), tone: "sky", icon: KIND_ICON.reading };
    }
    case "alert":
      if (e.sub === "acknowledged")
        return { title: hi ? "आपकी देखभाल टीम ने देखा" : "Seen by your care team", detail: [e.by, e.note && `“${e.note.split("\n").pop()}”`].filter(Boolean).join(" · ") || undefined, tone: "teal", icon: Stethoscope };
      if (e.sub === "resolved") return { title: hi ? "टीम ने अलर्ट बंद किया" : "Care team closed the alert", tone: "stable", icon: CircleCheck };
      if (e.sub === "escalated") return { title: hi ? `अलर्ट बढ़कर ${L(e.level)}` : `Alert raised to ${L(e.level)}`, tone: levelTone(e.level), icon: KIND_ICON.alert };
      return { title: hi ? `AYU ने टीम को सूचित किया (${L(e.level)})` : `AYU alerted your care team (${L(e.level)})`, tone: levelTone(e.level), icon: KIND_ICON.alert };
    case "note":
      return {
        title: e.sub === "followup" ? (hi ? "डॉक्टर के निर्देश" : "Follow-up from your doctor") : (hi ? "डॉक्टर का नोट" : "Note from your doctor"),
        detail: [e.by, e.note].filter(Boolean).join(" · "), tone: "teal", icon: KIND_ICON.note,
      };
    case "appointment": {
      const st: Record<string, [string, string]> = {
        requested: ["Appointment requested", "अपॉइंटमेंट का अनुरोध"], confirmed: ["Appointment confirmed", "अपॉइंटमेंट पक्का"],
        declined: ["Appointment declined", "अपॉइंटमेंट अस्वीकार"], done: ["Appointment done", "अपॉइंटमेंट पूरा"],
      };
      const [en, hiT] = st[e.sub] ?? st.requested;
      return {
        title: hi ? hiT : en,
        detail: [e.source === "video" ? (hi ? "वीडियो" : "Video") : (hi ? "अस्पताल में" : "In person"), e.note].filter(Boolean).join(" · "),
        tone: e.sub === "declined" ? "muted" : "violet", icon: KIND_ICON.appointment,
      };
    }
    case "checkin": {
      const m = MOODS[(e.mood ?? 3) - 1];
      return {
        title: hi ? `रोज़ की जाँच: ${m.hi} ${m.e}` : `Daily check-in: ${m.en} ${m.e}`,
        detail: [e.note, by].filter(Boolean).join(" · ") || undefined,
        tone: (e.mood ?? 3) >= 4 ? "stable" : (e.mood ?? 3) === 3 ? "violet" : "watch", icon: KIND_ICON.checkin,
      };
    }
  }
}

export function HealthTimeline({ patientId, lang, now, version }: { patientId: string; lang: Lang; now?: string; version: number }) {
  const t = C[lang];
  const reduce = useReducedMotion();
  const q = useQuery((s) => api.timeline(patientId, 48, s, "patient"), [patientId, version]);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(25);
  const filters: { f: Filter; label: string; icon?: LucideIcon }[] = [
    { f: "all", label: t.all }, { f: "status", label: t.status, icon: Activity }, { f: "alert", label: t.alertsF, icon: BellRing },
    { f: "symptom", label: C[lang].symptoms.split(" ")[0], icon: ClipboardList }, { f: "dose", label: t.meds, icon: Pill },
    { f: "reading", label: t.readings, icon: NotebookPen }, { f: "checkin", label: t.checkins, icon: HandHeart },
  ];
  const events = (q.data ?? []).filter((e) => filter === "all" || e.kind === filter);
  const shown = events.slice(0, limit);
  const today = now ? istDateKey(now) : "";
  const yesterday = now ? istDateKey(new Date(Date.parse(now) - 86_400_000).toISOString()) : "";
  const dayLabel = (d: string) => (d === today ? t.todayL : d === yesterday ? t.yesterday : new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "long", day: "numeric", month: "short" }).format(new Date(d)));
  const groups: { day: string; items: TimelineEvent[] }[] = [];
  for (const e of shown) {
    const d = istDateKey(e.ts);
    const g = groups[groups.length - 1];
    if (g && g.day === d) g.items.push(e);
    else groups.push({ day: d, items: [e] });
  }
  return (
    <Section icon={History} title={t.timeline} hint={t.timelineHint}>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {filters.map((x) => (
          <button key={x.f} type="button" aria-pressed={filter === x.f} onClick={() => { setFilter(x.f); setLimit(25); }}
            className={cx("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors", filter === x.f ? "bg-ink text-bg" : "border border-line text-muted hover:text-ink")}>
            {x.icon && <x.icon size={13} strokeWidth={1.75} aria-hidden />}{x.label}
          </button>
        ))}
      </div>
      {!q.data ? <Skeleton className="mt-5 h-64" /> : shown.length === 0 ? <p className="mt-5 text-[14px] text-muted">{t.empty}</p> : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <div key={g.day}>
              <div className="sticky top-16 z-10 -mx-1 mb-3 inline-block rounded-full bg-surface-2 px-3 py-1 text-[12px] font-medium text-ink-2">{dayLabel(g.day)}</div>
              <ol className="relative space-y-3 pl-11">
                <span className="absolute top-1 bottom-1 left-[17px] w-px bg-[linear-gradient(to_bottom,var(--teal),var(--violet,var(--teal)),transparent)]" aria-hidden />
                {g.items.map((e, i) => {
                  const v = eventView(e, lang);
                  return (
                    <motion.li
                      key={`${e.kind}-${e.ts}-${i}`}
                      className="relative"
                      initial={reduce ? false : { opacity: 0, x: -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-20px" }}
                      transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.03 }}
                    >
                      <span className={cx("absolute -left-11 grid size-9 place-items-center rounded-full ring-4 ring-surface", TONE[v.tone])}>
                        <v.icon size={16} strokeWidth={1.75} aria-hidden />
                      </span>
                      <div className="rounded-2xl border border-line px-4 py-2.5 transition-colors hover:border-line-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[14px] font-medium">{v.title}</span>
                          <span className="font-mono text-[11px] text-faint">{fmtTime(e.ts)}</span>
                        </div>
                        {v.detail && <div className="mt-0.5 text-[12px] text-muted">{v.detail}</div>}
                      </div>
                    </motion.li>
                  );
                })}
              </ol>
            </div>
          ))}
          {events.length > limit && (
            <button type="button" onClick={() => setLimit((n) => n + 25)} className="h-10 rounded-full border border-line-2 px-5 text-[13px] text-muted hover:text-ink">{t.showMore}</button>
          )}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ 6 · From your doctor (notes, follow-ups, appointments) */

const D = {
  en: {
    title: "From your doctor", none: "No notes yet. Your doctor's notes and follow-up instructions will appear here.",
    followup: "Follow-up", on: "by", request: "Request an appointment", reason: "What would you like to discuss?", when: "When suits you? (e.g. tomorrow morning)",
    inPerson: "In person", video: "Video", send: "Send request", sent: "Request sent — your care team will confirm.",
    requested: "Requested", confirmed: "Confirmed", declined: "Declined", done: "Done", join: "Join video consult",
  },
  hi: {
    title: "आपके डॉक्टर से", none: "अभी कोई नोट नहीं। डॉक्टर के नोट और आगे के निर्देश यहाँ दिखेंगे।",
    followup: "आगे के निर्देश", on: "तक", request: "अपॉइंटमेंट माँगें", reason: "आप किस बारे में बात करना चाहते हैं?", when: "कब ठीक रहेगा? (जैसे कल सुबह)",
    inPerson: "अस्पताल में", video: "वीडियो", send: "अनुरोध भेजें", sent: "अनुरोध भेज दिया — टीम पुष्टि करेगी।",
    requested: "अनुरोध किया", confirmed: "पक्का", declined: "अस्वीकार", done: "पूरा", join: "वीडियो कॉल से जुड़ें",
  },
};

export function DoctorMessages({ patientId, lang, version }: { patientId: string; lang: Lang; version: number }) {
  const t = D[lang];
  const notes = useQuery((s) => api.notes(patientId, true, s), [patientId, version]);
  const appts = useQuery((s) => api.appointments(patientId, s), [patientId, version]);
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState("");
  const [mode, setMode] = useState<"in_person" | "video">("in_person");
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api.requestAppointment(patientId, { reason, preferred: when, mode, requested_by: "patient" });
      setReason("");
      setWhen("");
      setMsg(t.sent);
      appts.reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section icon={Stethoscope} title={t.title}>
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          {!notes.data ? <Skeleton className="h-24" /> : notes.data.length === 0 ? <p className="text-[13px] text-muted">{t.none}</p> : (
            <ul className="space-y-2">
              {notes.data.slice(0, 4).map((n) => (
                <motion.li key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={cx("rounded-2xl p-4", n.kind === "followup" ? "bg-violet-soft" : "bg-surface-2")}>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    {n.kind === "followup" && <span className="rounded-full bg-surface px-2 py-0.5 text-violet">{t.followup}{n.follow_up_on ? ` · ${t.on} ${n.follow_up_on}` : ""}</span>}
                    <span className="ml-auto">{n.author} · {fmtTime(n.ts)}</span>
                  </div>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{n.text}</p>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-line p-4">
          <div className="text-[13px] font-medium">{t.request}</div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={t.reason} aria-label={t.reason}
            className="mt-3 h-11 w-full rounded-full border border-line bg-bg px-4 text-[14px] outline-none focus:border-line-2" />
          <input value={when} onChange={(e) => setWhen(e.target.value)} maxLength={120} placeholder={t.when} aria-label={t.when}
            className="mt-2 h-11 w-full rounded-full border border-line bg-bg px-4 text-[14px] outline-none focus:border-line-2" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-line p-1">
              {(["in_person", "video"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                  className={cx("h-8 rounded-full px-3 text-[12px]", mode === m ? "bg-ink text-bg" : "text-muted")}>{m === "video" ? t.video : t.inPerson}</button>
              ))}
            </div>
            <button type="button" onClick={send} disabled={busy} className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-bg hover:bg-teal disabled:opacity-50">
              <Send size={14} aria-hidden />{t.send}
            </button>
          </div>
          {msg && <p className="mt-2 text-[12px] text-stable" role="status">{msg}</p>}
          {appts.data && appts.data.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-line pt-3">
              {appts.data.slice(0, 3).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className={cx("rounded-full px-2 py-0.5 text-[11px]", a.status === "confirmed" ? "bg-teal-soft text-teal" : a.status === "requested" ? "bg-watch-soft text-watch" : "bg-surface-2 text-muted")}>{t[a.status]}</span>
                  <span className="text-ink-2">{a.mode === "video" ? t.video : t.inPerson}{a.scheduled_for ? ` · ${fmtTime(a.scheduled_for)}` : a.preferred ? ` · ${a.preferred}` : ""}</span>
                  {a.status === "confirmed" && a.video_url && (
                    <a href={a.video_url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-violet px-3 text-[12px] font-medium text-white">{t.join}</a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}
