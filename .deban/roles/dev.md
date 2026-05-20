---
role: dev
owner: claude-on-kainode
status: active
last-updated: 2026-05-21
---


# Dev — heptaweave

## Scope
Implementation details, file-level conventions, build/test commands, dev-server.

## Decisions
| Date | Decision | Rationale | Linked roles |
|---|---|---|---|
| 2026-05-20 | Port heptacipher's `brush.js`, `splotch.js`, `enso.js`, `rng.js`, `morseDigitArc.js` verbatim. | They work. Touching them is a footgun. | [[arch]] |
| 2026-05-20 | Port CistercianWeave's `digitMap.js`, `buildSigil.js`, and the segment helpers from `geometry.js` verbatim. | Same reasoning. | [[arch]] |
| 2026-05-20 | Use `python3 scripts/dev-server.py 8766` for local serving. | No-cache headers; same as heptacipher; built-in to Python stdlib. | |
| 2026-05-20 | Cache-busting toolkit copied from heptacipher (bust.sh, fingerprint-urls.py, cb-badge.js, cb-shapes/*.svg). | These are the cache-busting skill artifacts already in use; no need to re-derive. | [[arch]] |
| 2026-05-20 | Service worker is heptacipher's verbatim with project names changed. | Strategy is correct: HTML NetworkFirst, JS stale-while-revalidate, images CacheFirst. | |
| 2026-05-20 | Retire `choiceA.js` and `choiceB.js`. Replace with a single `numeralV2.js` that is a direct port of `renderHeptapodNumeralV2` from heptapod-logograms/compositeFlow.js, stripped of the quiz-app draw-mask animation. | The custom A/B renderers had drifted from the canonical constants (gap, tail, bulge, wet-drop). The original was tuned over time and feels balanced; my variations broke that balance. See dead end below. | [[arch]] [[design]] |
| 2026-05-20 | Binary score is FIXED 8-bit with LSB on the LEFT (not variable-width MSB-left). | User spec: `00000000=0`, `10000000=1`, `01000000=2`, `11000000=3`, `10001000=17`. Capped at 255 by display; difficulty table still uses numeric score for the (now unreachable) tier-9. | [[design]] |
| 2026-05-20 | Tunable params on `numeralV2`: `gapAngleDeg`/`gapWidthDeg`/`tailLengthDeg`/`lobeBulgeOutward`/`lobeBulgeInward`/`dotSizeFactor`/`dashWidthFactor`/`dashMinWidth`/`wetDropSizeFrac`/`disableJitter`. Each preserves the canonical V2 default when omitted; passing an explicit number ALSO disables the per-render jitter on that field (for reproducible tuning). | The original heptapod-logograms had this as a slider UI; we needed the same machinery to dial in the heptaweave look without recompiling. | [[arch]] |
| 2026-05-20 | `scripts/tune.html` exposes those params as 18 sliders with live preview of 4 sample numbers. Sliders write a diff-vs-canonical object to `localStorage.heptaweave.tune`. `main.js` reads that key and spreads it over the choice-tile call. | Lets the user dial in from their phone, see results immediately in the running game, no rebuild. | [[pm]] |
| 2026-05-20 | Heptaweave choice-tile defaults locked from user-tuning session 2026-05-20: gap 82°/46°, bulgeScale 0.45, outward 0.44, inward 0.38, digitGap 0.04, markSpread 0.8, dotSize 0.33, dashWidth 0.03, halo 0.85, wobble 0.5, detail 0.13, vbPadFrac 0. Hardcoded as `HEPTAWEAVE_CHOICE_TUNE` in main.js. localStorage still wins for future re-tuning. | User dialed in these specific values via the tune UI and confirmed "this looks satisfying". | [[design]] |
| 2026-05-21 | PWA hardening pass — removed unconditional `skipWaiting()` from SW install and `clients.claim()` from activate. SW now waits for `{type:'SKIP_WAITING'}` postMessage. index.html boot script listens for `updatefound` + `statechange='installed'` while a controller exists and surfaces an update toast. Page reloads on `controllerchange`. | mobile-pwa skill: unconditional skipWaiting yanks fresh JS underneath in-flight sessions. Per-page opt-in is the canonical pattern. | [[arch]] [[design]] |
| 2026-05-21 | Created `offline.html` precached at install time. networkFirst falls back to it on offline navigations; legacy inline-string fallback retained as last resort. | Styled offline page matches the app's cream-paper aesthetic — same paper-grain noise, symbol-only `⊘`, tap-to-reload. | [[design]] |
| 2026-05-21 | Added raster icons (180/192/512/maskable-512) rendered from icon.svg via Chrome headless screenshot. Updated manifest.webmanifest to list PNGs alongside the SVG entries. apple-touch-icon now points at icon-180.png. | iOS Safari doesn't support SVG apple-touch-icon reliably; Android prefers a 192/512 pair for the install banner. SVG kept for `purpose: "any"` because Chromium supports it. | [[design]] |
| 2026-05-21 | Service worker: enabled `navigationPreload`. networkFirst now races preload alongside the network fetch and timeout. | Cuts navigation cold-start by hundreds of ms — preload fires while the SW worker boots. | [[arch]] |
| 2026-05-21 | Added FIFO `trimCache(name, max)` helper. Runtime cache capped at 40 entries; called after every put in staleWhileRevalidate + networkFirst. Static cache (precache list) intentionally not trimmed. | Without a cap a long-running PWA accretes hundreds of one-off URL variants (cb-fingerprinted paths). | [[arch]] |
| 2026-05-21 | theme_color changed to cream paper `#f6f1e7` in both manifest.webmanifest and index.html `<meta name="theme-color">`. Previous value `#161310` (ink black) was wrong; system status / address bar should match the app background, not the foreground ink. | Design correctness — the app IS cream paper; the dark theme-color was misreading the spec. | [[design]] |
| 2026-05-21 | Wrapped all motion in `@media (prefers-reduced-motion: reduce)`: choice glow/shake, Cistercian fade, `.choice-tile:active` bounce, new-bit pop, timer ring continuous spin, mode-btn hover transitions, toast/install affordance transitions. | OS accessibility setting MUST be honored. Discrete state changes still work; only animations are neutralized. | [[design]] |
| 2026-05-21 | Install affordance + iOS A2HS hint: `beforeinstallprompt` captured (preventDefault'd), shown ONLY on the game-over screen, only after a run completes, only if not already dismissed. Symbol-only ⤓ button. On iOS Safari (non-standalone), the same affordance acts as a static "this is installable" hint. Dismissal persists in `heptaweave.installHintDismissed`. | mobile-pwa skill: never block first paint with an install nag; reveal after the user has tasted the product. Symbol-only to honor the no-text-during-play constraint (even though game-over is meta-UI, consistency matters). | [[design]] |

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|
| 2026-05-20 | Copied `morseDigitArc.js` verbatim from heptacipher; imports `./brush.js` / `./splotch.js` relative. | In heptaweave the ink primitives live under `src/ink/`, not flat `src/`. Browser silently ate the error (`Failed to fetch dynamically imported module` with no underlying cause). Fixed by rewriting imports to `../ink/brush.js` / `../ink/splotch.js`. Lesson: when porting a file from a flat-src project to a nested-src project, audit relative imports first. |
| 2026-05-20 | First pass at `choiceA.js`: simplified canonical V2 design — all lobes outward (vs canonical `[false,true,false,true]`), gap at SVG 270° (top) instead of 90° (bottom), all-outward rationalized as "lobes-only renderer needs to stay readable at small size". | User feedback: "you got the basic design of the lobes wrong" + "the balance of my heptapod-logograms was more pleasant in the original". The canonical V2 was tuned over weeks; my "small-size adaptation" lost that balance. Retired choiceA/choiceB entirely and replaced with a direct port (`numeralV2.js`). See lessons. |
| 2026-05-20 | Second pass at the logogram: widened gap to 55°, bumped wet-drop to 0.22, beefed up dot/dash sizes (`dotSize = stride * 0.26`, `dashMaxW = max(1.1, stride * 0.08)`) for legibility at choice-tile sizes. | "Improvements" again drifted from canonical proportions. User flagged the balance regression. Reverted to canonical 0.20 / 0.04 — when the visible-mark size needs adjustment, do it via the `dotSizeFactor` / `dashWidthFactor` PARAMETERS at the call site, not by mutating the canonical formulas. |
| 2026-05-20 | Even-angle orbital layout (tiles evenly distributed on an ellipse around the Cistercian). | User mockup shows an organic quincunx (4 corners + bottom-center for 5 choices), not even spacing. Replaced with per-count slot presets matching the mockup's uneven layout. |

## Lessons
- Verbatim ports across differing folder layouts need an import-rewrite pass.
- Chrome's dynamic-import error message is unhelpful; cascade-import each file in isolation to find the broken one.
- **mobile-pwa skill review found 8 actionable items; addressing all of them in one pass.** — 2026-05-21. A single-skill audit before declaring "PWA done" caught: unconditional skipWaiting, no offline page, missing raster icons, no navigation preload, unbounded cache, wrong theme color, missing prefers-reduced-motion, no install affordance. None of these would have shown up in functional testing — they're cross-cutting hygiene the skill specifically calls out. **Run the skill review explicitly as a checklist step before declaring a PWA shipped.**

- **A live-preview slider UI with localStorage persistence is the right tool for tuning any generative-rendering parameter space.** — from the heptaweave tune session, 2026-05-20.
  - **Why it worked:** the user dialed in 14 parameters across ensō / lobes / marks / ink / render in under 10 minutes from their phone, watching the preview update in real time. Locking those values into the renderer afterward took one edit. Without the tune UI we would have iterated "screenshot → guess new constants → rebuild → screenshot" — easily 20× slower and lossy at every step.
  - **How to apply:** any time we have a parameterized renderer (especially one with 5+ knobs that interact visually), bias toward building the slider page FIRST, before trying to lock in defaults. Even a half-day spent on the tuner pays back during the first user feedback round. Persist via localStorage with a diff-vs-canonical schema so the renderer falls back to canonical when nothing is overridden.
  - **Watch for:** generative parameter spaces, where intuition-driven constant-picking is expensive. NOT useful for binary on/off feature flags or for params with a single objectively-correct value.

- **Don't deviate from a battle-tuned reference renderer without an explicit reason.** — from the choiceA / choiceB drift, 2026-05-20.
  - **Why:** the original heptapod-logograms `renderHeptapodNumeralV2` has constants tuned over weeks (gap 32° + jitter, tail 22° + jitter, bulge 0.50/0.32, wet-drop 0.13×r, etc.). Any "smarter" rewrite at a smaller display size loses that balance. The user immediately spotted the regression: "the balance was more pleasant in the original."
  - **How to apply:** when the source project provides a tuned generative renderer, PORT IT VERBATIM (constants and all). If a use-case-specific adjustment is needed (e.g., smaller halo padding for choice tiles), expose it as a PARAMETER on the renderer rather than forking the implementation.

- **Headless Chrome + an isolated render harness is the fastest verification loop for visual code.** — across multiple iterations this session.
  - **Why:** `lobe-check.html`, `layout-test.html`, `auto-play.html` each took ~5 minutes to write and let me diff "what I think the code does" vs "what it actually renders" without bothering the user. Each problem ("ring looks closed", "lobes are wrong direction", "choice tiles too small") was diagnosable from one screenshot.
  - **How to apply:** when working on rendering / layout / visual-state code, write the harness early. Use `chrome --headless --screenshot=path url` with a generous `--virtual-time-budget` if the page is async.

## Open Questions
- [ ] Should the bust.sh from heptacipher walk all .js too, or just .html/.htm? Current: also rewrites <meta cb> in any .html/.htm/.js but only fingerprints URLs in .html/.css. Good enough for now. — owner: claude-on-kainode — since: 2026-05-20

## Assumptions
- Python 3 is on PATH (it is on macOS). — status: validated — since: 2026-05-20
- The dev server can be reached on `http://127.0.0.1:8766` from the user's browser. — status: untested — since: 2026-05-20

## Dependencies
Blocked by:
Feeds into:

## Session Log
- 2026-05-21 (PWA hardening) — Eight-item pass from the mobile-pwa skill review, all addressed in one commit: opt-in SW update toast, precached styled offline.html, raster icon set (180/192/512/maskable-512), navigationPreload race in networkFirst, FIFO cache cap (max 40 runtime entries), theme_color → cream paper, prefers-reduced-motion wrap, install affordance (Chrome BIP + iOS A2HS) gated to game-over with localStorage-persisted dismissal. Lessons: skill-driven review catches a lot of items that drift in early. Symbol-only meta-UI works when you pick well-known glyphs (↻ ⤓ ⊘ ✕).
- 2026-05-20 (tune session) — Retired choiceA/choiceB; new `numeralV2.js` is a direct port of compositeFlow's V2. Layout switched to organic quincunx slot presets. Score is now fixed 8-bit LSB-on-left. Built `scripts/tune.html` + 18-slider live-preview UI; locked the user's tuned values as `HEPTAWEAVE_CHOICE_TUNE` constants. Three lessons recorded; the tune-UI lesson is the standout (see Lessons).
- 2026-05-20 — Dev role seeded.
