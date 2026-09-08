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
  is `flowStrength × countDrift` (0.1), diffusion is off, no wisps. In the
  last `countDrainMs` (300) before the next value the fluid drains at
  `countDrainFade` (0.86) so digits never pile up.
- Hold: `wireHold` (1 s pointerdown) on the count screen. A tap does nothing.

## Params (group `count`)

`countSize` (of the short side, 1.15), `countInk` (0.5), `countDrift`,
`countFade`, `countDrainMs`, `countDrainFade`. All live in `#admin`.

## Verification

`node scripts/ink-cdp-shots.mjs <out> COUNT "" 400,1400,1850,2400,6300`:
value stamped, held, dimmed in the drain window, replaced. A scratch CDP
script confirmed a 300 ms press stays and a 1 s hold returns to landing.
