// paperRenderer.js — the cream-paper / sumi-ink theme.
//
// The original heptaweave look, moved verbatim out of main.js behind the
// Renderer contract (see ../renderer.js). Owns the DOM in index.html.
//
// External invariants:
//   • Public view shows ONLY ⧖, ∞, brush marks, ring, dots. No Latin chars
//     or Arabic numerals ever land in the DOM during play.

import { createRng } from '../../util/rng.js';
import { renderCistercianInk } from '../../cistercian/cistercianInk.js';
import { renderHeptapodNumeralV2 } from '../../heptacipher/numeralV2.js';
import { renderBinaryScore } from '../binaryScore.js';
import { createTimerRing } from '../timerRing.js';
import { renderGameOverDot } from '../gameOverDot.js';
import { buildInkFilters } from '../../ink/filters.js';
import { layoutChoices } from '../choiceLayout.js';
import { HEPTAWEAVE_CHOICE_TUNE, loadTune } from '../choiceTune.js';
import { noopRenderer } from '../renderer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createPaperRenderer() {
  let els = null;
  let timerRing = null;
  let lastBitCount = 0;

  // --------------------------------------------------------------------------
  // Score row
  // --------------------------------------------------------------------------
  function renderScore({ score, animateNewBit = false }) {
    const { groupEl, width } = renderBinaryScore({
      score,
      markSize: 18,
      rng: createRng(score + 1),
    });
    // Fixed 8-bit row, LSB-on-left. Group's leftmost bit sits at x=0, so we
    // anchor its left edge to the score-row container's left edge.
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `-12 -16 ${width + 24} 32`);
    svg.setAttribute('height', '28');
    svg.style.color = 'var(--ink)';
    if (animateNewBit) {
      const flipped = (score & ~lastBitCount);
      let bitIdx = -1;
      for (let i = 0; i < 8; i++) if ((flipped >> i) & 1) { bitIdx = i; break; }
      if (bitIdx >= 0) {
        const path = groupEl.querySelector(`path[data-bit-index="${bitIdx}"]`);
        if (path) path.classList.add('new-bit');
      }
    }
    svg.appendChild(groupEl);
    els.scoreRow.replaceChildren(svg);
    lastBitCount = score & 0xff;
  }

  // --------------------------------------------------------------------------
  // Game-over trinity
  // --------------------------------------------------------------------------
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

  function renderBigHeptacipher(score) {
    const tune = loadTune();
    const svg = renderHeptapodNumeralV2({
      number: Math.max(0, Math.floor(score)) & 0xff,
      size: 220,
      seed: 0xfeedface ^ (score + 1) * 2654435761,
      ...HEPTAWEAVE_CHOICE_TUNE,
      ...tune,
    });
    els.bigHeptacipher.replaceChildren(svg);
  }

  function cistercianSvg(number, size, rng, idTag) {
    const { segmentPaths } = renderCistercianInk({
      number,
      size,
      rng: createRng(rng.seed),
      padFrac: 0.10,
      strokeWidthFrac: 0.022,
    });
    const filters = buildInkFilters({
      idTag,
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
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML = filters.defs;
    svg.appendChild(defs);
    // Three copies of the inner content (far halo, near halo, crisp).
    const inner = `<g fill="currentColor">${segmentPaths.map(d => `<path d="${d}"/>`).join('')}</g>`;
    svg.insertAdjacentHTML('beforeend', `
      <g filter="url(#${filters.farId})"   opacity="${filters.farOpacity}"  fill="currentColor">${inner}</g>
      <g filter="url(#${filters.nearId})"  opacity="${filters.nearOpacity}" fill="currentColor">${inner}</g>
      <g filter="url(#${filters.crispId})" opacity="0.92"                   fill="currentColor">${inner}</g>
    `);
    return svg;
  }

  function renderBigCistercian(score) {
    const n = Math.max(0, Math.floor(score)) & 0xff;
    const svg = cistercianSvg(n, 220, createRng((n + 1) * 991),
      'csc-go-' + ((n * 31) & 0xfffff).toString(36));
    els.bigCistercian.replaceChildren(svg);
  }

  // --------------------------------------------------------------------------
  // Prompt (Cistercian stage)
  // --------------------------------------------------------------------------
  function paintPrompt({ number, seed }) {
    const stageBox = els.stage.getBoundingClientRect();
    const size = Math.min(stageBox.width, stageBox.height) || 360;
    const seedSalt = seed;
    const svg = cistercianSvg(number, size, createRng((number + 1) * 17 ^ seedSalt),
      'csc' + ((number * 31 + seedSalt) & 0xfffff).toString(36));
    els.stage.replaceChildren(svg);
    els.stage.classList.remove('fading', 'hidden');
  }

  function clearPrompt({ reason }) {
    if (reason === 'reveal') els.stage.classList.add('fading');
    else els.stage.classList.remove('fading', 'hidden');
  }

  // --------------------------------------------------------------------------
  // Choices
  // --------------------------------------------------------------------------
  function renderChoices({ numbers, seed, onPick }) {
    els.choices.className = 'choices cN-' + numbers.length;
    els.choices.replaceChildren();

    const mid = els.choices.parentElement.getBoundingClientRect();
    const cistRect = els.stage.getBoundingClientRect();
    const promptRadius = (Math.min(cistRect.width, cistRect.height) || mid.width * 0.40) / 2;
    const { tileSize, centers } = layoutChoices({
      width: mid.width, height: mid.height, promptRadius, count: numbers.length,
    });
    const tileR = tileSize / 2;

    // numeralV2 internal size such that rendered SVG width = tileSize.
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
      tile.style.top  = `${y - tileR}px`;
      // Don't expose the numeric answer in any attribute or textContent.
      tile.appendChild(renderHeptapodNumeralV2({
        number: n,
        size: v2Internal,
        seed: seed ^ (n * 7919),
        ...HEPTAWEAVE_CHOICE_TUNE,
        ...tune,
      }));
      tile.addEventListener('click', () => onPick(n, tile));
      els.choices.appendChild(tile);
    });
  }

  function feedback({ tileEl, correct }) {
    tileEl.classList.add(correct ? 'correct' : 'wrong');
  }

  // --------------------------------------------------------------------------
  // Timer ring (⧖ only)
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // Contract
  // --------------------------------------------------------------------------
  return {
    ...noopRenderer,

    mount({ on }) {
      els = {
        landing:    document.getElementById('screenLanding'),
        play:       document.getElementById('screenPlay'),
        gameover:   document.getElementById('screenGameOver'),
        modeBtns:   document.querySelectorAll('.mode-btn'),
        cornerHold: document.getElementById('cornerHold'),
        scoreRow:   document.getElementById('scoreRow'),
        timerWrap:  document.getElementById('timerRingWrap'),
        stage:      document.getElementById('cistercianStage'),
        choices:    document.getElementById('choices'),
        bigBinary:       document.getElementById('bigBinary'),
        bigHeptacipher:  document.getElementById('bigHeptacipher'),
        bigCistercian:   document.getElementById('bigCistercian'),
        gameDot:         document.getElementById('gameOverDot'),
      };
      els.modeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode;
          if (mode) on.modeSelect(mode);
        });
      });
      els.gameover.addEventListener('click', on.gameOverTap);
      if (els.cornerHold) wireCornerHold(els.cornerHold, on.cornerHold);
    },

    showScreen(name) {
      els.landing.hidden  = (name !== 'landing');
      els.play.hidden     = (name !== 'play');
      els.gameover.hidden = (name !== 'gameover');
    },

    startRun({ mode, totalMs }) {
      lastBitCount = 0;
      els.choices.replaceChildren();
      if (mode === 'TIMED') ensureTimerRing(totalMs, totalMs);
      else teardownTimerRing();
    },

    paintPrompt,
    clearPrompt,
    renderChoices,
    feedback,
    renderScore,

    tick({ mode, timeRemainingMs, totalMs }) {
      if (mode === 'TIMED') ensureTimerRing(timeRemainingMs, totalMs);
    },

    showGameOver({ score, clean }) {
      teardownTimerRing();
      renderBigBinary(score);
      renderBigHeptacipher(score);
      renderBigCistercian(score);
      const dotPath = renderGameOverDot({
        clean,
        size: 48,
        rng: createRng((score + 1) * 311),
      });
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '-30 -30 60 60');
      svg.appendChild(dotPath);
      els.gameDot.replaceChildren(svg);
    },

    teardown() {
      teardownTimerRing();
    },
  };
}

/** 1-second press on an invisible corner target fires `fn`. */
export function wireCornerHold(el, fn) {
  let pressTimer = null;
  const start = () => {
    pressTimer = setTimeout(() => { pressTimer = null; if (fn) fn(); }, 1000);
  };
  const cancel = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
}
