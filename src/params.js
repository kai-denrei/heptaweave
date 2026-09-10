// params.js — every tunable of the ink theme, live, in one place.
//
// One flat schema (same row shape as scripts/tune.html) drives the test
// panel, the presets, and the share URL. Values overlay at boot:
//   defaults ← localStorage[storageKey] ← location.hash `p=` (URL wins, but
//   is not persisted until `save()`).
//
// Consumers read with `get(key)` and subscribe with `on(fn)`; nothing here
// touches the DOM.

// [group, key, label, min, max, step, default]
export const SCHEMA = [
  // ---- fluid: the water itself ------------------------------------------
  ['fluid', 'flowStrength',  'flow strength',        0,     3,    0.05,  1.2],
  ['fluid', 'flowScale',     'flow scale',           0.4,   6,    0.1,   2.4],
  ['fluid', 'current',       'current (drift)',      10,    700,  5,     75],
  ['fluid', 'filament',      'filament width',       0.15,  1.75, 0.05,  0.6],
  ['fluid', 'octaves',       'noise octaves',        1,     5,    1,     3],
  ['fluid', 'simScale',      'sim resolution',       0.25,  1,    0.05,  0.5],
  ['fluid', 'idleDissip',    'idle fade / step',     0.95,  1,    0.001, 0.985],

  // ---- dissolve: the clock ----------------------------------------------
  ['dissolve', 'dissolveFloor',  'gone at density',      0.005, 0.2,  0.005, 0.02],
  ['dissolve', 'revealScale',    '∞ reveal × table',     0.25,  3,    0.05,  1],
  ['dissolve', 'holdMs',         'hold still (ms)',      0,     3000, 50,    600],
  ['dissolve', 'rampMs',         'ramp to flow (ms)',    0,     3000, 50,    800],
  ['dissolve', 'staysFlow',      'stays: drift',         0,     1,    0.05,  0.15],
  ['dissolve', 'staysReinkMs',   'stays: re-ink (ms)',   0,     5000, 100,   1500],
  ['dissolve', 'timedScale',     '⧖ dissolve × remaining', 0.1, 1,    0.05,  1],
  ['dissolve', 'flowRefSeconds', 'full current at (s)',  0.5,   20,   0.5,   4],
  ['dissolve', 'flowMin',        'slowest current ×',    0,     1,    0.05,  0.15],
  ['dissolve', 'diffuse',        'diffuse (spread)',     0,     1,    0.01,  0.2],
  ['dissolve', 'diffuseSpread',  'diffuse reach (texels)', 0.5, 4,    0.1,   1.5],

  // ---- paint: how the glyph is written ----------------------------------
  ['paint', 'traceMs',       'grow time (ms)',       100,   3000, 50,    700],
  ['paint', 'promptSize',    'prompt size',          0.2,   0.8,  0.01,  0.4],
  ['paint', 'strokeRadius',  'stroke radius',        0.004, 0.05, 0.001, 0.014],
  ['paint', 'strokeAmount',  'stroke ink',           0.05,  1,    0.01,  0.35],
  ['paint', 'taper',         'terminal taper',       0,     1,    0.05,  0.4],
  ['paint', 'wobble',        'wobble',               0,     2,    0.05,  0.25],

  // ---- layout: where the choices go -------------------------------------
  ['layout', 'layoutMode',    'layout 0=orbit 1=bands', 0,   1,    1,     1],
  ['layout', 'tileMax',       'tile max (px)',        80,    360,  4,     260],
  ['layout', 'tileGap',       'tile gap (px)',        0,     40,   1,     8],

  // ---- feedback: the pick reaction --------------------------------------
  ['feedback', 'splashAmount',     'splash ink',        0,     1,    0.01,  0.3],
  ['feedback', 'splashRadius',     'splash radius',     0.004, 0.04, 0.001, 0.012],
  ['feedback', 'correctDrainMs',   'correct drain (ms)', 0,    2000, 50,    500],
  ['feedback', 'wrongDrainMs',     'wrong drain (ms)',  0,     2000, 50,    600],
  ['feedback', 'drainDissip',      'drain fade / step', 0.8,   0.99, 0.005, 0.93],

  // ---- stage: the darkroom ----------------------------------------------
  ['stage', 'palette',        'palette',              0,     4,    1,     0],
  ['stage', 'bloomThreshold', 'bloom threshold',      0,     1,    0.01,  0.3],
  ['stage', 'bloomGain',      'core bloom',           0,     2,    0.05,  0.35],
  ['stage', 'bloomMix',       'halo bloom',           0,     3,    0.05,  0.7],
  ['stage', 'caustic',        'caustic',              0,     18,   0.5,   7],
  ['stage', 'grain',          'grain',                0,     0.2,  0.005, 0.05],
  ['stage', 'vignette',       'vignette',             0,     2.6,  0.05,  1.15],
  ['stage', 'baseLight',      'stage light',          0,     1.5,  0.05,  1],
  ['stage', 'timedDimming',   '⧖ dim by run end',     0,     1,    0.05,  0.7],

  // ---- count: the + mode's one big logogram -----------------------------
  ['count', 'countSize',      'numeral extent (of short side)', 0.3, 1, 0.01, 0.8],
  ['count', 'countInk',       'numeral ink',          0.05,  1,    0.01,  0.22],
  ['count', 'countTrace',     'grow time (ms)',       100,   900,  10,    320],
  ['count', 'countLife',      'old ink gone after (s)', 0.3, 3,    0.05,  0.9],
  ['count', 'countFlow',      'current ×',            0,     3,    0.05,  0.7],
  ['count', 'countPin',       'ring pin / frame',     0.01,  0.5,  0.01,  0.08],
  ['count', 'countReveal',    'new digit 0=dims 1=grows', 0, 1,    1,     1],
  ['count', 'countBreathe',   'breathe (size %)',     0,     8,    0.1,   2],
  ['count', 'countBreatheS',  'breathe period (s)',   2,     40,   0.5,   11],

  // ---- countC: the left +, a Cistercian glyph per second -----------------
  ['countC', 'countCSize',    'glyph size',           0.25,  0.9,  0.01,  0.7],
  ['countC', 'countCTrace',   'grow time (ms)',       100,   900,  10,    320],
  ['countC', 'countCRamp',    'ramp to flow (ms)',    0,     600,  10,    150],
  ['countC', 'countCLife',    'gone after (s)',       0.3,   3,    0.05,  0.9],
  ['countC', 'countCFlow',    'current ×',            0,     3,    0.05,  1.2],
  ['countC', 'countCInk',     'stroke ink ×',         0.2,   1.5,  0.05,  0.8],

  // ---- lab: experiments behind the hidden gear (top-right) ----------------
  ['lab', 'inverted',      'inverted: black ink, clear ground', 0, 1, 1, 1],
  ['lab', 'surface',       'water surface (ripples)', 0,   1,    1,     1],
  ['lab', 'rippleRefract', 'ripple refraction',    0,     3,    0.05,  1],
  ['lab', 'rippleDamp',    'ripple damping',       0.95,  0.999, 0.001, 0.986],
  ['lab', 'rippleAmbient', 'ambient ripples / min', 0,    60,   1,     12],
  ['lab', 'rippleTouch',   'touch ripple',         0,     2,    0.05,  0.6],
  ['lab', 'glyphMix',      'ring-stave numeral (Cistercian × heptaweave)', 0, 1, 1, 0],

  // ---- result: the game-over score, in ink -----------------------------
  ['result', 'resultInk',      'score ink',            0.05,  1,    0.01,  0.3],
  ['result', 'resultPin',      'pin / frame',          0.01,  0.5,  0.01,  0.06],
  ['result', 'resultBreathe',  'hover (size %)',       0,     8,    0.1,   1.5],
  ['result', 'resultBreatheS', 'hover period (s)',     2,     40,   0.5,   9],

  // ---- rules: test-mode overrides (−1 / 0 = use the table) --------------
  ['rules', 'pinTier',        'pin tier (−1 = off)',  -1,    9,    1,     -1],
  ['rules', 'choiceCount',    'choices (0 = table)',  0,     7,    1,     0],
  ['rules', 'sharedDigits',   'shared digits (−1 = table)', -1, 3, 1,   -1],
  ['rules', 'runSeconds',     '⧖ run seconds',        10,    180,  5,     60],
  ['rules', 'penaltySeconds', '⧖ wrong penalty (s)',  0,     30,   1,     10],
];

