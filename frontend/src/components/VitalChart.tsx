import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { VITALS, fmtTime, fmtVital } from "../lib/format";
import type { Baseline, Vital, VitalKey } from "../lib/types";

/** Where NEWS2 starts adding points, per vital — drawn as dashed reference lines. */
function news2Lines(key: VitalKey, spo2Scale: number): { v: number; label: string }[] {
  switch (key) {
    case "hr": return [{ v: 50, label: "≤50 +1" }, { v: 91, label: "≥91 +1" }, { v: 111, label: "≥111 +2" }, { v: 131, label: "≥131 +3" }];
    case "spo2": return spo2Scale === 2
      ? [{ v: 87, label: "≤87 +1" }, { v: 85, label: "≤85 +2" }, { v: 83, label: "≤83 +3" }]
      : [{ v: 95, label: "≤95 +1" }, { v: 93, label: "≤93 +2" }, { v: 91, label: "≤91 +3" }];
    case "sbp": return [{ v: 110, label: "≤110 +1" }, { v: 100, label: "≤100 +2" }, { v: 90, label: "≤90 +3" }, { v: 220, label: "≥220 +3" }];
    case "rr": return [{ v: 11, label: "≤11 +1" }, { v: 21, label: "≥21 +2" }, { v: 25, label: "≥25 +3" }];
    case "temp": return [{ v: 36.0, label: "≤36.0 +1" }, { v: 38.1, label: "≥38.1 +1" }, { v: 39.1, label: "≥39.1 +2" }];
    default: return [];
  }
}

interface Props {
  vital: VitalKey;
  data: Vital[];
  baseline?: Baseline;
  spo2Scale?: number;
  second?: { key: VitalKey; baseline?: Baseline }; // e.g. diastolic drawn with systolic
  height?: number;
}

export function VitalChart({ vital, data, baseline, spo2Scale = 1, second, height = 180 }: Props) {
  const meta = VITALS[vital];
  const values = data.flatMap((d) => [d[vital] as number, second ? (d[second.key] as number) : NaN]).filter((v) => Number.isFinite(v));
  if (values.length === 0) {
    return <div className="grid place-items-center text-[13px] text-muted" style={{ height }}>No readings in this range</div>;
  }
  const lows = [...values, baseline?.low ?? Infinity, second?.baseline?.low ?? Infinity];
  const highs = [...values, baseline?.high ?? -Infinity, second?.baseline?.high ?? -Infinity];
  let lo = Math.min(...lows);
  let hi = Math.max(...highs);
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad;
  hi += pad;
  if (vital === "spo2") hi = Math.min(hi, 100.5);
  const lines = news2Lines(vital, spo2Scale).filter((l) => l.v > lo && l.v < hi);
  // Label a threshold only if it sits clear of the last labelled one, so labels never stack.
  let lastLabelled = -Infinity;
  const labelled = new Set<number>();
  for (const l of [...lines].sort((a, b) => a.v - b.v)) {
    if (Math.abs(l.v - lastLabelled) >= (hi - lo) * 0.12) {
      labelled.add(l.v);
      lastLabelled = l.v;
    }
  }
  const rows = data.map((d) => ({ t: d.ts, a: d[vital], b: second ? d[second.key] : undefined }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        {baseline && <ReferenceArea y1={Math.max(lo, baseline.low)} y2={Math.min(hi, baseline.high)} fill="var(--band)" fillOpacity={1} stroke="none" ifOverflow="hidden" />}
        {second?.baseline && <ReferenceArea y1={Math.max(lo, second.baseline.low)} y2={Math.min(hi, second.baseline.high)} fill="var(--band)" fillOpacity={0.6} stroke="none" ifOverflow="hidden" />}
        {lines.map((l) => (
          <ReferenceLine
            key={l.v}
            y={l.v}
            stroke="var(--line-2)"
            strokeDasharray="3 4"
            label={labelled.has(l.v) ? { value: `NEWS2 ${l.label}`, position: "insideTopRight", fontSize: 9, fill: "var(--faint)", fontFamily: "var(--font-mono)" } : undefined}
          />
        ))}
        <XAxis dataKey="t" tickFormatter={fmtTime} tick={{ fontSize: 10, fill: "var(--muted)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} minTickGap={48} />
        <YAxis domain={[lo, hi]} tick={{ fontSize: 10, fill: "var(--muted)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => v.toFixed(meta.decimals)} allowDecimals />
        <Tooltip
          cursor={{ stroke: "var(--line-2)" }}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 12, fontSize: 12, fontFamily: "var(--font-mono)" }}
          labelStyle={{ color: "var(--muted)" }}
          labelFormatter={(l) => fmtTime(String(l))}
          formatter={(v, name) => [`${fmtVital(name === "b" && second ? second.key : vital, Number(v))} ${meta.unit}`, name === "b" && second ? VITALS[second.key].short : meta.short]}
        />
        <Line dataKey="a" type="monotone" stroke="var(--teal)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
        {second && <Line dataKey="b" type="monotone" stroke="var(--ink-2)" strokeOpacity={0.55} strokeWidth={1.5} dot={false} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
