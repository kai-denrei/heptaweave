# heptaweave — ink theme (experimental) — design

Date: 2026-09-03. Status: approved in conversation, building toward a locally
hosted prototype.

## Goal

A second look and feel for heptaweave with the **same rules**. The prompt
glyph is painted into a dark, slowly-moving fluid (the `#ink-flow` look from
onkochishin: curl-noise advection, glowing dye, bloom, caustics, grain) and
**its dissolution is the timer**. Ships as a separate experimental page
(`ink.html`); if it achieves the intended feel it becomes the default.

Alongside: a **test mode** exposing every tunable (fluid, painting, feedback,
stage, rules) as live sliders while playing, with **presets** that save
locally, ship with the app, and share as a URL.

## Decisions made (2026-09-03)

| # | Decision | Alternatives kept in `docs/devlog.md` |
|---|---|---|
| 1 | Dissolve = **run timer in ⧖**, **reveal timer in ∞**. Different modes, different clocks. | — |
| 2 | Choices are **overlaid SVG** (existing `numeralV2`) restyled for the dark stage; on tap the picked glyph is **splatted into the fluid** as feedback (bright bloom drifting off = correct; red splash + drain pulse = wrong). | A: overlay only. B: choices painted into the fluid and re-inked. |
| 3 | Separate `ink.html` now; `main.js` refactored so the theme is an injected **renderer**. A landing toggle later is a two-line change. | — |
| 3b | **Superseded 2026-09-03 (same day):** the ink theme became the default. `ink.html` → `index.html`, old paper page → `paper.html`. The test panel became the **admin** panel (`#admin`, legacy `#test` still works) with a tab per parameter group. | — |
| 4 | Presets: URL hash for sharing + localStorage named slots + a committed `presets.js` list shipped with the app. | — |
| 5 | Glyph is **traced** by parallel brushes (all segments at once, finishing together), then **held** crisp in still water, then the current ramps up and it unspools. **Nothing dissipates until the whole glyph is painted.** Sequential trace remains a test-mode option. | — |
| 6 | Own implementation of the fluid technique — the upstream demo carries no license and heptaweave is public. | — |

## Architecture

