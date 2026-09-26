import { useEffect, useState } from "react";

/*
 * Which part of the network the clinician is looking at: one site (or all of them) and one
 * doctor's patients (or everyone's). Remembered on this device; shared by every screen.
 */

export interface Scope {
  hospital: string; // "all" | "H01" | …
  doctor: string; // "all" | "D01" | …
}

const KEY = "ayu-scope";
const listeners = new Set<(s: Scope) => void>();

function read(): Scope {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && typeof v.hospital === "string" && typeof v.doctor === "string") return v;
  } catch {
    /* private mode */
  }
  return { hospital: "all", doctor: "all" };
}

let current = read();

export function setScope(next: Partial<Scope>) {
  current = { ...current, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(current));
}

export function useScope(): [Scope, (s: Partial<Scope>) => void] {
  const [s, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    return () => {
      listeners.delete(set);
    };
  }, []);
  return [s, setScope];
}

/** Does this patient fall inside the scope? */
export function inScope(scope: Scope, p: { hospital_id?: string; doctor_id?: string }) {
  return (scope.hospital === "all" || (p.hospital_id ?? "H01") === scope.hospital) && (scope.doctor === "all" || p.doctor_id === scope.doctor);
}
