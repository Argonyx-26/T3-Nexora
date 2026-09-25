import {
  CircleCheck,
  Droplet,
  Eye,
  Gauge,
  HeartPulse,
  Pill,
  RotateCcw,
  Siren,
  Thermometer,
  TriangleAlert,
  Wind,
  Flame,
  Activity,
  type LucideIcon,
} from "lucide-react";
import type { Level, VitalKey } from "../lib/types";

/*
 * One icon per idea, used the same way on every screen: a vital always wears the same
 * icon, a risk level always wears the same icon. Icons sit beside words, never replace them.
 */

export const VITAL_ICON: Record<VitalKey, LucideIcon> = {
  hr: HeartPulse,
  spo2: Wind,
  sbp: Gauge,
  dbp: Gauge,
  rr: Activity,
  temp: Thermometer,
  glucose: Droplet,
};

export const LEVEL_ICON: Record<Level, LucideIcon> = {
  Stable: CircleCheck,
  Watch: Eye,
  Warning: TriangleAlert,
  Critical: Siren,
};

export const SCENARIO_ICON: Record<string, LucideIcon> = {
  sepsis: Flame,
  hypoxia: Wind,
  hypertensive_crisis: Gauge,
  cardiac: HeartPulse,
  missed_meds: Pill,
  recover: RotateCcw,
};

/** Default icon props: thin strokes to match the type, never announced to screen readers. */
export const ic = (size = 16) => ({ size, strokeWidth: 1.75, "aria-hidden": true as const });
