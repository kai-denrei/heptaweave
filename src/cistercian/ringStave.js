// ringStave.js — the ring-stave numeral: Cistercian digit logic on a ring.
//
// The heptaweave's ring IS the Cistercian stave. There are no stems: each
// digit figure stands directly on the ring at its slot, drawn in the ring's
// own frame — *along* the ring (tangential) is what "up the stave" was,
// *out* of the ring (radial) is what "out from the stave" was. The figures
// are the unchanged Cistercian digit paths: 1 and 2 are radial bars at the
// tip and foot points, 3 and 4 diagonals, 5 a triangle closed by the ring,
// 6 a detached bar parallel to the ring, 7 and 8 bowls, 9 a box on the ring.
//
// The ring opens at the bottom, like an enso: its THIN end is at the bottom
// right and its THICK end at the bottom left. Reading starts at the thin end:
// the units sit there, and each higher place is the next slot along the ring
// — up the right side, over the top, down the left — so the highest place
// sits by the thick end. `slots` positions share the arc (8 by default, up to
// 16); a number occupies only as many as it has digits. Adjacent slots
// mirror their tip/foot direction, as Cistercian quadrant pairs do. Leading
// zeros are not drawn; 0 is the bare ring.
//
// Output has the same shape as growthFront.js — distance-tagged polylines —
// so the ink painter grows it with the same front. The front starts at the
// thin end and runs the one way round to the thick end, out into each figure
// as it passes the figure's foot on the ring; points carry `wf`, a width
// factor, so the ring swells from thin to thick under the brush. Digit 6,
// which touches the ring nowhere, seeds at its own midpoint a beat after the
// front passes its slot.

import { UNIT_DIGIT_PATHS } from './digitMap.js';

const RING_SAMPLES = 120;
const GAP_CENTRE = Math.PI / 2;       // the opening, at the bottom
const GAP_WIDTH = Math.PI * 0.16;     // ~29°: thin end bottom-right, thick end bottom-left
const FIGURE_H = 0.5;                 // tip↔foot arc length, of R
const FIGURE_W = 0.65;                // radial reach, of FIGURE_H
const WF_THIN = 0.5, WF_THICK = 1.3;  // brush width factors at the two ends
const WF_FIGURE = 1.0;

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function arcLengths(points) {
  const s = [0];
  for (let i = 1; i < points.length; i++) s.push(s[i - 1] + dist(points[i - 1], points[i]));
  return s;
}
function withDistance(points, seeds) {
  const s = arcLengths(points);
  return points.map((p, i) => {
    let d = Infinity;
    for (const seed of seeds) d = Math.min(d, seed.d0 + Math.abs(s[i] - s[seed.index]));
    return { x: p.x, y: p.y, d };
  });
}

/** Angles of the ring's two ends (screen radians): units start at `thin`. */
export function ringEnds() {
  return { thin: GAP_CENTRE - GAP_WIDTH / 2, thick: GAP_CENTRE + GAP_WIDTH / 2 };
}

/** Digits of `n`, least significant first, no leading zeros ([0] for 0). */
export function placeDigits(n) {
  let v = Math.max(0, Math.floor(n));
  const out = [];
  do { out.push(v % 10); v = Math.floor(v / 10); } while (v > 0);
  return out;
}

/**
 * The numeral in a `size × size` cell (cell-local px), distance-tagged.
 * @param {Object} o
 * @param {number} o.number   any non-negative integer (up to 10^slots − 1 fits)
 * @param {number} o.size
 * @param {number} [o.padFrac=0.10]
 * @param {number} [o.slots=8]  positions round the ring, 4..16
 * @returns {{ paths: {points:{x,y,d}[], place:string, digit:number|null, seeded:boolean}[], maxD:number }}
 */
export function ringStaveGrowthPx({ number, size, padFrac = 0.10, slots = 8 }) {
  const N = Math.max(4, Math.min(16, slots | 0));
  const usable = size * (1 - 2 * padFrac);
  const cx = size / 2, cy = size / 2;
  // Figures reach W outside the ring; keep the whole numeral in the cell.
  const H_OF_R = FIGURE_H, W_OF_R = FIGURE_H * FIGURE_W;
  const R = (usable / 2) / (1 + W_OF_R);
  const H = R * H_OF_R, W = R * W_OF_R;
  const paths = [];

  // Ring: one arc from the thin end (bottom right) the long way round to the
  // thick end (bottom left) — decreasing angle in screen space: up the right
  // side, over the top, down the left. Rooted at the thin end.
  const aThin = GAP_CENTRE - GAP_WIDTH / 2;
  const span = Math.PI * 2 - GAP_WIDTH;
  const angleAt = (t) => aThin - span * t;               // t ∈ [0,1], thin → thick
  const ringPt = (a, r = R) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  const ringD = (a) => {                                 // arc distance from the thin end
    let rel = aThin - a;
    while (rel < 0) rel += Math.PI * 2;
    while (rel > Math.PI * 2) rel -= Math.PI * 2;
    return Math.min(rel, span) * R;
  };
  const arc = [];
  for (let i = 0; i <= RING_SAMPLES; i++) {
    const t = i / RING_SAMPLES;
    const e = t * t * (3 - 2 * t);                        // ease: swells late
    arc.push({ ...ringPt(angleAt(t)), d: span * R * t, wf: WF_THIN + (WF_THICK - WF_THIN) * e });
  }
  paths.push({ points: arc, place: 'stave', digit: null, seeded: false });

  const digits = placeDigits(number);
  const step = span / N;                                  // slots share the arc
  const dTheta = H / R;                                   // tip↔foot as an angle
  digits.forEach((digit, k) => {
    if (k >= N) return;
    const ac = aThin - (k + 0.5) * step;                  // units by the thin end
    const dir = (k % 2 === 0) ? 1 : -1;                   // adjacent slots mirror tip/foot
    const aTip = ac - dir * dTheta / 2;
    // Cistercian unit-quadrant coords: x 1..2 (stave → out), y 0..1 (tip →
    // foot). Angle runs tip → foot along the ring; radius grows outward.
    const map = (p) => ({ ...ringPt(aTip + dir * p.y * dTheta, R + (p.x - 1) * W), wf: WF_FIGURE });
    for (const raw of UNIT_DIGIT_PATHS[digit] ?? []) {
      const pts = raw.map(map);
      const seeds = [];
      raw.forEach((p, i) => {
        if (Math.abs(p.x - 1) < 1e-6 && (i === 0 || i === raw.length - 1)) seeds.push({ index: i, d0: ringD(aTip + dir * p.y * dTheta) });
      });
      const place = `slot${k}`;
      if (seeds.length) {
        paths.push({ points: withDistance(pts, seeds).map((q, i) => ({ ...q, wf: pts[i].wf })), place, digit, seeded: false });
        continue;
      }
      // Detached (digit 6): grow from the bar's midpoint a beat after the
      // front passes the slot.
      const last = pts.length - 1;
      const mid = { x: (pts[0].x + pts[last].x) / 2, y: (pts[0].y + pts[last].y) / 2, wf: WF_FIGURE };
      const d0 = ringD(ac) + W;
      const h = dist(pts[0], pts[last]) / 2;
      paths.push({ points: [{ ...mid, d: d0 }, { ...pts[0], d: d0 + h }], place, digit, seeded: true });
      paths.push({ points: [{ ...mid, d: d0 }, { ...pts[last], d: d0 + h }], place, digit, seeded: true });
    }
  });

  let maxD = 0;
  for (const p of paths) for (const q of p.points) maxD = Math.max(maxD, q.d);
  return { paths, maxD };
}
