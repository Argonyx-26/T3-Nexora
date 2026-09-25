import type { Level, VitalKey } from "./types";

export const DISCLAIMER = "AYU is decision support, not diagnosis. Final clinical judgment rests with the doctor.";

export const LEVELS: Level[] = ["Stable", "Watch", "Warning", "Critical"];
export const LEVEL_MIN: Record<Level, number> = { Stable: 0, Watch: 25, Warning: 50, Critical: 75 };

/** Tailwind classes per risk level: text, soft background, solid dot, border. */
export const LEVEL_STYLE: Record<Level, { text: string; soft: string; dot: string; border: string; hex: string }> = {
  Stable: { text: "text-stable", soft: "bg-stable-soft", dot: "bg-stable", border: "border-stable/30", hex: "var(--stable)" },
  Watch: { text: "text-watch", soft: "bg-watch-soft", dot: "bg-watch", border: "border-watch/30", hex: "var(--watch)" },
  Warning: { text: "text-warning", soft: "bg-warning-soft", dot: "bg-warning", border: "border-warning/35", hex: "var(--warning)" },
  Critical: { text: "text-critical", soft: "bg-critical-soft", dot: "bg-critical", border: "border-critical/40", hex: "var(--critical)" },
};

export const VITALS: Record<VitalKey, { label: string; short: string; unit: string; decimals: number }> = {
  hr: { label: "Heart rate", short: "HR", unit: "bpm", decimals: 0 },
  spo2: { label: "SpO₂", short: "SpO₂", unit: "%", decimals: 0 },
  sbp: { label: "Systolic BP", short: "SBP", unit: "mmHg", decimals: 0 },
  dbp: { label: "Diastolic BP", short: "DBP", unit: "mmHg", decimals: 0 },
  rr: { label: "Respiratory rate", short: "RR", unit: "/min", decimals: 0 },
  temp: { label: "Temperature", short: "Temp", unit: "°C", decimals: 1 },
  glucose: { label: "Blood glucose", short: "Glucose", unit: "mg/dL", decimals: 0 },
};

export const SYMPTOM_LABEL: Record<string, { en: string; hi: string }> = {
  chest_pain: { en: "Chest pain", hi: "सीने में दर्द" },
  one_sided_weakness: { en: "Weakness on one side", hi: "शरीर के एक तरफ़ कमज़ोरी" },
  slurred_speech: { en: "Slurred speech", hi: "बोलने में लड़खड़ाहट" },
  fainting: { en: "Fainting", hi: "बेहोशी" },
  confusion: { en: "New confusion", hi: "भ्रम / उलझन" },
  coughing_blood: { en: "Coughing blood", hi: "खांसी में खून" },
  breathlessness: { en: "Breathlessness", hi: "सांस फूलना" },
  severe_headache: { en: "Severe headache", hi: "तेज़ सिरदर्द" },
  palpitations: { en: "Palpitations", hi: "दिल की धड़कन तेज़ होना" },
  blurred_vision: { en: "Blurred vision", hi: "धुंधला दिखना" },
  fever_chills: { en: "Fever with chills", hi: "बुखार और कंपकंपी" },
  reduced_urine: { en: "Passing less urine", hi: "पेशाब कम होना" },
  dizziness: { en: "Dizziness", hi: "चक्कर आना" },
  excessive_thirst: { en: "Excessive thirst", hi: "बहुत प्यास लगना" },
  vomiting: { en: "Vomiting", hi: "उल्टी" },
  leg_swelling: { en: "Swelling in legs", hi: "पैरों में सूजन" },
  frequent_urination: { en: "Frequent urination", hi: "बार-बार पेशाब" },
  cough: { en: "Cough", hi: "खांसी" },
  fatigue: { en: "Unusual tiredness", hi: "असामान्य थकान" },
};

export function fmtVital(key: VitalKey, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(VITALS[key].decimals);
}

const IST = "Asia/Kolkata";

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST }).format(new Date(iso));
}

export function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", timeZone: IST }).format(new Date(iso));
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST,
  }).format(new Date(iso));
}

export function istDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(new Date(iso));
}

export function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("");
}
