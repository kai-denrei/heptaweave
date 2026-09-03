// round.js — pure helpers for picking a target + building a round config.

import { difficultyFor } from './difficulty.js';
import { pickChoices } from './distractors.js';

// Score that lands exactly on tier `t` (tier = bitlength(score)). Tier 0 → 0.
function scoreForTier(t) {
  return t <= 0 ? 0 : (1 << (t - 1));
}

/**
 * Build the round payload for the current score.
 *
 * @param {Object} opts
 * @param {number} opts.score
 * @param {Object} opts.rng        — must have int(lo, hi) and shuffle()
 * @param {Object} [opts.overrides] — test-mode overrides. `pinTier` (−1 = off)
 *   replaces the score-derived tier; `choiceCount` (0 = table) and
 *   `sharedDigits` (−1 = table) replace the table's levers.
 * @returns {{
 *   target: number,
 *   choices: number[],
 *   revealMs: number,
 *   tier: number,
 *   choiceCount: number,
 *   sharedDigits: number,
 *   magnitudeMatched: boolean,
 * }}
 */
export function buildRound({ score, rng, overrides = {} }) {
  const pin = overrides.pinTier ?? -1;
  const base = difficultyFor(pin >= 0 ? scoreForTier(pin) : score);
  const diff = {
    ...base,
    choiceCount: (overrides.choiceCount > 0) ? Math.min(7, overrides.choiceCount | 0) : base.choiceCount,
    sharedDigits: (overrides.sharedDigits >= 0) ? Math.min(3, overrides.sharedDigits | 0) : base.sharedDigits,
  };
  const target = rng.int(0, 10000); // 0..9999 inclusive
  const choices = pickChoices({
    target,
    count: diff.choiceCount,
    sharedDigits: diff.sharedDigits,
    magnitudeMatched: diff.magnitudeMatched,
    rng,
  });
  return {
    target,
    choices,
    revealMs: diff.revealMs,
    tier: diff.tier,
    choiceCount: diff.choiceCount,
    sharedDigits: diff.sharedDigits,
    magnitudeMatched: diff.magnitudeMatched,
  };
}
