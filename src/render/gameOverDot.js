// gameOverDot.js — green/red end-of-run dot.
//
// `renderGameOverDot({ clean, size, rng })` returns an SVG group containing
// a single irregular ink blob colored teal (clean) or dark red (errored).

import { irregularBlob } from '../ink/splotch.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CLEAN_FILL = '#2e9d6c';   // muted green — feels earned, not video-gamey
const ERROR_FILL = '#a83a2b';   // same dark red as the depleted timer ring

export function renderGameOverDot({ clean, size = 40, rng }) {
  const d = irregularBlob({
    cx: 0,
    cy: 0,
    size: size / 2,
    irregularity: 0.32,
    elongation: 0.18,
    rng,
  });
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', clean ? CLEAN_FILL : ERROR_FILL);
  return path;
}
