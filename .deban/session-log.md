# Session Log

Append-only. Newest at top.

---

## 2026-05-20 — kickoff session
- Role files seeded ([[pm]], [[arch]], [[dev]], [[design]]).
- Open questions captured from spec + assumption-challenges folded into pm.md.
- Plan: ink primitives → cistercian → choices → score → ring → state → modes → cache-busting → smoke.

## 2026-05-20 — v1 landed
- Ink/cistercian/heptacipher ports done; brush-stroke Cistercian renders 0..9999.
- Both choice renderers (A: lobes-only, B: full mini) ship; toggle via 1s long-press on landing's bottom-right.
- Difficulty table wired (tier 0..9+), distractors honor sharedDigits and magnitudeMatched.
- ⧖ timer ring color-shifts teal→orange→red, -10s on wrong, 0 = game over.
- ∞ first error = game over.
- Game-over: big binary + green/red dot. Tap returns to landing.
- localStorage persists renderer pick + best-per-mode.
- Cache-busting toolkit copied from heptacipher; bust.sh fingerprints URLs and bumps favicon-shape cell.
- One dead end recorded in [[dev]]: relative-import audit needed when porting files between flat- and nested-src layouts.
- Smoke: 80+ DOM-level renders verified in headless Chrome at http://127.0.0.1:8766.
