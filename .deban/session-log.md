# Session Log

Append-only. Newest at top.

---

## 2026-05-20 — tune session (logogram balance + score format + slider UI)

Touched: [[dev]], [[arch]], [[pm]], [[design]], `_index.md`.

Highlights:
- **Logogram replicated faithfully.** User compared my custom choiceA/choiceB
  renderers to the original heptapod-logograms output: "the balance was more
  pleasant in the original." Retired choiceA/choiceB entirely. New
  `src/heptacipher/numeralV2.js` is a direct port of `renderHeptapodNumeralV2`
  from heptapod-logograms/compositeFlow.js, stripped of the quiz draw-mask
  animation. Every tuning constant verbatim.
- **Layout switched to organic quincunx.** Per-count slot presets
  (LAYOUT_PRESETS in main.js) matching the user's reference mockup —
  4 corners + bottom-center for 5 choices, etc. Choices nestle close to
  a larger central Cistercian (min(60vw, 340px)).
- **Score format locked.** Fixed 8-bit, LSB on the LEFT. Reading:
  position 1 = 2^0 = 1, position 8 = 2^7 = 128.
  `00000000`=0, `10000000`=1, `01000000`=2, `11000000`=3, `10001000`=17.
- ⭐ **Slider tuning UI built and used productively.** `scripts/tune.html`:
  18 sliders across ensō / lobes / marks / ink / render, live preview of
  4 sample numbers, persists diffs-vs-canonical to localStorage. User dialed
  in 14 parameters from their phone in one short session. Final values
  locked as `HEPTAWEAVE_CHOICE_TUNE` constants in main.js. The user
  explicitly highlighted this workflow as "great" → flagged as the standout
  methodology lesson of this session, recorded in [[dev]] and [[pm]].
- **Dead ends recorded:** initial choiceA all-outward design; over-corrected
  wide-gap second pass; even-angle ellipse orbit. All in respective role
  files.
- **Resolved:** A/B renderer toggle question (canonical V2 wins).

Commits this session: a467cee → 4dc904d → c18ca65, plus the tune-lock and
deban-sync commit landing now.

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
