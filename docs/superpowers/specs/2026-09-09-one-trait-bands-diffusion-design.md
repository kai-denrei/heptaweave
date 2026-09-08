# One-trait Cistercian, band layout, diffusion — design

Date: 2026-09-09. Approved by the operator in-session ("A for all three, add diffusion, go").

## 1. One-trait Cistercian (growth front)

The prompt numeral is painted as **one connected figure grown radially from the
stave's midpoint**, not as N tapered brush runs. Implements the 2026-09-03
decision (`.deban/roles/pm.md`).

- New pure module `src/cistercian/growthFront.js`:
  `cistercianGrowth(number)` → `{ paths, maxD }` in logical coords, every point
  carrying `d` = geodesic distance from the root `(1, 1.5)`. Stave = two arms
  from the root. Each digit polyline attaches to the stave at whichever of its
  endpoints lies on `x = 1`; `d` continues along the polyline from the
  attachment (min over both ends when both attach: digits 5 and 9).
- **Digit 6** attaches nowhere. It grows from its own seed at the bar's
  midpoint, offset so it starts the instant the stave front passes level with
  it (`d0 = |y_mid − 1.5|`). Same gesture, not the same topology.
- `cistercianGrowthPx({ number, size, padFrac })` maps to pixels with the same
  `mapPoint` as `cistercianSegmentsPx` (isotropic, so `d` scales by one factor).
- Front timing: **constant speed**. `r(t) = maxD · t / traceMs`; short shapes
  finish early, the longest finishes at `traceMs`.
- Painter (`glyphPainter.js`): pre-samples every path at half the brush radius,
  emits the samples with `rPrev < d ≤ rNow` each frame. **Constant width.**
  `taper` now thins only free terminals (dead ends); `wobble` is a smooth
  perpendicular sinusoid along the path so joints stay continuous. `traceMode`
  is removed from the schema (unknown keys are already dropped by
  `sanitizeDiff`).
- Paper theme untouched this pass (its static one-path rendering is a follow-up).

## 2. Band layout for choices (ink only)

- New pure module `src/render/ink/bandLayout.js`: given the container, the
  prompt square, count, gap and max tile, measure the four free bands, pick the
  pair with more depth (top+bottom in portrait, left+right in landscape), split
  the count between them (the far/bottom band gets the extra one), and for each
  band choose the rows×cols grid that maximises tile size. All tiles share the
  smallest size so choices stay fair. Grids are centred in their band.
- `layoutMode` param: 0 = cardinal orbit (existing shared module), 1 = bands
  (default). `tileMax` (default 260), `tileGap` (default 8). Prompt default
  shrinks 0.5 → 0.4. `wobble` default 0.6 → 0.25 with a ~20-radius wavelength.
- `layoutChoices()` and the paper renderer are unchanged.

## 3. Diffusion + admin copy/paste

- `FRAG_DIFFUSE` shader: each step, the dye texel moves toward the mean of its
  4 neighbours at `spread` texels: `out = mix(c, avg, diffuse)`. Runs after
  advection in `fluid.step()` when `diffuse > 0`. Frozen during PAINT/HOLD,
  eased in during RAMP like dissipation.
- Params (group `dissolve`): `diffuse` 0..1 (default 0.2), `diffuseSpread`
  0.5..4 texels (default 1.5). Bloom defaults lowered: threshold 0.18 → 0.3,
  core bloom 0.6 → 0.35, halo 1.2 → 0.7. Final values are the operator's call
  via the admin sheet.
- Admin sheet: `copy JSON` (diff vs defaults), `copy all` (every value), a
  paste box + `load`. The dump becomes a selectable textarea so copying works
  where the clipboard API is blocked. Workflow: tune → copy JSON → hand it
  back → it is baked into `SCHEMA` defaults.

## Verification

- `node scripts/smoke-pure.mjs` gains growth-front and band-layout checks
  (every digit reachable, 6 seeded at the right offset, tiles inside bounds and
  non-overlapping for counts 2–7 at portrait and landscape sizes).
- `node scripts/ink-cdp-shots.mjs <out> ENDLESS` frames inspected by eye:
  one continuous figure during PAINT, no teardrops, larger tiles top/bottom.
