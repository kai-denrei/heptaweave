---
role: design
owner: claude-on-kainode
status: active
last-updated: 2026-05-20
---

# Design — heptaweave

## Scope
Visual language, micro-interactions, accessibility constraints, copy-free UX.

## Decisions
| Date | Decision | Rationale | Linked roles |
|---|---|---|---|
| 2026-05-20 | No letters, no Arabic numerals visible during play. Only ⧖, ∞, brush marks, dots, ring. | Spec. Heart of the project's identity. | [[pm]] |
| 2026-05-20 | Cream paper `#f6f1e7`, paper `#fbf7ee`, ink `#161310`. Paper-grain SVG noise behind. | Reuse heptacipher's palette. | |
| 2026-05-20 | Timer ring color: teal `#79ead9` → orange → red `#a83a2b` as time depletes. Linear-RGB interpolation. | Spec. Color cue is the only urgency signal (no countdown digits). | [[dev]] |
| 2026-05-20 | Choice circles ~80–100 px diameter at 7-up tier. Touch target ≥44 px. | Apple HIG; tier-7 fits in portrait. | [[pm]] |
| 2026-05-20 | Game-over screen is centered binary score + a single dot (green or red). Tap anywhere to return. | Spec; ritual of "the run is the artifact". | [[pm]] |
| 2026-05-20 | Landing screen: a centered ⧖ above an ∞ (or side-by-side), both tappable. No hint copy. | Spec: symbol-only. The icons are universal enough. | [[pm]] |

## Dead Ends

## Lessons

## Open Questions
- [ ] Landing layout — vertical stack or horizontal pair? Default v1: vertical, ⧖ on top.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] Should the binary row "pulse" briefly when a new bit is added? Default v1: yes, 250ms scale ramp on the new bit.  — owner: claude-on-kainode — since: 2026-05-20
- [ ] Wet-bleed filters on choice circles — full halo+crisp pipeline is expensive at 7-up. Default v1: simplify — crisp only on small choices, halo only on the big Cistercian. — owner: claude-on-kainode — since: 2026-05-20

## Assumptions
- A green dot vs a red dot is an unambiguous "clean vs error" signal in this minimal UI. — status: untested — since: 2026-05-20

## Dependencies
Blocked by:
Feeds into: [[dev]]

## Session Log
- 2026-05-20 — Design role seeded.
