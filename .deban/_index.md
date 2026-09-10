---
project: heptaweave
created: 2026-05-20
status: active
mode: solo
stale_threshold_days: 30
---

# heptaweave — Index

## Brief
Solo PWA, symbol-only UI, one rules engine under two renderers. The default
look (since 2026-09-10) is black ink on rippling pale water: a WebGL dye
field with a wave-equation surface. Game: a Cistercian numeral (0–9999) grows
as one trait and dissolves — its dissolution is the clock — and the player
picks the matching heptacipher logogram. Two modes, ⧖ and ∞, bit-milestone
difficulty, fixed 8-bit score. Beside the game, three counters: + left
(Cistercian, to 10^8), + right (logogram, per-slot drops on permanent lines),
◎ top-right (the ring-stave numeral — Cistercian digit logic on the
heptaweave's ring — with a permanent hovering ring and per-slot permanent
figures). Deep links `#countup1..3&t=`. Tuning via `#admin`; experiments via
the hidden ⚙ lab. `paper.html` is the original cream-paper renderer.

## Active Roles
- [[pm]] — owner: claude-on-kainode
- [[arch]] — owner: claude-on-kainode
- [[dev]] — owner: claude-on-kainode
- [[design]] — owner: claude-on-kainode

## Key Decisions
- Borrow brush/splotch/enso/morseDigitArc verbatim from heptapod-logograms.
- Port digitMap.js and buildSigil.js verbatim from CistercianWeave, render
  the resulting segments with brushStroke (NOT particles).
- Vanilla ES modules, no bundler, no toolchain — same shape as heptacipher.
- Symbol-only UI: ⧖, ∞, brush marks, ring, dots. No Latin/Arabic during play.
- Single canonical renderer (`numeralV2.js`, direct port of compositeFlow's
  V2). A/B renderer split retired — user preferred original balance.
- Choice layout: organic quincunx slot presets per count (NOT even orbit).
- Score: fixed 8-bit, LSB on the LEFT (1=`●-------`, 17=`●---●---`).
- ⭐ Tuning workflow: `scripts/tune.html` (18-slider live-preview UI with
  localStorage persistence) is the project-default approach for any visual /
  generative parameter dial-in. See [[dev]] and [[pm]] Lessons.
- PWA update flow is opt-in (page-driven `SKIP_WAITING`), not auto-takeover.
  Symbol-only meta-UI for update toast (↻) + install affordance (⤓) + offline
  page (⊘). prefers-reduced-motion honored in the paper theme.
- 2026-09-03: **two themes over one rules engine.** `main.js` is rules-only and
  drives an injected renderer (`src/render/renderer.js`). The **ink** theme —
  the prompt glyph painted into a WebGL dye field, its dissolution IS the timer
  (⧖ = run clock, ∞ = reveal clock) — is the **default** at `index.html`; the
  original paper theme is at `paper.html`. Accepted as a v1; revisit deferred.
- 2026-09-03: every ink tunable lives in `src/params.js` (defaults ←
  localStorage ← URL `#p=`), surfaced by the tabbed **admin** panel (`#admin`
  or a 1 s corner hold) with presets that save locally, ship in
  `src/test/presets.js`, and share as a link. Same workflow as tune.html,
  generalised.

- 2026-09-09/10: **permanence in a dissolving medium** = the stamp pass's
  restore mode pinning raster layers at a breathing anchor; **diegetic
  counting** = only the slot that changes is redrawn; **figure-agnostic
  growth painter** (Cistercian, ring-stave) — see [[arch]] 2026-09-10.
- 2026-09-10: **inverted ground + water surface promoted to the default**;
  **ring-stave numeral** (no stems; ring opens at the bottom, thin end =
  units, thick end = highest place, 8 slots) built and given its own door.
- Deploy discipline: `bust.sh` + `CACHE_VERSION` bump + push ([[dev]] Lessons).

## Open Questions (cross-role)
- **Resolved 2026-09-09/10:** one-trait Cistercian built (digit 6 self-seeded);
  the inversion is superseded in practice by the counters and the ring-stave
  glyph, but the Renderer **kind axis** it needed is only half-built
  ([[arch]]) — finish it before any ring-stave *game* mode ([[pm]]).
- **Provisional defaults:** every look number set on 2026-09-09/10 is a
  headless-verified first guess awaiting the operator's tuned JSON ([[pm]]).
- **`paper.html`'s fate** now that the default is ink-on-water, and the
  counters' differing ceilings (10^8 vs 10^4) ([[pm]]).
- **Consequences of making a WebGL theme the default, unresolved:** no-WebGL
  devices land on the ⊘ sigil instead of the playable paper theme;
  `prefers-reduced-motion` is not honored by the fluid; real-device frame
  rate never measured (all verification was software rasterisation). See
  [[pm]] Open Questions / Assumptions.
- See per-role files; ⧖-with-errors dot color, persistence model,
  mobile wet-bleed perf, Cistercian fade animation, 8-bit score cap behavior
  — defaulted for v1, pending playtest revision.
- A/B toggle question resolved 2026-05-20: canonical V2 is the only renderer.
