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
//   ◎  (COUNT_R) the ring-stave numeral: the ring is permanent — a pinned
//      raster at a breathing anchor, like the logogram's ring — and so is
//      every digit figure until its digit changes: then that figure alone is
//      released to dissolve on the count clock while the new one grows out
//      of the ring where the ring is now, and is pinned once grown. Nothing
//      that need not be redrawn is redrawn: 10 draws the tens' 1, which stays
//      until 20.
//   +  (COUNT) one large logogram in layers (ring + one per digit). The
//      water runs the Cistercian counter's clock (`countLife`, `countFlow`),
//      but the ring and the current digits are *pinned*: each frame the dye
//      under their masks is pulled toward the target density at a breathing
//      anchor. A changed digit's old marks are simply unpinned, so they drift
//      and dissolve exactly like a Cistercian glyph, while the new marks
//      sweep in over `countTrace` ms and are pinned from then on. The ring
//      is never redrawn.
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
import { PATTERNS } from '../../heptacipher/morsePatterns.js';
import { ringStaveGrowthPx, placeDigits } from '../../cistercian/ringStave.js';
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
  let rippleAcc = 0;         // lab: ambient ripple timer
  let resultPins = [];       // game-over glyphs held in the ink: { c, geom, phase }
  let resultPending = false; // stamp the result glyphs on the next frame after the screen shows
  let countToken = 0;
  let countKind = null;      // 'heptaweave' | 'cistercian' while on the count screen
  // + mode layer cache: key → Promise<{ c, centre }>; geometry shared by all layers.
  let countLayers = new Map();
  let countGeom = null;      // { rect, size }
  let countShown = null;     // digits currently on the water, or null
  let countAnims = [];       // in-flight digit transitions, see stepCountAnims()
  let countCurrent = null;   // { ring, digits: layer[4] } being pinned
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
      surface: params.get('surface') >= 1,
      rippleDamp: params.get('rippleDamp'),
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
    if (screen === 'count' && countKind !== 'heptaweave') {
      // Everything on the water shares one clock; the current keeps running
      // while the next glyph is traced so the last one goes on dissolving.
      cfg.dissip = glyph ? glyph.dissip : params.get('idleDissip');
      cfg.flowStr = params.get('flowStrength') * params.get('countCFlow');
      cfg.diffuse = diffuse;
    } else if (screen === 'count') {
      cfg.dissip = dissipFor(params.get('countLife'), params.get('dissolveFloor'));
      cfg.flowStr = params.get('flowStrength') * params.get('countFlow');
      // Half the diffusion: a pinned ring leaks ink through its mask edge
      // every frame, and full diffusion turns that leak into a fog.
      cfg.diffuse = diffuse * 0.5;
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

    if (screen === 'count') countMaintain(now, dt);
    if (screen === 'gameover') resultMaintain(now);
    if (params.get('surface') >= 1) ambientRipples(dt);

    fluid.render({
      bloomThreshold: params.get('bloomThreshold'),
      bloomGain: params.get('bloomGain'),
      bloomMix: params.get('bloomMix'),
      caustic: params.get('caustic'),
      grain: params.get('grain'),
      vignette: params.get('vignette'),
      light: stageLight(),
      surface: params.get('surface') >= 1,
      refract: params.get('rippleRefract'),
      invert: params.get('inverted') >= 1,
    });
  }

  // The result screen: the three score glyphs are rasterised from their
  // (laid-out, then hidden) SVGs and pinned in the ink, each hovering on its
  // own slow breath. Same pin as the counter's ring.
  function resultStamp() {
    resultPins = [];
    const cells = [els.bigBinary, els.bigHeptacipher, els.bigCistercian];
    cells.forEach((cell, i) => {
      const svg = cell && cell.querySelector('svg');
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      if (!(r.width > 4 && r.height > 4)) return;
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', String(Math.round(r.width)));
      clone.setAttribute('height', String(Math.round(r.height)));
      clone.setAttribute('color', '#fff');
      clone.setAttribute('xmlns', SVG_NS);
      const phase = i * 2.1;
      rasterizeSvg(clone, 1.5).then((c) => {
        if (screen !== 'gameover') return;
        const geom = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
        resultPins.push({ c, geom, phase, born: performance.now() });
      }).catch(() => {});
    });
    els.gameover.classList.add('ink-only');
  }
  function breatheRect(g, now, amp, periodS, phase) {
    const T = Math.max(0.5, periodS) * 1000;
    const ph = (now / T) * Math.PI * 2 + phase;
    const s = 1 + amp * Math.sin(ph);
    const dx = amp * g.w * 0.6 * Math.sin(ph * 0.61 + 1.3);
    const dy = amp * g.h * 0.6 * Math.sin(ph * 0.43 + 2.9);
    const w = g.w * s, h = g.h * s;
    return fluid.rectFromClient(g.cx - w / 2 + dx, g.cy - h / 2 + dy, w, h);
  }
  function resultMaintain(now) {
    if (resultPending) {
      resultPending = false;
      resultStamp();
    }
    if (!resultPins.length) return;
    const ink = params.get('resultInk');
    const pin = params.get('resultPin');
    const amp = params.get('resultBreathe') / 100;
    const T = params.get('resultBreatheS');
    const rgb = coreRgb().map(c => c * 3);
    for (const p of resultPins) {
      // Ease the pin in over the first half second so the glyph soaks in
      // rather than snapping on.
      const k = pin * Math.min(1, (now - p.born) / 500);
      fluid.stamp(p.c, breatheRect(p.geom, now, amp, T, p.phase), rgb, k, { erase: true, target: ink });
    }
  }

  // Lab: the water surface is poked now and then so it is never glass, and
  // by every touch on the stage.
  function ambientRipples(dt) {
    const perMin = params.get('rippleAmbient');
    if (!(perMin > 0)) return;
    rippleAcc += dt;
    const every = 60 / perMin;
    if (rippleAcc < every) return;
    rippleAcc = 0;
    fluid.disturb(0.1 + Math.random() * 0.8, 0.1 + Math.random() * 0.8, 0.012 + Math.random() * 0.01, 0.25 + Math.random() * 0.35);
  }
  function touchRipple(x, y) {
    if (params.get('surface') < 1) return;
    const { u, v } = fluid.uvFromClient(x, y);
    fluid.disturb(u, v, 0.016, params.get('rippleTouch'));
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
    painter.begin({ number, box: promptBox(), seed, rgb: coreRgb(), figure: figureKind() });
    phase = 'paint';
    phaseStart = performance.now();
  }

  // COUNT_C: trace the glyph fast and let it dissolve to the floor within
  // `countCLife` seconds. Same painter and phases as the ∞ prompt, but with a
  // per-glyph tempo and no freeze, so the previous glyph keeps dissolving
  // under the new one and the stems never stack into a bright bar.
  function paintCountGlyph(number, periodMs, figure = figureKind()) {
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
      figure,
    });
    phase = 'paint';
    phaseStart = performance.now();
  }

  // ◎ COUNT_R. First beat: the whole numeral grows in (ring and figures) and
  // the ring is rasterised and pinned from then on, hovering at the count
  // anchor. Later beats grow only the figures, at the ring's position now.
  function paintRingCount(number, periodMs) {
    const first = !countCurrent;
    const life = params.get('countCLife');
    const dissip = dissipFor(life, params.get('dissolveFloor'));
    const now = performance.now();
    glyph = {
      number, seed: number + 1, mode: 'COUNT_R', revealMs: life * 1000, dissip, stays: false, seconds: life,
      tempo: { holdMs: 0, rampMs: params.get('countCRamp') },
    };
    if (first) {
      const box = promptBox();
      const radiusPx = params.get('strokeRadius') * box.w;
      const ring = ringStaveRingCanvas(box.w, radiusPx);
      countGeom = { size: Math.round(box.w), cx: box.x + box.w / 2, cy: box.y + box.h / 2, w: box.w, h: box.h, rw: ring.width, rh: ring.height };
      countCurrent = {
        ring: { c: ring, centre: { x: ring.width / 2, y: ring.height / 2 } }, lines: [], drops: new Set(),
        ink: params.get('countRingInk'), pin: params.get('countRingPin'),
        figs: new Map(),        // slot → { digit, layer, pinAt }
        radiusPx, size: box.w,
      };
    }
    // Diff the places: a slot whose digit changed (or is new) releases its
    // old figure — it is simply no longer pinned — and grows the new one.
    const digits = placeDigits(number);
    const figs = countCurrent.figs;
    const grow = [];
    const traceMs = Math.min(params.get('countCTrace'), periodMs * 0.9);
    for (let k = 0; k < Math.max(digits.length, figs.size + 1); k++) {
      const d = digits[k] ?? 0;
      const had = figs.get(k);
      if (had && had.digit === d) continue;
      if (had) figs.delete(k);
      if (d === 0) continue;                          // 0 draws nothing
      figs.set(k, { digit: d, layer: ringStaveFigureLayer(countCurrent.size, countCurrent.radiusPx, number, k), pinAt: now + traceMs + 400 });
      grow.push(`slot${k}`);
    }
    if (first || grow.length) {
      painter.begin({
        number, box: first ? promptBox() : countBoxNow(now), seed: number + 1, rgb: coreRgb(),
        traceMs,
        inkScale: params.get('countCInk') * params.get('countRFigInk'),
        figure: 'ringstave',
        skipStave: !first,
        places: first ? null : grow,
      });
      phase = 'paint';
      phaseStart = now;
    }
  }
  // One slot's figure as a white raster (cached per size / slot / digit).
  const figLayers = new Map();
  function ringStaveFigureLayer(size, radiusPx, number, slot) {
    const d = placeDigits(number)[slot] ?? 0;
    const key = `${Math.round(size)}:${slot}:${d}`;
    if (figLayers.has(key)) return figLayers.get(key);
    const { paths } = ringStaveGrowthPx({ number, size, padFrac: 0.10, slots: params.get('ringSlots') });
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(size)); c.height = c.width;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const p of paths) {
      if (p.place !== `slot${slot}`) continue;
      const pts = p.points;
      for (let i = 1; i < pts.length; i++) {
        ctx.lineWidth = Math.max(1, radiusPx * ((pts[i - 1].wf ?? 1) + (pts[i].wf ?? 1)));
        ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      }
    }
    const layer = { c, centre: { x: c.width / 2, y: c.height / 2 } };
    figLayers.set(key, layer);
    return layer;
  }
  // The count anchor as a client-space box (the breathing transform of
  // countGeom), so figures painted now sit on the ring where it is now.
  function countBoxNow(now) {
    const g = countGeom;
    const T = Math.max(0.5, params.get('countBreatheS')) * 1000;
    const amp = params.get('countBreathe') / 100;
    const ph = (now / T) * Math.PI * 2;
    const s = 1 + amp * Math.sin(ph);
    const dx = amp * g.w * 0.6 * Math.sin(ph * 0.61 + 1.3);
    const dy = amp * g.h * 0.6 * Math.sin(ph * 0.43 + 2.9);
    const w = g.w * s, h = g.h * s;
    return { x: g.cx - w / 2 + dx, y: g.cy - h / 2 + dy, w, h };
  }
  // The ring-stave ring as a white raster: the builder's stave polyline with
  // its width profile, drawn as round-capped segments.
  function ringStaveRingCanvas(size, radiusPx) {
    const { paths } = ringStaveGrowthPx({ number: 0, size, padFrac: 0.10 });
    const ring = paths.find(p => p.place === 'stave');
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(size)); c.height = c.width;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pts = ring.points;
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = Math.max(1, radiusPx * ((pts[i - 1].wf ?? 1) + (pts[i].wf ?? 1)));
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
    return c;
  }

  // Lab: the ring-stave numeral stands in for the Cistercian wherever the
  // growth painter draws (the ∞/⧖ prompt and the left counter).
  function figureKind() { return params.get('glyphMix') >= 1 ? 'ringstave' : 'cistercian'; }

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
  // Per-frame keep-alive: pin the ring and the current digits by pulling the
  // dye under their masks toward the target density at the breathing anchor
  // (rate `countPin`). Ink outside the masks — drifted halo, unpinned old
  // digits — is left to the current and the clock. Runs after the sim steps.
  function countMaintain(now, dt) {
    if (!countCurrent || !countGeom) return;
    const ink = countCurrent.ink ?? params.get('countInk');
    const pin = countCurrent.pin ?? params.get('countPin');
    const rect = countRect(now);
    if (countAnims.length) stepCountAnims(now, dt, rect);
    const rgb = coreRgb().map(c => c * 3);
    const animating = new Set(countAnims.map(a => a.place));
    if (!animating.has(-1)) fluid.stamp(countCurrent.ring.c, rect, rgb, pin, { erase: true, target: ink });
    countCurrent.lines.forEach((l, i) => { if (!animating.has(`L${i}`)) fluid.stamp(l.c, rect, rgb, pin, { erase: true, target: ink }); });
    for (const id of countCurrent.drops) {
      if (animating.has(`D${id}`)) continue;
      const [i, k] = id.split(':').map(Number);
      const l = countLayerSync(`drop:${countGeom.size}:${i}:${k}`);
      if (l) fluid.stamp(l.c, rect, rgb, pin, { erase: true, target: ink });
    }
    // ◎: every slot's figure, once it has finished growing.
    if (countCurrent.figs) {
      for (const f of countCurrent.figs.values()) {
        if (now >= f.pinAt) fluid.stamp(f.layer.c, rect, rgb, pin, { erase: true, target: ink });
      }
    }
  }
  // Resolved layers, for the per-frame pin (the promise resolved long ago).
  const countResolved = new Map();
  function countLayerSync(key) {
    if (countResolved.has(key)) return countResolved.get(key);
    const p = countLayers.get(key);
    if (p) p.then((l) => countResolved.set(key, l));
    return null;
  }
  // A drop's landing ripple: the mark's centre, raster px → client px → uv.
  function dropRipple(centre) {
    if (params.get('surface') < 1 || !countGeom) return;
    const g = countGeom;
    const x = g.cx - g.w / 2 + (centre.x / g.rw) * g.w;
    const y = g.cy - g.h / 2 + (centre.y / g.rh) * g.h;
    const { u, v } = fluid.uvFromClient(x, y);
    fluid.disturb(u, v, 0.012, params.get('rippleTouch') * 0.5);
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
      const t = Math.min(1, (now - a.start) / Math.max(1, a.traceMs));
      const f0 = easeOut(a.lastT), f1 = easeOut(t);
      if (f1 > f0) {
        if (a.wedge) fluid.stamp(wedgeSlice(a.neu, a.wedge, f0, f1), a.rect, a.rgb, a.ink, { version: ++countVersion });
        else fluid.stamp(a.neu.c, a.rect, a.rgb, a.ink * (f1 - f0));
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
        deepLink:       document.getElementById('deepLink'),
      };
      fluid = createFluid(els.canvas, { simScale: params.get('simScale') });
      if (!fluid.ok) return;
      painter = createPainter({ fluid, params });
      applyPalette();

      params.on((key) => {
        if (key === 'palette' || key === null) applyPalette();
        if (key === 'simScale' || key === null) fluid.setSimScale(params.get('simScale'));
        if (key === 'inverted' || key === null) document.body.classList.toggle('inverted', params.get('inverted') >= 1);
      });
      document.body.classList.toggle('inverted', params.get('inverted') >= 1);
      window.addEventListener('pointerdown', (ev) => touchRipple(ev.clientX, ev.clientY), { passive: true });

      els.modeBtns.forEach((btn) => {
        btn.addEventListener('click', () => { if (btn.dataset.mode) on.modeSelect(btn.dataset.mode); });
      });
      els.gameover.addEventListener('click', on.gameOverTap);
      if (els.count && on.countHold) wireHold(els.count, on.countHold);
      // The hidden ⧉: copy the deep link of what is on screen; a successful
      // copy flashes the glyph once, its only visible moment.
      if (els.deepLink && on.copyLink) {
        els.deepLink.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const ok = await on.copyLink();
          if (!ok) return;
          els.deepLink.classList.add('flash');
          setTimeout(() => els.deepLink.classList.remove('flash'), 700);
        });
        els.deepLink.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      }
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
      if (name === 'gameover') resultPending = true;
      else { resultPins = []; els.gameover.classList.remove('ink-only'); }
    },

    startRun({ mode, totalMs }) {
      run = { mode, timeRemainingMs: totalMs, totalMs };
      countShown = null; countGeom = null; countAnims = []; countCurrent = null; countKind = null; countResolved.clear();
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
      if (kind === 'ringstave') { paintRingCount(n, periodMs); return; }
      if (kind !== 'heptaweave') { paintCountGlyph(n, periodMs, figureKind()); return; }
      const digits = [Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
      const stage = els.countStage.getBoundingClientRect();
      const short = Math.min(stage.width, stage.height);
      const size = Math.round(short);
      const token = ++countToken;
      const rgb = coreRgb().map(c => c * 3);
      const ink = params.get('countInk');

      // The logogram as a diegetic figure. Every lobe always carries its five
      // LINES (the digit-0 marks), pinned for good. A DROP is ink added on top
      // of a line wherever the digit's pattern has a dot; when the pattern
      // loses that dot the drop is released and dissolves, and the line it
      // sat on is simply still there. Counting is one slot changing per beat.
      // Layers: ring, one line layer per place (from digit 0), one drop layer
      // per place × slot (from digit 5, the all-dots digit) — shapes fixed by
      // construction, so a mark that stays is the same ink the whole time.
      const svgFor = (num) => {
        const svg = renderHeptapodNumeralV2({
          number: num, size, seed: 0xc0ffee,
          ...HEPTAWEAVE_CHOICE_TUNE, ...loadTune(),
          haloOpacity: 0, lobeRng: true,
        });
        svg.setAttribute('color', '#fff');
        return svg;
      };
      // A layer is { c: canvas, centre: {x,y} raster px of the mark (drops) or
      // of the ring }. Raster px = user units × COUNT_RASTER (pad is 0).
      const layer = (key, num, hide, markSel = null) => {
        if (!countLayers.has(key)) {
          const svg = svgFor(num);
          for (const el of svg.querySelectorAll(hide)) el.setAttribute('display', 'none');
          const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
          const toRaster = (u) => (u - vb[0]) * COUNT_RASTER;
          let centre = { x: toRaster(size / 2), y: toRaster(size / 2) };
          if (markSel) {
            els.countStage.appendChild(svg);
            try {
              const b = svg.querySelector(markSel)?.getBBox();
              if (b && b.width > 0) centre = { x: toRaster(b.x + b.width / 2), y: toRaster(b.y + b.height / 2) };
            } catch {}
            svg.remove();
          }
          countLayers.set(key, rasterizeSvg(svg, COUNT_RASTER).then((c) => ({ c, centre })));
        }
        return countLayers.get(key);
      };
      const lobeOnly = (i) => `.enso, .wet-drop, .lobe:not([data-place="${i}"])`;
      const ringP = layer(`ring:${size}`, 0, '.lobe');
      const lineP = [0, 1, 2, 3].map(i => layer(`lines:${size}:${i}`, 0, lobeOnly(i)));
      // Digit 5 puts a drop in every slot of every place: 5555.
      const dropP = [];
      for (let i = 0; i < 4; i++) for (let k = 0; k < 5; k++) {
        dropP.push(layer(`drop:${size}:${i}:${k}`, 5555, `${lobeOnly(i)}, .lobe[data-place="${i}"] path:not(:nth-of-type(${k + 1}))`, `.ink-crisp .lobe[data-place="${i}"] path:nth-of-type(${k + 1})`));
      }
      const prev = countShown;

      Promise.all([ringP, ...lineP, ...dropP]).then(([ring, ...rest]) => {
        if (token !== countToken || screen !== 'count') return;
        const lines = rest.slice(0, 4), drops = rest.slice(4);
        // Geometry from the ring: the ink box scales to `countSize` of the
        // short side; every layer shares the raster size so one rect fits all.
        if (!countGeom || countGeom.size !== size) {
          const bb = alphaBounds(ring.c);
          if (!bb) throw new Error('empty raster');
          const k = (short * params.get('countSize')) / Math.max(bb.w, bb.h);
          const w = ring.c.width * k, h = ring.c.height * k;
          const cx = stage.left + stage.width / 2, cy = stage.top + stage.height / 2;
          countGeom = { size, cx: cx - (bb.x + bb.w / 2 - ring.c.width / 2) * k, cy: cy - (bb.y + bb.h / 2 - ring.c.height / 2) * k, w, h, rw: ring.c.width, rh: ring.c.height };
        }
        const traceMs = Math.min(params.get('countTrace'), periodMs * 0.9);
        const grow = params.get('countReveal') >= 1;
        const wanted = digits.map(d => PATTERNS[d]);
        const dropAt = (i, k) => drops[i * 5 + k];
        const startAnim = (place, neu, wedge, ms) => {
          const running = countAnims.findIndex(a => a.place === place);
          if (running >= 0) { finishCountAnim(countAnims[running]); countAnims.splice(running, 1); }
          countAnims.push({ place, neu, rgb, ink, wedge, start: performance.now(), traceMs: ms, lastT: 0 });
        };
        if (!prev) {
          // Entry: the ring sweeps round once, every line and every wanted
          // drop soaks in over the trace time. No ripples — nothing "lands".
          countCurrent = { ring, lines, drops: new Set() };
          const c = ring.centre;
          startAnim(-1, ring, grow ? { cx: c.x, cy: c.y, a0: -Math.PI / 2, a1: Math.PI * 1.5, R: Math.hypot(ring.c.width, ring.c.height) } : null, traceMs * 2);
          lines.forEach((l, i) => startAnim(`L${i}`, l, null, traceMs));
          wanted.forEach((pat, i) => pat.forEach((m, k) => { if (m === '.') { countCurrent.drops.add(`${i}:${k}`); startAnim(`D${i}:${k}`, dropAt(i, k), null, traceMs); } }));
        } else {
          wanted.forEach((pat, i) => pat.forEach((m, k) => {
            const id = `${i}:${k}`;
            const had = countCurrent.drops.has(id);
            if (m === '.' && !had) {
              // A drop lands: fast, with a small ripple where it hits.
              countCurrent.drops.add(id);
              startAnim(`D${id}`, dropAt(i, k), null, traceMs);
              dropRipple(dropAt(i, k).centre);
            } else if (m === '-' && had) {
              // Released: it fades on the clock; the line beneath stays.
              countCurrent.drops.delete(id);
              const running = countAnims.findIndex(a => a.place === `D${id}`);
              if (running >= 0) countAnims.splice(running, 1);
            }
          }));
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
      resultPins = []; resultPending = false;
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
