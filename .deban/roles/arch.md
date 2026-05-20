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
    morseDigitArc.js      — verbatim from heptacipher (lobe + 5 marks)
    choiceA.js            — lobes-only renderer (circle IS the ensō, 4 lobes)
    choiceB.js            — full mini renderer (inner ensō + 4 × 5 marks)
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

## Lessons

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
- 2026-05-20 — Architecture seeded; difficulty table canonical.
