// ringStave.js — the ring-stave numeral: Cistercian digit logic on a ring.
//
// The heptaweave's ring plays the Cistercian stave. Four short stems leave
// it radially at the Cistercian quadrant positions (units upper-right, tens
// upper-left, hundreds lower-right, thousands lower-left) and each digit is
// the unchanged Cistercian figure drawn in its stem's frame: *along* the
// stem is what "up the stave" was, *across* it is what "out from the stave"
// was. Left places mirror the digit side; lower places swap tip and foot, so
// the four quadrants keep the full Cistercian symmetry.
//
// Output has the same shape as growthFront.js — distance-tagged polylines —
// so the ink painter grows it with the same front: from the ring's midpoint
// (opposite its opening) both ways round the ring, out each stem as the
// front passes its root, and on into the digit. Digit 6, which touches its
// stem nowhere, seeds at its own midpoint when the front reaches the stem's
// tip. See docs: "Ring Stave Numerals" (2026-09-10).

import { UNIT_DIGIT_PATHS } from './digitMap.js';
import { splitDigits } from './buildSigil.js';

const EPS = 1e-6;
const RING_SAMPLES = 72;

// Ring geometry (fractions of the cell): radius, opening centre and width.
const RING_R = 0.34;
const GAP_CENTRE = -Math.PI * 0.62; // upper-left
const GAP_WIDTH = Math.PI * 0.10;
const STEM_L = 0.42;                // of R
const DIGIT_W = 0.6;                // of stem length, to the digit side
const FOOT = 0.3;                   // foot level, of stem length (tip = 1)

// Stem frame per place: angle of the stem, digit side (±1 tangential), and
// whether tip and foot swap (lower places).
const PLACES = [
  { place: 'thousands', a: Math.PI * 0.75,  side: -1, flip: true },
  { place: 'hundreds',  a: Math.PI * 0.25,  side: +1, flip: true },
  { place: 'tens',      a: -Math.PI * 0.75, side: -1, flip: false },
  { place: 'units',     a: -Math.PI * 0.25, side: +1, flip: false },
];

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

/**
 * The numeral in a `size × size` cell (cell-local px), distance-tagged.
 * @returns {{ paths: {points:{x,y,d}[], place:string, digit:number|null, seeded:boolean}[], maxD:number }}
 */
export function ringStaveGrowthPx({ number, size, padFrac = 0.10 }) {
  const usable = size * (1 - 2 * padFrac);
  const cx = size / 2, cy = size / 2;
  const R = usable * RING_R;
  const L = R * STEM_L;
  const digits = splitDigits(number);
  const paths = [];

  // Ring: an arc from one side of the opening round to the other, rooted
  // at its midpoint so the front runs both ways. Two polylines, each
  // starting at the root.
  const a0 = GAP_CENTRE + GAP_WIDTH / 2;           // just past the opening
  const a1 = GAP_CENTRE + Math.PI * 2 - GAP_WIDTH / 2;
  const aMid = (a0 + a1) / 2;
  const ringPt = (a) => ({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R });
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
  // Arc distance from the root to an angle on the ring.
  const ringD = (a) => {
    let rel = a - aMid;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    return Math.abs(rel) * R;
  };

  for (const pl of PLACES) {
    const digit = digits[pl.place];
    const ux = Math.cos(pl.a), uy = Math.sin(pl.a);   // outward
    const tx = -uy, ty = ux;                           // tangential
    const dBase = ringD(pl.a);
    // Stem frame → cell px. `along` ∈ [0,1] outward from the ring; `across`
    // is to the digit side in units of L.
    const map = (along, across) => ({
      x: cx + ux * (R + along * L) + tx * across * pl.side * L,
      y: cy + uy * (R + along * L) + ty * across * pl.side * L,
    });
    // Stem, rooted on the ring.
    paths.push({ points: [{ ...map(0, 0), d: dBase }, { ...map(1, 0), d: dBase + L }], place: pl.place, digit: null, seeded: false });

    // Digit figure. Cistercian unit-quadrant coords: x 1..2 (stave → out),
    // y 0..1 (tip → foot). In the stem frame: across = (x − 1) · DIGIT_W,
    // along = tip level 1 at y = 0, foot level FOOT at y = 1; flipped
    // places swap those two levels.
    for (const raw of UNIT_DIGIT_PATHS[digit] ?? []) {
      const frame = raw.map(p => {
        const across = (p.x - 1) * DIGIT_W;
        let along = 1 - p.y * (1 - FOOT);
        if (pl.flip) along = FOOT + (1 - along);
        return { along, across };
      });
      const pts = frame.map(f => map(f.along, f.across));
      const seeds = [];
      frame.forEach((f, i) => {
        if (Math.abs(f.across) < EPS && (i === 0 || i === frame.length - 1)) seeds.push({ index: i, d0: dBase + f.along * L });
      });
      if (seeds.length) {
        paths.push({ points: withDistance(pts, seeds), place: pl.place, digit, seeded: false });
        continue;
      }
      // Detached (digit 6): grow from the bar's midpoint when the front
      // reaches the stem's tip.
      const last = pts.length - 1;
      const mid = { x: (pts[0].x + pts[last].x) / 2, y: (pts[0].y + pts[last].y) / 2 };
      const d0 = dBase + L;
      const h = dist(pts[0], pts[last]) / 2;
      paths.push({ points: [{ ...mid, d: d0 }, { ...pts[0], d: d0 + h }], place: pl.place, digit, seeded: true });
      paths.push({ points: [{ ...mid, d: d0 }, { ...pts[last], d: d0 + h }], place: pl.place, digit, seeded: true });
    }
  }

  let maxD = 0;
  for (const p of paths) for (const q of p.points) maxD = Math.max(maxD, q.d);
  return { paths, maxD };
}
