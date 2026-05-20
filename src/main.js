// main.js — heptaweave entry. Wires landing → play → game-over loops together.
//
// External invariants:
//   • Public view shows ONLY ⧖, ∞, brush marks, ring, dots. No Latin chars
//     or Arabic numerals ever land in the DOM during play.
//   • A/B choice renderer toggle: 1-second hold on the bottom-right corner
//     of the landing screen flips between `choiceA` (lobes-only) and
//     `choiceB` (full mini). Persisted in localStorage so the choice survives
//     reloads.
//   • Best score per mode is also persisted in localStorage.

import { createRng } from './util/rng.js';
import { renderCistercianInk } from './cistercian/cistercianInk.js';
import { renderHeptapodNumeralV2 } from './heptacipher/numeralV2.js';
import { renderBinaryScore } from './render/binaryScore.js';
import { createTimerRing } from './render/timerRing.js';
import { renderGameOverDot } from './render/gameOverDot.js';
import { buildRound } from './game/round.js';
import { MODE, PHASE, createStore } from './game/state.js';
import { MODE_CONFIG, isCleanResult } from './game/modes.js';
import { buildInkFilters } from './ink/filters.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ============================================================================
// Persistence helpers
// ============================================================================
const LS_RENDERER = 'heptaweave.renderer';
const LS_BEST     = 'heptaweave.best';
const LS_TUNE     = 'heptaweave.tune';

