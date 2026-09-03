// presets.js — named presets that ship with the ink theme.
//
// Each entry is { name, diff } where `diff` is a params diff-vs-default (the
// same object a share URL carries). To ship a preset you tuned on your phone:
// copy the link, run `decodeDiff()` on its `p=` value (or just read the JSON
// dump in the test panel), and paste the object here. The first entry is the
// default look.

export const SHIPPED_PRESETS = [
  { name: 'default', diff: {} },
  {
    name: 'still water',
    diff: { flowStrength: 0.6, current: 40, holdMs: 1200, rampMs: 1500, filament: 0.9 },
  },
  {
    name: 'rapids',
    diff: { flowStrength: 2.0, current: 220, filament: 0.35, octaves: 4, holdMs: 200, rampMs: 300 },
  },
  {
    name: 'thick ink',
    diff: { strokeRadius: 0.02, strokeAmount: 0.6, bloomGain: 0.9, bloomMix: 1.6, caustic: 10 },
  },
];
