// glyphPainter.js — writes glyphs into the fluid as one growing figure.
//
// A Cistercian numeral is grown, not stroked: growthFront.js tags every point
// of the figure with its geodesic distance `d` from the stave's midpoint, and
// the painter reveals `d ≤ r(t)` with a front that advances at constant speed
// (`r = maxD · elapsed / traceMs`). The stave and all four digits appear
// together, with no stroke starts, no joints and no per-segment taper — one
// trait. Digit 6, which never touches the stave, grows from its own seed the
// instant the front passes level with it.
//
// Every path is pre-sampled at half the brush radius; each `update()` emits
// the samples whose `d` falls in the slice of front the elapsed time uncovered,
// so strokes are continuous at any framerate. Width is constant; `taper` only
// thins free terminals (dead ends), and `wobble` is a smooth perpendicular
// sinusoid along the path so it never breaks continuity. The painter never
// touches dissipation — the renderer freezes the water while painting.
//
// Coordinates: `box` and everything derived from it are CSS px in client
// space; `fluid.uvFromClient` converts at splat time so a resize mid-trace
// still lands on the canvas.

import { createRng } from '../../util/rng.js';
import { cistercianGrowthPx } from '../../cistercian/growthFront.js';

// RGB multiplier on injected colour relative to density, so a fresh stroke
// reads as the palette's core stop (see the display shader's `core`).
const COLOR_GAIN = 3.0;

function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / ((e1 - e0) || 1)));
  return t * t * (3 - 2 * t);
}

