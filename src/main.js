// main.js — heptaweave rules engine. Wires landing → play → game-over loops
// together and drives an injected renderer (see render/renderer.js).
//
// This file owns: the store, round lifecycle, mode rules, the run clock,
// best-score persistence, and the install prompt. It never touches SVG or
// canvas — every pixel goes through `renderer`.
//
// External invariants:
//   • Best score per mode is persisted in localStorage and shared by themes.
//   • Optional `params` (see params.js) supplies test-mode rule overrides:
//     pinTier, choiceCount, sharedDigits, runSeconds, penaltySeconds.

import { createRng } from './util/rng.js';
import { buildRound } from './game/round.js';
import { MODE, PHASE, createStore } from './game/state.js';
import { MODE_CONFIG, isCleanResult, deepLinkFromHash } from './game/modes.js';

// ============================================================================
// Persistence helpers
// ============================================================================
const LS_BEST     = 'heptaweave.best';
const LS_INSTALL_DISMISSED = 'heptaweave.installHintDismissed';

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

function installHintDismissed() {
  try { return localStorage.getItem(LS_INSTALL_DISMISSED) === '1'; }
  catch { return false; }
}
function setInstallHintDismissed() {
  try { localStorage.setItem(LS_INSTALL_DISMISSED, '1'); } catch {}
}

// ============================================================================
// Install prompt — Chrome beforeinstallprompt + iOS Safari A2HS fallback
// ============================================================================
// We DON'T fire on first paint. The affordance is only revealed AFTER a run
// completes (game-over screen). Symbol-only ⤓ button; tapping it either
// invokes the deferred BIP (Android/Chrome) or — on iOS Safari where there's
// no BIP event — does nothing on click but the affordance itself acts as a
// gentle "this is installable" hint. Dismissal persists in localStorage.
let deferredInstallPrompt = null;
let isIosInstallable = false;

function detectIosInstallable() {
  const ua = (navigator.userAgent || '').toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isStandalone =
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
  const isSafari = isIos && /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
  return isSafari && !isStandalone;
}

function wireInstallCapture() {
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    deferredInstallPrompt = ev;
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setInstallHintDismissed();
    const btn = document.getElementById('installAffordance');
    if (btn) btn.hidden = true;
  });
  isIosInstallable = detectIosInstallable();
}

function maybeShowInstallAffordance() {
  const btn = document.getElementById('installAffordance');
  if (!btn) return;
  if (installHintDismissed()) { btn.hidden = true; return; }
  if (!deferredInstallPrompt && !isIosInstallable) { btn.hidden = true; return; }
  btn.hidden = false;
}

function wireInstallAffordance() {
  const btn = document.getElementById('installAffordance');
  if (!btn) return;
  btn.addEventListener('click', async (ev) => {
    ev.stopPropagation(); // don't bubble to gameover's "tap to return"
    if (deferredInstallPrompt) {
      const promptEv = deferredInstallPrompt;
      deferredInstallPrompt = null;
      try {
        promptEv.prompt();
        await promptEv.userChoice;
      } catch {}
      setInstallHintDismissed();
      btn.hidden = true;
    } else if (isIosInstallable) {
      setInstallHintDismissed();
      btn.hidden = true;
    }
  });
}

