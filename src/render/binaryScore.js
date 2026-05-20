// binaryScore.js — variable-width binary score in brush marks.
//
// `renderBinaryScore({ score, size, markSize, rng })` returns an SVG group
// where:
//   • each "1" bit is an `irregularBlob` (solid round ink puddle)
//   • each "0" bit is a short `brushStroke` dash
//   • bits are laid out left-to-right, MSB first
//   • the row grows leftward (i.e., the row's right edge stays fixed at x=0;
//     callers position the row by anchoring its right edge)
//
// `renderBigBinaryScore` is the same, but bigger and intended for the
// game-over screen — used as the centerpiece.
//
// `score = 0` returns an empty group.

import { brushStroke, lensProfile } from '../ink/brush.js';
import { irregularBlob } from '../ink/splotch.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Returns the SVG <g> element + the total width in user units.
 *
 * Bits are placed at x = -i × stride (i=0 is the rightmost bit = LSB), so the
 * row's right edge is anchored at x=0. Caller can `g.setAttribute('transform',
 * 'translate(rightEdgeX, baselineY)')` to position.
 */
export function renderBinaryScore({
  score,
  markSize = 12,
  rng,
  bitGap = 0.6,
}) {
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'binary-score');
  group.setAttribute('fill', 'currentColor');
  if (score <= 0) {
    return { groupEl: group, width: 0, bitCount: 0 };
  }
  const bits = score.toString(2); // MSB first
  const stride = markSize * (1 + bitGap);

  // We want MSB on the LEFT, LSB on the RIGHT. The rightmost bit sits at
  // x = 0; the leftmost (MSB) sits at x = -(bits.length - 1) * stride.
  const totalWidth = (bits.length - 1) * stride + markSize;

  for (let i = 0; i < bits.length; i++) {
    const isOne = bits[i] === '1';
    // i = 0 (MSB) sits leftmost.
    const xCenter = -(bits.length - 1 - i) * stride;
    const yCenter = 0;
    let d;
    if (isOne) {
      // Solid blob.
      d = irregularBlob({
        cx: xCenter,
        cy: yCenter,
        size: markSize * 0.45,
        irregularity: 0.35,
        elongation: 0.18,
        rng,
      });
    } else {
      // Short dash — a horizontal brushStroke half the mark wide.
      const halfLen = markSize * 0.45;
      const dashH = markSize * 0.16;
      const controlPoints = [
        { x: xCenter - halfLen, y: yCenter },
        { x: xCenter,           y: yCenter + rng.gauss(0, dashH * 0.2) },
        { x: xCenter + halfLen, y: yCenter },
      ];
      d = brushStroke({
        controlPoints,
        widthProfile: lensProfile,
        maxWidth: dashH,
        jitter: { edge: dashH * 0.3, spine: 0 },
        rng,
        samples: 18,
      });
    }
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.dataset.bitIndex = String(i);
    group.appendChild(path);
  }

  return { groupEl: group, width: totalWidth, bitCount: bits.length };
}
