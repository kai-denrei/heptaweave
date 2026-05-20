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
    bigBinary:  document.getElementById('bigBinary'),
    gameDot:    document.getElementById('gameOverDot'),
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
  const { groupEl, width, bitCount } = renderBinaryScore({
    score: s.score,
    markSize: 18,
    rng: createRng(s.score + 1),
  });
  // Build SVG host. The score row anchors its right edge at x=0 in user-space,
  // so we shift the inner group right by `width` to keep MSB at the row's left.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 -16 ${Math.max(40, width + 8)} 32`);
  svg.setAttribute('height', '28');
  svg.style.color = 'var(--ink)';
  groupEl.setAttribute('transform', `translate(${width}, 0)`);
  // Mark newly-added MSB bit for pop animation (only when a new bit appears).
  if (animateNewBit && bitCount > lastBitCount) {
    const first = groupEl.querySelector('path[data-bit-index="0"]');
    if (first) first.classList.add('new-bit');
  }
  svg.appendChild(groupEl);
  els.scoreRow.replaceChildren(svg);
  lastBitCount = bitCount;
}

// ============================================================================
// Big binary score for game-over
// ============================================================================
function renderBigBinary(score) {
  const { groupEl, width } = renderBinaryScore({
    score,
    markSize: 44,
    rng: createRng((score + 17) * 31),
  });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 -32 ${Math.max(60, width + 8)} 64`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  groupEl.setAttribute('transform', `translate(${width}, 0)`);
  svg.appendChild(groupEl);
  els.bigBinary.replaceChildren(svg);
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
// Choice tiles — organic quincunx layout
// ============================================================================
// Per-count tile size and position presets. Positions are normalized offsets
// from play-mid center, where (-1, -1) is the top-left of the available area
// and (+1, +1) is the bottom-right. The presets approximate the mockup's
// uneven quincunx feel — choices nestle close to the central Cistercian, not
// forced onto a perfect circle.
const LAYOUT_PRESETS = {
  2: { tile: 240, slots: [
    { ox: -0.55, oy:  0.00 }, // left
    { ox: +0.55, oy:  0.00 }, // right
  ]},
  3: { tile: 230, slots: [
    { ox:  0.00, oy: -0.50 }, // top
    { ox: -0.55, oy:  0.25 }, // bottom-left
    { ox: +0.55, oy:  0.25 }, // bottom-right
  ]},
  4: { tile: 215, slots: [
    { ox: -0.50, oy: -0.35 }, // top-left
    { ox: +0.50, oy: -0.35 }, // top-right
    { ox: -0.50, oy:  0.35 }, // bottom-left
    { ox: +0.50, oy:  0.35 }, // bottom-right
  ]},
  5: { tile: 200, slots: [
    { ox: -0.45, oy: -0.38 }, // top-left
    { ox: +0.45, oy: -0.38 }, // top-right
    { ox: -0.55, oy:  0.08 }, // mid-left
    { ox: +0.55, oy:  0.08 }, // mid-right
    { ox:  0.00, oy:  0.52 }, // bottom-center
  ]},
  6: { tile: 185, slots: [
    { ox: -0.50, oy: -0.40 }, // top-left
    { ox: +0.50, oy: -0.40 }, // top-right
    { ox: -0.58, oy:  0.05 }, // mid-left
    { ox: +0.58, oy:  0.05 }, // mid-right
    { ox: -0.28, oy:  0.50 }, // bottom-left
    { ox: +0.28, oy:  0.50 }, // bottom-right
  ]},
  7: { tile: 175, slots: [
    { ox:  0.00, oy: -0.55 }, // top-center
    { ox: -0.52, oy: -0.30 }, // upper-left
    { ox: +0.52, oy: -0.30 }, // upper-right
    { ox: -0.60, oy:  0.15 }, // mid-left
    { ox: +0.60, oy:  0.15 }, // mid-right
    { ox: -0.30, oy:  0.55 }, // lower-left
    { ox: +0.30, oy:  0.55 }, // lower-right
  ]},
};

function pickLayout(count) {
  return LAYOUT_PRESETS[count] ?? LAYOUT_PRESETS[7];
}

function renderChoices(choiceNumbers, onPick) {
  const s = store.get();
  els.choices.className = 'choices cN-' + choiceNumbers.length;
  els.choices.replaceChildren();

  const mid = els.choices.parentElement.getBoundingClientRect();
  const cx = mid.width / 2;
  const cy = mid.height / 2;
  const N = choiceNumbers.length;
  const preset = pickLayout(N);

  // Scale tile so it fits the viewport. The preset's `tile` is the desired
  // size; on small phones it may need to shrink.
  let tileSize = preset.tile;
  const maxTileFromBox = Math.min(mid.width * 0.45, mid.height * 0.30);
  if (tileSize > maxTileFromBox) tileSize = Math.max(140, Math.round(maxTileFromBox));
  const tileR = tileSize / 2;
  // numeralV2 with vbPadFrac=0.10 returns an SVG sized at internal * 1.20.
  // Pick internal so the SVG renders at exactly tileSize.
  const v2Internal = Math.round(tileSize / 1.20);

  // Available extent for tile centers. Slot offsets (-1..+1) map onto this.
  const halfW = Math.max(0, cx - tileR - 4);
  const halfH = Math.max(0, cy - tileR - 4);

  // Per-round angular/positional jitter for organic feel.
  const jitterRng = createRng((s.rng.seed ^ 0xa11ce) >>> 0);

  for (let i = 0; i < N; i++) {
    const n = choiceNumbers[i];
    const slot = preset.slots[i];
    const jx = jitterRng.gauss(0, 0.018);
    const jy = jitterRng.gauss(0, 0.018);
    const px = cx + (slot.ox + jx) * halfW;
    const py = cy + (slot.oy + jy) * halfH;

    const tile = document.createElement('button');
    tile.className = 'choice-tile';
    tile.type = 'button';
    tile.style.width = `${tileSize}px`;
    tile.style.height = `${tileSize}px`;
    tile.style.left = `${px - tileR}px`;
    tile.style.top  = `${py - tileR}px`;

    // Don't expose the numeric answer in any attribute or textContent.
    // vbPadFrac 0.10 (vs canonical 0.30) lets the glyph dominate the tile —
    // chosen so choice glyphs read at a comparable visual scale to the
    // Cistercian without breaking V2's other proportions.
    const svg = renderHeptapodNumeralV2({
      number: n,
      size: v2Internal,
      seed: s.rng.seed ^ (n * 7919),
      vbPadFrac: 0.10,
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
