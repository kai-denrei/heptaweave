// filters.js — sumi-on-rice-paper SVG filter defs.
//
// Two-layer halo (far + near Gaussian blur) plus a crisp displacement-mapped
// layer. Each glyph renders its visible group three times: far-soak, near-soak,
// crisp. The result reads as wet ink soaking into paper fibres.
//
// `buildInkFilters({ idTag, size, bleedScale, haloOpacity, liquidWobble,
//                    liquidDetail, rng })` returns:
//   { defs, farId, nearId, crispId, farOpacity, nearOpacity }
//
// All deviations are tuned at size=480 and scale linearly.

const INK_BLEED_FAR_STD_DEV  = 8.0;
const INK_BLEED_FAR_OPACITY  = 0.42;
const INK_BLEED_NEAR_STD_DEV = 2.4;
const INK_BLEED_NEAR_OPACITY = 0.62;

// Generous filter region so heavy bleed never gets clipped at the bbox.
const FILTER_BOUNDS = 'x="-250%" y="-250%" width="600%" height="600%"';

export function buildInkFilters({
  idTag,
  size = 480,
  bleedScale = 1,
  haloOpacity = 1,
  liquidWobble = 0,
  liquidDetail = 0.04,
  rng,
}) {
  const sizeScale = size / 480;
  const farStdDev  = INK_BLEED_FAR_STD_DEV  * sizeScale * bleedScale;
  const nearStdDev = INK_BLEED_NEAR_STD_DEV * sizeScale * bleedScale;
  const farOpacity  = INK_BLEED_FAR_OPACITY  * haloOpacity;
  const nearOpacity = INK_BLEED_NEAR_OPACITY * haloOpacity;
  const wobblePx = Math.max(0, liquidWobble) * sizeScale;
  const detail   = Math.max(0.005, liquidDetail);

  const farId   = `ink-bleed-far-${idTag}`;
  const nearId  = `ink-bleed-near-${idTag}`;
  const crispId = `ink-crisp-${idTag}`;

  // Per-seed turbulence offsets keep the wet-edge shape from looking identical
  // between renders that share the same overall geometry.
  const seedFar   = rng ? (rng.seed >>> 0) % 9973         : 1;
  const seedNear  = rng ? ((rng.seed >>> 8) >>> 0) % 9973 : 2;
  const seedCrisp = rng ? ((rng.seed >>> 16) >>> 0) % 9973: 3;

  const defs = `
    <filter id="${farId}" ${FILTER_BOUNDS}>
      <feGaussianBlur in="SourceGraphic" stdDeviation="${farStdDev.toFixed(2)}" result="blur" />
      <feTurbulence type="fractalNoise" baseFrequency="${detail.toFixed(4)}" numOctaves="2" seed="${seedFar}" result="turb" />
      <feDisplacementMap in="blur" in2="turb" scale="${(wobblePx * 1.0).toFixed(2)}" />
    </filter>
    <filter id="${nearId}" ${FILTER_BOUNDS}>
      <feGaussianBlur in="SourceGraphic" stdDeviation="${nearStdDev.toFixed(2)}" result="blur" />
      <feTurbulence type="fractalNoise" baseFrequency="${(detail * 1.4).toFixed(4)}" numOctaves="2" seed="${seedNear}" result="turb" />
      <feDisplacementMap in="blur" in2="turb" scale="${(wobblePx * 0.65).toFixed(2)}" />
    </filter>
    <filter id="${crispId}" ${FILTER_BOUNDS}>
      <feTurbulence type="fractalNoise" baseFrequency="${(detail * 1.8).toFixed(4)}" numOctaves="2" seed="${seedCrisp}" result="turb" />
      <feDisplacementMap in="SourceGraphic" in2="turb" scale="${(wobblePx * 0.30).toFixed(2)}" />
    </filter>
  `;

  return { defs, farId, nearId, crispId, farOpacity, nearOpacity };
}
