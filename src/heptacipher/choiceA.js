// choiceA.js — "lobes-only" choice renderer.
//
// The choice circle itself IS the ensō. Four lobes hang off its perimeter
// in the canonical out / in / out / in pattern (thousands & tens bulge
// OUTSIDE the ring; hundreds & units bulge INSIDE). The wet-drop / notch
// sits at the bottom-left where the brush lands.
//
// At the v1 choice-tile sizes (180–260 px) the inward lobes have room to
// breathe in the center, so we keep the canonical heptacipher layout.

import { createRng } from '../util/rng.js';
import { enso, ensoBodyGeometry } from '../ink/enso.js';
import { irregularBlob } from '../ink/splotch.js';
import { morseDigitArcAppendage } from './morseDigitArc.js';
import { digitsOf } from './morsePatterns.js';
import { buildInkFilters } from '../ink/filters.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Canonical heptacipher lobe topology: out, in, out, in.
// Indexed [d1, d2, d3, d4] = [thousands, hundreds, tens, units].
const DIGIT_LOBE_INWARD = [false, true, false, true];

// Bulge per lobe. Outward lobes bulge away from center; inward lobes dive
// inside the ring. We use a stronger inward bulge than the canonical 0.32
// so the inside lobes are clearly visible at choice-tile sizes.
const LOBE_BULGE_OUTWARD = 0.55;
const LOBE_BULGE_INWARD  = 0.45;

// Spacing along the body arc.
const LEAD_GAP  = 0.05;
const TAIL_GAP  = 0.04;
const DIGIT_GAP = 0.07;

function computeLobeSpans() {
  const interGapTotal = 3 * DIGIT_GAP;
  const lobeBudget = 1 - LEAD_GAP - TAIL_GAP - interGapTotal;
  const lobeSpan = Math.max(0.02, lobeBudget / 4);
  const spans = [];
  for (let i = 0; i < 4; i++) {
    const start = LEAD_GAP + i * (lobeSpan + DIGIT_GAP);
    spans.push([start, start + lobeSpan]);
  }
  return spans;
}

/**
 * @param {Object} opts
 * @param {number} opts.number   — 0..9999
 * @param {number} opts.size     — viewBox dimension (square)
 * @param {number} opts.seed
 * @returns {SVGSVGElement}
 */
export function renderChoiceA({ number, size = 200, seed = 0 }) {
  const rng = createRng(seed ^ (number * 0x9E37));
  const digits = digitsOf(number);

  const cx = size / 2;
  const cy = size / 2;
  // Slightly tighter ensō than choiceB so outward lobes have more outward run.
  const radius = size * 0.26;

  // ENSO ----------------------------------------------------------------
  // gapAngleDeg = 110: center of gap south of 7 o'clock so the brush start
  // (at gapAngleDeg + halfGap ≈ 135°) lands in the bottom-left quadrant.
  // Wide gap (55°) minus short tail (15°) leaves a clearly visible 40° gap
  // in the open ensō.
  const gapAngleDeg = 110 + rng.gauss(0, 4);
  const gapWidthDeg = 55 + rng.range(-3, 5);
  const tailLengthDeg = 15 + rng.range(-2, 4);

  // Body geometry first (pure, no rng calls), then the actual brushed enso
  // (consumes rng for the wobble). This ordering preserves determinism.
  const bodyGeo = ensoBodyGeometry({ cx, cy, radius, gapAngleDeg, gapWidthDeg });
  const { outlineD: ensoPath } = enso({
    cx, cy, radius, gapAngleDeg, gapWidthDeg, tailLengthDeg, rng,
    maxWidth: Math.max(1.6, radius * 0.10),
  });

  // LOBES ---------------------------------------------------------------
  const lobeSpans = computeLobeSpans();
  const nudgePx = Math.max(2, size * 0.012);

  function anchorAt(tBody, inward) {
    const bp = bodyGeo.bodyPoint(tBody);
    const sign = inward ? -1 : 1;
    return {
      x: bp.x + bp.nx * nudgePx * sign,
      y: bp.y + bp.ny * nudgePx * sign,
    };
  }

  const ensoCenter = { x: cx, y: cy };
  const appendageBodies = [];

  for (let i = 0; i < 4; i++) {
    const [tStart, tEnd] = lobeSpans[i];
    const inward = DIGIT_LOBE_INWARD[i];
    const lobeStart = anchorAt(tStart, inward);
    const lobeEnd   = anchorAt(tEnd,   inward);

    const baseBulge = inward ? LOBE_BULGE_INWARD : LOBE_BULGE_OUTWARD;
    const bulge = baseBulge + rng.gauss(0, 0.03);

    const result = morseDigitArcAppendage({
      digit: digits[i],
      lobeStartPoint: lobeStart,
      lobeEndPoint: lobeEnd,
      ensoCenter,
      ensoRadius: radius,
      scale: radius * 0.85,
      rng,
      bulge,
      inward,
      markSpread: 0.95,
    });
    appendageBodies.push(result.body);
  }

  // WET-DROP at the start of the body (the brush-landing notch).
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

  // FILTERS -------------------------------------------------------------
  const idTag = (rng.seed >>> 0).toString(36) + '-a' + number;
  const filters = buildInkFilters({
    idTag,
    size,
    bleedScale: 0.7,
    haloOpacity: 0.55,
    liquidWobble: 4,
    liquidDetail: 0.12,
    rng,
  });

  // ASSEMBLE -----------------------------------------------------------
  // viewBox is padded so outward lobes don't clip.
  const pad = radius * 1.0;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
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
