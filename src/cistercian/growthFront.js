// growthFront.js — the Cistercian numeral as ONE figure grown from the stem.
//
// Instead of N independent segments, the numeral is a set of polylines where
// every point carries `d`, its geodesic distance from the root at the stave's
// midpoint (logical (1, 1.5)). A renderer reveals `d ≤ r(t)` and the whole
// glyph — stave and all four digits — grows outward simultaneously with no
// stroke starts, no joints, no per-segment taper.
//
// Attachment: a digit path attaches to the stave wherever one of its endpoints
// sits on x = 1. Both ends attach for 5 and 9, so `d` is the min over the two
// roots and the two fronts meet in the middle. Digit 6 (the far-side bar)
// touches the stave nowhere; it grows from its own seed at the bar's midpoint,
// offset so it starts the instant the stave front passes level with it. Same
// gesture, not the same topology — see .deban/roles/pm.md (2026-09-03).
//
// Logical space is [0..2] × [0..3]; `cistercianGrowthPx` maps it into the same
// square as `cistercianSegmentsPx` so the two builders are drop-in swaps.

import { getDigitPathsForPlace, PLACE_ORDER } from './digitMap.js';
import { splitDigits } from './buildSigil.js';

const ROOT = { x: 1, y: 1.5 };
const EPS = 1e-6;

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function onStave(p) { return Math.abs(p.x - 1) < EPS; }

/** Cumulative arc length at every vertex of a polyline. */
function arcLengths(points) {
  const s = [0];
  for (let i = 1; i < points.length; i++) s.push(s[i - 1] + dist(points[i - 1], points[i]));
  return s;
}

/**
 * Assign `d` to a polyline from a set of seeds `{ index, d0 }` (vertex index
 * and the distance value at that vertex). Distance grows with arc length away
 * from each seed; a vertex takes the minimum over all seeds.
 */
function withDistance(points, seeds) {
  const s = arcLengths(points);
  return points.map((p, i) => {
    let d = Infinity;
    for (const seed of seeds) d = Math.min(d, seed.d0 + Math.abs(s[i] - s[seed.index]));
    return { x: p.x, y: p.y, d };
  });
}

/**
 * Build the numeral as distance-tagged polylines.
 *
 * @param {number} number 0..9999
 * @returns {{ paths: {points:{x,y,d}[], place:string, digit:number|null, seeded:boolean}[], maxD:number }}
 *   `seeded` marks a path that grows from its own seed (digit 6).
 */
export function cistercianGrowth(number) {
  const digits = splitDigits(number);
  const paths = [];

  // Stave: two arms from the root. One polyline root→top, one root→bottom,
  // so a renderer that walks vertices sees `d` monotone along each.
  paths.push({ points: [{ ...ROOT, d: 0 }, { x: 1, y: 0, d: 1.5 }], place: 'stave', digit: null, seeded: false });
  paths.push({ points: [{ ...ROOT, d: 0 }, { x: 1, y: 3, d: 1.5 }], place: 'stave', digit: null, seeded: false });

  for (const place of PLACE_ORDER) {
    const digit = digits[place];
    for (const raw of getDigitPathsForPlace(digit, place)) {
      const pts = raw.map(p => ({ x: p.x, y: p.y }));
      const seeds = [];
      if (onStave(pts[0])) seeds.push({ index: 0, d0: dist(pts[0], ROOT) });
      const last = pts.length - 1;
      if (last > 0 && onStave(pts[last])) seeds.push({ index: last, d0: dist(pts[last], ROOT) });

      if (seeds.length) {
        paths.push({ points: withDistance(pts, seeds), place, digit, seeded: false });
        continue;
      }

      // Detached (digit 6): seed at the bar's midpoint, offset to the stave
      // front's arrival at the same height. Split the bar at the midpoint so
      // both halves have monotone `d`.
      const mid = { x: (pts[0].x + pts[last].x) / 2, y: (pts[0].y + pts[last].y) / 2 };
      const d0 = Math.abs(mid.y - ROOT.y);
      const half = dist(pts[0], pts[last]) / 2;
      paths.push({ points: [{ ...mid, d: d0 }, { ...pts[0], d: d0 + half }], place, digit, seeded: true });
      paths.push({ points: [{ ...mid, d: d0 }, { ...pts[last], d: d0 + half }], place, digit, seeded: true });
    }
  }

  let maxD = 0;
  for (const p of paths) for (const q of p.points) maxD = Math.max(maxD, q.d);
  return { paths, maxD };
}

/**
 * Same mapping as cistercianInk.js `mapPoint`: a 2:3 glyph box centred in a
 * `size × size` cell with `padFrac` padding on every side. Isotropic, so `d`
 * scales by the same factor as x and y.
 */
export function growthScale(size, padFrac = 0.10) {
  const usable = size * (1 - 2 * padFrac);
  const glyphH = usable;
  const glyphW = (usable * 2) / 3;
  return {
    unit: glyphH / 3,
    ox: (size - glyphW) / 2,
    oy: (size - glyphH) / 2,
  };
}

/** The figure in pixel space (cell-local): points and `d` in px. */
export function cistercianGrowthPx({ number, size, padFrac = 0.10 }) {
  const { paths, maxD } = cistercianGrowth(number);
  const { unit, ox, oy } = growthScale(size, padFrac);
  return {
    maxD: maxD * unit,
    paths: paths.map(p => ({
      ...p,
      points: p.points.map(q => ({ x: ox + q.x * unit, y: oy + q.y * unit, d: q.d * unit })),
    })),
  };
}
