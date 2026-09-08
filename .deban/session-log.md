# Session Log

Append-only. Newest at top.

---

## 2026-09-03 — ink theme prototype (experimental page, test mode, presets)

Touched: [[arch]], [[design]], [[dev]], `docs/devlog.md`, spec + plan under `docs/superpowers/`.

- **Renderer seam.** `main.js` rules-only; paper renderer extracted verbatim
  (headless screenshot confirms the paper play screen unchanged). Dead A/B
  toggle removed; corner-hold region kept for themes.
- **Ink theme** at `ink.html`: own WebGL dye engine, glyph painter (parallel
  brush trace of Cistercian segments), choreography paint→hold→ramp→flow,
  ⧖ dissolve = run clock + dimming, ∞ dissolve = reveal clock, stays-tier
  re-ink, feedback splash (hue-carrying dye), ambient wisps, no-WebGL sigil.
- **Test mode + presets:** `params.js` schema (45 knobs), bottom-sheet panel,
  local/shipped presets, share URL. Rules overrides wired through buildRound.
- **Verification:** `smoke-pure.mjs` extended (overrides, codec, overlay,
  dissipFor). Real-time frames via `scripts/ink-cdp-shots.mjs` (CDP + wall
  clock): ∞ tier 5 glyph painted at 1.3 s, blurred at 3 s, gone by 6 s;
  ⧖ glyph holds shape at 8 s; wrong pick = ember splash + drain; game-over
  trinity renders. Chrome MCP extension was not connected this session.
- **Tuning from frames:** `current` 300→75 and clock-scaled flow strength
  (the first pass swept the glyph off-screen in under a second).
- **Lesson (dev):** headless `--virtual-time-budget` starves rAF (3 frames in
  8.5 s of budget) — never judge animation from it; drive CDP with real waits.

**Promoted to default the same session** (operator call): `ink.html` →
`index.html`, paper → `paper.html`; ink page inherits the PWA head + opt-in
SW update toast; SW v4 drops the ink cache bypass and precaches both pages;
manifest theme/background → `#08090d`. Test panel → **admin panel**
(`src/test/adminPanel.js`): `#admin` entry, a tab per parameter group, pinned
preset row, and the play stage lifts while the sheet is open. Paper verified
unchanged at `paper.html` via the existing headless harness.

Hosted: `python3 scripts/dev-server.py 8765` → http://192.168.0.198:8765/

2026-09-03 23:50 — SYNC — verdict: ink v1 accepted ("works well for a v1, we
will revisit later"), revisit deferred. Touched [[pm]], [[design]], [[dev]],
[[arch]], `_index.md`. Captured to-do 1 (one-trait Cistercian) and to-do 2
(large-round-glyph mode) as Open Questions with their intent ambiguity stated
rather than assumed. Surfaced three unresolved consequences of promoting a
WebGL theme to default: no-WebGL reachability, prefers-reduced-motion, and
an unmeasured real-device frame rate. No Dead Ends this session.

2026-09-03 23:57 — SYNC — both to-do intents resolved by the operator and
moved from Open Questions to Decisions in [[pm]], [[design]], [[dev]],
[[arch]], `_index.md`. To-do 1: one unbroken trait grown radially from the
stem's centre (a third option, neither of the two I proposed). To-do 2: the
inversion, as a starting point. Two blocking follow-ups surfaced that the
answers do not cover — digit 6 is topologically unreachable from the stem
(≈34% of numerals contain one), and the inverted mode looks like a modifier
on ⧖/∞ rather than a third mode. Nothing built; no Dead Ends.

## 2026-05-21 — PWA hardening pass (mobile-pwa skill review)

Touched: [[dev]], [[arch]], [[design]].

Eight items shipped in one commit, walked from the mobile-pwa skill's
references (service-worker.md, caching-strategies.md, install-prompt.md,
ios-caveats.md):

1. **Opt-in SW update flow.** Removed unconditional `skipWaiting()` from
   install and `clients.claim()` from activate. New worker stays waiting
   until the page posts `{type:'SKIP_WAITING'}`. index.html boot script
   detects updates via `updatefound` + new worker `statechange='installed'`
   while a controller exists, surfaces a cream-paper toast (↻ + ✕),
   reloads on `controllerchange`. CACHE_VERSION bumped v1→v2.
2. **Styled offline.html.** Precached at install time. networkFirst falls
   back to it before the inline-string last resort. Same paper-grain
   noise as the app, ⊘ sigil, tap-anywhere-to-reload.
3. **Raster icon set.** icon-180.png (apple-touch), icon-192.png,
   icon-512.png, icon-maskable-512.png. Rendered from icon.svg /
   icon-maskable.svg via Chrome headless (rsvg-convert not installed).
   manifest.webmanifest extended; apple-touch-icon link updated.
4. **Navigation preload.** Enabled in SW activate. networkFirst races
   `event.preloadResponse` against fetch+timeout.
5. **Cache size cap.** FIFO `trimCache(name, max)` helper. Runtime
   cache capped at 40 entries. Called after every cache.put in SWR + NF.
6. **theme_color → cream paper.** `#f6f1e7` in both manifest and
   index.html meta. Was `#161310` (ink — wrong).
7. **prefers-reduced-motion.** Wrapped all keyframes / transitions in
   the media query: choice glow/shake, Cistercian fade, tile press
   bounce, new-bit pop, timer ring spin, mode-btn hover, toast +
   install transitions.
8. **Install affordance.** Chrome BIP captured + suppressed; revealed
   on game-over only, never first paint, never during play. iOS Safari
   gets the same symbol-only ⤓ button as a static A2HS hint. Dismissal
   persists in `heptaweave.installHintDismissed`.

Verification: smoke-pure.mjs still passes; auto-play.html headless
screenshot shows the play screen renders correctly; gameover-sim.html
reaches the game-over screen cleanly; offline.html renders standalone;
icon-* PNGs are exact-pixel and non-zero. The smoke-dom.html harness
still shows the pre-existing choiceA/choiceB import errors recorded in
the previous session — unchanged by this pass.

Commit: see below.

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

2026-09-09 00:30 — SYNC — one-trait Cistercian (growth front, digit 6 seeded), band layout, diffusion, admin copy/paste. Roles: pm, dev, design. New open question in pm (diffusion vs dissolve clock).
