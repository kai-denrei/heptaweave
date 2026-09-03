// inkRenderer.js — the darkroom / dissolving-ink theme.
//
// The prompt glyph is painted into a WebGL dye field (fluid.js) by the glyph
// painter and left to the current. Its dissolution is the clock:
//   ⧖  dissipation is derived from the time remaining in the run when the
//      glyph is painted, so it is gone exactly when the run would end; the
//      stage light dims across the run; a wrong answer is a drain pulse.
//   ∞  dissipation is derived from the tier's revealMs; "stays" tiers drift
//      without fading and are re-inked periodically.
// Choices are overlaid SVG logograms in the palette's core colour; the
// tapped one is splatted into the fluid as the reaction (correct = core
// colour bloom, wrong = ember splash + drain).
//
// Choreography per glyph: PAINT (still water, no fade) → HOLD → RAMP (ease
// current + dissipation in) → FLOW. Nothing fades until the whole glyph is
// on the page.
//
// Owns the DOM in ink.html and its own animation loop (the fluid must move
// on landing and game-over too). Never reads rules; every number it needs
// arrives through the Renderer contract or `params`.

import { createRng } from '../../util/rng.js';
import { renderHeptapodNumeralV2 } from '../../heptacipher/numeralV2.js';
import { renderCistercianInk } from '../../cistercian/cistercianInk.js';
import { renderBinaryScore } from '../binaryScore.js';
import { renderGameOverDot } from '../gameOverDot.js';
import { layoutChoices } from '../choiceLayout.js';
import { HEPTAWEAVE_CHOICE_TUNE, loadTune } from '../choiceTune.js';
import { noopRenderer } from '../renderer.js';
import { createFluid } from './fluid.js';
import { createPainter } from './glyphPainter.js';
import { PALETTES, paletteAt, sampleLut, coreCss, glowCss } from './palettes.js';
import { dissipFor } from '../../params.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EMBER = [0.66, 0.23, 0.17];  // wrong-answer dye (heptaweave's dark red)
const FIXED = 1 / 60;

function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

