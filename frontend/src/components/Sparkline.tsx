import { useId } from "react";

interface Props {
  values: number[];
  band?: { low: number; high: number };
  color?: string;
  height?: number;
  width?: number;
}

/** A tiny line with the patient's personal baseline band behind it. Pure SVG. */
export function Sparkline({ values, band, color = "var(--teal)", height = 28, width = 120 }: Props) {
  const id = useId();
  if (values.length < 2) return <div style={{ height, width }} />;
  const lo = Math.min(...values, band?.low ?? Infinity);
  const hi = Math.max(...values, band?.high ?? -Infinity);
  const span = hi - lo || 1;
  const pad = 2;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden className="overflow-visible">
      {band && (
        <rect x={0} width={width} y={y(band.high)} height={Math.max(1, y(band.low) - y(band.high))} fill="var(--band)" />
      )}
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.2} fill={color} />
    </svg>
  );
}
