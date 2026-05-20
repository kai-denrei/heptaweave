// distractors.js — pick N-1 distractor numbers given target + closeness.
//
// `sharedDigits = K` means each distractor must share at least K positional
// digits with the target. K=0 = pure random. K=4 means the distractor IS the
// target (impossible), so we fall back to K=3.
//
// `magnitudeMatched=true` further constrains distractors to within ±25 % of
// the target's magnitude (used for tier 9+).

import { digitsOf } from '../heptacipher/morsePatterns.js';

function digitsMatchAtLeast(target, candidate, k) {
  if (target === candidate) return false; // candidate must differ
  const a = digitsOf(target);
  const b = digitsOf(candidate);
  let shared = 0;
  for (let i = 0; i < 4; i++) if (a[i] === b[i]) shared++;
  return shared >= k;
}

function magnitudeOk(target, candidate) {
  if (target === 0) return candidate <= 9; // small target — anything small
  const ratio = candidate / target;
  return ratio >= 0.75 && ratio <= 1.25;
}

/**
 * @param {Object} opts
 * @param {number} opts.target            — 0..9999
 * @param {number} opts.count             — total choices including target
 * @param {number} opts.sharedDigits      — K, 0..4
 * @param {boolean} [opts.magnitudeMatched=false]
 * @param {Object} opts.rng               — has int(lo, hi) and shuffle(arr)
 * @returns {number[]}                    — choices, target included, shuffled
 */
export function pickChoices({ target, count, sharedDigits, magnitudeMatched = false, rng }) {
  const need = count - 1;
  let k = Math.min(4, Math.max(0, sharedDigits));
  // K=4 always impossible; degrade.
  while (k > 3) k--;

  const seen = new Set([target]);
  const distractors = [];

  // Try to fill via rejection sampling at full K, then degrade K if we can't.
  let attempts = 0;
  let kTry = k;
  while (distractors.length < need && attempts < 4000) {
    attempts++;
    const cand = rng.int(0, 10000); // 0..9999 inclusive
    if (seen.has(cand)) continue;
    if (magnitudeMatched && !magnitudeOk(target, cand)) continue;
    if (kTry > 0 && !digitsMatchAtLeast(target, cand, kTry)) continue;
    seen.add(cand);
    distractors.push(cand);
    // After many attempts at this K, soften.
    if (attempts > 800 && kTry > 0) kTry--;
  }

  // Absolute fallback: top up with any numbers that aren't target.
  while (distractors.length < need) {
    const cand = rng.int(0, 10000);
    if (!seen.has(cand)) {
      seen.add(cand);
      distractors.push(cand);
    }
  }

  const choices = [target, ...distractors];
  return rng.shuffle(choices);
}
