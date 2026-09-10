// modes.js — ⧖, ∞ and + rule packs.

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
  // + is not a game: one large logogram counting up from zero, one per
  // second, wrapping at the four-digit ceiling. No score, no choices.
  [MODE.COUNT]: {
    symbol: '+',
    initialTimeMs: 0,
    penaltyMs: 0,
    endOnError: false,
    showTimerRing: false,
    counter: true,
    glyph: 'heptaweave',
    periodMs: 1000,
    wrapAt: 10000,
    deepLink: 'countup2',
  },
  // The left +: the same counter drawn as the ∞ prompt's Cistercian glyph,
  // traced and dissolved inside each second.
  [MODE.COUNT_C]: {
    symbol: '+',
    initialTimeMs: 0,
    penaltyMs: 0,
    endOnError: false,
    showTimerRing: false,
    counter: true,
    glyph: 'cistercian',
    periodMs: 1000,
    wrapAt: 10000,
    deepLink: 'countup1',
  },
};

/** The mode a `#hash` (e.g. '#countup1&admin') deep-links to, or null. */
export function modeFromHash(hash) {
  const parts = (hash || '').replace(/^#/, '').split('&');
  for (const [mode, cfg] of Object.entries(MODE_CONFIG)) {
    if (cfg.deepLink && parts.includes(cfg.deepLink)) return mode;
  }
  return null;
}

export function isCleanResult({ mode, errors }) {
  // Clean = no errors during the run, regardless of how the run ended.
  return errors === 0;
}
