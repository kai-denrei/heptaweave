// round.js — pure helpers for picking a target + building a round config.

import { difficultyFor } from './difficulty.js';
import { pickChoices } from './distractors.js';

/**
 * Build the round payload for the current score.
 *
 * @param {Object} opts
 * @param {number} opts.score
 * @param {Object} opts.rng        — must have int(lo, hi) and shuffle()
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
export function buildRound({ score, rng }) {
  const diff = difficultyFor(score);
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
