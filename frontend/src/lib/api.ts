import { useCallback, useEffect, useRef, useState } from "react";
import type { AlertItem, Appointment, DoctorInfo, HospitalInfo, IntakeResult, ChatReply, ChatTurn, Checkin, DoctorNote, Insights, QueueItem, TimelineEvent, EvalResult, Explanation, Medication, ReadingSource, VitalsInput, PatientSummary, Risk, RiskPoint, ScenarioInfo, SimState, SymptomLog, Vital } from "./types";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init?.body) headers["Content-Type"] = "application/json"; // GETs stay "simple": no CORS preflight
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Can't reach the AYU server. Is the backend running?");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.detail && typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

const get = <T,>(path: string, signal?: AbortSignal) => request<T>(path, { signal });
const post = <T,>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  patients: (s?: AbortSignal) => get<PatientSummary[]>("/patients", s),
  patient: (id: string, s?: AbortSignal) => get<PatientSummary>(`/patients/${id}`, s),
  risk: (id: string, s?: AbortSignal) => get<Risk>(`/patients/${id}/risk`, s),
  riskHistory: (id: string, range = "24h", s?: AbortSignal) => get<RiskPoint[]>(`/patients/${id}/risk/history?range=${range}`, s),
  vitals: (id: string, range = "6h", maxPoints = 600, s?: AbortSignal) =>
    get<Vital[]>(`/patients/${id}/vitals?range=${range}&max_points=${maxPoints}`, s),
  medications: (id: string, s?: AbortSignal) => get<Medication[]>(`/patients/${id}/medications`, s),
  symptoms: (id: string, s?: AbortSignal) => get<SymptomLog[]>(`/patients/${id}/symptoms`, s),
  alerts: (status = "open", s?: AbortSignal) => get<AlertItem[]>(`/alerts?status=${status}`, s),
  ack: (id: number, note: string, by = "Doctor") => post<AlertItem>(`/alerts/${id}/ack`, { note, by }),
  resolve: (id: number, note = "", by = "Doctor") => post<AlertItem>(`/alerts/${id}/resolve`, { note, by }),
  reportSymptoms: (
    id: string, symptoms: string[], source: ReadingSource = "patient", note = "",
    details: { severity?: string; duration?: string; frequency?: string } = {},
  ) => post<Risk>(`/patients/${id}/symptoms`, { symptoms, source, note, ...details }),
  checkins: (id: string, s?: AbortSignal) => get<Checkin[]>(`/patients/${id}/checkins`, s),
  addCheckin: (id: string, body: { mood: number; energy: number; sleep: number; note?: string; symptoms?: string[]; source?: ReadingSource }) =>
    post<Checkin>(`/patients/${id}/checkins`, body),
  timeline: (id: string, hours = 48, s?: AbortSignal, audience: "doctor" | "patient" = "doctor") =>
    get<TimelineEvent[]>(`/patients/${id}/timeline?hours=${hours}&audience=${audience}`, s),
  insights: (id: string, s?: AbortSignal) => get<Insights>(`/patients/${id}/insights`, s),
  hospitals: (s?: AbortSignal) => get<HospitalInfo[]>("/hospitals", s),
  doctors: (hospitalId?: string, s?: AbortSignal) => get<DoctorInfo[]>(`/doctors${hospitalId ? `?hospital_id=${hospitalId}` : ""}`, s),
  assign: (patientId: string, doctorId: string | null, by = "Doctor") =>
    post<{ patient_id: string; doctor_id: string; reason: string }>(`/patients/${patientId}/assign`, { doctor_id: doctorId, by }),
  setDuty: (doctorId: string, onDuty: boolean) =>
    post<{ doctor_id: string; on_duty: boolean; handed_over: { patient_id: string; name: string; doctor_id: string; reason: string }[] }>(`/doctors/${doctorId}/duty`, { on_duty: onDuty }),
  extractReport: (body: { filename?: string; mime?: string; data_base64?: string; text?: string }) => post<IntakeResult>("/intake/extract", body),
  createPatient: (body: unknown) => post<{ patient_id: string; patient: PatientSummary }>("/patients", body),
  queue: (s?: AbortSignal) => get<QueueItem[]>("/insights", s),
  notes: (id: string, visibleOnly = false, s?: AbortSignal) => get<DoctorNote[]>(`/patients/${id}/notes?visible_only=${visibleOnly}`, s),
  addNote: (id: string, body: { text: string; kind?: "note" | "followup"; visible?: boolean; follow_up_on?: string; author?: string }) =>
    post<DoctorNote>(`/patients/${id}/notes`, body),
  appointments: (id: string, s?: AbortSignal) => get<Appointment[]>(`/patients/${id}/appointments`, s),
  wardAppointments: (status = "all", s?: AbortSignal) => get<Appointment[]>(`/appointments?status=${status}`, s),
  requestAppointment: (id: string, body: { reason?: string; preferred?: string; mode?: "in_person" | "video"; requested_by?: "patient" | "doctor" }) =>
    post<Appointment>(`/patients/${id}/appointments`, body),
  updateAppointment: (apptId: number, body: { status?: Appointment["status"]; mode?: Appointment["mode"]; scheduled_for?: string }) =>
    post<Appointment>(`/appointments/${apptId}`, body),
  patientAlerts: (id: string, s?: AbortSignal) => get<AlertItem[]>(`/alerts?status=all&patient_id=${id}&limit=20`, s),
  recordDose: (doseId: number, status: "taken" | "missed") => post<Risk>("/doses", { dose_id: doseId, status }),
  explanation: (id: string, lang: "en" | "hi", s?: AbortSignal) => get<Explanation>(`/patients/${id}/explanation?lang=${lang}`, s),
  chat: (id: string, message: string, lang: "en" | "hi", history: ChatTurn[]) =>
    post<ChatReply>(`/patients/${id}/chat`, { message, lang, history: history.slice(-12) }),
  logVitals: (id: string, values: VitalsInput, source: ReadingSource = "patient") => post<Risk>(`/patients/${id}/vitals`, { ...values, source }),
  leadTime: (s?: AbortSignal) => get<EvalResult>("/eval/lead-time", s),
  sim: (s?: AbortSignal) => get<SimState>("/sim", s),
  scenarios: (s?: AbortSignal) => get<ScenarioInfo[]>("/sim/scenarios", s),
  startScenario: (patient_id: string, scenario: string) => post<SimState>("/sim/scenario", { patient_id, scenario }),
  setSpeed: (speed: number) => post<SimState>("/sim/speed", { speed }),
  pause: () => post<SimState>("/sim/pause"),
  resume: () => post<SimState>("/sim/resume"),
  step: () => post<SimState>("/sim/step"),
  reset: () => post<SimState>("/sim/reset"),
};

export interface Query<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  refreshedAt: Date | undefined;
  reload: () => void;
}

/** Fetch on mount and whenever deps change; optionally poll. Keeps the last good data on a failed refresh. */
export function useQuery<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[], pollMs?: number): Query<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date>();
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    setLoading(true);
    setData(undefined);
    setError(undefined);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = new AbortController();
    fnRef
      .current(ctrl.signal)
      .then((d) => {
        setData(d);
        setError(undefined);
        setRefreshedAt(new Date());
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => setTick((t) => t + 1), pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refreshedAt, reload };
}
