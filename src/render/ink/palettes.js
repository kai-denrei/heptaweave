// palettes.js — dye palettes for the ink theme.
//
// Each palette is a list of RGB stops ordered bright core → cool tail; the
// display shader indexes a 256-entry LUT by a (core, density) coordinate.
// `core` is the stop the choice logograms and score marks are drawn in, so
// the overlay always matches the freshest ink.

export const PALETTES = [
  // Paper white ink on black water — heptaweave's sumi, inverted.
  { name: 'sumi',   stops: [[0xfb, 0xf7, 0xee], [0xa8, 0xab, 0xb4], [0x3a, 0x3c, 0x46], [0x0e, 0x0e, 0x13]] },
  // heptaweave's teal accent, cooling to deep sea.
  { name: 'teal',   stops: [[0xd9, 0xff, 0xf6], [0x79, 0xea, 0xd9], [0x1f, 0x6f, 0x78], [0x08, 0x16, 0x1e]] },
  // The dark-red error accent, warmed to an ember core.
  { name: 'ember',  stops: [[0xff, 0xe4, 0xb8], [0xf0, 0x9a, 0x4a], [0x8a, 0x3a, 0x2b], [0x1e, 0x0c, 0x0a]] },
  // Indigo dye.
  { name: 'indigo', stops: [[0xe6, 0xe9, 0xff], [0x8f, 0x9c, 0xf5], [0x3b, 0x3f, 0xa8], [0x0c, 0x0b, 0x26]] },
  // Moss.
  { name: 'moss',   stops: [[0xf1, 0xff, 0xd0], [0xb5, 0xe0, 0x6a], [0x2e, 0x7a, 0x4e], [0x07, 0x18, 0x12]] },
];

/** 256 × RGB float LUT (0..1) from a palette's stops. */
export function buildLut(stops) {
  const N = 256;
  const lut = new Float32Array(N * 3);
  const seg = stops.length - 1;
  for (let i = 0; i < N; i++) {
    const f = (i / (N - 1)) * seg;
    const a = Math.min(seg - 1, Math.floor(f));
    const t = f - a;
    const s0 = stops[a], s1 = stops[a + 1];
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = (s0[c] + (s1[c] - s0[c]) * t) / 255;
  }
  return lut;
}

/** RGB (0..1) at LUT coordinate `x` (0 = core, 1 = tail). */
export function sampleLut(lut, x) {
  const i = Math.max(0, Math.min(255, Math.round(x * 255)));
  return [lut[i * 3], lut[i * 3 + 1], lut[i * 3 + 2]];
}

/** CSS hex of the palette's core stop. */
export function coreCss(palette) {
  const [r, g, b] = palette.stops[0];
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** CSS hex of the palette's second stop (the glow colour for overlays). */
export function glowCss(palette) {
  const [r, g, b] = palette.stops[1];
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function paletteAt(index) {
  const i = Math.max(0, Math.min(PALETTES.length - 1, index | 0));
  return PALETTES[i];
}
