// glyphPainter.js — writes glyphs into the fluid as brush runs.
//
// A Cistercian numeral becomes one brush run per segment. Every run is a
// quadratic curve (from → wobbled midpoint → to) splatted at a spacing of
// half the brush radius, with a lens-shaped width profile so strokes taper
// like a loaded brush. In parallel mode all runs advance together and finish
// at the same instant; in sequential mode the stave is written first, then
// the digit strokes in place order.
//
// The painter emits splats only for the slice of time since its last
// `update()`, so strokes are continuous at any framerate. It never touches
// dissipation — the renderer freezes the water while painting.
//
// Coordinates: `box` and everything derived from it are CSS px in client
// space; `fluid.uvFromClient` converts at splat time so a resize mid-trace
// still lands on the canvas.

import { createRng } from '../../util/rng.js';
import { cistercianSegmentsPx } from '../../cistercian/cistercianInk.js';

// RGB multiplier on injected colour relative to density, so a fresh stroke
// reads as the palette's core stop (see the display shader's `core`).
const COLOR_GAIN = 3.0;

function lerp(a, b, t) { return a + (b - a) * t; }
function quad(a, m, b, t) {
  const s = 1 - t;
  return { x: s * s * a.x + 2 * s * t * m.x + t * t * b.x, y: s * s * a.y + 2 * s * t * m.y + t * t * b.y };
}

export function createPainter({ fluid, params }) {
  let runs = [];
  let startMs = null;
  let done = true;
  let current = null; // { number, box, seed, rgb }

  function widthAt(run, t) {
    const taper = params.get('taper');
    const lens = run.stave ? (0.6 + 0.4 * Math.sin(Math.PI * t)) : (0.3 + 0.7 * Math.sin(Math.PI * t));
    return lerp(1, lens, taper);
  }

  function buildRuns({ number, box, seed }) {
    const segs = cistercianSegmentsPx({ number, size: box.w, padFrac: 0.10 });
    const rng = createRng((number + 1) * 7919 ^ seed);
    const radiusPx = params.get('strokeRadius') * box.w;
    const wobblePx = params.get('wobble') * radiusPx;
    const sequential = params.get('traceMode') >= 1;

    const built = segs.map((seg) => {
      const from = { x: box.x + seg.from.x, y: box.y + seg.from.y };
      const to = { x: box.x + seg.to.x, y: box.y + seg.to.y };
      const dx = to.x - from.x, dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const stave = seg.place === 'stave';
      const j = rng.gauss(0, stave ? wobblePx * 0.5 : wobblePx);
      const mid = { x: (from.x + to.x) / 2 + nx * j, y: (from.y + to.y) / 2 + ny * j };
      return { from, mid, to, len, stave, t0: 0, t1: 1, last: 0, radiusPx };
    });

    if (sequential) {
      // Stave first, then digits in order; time share proportional to length.
      const ordered = [...built.filter(r => r.stave), ...built.filter(r => !r.stave)];
      const total = ordered.reduce((s, r) => s + r.len, 0) || 1;
      let acc = 0;
      for (const r of ordered) {
        r.t0 = acc / total;
        acc += r.len;
        r.t1 = acc / total;
      }
    }
    return built;
  }

  function emitRun(run, uFrom, uTo, rgb, amountScale) {
    if (uTo <= uFrom) return;
    const rect = fluid.canvasHeightCss();
    const spacing = Math.max(0.5, run.radiusPx * 0.5);
    const steps = Math.max(1, Math.ceil((run.len * (uTo - uFrom)) / spacing));
    const amount = params.get('strokeAmount') * amountScale;
    const color = [rgb[0] * COLOR_GAIN, rgb[1] * COLOR_GAIN, rgb[2] * COLOR_GAIN];
    for (let i = 1; i <= steps; i++) {
      const t = lerp(uFrom, uTo, i / steps);
      const p = quad(run.from, run.mid, run.to, t);
      const { u, v } = fluid.uvFromClient(p.x, p.y);
      const r = (run.radiusPx * widthAt(run, t)) / rect;
      fluid.splat(u, v, color, r, amount);
    }
  }

  return {
    /** Start writing a glyph. Nothing is splatted until `update()`. */
    begin({ number, box, seed = 1, rgb }) {
      current = { number, box, seed, rgb };
      runs = buildRuns({ number, box, seed });
      startMs = null;
      done = false;
    },

    /** Emit the splats for the time elapsed since the last call. */
    update(nowMs) {
      if (done || !current) return { done: true, progress: 1 };
      if (startMs === null) startMs = nowMs;
      const traceMs = Math.max(1, params.get('traceMs'));
      const prog = Math.min(1, (nowMs - startMs) / traceMs);
      for (const run of runs) {
        const span = run.t1 - run.t0 || 1;
        const u = Math.max(0, Math.min(1, (prog - run.t0) / span));
        if (u > run.last) {
          emitRun(run, run.last, u, current.rgb, 1);
          run.last = u;
        }
      }
      if (prog >= 1) done = true;
      return { done, progress: prog };
    },

    /** Re-splat the whole glyph at once, scaled (keeps "stays" tiers legible). */
    reink(amountScale = 0.25) {
      if (!current) return;
      for (const run of runs) emitRun(run, 0, 1, current.rgb, amountScale);
    },

    /** Re-lay the current glyph into a new box (after a resize). */
    relayout(box) {
      if (!current) return;
      current.box = box;
      runs = buildRuns(current);
      for (const run of runs) run.last = 1;
      this.reink(1);
      done = true;
    },

    /**
     * Sample an SVG's paths (client space) and splat them in one frame —
     * the pick reaction for a choice logogram.
     */
    splashSvg(svgEl, rgb, { amount, radiusFrac, spacingPx = 4 } = {}) {
      const rect = fluid.canvasHeightCss();
      const color = [rgb[0] * COLOR_GAIN, rgb[1] * COLOR_GAIN, rgb[2] * COLOR_GAIN];
      const paths = svgEl.querySelectorAll('path');
      const tileRect = svgEl.getBoundingClientRect();
      const radius = (radiusFrac * (tileRect.width || 100)) / rect;
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
    cancel() { done = true; current = null; runs = []; },
  };
}