// ============================================================================
// Boot
// ============================================================================
export function boot({ renderer, params = null, onCornerHold = null, hash = '' }) {
  const P = (key, fallback) => {
    if (!params) return fallback;
    const v = params.get(key);
    return (v === undefined || v === null) ? fallback : v;
  };
  const delays = { ...{ correct: 380, wrongContinue: 700, wrongEnd: 600 }, ...(renderer.delays || {}) };

  const store = createStore({
    phase: PHASE.LANDING,
    mode: null,
    score: 0,
    errors: 0,
    timeRemainingMs: 0,
    totalTimeMs: 0,
    rng: createRng(0xdeadbeef),
    best: loadBest(),
    round: null,
    awaiting: false,
    count: 0,
  });

  let rafId = null;
  let lastTick = 0;
  let revealTimerId = null;

  function ruleOverrides() {
    return {
      pinTier: P('pinTier', -1),
      choiceCount: P('choiceCount', 0),
      sharedDigits: P('sharedDigits', -1),
    };
  }
  function modeTimes(mode) {
    const cfg = MODE_CONFIG[mode];
    if (mode !== MODE.TIMED) return { initialTimeMs: 0, penaltyMs: 0 };
    return {
      initialTimeMs: Math.round(P('runSeconds', cfg.initialTimeMs / 1000) * 1000),
      penaltyMs: Math.round(P('penaltySeconds', cfg.penaltyMs / 1000) * 1000),
    };
  }

  // --------------------------------------------------------------------------
  // Round lifecycle
  // --------------------------------------------------------------------------
  function startRound() {
    const s = store.get();
    const round = buildRound({ score: s.score, rng: s.rng, overrides: ruleOverrides() });
    store.set({ phase: PHASE.RENDER, round, awaiting: false });

    renderer.paintPrompt({
      number: round.target,
      seed: s.score + 1,
      revealMs: round.revealMs,
      mode: s.mode,
      timeRemainingMs: s.timeRemainingMs,
      totalMs: s.totalTimeMs,
    });
    renderer.renderChoices({ numbers: round.choices, seed: s.rng.seed, onPick });

    // Reveal — ask the renderer to start hiding after revealMs unless 0 (stays).
    if (revealTimerId) { clearTimeout(revealTimerId); revealTimerId = null; }
    if (round.revealMs > 0) {
      revealTimerId = setTimeout(() => {
        renderer.clearPrompt({ reason: 'reveal' });
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
    if (revealTimerId) { clearTimeout(revealTimerId); revealTimerId = null; }

    const correct = (number === s.round.target);
    renderer.feedback({ number, tileEl, correct });

    if (correct) {
      renderer.clearPrompt({ reason: 'correct' });
      const newScore = s.score + 1;
      store.set({ score: newScore });
      renderer.renderScore({ score: newScore, animateNewBit: true });
      setTimeout(() => {
        store.set({ awaiting: false });
        startRound();
      }, delays.correct);
      return;
    }

    store.set({ errors: s.errors + 1 });
    if (s.mode === MODE.ENDLESS) {
      // First error = game over.
      renderer.clearPrompt({ reason: 'end' });
      setTimeout(() => endRun(), delays.wrongEnd);
      return;
    }

    // ⧖ mode: deduct penalty. Run continues unless that pushes time ≤ 0.
    const { penaltyMs } = modeTimes(MODE.TIMED);
    const newRemaining = s.timeRemainingMs - penaltyMs;
    if (newRemaining <= 0) {
      store.set({ timeRemainingMs: 0 });
      renderer.clearPrompt({ reason: 'end' });
      setTimeout(() => endRun(), delays.wrongEnd);
    } else {
      store.set({ timeRemainingMs: newRemaining });
      renderer.clearPrompt({ reason: 'wrong' });
      setTimeout(() => {
        store.set({ awaiting: false });
        startRound();
      }, delays.wrongContinue);
    }
  }

  function endRun() {
    const s = store.get();
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (revealTimerId) { clearTimeout(revealTimerId); revealTimerId = null; }
    showGameOver({ mode: s.mode, score: s.score, errors: s.errors });
  }

  function showGameOver({ mode, score, errors }) {
    const best = { ...store.get().best };
    if (score > best[mode]) {
      best[mode] = score;
      saveBest(best);
    }
    store.set({ best, phase: PHASE.GAME_OVER });
    renderer.showGameOver({ mode, score, errors, clean: isCleanResult({ mode, errors }) });
    renderer.showScreen('gameover');
    maybeShowInstallAffordance();
  }

  // --------------------------------------------------------------------------
  // Mode entry + run clock
  // --------------------------------------------------------------------------
  function startGame(mode) {
    const { initialTimeMs } = modeTimes(mode);
    const seed = (Math.random() * 0x1_0000_0000) | 0;
    store.set({
      mode,
      score: 0,
      errors: 0,
      timeRemainingMs: initialTimeMs,
      totalTimeMs: initialTimeMs,
      rng: createRng(seed),
      awaiting: false,
      phase: PHASE.ROUND_INIT,
    });
    if (MODE_CONFIG[mode]?.counter) { startCount(mode, startGame.startedAt ?? null); startGame.startedAt = null; return; }
    renderer.startRun({ mode, totalMs: initialTimeMs });
    renderer.renderScore({ score: 0, animateNewBit: false });
    renderer.showScreen('play');
    lastTick = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    loop();
    startRound();
  }

  // The + mode: no rounds. A value that increments every `periodMs` from
  // zero and wraps at `wrapAt`; the renderer is told each time it changes.
  // Leaving is the renderer's hold gesture → backToLanding.
  let countStart = 0;       // performance.now() at which the count read 0
  let countEpoch = 0;       // the same instant as a Unix ms epoch (for links)
  function startCount(mode, startedAt = null) {
    const cfg = MODE_CONFIG[mode];
    const now = performance.now();
    // A deep link with `t=` resumes the count that was started then.
    countEpoch = (startedAt && startedAt <= Date.now()) ? startedAt : Date.now();
    countStart = now - (Date.now() - countEpoch);
    const value = Math.floor((now - countStart) / cfg.periodMs) % cfg.wrapAt;
    store.set({ phase: PHASE.COUNT, count: value });
    renderer.startRun({ mode, totalMs: 0 });
    renderer.showScreen('count');
    renderer.renderCount({ value, periodMs: cfg.periodMs, glyph: cfg.glyph });
    lastTick = now;
    if (rafId) cancelAnimationFrame(rafId);
    loop();
  }
  function countTick(now) {
    const s = store.get();
    const cfg = MODE_CONFIG[s.mode];
    const value = Math.floor((now - countStart) / cfg.periodMs) % cfg.wrapAt;
    if (value !== s.count) {
      store.set({ count: value });
      renderer.renderCount({ value, periodMs: cfg.periodMs, glyph: cfg.glyph });
    }
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = now - lastTick;
    lastTick = now;

    const s = store.get();
    if (s.phase === PHASE.GAME_OVER || s.phase === PHASE.LANDING) return;
    if (s.phase === PHASE.COUNT) { countTick(now); return; }

    let next = s.timeRemainingMs;
    if (s.mode === MODE.TIMED) {
      next = Math.max(0, s.timeRemainingMs - dt);
      if (next !== s.timeRemainingMs) store.set({ timeRemainingMs: next });
    }
    renderer.tick({
      dt, mode: s.mode, phase: s.phase,
      timeRemainingMs: next, totalMs: s.totalTimeMs,
    });
    if (s.mode === MODE.TIMED && next <= 0 && !s.awaiting) {
      // Stop the loop before endRun so we don't double-fire.
      cancelAnimationFrame(rafId); rafId = null;
      store.set({ awaiting: true });
      renderer.clearPrompt({ reason: 'end' });
      endRun();
    }
  }

  // --------------------------------------------------------------------------
  // Landing
  // --------------------------------------------------------------------------
  function backToLanding() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (revealTimerId) { clearTimeout(revealTimerId); revealTimerId = null; }
    renderer.teardown();
    store.set({ phase: PHASE.LANDING });
    renderer.showScreen('landing');
    const inst = document.getElementById('installAffordance');
    if (inst) inst.hidden = true;
  }

  // Deep links: a counter mode is addressable as `#countup1` / `#countup2`
  // (see MODE_CONFIG.deepLink). `deepLinkUrl()` is the URL of what is on
  // screen now; the landing has none, so it returns the bare page URL.
  function deepLinkUrl() {
    const s = store.get();
    const url = new URL(location.href);
    const link = (s.phase !== PHASE.LANDING && s.mode) ? MODE_CONFIG[s.mode]?.deepLink : null;
    // A running count links to its start instant, so the recipient sees the
    // same number ticking, not a fresh zero.
    url.hash = link ? `#${link}${s.phase === PHASE.COUNT ? `&t=${countEpoch}` : ''}` : '';
    return url.toString();
  }
  async function copyLink() {
    const url = deepLinkUrl();
    try { await navigator.clipboard.writeText(url); return true; }
    catch { return false; }
  }

  renderer.mount({
    root: document.body,
    on: {
      modeSelect: startGame,
      gameOverTap: backToLanding,
      countHold: backToLanding,
      cornerHold: onCornerHold,
      copyLink,
    },
  });
  wireInstallCapture();
  wireInstallAffordance();
  renderer.showScreen('landing');

  const linked = deepLinkFromHash(hash);
  if (linked && renderer.ok !== false) { startGame.startedAt = linked.startedAt; startGame(linked.mode); }

  return { store, startGame, backToLanding, deepLinkUrl };
}