export const DEFAULTS = Object.freeze(Object.fromEntries(SCHEMA.map(r => [r[1], r[6]])));
const KEYS = new Set(SCHEMA.map(r => r[1]));

// ----------------------------------------------------------------------------
// Codec — diff-vs-default ⇄ base64url JSON, for the share URL.
// ----------------------------------------------------------------------------
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Keep only known keys with finite numeric values. */
export function sanitizeDiff(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (!KEYS.has(k)) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export function encodeDiff(diff) {
  const clean = sanitizeDiff(diff);
  return Object.keys(clean).length ? b64urlEncode(JSON.stringify(clean)) : '';
}

export function decodeDiff(str) {
  if (!str) return {};
  try { return sanitizeDiff(JSON.parse(b64urlDecode(str))); }
  catch { return {}; }
}

/** Pull the `p=` value out of a hash string like '#p=abc' or '#test&p=abc'. */
export function diffFromHash(hash) {
  const h = (hash || '').replace(/^#/, '');
  for (const part of h.split('&')) {
    if (part.startsWith('p=')) return decodeDiff(part.slice(2));
  }
  return {};
}

// ----------------------------------------------------------------------------
// Dissolve math — per-step dissipation so density reaches `floor` after
// `seconds` at 60 steps/s. Used for both the ∞ reveal clock and the ⧖ run
// clock. Returns 1 (no fade) for non-positive durations.
// ----------------------------------------------------------------------------
export function dissipFor(seconds, floor = 0.02, stepsPerSecond = 60) {
  if (!(seconds > 0)) return 1;
  const steps = seconds * stepsPerSecond;
  return Math.pow(Math.max(1e-6, Math.min(0.999, floor)), 1 / steps);
}

// ----------------------------------------------------------------------------
// Live params
// ----------------------------------------------------------------------------
export function createParams({ storageKey = 'heptaweave.ink.params', hash = '', storage = null } = {}) {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  let values = { ...DEFAULTS };
  const listeners = new Set();

  function readSaved() {
    if (!store) return {};
    try { return sanitizeDiff(JSON.parse(store.getItem(storageKey) || '{}')); }
    catch { return {}; }
  }

  // Boot overlay: defaults ← saved ← hash.
  Object.assign(values, readSaved(), diffFromHash(hash));

  function emit(key) { for (const fn of listeners) fn(key, values[key], values); }

  return {
    get(key) { return values[key]; },
    set(key, v) {
      if (!KEYS.has(key)) return;
      const n = Number(v);
      if (!Number.isFinite(n) || values[key] === n) return;
      values[key] = n;
      emit(key);
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    all() { return { ...values }; },
    /** Values that differ from the defaults. */
    diff() {
      const out = {};
      for (const k of KEYS) if (values[k] !== DEFAULTS[k]) out[k] = values[k];
      return out;
    },
    /** Replace the live set with defaults + diff. */
    load(diff) {
      values = { ...DEFAULTS, ...sanitizeDiff(diff) };
      emit(null);
    },
    reset() { this.load({}); },
    save() {
      if (!store) return;
      try { store.setItem(storageKey, JSON.stringify(this.diff())); } catch {}
    },
    shareHash() {
      const enc = encodeDiff(this.diff());
      return enc ? `p=${enc}` : '';
    },
  };
}
