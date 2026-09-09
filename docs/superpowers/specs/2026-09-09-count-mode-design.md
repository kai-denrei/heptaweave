# + count mode — design

Date: 2026-09-09. Operator: "create a mode that counts UP, that's it, no game,
it's represented with a + on the landing page … one large Heptaweave, in ink,
which counts up, starting from zero. There is ink effect but it's quite
stable." Answered in-session: one per second (stopwatch), 1 s hold to leave.

## Rules (`src/game/`)

- `MODE.COUNT` and `PHASE.COUNT`. `MODE_CONFIG[COUNT]` carries `counter: true`,
  `periodMs: 1000`, `wrapAt: 10000` (the logogram is four-digit).
- `startGame(mode)` branches to `startCount()` for counter modes: no round,
  no score row, `showScreen('count')`, `renderCount({ value: 0 })`. The frame
  loop computes `floor(elapsed / periodMs) % wrapAt` and calls `renderCount`
  only when the value changes. `on.countHold` → `backToLanding`.

## Renderer contract

- `showScreen('count')`, `renderCount({ value, seed, periodMs })`, and
  `on.countHold()` in `mount`. `noopRenderer` gains `renderCount`. Paper has
  no `+` button and no count screen, so it never receives these.

## Ink renderer

- Landing: `+` button, absolutely positioned on the right edge, vertically
  centred, off the ⧖/∞ column.
- Count screen `#screenCount` with an unseen `#countStage` used only for
  measuring. The logogram (`renderHeptapodNumeralV2`, halo off, white) is
  serialised, rasterised to a canvas at 2×, and **stamped** into the dye in
  one GL pass (`FRAG_STAMP`, `fluid.stamp()`, `fluid.rectFromClient()`).
  Splatting its paths was tried first and dropped the app to ~6 fps — see
  the dead end in `.deban/roles/dev.md`.
- Stability: on the count screen dissipation is `countFade` (0.996), current
  is `flowStrength × countDrift` (0.1), diffusion is off, no wisps.
- **Layers, not a whole redraw** (operator, 2026-09-09: "only the digits
  that change, otherwise it is blinking too much"). The numeral is cut into
  a ring layer and one layer per digit place (`numeralV2` wraps each lobe in
  `<g class="lobe" data-place>`; `lobeRng: true` gives each lobe its own
  rng stream so a digit's marks depend only on place and value; fixed seed).
  Layers cache by key. On a tick the change is handed to the frame loop as a
  transition spanning the whole period (operator: "it grows over 1 second …
  or dims"): the new digit's ink that the old digit did not already have
  sweeps in as an angular growth front about the ring centre
  (`countReveal` 1) or dims in (`countReveal` 0); the old digit's ink that
  the new one does not share is faded by the fluid (`FRAG_STAMP` erase mode
  each frame, reaching the dissolve floor as the period ends; mask dilated by
  `countErase` px with the ring and the new digit punched out). Shared marks
  are untouched (and keep being topped up during the transition).
- **Breathing, no refresh** (operator: "the ring should also breathe a
  little, slow drift, and it should not refresh with sudden changes in
  brightness"). The keep-alive is a per-frame trickle: the ink the fade
  removed since the last trickle is stamped back as soon as it reaches a
  dose that survives byte textures (~every 100–200 ms at defaults), never a
  once-a-second top-up. The stamp anchor breathes: scale swells by
  `countBreathe` % over `countBreatheS` seconds and the figure drifts on
  two slower sines; ink follows through the fluid because the trickle lands
  at the moving anchor while the old position fades, leaving soft trails. Mask uploads are cached per source so the static
  erase mask costs one upload per transition.
- Hold: `wireHold` (1 s pointerdown) on the count screen. A tap does nothing.

## Params (group `count`)

`countSize` (ink bounding box as a fraction of the short side, measured from the raster's alpha; 0.8), `countInk` (0.22), `countDrift`,
`countFade`, `countErase`, `countReveal`, `countBreathe`, `countBreatheS`. All live in `#admin`.

## Left +: the Cistercian counter (`MODE.COUNT_C`)

Operator, 2026-09-09: "another + on the left, that one does a count up, but
with the cistercian glyph from the infinite section … with the settings once
you already had 16 or so correct and it fades quickly, we do not want too
much overlap, especially of the stems … elegant ink fading and new one
applied."

- `MODE_CONFIG` entries carry `glyph: 'heptaweave' | 'cistercian'`; main.js
  passes it through `renderCount`. Same counter loop, same hold-to-leave.
- The renderer paints with the growth-front painter, as the ∞ prompt does,
  but with a per-glyph tempo: `traceMs = countCTrace` (320), hold 0, ramp
  `countCRamp` (150), dissipation from `countCLife` (0.9 s, i.e. faster than
  the score-16 tier's 5 s so a glyph is a ghost before the next lands),
  current `flowStrength × countCFlow`, stroke ink × `countCInk`. The water is
  **never frozen** on this screen: the previous glyph keeps dissolving while
  the next is traced, which is what keeps consecutive stems from stacking.
- `promptBox()` measures the count stage at `countCSize` (0.7) on the count
  screen, so the same painter lands in the right place.
- Params group `countC`: size, grow time, ramp, gone-after, current ×, ink ×.

## Verification

`node scripts/ink-cdp-shots.mjs <out> COUNT "" 400,1400,1850,2400,6300`:
value stamped, held, dimmed in the drain window, replaced. A scratch CDP
script confirmed a 300 ms press stays and a 1 s hold returns to landing.
