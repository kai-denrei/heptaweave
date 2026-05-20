// numeralV2.js — direct port of `renderHeptapodNumeralV2` from
// /Users/minikai/Documents/Dev/heptapod-logograms/src/compositeFlow.js,
// stripped of the quiz-app draw-mask animation. All tuning constants
// match the original verbatim — the balance was tuned there.
//
// We only support encoding = 'morse' here (heptaweave doesn't use prong).

import { createRng } from '../util/rng.js';
import { enso, ensoBodyGeometry } from '../ink/enso.js';
import { irregularBlob } from '../ink/splotch.js';
import { morseDigitArcAppendage } from './morseDigitArc.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_GAP_DEG = 90;

// --- Digit spacing along the ensō body --------------------------------------
const LEAD_GAP = 0.04;
const TAIL_GAP = 0.03;
const DEFAULT_DIGIT_GAP = 0.08;

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

// --- Lobe side (outside vs inside the ensō) --------------------------------
// Thousands and tens bulge OUTSIDE the ring; hundreds and units bulge INSIDE.
const DIGIT_LOBE_INWARD = [false, true, false, true];

// --- Lobe shape -------------------------------------------------------------
const LOBE_BULGE_OUTWARD = 0.50;
const LOBE_BULGE_INWARD  = 0.32;
const LOBE_BULGE_JITTER  = 0.03;

// --- Endpoint nudging -------------------------------------------------------
const ENDPOINT_OUTWARD_NUDGE_FRAC = 0.012;

// --- Wet-drop ---------------------------------------------------------------
const WET_DROP_SIZE_FRAC = 0.13;

// --- Ink bleed / soak-through halo -----------------------------------------
const INK_BLEED_FAR_STD_DEV  = 8.0;
const INK_BLEED_FAR_OPACITY  = 0.42;
const INK_BLEED_NEAR_STD_DEV = 2.4;
const INK_BLEED_NEAR_OPACITY = 0.62;
const INK_CRISP_OPACITY      = 0.92;

function digitsOf(n) {
  return [
    Math.floor(n / 1000) % 10,
    Math.floor(n / 100) % 10,
    Math.floor(n / 10) % 10,
    n % 10,
  ];
}

/**
 * @param {Object} opts
 * @param {number} opts.number          — 0..9999
 * @param {number} opts.size            — base size; the returned SVG renders at
 *                                        size × 1.6 to leave room for the halo
 *                                        outside the glyph.
 * @param {number} opts.seed
 * @param {number} [opts.bulgeScale=1]
 * @param {number} [opts.digitGap=0.08]
 * @param {number} [opts.markSpread=1]
 * @param {number} [opts.bleedScale=1]
 * @param {number} [opts.haloOpacity=1]
 * @param {number} [opts.crispOpacity=0.92]
 * @param {number} [opts.liquidWobble=0]
 * @param {number} [opts.liquidDetail=0.04]
 * @param {number} [opts.vbPadFrac=0.3]  ViewBox padding as a fraction of size.
 *                                       Canonical V2 = 0.3 (glyph fills 30%
 *                                       of SVG, plenty of halo air). Use 0.10
 *                                       for choice-tile use where you want
 *                                       the glyph to dominate the tile.
 * @returns {SVGSVGElement}
 */
