import { useEffect, useRef } from "react";

/*
 * The hero's living backdrop: a ward of ECG traces stacked in depth, drawn to a canvas.
 * One patient's trace slowly deteriorates — teal → amber → red, faster and larger — while a
 * label beside it follows AYU's level. The pointer lifts the traces it passes over.
 */

type RGB = [number, number, number];
const TEAL: RGB = [45, 212, 191];
const AMBER: RGB = [251, 191, 36];
const ORANGE: RGB = [251, 146, 60];
const RED: RGB = [248, 113, 113];
const CYCLE_S = 16; // one deterioration → reset loop

const g = (x: number, m: number, s: number) => Math.exp(-(((x - m) / s) ** 2));
/** One heartbeat, phase 0..1: P wave, QRS complex, T wave. */
const ecg = (p: number) =>
  0.12 * g(p, 0.16, 0.03) - 0.14 * g(p, 0.3, 0.009) + g(p, 0.325, 0.011) - 0.26 * g(p, 0.35, 0.01) + 0.26 * g(p, 0.56, 0.05);

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function hotState(d: number): { rgb: RGB; label: string } {
  if (d < 0.35) return { rgb: TEAL, label: "STABLE" };
  if (d < 0.6) return { rgb: mix(TEAL, AMBER, (d - 0.35) / 0.25), label: "WATCH" };
  if (d < 0.82) return { rgb: mix(AMBER, ORANGE, (d - 0.6) / 0.22), label: "WARNING" };
  return { rgb: mix(ORANGE, RED, Math.min(1, (d - 0.82) / 0.12)), label: "CRITICAL" };
}

export function VitalField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let bg = "#05070a";
    let dark = true;
    const readTheme = () => {
      const cs = getComputedStyle(document.documentElement);
      bg = cs.getPropertyValue("--bg").trim() || bg;
      dark = document.documentElement.classList.contains("dark");
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    readTheme();
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const mo = new MutationObserver(readTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const mouse = { x: -9999, y: -9999, sx: 0.5, sy: 0.5, tx: 0.5, ty: 0.5 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.tx = Math.min(1, Math.max(0, mouse.x / Math.max(1, r.width)));
      mouse.ty = Math.min(1, Math.max(0, mouse.y / Math.max(1, r.height)));
    };
    const onLeave = () => {
      mouse.x = mouse.y = -9999;
      mouse.tx = mouse.ty = 0.5;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    const seeds = Array.from({ length: 40 }, (_, i) => ({ phase: (i * 0.618) % 1, rate: 0.55 + ((i * 0.37) % 1) * 0.35, wob: (i * 1.7) % 6.28 }));

    const draw = (tMs: number) => {
      const t = tMs / 1000;
      mouse.sx += (mouse.tx - mouse.sx) * 0.05;
      mouse.sy += (mouse.ty - mouse.sy) * 0.05;
      ctx.clearRect(0, 0, w, h);

      const lines = w < 640 ? 13 : w < 1100 ? 18 : 24;
      const hot = Math.round(lines * 0.64);
      const cyc = (t % CYCLE_S) / CYCLE_S;
      const d = reduce ? 0.7 : cyc < 0.85 ? cyc / 0.85 : 1 - (cyc - 0.85) / 0.15; // rise, then recover
      const hs = hotState(d);
      const step = w < 640 ? 5 : 4;

      for (let i = 0; i < lines; i++) {
        const depth = i / (lines - 1); // 0 = back, 1 = front
        const y0 = h * 0.12 + depth * h * 0.8 + (mouse.sy - 0.5) * 18 * depth;
        const par = (mouse.sx - 0.5) * -40 * depth;
        const isHot = i === hot;
        const s = seeds[i];
        const period = (220 + depth * 180) * (isHot ? 1 - d * 0.35 : 1);
        const amp = (7 + depth * 30) * (isHot ? 1 + d * 0.9 : 1);
        const speed = s.rate * (isHot ? 1 + d * 0.8 : 1);

        ctx.beginPath();
        let first = true;
        for (let x = -20; x <= w + 20; x += step) {
          const u = x / w;
          const env = 0.18 + 0.82 * Math.exp(-(((u - 0.62) / 0.34) ** 2)); // the Unknown Pleasures swell
          const p = (((x - par) / period + t * speed + s.phase) % 1 + 1) % 1;
          let v = ecg(p) * env * amp;
          v += Math.sin(x * 0.013 + t * 0.9 + s.wob) * 1.2 * (0.4 + depth);
          const dx = x - mouse.x;
          const dy = y0 - mouse.y;
          const near = Math.exp(-(dx * dx) / (2 * 140 * 140) - (dy * dy) / (2 * 90 * 90));
          v *= 1 + near * 1.6;
          const y = y0 - v;
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else ctx.lineTo(x, y);
        }
        // occlude the lines behind, then stroke
        ctx.lineTo(w + 20, h + 20);
        ctx.lineTo(-20, h + 20);
        ctx.closePath();
        ctx.fillStyle = bg;
        ctx.fill();

        if (isHot) {
          const [r, g2, b] = hs.rgb;
          ctx.strokeStyle = `rgba(${r | 0},${g2 | 0},${b | 0},0.95)`;
          ctx.lineWidth = 2.6;
          ctx.shadowColor = `rgba(${r | 0},${g2 | 0},${b | 0},0.9)`;
          ctx.shadowBlur = 20 + d * 24;
        } else {
          const a = (dark ? 0.2 : 0.22) + depth * (dark ? 0.62 : 0.5);
          ctx.strokeStyle = `rgba(${TEAL[0]},${TEAL[1]},${TEAL[2]},${a})`;
          ctx.lineWidth = 1.1 + depth * 1.1;
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (isHot && w > 520) {
          const [r, g2, b] = hs.rgb;
          const lx = w * 0.86;
          ctx.font = '500 11px "Geist Mono Variable", ui-monospace, monospace';
          ctx.fillStyle = `rgba(${r | 0},${g2 | 0},${b | 0},0.95)`;
          ctx.textAlign = "right";
          ctx.fillText(`BED B-02 · AYU ${hs.label}`, lx, y0 - amp * 1.25 - 12);
          ctx.beginPath();
          ctx.arc(lx + 10, y0 - amp * 1.25 - 16, 3 + (Math.sin(t * 6) + 1) * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    let raf = 0;
    // Off-screen frames are skipped; hidden tabs are already throttled by the browser itself.
    const loop = (now: number) => {
      if (visible) draw(now);
      raf = requestAnimationFrame(loop);
    };
    if (reduce) draw(9000);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