```
src/
  main.js                  store, round lifecycle, modes, persistence.
                           boot({ renderer, params }) — no rendering code.
  params.js                tunable schema + live values + overlay
                           (defaults → localStorage → URL) + subscribe.
  game/round.js            buildRound({ score, rng, overrides })
  render/
    renderer.js            the Renderer contract (doc + no-op base)
    paper/paperRenderer.js the existing SVG pipeline, moved verbatim
    ink/
      inkRenderer.js       Renderer impl: choreography per mode
      fluid.js             WebGL engine (dye field, advect, splat,
                           drain, bloom, display). No DOM beyond canvas.
      shaders.js           GLSL sources
      palettes.js          LUT stops + builders
      glyphPainter.js      Cistercian segments → parallel brush trace
                           → splat schedule; SVG path sampler for the
                           heptacipher feedback splash
  test/
    adminPanel.js          slider sheet (tabbed), presets UI, share link
    presets.js             shipped named presets
index.html                 boots ink renderer (default); `#admin` opens the panel
paper.html                 boots paper renderer (behaviour unchanged)
```

### Renderer contract

`main.js` owns state and rules and calls the renderer; the renderer never
reads rules. Every method is synchronous unless noted.

```js
{
  mount(rootEl)                                 // build DOM/canvas once
  showScreen(name)                              // 'landing' | 'play' | 'gameover'
  startRun({ mode, totalMs })                   // reset stage for a fresh run
  paintPrompt({ number, seed, revealMs, mode }) // paint the Cistercian
  clearPrompt({ reason })                       // 'correct' | 'wrong' | 'end'
  renderChoices({ numbers, seed, onPick })      // tappable logograms
  feedback({ number, tileEl, correct })         // per-pick reaction
  renderScore({ score, animateNewBit })
  tick({ dt, timeRemainingMs, totalMs, phase }) // every frame during play
  showGameOver({ mode, score, errors, clean })
  teardown()
}
```

`paperRenderer` wraps the current functions with no visual change. The reveal
fade in paper remains a `setTimeout` in `main.js` that calls
`clearPrompt({ reason: 'reveal' })`; the ink renderer ignores that call in ⧖
(its clock is the run) and uses it as a no-op in ∞ (its clock is the dye's
own dissipation, derived from `revealMs`).

### params.js

Flat schema, one row per tunable: `[group, key, label, min, max, step,
default]` — same shape as `scripts/tune.html`. Groups:

- **fluid** — viscosity (→ flowStr), flowScale, current, filament (curl ε),
  octaves, simScale.
- **dissolve** — dissolveFloor (density fraction considered "gone", 0.02),
  revealScale (multiplier on the table's revealMs), holdMs, rampMs,
  staysCurrent (flow strength for "stays" tiers), staysReinkMs (re-ink
  interval for "stays" tiers; 0 = off).
- **paint** — traceMs, traceMode (parallel|sequential), strokeRadius (as
  fraction of stage), strokeAmount, taper (lens strength), jitter.
- **feedback** — splashAmount, splashRadius, wrongDrainMs, wrongDrainDissip.
- **stage** — palette index, bloomThreshold, bloomGain, caustic, grain,
  vignette, baseLight, timedDimming (how far the stage dims by run end).
- **rules** — pinTier (−1 = off), choiceCount (0 = table), sharedDigits
  (−1 = table), runSeconds, penaltySeconds.

Live values: `params.get(key)`, `params.set(key, v)`, `params.on(fn)`.
Overlay at boot: defaults ← `localStorage['heptaweave.ink.params']` ←
`location.hash` `p=` (base64url JSON of diff-vs-default). URL wins but is not
persisted until the user saves.

Rules params flow into `buildRound({ score, rng, overrides })` and
`MODE_CONFIG` lookups through `main.js`; the renderer only sees the resulting
`revealMs`, `choices`, `totalMs`.

### Fluid engine (`fluid.js`)

Own implementation. Half-float ping-pong dye texture at `simScale` of the
canvas (RGB = color, A = density). Per fixed step (60 Hz, ≤3 steps/frame):

1. **advect** — sample back along a curl-noise velocity (fbm of value noise,
   evolving on z), multiply by `dissip`.
2. **splat** — additive gaussian brush at a uv with color/amount/radius
   (called zero or more times per frame by the painter).
3. **drain** — advect with an aggressive `dissip` for N ms (wrong answer,
   run end, clear).
4. **bloom** — bright-pass + two separable blur passes at quarter res.
5. **display** — palette LUT indexed by (core brightness, density), bloom
   add, refraction caustics from the density gradient, stage baseline ×
   `light`, vignette, filmic tonemap, grain.

API: `create(canvas)`, `resize()`, `step(dt, { dissip, flowStr, current,
… })`, `splat(u, v, rgb, radius, amount)`, `drain(ms)`, `render({ light,
palette, … })`, `destroy()`. Adaptive quality: drop `simScale` after 40 slow
frames, floor 0.34. Canvas-2D fallback: **not** in v1 (WebGL-required page;
the paper theme remains for non-GL devices).

### Glyph painting (`glyphPainter.js`)

`cistercianSegmentsPx({ number, size, padFrac })` (new export in
`cistercianInk.js`) returns `[{ from, to, place }]` in stage px, reusing
`mapPoint`. The painter turns each segment into a brush run:

- position `p(t)` linear from→to, plus a perpendicular gaussian wobble on
  the midpoint (as `segmentControlPoints` does today);
- radius `r(t) = strokeRadius × lens(t)` (stave: flatter profile);
- amount constant × per-step jitter;
- parallel mode: every segment runs over `traceMs`; sequential: stave then
  digits in place order, total `traceMs`.

Each animation frame the painter emits the splats for `t ∈ (t_prev, t_now]`
at a spacing of ≈ r/2 so strokes are continuous at any framerate.

The feedback splash samples the tile's own `<path>` elements
(`getPointAtLength` every ~4 px, mapped through `getScreenCTM` to screen px →
uv) and splats them in one frame with the correct/wrong color.

### Choreography

**Common** — round start: `paintPrompt` → phase PAINT (`dissip` 1.0, flow 0)
for `traceMs` → HOLD for `holdMs` → RAMP over `rampMs` (current and
dissipation ease from still to the mode's target) → FLOW.

**∞ mode (dissolve = reveal timer)** — target `dissip` is derived so density
falls to `dissolveFloor` over `revealMs × revealScale` at 60 steps/s:
`dissip = floor^(1 / (60 × seconds))`. For "stays" tiers (revealMs 0):
`dissip` 1.0, `flowStr` = `staysCurrent` (a breathing drift), and the glyph
is re-inked at low amount every `staysReinkMs` so it never smears illegible.
Correct → `clearPrompt('correct')`: a short bright bloom then a drain pulse
clears the field for the next glyph. Wrong → run over (rule unchanged):
red splash on the tile, whole field drains.

**⧖ mode (dissolve = run timer)** — each round's glyph is painted the same
way, but its target `dissip` is derived from the **time remaining in the
run** (density reaches `dissolveFloor` exactly when the clock would hit 0).
Early rounds barely move; late rounds evaporate fast. The stage `light`
also eases from `baseLight` to `baseLight × (1 − timedDimming)` across the
run — the darkening room is the second read of the clock. Wrong → the
`penaltySeconds` are deducted (rule unchanged) and rendered as a drain pulse
of `wrongDrainMs` at `wrongDrainDissip` — ink visibly *spent*. At 0 the
field drains fully and game-over shows. No timer ring in this theme.

**Feedback (decision 2)** — correct: the tile's glyph is splatted in the
palette's core color with `splashAmount`, then the tile fades; wrong: the
same splat in the accent red plus the drain pulse. Overlaid tiles keep a
CSS glow (`drop-shadow` in the core color); the fluid is the reaction.

**Score / game-over** — binary score row reused (`binaryScore.js`) in the
core color with a glow. Game-over reuses the trinity + dot on the dark
stage; the fluid keeps drifting underneath at idle current.

### Test mode

Opened by `#admin` (legacy `#test`) or a 1 s long-press on the landing's bottom-right
corner (the region already exists). A bottom sheet over the play surface:
grouped sliders (one per `params` row), live; a preset row: name field,
save, load/delete for local slots, the shipped list, **copy link** (writes
`#p=` to the URL and the clipboard), **reset**. The sheet can collapse to a
handle so a round can be played with it open. It is a dev surface: **text
labels are allowed here** — the no-Latin rule applies to the play surface,
and the sheet is only reachable via a deliberate gesture or URL.

