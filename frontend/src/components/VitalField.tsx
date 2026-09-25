import { useEffect, useRef } from "react";

/*
 * The hero's living backdrop: a bedside monitor. One pen sweeps left to right at a calm
 * paper speed, leaving a trace that fades behind it and erasing a small gap ahead, the
 * way a real ICU monitor does. Over each loop the patient slowly deteriorates — the heart
 * rate climbs from 64 to ~104 and the trace turns teal → amber → orange — while the
 * readout shows AYU escalating to Warning and NEWS2 still reading Low. Then the doctor
 * reviews and it settles. A few faint, slow traces behind it are the rest of the ward.
 */

type RGB = [number, number, number];
const TEAL: RGB = [45, 212, 191];
const TEAL_LIGHT: RGB = [15, 118, 110];
const AMBER: RGB = [251, 191, 36];
const AMBER_LIGHT: RGB = [180, 83, 9];
const ORANGE: RGB = [251, 146, 60];
const ORANGE_LIGHT: RGB = [194, 65, 12];
const RED: RGB = [248, 113, 113];

const LOOP_S = 26; // calm → slide → alert → reviewed
const SWEEP_S = 4.6; // seconds for the pen to cross the monitor
const STEP = 2; // px per stored sample
const GAP_PX = 46; // erased gap ahead of the pen

const g = (x: number, m: number, s: number) => Math.exp(-(((x - m) / s) ** 2));
/** One heartbeat, phase 0..1: P wave, QRS complex, T wave. */
const ecg = (p: number) =>
  0.11 * g(p, 0.14, 0.035) - 0.12 * g(p, 0.285, 0.012) + g(p, 0.31, 0.014) - 0.24 * g(p, 0.335, 0.013) + 0.24 * g(p, 0.55, 0.06);

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** Deterioration 0..1 at loop time `u` (seconds). */
function deterioration(u: number) {
  if (u < 6) return 0;
  if (u < 19) return smooth((u - 6) / 13);
  if (u < 21.5) return 1;
  return 1 - smooth((u - 21.5) / 4.5);
}

// Tops out at Warning on purpose: a heart rate of ~104 alone is a reason to review, not an emergency.
function stateFor(d: number, dark: boolean): { rgb: RGB; ayu: string } {
  const base = dark ? TEAL : TEAL_LIGHT;
  const amber = dark ? AMBER : AMBER_LIGHT;
  const orange = dark ? mix(ORANGE, RED, 0.3) : ORANGE_LIGHT;
  if (d < 0.3) return { rgb: base, ayu: "Stable" };
  if (d < 0.6) return { rgb: mix(base, amber, (d - 0.3) / 0.3), ayu: "Watch" };
  return { rgb: mix(amber, orange, clamp01((d - 0.6) / 0.3)), ayu: "Warning" };
}

