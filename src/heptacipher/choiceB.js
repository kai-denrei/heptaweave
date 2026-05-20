// choiceB.js — "full mini" choice renderer.
//
// A small but full heptacipher logogram: inner ensō + 4 lobes (alternating
// outward/inward) + wet-drop. Identical layout to the parent heptacipher
// renderer, scaled down to fit a ~80–100 px choice tile. The inner ensō is
// clearly readable but each individual mark is at the edge of legibility —
// the explicit tradeoff vs Renderer A.

import { createRng } from '../util/rng.js';
import { enso, ensoBodyGeometry } from '../ink/enso.js';
import { irregularBlob } from '../ink/splotch.js';
import { morseDigitArcAppendage } from './morseDigitArc.js';
import { digitsOf } from './morsePatterns.js';
import { buildInkFilters } from '../ink/filters.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Lobe placement along the body — leans on the same constants as the
// full-size renderer but with tighter spacing so the lobes fit.
const LEAD_GAP = 0.04;
const TAIL_GAP = 0.03;
const DIGIT_GAP = 0.07;
const DIGIT_LOBE_INWARD = [false, true, false, true];

function computeLobeSpans(digitGap) {
  const interGapTotal = 3 * digitGap;
  const lobeBudget = 1 - LEAD_GAP - TAIL_GAP - interGapTotal;
  const lobeSpan = Math.max(0.02, lobeBudget / 4);
  const spans = [];
  for (let i = 0; i < 4; i++) {
    const start = LEAD_GAP + i * (lobeSpan + digitGap);
    spans.push([start, start + lobeSpan]);
  }
  return spans;
}

export function renderChoiceB({ number, size = 100, seed = 0 }) {
  const rng = createRng(seed ^ (number * 0x85EBCA77));
  const digits = digitsOf(number);

  const cx = size / 2;
  const cy = size / 2;
  // Even smaller radius — outward lobes still need to fit in the viewBox.
  const radius = size * 0.18;

  // Wide gap with short tail leaves a clearly visible open ensō. Brush start
  // (at gapAngleDeg + halfGap ≈ 137°) lands in the bottom-left quadrant.
  const gapAngleDeg = 110 + rng.gauss(0, 4);
  const gapWidthDeg = 55 + rng.range(-3, 5);
  const tailLengthDeg = 15 + rng.range(-2, 4);

  const bodyGeo = ensoBodyGeometry({ cx, cy, radius, gapAngleDeg, gapWidthDeg });
  const { outlineD: ensoPath } = enso({
    cx, cy, radius, gapAngleDeg, gapWidthDeg, tailLengthDeg, rng,
    maxWidth: Math.max(1.2, radius * 0.10),
  });

  const ensoCenter = { x: cx, y: cy };
  const lobeSpans = computeLobeSpans(DIGIT_GAP);
  const nudgePx = Math.max(2, size * 0.012);

  function anchorAt(tBody, inward) {
    const bp = bodyGeo.bodyPoint(tBody);
    const sign = inward ? -1 : 1;
    return {
      x: bp.x + bp.nx * nudgePx * sign,
      y: bp.y + bp.ny * nudgePx * sign,
    };
  }

  const appendageBodies = [];
  for (let i = 0; i < 4; i++) {
    const [tStart, tEnd] = lobeSpans[i];
    const inward = DIGIT_LOBE_INWARD[i];
    const lobeStart = anchorAt(tStart, inward);
    const lobeEnd   = anchorAt(tEnd,   inward);
    const baseBulge = inward ? 0.45 : 0.55;
    const result = morseDigitArcAppendage({
      digit: digits[i],
      lobeStartPoint: lobeStart,
      lobeEndPoint: lobeEnd,
      ensoCenter,
      ensoRadius: radius,
      scale: radius * 0.85,
      rng,
      bulge: baseBulge + rng.gauss(0, 0.02),
      inward,
      markSpread: 0.92,
    });
    appendageBodies.push(result.body);
  }

  // Wet-drop at head of body.
  const bp0 = bodyGeo.bodyPoint(0);
  const bpEps = bodyGeo.bodyPoint(0.005);
  const tanAngle = Math.atan2(bpEps.y - bp0.y, bpEps.x - bp0.x);
  const wetDrop = irregularBlob({
    cx: bp0.x,
    cy: bp0.y,
    size: radius * 0.22,
    irregularity: 0.40,
    elongation: 0.35,
    rotationRad: tanAngle + Math.PI / 2,
    rng,
  });

  const idTag = (rng.seed >>> 0).toString(36) + '-b' + number;
  const filters = buildInkFilters({
    idTag,
    size,
    bleedScale: 0.6,
    haloOpacity: 0.55,
    liquidWobble: 3,
    liquidDetail: 0.12,
    rng,
  });

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  const pad = radius * 1.1;
  svg.setAttribute('viewBox', `${-pad/2} ${-pad/2} ${size + pad} ${size + pad}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.style.overflow = 'visible';
  svg.style.color = 'var(--ink, #161310)';

  const inner = `
    ${appendageBodies.join('')}
    <path d="${wetDrop}" />
    <path d="${ensoPath}" />
  `;

  svg.innerHTML = `
    <defs>${filters.defs}</defs>
    <g filter="url(#${filters.nearId})" opacity="${filters.nearOpacity}" fill="currentColor">${inner}</g>
    <g filter="url(#${filters.crispId})" opacity="0.95" fill="currentColor">${inner}</g>
  `;

  return svg;
}
