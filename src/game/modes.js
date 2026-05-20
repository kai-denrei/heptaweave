// modes.js — ⧖ and ∞ rule packs.

import { MODE } from './state.js';

export const MODE_CONFIG = {
  [MODE.TIMED]: {
    symbol: '⧖',
    initialTimeMs: 60_000,
    penaltyMs: 10_000,
    // Wrong does NOT end the run; it deducts time. Run ends when time hits 0.
    endOnError: false,
    showTimerRing: true,
  },
  [MODE.ENDLESS]: {
    symbol: '∞',
    initialTimeMs: 0,
    penaltyMs: 0,
    // First wrong ends the run.
    endOnError: true,
    showTimerRing: false,
  },
};

export function isCleanResult({ mode, errors }) {
  // Clean = no errors during the run, regardless of how the run ended.
  return errors === 0;
}
