// inkRenderer.js — the darkroom / dissolving-ink theme.
//
// The prompt glyph is painted into a WebGL dye field (fluid.js) by the glyph
// painter and left to the current. Its dissolution is the clock:
//   ⧖  dissipation is derived from the time remaining in the run when the
//      glyph is painted, so it is gone exactly when the run would end; the
//      stage light dims across the run; a wrong answer is a drain pulse.
//   ∞  dissipation is derived from the tier's revealMs; "stays" tiers drift
//      without fading and are re-inked periodically.
//   +⟵ (COUNT_C) the ∞ prompt's Cistercian, one per second: traced fast,
//      never frozen, dissolved to the floor inside `countCLife` so stems do
//      not pile up. Uses the growth-front painter with a per-glyph tempo.
//   +  no clock: one large logogram stamped in layers (ring + one per
//      digit). When the value changes, the new digit's ink sweeps in along
//      the ring over the whole period (a growth front, like the Cistercian)
//      while the old digit's ink is faded out by the fluid over the same
//      period. Everything else is topped up continuously by exactly the ink
//      the fade takes, at an anchor that breathes (slow scale + drift), so
//      the figure moves like something alive and never steps in brightness.
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
import { layoutBands } from './bandLayout.js';
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
  let countToken = 0;
  let countKind = null;      // 'heptaweave' | 'cistercian' while on the count screen
  // + mode layer cache: key → Promise<canvas>; geometry shared by all layers.
  let countLayers = new Map();
  let countGeom = null;      // { rect, size }
  let countShown = null;     // digits currently on the water, or null
  let countAnims = [];       // in-flight digit transitions, see stepCountAnims()
  let countCurrent = null;   // { ring, digits: layer[4] } being kept alive
  let countOwed = 0;         // top-up ink accrued since the last trickle stamp
  let countScratch = null;   // reusable canvas for wedge slices
  let countVersion = 0;      // bumps per wedge slice so the mask re-uploads
  const COUNT_RASTER = 1;    // raster px per CSS px for count layers
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
    if (screen === 'count' && els.countStage) {
      const st = els.countStage.getBoundingClientRect();
      const size = Math.min(st.width, st.height) * params.get('countCSize');
      return { x: st.left + (st.width - size) / 2, y: st.top + (st.height - size) / 2, w: size, h: size };
    }
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
      diffuseSpread: params.get('diffuseSpread'),
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
    const diffuse = params.get('diffuse');
    if (screen === 'count' && countKind === 'cistercian') {
      // Everything on the water shares one clock; the current keeps running
      // while the next glyph is traced so the last one goes on dissolving.
      cfg.dissip = glyph ? glyph.dissip : params.get('idleDissip');
      cfg.flowStr = params.get('flowStrength') * params.get('countCFlow');
      cfg.diffuse = diffuse;
    } else if (screen === 'count') {
      cfg.dissip = params.get('countFade');
      cfg.flowStr = params.get('flowStrength') * params.get('countDrift');
      cfg.diffuse = 0;
    } else if (phase === 'paint' || phase === 'hold') {
      cfg.dissip = 1; cfg.flowStr = 0; cfg.diffuse = 0;
    } else if (phase === 'ramp') {
      const t = easeInOut(Math.min(1, (now - phaseStart) / Math.max(1, glyph?.tempo?.rampMs ?? params.get('rampMs'))));
      cfg.dissip = 1 + (targetDissip() - 1) * t;
      cfg.flowStr = targetFlowStr() * t;
      cfg.diffuse = diffuse * t;
    } else if (phase === 'flow') {
      cfg.dissip = targetDissip(); cfg.flowStr = targetFlowStr();
      // "stays" tiers keep their shape: no spreading, only drift.
      cfg.diffuse = (glyph && glyph.stays) ? 0 : diffuse;
    } else {
      cfg.dissip = params.get('idleDissip'); cfg.flowStr = params.get('flowStrength') * 0.6;
      cfg.diffuse = diffuse;
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
      if (now - phaseStart >= (glyph?.tempo?.holdMs ?? params.get('holdMs'))) { phase = 'ramp'; phaseStart = now; lastReink = now; }
    } else if (phase === 'ramp') {
      if (now - phaseStart >= (glyph?.tempo?.rampMs ?? params.get('rampMs'))) { phase = 'flow'; phaseStart = now; }
    } else if (phase === 'flow' && glyph && glyph.stays) {
      const every = params.get('staysReinkMs');
      if (every > 0 && now - lastReink >= every) { painter.reink(0.2); lastReink = now; }
    }

    if (screen !== 'play' && screen !== 'count') wisps(dt);

    acc += dt;
    let steps = 0;
    const cfg = stepConfig(now);
    while (acc >= FIXED && steps < 3) {
      fluid.step(FIXED, cfg);
      if (now < drainUntil) fluid.drain(drainDissip, cfg);
      acc -= FIXED; steps++; debug.steps++;
    }

    if (screen === 'count') countMaintain(now, dt, steps);

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
    const { tileSize, centers } = (params.get('layoutMode') >= 1)
      ? layoutBands({
          width: mid.width, height: mid.height, promptSize: box.w, count: numbers.length,
          gap: params.get('tileGap'), maxTile: params.get('tileMax'),
        })
      : layoutChoices({
          width: mid.width, height: mid.height, promptRadius: box.w / 2, count: numbers.length,
          maxTile: params.get('tileMax'),
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

  // COUNT_C: trace the glyph fast and let it dissolve to the floor within
  // `countCLife` seconds. Same painter and phases as the ∞ prompt, but with a
  // per-glyph tempo and no freeze, so the previous glyph keeps dissolving
  // under the new one and the stems never stack into a bright bar.
  function paintCountGlyph(number, periodMs) {
    const life = params.get('countCLife');
    const dissip = dissipFor(life, params.get('dissolveFloor'));
    glyph = {
      number, seed: number + 1, mode: 'COUNT_C', revealMs: life * 1000, dissip, stays: false, seconds: life,
      tempo: { holdMs: 0, rampMs: params.get('countCRamp') },
    };
    painter.begin({
      number, box: promptBox(), seed: number + 1, rgb: coreRgb(),
      traceMs: Math.min(params.get('countCTrace'), periodMs * 0.9),
      inkScale: params.get('countCInk'),
    });
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
  // + mode transitions: a growth front along the ring for the new digit,
  // a fluid fade for the old one. Both span the whole period.
  // --------------------------------------------------------------------------
  // Angular span of a lobe about the ring centre, from its bbox corners.
  function wedgeFor(l) {
    if (!l.box) return null;
    const { x, y, w, h } = l.box;
    const c = l.centre;
    const corners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
    const angs = corners.map(([px, py]) => Math.atan2(py - c.y, px - c.x));
    // Unwrap about the first corner so a lobe straddling ±π still spans.
    const ref = angs[0];
    const rel = angs.map(a => { let d = a - ref; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; });
    const pad = 0.04;
    return { cx: c.x, cy: c.y, a0: ref + Math.min(...rel) - pad, a1: ref + Math.max(...rel) + pad, R: Math.hypot(l.c.width, l.c.height) };
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 2); }
  // The breathing anchor: a slow scale swell and a slow two-axis drift of the
  // whole figure. Ink follows through the fluid because the trickle top-up
  // lands at the moving anchor while the old position fades.
  function countRect(now) {
    const g = countGeom;
    const T = Math.max(0.5, params.get('countBreatheS')) * 1000;
    const amp = params.get('countBreathe') / 100;
    const ph = (now / T) * Math.PI * 2;
    const s = 1 + amp * Math.sin(ph);
    const dx = amp * g.w * 0.6 * Math.sin(ph * 0.61 + 1.3);
    const dy = amp * g.h * 0.6 * Math.sin(ph * 0.43 + 2.9);
    const w = g.w * s, h = g.h * s;
    return fluid.rectFromClient(g.cx - w / 2 + dx, g.cy - h / 2 + dy, w, h);
  }
  // Per-frame keep-alive: trickle back exactly the ink the fade removed since
  // the last trickle, in doses large enough to survive byte textures, and
  // advance any transitions. Runs after the sim steps of this frame.
  function countMaintain(now, dt, steps) {
    if (!countCurrent || !countGeom) return;
    const ink = params.get('countInk');
    const rect = countRect(now);
    if (countAnims.length) stepCountAnims(now, dt, rect);
    countOwed += ink * (1 - Math.pow(params.get('countFade'), steps));
    if (countOwed < 0.006) return;
    const rgb = coreRgb().map(c => c * 3);
    fluid.stamp(countCurrent.ring.c, rect, rgb, countOwed);
    countCurrent.digits.forEach((l, i) => {
      const a = countAnims.find(x => x.place === i);
      if (!a) fluid.stamp(l.c, rect, rgb, countOwed);
      else if (a.shared) fluid.stamp(a.shared.c, rect, rgb, countOwed);
    });
    countOwed = 0;
  }
  // The new layer clipped to the wedge slice [ta, tb] of its angular span.
  function wedgeSlice(l, wg, ta, tb) {
    if (!countScratch) countScratch = document.createElement('canvas');
    const s = countScratch;
    if (s.width !== l.c.width || s.height !== l.c.height) { s.width = l.c.width; s.height = l.c.height; }
    const ctx = s.getContext('2d');
    ctx.clearRect(0, 0, s.width, s.height);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(wg.cx, wg.cy);
    ctx.arc(wg.cx, wg.cy, wg.R, wg.a0 + (wg.a1 - wg.a0) * ta, wg.a0 + (wg.a1 - wg.a0) * tb);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(l.c, 0, 0);
    ctx.restore();
    return s;
  }
  function stepCountAnims(now, dt, rect) {
    const keep = [];
    for (const a of countAnims) {
      a.rect = rect;
      const t = Math.min(1, (now - a.start) / Math.max(1, a.periodMs));
      const f0 = easeOut(a.lastT), f1 = easeOut(t);
      if (f1 > f0) {
        if (a.wedge) fluid.stamp(wedgeSlice(a.neu, a.wedge, f0, f1), a.rect, a.rgb, a.ink, { version: ++countVersion });
        else fluid.stamp(a.neu.c, a.rect, a.rgb, a.ink * (f1 - f0));
      }
      // Fade the old ink so it reaches the dissolve floor as the period ends.
      if (a.erase && dt > 0) {
        const perFrame = 1 - Math.pow(0.02, dt * 1000 / Math.max(1, a.periodMs));
        fluid.stamp(a.erase, a.rect, a.rgb, perFrame, { erase: true });
      }
      a.lastT = t;
      if (t >= 1) finishCountAnim(a); else keep.push(a);
    }
    countAnims = keep;
  }
  function finishCountAnim(a) {
    if (!a.rect) a.rect = countRect(performance.now());
    if (a.lastT < 1) {
      const f0 = easeOut(a.lastT);
      if (a.wedge) fluid.stamp(wedgeSlice(a.neu, a.wedge, f0, 1), a.rect, a.rgb, a.ink, { version: ++countVersion });
      else fluid.stamp(a.neu.c, a.rect, a.rgb, a.ink * (1 - f0));
    }
    if (a.erase) fluid.stamp(a.erase, a.rect, a.rgb, 1, { erase: true });
    a.lastT = 1;
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
        count:          document.getElementById('screenCount'),
        countStage:     document.getElementById('countStage'),
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
      if (els.count && on.countHold) wireHold(els.count, on.countHold);
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
      if (els.count) els.count.hidden = (name !== 'count');
    },

    startRun({ mode, totalMs }) {
      run = { mode, timeRemainingMs: totalMs, totalMs };
      countShown = null; countGeom = null; countAnims = []; countCurrent = null; countOwed = 0; countKind = null;
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

    // The + mode. The logogram is rasterised to a canvas and stamped into
    // the dye in one pass (its paths are far too long to splat). The raster
    // is async (SVG → Image); a later value cancels an earlier one in flight.
    renderCount({ value, periodMs = 1000, glyph: kind = 'heptaweave' }) {
      if (!els.countStage || !fluid.ok) return;
      const n = Math.max(0, value | 0) % 10000;
      countKind = kind;
      if (kind === 'cistercian') { paintCountGlyph(n, periodMs); return; }
      const digits = [Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
      const stage = els.countStage.getBoundingClientRect();
      const short = Math.min(stage.width, stage.height);
      const size = Math.round(short);
      const token = ++countToken;
      const rgb = coreRgb().map(c => c * 3);
      const ink = params.get('countInk');

      // One SVG per distinct digit set; layers are cut from it by hiding
      // the other groups. A fixed seed + per-lobe rng streams make a digit's
      // marks depend only on its place and value, so layers cache by key.
      const svgFor = (num) => {
        const svg = renderHeptapodNumeralV2({
          number: num, size, seed: 0xc0ffee,
          ...HEPTAWEAVE_CHOICE_TUNE, ...loadTune(),
          haloOpacity: 0, lobeRng: true,
        });
        svg.setAttribute('color', '#fff');
        return svg;
      };
      // A layer is { c: canvas, box: lobe bounds in raster px | null,
      // centre: ring centre in raster px }. The bbox comes from a temporary
      // DOM attach (getBBox needs layout); raster px = 2 × user units + pad.
      const layer = (key, hide, place = -1) => {
        if (!countLayers.has(key)) {
          const svg = svgFor(n);
          for (const el of svg.querySelectorAll(hide)) el.setAttribute('display', 'none');
          let box = null;
          const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
          const vbSize = Number(svg.getAttribute('width')) || 1;
          const toRaster = (u) => (u - vb[0]) * COUNT_RASTER;
          if (place >= 0) {
            els.countStage.appendChild(svg);
            try {
              const g = svg.querySelector(`.ink-crisp .lobe[data-place="${place}"]`);
              const b = g ? g.getBBox() : null;
              if (b && b.width > 0 && b.height > 0) {
                box = { x: toRaster(b.x), y: toRaster(b.y), w: b.width * COUNT_RASTER, h: b.height * COUNT_RASTER };
              }
            } catch {}
            svg.remove();
          }
          const centre = { x: toRaster(size / 2), y: toRaster(size / 2) };
          countLayers.set(key, rasterizeSvg(svg, COUNT_RASTER).then((c) => ({ c, box, centre })));
        }
        return countLayers.get(key);
      };
      const ringP = layer(`ring:${size}`, '.lobe');
      const digitP = digits.map((d, i) => layer(`d:${size}:${i}:${d}`, `.enso, .wet-drop, .lobe:not([data-place="${i}"])`, i));
      const prev = countShown;
      const prevP = prev ? prev.map((d, i) => (d === digits[i]) ? null : layer(`d:${size}:${i}:${d}`, `.enso, .wet-drop, .lobe:not([data-place="${i}"])`, i)) : [];

      Promise.all([ringP, ...digitP, ...prevP]).then(([ring, ...rest]) => {
        if (token !== countToken || screen !== 'count') return;
        const news = rest.slice(0, 4), olds = rest.slice(4);
        // Geometry from the ring: the ink box scales to `countSize` of the
        // short side; every layer shares the raster size so one rect fits all.
        if (!countGeom || countGeom.size !== size) {
          const bb = alphaBounds(ring.c);
          if (!bb) throw new Error('empty raster');
          const k = (short * params.get('countSize')) / Math.max(bb.w, bb.h);
          const w = ring.c.width * k, h = ring.c.height * k;
          const cx = stage.left + stage.width / 2, cy = stage.top + stage.height / 2;
          // Client-space centre of the raster and its size; the breathing
          // anchor scales and drifts this each frame (see countRect()).
          countGeom = { size, cx: cx - (bb.x + bb.w / 2 - ring.c.width / 2) * k, cy: cy - (bb.y + bb.h / 2 - ring.c.height / 2) * k, w, h };
        }
        const rect = countRect(performance.now());
        const reach = params.get('countErase') * COUNT_RASTER;
        countCurrent = { ring, digits: news.slice() };
        if (!prev) {
          fluid.stamp(ring.c, rect, rgb, ink);
          for (const l of news) fluid.stamp(l.c, rect, rgb, ink);
        } else {
          digits.forEach((d, i) => {
            if (d === prev[i]) return;
            // Hand the change to the frame loop: sweep the new ink in and
            // fade the old ink out over `periodMs`. A transition already
            // running on this place is finished first.
            const running = countAnims.findIndex(a => a.place === i);
            if (running >= 0) { finishCountAnim(countAnims[running]); countAnims.splice(running, 1); }
            // Marks both digits share are already on the water: they are
            // neither faded (old − new) nor re-inked (new − old).
            const erase = olds[i] ? dilate(olds[i].c, reach, ring.c, news[i].c) : null;
            const fresh = olds[i] ? { ...news[i], c: dilate(news[i].c, 0, olds[i].c) } : news[i];
            // Marks both digits share keep being topped up meanwhile.
            const shared = olds[i] ? { ...news[i], c: dilate(news[i].c, 0, fresh.c) } : null;
            countAnims.push({
              place: i, neu: fresh, erase, shared, rgb, ink,
              wedge: params.get('countReveal') >= 1 ? wedgeFor(news[i]) : null,
              start: performance.now(), periodMs, lastT: 0,
            });
          });
        }
        countShown = digits;
      }).catch((err) => {
        // Raster path unavailable (blob SVG images are the usual suspect on
        // older WebKit): splat the whole numeral's paths so the screen is
        // never blank. Needs the SVG laid out for getScreenCTM.
        if (token !== countToken || screen !== 'count') return;
        console.warn('count: raster failed, splatting paths', err);
        const target = short * params.get('countSize');
        const svg = svgFor(n);
        svg.setAttribute('width', String(target)); svg.setAttribute('height', String(target));
        els.countStage.replaceChildren(svg);
        startDrain(200, 0.8);
        painter.splashSvg(svg, coreRgb(), { amount: ink * 0.6, radiusPx: target * 0.012, spacingPx: 6 });
        countShown = null; countAnims = []; countCurrent = null;
      });
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

// SVG element → canvas at `scale`× its width/height attributes. The numeral's
// filters and fills are inline, so the serialised document is self-contained.
function rasterizeSvg(svg, scale = 1) {
  return new Promise((resolve, reject) => {
    const w = Math.max(1, Math.round(Number(svg.getAttribute('width')) || 100));
    const h = Math.max(1, Math.round(Number(svg.getAttribute('height')) || w));
    const xml = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg raster failed')); };
    img.src = url;
  });
}

// A copy of `c` with its alpha grown by `r` px in eight directions, so an
// erase covers ink that drifted a little since it was stamped; `keep` (the
// ring layer) is punched out so the erase never notches the ring.
function dilate(c, r, ...keeps) {
  const out = document.createElement('canvas');
  out.width = c.width; out.height = c.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(c, 0, 0);
  if (r > 0) {
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      ctx.drawImage(c, Math.cos(t) * r, Math.sin(t) * r);
    }
    for (let a = 0; a < 8; a++) {
      const t = ((a + 0.5) / 8) * Math.PI * 2;
      ctx.drawImage(c, Math.cos(t) * r * 0.5, Math.sin(t) * r * 0.5);
    }
  }
  for (const keep of keeps) {
    if (!keep) continue;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(keep, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
  return out;
}

// Bounding box of the non-transparent pixels of a canvas, in canvas px.
function alphaBounds(c) {
  const ctx = c.getContext('2d');
  const { width: W, height: H } = c;
  const a = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (a[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
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
