import { useCallback, useEffect, useRef, useState } from "react";
import type { Medication, PatientSummary, Risk, RiskPoint, Vital } from "./types";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { signal, headers: { Accept: "application/json" } });
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

export const api = {
  patients: (s?: AbortSignal) => get<PatientSummary[]>("/patients", s),
  patient: (id: string, s?: AbortSignal) => get<PatientSummary>(`/patients/${id}`, s),
  risk: (id: string, s?: AbortSignal) => get<Risk>(`/patients/${id}/risk`, s),
  riskHistory: (id: string, range = "24h", s?: AbortSignal) => get<RiskPoint[]>(`/patients/${id}/risk/history?range=${range}`, s),
  vitals: (id: string, range = "6h", maxPoints = 600, s?: AbortSignal) =>
    get<Vital[]>(`/patients/${id}/vitals?range=${range}&max_points=${maxPoints}`, s),
  medications: (id: string, s?: AbortSignal) => get<Medication[]>(`/patients/${id}/medications`, s),
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
