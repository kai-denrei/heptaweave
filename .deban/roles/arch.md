---
role: arch
owner: claude-on-kainode
status: active
last-updated: 2026-05-20
---

# Architecture — heptaweave

## Scope
Module layout, data flow, render pipeline, state-machine shape, dependencies
on parent projects.

## Decisions
| Date | Decision | Rationale | Linked roles |
|---|---|---|---|
| 2026-05-20 | Vanilla ES modules, no bundler. | Same stack as heptacipher; instant edit-reload via the no-cache dev server. Zero build complexity. | [[dev]] |
| 2026-05-20 | Ink primitives (brush, splotch, enso) copied verbatim from heptapod-logograms. Filter defs extracted into `src/ink/filters.js`. | Battle-tested, calligraphic look already nails the cream/sumi aesthetic. | [[dev]] |
| 2026-05-20 | Cistercian math (digitMap.js, buildSigil.js, geometry.js helpers) ported from CistercianWeave; segments rendered with brushStroke, NOT particles. | The particle canvas is the wrong aesthetic. The math is portable. | [[dev]] |
| 2026-05-20 | RNG = mulberry32 from heptacipher (more useful API: int, range, gauss, shuffle). | Single RNG everywhere lets every render be deterministic per round seed. | [[dev]] |
| 2026-05-20 | State machine in one module (`src/game/state.js`), pure-function transitions. Render loop subscribes to state changes. | Tiny project; a big framework would be overkill. | [[dev]] |
| 2026-05-20 | Cistercian rendered into the same SVG as the morse choices but in different element groups; both reuse the same filter defs. | Avoids two filter pipelines. | [[design]] |
| 2026-05-20 | Single canonical heptacipher renderer: `src/heptacipher/numeralV2.js`. Verbatim port of `renderHeptapodNumeralV2` from heptapod-logograms/compositeFlow.js, minus the draw-mask animation. Choice-tile customization happens via parameters at the call site, NOT by forking the implementation. | A/B "lobes-only vs full mini" was a divergence from the canonical design that lost the original's tuning. The user explicitly preferred the original balance. | [[dev]] [[design]] |
| 2026-05-20 | Heptaweave-specific knobs (per-project visual tune) layered via `HEPTAWEAVE_CHOICE_TUNE` in main.js, spread on top of canonical V2 defaults. localStorage.heptaweave.tune wins over both, so the slider page can override at runtime. | Layered defaults: canonical (renderer) → project (main.js) → session (localStorage). Each layer is overridable without touching the one below. | [[dev]] |
| 2026-05-20 | Choice layout is per-count slot presets (LAYOUT_PRESETS) with normalized offsets from play-mid center, plus ±2% gaussian jitter. NOT an even-angle orbit. | Mockup shows organic quincunx (4 corners + bottom-center for 5 choices). Even-angle distribution looked too mechanical. | [[design]] |

### Bit-milestone difficulty (canonical table)
Tier = `bitlength(score)`. All three levers advance per tier.

| Score range | Tier | Reveal | Choices | Closeness (shared digits) |
|---|---|---|---|---|
| 0       | 0 | stays  | 2 | random |
| 1       | 1 | stays  | 3 | random |
| 2–3     | 2 | 8000ms | 3 | random |
| 4–7     | 3 | 6000ms | 4 | 1 |
| 8–15    | 4 | 5000ms | 5 | 1 |
| 16–31   | 5 | 4000ms | 5 | 2 |
| 32–63   | 6 | 3000ms | 6 | 2 |
| 64–127  | 7 | 2500ms | 7 | 3 |
| 128–255 | 8 | 2000ms | 7 | 3 |
| 256+    | 9+| 1500ms | 7 | 3 + magnitude-matched |

`stays` = Cistercian remains visible until the player taps.