export function VitalField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hrRef = useRef<HTMLSpanElement>(null);
  const ayuRef = useRef<HTMLSpanElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let x0 = 0; // the monitor's left edge: on wide screens it keeps clear of the hero copy
    let dark = true;
    const readTheme = () => {
      dark = document.documentElement.classList.contains("dark");
    };

    // The trace buffer: one sample per STEP px — its height, colour and when it was written.
    let cols = 0;
    let ys = new Float32Array(0);
    let cs: RGB[] = [];
    let born = new Float64Array(0);
    let penCol = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      x0 = w >= 1024 ? Math.round(Math.max(w * 0.36, 580)) : 0;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil((w - x0) / STEP) + 1;
      ys = new Float32Array(cols).fill(h * 0.63);
      cs = Array.from({ length: cols }, () => TEAL);
      born = new Float64Array(cols).fill(-1e9);
      penCol = 0;
    };
    readTheme();
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const mo = new MutationObserver(readTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const mouse = { tx: 0.5, ty: 0.5, sx: 0.5, sy: 0.5 };
    const onMove = (e: PointerEvent) => {
      mouse.tx = e.clientX / Math.max(1, window.innerWidth);
      mouse.ty = e.clientY / Math.max(1, window.innerHeight);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    // Signal state, integrated sample by sample so the rhythm never jumps when the rate changes.
    let phase = 0.2;
    let lastT = 0;
    let beatAt = -10; // time of the last R peak, for the pulse ring and the readout's beat

    const baseline = () => h * 0.63;
    const amp = () => Math.min(h * 0.24, 130);

    const sample = (t: number) => {
      const d = reduce ? 0.7 : deterioration(t % LOOP_S);
      return { d, hr: 64 + d * 40 };
    };

    const write = (t: number, dt: number) => {
      const { d, hr } = sample(t);
      const prev = phase;
      phase = (phase + (dt * hr) / 60) % 1;
      if (prev < 0.31 && (phase >= 0.31 || phase < prev)) beatAt = t;
      const wander = Math.sin(t * 0.7) * 0.03 + Math.sin(t * 0.23) * 0.02;
      const v = ecg(phase) * (1 + d * 0.25) + wander;
      ys[penCol] = baseline() - v * amp();
      cs[penCol] = stateFor(d, dark).rgb;
      born[penCol] = t;
      penCol = (penCol + 1) % cols;
    };

    const drawGrid = () => {
      const sq = 28;
      ctx.lineWidth = 1;
      ctx.strokeStyle = dark ? "rgba(45,212,191,0.035)" : "rgba(15,118,110,0.05)";
      ctx.beginPath();
      const top = h * 0.3;
      for (let x = x0; x <= w; x += sq) {
        ctx.moveTo(Math.round(x) + 0.5, top);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = top; y <= h; y += sq) {
        ctx.moveTo(x0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
    };

    const drawWard = (t: number) => {
      // Five faint, slow traces in depth — the rest of the ward, breathing quietly.
      const n = 5;
      const base = dark ? TEAL : TEAL_LIGHT;
      for (let i = 0; i < n; i++) {
        const depth = i / (n - 1);
        const y0 = h * 0.16 + depth * h * 0.26 + (mouse.sy - 0.5) * 10 * (1 - depth);
        const par = (mouse.sx - 0.5) * -24 * (1 - depth);
        const period = 360 + i * 70;
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 6) {
          const p = (((x + par) / period - t * (0.08 + i * 0.012)) % 1 + 1) % 1;
          const y = y0 - ecg(p) * (11 + depth * 11) - Math.sin(x * 0.006 + t * 0.4 + i) * 2;
          if (x === -10) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgb(base, (dark ? 0.06 : 0.07) + depth * 0.06);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    const drawTrace = (t: number) => {
      const gapCols = Math.ceil(GAP_PX / STEP);
      const life = SWEEP_S * 1.05;
      const alive = (c: number) => (c - penCol + cols) % cols >= gapCols && t - born[c] <= life;
      // Chunks share one alpha and colour: cheap to draw, and the fade still reads smooth.
      const CH = 6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (let pass = 0; pass < 2; pass++) {
        for (let c0 = 0; c0 < cols - 1; c0 += CH) {
          const mid = Math.min(cols - 1, c0 + (CH >> 1));
          if (!alive(mid)) continue;
          const fade = clamp01(1 - (t - born[mid]) / life);
          const alpha = 0.1 + 0.9 * fade ** 1.4;
          ctx.beginPath();
          let started = false;
          for (let c = c0; c <= Math.min(cols - 1, c0 + CH); c++) {
            if (!alive(c)) {
              started = false;
              continue;
            }
            const x = x0 + c * STEP;
            if (!started) {
              ctx.moveTo(x, ys[c]);
              started = true;
            } else ctx.lineTo(x, ys[c]);
          }
          if (pass === 0) {
            ctx.strokeStyle = rgb(cs[mid], alpha * (dark ? 0.16 : 0.1)); // soft phosphor glow
            ctx.lineWidth = 9;
          } else {
            ctx.strokeStyle = rgb(cs[mid], alpha);
            ctx.lineWidth = 2.2;
          }
          ctx.stroke();
        }
      }

      // The pen head: a bright point with a halo, and a ring on every heartbeat.
      const head = (penCol - 1 + cols) % cols;
      const hx = x0 + head * STEP;
      const hy = ys[head];
      const c = cs[head];
      const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, 34);
      halo.addColorStop(0, rgb(c, 0.55));
      halo.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(hx, hy, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark ? "#ffffff" : rgb(c);
      ctx.beginPath();
      ctx.arc(hx, hy, 2.6, 0, Math.PI * 2);
      ctx.fill();
      const since = t - beatAt;
      if (since >= 0 && since < 0.7) {
        const k = since / 0.7;
        ctx.strokeStyle = rgb(c, 0.5 * (1 - k));
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(hx, hy, 6 + k * 30, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    // The readout is HTML (crisp type, above the hero's fades); only touch the DOM when it changes.
    let shownHr = -1;
    let shownAyu = "";
    let shownColor = "";
    const updateReadout = (t: number) => {
      const { d, hr } = sample(t);
      const st = stateFor(d, dark);
      const r = Math.round(hr);
      const color = rgb(st.rgb);
      if (hrRef.current && r !== shownHr) {
        hrRef.current.textContent = String(r);
        shownHr = r;
      }
      if (ayuRef.current && st.ayu !== shownAyu) {
        ayuRef.current.textContent = st.ayu;
        shownAyu = st.ayu;
      }
      if (readoutRef.current) {
        if (color !== shownColor) {
          readoutRef.current.style.setProperty("--vf", color);
          shownColor = color;
        }
        readoutRef.current.dataset.beat = t - beatAt < 0.18 ? "1" : "0";
      }
    };

    // Fade the top and left edges inside the canvas itself, so it melts into any page background
    // (overlays in the page colour showed as bands over the aurora; CSS masks drop the canvas in Chromium).
    const fadeEdges = () => {
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      const v = ctx.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(0.34, "rgba(0,0,0,1)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
      const l = ctx.createLinearGradient(0, 0, w, 0);
      l.addColorStop(0, "rgba(0,0,0,0)");
      l.addColorStop(0.3, "rgba(0,0,0,0.3)");
      l.addColorStop(0.62, "rgba(0,0,0,1)");
      ctx.fillStyle = l;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    };

    const render = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      drawGrid();
      drawWard(t);
      drawTrace(t);
      fadeEdges();
      updateReadout(t);
    };

    const frame = (tMs: number) => {
      const t = tMs / 1000;
      mouse.sx += (mouse.tx - mouse.sx) * 0.04;
      mouse.sy += (mouse.ty - mouse.sy) * 0.04;
      if (!lastT) lastT = t;
      // Advance the pen by however many samples this frame's time covers (skipping ahead after a stall).
      const dtCol = SWEEP_S / cols;
      if (t - lastT > 1) lastT = t - dtCol;
      while (lastT + dtCol <= t) {
        lastT += dtCol;
        write(lastT, dtCol);
      }
      render(lastT);
    };

    let raf = 0;
    const loop = (now: number) => {
      if (visible) frame(now);
      raf = requestAnimationFrame(loop);
    };
    if (reduce) {
      // One still, full sweep: the trace without the motion.
      const dtCol = SWEEP_S / cols;
      for (let i = 0; i < cols; i++) write(10 + i * dtCol, dtCol);
      render(10 + cols * dtCol);
    } else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} className={className} aria-hidden />
      <div
        ref={readoutRef}
        aria-hidden
        className="vf-readout pointer-events-none absolute top-[4%] right-4 z-10 hidden text-right sm:right-8 md:block"
      >
        <div className="font-mono text-[11px] tracking-[0.14em] text-muted">BED S-04 · HEART RATE</div>
        <div className="mt-1 flex items-baseline justify-end gap-2">
          <span ref={hrRef} className="vf-hr font-display text-[64px] leading-none tnum">64</span>
          <span className="font-mono text-[12px] text-muted">BPM</span>
        </div>
        <div className="mt-3 flex justify-end gap-2 font-mono text-[11px] tracking-[0.1em] uppercase">
          <span className="vf-chip rounded-full px-2.5 py-1">AYU <span ref={ayuRef}>Stable</span></span>
          <span className="rounded-full border border-line-2 px-2.5 py-1 text-muted">NEWS2 Low</span>
        </div>
      </div>
    </>
  );
}
