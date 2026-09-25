// Mirrors backend/app/schemas.py.

export type Level = "Stable" | "Watch" | "Warning" | "Critical";
export type VitalKey = "hr" | "spo2" | "sbp" | "dbp" | "rr" | "temp" | "glucose";

export interface Factor {
  factor: string;
  kind: string;
  headline: string;
  message: string;
  value: number | null;
  baseline: number | null;
  weight: number;
  contribution: number;
}

export interface Baseline {
  mean: number;
  std: number;
  low: number;
  high: number;
  n: number;
  source: "history" | "declared";
}

export interface Risk {
  patient_id: string;
  score: number;
  level: Level;
  urgency: string;
  summary: string;
  recommended_action: string[];
  factors: Factor[];
  news2: { total: number; band: string; parameters: Record<string, number>; any_three: boolean; response: string };
  qsofa: { score: number; criteria: Record<string, boolean>; flag: boolean };
  baselines: Partial<Record<VitalKey, Baseline>>;
  deviations: Partial<Record<VitalKey, { value: number; z: number; pct: number; flagged: boolean }>>;
  trends: Partial<Record<VitalKey, { slope_per_hr: number; t_stat: number; n: number; window_hr: number; flagged: boolean }>>;
  adherence: { pct: number | null; taken: number; missed: number; missed_critical_recent: string[] };
  active_symptoms: string[];
  computed_at: string;
  disclaimer: string;
}

export interface RiskBrief {
  score: number;
  level: Level;
  urgency: string;
  summary: string;
  news2: number;
  computed_at: string;
}

export interface Vital {
  ts: string;
  hr: number;
  spo2: number;
  sbp: number;
  dbp: number;
  rr: number;
  temp: number;
  glucose: number | null;
  on_oxygen: boolean;
  consciousness: string;
  source: string;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: "M" | "F";
  conditions: string[];
  ward: string;
  bed: string;
  language: "en" | "hi";
  spo2_scale: number;
  normals: Record<string, { mean: number; std: number }>;
  notes: string;
}

export interface PatientSummary extends Patient {
  risk: RiskBrief;
  latest: Vital;
}

export interface Dose {
  id: number;
  medication_id: number;
  scheduled_at: string;
  status: "taken" | "missed" | "pending";
  recorded_at: string | null;
}

export interface Medication {
  id: number;
  name: string;
  dose: string;
  purpose: string;
  times: string[];
  critical: boolean;
  adherence_pct: number | null;
  doses: Dose[];
}

export interface RiskPoint {
  ts: string;
  score: number;
  level: Level;
  news2: number;
}

// --- Live (WebSocket) ---------------------------------------------------------------

export interface LiveRisk extends RiskBrief {
  alert_level: Level;
  qsofa_flag: boolean;
  top_factors: string[];
}

export interface LiveUpdate {
  patient_id: string;
  vitals: Vital;
  risk: LiveRisk;
  scenario: string | null;
}

export interface AlertItem {
  id: number;
  patient_id: string;
  patient_name: string;
  bed: string;
  created_at: string;
  updated_at: string | null;
  level: Level;
  prev_level: string;
  score: number;
  title: string;
  summary: string;
  factors: Factor[];
  status: "new" | "acknowledged" | "resolved";
  acknowledged_at: string | null;
  resolved_at: string | null;
  note: string;
  acknowledged_by: string;
  disclaimer: string;
}

export interface SimState {
  sim_time: string;
  speed: number;
  paused: boolean;
  running: boolean;
  tick_seconds: number;
  minutes_per_tick: number;
  scenarios: Record<string, string>;
}

export interface ScenarioInfo {
  key: string;
  label: string;
  description: string;
  best_for: string[];
  duration_h: number;
}

export interface SymptomLog {
  id: number;
  ts: string;
  symptom: string;
  label_en: string;
  label_hi: string;
  red_flag: boolean;
  source: string;
  note: string;
  resolved_at: string | null;
}

export interface Explanation {
  patient_id: string;
  lang: "en" | "hi";
  level: Level;
  score: number;
  doctor: string;
  patient: string;
  urgency: string;
  source: "gemini" | "template";
  model: string | null;
  generated_at: string;
  disclaimer: string;
}

export type ReadingSource = "patient" | "asha" | "staff";
export type VitalsInput = Partial<Record<"hr" | "spo2" | "sbp" | "dbp" | "rr" | "temp" | "glucose", number>>;

// --- Evaluation (/eval/lead-time) ---------------------------------------------------

export type Tier = "urgent" | "first";

export interface TierSummary {
  ayu_h_median: number | null;
  news2_h_median: number | null;
  lead_h_median: number | null;
  lead_h_min: number | null;
  lead_h_max: number | null;
  ayu_first: number;
  ties: number;
  news2_first: number;
  ayu_never: number;
  news2_never: number;
}

export interface EvalResult {
  config: {
    seeds: number;
    horizon_h: number;
    minutes_per_tick: number;
    rest_hours_per_seed: number;
    tiers: Record<Tier, { label: string; news2: string; ayu: string }>;
  };
  summary: { runs: number; rest_patient_days: number } & Record<Tier, TierSummary & { rest_ayu_alarms: number; rest_news2_alarms: number }>;
  scenarios: ({ key: string; label: string; patients: string[]; runs: number } & Record<Tier, TierSummary>)[];
  runs: ({ scenario: string; patient_id: string; patient_name: string; seed: number } & Record<Tier, { ayu_h: number | null; news2_h: number | null; lead_h: number | null }>)[];
  rest: ({ patient_id: string; patient_name: string; patient_days: number } & Record<Tier, { ayu: number; news2: number }>)[];
  example: { scenario: string; patient_id: string; patient_name: string; points: { h: number; ayu: number; news2: number }[] };
}