`presets.js` ships named presets as `{ name, diff }`; the first entry is the
default look. Adding a preset to the app = paste the share-URL's diff into
this list.

### Persistence

- `heptaweave.ink.params` — saved param diff (explicit save only).
- `heptaweave.ink.presets` — `{ name: diff }` local slots.
- `heptaweave.best` — unchanged, shared with paper (same rules, same
  scores).

## Error handling

- No WebGL / FBO not renderable → the page shows the ⊘ sigil and a link
  glyph to `paper.html`. No 2D fallback in v1.
- Context loss → re-init engine, re-paint the current prompt (painter keeps
  the current glyph description).
- Malformed `#p=` → ignored, defaults used.
- Resize → engine re-allocates; the current prompt is re-painted.

## Testing

- `scripts/smoke-pure.mjs` — extend: `buildRound` overrides (pinTier,
  choiceCount, sharedDigits), `params` overlay + URL codec round-trip,
  `dissipFor(seconds)` math.
- `scripts/ink-screenshot.html` + headless Chrome (`--use-angle=swiftshader`
  or `--enable-unsafe-swiftshader`) — boots the ink page, starts ∞, waits
  through trace/hold, screenshots at 3 points (painted, half-dissolved,
  gone). Also the paper page after the refactor: pixel-equivalent to today.
- Manual on phone via the dev server: the actual acceptance test.

## Out of scope (v1)

Landing theme toggle; PWA manifest changes; Canvas-2D fallback; choices in
the fluid (devlog alt B); reduced-motion variant of the fluid (the page is
inherently kinetic — note it and revisit).