### Module layout
```
src/
  main.js                 — top-level wiring, mode select, mount
  util/rng.js             — mulberry32 + helpers (verbatim from heptacipher)
  ink/
    brush.js              — verbatim
    splotch.js            — verbatim
    enso.js               — verbatim
    filters.js            — feTurbulence/feDisplacementMap defs, reusable
  cistercian/
    digitMap.js           — verbatim from CistercianWeave
    buildSigil.js         — verbatim (returns {number, digits, segments})
    cistercianInk.js      — render segments as brushStroke paths into an SVG
  heptacipher/
    morsePatterns.js      — canonical PATTERNS table (digit → 5 marks)
    morseDigitArc.js      — verbatim from heptacipher (lobe + 5 marks),
                            plus dotSizeFactor/dashWidthFactor/dashMinWidth
                            params so tuning can adjust mark sizing without
                            mutating the canonical formulas
    numeralV2.js          — single renderer: verbatim port of compositeFlow's
                            renderHeptapodNumeralV2, minus draw-mask animation.
                            Adds tuning overrides + disableJitter for the
                            tune UI's reproducible preview.
  render/
    binaryScore.js        — top-left binary row in brush marks
    timerRing.js          — shrinking circular timer for ⧖ mode
    gameOverDot.js        — green/red dot + binary score
  game/
    state.js              — state machine (pure transitions)
    difficulty.js         — score → {revealMs, choiceCount, sharedDigits}
    distractors.js        — pick N-1 distractors given target + closeness
    modes.js              — ⧖ and ∞ mode rules
    round.js              — round init + tick + answer handling
```

### Data flow per round
1. `state` enters ROUND_INIT. Pull difficulty config from `difficulty(score)`.
2. Pick target number (random 0–9999). Build distractors via
   `distractors(target, count, sharedDigits)`. Shuffle into choice list.
3. Render Cistercian into stage SVG. Render N choice circles around it.
4. Enter REVEAL phase. If revealMs > 0, schedule fade after that many ms.
5. Enter CHOOSE. On click: ANSWER. Correct → score++, next round. Wrong →
   mode-specific penalty.
6. Loop until mode-specific game-over condition fires.

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|
| 2026-05-20 | Ship two parallel choice renderers (A = lobes-only, B = full mini) with a long-press A/B toggle on landing for playtest comparison. | User feedback after seeing real renders: "the balance of the original was more pleasant." The A variant was a divergence (all-outward lobes, gap at top), not a legitimate alternative design. Retired both; canonical V2 is now the only renderer. The A/B toggle UI is hidden but the localStorage key + landing region are still wired for future use. |

## Lessons
- **Heptaweave-specific visual choices belong at the call site (main.js) or in a project-tune layer, never as forks of the canonical renderer.** — from the choiceA/choiceB retirement, 2026-05-20. When a fork sneaks in, every later change costs double (apply to both, diff against canonical, lose the original's tuning). Architecturally enforce this by keeping the canonical renderer's signature flexible (lots of optional params with sensible defaults).
- **A localStorage-backed tuning layer between the renderer and the call site is a clean third tier.** — same session. Lets the user dial in values WITHOUT a code change, while keeping the canonical defaults intact for any consumer that doesn't opt in. See [[dev]] Lessons for the methodology note.

## Open Questions
- [ ] Single SVG vs multiple SVGs for the play screen — single is easier for filter sharing, multiple is easier for animating individual choices. Default v1: one SVG for Cistercian, one per choice circle (HTML positioning around them).  — owner: claude-on-kainode — since: 2026-05-20
- [ ] How close is "magnitude-matched" closeness? Default: distractors within ±25% of target magnitude.  — owner: claude-on-kainode — since: 2026-05-20

## Assumptions
- 7 morse choice circles + Cistercian + binary row + timer ring fit in a 390×844 viewport.  — status: untested — since: 2026-05-20
- The same filter defs work for both Cistercian and the choice glyphs.  — status: untested — since: 2026-05-20

## Dependencies
Blocked by:
Feeds into: [[dev]]

## Session Log
- 2026-05-20 (tune session) — Replaced A/B renderer split with a single canonical `numeralV2.js` port + a project-tune layer (`HEPTAWEAVE_CHOICE_TUNE`) + an optional localStorage override layer for the slider page. Choice layout switched to per-count organic quincunx presets. Two architecture lessons added.
- 2026-05-20 — Architecture seeded; difficulty table canonical.