export function createPainter({ fluid, params }) {
  let samples = [];      // { x, y, d, w } sorted by d
  let maxD = 0;
  let radiusPx = 1;
  let startMs = null;
  let done = true;
  let emitted = 0;       // index into samples: everything before it is on the page
  let current = null;    // { number, box, seed, rgb }

  /**
   * Walk every path of the figure at `spacing`, producing splat samples.
   * Free terminals (endpoints with the path's largest `d`, i.e. not the
   * attachment/seed end) get a taper; the whole path gets a gentle wobble.
   */
  function buildSamples({ number, box, seed }) {
    const { paths, maxD: md } = cistercianGrowthPx({ number, size: box.w, padFrac: 0.10 });
    maxD = md;
    radiusPx = params.get('strokeRadius') * box.w;
    const spacing = Math.max(0.5, radiusPx * 0.5);
    const taper = params.get('taper');
    const wobblePx = params.get('wobble') * radiusPx;
    const taperLen = radiusPx * 3;
    const rng = createRng((number + 1) * 7919 ^ seed);
    const out = [];

    for (const path of paths) {
      const pts = path.points;
      // Arc length along the path, for wobble phase and terminal distance.
      const arc = [0];
      for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const total = arc[arc.length - 1] || 1;
      const phase = rng.next() * Math.PI * 2;
      // Long, slow tremor (one wave per ~20 radii) — a hand, not a scribble.
      const freq = (Math.PI * 2) / Math.max(1, radiusPx * 20);
      const stave = path.place === 'stave';
      const amp = stave ? wobblePx * 0.5 : wobblePx;
      // The far end is a free terminal unless it is a stave-attachment (d
      // there would be smaller than the other end's, which the builder puts
      // first, so "far end" = last point with the larger d).
      const lastFree = pts[pts.length - 1].d >= pts[0].d;

      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const len = arc[i] - arc[i - 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const nx = -dy / (len || 1), ny = dx / (len || 1);
        const steps = Math.max(1, Math.ceil(len / spacing));
        const from = (i === 1) ? 0 : 1; // avoid duplicating shared vertices
        for (let k = from; k <= steps; k++) {
          const t = k / steps;
          const s = arc[i - 1] + len * t;
          // Wobble fades to zero at the root so the stem stays centred.
          const wob = amp * Math.sin(s * freq + phase) * smoothstep(0, radiusPx * 2, s);
          const x = lerp(a.x, b.x, t) + nx * wob;
          const y = lerp(a.y, b.y, t) + ny * wob;
          const d = lerp(a.d, b.d, t);
          const toEnd = lastFree ? (total - s) : Infinity;
          const w = lerp(1, 0.35 + 0.65 * smoothstep(0, taperLen, toEnd), taper);
          out.push({ x: box.x + x, y: box.y + y, d, w });
        }
      }
    }
    out.sort((p, q) => p.d - q.d);
    return out;
  }

  function emitSample(p, rgb, amountScale) {
    const rect = fluid.canvasHeightCss();
    const amount = params.get('strokeAmount') * amountScale * (current?.inkScale ?? 1);
    const color = [rgb[0] * COLOR_GAIN, rgb[1] * COLOR_GAIN, rgb[2] * COLOR_GAIN];
    const { u, v } = fluid.uvFromClient(p.x, p.y);
    fluid.splat(u, v, color, (radiusPx * p.w) / rect, amount);
  }

  return {
    /** Start growing a glyph. Nothing is splatted until `update()`. */
    begin({ number, box, seed = 1, rgb, traceMs = null, inkScale = 1 }) {
      current = { number, box, seed, rgb, traceMs, inkScale };
      samples = buildSamples({ number, box, seed });
      emitted = 0;
      startMs = null;
      done = false;
    },

    /** Emit the samples the front uncovered since the last call. */
    update(nowMs) {
      if (done || !current) return { done: true, progress: 1 };
      if (startMs === null) startMs = nowMs;
      const traceMs = Math.max(1, current.traceMs ?? params.get('traceMs'));
      const prog = Math.min(1, (nowMs - startMs) / traceMs);
      const r = maxD * prog;
      while (emitted < samples.length && samples[emitted].d <= r + 1e-6) {
        emitSample(samples[emitted], current.rgb, 1);
        emitted++;
      }
      if (prog >= 1) {
        while (emitted < samples.length) emitSample(samples[emitted++], current.rgb, 1);
        done = true;
      }
      return { done, progress: prog };
    },

    /** Re-splat the whole glyph at once, scaled (keeps "stays" tiers legible). */
    reink(amountScale = 0.25) {
      if (!current) return;
      for (const p of samples) emitSample(p, current.rgb, amountScale);
    },

    /** Re-lay the current glyph into a new box (after a resize). */
    relayout(box) {
      if (!current) return;
      current.box = box;
      samples = buildSamples(current);
      emitted = samples.length;
      this.reink(1);
      done = true;
    },

    /**
     * Sample an SVG's paths (client space) and splat them in one frame —
     * the pick reaction for a choice logogram.
     */
    splashSvg(svgEl, rgb, { amount, radiusPx: rPx, spacingPx = 4 } = {}) {
      const rect = fluid.canvasHeightCss();
      const color = [rgb[0] * COLOR_GAIN, rgb[1] * COLOR_GAIN, rgb[2] * COLOR_GAIN];
      const paths = svgEl.querySelectorAll('path');
      const radius = Math.max(0.5, rPx) / rect;
      let budget = 600; // cap splats per splash
      for (const path of paths) {
        let ctm;
        try { ctm = path.getScreenCTM(); } catch { continue; }
        if (!ctm) continue;
        const total = path.getTotalLength();
        if (!(total > 0)) continue;
        const n = Math.max(1, Math.min(120, Math.floor(total / spacingPx)));
        for (let i = 0; i <= n && budget > 0; i++) {
          const pt = path.getPointAtLength((i / n) * total);
          const x = ctm.a * pt.x + ctm.c * pt.y + ctm.e;
          const y = ctm.b * pt.x + ctm.d * pt.y + ctm.f;
          const { u, v } = fluid.uvFromClient(x, y);
          fluid.splat(u, v, color, radius, amount);
          budget--;
        }
      }
    },

    get active() { return !done; },
    get glyph() { return current; },
    cancel() { done = true; current = null; samples = []; emitted = 0; },
  };
}
