// difficulty.js — bit-milestone tiers.
//
// `difficultyFor(score)` returns `{ tier, revealMs, choiceCount, sharedDigits, magnitudeMatched }`.
//
// tier = bitlength(score). The table is the canonical first-pass spec.

const TABLE = [
  // tier 0 (score 0)
  { tier: 0, revealMs: 0,    choiceCount: 2, sharedDigits: 0, magnitudeMatched: false },
  // tier 1 (score 1)
  { tier: 1, revealMs: 0,    choiceCount: 3, sharedDigits: 0, magnitudeMatched: false },
  // tier 2 (score 2-3)
  { tier: 2, revealMs: 8000, choiceCount: 3, sharedDigits: 0, magnitudeMatched: false },
  // tier 3 (score 4-7)
  { tier: 3, revealMs: 6000, choiceCount: 4, sharedDigits: 1, magnitudeMatched: false },
  // tier 4 (score 8-15)
  { tier: 4, revealMs: 5000, choiceCount: 5, sharedDigits: 1, magnitudeMatched: false },
  // tier 5 (score 16-31)
  { tier: 5, revealMs: 4000, choiceCount: 5, sharedDigits: 2, magnitudeMatched: false },
  // tier 6 (score 32-63)
  { tier: 6, revealMs: 3000, choiceCount: 6, sharedDigits: 2, magnitudeMatched: false },
  // tier 7 (score 64-127)
  { tier: 7, revealMs: 2500, choiceCount: 7, sharedDigits: 3, magnitudeMatched: false },
  // tier 8 (score 128-255)
  { tier: 8, revealMs: 2000, choiceCount: 7, sharedDigits: 3, magnitudeMatched: false },
  // tier 9+ (score 256+)
  { tier: 9, revealMs: 1500, choiceCount: 7, sharedDigits: 3, magnitudeMatched: true  },
];

export function bitLength(n) {
  if (n <= 0) return 0;
  return Math.floor(Math.log2(n)) + 1;
}

export function difficultyFor(score) {
  const t = bitLength(score);
  if (t >= TABLE.length) return TABLE[TABLE.length - 1];
  return TABLE[t];
}

export const REVEAL_STAYS = 0;
