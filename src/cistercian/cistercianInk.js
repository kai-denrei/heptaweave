// cistercianInk.js — render a Cistercian sigil as brush-stroke SVG.
//
// `buildCistercian(n)` returns segments with logical coords in [0..2] × [0..3]
// (centre stave is x=1). Map them into the rendered viewBox with `mapPoint`,
// then run each segment through `brushStroke` so it looks like calligraphy,
// not a Bresenham line. Order: stave (full height) first, then each digit's
// quadrant segments in PLACE_ORDER. Numbers 0..9999.
//
// Output is an SVGGElement containing N <path> children, ready to be parented
// under a wet/halo/crisp filter stack.

import { buildCistercian } from './buildSigil.js';
import { brushStroke, lensProfile } from '../ink/brush.js';
import { irregularBlob } from '../ink/splotch.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Map a {x: 0..2, y: 0..3} logical point into the unit-cell pixel coords.
 *
 * The Cistercian glyph occupies a roughly 2:3 box. Inside `size × size`,
 * we leave outer padding (`padFrac`) and center the box. The stave runs
 * down x=1 (centerline). y=0 is the top of the glyph, y=3 the bottom.
 */
function mapPoint(p, size, padFrac) {
  const usable = size * (1 - 2 * padFrac);
  // Glyph aspect is 2 (wide) : 3 (tall). Fit into the usable square.
  const glyphH = usable;
  const glyphW = (usable * 2) / 3;
  const ox = (size - glyphW) / 2;
  const oy = (size - glyphH) / 2;
  return {
    x: ox + (p.x / 2) * glyphW,
    y: oy + (p.y / 3) * glyphH,
  };
}

/**
 * Build a single segment's brushStroke control points.
 *
 * `from` and `to` are already mapped to pixel coords. We insert a small
 * jittered mid-point so brush.js's Catmull-Rom can curve organically; the
 * jitter is perpendicular to the segment so the stroke wobbles like a
 * hand-drawn line rather than a vector edge.
 */
function segmentControlPoints({ from, to, rng, wobblePx }) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector.
  const nx = -dy / len;
  const ny = dx / len;
  const j = rng.gauss(0, wobblePx);
  return [
    { ...from },
    { x: mid.x + nx * j, y: mid.y + ny * j },
    { ...to },
  ];
}

/**
 * Render a Cistercian numeral as brush-stroke ink.
 *
 * @param {Object} opts
 * @param {number} opts.number     — 0..9999
 * @param {number} opts.size       — viewBox dimension (square)
 * @param {Object} opts.rng        — seeded RNG
 * @param {number} [opts.padFrac]  — fraction of size reserved as outer padding
 * @param {number} [opts.strokeWidthFrac] — half-width of brush, as frac of size
 * @returns {{ groupEl: SVGGElement, segmentPaths: string[] }}
 */
export function renderCistercianInk({
  number,
  size,
  rng,
  padFrac = 0.10,
  strokeWidthFrac = 0.022,
}) {
  const { segments } = buildCistercian(number);
  const maxWidth = size * strokeWidthFrac;
  // Mid-segment wobble scaled to stroke width — keeps the wobble visible but
  // not so large that diagonals miss their target endpoints visibly.
  const wobblePx = maxWidth * 0.6;

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'cistercian-ink');

  const segmentPaths = [];

  for (const seg of segments) {
    const from = mapPoint(seg.from, size, padFrac);
    const to   = mapPoint(seg.to,   size, padFrac);

    // Stave gets a steadier, slightly thicker, less-tapered profile.
    const isStave = seg.place === 'stave';
    const controlPoints = segmentControlPoints({
      from,
      to,
      rng,
      wobblePx: isStave ? wobblePx * 0.5 : wobblePx,
    });

    // Symmetric lens (both ends taper a touch) for digit segments,
    // near-flat for the stave — long verticals shouldn't taper to nothing.
    const widthProfile = isStave
      ? (t) => 0.6 + 0.4 * Math.sin(Math.PI * t) // mostly full, gentle middle
      : lensProfile;

    const d = brushStroke({
      controlPoints,
      widthProfile,
      maxWidth: isStave ? maxWidth * 1.05 : maxWidth,
      jitter: { edge: maxWidth * 0.25, spine: maxWidth * 0.05 },
      rng,
      samples: 32,
    });
    segmentPaths.push(d);

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    group.appendChild(path);

    // Tiny ink puddle at every endpoint that lives on a digit corner.
    // This thickens junctions so a 5 (which doubles back) doesn't look thin
    // at the corner, and adds calligraphic weight to terminals.
    if (!isStave) {
      const puddle = irregularBlob({
        cx: to.x,
        cy: to.y,
        size: maxWidth * 0.5,
        irregularity: 0.4,
        elongation: 0.2,
        rng,
      });
      const blob = document.createElementNS(SVG_NS, 'path');
      blob.setAttribute('d', puddle);
      blob.setAttribute('fill', 'currentColor');
      group.appendChild(blob);
    }
  }

  return { groupEl: group, segmentPaths };
}
