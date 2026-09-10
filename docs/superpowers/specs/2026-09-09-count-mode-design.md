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

## Deep links and the hidden ⧉ (2026-09-10)

- `MODE_CONFIG[...].deepLink`: `countup1` = left (Cistercian), `countup2` =
  right (logogram). `modeFromHash()` reads the hash at boot (composable with
  `admin` / `p=`), and `boot({ hash })` starts that mode straight from the
  landing. Hold-to-leave still returns to the landing; the hash stays so a
  reload re-enters.
- `#deepLink`: a 48 px invisible button fixed at the top-left of every screen.
  Click → `on.copyLink()` → main.js copies `deepLinkUrl()` (the current
  mode's link, or the bare page URL on the landing). A successful copy flashes
  the glyph once; that is its only visible moment.

### Start-time links (later 2026-09-10)

Operator: "the deeplink only gets a general link, not a link DEEP into the
actual countdown." The link now carries the count's start instant:
`#countup2&t=<unix ms>`. `deepLinkFromHash()` parses it; `startCount()`
resumes from that epoch (a future `t` is ignored), so the recipient sees the
same number ticking. The landing still copies the bare page URL.

## Lab (2026-09-10)

An invisible ⚙ in the top-right corner (twin of the ⧉) opens a modal built
from the `lab` param group (`src/test/labModal.js`): switches for 0/1 rows,
sliders otherwise; values save with the other params. `#lab` opens it too.

- `inverted`: black ink on a clear ground. The display shader composes a
  `light` branch (pale sand/water ground, ink subtracts light, caustics
  brighten the floor) and mixes it in by `u_invert`; `body.inverted` flips
  the overlay CSS variables.
- `surface`: a water surface after the koi pond's method — a two-buffer
  wave-equation height field, on the GPU at half sim resolution
  (`FRAG_WAVE`, `FRAG_DISTURB`). Its gradient refracts the dye and the floor
  (`rippleRefract`) and lights the crests; `rippleDamp` is the decay; every
  pointer-down on the stage pokes it (`rippleTouch`) and `rippleAmbient`
  pokes it on its own so it is never glass. Zero cost when off.

### Promoted to the default look (later 2026-09-10)

Operator: "we keep inverted and ripples ON as the default look, and we use
that look for the final result screen as well … the final score to also use
the same ink slightly hovering." `inverted` and `surface` default to 1.

- **Result screen in ink.** After `showScreen('gameover')`, the next frame
  clones the three score SVGs (binary row, heptacipher, Cistercian) at their
  laid-out size, rasterises them white, and pins each in the dye at its own
  rect with its own breathing phase (`resultInk`, `resultPin`,
  `resultBreathe`, `resultBreatheS`; the pin eases in over 0.5 s). The SVGs
  then fade to transparent but keep their layout; the clean/error dot stays
  an overlay. Leaving the screen drops the pins.
- **Lab: ring-stave numeral** (`glyphMix`). `src/cistercian/ringStave.js`
  builds the glyph as distance-tagged polylines. **Rev 2 (operator: "we just
  get rid of the stem")**: no stems — the ring is the stave, figures stand
  on it (along the ring = up the stave, radial = out). `ringSlots` positions
  (8 default, 4–16) share the arc. **Rev 3**: the ring opens at the bottom
  like an enso — thin end bottom-right, thick end bottom-left (points carry a
  width factor `wf`, 0.5 → 1.3, that the painter multiplies into the brush).
  Reading starts at the thin end: units there, each higher place the next
  slot up the right side, over the top, down the left; the highest place by
  the thick end. Only as many slots as digits; 0 = bare ring. The growth
  front starts at the thin end. The left counter wraps at 10^8 (the plain
  Cistercian shows it mod 10000). Adjacent slots mirror tip/foot. Digit 6 seeds at
  its midpoint a beat after the front passes its slot. Spec page:
  `docs/ring-stave.html`. The painter takes a
  `figure` and both the ∞/⧖ prompt and the left counter draw it when the
  switch is on.

## ◎ the ring-stave counter (`MODE.COUNT_R`, 2026-09-10)

Operator: "now we develop the new glyph as an alternative, and we put it on the
main page medium top right as a simplified glyph of itself, clickable." PoC:

- A 72 px emblem at the landing's top right: the ring-stave numeral for 12
  (ribbon ring thin→thick, a tip bar on the units slot, a foot bar on the
  tens slot), inline SVG in `currentColor`. Tapping it starts `COUNT_R`.
- `COUNT_R` (rev 2, operator: "we do not redraw the circle every time … it
  hovers and fluctuates but stays permanent within bounds. the numbers stick
  to it and dissolve"): the **ring is permanent** — on the first beat the
  whole numeral grows in, then the ring is rasterised from the builder's
  stave (its width profile drawn as round-capped segments) and pinned at the
  count's breathing anchor (`countRingInk`, `countRingPin`, the shared
  breathe params). **Rev 3 (operator: "we do not redraw what does not need
  redrawing. from 9 to 10, we draw the first 1 of the tens. that stays all the
  way until 20")**: every slot's figure is pinned like the ring, from 400 ms
  after it finished growing, and stays until its digit changes. A beat diffs
  the places: a changed slot releases its old figure (no longer pinned, it
  dissolves on the count clock) and grows the new one alone
  (`painter.begin({ skipStave: true, places: ['slotK'] })`), at the ring's
  position *now* so it sticks to it, at `countCInk × countRFigInk`. A slot
  that becomes 0 draws nothing. Figure rasters for pinning are cached per
  size / slot / digit. Figures are 0.5 R tall and reach 0.65 of that outward. Eight places,
  wrap 10^8, deep link `#countup3` (with `t=`), same hold-to-leave.

## Logogram counter, diegetic pass (2026-09-10)

Operator: "we are always either ADDING a drop, or one is fading, or both …
1 to 5 we ADD, 6 to 9 we fade … nothing else should be refreshed
aggressively … no ripple effects when a number disappears, but a small
ripple effect when a new drop of ink is added." Confirmed: the line under a
landing drop need not dissolve (same hue, the drop overpowers it); drops land
in ~300 ms, a released drop fades over the second.

- The logogram's digits are five fixed Morse slots per lobe. **Lines are
  permanent**: every lobe always carries its digit-0 marks, pinned. **Drops**
  are ink added on top of a line wherever the digit's pattern has a dot;
  when the pattern loses that dot the drop is released and dissolves on the
  `countLife` clock, and the line beneath is simply still there.
- Layers: ring, one line layer per place (from digit 0), one drop layer per
  place × slot (from 5555, the all-drops numeral) — shapes fixed by
  construction, so a mark that stays is the same ink throughout. A beat is a
  diff of slots: a new dot → the drop soaks in over `countTrace` with a
  small ripple at the mark's centre (`rippleTouch` × 0.5); a lost dot → the
  drop is unpinned. Nothing else is stamped.
- `fluid.stamp` keeps one mask texture per source canvas (LRU, 64), so
  pinning ~30 layers a frame is ~30 draws, not ~30 uploads.

## Logogram counter, second pass (2026-09-10)

Operator: "I like the size and disappearing motions of the Cistercian much
better, we want a similar set of variables for the Heptaweave, except that
the main circle does not get redrawn."

- The count screen now runs the Cistercian counter's clock for both kinds:
  dissipation from `countLife` (0.9 s), current `flowStrength × countFlow`,
  diffusion at half strength.
- The ring and the current digits are **pinned**: `FRAG_STAMP` gained a
  restore mode (`u_target`) that pulls the dye under a mask toward a target
  density at rate `countPin` per frame, at the breathing anchor. A changed
  digit's old marks are simply no longer pinned, so they drift and dissolve
  exactly like a Cistercian glyph. New marks sweep in over `countTrace` ms
  (or dim in) and are pinned once landed. The ring sweeps round once on entry
  and is never redrawn after that.
- `count` params: extent, ink, grow time, old-ink-gone-after, current ×,
  ring pin / frame, reveal, breathe, breathe period. The trickle keep-alive,
  fade and erase-reach params are gone.

## Verification

`node scripts/ink-cdp-shots.mjs <out> COUNT "" 400,1400,1850,2400,6300`:
value stamped, held, dimmed in the drain window, replaced. A scratch CDP
script confirmed a 300 ms press stays and a 1 s hold returns to landing.
