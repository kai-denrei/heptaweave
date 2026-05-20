// binaryScore.js — fixed 8-bit binary score in brush marks.
//
// Reading order: LEFT to RIGHT, LSB first.
//   bit 0 (leftmost) = 2^0 = 1
//   bit 7 (rightmost) = 2^7 = 128
//
// Examples (8 marks each):
//   00000000 → 0
//   10000000 → 1
//   01000000 → 2
//   11000000 → 3
//   10001000 → 17
//
// "1" = irregular ink blob; "0" = short hyphen brush stroke.

import { brushStroke, lensProfile } from '../ink/brush.js';
import { irregularBlob } from '../ink/splotch.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOTAL_BITS = 8;

/**
 * @param {Object} opts
 * @param {number} opts.score      score (clamped to 0..255 for display; higher
 *                                 scores still pass through unchanged for game
 *                                 logic — only the upper bits are clipped).
 * @param {number} [opts.markSize=12]
 * @param {Object} opts.rng
 * @param {number} [opts.bitGap=0.6]
 * @returns {{groupEl: SVGGElement, width: number, bitCount: number}}
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

  const stride = markSize * (1 + bitGap);
  const totalWidth = (TOTAL_BITS - 1) * stride + markSize;
  const safeScore = Math.max(0, Math.floor(score)) & 0xff;

  for (let i = 0; i < TOTAL_BITS; i++) {
    const isOne = ((safeScore >> i) & 1) === 1;
    const xCenter = i * stride; // bit i goes at column i; leftmost = LSB
    const yCenter = 0;
    let d;
    if (isOne) {
      d = irregularBlob({
        cx: xCenter,
        cy: yCenter,
        size: markSize * 0.45,
        irregularity: 0.35,
        elongation: 0.18,
        rng,
      });
    } else {
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

  return { groupEl: group, width: totalWidth, bitCount: TOTAL_BITS };
}
