---
role: pm
owner: claude-on-kainode
status: active
last-updated: 2026-05-20
---

# PM — heptaweave

## Scope
Product shape, mode rules, end-conditions, what ships in v1 vs deferred.

## Decisions
| Date | Decision | Rationale | Linked roles |
|---|---|---|---|
| 2026-05-20 | v1 ships both choice renderers (A: lobes-only, B: full mini). | User asked for both. Picking which one stays is a playtest decision. | [[design]] |
| 2026-05-20 | ⧖ with any errors = red dot, even if timer ran out. | Cleanest invariant: "clean = no errors", any error taints the run. Easier to read than "red = ended by ⧖ that had ≥1 error vs green = ended by ⧖ flawless". | [[design]] |
| 2026-05-20 | Best score per mode persisted in localStorage. | Cheapest possible "you beat your record" without backend. | [[dev]] |
| 2026-05-20 | A/B renderer toggle = 1-second hold on bottom-right corner of landing. | Spec default. Invisible to public, deliberate to the user. | [[design]] |
| 2026-05-20 | Cistercian fade-out = opacity → 0 over 400ms + slight blur ramp. | Spec default. Long enough to register, short enough not to drag. | [[dev]] |
| 2026-05-20 | v1+ ships ONE renderer (canonical V2 from heptapod-logograms). The A/B toggle is hidden. | User reviewed both, preferred the original. A/B was useful as a comparison tool; not needed as a shipped feature. | [[arch]] [[design]] |
| 2026-05-20 | Score is fixed 8-bit, LSB-on-LEFT. Reading: position 1 = 2^0 = 1, position 8 = 2^7 = 128. Score caps at 255 for display. | User spec. Examples: 1=`●-------`, 2=`-●------`, 3=`●●------`, 17=`●---●---`. | [[design]] |
| 2026-05-20 | `scripts/tune.html` ships as a long-lived dev-only page (NOT linked from the landing screen, but kept on disk). Reachable via direct URL. | Tuning is iterative; the page should remain available for future adjustment passes. localStorage persistence means user can re-tune anytime without code changes. | [[dev]] |

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|
| 2026-05-20 | Variable-width binary score row, MSB on the left, growing leftward as score increased. | User decided on fixed 8-bit LSB-on-LEFT instead. Stable visual width; reading direction matches the natural "fill from the left" intuition (position 1 lights up first). Cap at 255 is fine for v1 endless runs. |
| 2026-05-20 | A/B renderer toggle as a shipped feature (1-second long-press on landing). | Resolved: user picked canonical V2 as the only renderer after seeing both. Toggle code retained but UI hidden. |

## Lessons
- **The "build a tuning UI, ship the locked values" workflow is a massive productivity win and should be the default for visual/generative work.** — from this session, 2026-05-20.
  - **What happened:** instead of guessing render constants and iterating with the user via screenshots, we built `scripts/tune.html` with 18 sliders + live preview + localStorage persistence. The user dialed in 14 parameters from their phone in a single short session and confirmed "this looks satisfying." Values were then hardcoded as the project-default tune layer.
  - **Why it worked:** the user got direct, low-latency feedback on changes (preview updates in real time). They had the FULL parameter surface available, not just the 3-4 knobs I would have guessed they cared about. Result: a satisfying lock-in that captured taste decisions across the whole renderer.
  - **How to apply:** for any future renderer with multiple interacting visual knobs, BUILD THE TUNER FIRST. The cost (a few hundred lines, half a day) is negligible compared to N rounds of "what about a bit more X / a bit less Y." Persist via localStorage so it survives reloads and works from any device.
- See [[dev]] Lessons for the engineering-side write-up of the same lesson + supporting lessons on canonical-renderer fidelity and headless-Chrome harnesses.

## Open Questions
- [ ] Game-over dot color for ⧖ with errors — current default: red. Validate with playtest.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] Personal-best display on game over — when do we show it / how do we celebrate it? Default v1: show nothing extra; the binary row is the artifact.  — owner: claude-on-kainode — since: 2026-05-20
- [x] ~~A/B toggle UX — 1s long-press on landing's bottom-right corner.~~ RESOLVED 2026-05-20: A/B toggle retired; canonical V2 is the only renderer.
- [ ] Wet-bleed filter performance on mobile — profile before declaring done.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] Cistercian fade-out — 400ms opacity + blur ramp. Tune after playtest.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] Tier curve — current table is first-pass. Validate that bit-7 (64 score) is reachable in ⧖ within 60s starting from 0.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] Symbol-only landing: is ⧖ vs ∞ enough as the entire mode picker, or do we need a hint on first-run? Default: no hint.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] 8-bit score cap — score of 255 in endless is reachable but rare. Do we surface a "max" state visually, wrap around, or just freeze? Default v1: numeric score keeps climbing but display saturates at all-blob.  — owner: claude-on-kainode — since: 2026-05-20

## Assumptions
- The user can recognize a Cistercian numeral 0–9999 after seeing the heptacipher choices. Untested. — status: untested — since: 2026-05-20
- 7 choice circles fit comfortably in a portrait phone viewport at ~80–100 px each.  — status: untested — since: 2026-05-20

## Dependencies
Blocked by:
Feeds into: [[arch]], [[dev]], [[design]]

## Session Log
- 2026-05-20 (tune session) — Canonical-only rendering decision (A/B retired). Score spec locked to 8-bit LSB-on-left. Tune-UI workflow established + ⭐ flagged as the standout methodological win of this session — see Lessons.
- 2026-05-20 — Project initialized. Spec captured, role files seeded.