export function renderHeptapodNumeralV2({
  number,
  size,
  seed,
  bulgeScale = 1,
  digitGap = DEFAULT_DIGIT_GAP,
  markSpread = 1,
  bleedScale = 1,
  haloOpacity = 1,
  crispOpacity = INK_CRISP_OPACITY,
  liquidWobble = 0,
  liquidDetail = 0.04,
  vbPadFrac = 0.3,
} = {}) {
  if (!Number.isInteger(number) || number < 0 || number > 9999) {
    throw new TypeError(`numeralV2: number must be 0..9999, got ${number}`);
  }

  const rng = createRng(seed);
  const digits = digitsOf(number);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.24;

  // ENSO -----------------------------------------------------------------
  const gapAngleDeg = DEFAULT_GAP_DEG + rng.gauss(0, 6);
  const gapWidthDeg = 32 + rng.range(-4, 6);
  const tailLengthDeg = 22 + rng.range(-3, 5);

  const bodyGeo = ensoBodyGeometry({ cx, cy, radius, gapAngleDeg, gapWidthDeg });
  const { outlineD: ensoPath } = enso({
    cx, cy, radius, gapAngleDeg, gapWidthDeg, tailLengthDeg, rng,
  });

  // LOBE ENDPOINTS -------------------------------------------------------
  const nudgePx = Math.max(3, size * ENDPOINT_OUTWARD_NUDGE_FRAC);
  function anchorAt(tBody, inward) {
    const bp = bodyGeo.bodyPoint(tBody);
    const sign = inward ? -1 : 1;
    return {
      x: bp.x + bp.nx * nudgePx * sign,
      y: bp.y + bp.ny * nudgePx * sign,
      tAlongBody: tBody,
    };
  }

  // APPENDAGES -----------------------------------------------------------
  const appendageScale = radius * 0.85;
  const appendageBodies = [];
  const lobeSpans = computeLobeSpans(digitGap);

  for (let i = 0; i < 4; i++) {
    const [tStart, tEnd] = lobeSpans[i];
    const inward = DIGIT_LOBE_INWARD[i];
    const lobeStart = anchorAt(tStart, inward);
    const lobeEnd   = anchorAt(tEnd,   inward);
    const baseBulge = (inward ? LOBE_BULGE_INWARD : LOBE_BULGE_OUTWARD) * bulgeScale;
    const bulge = baseBulge + rng.gauss(0, LOBE_BULGE_JITTER);

    const result = morseDigitArcAppendage({
      digit: digits[i],
      lobeStartPoint: lobeStart,
      lobeEndPoint: lobeEnd,
      ensoCenter: { x: cx, y: cy },
      ensoRadius: radius,
      scale: appendageScale,
      rng,
      bulge,
      inward,
      markSpread,
    });
    appendageBodies.push(result.body);
  }

  // WET-DROP -------------------------------------------------------------
  const bp0 = bodyGeo.bodyPoint(0);
  const bpEps = bodyGeo.bodyPoint(0.005);
  const tanAngle = Math.atan2(bpEps.y - bp0.y, bpEps.x - bp0.x);
  const wetDropSize = radius * WET_DROP_SIZE_FRAC;
  const wetDropPath = irregularBlob({
    cx: bp0.x,
    cy: bp0.y,
    size: wetDropSize,
    irregularity: 0.35,
    elongation: 0.30,
    rotationRad: tanAngle + Math.PI / 2,
    rng,
  });

  // FILTERS --------------------------------------------------------------
  const sizeScale = size / 480;
  const farStdDev  = INK_BLEED_FAR_STD_DEV  * sizeScale * bleedScale;
  const nearStdDev = INK_BLEED_NEAR_STD_DEV * sizeScale * bleedScale;
  const farOpacity  = INK_BLEED_FAR_OPACITY  * haloOpacity;
  const nearOpacity = INK_BLEED_NEAR_OPACITY * haloOpacity;
  const wobblePx = Math.max(0, liquidWobble) * sizeScale;
  const detail   = Math.max(0.005, liquidDetail);
  const idTag = ((rng.seed >>> 0).toString(36)) + '-' + number;
  const filterFarId   = `ink-bleed-far-${idTag}`;
  const filterNearId  = `ink-bleed-near-${idTag}`;
  const filterCrispId = `ink-crisp-${idTag}`;
  const turbSeedFar   = (rng.seed >>> 0) % 9973;
  const turbSeedNear  = ((rng.seed >>> 8) >>> 0) % 9973;
  const turbSeedCrisp = ((rng.seed >>> 16) >>> 0) % 9973;
  const FILTER_BOUNDS = 'x="-250%" y="-250%" width="600%" height="600%"';

  const defs = `
    <defs>
      <filter id="${filterFarId}" ${FILTER_BOUNDS}>
        <feGaussianBlur in="SourceGraphic" stdDeviation="${farStdDev.toFixed(2)}" result="blur" />
        <feTurbulence type="fractalNoise" baseFrequency="${detail.toFixed(4)}" numOctaves="2" seed="${turbSeedFar}" result="turb" />
        <feDisplacementMap in="blur" in2="turb" scale="${(wobblePx * 1.0).toFixed(2)}" />
      </filter>
      <filter id="${filterNearId}" ${FILTER_BOUNDS}>
        <feGaussianBlur in="SourceGraphic" stdDeviation="${nearStdDev.toFixed(2)}" result="blur" />
        <feTurbulence type="fractalNoise" baseFrequency="${(detail * 1.4).toFixed(4)}" numOctaves="2" seed="${turbSeedNear}" result="turb" />
        <feDisplacementMap in="blur" in2="turb" scale="${(wobblePx * 0.65).toFixed(2)}" />
      </filter>
      <filter id="${filterCrispId}" ${FILTER_BOUNDS}>
        <feTurbulence type="fractalNoise" baseFrequency="${(detail * 1.8).toFixed(4)}" numOctaves="2" seed="${turbSeedCrisp}" result="turb" />
        <feDisplacementMap in="SourceGraphic" in2="turb" scale="${(wobblePx * 0.30).toFixed(2)}" />
      </filter>
    </defs>
  `;

  // ASSEMBLE -------------------------------------------------------------
  // Three layers: far halo, near halo, crisp. Each layer paints the full
  // inkContent (lobes + wet-drop + enso). No animation masks — this is the
  // static port for choice tiles.
  const inkContent = [
    `<g class="appendages">${appendageBodies.join('')}</g>`,
    `<g class="wet-drop"><path d="${wetDropPath}" /></g>`,
    `<g class="enso"><path d="${ensoPath}" /></g>`,
  ].join('');

  const vbPad = size * vbPadFrac;
  const vbSize = size + 2 * vbPad;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', `${-vbPad} ${-vbPad} ${vbSize} ${vbSize}`);
  svg.setAttribute('width', String(vbSize));
  svg.setAttribute('height', String(vbSize));
  svg.setAttribute('overflow', 'visible');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('stroke', 'none');

  const crispFilterAttr = wobblePx > 0 ? ` filter="url(#${filterCrispId})"` : '';
  svg.innerHTML = [
    defs,
    `<g class="ink-halo ink-halo-far"  data-halo="true" filter="url(#${filterFarId})"  opacity="${farOpacity.toFixed(3)}">${inkContent}</g>`,
    `<g class="ink-halo ink-halo-near" data-halo="true" filter="url(#${filterNearId})" opacity="${nearOpacity.toFixed(3)}">${inkContent}</g>`,
    `<g class="ink-crisp"${crispFilterAttr} opacity="${crispOpacity.toFixed(3)}">${inkContent}</g>`,
  ].join('');

  return svg;
}
