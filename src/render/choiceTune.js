// choiceTune.js — heptaweave's project-level logogram tune, shared by themes.
//
// Layered defaults: canonical (numeralV2) → project (this file) → session
// (localStorage.heptaweave.tune, written by scripts/tune.html). Each layer
// overrides the one below without touching it.

export const LS_TUNE = 'heptaweave.tune';

// User-locked tuning from scripts/tune.html session 2026-05-20.
export const HEPTAWEAVE_CHOICE_TUNE = {
  gapAngleDeg: 82,
  gapWidthDeg: 46,
  bulgeScale: 0.45,
  lobeBulgeOutward: 0.44,
  lobeBulgeInward: 0.38,
  digitGap: 0.04,
  markSpread: 0.8,
  dotSizeFactor: 0.33,
  dashWidthFactor: 0.03,
  haloOpacity: 0.85,
  liquidWobble: 0.5,
  liquidDetail: 0.13,
  vbPadFrac: 0,
};

/** Read tuning params written by scripts/tune.html. Returns {} if none. */
export function loadTune() {
  try {
    const raw = localStorage.getItem(LS_TUNE);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** Project tune with the session layer applied. */
export function effectiveTune() {
  return { ...HEPTAWEAVE_CHOICE_TUNE, ...loadTune() };
}
