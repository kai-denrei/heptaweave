---
project: heptaweave
created: 2026-05-20
status: active
mode: solo
stale_threshold_days: 30
---

# heptaweave — Index

## Brief
Solo PWA quiz, symbol-only UI: a Cistercian numeral (0–9999) is rendered in
sumi-ink on cream paper; the player picks the matching heptacipher logogram
from N choices. Two modes: ⧖ (60s shrinking timer, -10s on wrong) and ∞
(first wrong ends the run). Bit-milestone difficulty (tier = bitlength(score))
composably advances reveal time, choice count, and distractor closeness.
Score is a variable-width binary row in ink, top-left. v1 ships both choice
renderers (lobes-only and full mini) toggleable via a long-press on landing.

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
  page (⊘). theme_color is cream paper. prefers-reduced-motion honored.

## Open Questions (cross-role)
- See per-role files; ⧖-with-errors dot color, persistence model,
  mobile wet-bleed perf, Cistercian fade animation, 8-bit score cap behavior
  — defaulted for v1, pending playtest revision.
- A/B toggle question resolved 2026-05-20: canonical V2 is the only renderer.