/** Read tuning params written by scripts/tune.html. Returns {} if none. */
function loadTune() {
  try {
    const raw = localStorage.getItem(LS_TUNE);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function loadRenderer() {
  try { return localStorage.getItem(LS_RENDERER) === 'B' ? 'B' : 'A'; }
  catch { return 'A'; }
}
function saveRenderer(v) {
  try { localStorage.setItem(LS_RENDERER, v); } catch {}
}
function loadBest() {
  try {
    const raw = localStorage.getItem(LS_BEST);
    if (!raw) return { TIMED: 0, ENDLESS: 0 };
    const obj = JSON.parse(raw);
    return {
      TIMED:   Number(obj.TIMED || 0) | 0,
      ENDLESS: Number(obj.ENDLESS || 0) | 0,
    };
  } catch { return { TIMED: 0, ENDLESS: 0 }; }
}
function saveBest(best) {
  try { localStorage.setItem(LS_BEST, JSON.stringify(best)); } catch {}
}

// ============================================================================
// DOM refs
// ============================================================================
let els = null;
function gatherEls() {
  els = {
    landing:    document.getElementById('screenLanding'),
    play:       document.getElementById('screenPlay'),
    gameover:   document.getElementById('screenGameOver'),
    modeBtns:   document.querySelectorAll('.mode-btn'),
    abToggle:   document.getElementById('abToggle'),
    abIndicator:document.getElementById('abIndicator'),
    scoreRow:   document.getElementById('scoreRow'),
    timerWrap:  document.getElementById('timerRingWrap'),
    stage:      document.getElementById('cistercianStage'),
    choices:    document.getElementById('choices'),
    bigBinary:       document.getElementById('bigBinary'),
    bigHeptacipher:  document.getElementById('bigHeptacipher'),
    bigCistercian:   document.getElementById('bigCistercian'),
    gameDot:         document.getElementById('gameOverDot'),
  };
}

function showScreen(name) {
  els.landing.hidden  = (name !== 'landing');
  els.play.hidden     = (name !== 'play');
  els.gameover.hidden = (name !== 'gameover');
}

// ============================================================================
// Game state
// ============================================================================
const store = createStore({
  phase: PHASE.LANDING,
  mode: null,
  score: 0,
  errors: 0,
  timeRemainingMs: 0,
  totalTimeMs: 0,
  rng: createRng(0xdeadbeef),
  rendererPick: loadRenderer(),
  best: loadBest(),
  round: null, // { target, choices, revealMs, ... }
  awaiting: false,
});

let rafId = null;
let lastTick = 0;
let revealTimerId = null;
let timerRing = null;

// ============================================================================
// Score-row render
// ============================================================================
let lastBitCount = 0;
function renderScoreRow({ animateNewBit = false } = {}) {
  const s = store.get();
  const { groupEl, width } = renderBinaryScore({
    score: s.score,
    markSize: 18,
    rng: createRng(s.score + 1),
  });
  // Fixed 8-bit row, LSB-on-left. Group's leftmost bit sits at x=0, so we
  // anchor its left edge to the score-row container's left edge — no
  // translate needed.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `-12 -16 ${width + 24} 32`);
  svg.setAttribute('height', '28');
  svg.style.color = 'var(--ink)';
  // The "new bit" animation hooks into whichever bit just flipped from 0 to 1.
  // Detect via the bit that's now set but wasn't on the previous score.
  if (animateNewBit) {
    const prev = lastBitCount;
    const flipped = (s.score & ~prev);
    let bitIdx = -1;
    for (let i = 0; i < 8; i++) if ((flipped >> i) & 1) { bitIdx = i; break; }
    if (bitIdx >= 0) {
      const path = groupEl.querySelector(`path[data-bit-index="${bitIdx}"]`);
      if (path) path.classList.add('new-bit');
    }
  }
  svg.appendChild(groupEl);
  els.scoreRow.replaceChildren(svg);
  lastBitCount = s.score & 0xff;
}

// ============================================================================
// Big binary score for game-over
// ============================================================================
function renderBigBinary(score) {
  const { groupEl, width } = renderBinaryScore({
    score,
    markSize: 34,
    rng: createRng((score + 17) * 31),
  });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `-22 -24 ${width + 44} 48`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.appendChild(groupEl);
  els.bigBinary.replaceChildren(svg);
}

// Show the same score as a heptacipher logogram on the game-over screen.
function renderBigHeptacipher(score) {
  const tune = loadTune();
  const internalSize = 220;
  const svg = renderHeptapodNumeralV2({
    number: Math.max(0, Math.floor(score)) & 0xff,
    size: internalSize,
    seed: 0xfeedface ^ (score + 1) * 2654435761,
    ...HEPTAWEAVE_CHOICE_TUNE,
    ...tune,
  });
  els.bigHeptacipher.replaceChildren(svg);
}

// Show the same score as a Cistercian numeral on the game-over screen.
function renderBigCistercian(score) {
  const n = Math.max(0, Math.floor(score)) & 0xff;
  const size = 220;
  const rng = createRng((n + 1) * 991);
  const { segmentPaths } = renderCistercianInk({
    number: n,
    size,
    rng: createRng((n + 1) * 991),
    padFrac: 0.10,
    strokeWidthFrac: 0.022,
  });
  const filters = buildInkFilters({
    idTag: 'csc-go-' + ((n * 31) & 0xfffff).toString(36),
    size,
    bleedScale: 1.2,
    haloOpacity: 0.95,
    liquidWobble: 6,
    liquidDetail: 0.08,
    rng,
  });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.style.overflow = 'visible';
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML = filters.defs;
  svg.appendChild(defs);
  const inner = `<g fill="currentColor">${segmentPaths.map(d => `<path d="${d}"/>`).join('')}</g>`;
  svg.insertAdjacentHTML('beforeend', `
    <g filter="url(#${filters.farId})"   opacity="${filters.farOpacity}"  fill="currentColor">${inner}</g>
    <g filter="url(#${filters.nearId})"  opacity="${filters.nearOpacity}" fill="currentColor">${inner}</g>
    <g filter="url(#${filters.crispId})" opacity="0.92"                   fill="currentColor">${inner}</g>
  `);
  els.bigCistercian.replaceChildren(svg);
}

// ============================================================================
// Cistercian rendering pipeline (one SVG with full ink stack)
// ============================================================================
function renderCistercianStage(number, seedSalt = 1) {
  const stageBox = els.stage.getBoundingClientRect();
  const size = Math.min(stageBox.width, stageBox.height) || 360;
  const rng = createRng((number + 1) * 17 ^ seedSalt);

  const { groupEl, segmentPaths } = renderCistercianInk({
    number,
    size,
    rng: createRng((number + 1) * 17 ^ seedSalt),
    padFrac: 0.10,
    strokeWidthFrac: 0.022,
  });

  const filters = buildInkFilters({
    idTag: 'csc' + ((number * 31 + seedSalt) & 0xfffff).toString(36),
    size,
    bleedScale: 1.2,
    haloOpacity: 0.95,
    liquidWobble: 6,
    liquidDetail: 0.08,
    rng,
  });

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.style.overflow = 'visible';

  // Defs.
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML = filters.defs;
  svg.appendChild(defs);

  // Build three copies of the inner content (far halo, near halo, crisp).
  const inner = `<g fill="currentColor">${segmentPaths.map(d => `<path d="${d}"/>`).join('')}</g>`;
  // We can't easily clone the whole groupEl thrice without re-rendering, so
  // build via innerHTML — segmentPaths is already on hand.
  svg.insertAdjacentHTML('beforeend', `
    <g filter="url(#${filters.farId})"   opacity="${filters.farOpacity}"  fill="currentColor">${inner}</g>
    <g filter="url(#${filters.nearId})"  opacity="${filters.nearOpacity}" fill="currentColor">${inner}</g>
    <g filter="url(#${filters.crispId})" opacity="0.92"                   fill="currentColor">${inner}</g>
  `);

  els.stage.replaceChildren(svg);
  els.stage.classList.remove('fading', 'hidden');
}

// ============================================================================
// Choice tiles — cardinal-anchored layout
// ============================================================================
// Each tile sits at one of 8 compass directions from the Cistercian, on an
// orbit just outside the Cistercian's radius. Tile size is computed at render
// time so the worst-fitting tile (typically E/W on a phone) still has a
// clear gap from the Cistercian. No overlap on the prompt.
const CARDINAL_DIR = {
  N:  { ax:  0, ay: -1 },
  NE: { ax:  1, ay: -1 },
  E:  { ax:  1, ay:  0 },
  SE: { ax:  1, ay:  1 },
  S:  { ax:  0, ay:  1 },
  SW: { ax: -1, ay:  1 },
  W:  { ax: -1, ay:  0 },
  NW: { ax: -1, ay: -1 },
};

// Which cardinal positions to use per choice count. Picked for visual balance.
const CARDINAL_LAYOUT = {
  2: ['W', 'E'],
  3: ['N', 'SW', 'SE'],
  4: ['NW', 'NE', 'SW', 'SE'],
  5: ['N', 'NW', 'NE', 'SW', 'SE'],
  6: ['NW', 'NE', 'W', 'E', 'SW', 'SE'],
  7: ['N', 'NE', 'E', 'SE', 'SW', 'W', 'NW'],  // skip S
};

function cardinalPositions(count) {
  return CARDINAL_LAYOUT[count] ?? CARDINAL_LAYOUT[7];
}

// User-locked tuning from scripts/tune.html session 2026-05-20. These are the
// heptaweave-specific defaults; numeralV2 itself stays canonical (matches the
// original compositeFlow.js). localStorage.heptaweave.tune still wins, so the
// tune page remains usable to re-dial these later.
const HEPTAWEAVE_CHOICE_TUNE = {
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

function renderChoices(choiceNumbers, onPick) {
  const s = store.get();
  els.choices.className = 'choices cN-' + choiceNumbers.length;
  els.choices.replaceChildren();

  const mid = els.choices.parentElement.getBoundingClientRect();
  const cx = mid.width / 2;
  const cy = mid.height / 2;
  const N = choiceNumbers.length;
  const positions = cardinalPositions(N);
  const cistRect = els.stage.getBoundingClientRect();
  const cistercianR = (Math.min(cistRect.width, cistRect.height) || mid.width * 0.40) / 2;
  const margin = 4;
  const gap = 6; // air between cistercian rim and tile rim

  // For each cardinal direction, find the largest tile that fits:
  // - tile inner edge ≥ cistercian rim + gap (no overlap)
  // - tile outer edge ≤ container edge - margin (on-screen)
  // Use the most-constrained position to set ONE tile size for the whole set
  // so tiles are visually consistent.
  function maxTileForDir(ax, ay) {
    const norm = Math.hypot(ax, ay) || 1;
    const ux = ax / norm, uy = ay / norm;
    // Solve: tile center at (cx + r*ux, cy + r*uy), where r = orbit.
    // Constraint: tile must not overlap cistercian → r ≥ cistercianR + tileR + gap.
    // Constraint: tile must fit on screen along ux direction →
    //   |r*ux| + tileR ≤ (ux>0 ? cx : (mid.width - cx)) - margin  [horizontal]
    //   and similar vertical
    // Equivalently for symmetric center:
    //   r*|ux| + tileR ≤ cx - margin  (treating cx ≈ mid.width / 2)
    //   r*|uy| + tileR ≤ cy - margin
    // Substituting r = cistercianR + tileR + gap:
    //   (cistercianR + tileR + gap) * |ux| + tileR ≤ cx - margin
    //   tileR * (1 + |ux|) ≤ cx - margin - (cistercianR + gap) * |ux|
    //   tileR ≤ (cx - margin - (cistercianR + gap) * |ux|) / (1 + |ux|)
    const absUx = Math.abs(ux), absUy = Math.abs(uy);
    const tileR_x = (cx - margin - (cistercianR + gap) * absUx) / (1 + absUx);
    const tileR_y = (cy - margin - (cistercianR + gap) * absUy) / (1 + absUy);
    return 2 * Math.min(tileR_x, tileR_y);
  }

  // Smallest of all directions = shared tile size.
  let tileSize = Infinity;
  for (const key of positions) {
    const { ax, ay } = CARDINAL_DIR[key];
    tileSize = Math.min(tileSize, maxTileForDir(ax, ay));
  }
  tileSize = Math.floor(Math.max(80, Math.min(220, tileSize)));
  const tileR = tileSize / 2;

  // numeralV2 internal size such that rendered SVG width = tileSize.
  const tune = loadTune();
  const effPad = (tune.vbPadFrac ?? HEPTAWEAVE_CHOICE_TUNE.vbPadFrac ?? 0.10);
  const v2Internal = Math.round(tileSize / (1 + 2 * effPad));

  // Orbit radius = cistercian rim + half-tile + gap (no overlap).
  const orbit = cistercianR + tileR + gap;

  for (let i = 0; i < N; i++) {
    const n = choiceNumbers[i];
    const dir = CARDINAL_DIR[positions[i]];
    const norm = Math.hypot(dir.ax, dir.ay) || 1;
    const ux = dir.ax / norm, uy = dir.ay / norm;
    const px = cx + ux * orbit;
    const py = cy + uy * orbit;

    const tile = document.createElement('button');
    tile.className = 'choice-tile';
    tile.type = 'button';
    tile.style.width = `${tileSize}px`;
    tile.style.height = `${tileSize}px`;
    tile.style.left = `${px - tileR}px`;
    tile.style.top  = `${py - tileR}px`;

    // Don't expose the numeric answer in any attribute or textContent.
    const svg = renderHeptapodNumeralV2({
      number: n,
      size: v2Internal,
      seed: s.rng.seed ^ (n * 7919),
      ...HEPTAWEAVE_CHOICE_TUNE,
      ...tune,
    });
    tile.appendChild(svg);

    tile.addEventListener('click', () => onPick(n, tile));
    els.choices.appendChild(tile);
  }
}

// ============================================================================
// Timer ring (⧖ mode only)
// ============================================================================
function ensureTimerRing(remaining, total) {
  els.timerWrap.hidden = false;
  if (!timerRing) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 56 56');
    timerRing = createTimerRing({ cx: 28, cy: 28, radius: 24, strokeWidth: 4 });
    svg.appendChild(timerRing.el);
    els.timerWrap.replaceChildren(svg);
  }
  timerRing.update(remaining, total);
}
function teardownTimerRing() {
  els.timerWrap.hidden = true;
  els.timerWrap.replaceChildren();
  timerRing = null;
}

// ============================================================================
// Game-over screen
// ============================================================================
function showGameOver({ mode, score, errors }) {
  // Persist best.
  const best = { ...store.get().best };
  if (score > best[mode]) {
    best[mode] = score;
    saveBest(best);
  }
  store.set({ best });

  renderBigBinary(score);
  renderBigHeptacipher(score);
  renderBigCistercian(score);
  const clean = isCleanResult({ mode, errors });
  const dotPath = renderGameOverDot({
    clean,
    size: 48,
    rng: createRng((score + 1) * 311),
  });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-30 -30 60 60');
  svg.appendChild(dotPath);
  els.gameDot.replaceChildren(svg);

  showScreen('gameover');
  store.set({ phase: PHASE.GAME_OVER });
}

// ============================================================================
// Round lifecycle
// ============================================================================
function startRound() {
  const s = store.get();
  const round = buildRound({ score: s.score, rng: s.rng });
  store.set({ phase: PHASE.RENDER, round, awaiting: false });

  // Render Cistercian. Always rebuild even if score=0 so the first frame is right.
  renderCistercianStage(round.target, s.score + 1);

  // Wire choice picks.
  renderChoices(round.choices, onPick);

  // Reveal — start the fade after revealMs unless 0 (stays).
  if (revealTimerId) { clearTimeout(revealTimerId); revealTimerId = null; }
  if (round.revealMs > 0) {
    revealTimerId = setTimeout(() => {
      els.stage.classList.add('fading');
      revealTimerId = null;
    }, round.revealMs);
    store.set({ phase: PHASE.REVEAL });
  } else {
    store.set({ phase: PHASE.CHOOSE });
  }
}

function onPick(number, tileEl) {
  const s = store.get();
  if (s.awaiting) return;
  store.set({ awaiting: true });

  const correct = (number === s.round.target);
  if (correct) {
    tileEl.classList.add('correct');
    // Reveal the cistercian if still hidden, then advance.
    els.stage.classList.remove('fading', 'hidden');
    const newScore = s.score + 1;
    store.set({ score: newScore });
    renderScoreRow({ animateNewBit: true });
    setTimeout(() => {
      // Disable further tile clicks during the inter-round transition.
      store.set({ awaiting: false });
      startRound();
    }, 380);
  } else {
    tileEl.classList.add('wrong');
    const newErrors = s.errors + 1;
    store.set({ errors: newErrors });

    if (s.mode === MODE.ENDLESS) {
      // First error = game over.
      setTimeout(() => endRun({ reason: 'ERROR' }), 600);
    } else {
      // ⧖ mode: -10s. Run continues unless that pushes time ≤ 0.
      const cfg = MODE_CONFIG[MODE.TIMED];
      const newRemaining = s.timeRemainingMs - cfg.penaltyMs;
      if (newRemaining <= 0) {
        store.set({ timeRemainingMs: 0 });
        setTimeout(() => endRun({ reason: 'TIMEOUT' }), 600);
      } else {
        store.set({ timeRemainingMs: newRemaining });
        ensureTimerRing(newRemaining, s.totalTimeMs);
        // Continue to next round after a short delay so the shake/glow lands.
        setTimeout(() => {
          store.set({ awaiting: false });
          startRound();
        }, 700);
      }
    }
  }
}

function endRun({ reason }) {
  const s = store.get();
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (revealTimerId) { clearTimeout(revealTimerId); revealTimerId = null; }
  teardownTimerRing();
  showGameOver({ mode: s.mode, score: s.score, errors: s.errors });
}

// ============================================================================
// Mode entry
// ============================================================================
function startGame(mode) {
  const cfg = MODE_CONFIG[mode];
  const seed = (Math.random() * 0x1_0000_0000) | 0;
  store.set({
    mode,
    score: 0,
    errors: 0,
    timeRemainingMs: cfg.initialTimeMs,
    totalTimeMs: cfg.initialTimeMs,
    rng: createRng(seed),
    awaiting: false,
  });
  lastBitCount = 0;
  els.choices.replaceChildren();
  renderScoreRow();
  showScreen('play');
  if (cfg.showTimerRing) {
    ensureTimerRing(cfg.initialTimeMs, cfg.initialTimeMs);
  } else {
    teardownTimerRing();
  }
  lastTick = performance.now();
  loop();
  startRound();
}

function loop() {
  rafId = requestAnimationFrame(loop);
  const now = performance.now();
  const dt = now - lastTick;
  lastTick = now;

  const s = store.get();
  if (s.phase === PHASE.GAME_OVER || s.phase === PHASE.LANDING) return;

  if (s.mode === MODE.TIMED) {
    const next = Math.max(0, s.timeRemainingMs - dt);
    if (next !== s.timeRemainingMs) {
      store.set({ timeRemainingMs: next });
      ensureTimerRing(next, s.totalTimeMs);
    }
    if (next <= 0 && s.phase !== PHASE.GAME_OVER) {
      // Stop loop before triggering endRun so we don't get double-fired.
      cancelAnimationFrame(rafId); rafId = null;
      endRun({ reason: 'TIMEOUT' });
    }
  }
}

// ============================================================================
// Landing wiring
// ============================================================================
function backToLanding() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (revealTimerId) { clearTimeout(revealTimerId); revealTimerId = null; }
  teardownTimerRing();
  store.set({ phase: PHASE.LANDING });
  showScreen('landing');
  refreshAbIndicator();
}

function refreshAbIndicator() {
  const pick = store.get().rendererPick;
  els.abIndicator.classList.toggle('flipped', pick === 'B');
}

function wireLanding() {
  els.modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (!mode) return;
      startGame(mode);
    });
  });

  // A/B long-press toggle. 1000 ms anywhere on the bottom-right invisible area.
  let pressTimer = null;
  const start = () => {
    pressTimer = setTimeout(() => {
      const cur = store.get().rendererPick;
      const next = cur === 'A' ? 'B' : 'A';
      store.set({ rendererPick: next });
      saveRenderer(next);
      refreshAbIndicator();
      // Brief visual flash.
      els.abIndicator.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(3)' }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'ease-out' }
      );
      pressTimer = null;
    }, 1000);
  };
  const cancel = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };
  els.abToggle.addEventListener('pointerdown', start);
  els.abToggle.addEventListener('pointerup', cancel);
  els.abToggle.addEventListener('pointerleave', cancel);
  els.abToggle.addEventListener('pointercancel', cancel);
}

function wireGameOver() {
  // Tap anywhere on the game-over screen returns to landing.
  els.gameover.addEventListener('click', backToLanding);
}

// ============================================================================
// Boot
// ============================================================================
export function boot() {
  gatherEls();
  refreshAbIndicator();
  wireLanding();
  wireGameOver();
  showScreen('landing');
}
