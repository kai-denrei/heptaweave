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

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|

## Lessons

## Open Questions
- [ ] Game-over dot color for ⧖ with errors — current default: red. Validate with playtest.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] Personal-best display on game over — when do we show it / how do we celebrate it? Default v1: show nothing extra; the binary row is the artifact.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] A/B toggle UX — 1s long-press on landing's bottom-right corner. Discoverable enough? — owner: claude-on-kainode — since: 2026-05-20
- [ ] Wet-bleed filter performance on mobile — profile before declaring done.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] Cistercian fade-out — 400ms opacity + blur ramp. Tune after playtest.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] Tier curve — current table is first-pass. Validate that bit-7 (64 score) is reachable in ⧖ within 60s starting from 0.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] Symbol-only landing: is ⧖ vs ∞ enough as the entire mode picker, or do we need a hint on first-run? Default: no hint.  — owner: claude-on-kainode — since: 2026-05-20

## Assumptions
- The user can recognize a Cistercian numeral 0–9999 after seeing the heptacipher choices. Untested. — status: untested — since: 2026-05-20
- 7 choice circles fit comfortably in a portrait phone viewport at ~80–100 px each.  — status: untested — since: 2026-05-20

## Dependencies
Blocked by:
Feeds into: [[arch]], [[dev]], [[design]]

## Session Log
- 2026-05-20 — Project initialized. Spec captured, role files seeded.
