// morsePatterns.js — canonical digit → 5-mark morse-variant encoding.
//
// Copied from heptapod-logograms' morseDigitArc.js so it can be reused by
// both the lobe-arc renderer (Renderer B) and the lobes-only renderer
// (Renderer A) without circular imports.

export const PATTERNS = [
  ['-', '-', '-', '-', '-'], // 0
  ['.', '-', '-', '-', '-'], // 1
  ['.', '.', '-', '-', '-'], // 2
  ['.', '.', '.', '-', '-'], // 3
  ['.', '.', '.', '.', '-'], // 4
  ['.', '.', '.', '.', '.'], // 5
  ['-', '.', '.', '.', '.'], // 6
  ['-', '-', '.', '.', '.'], // 7
  ['-', '-', '-', '.', '.'], // 8
  ['-', '-', '-', '-', '.'], // 9
];

/**
 * Hash a 4-digit number into a unique key string used as identity for
 * distractor deduplication.
 */
export function fourDigit(n) {
  return String(Math.max(0, Math.min(9999, n | 0))).padStart(4, '0');
}

/** Return the per-digit-position array for a 0..9999 number: [thousands, hundreds, tens, units]. */
export function digitsOf(n) {
  return [
    Math.floor(n / 1000) % 10,
    Math.floor(n / 100) % 10,
    Math.floor(n / 10) % 10,
    n % 10,
  ];
}
