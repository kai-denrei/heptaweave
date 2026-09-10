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
// Slots: `slots` evenly spaced positions (8 by default, up to 16). Numbers
// are read from the right: the units sit at the upper-right and each higher
// place is the next slot counter-clockwise, so a 2-digit number occupies two
// slots and a 5-digit number five. Adjacent slots mirror their tip/foot
// direction, as Cistercian quadrant pairs do. Leading zeros are not drawn;
// 0 is the bare ring.
//
// Output has the same shape as growthFront.js — distance-tagged polylines —
// so the ink painter grows it with the same front: from the ring's midpoint
// (opposite its opening) both ways round the ring, and out into each figure
// as the front passes its foot on the ring. Digit 6, which touches the ring
// nowhere, seeds at its own midpoint a beat after the front passes its slot.

import { UNIT_DIGIT_PATHS } from './digitMap.js';

const RING_SAMPLES = 96;
const GAP_CENTRE = -Math.PI * 0.62;   // the opening, upper-left
const GAP_WIDTH = Math.PI * 0.10;
const UNITS_ANGLE = -Math.PI / 4;     // slot 0, upper-right
const FIGURE_H = 0.42;                // tip↔foot arc length, of R
const FIGURE_W = 0.6;                 // radial reach, of FIGURE_H

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

  // Ring: an arc from one side of the opening round to the other, rooted
  // at its midpoint so the front runs both ways.
  const a0 = GAP_CENTRE + GAP_WIDTH / 2;
  const a1 = GAP_CENTRE + Math.PI * 2 - GAP_WIDTH / 2;
  const aMid = (a0 + a1) / 2;
  const ringPt = (a, r = R) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  const half = RING_SAMPLES / 2;
  const armA = [], armB = [];
  for (let i = 0; i <= half; i++) {
    armA.push(ringPt(aMid + (a1 - aMid) * i / half));
    armB.push(ringPt(aMid - (aMid - a0) * i / half));
  }
  for (const arm of [armA, armB]) {
    const s = arcLengths(arm);
    paths.push({ points: arm.map((p, i) => ({ ...p, d: s[i] })), place: 'stave', digit: null, seeded: false });
  }
  const ringD = (a) => {
    let rel = a - aMid;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    return Math.abs(rel) * R;
  };

  const digits = placeDigits(number);
  const step = (Math.PI * 2) / N;
  const dTheta = H / R;                 // tip↔foot as an angle
  digits.forEach((digit, k) => {
    if (k >= N) return;
    const ac = UNITS_ANGLE - k * step;  // counter-clockwise per place
    const dir = (k % 2 === 0) ? 1 : -1; // adjacent slots mirror tip/foot
    const aTip = ac - dir * dTheta / 2;
    // Cistercian unit-quadrant coords: x 1..2 (stave → out), y 0..1 (tip →
    // foot). Angle runs tip → foot along the ring; radius grows outward.
    const map = (p) => ringPt(aTip + dir * p.y * dTheta, R + (p.x - 1) * W);
    for (const raw of UNIT_DIGIT_PATHS[digit] ?? []) {
      const pts = raw.map(map);
      const seeds = [];
      raw.forEach((p, i) => {
        if (Math.abs(p.x - 1) < 1e-6 && (i === 0 || i === raw.length - 1)) seeds.push({ index: i, d0: ringD(aTip + dir * p.y * dTheta) });
      });
      const place = `slot${k}`;
      if (seeds.length) {
        paths.push({ points: withDistance(pts, seeds), place, digit, seeded: false });
        continue;
      }
      // Detached (digit 6): grow from the bar's midpoint a beat after the
      // front passes the slot.
      const last = pts.length - 1;
      const mid = { x: (pts[0].x + pts[last].x) / 2, y: (pts[0].y + pts[last].y) / 2 };
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
