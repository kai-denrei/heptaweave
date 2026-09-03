# heptaweave devlog

Newest at top. Alternatives we chose *not* to build yet live here so they
can be picked up later without re-deriving them.

## 2026-09-03 — ink theme (experimental)

Spec: `docs/superpowers/specs/2026-09-03-ink-theme-design.md`.

### Chosen: choices overlaid, feedback in the fluid (option C)

Choices stay crisp SVG logograms over the fluid; the tapped glyph is
splatted into the dye as the correct/wrong reaction. Chosen because the
choices must remain legible tap targets, and it gives the feedback the same
ephemeral language as the prompt instead of a CSS box-shadow.

### Alternatives kept for later

**A — overlay only.** Same as C without the splash. Cheapest; the fluid is
purely the prompt's medium. Fallback if the splash reads as noise or costs
too many frames at 7-up.

**B — choices painted into the fluid too.** Splat all N logograms into the
dye and re-ink them every few frames so they persist while the prompt
dissolves. One medium for everything, visually the purest. Costs: N × the
painter every re-ink; tap targets become fuzzy (would need invisible hit
regions); legibility at tier 7 unverified. Try it once C is stable — the
painter already exists, so B is mostly a scheduler plus hit regions.

### Mode/clock mapping

- ⧖: dissolve = run timer (glyph dissipation derived from time remaining;
  stage dims across the run; wrong = drain pulse). No ring.
- ∞: dissolve = reveal timer (dissipation derived from `revealMs`).

An open variant to try in test mode: ⧖ also honouring `revealMs` (clock =
`min(remaining, reveal)`). Not built; add a `timedUsesReveal` param if
wanted.

### Trace timing

Parallel brushes (all segments at once) + frozen dissipation while
painting, so the first stroke cannot fade before the last lands. Sequential
trace kept as a test-mode option because the freeze makes it safe.

### Licensing

Upstream `ink-flow` demo has no license; heptaweave is public. The fluid
engine is our own implementation of the technique (curl-noise advection,
gaussian splats, bright-pass bloom, gradient caustics), not the demo file.