export function createInkRenderer({ params }) {
  let els = null;
  let fluid = null;
  let painter = null;
  let rafId = null;
  let lastNow = 0;
  let acc = 0;
  let lastBitCount = 0;

  // Choreography.
  let phase = 'idle';          // idle | paint | hold | ramp | flow
  let phaseStart = 0;
  let glyph = null;            // { number, seed, mode, revealMs, dissip, stays }
  let drainUntil = 0;
  let drainDissip = 0.93;
  let lastReink = 0;
  let screen = 'landing';
  let run = { mode: null, timeRemainingMs: 0, totalMs: 0 };
  let wispAcc = 0;
  const debug = { frames: 0, steps: 0, firstNow: 0, lastNow: 0, get phase() { return phase; }, get dissip() { return glyph ? glyph.dissip : null; } };

  // --------------------------------------------------------------------------
  // Palette → CSS
  // --------------------------------------------------------------------------
  function applyPalette() {
    const idx = params.get('palette') | 0;
    fluid.setPalette(idx);
    const pal = paletteAt(idx);
    document.documentElement.style.setProperty('--ink', coreCss(pal));
    document.documentElement.style.setProperty('--glow', glowCss(pal));
  }
  function coreRgb() { return sampleLut(fluid.lut, 0.02); }

  // --------------------------------------------------------------------------
  // Prompt box (where the glyph is painted; also the choice layout's centre)
  // --------------------------------------------------------------------------
  function promptBox() {
    const mid = els.playMid.getBoundingClientRect();
    const size = Math.min(mid.width, mid.height) * params.get('promptSize');
    return {
      x: mid.left + (mid.width - size) / 2,
      y: mid.top + (mid.height - size) / 2,
      w: size, h: size,
    };
  }

  // --------------------------------------------------------------------------
  // Flow config per phase
  // --------------------------------------------------------------------------
  function baseFlow() {
    return {
      flowScale: params.get('flowScale'),
      current: params.get('current'),
      curlE: params.get('filament'),
      octaves: params.get('octaves'),
    };
  }

  function targetDissip() {
    if (!glyph) return params.get('idleDissip');
    if (glyph.stays) return 1;
    return glyph.dissip;
  }
  // Current scales with the clock: a glyph with a long life drifts slowly,
  // one with seconds left unspools fast. `flowRefSeconds` is the dissolve
  // time at which the current runs at full `flowStrength`.
  function targetFlowStr() {
    const f = params.get('flowStrength');
    if (!glyph) return f * 0.6;
    if (glyph.stays) return f * params.get('staysFlow');
    const ref = params.get('flowRefSeconds');
    const factor = Math.max(params.get('flowMin'), Math.min(3, ref / Math.max(0.1, glyph.seconds)));
    return f * factor;
  }

  function stepConfig(now) {
    const cfg = baseFlow();
    if (phase === 'paint' || phase === 'hold') {
      cfg.dissip = 1; cfg.flowStr = 0;
    } else if (phase === 'ramp') {
      const t = easeInOut(Math.min(1, (now - phaseStart) / Math.max(1, params.get('rampMs'))));
      cfg.dissip = 1 + (targetDissip() - 1) * t;
      cfg.flowStr = targetFlowStr() * t;
    } else if (phase === 'flow') {
      cfg.dissip = targetDissip(); cfg.flowStr = targetFlowStr();
    } else {
      cfg.dissip = params.get('idleDissip'); cfg.flowStr = params.get('flowStrength') * 0.6;
    }
    return cfg;
  }

  function stageLight() {
    const base = params.get('baseLight');
    if (screen === 'play' && run.mode === 'TIMED' && run.totalMs > 0) {
      const spent = 1 - Math.max(0, Math.min(1, run.timeRemainingMs / run.totalMs));
      return base * (1 - params.get('timedDimming') * spent);
    }
    return base;
  }

  // --------------------------------------------------------------------------
  // Animation loop
  // --------------------------------------------------------------------------
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (document.hidden) { lastNow = now; return; }
    let dt = (now - lastNow) / 1000;
    lastNow = now;
    if (dt > 0.1) dt = 0.1;
    debug.frames++; debug.lastNow = now; if (!debug.firstNow) debug.firstNow = now;

    // Painter first, so a stroke lands before this frame's advection.
    if (phase === 'paint') {
      const { done } = painter.update(now);
      if (done) { phase = 'hold'; phaseStart = now; }
    } else if (phase === 'hold') {
      if (now - phaseStart >= params.get('holdMs')) { phase = 'ramp'; phaseStart = now; lastReink = now; }
    } else if (phase === 'ramp') {
      if (now - phaseStart >= params.get('rampMs')) { phase = 'flow'; phaseStart = now; }
    } else if (phase === 'flow' && glyph && glyph.stays) {
      const every = params.get('staysReinkMs');
      if (every > 0 && now - lastReink >= every) { painter.reink(0.2); lastReink = now; }
    }

    if (screen !== 'play') wisps(dt);

    acc += dt;
    let steps = 0;
    const cfg = stepConfig(now);
    while (acc >= FIXED && steps < 3) {
      fluid.step(FIXED, cfg);
      if (now < drainUntil) fluid.drain(drainDissip, cfg);
      acc -= FIXED; steps++; debug.steps++;
    }

    fluid.render({
      bloomThreshold: params.get('bloomThreshold'),
      bloomGain: params.get('bloomGain'),
      bloomMix: params.get('bloomMix'),
      caustic: params.get('caustic'),
      grain: params.get('grain'),
      vignette: params.get('vignette'),
      light: stageLight(),
    });
  }

  // Faint ambient wisps at the edges while not playing, so the water is alive.
  function wisps(dt) {
    wispAcc += dt;
    if (wispAcc < 1.4) return;
    wispAcc = 0;
    const rgb = sampleLut(fluid.lut, 0.25);
    const edge = Math.floor(Math.random() * 4);
    const u = edge === 1 ? 0.96 : edge === 3 ? 0.04 : Math.random();
    const v = edge === 0 ? 0.96 : edge === 2 ? 0.04 : Math.random();
    fluid.splat(u, v, rgb.map(c => c * 3), 0.03, 0.05);
  }

  function startDrain(ms, dissip) {
    drainUntil = performance.now() + ms;
    drainDissip = dissip;
  }

  // --------------------------------------------------------------------------
  // Score row + game-over trinity (overlay SVG in the core colour)
  // --------------------------------------------------------------------------
  function renderScore({ score, animateNewBit = false }) {
    const { groupEl, width } = renderBinaryScore({ score, markSize: 18, rng: createRng(score + 1) });
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `-12 -16 ${width + 24} 32`);
    svg.setAttribute('height', '28');
    if (animateNewBit) {
      const flipped = (score & ~lastBitCount);
      for (let i = 0; i < 8; i++) if ((flipped >> i) & 1) {
        const path = groupEl.querySelector(`path[data-bit-index="${i}"]`);
        if (path) path.classList.add('new-bit');
        break;
      }
    }
    svg.appendChild(groupEl);
    els.scoreRow.replaceChildren(svg);
    lastBitCount = score & 0xff;
  }

  function renderBigBinary(score) {
    const { groupEl, width } = renderBinaryScore({ score, markSize: 34, rng: createRng((score + 17) * 31) });
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `-22 -24 ${width + 44} 48`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.appendChild(groupEl);
    els.bigBinary.replaceChildren(svg);
  }
  function renderBigHeptacipher(score) {
    els.bigHeptacipher.replaceChildren(renderHeptapodNumeralV2({
      number: Math.max(0, Math.floor(score)) & 0xff,
      size: 220,
      seed: 0xfeedface ^ (score + 1) * 2654435761,
      ...HEPTAWEAVE_CHOICE_TUNE,
      ...loadTune(),
    }));
  }
  function renderBigCistercian(score) {
    const n = Math.max(0, Math.floor(score)) & 0xff;
    const size = 220;
    const { groupEl } = renderCistercianInk({ number: n, size, rng: createRng((n + 1) * 991), padFrac: 0.10, strokeWidthFrac: 0.022 });
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.style.overflow = 'visible';
    svg.appendChild(groupEl);
    els.bigCistercian.replaceChildren(svg);
  }

  // --------------------------------------------------------------------------
  // Choices
  // --------------------------------------------------------------------------
  function renderChoices({ numbers, seed, onPick }) {
    els.choices.className = 'choices cN-' + numbers.length;
    els.choices.replaceChildren();
    const mid = els.playMid.getBoundingClientRect();
    const box = promptBox();
    const { tileSize, centers } = layoutChoices({
      width: mid.width, height: mid.height, promptRadius: box.w / 2, count: numbers.length,
    });
    const tileR = tileSize / 2;
    const tune = loadTune();
    const effPad = (tune.vbPadFrac ?? HEPTAWEAVE_CHOICE_TUNE.vbPadFrac ?? 0.10);
    const v2Internal = Math.round(tileSize / (1 + 2 * effPad));

    numbers.forEach((n, i) => {
      const { x, y } = centers[i];
      const tile = document.createElement('button');
      tile.className = 'choice-tile';
      tile.type = 'button';
      tile.style.width = `${tileSize}px`;
      tile.style.height = `${tileSize}px`;
      tile.style.left = `${x - tileR}px`;
      tile.style.top = `${y - tileR}px`;
      tile.appendChild(renderHeptapodNumeralV2({
        number: n, size: v2Internal, seed: seed ^ (n * 7919),
        ...HEPTAWEAVE_CHOICE_TUNE, ...tune,
        // The fluid supplies the glow; keep the overlay crisp.
        haloOpacity: 0.35,
      }));
      tile.addEventListener('click', () => onPick(n, tile));
      els.choices.appendChild(tile);
    });
  }

  function feedback({ tileEl, correct }) {
    tileEl.classList.add(correct ? 'correct' : 'wrong');
    const svg = tileEl.querySelector('svg');
    if (!svg) return;
    const box = promptBox();
    painter.splashSvg(svg, correct ? coreRgb() : EMBER, {
      amount: params.get('splashAmount'),
      radiusPx: params.get('splashRadius') * box.w,
    });
    // The other tiles recede so the reaction has the stage.
    for (const t of els.choices.children) if (t !== tileEl) t.classList.add('recede');
  }

  // --------------------------------------------------------------------------
  // Prompt
  // --------------------------------------------------------------------------
  function paintPrompt({ number, seed, revealMs, mode, timeRemainingMs, totalMs }) {
    run = { mode, timeRemainingMs, totalMs };
    const floor = params.get('dissolveFloor');
    let dissip = 1, stays = false, seconds = 0;
    if (mode === 'TIMED') {
      seconds = (timeRemainingMs / 1000) * params.get('timedScale');
      dissip = dissipFor(seconds, floor);
    } else if (revealMs > 0) {
      seconds = (revealMs / 1000) * params.get('revealScale');
      dissip = dissipFor(seconds, floor);
    } else {
      stays = true;
    }
    glyph = { number, seed, mode, revealMs, dissip, stays, seconds };
    painter.begin({ number, box: promptBox(), seed, rgb: coreRgb() });
    phase = 'paint';
    phaseStart = performance.now();
  }

  function clearPrompt({ reason }) {
    if (reason === 'reveal') return; // the dye is its own clock
    painter.cancel();
    glyph = null;
    phase = 'idle';
    const d = params.get('drainDissip');
    if (reason === 'correct') startDrain(params.get('correctDrainMs'), d);
    else if (reason === 'wrong') startDrain(params.get('wrongDrainMs'), d);
    else startDrain(1400, Math.min(d, 0.9));
  }

  // --------------------------------------------------------------------------
  // Contract
  // --------------------------------------------------------------------------
  return {
    ...noopRenderer,
    delays: { correct: 700, wrongContinue: 900, wrongEnd: 1200 },

    get ok() { return !!(fluid && fluid.ok); },
    get debug() { return debug; },

    mount({ on }) {
      els = {
        canvas:     document.getElementById('stage'),
        landing:    document.getElementById('screenLanding'),
        play:       document.getElementById('screenPlay'),
        gameover:   document.getElementById('screenGameOver'),
        modeBtns:   document.querySelectorAll('.mode-btn'),
        cornerHold: document.getElementById('cornerHold'),
        scoreRow:   document.getElementById('scoreRow'),
        playMid:    document.getElementById('playMid'),
        choices:    document.getElementById('choices'),
        bigBinary:      document.getElementById('bigBinary'),
        bigHeptacipher: document.getElementById('bigHeptacipher'),
        bigCistercian:  document.getElementById('bigCistercian'),
        gameDot:        document.getElementById('gameOverDot'),
      };
      fluid = createFluid(els.canvas, { simScale: params.get('simScale') });
      if (!fluid.ok) return;
      painter = createPainter({ fluid, params });
      applyPalette();

      params.on((key) => {
        if (key === 'palette' || key === null) applyPalette();
        if (key === 'simScale' || key === null) fluid.setSimScale(params.get('simScale'));
      });

      els.modeBtns.forEach((btn) => {
        btn.addEventListener('click', () => { if (btn.dataset.mode) on.modeSelect(btn.dataset.mode); });
      });
      els.gameover.addEventListener('click', on.gameOverTap);
      if (els.cornerHold && on.cornerHold) wireHold(els.cornerHold, on.cornerHold);

      let resizeT = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeT);
        resizeT = setTimeout(() => {
          fluid.resize();
          if (glyph) painter.relayout(promptBox());
        }, 120);
      });
      els.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
      els.canvas.addEventListener('webglcontextrestored', () => {
        fluid = createFluid(els.canvas, { simScale: params.get('simScale') });
        painter = createPainter({ fluid, params });
        applyPalette();
        if (glyph) painter.relayout(promptBox());
      });

      lastNow = performance.now();
      rafId = requestAnimationFrame(frame);
    },

    showScreen(name) {
      screen = name;
      els.landing.hidden = (name !== 'landing');
      els.play.hidden = (name !== 'play');
      els.gameover.hidden = (name !== 'gameover');
    },

    startRun({ mode, totalMs }) {
      run = { mode, timeRemainingMs: totalMs, totalMs };
      lastBitCount = 0;
      els.choices.replaceChildren();
      painter.cancel();
      glyph = null;
      phase = 'idle';
      startDrain(600, 0.85);
    },

    paintPrompt,
    clearPrompt,
    renderChoices,
    feedback,
    renderScore,

    tick({ mode, timeRemainingMs, totalMs }) {
      run = { mode, timeRemainingMs, totalMs };
    },

    showGameOver({ score, clean }) {
      renderBigBinary(score);
      renderBigHeptacipher(score);
      renderBigCistercian(score);
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '-30 -30 60 60');
      svg.appendChild(renderGameOverDot({ clean, size: 48, rng: createRng((score + 1) * 311) }));
      els.gameDot.replaceChildren(svg);
      run = { mode: null, timeRemainingMs: 0, totalMs: 0 };
    },

    teardown() {
      painter.cancel();
      glyph = null;
      phase = 'idle';
      run = { mode: null, timeRemainingMs: 0, totalMs: 0 };
    },
  };
}

function wireHold(el, fn) {
  let t = null;
  const start = () => { t = setTimeout(() => { t = null; fn(); }, 1000); };
  const cancel = () => { if (t) { clearTimeout(t); t = null; } };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
}

export { PALETTES };
