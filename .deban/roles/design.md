---
role: design
owner: claude-on-kainode
status: active
last-updated: 2026-05-21
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
| 2026-05-20 | Choice layout = per-count organic quincunx slot presets (LAYOUT_PRESETS in main.js), not even-angle orbital. Matches the user's reference mockup. | Even-angle distribution felt mechanical. The mockup's varied positions (4-corner + bottom-center for 5 choices) gives the design "breath." | [[arch]] |
| 2026-05-20 | Cistercian dominates the center at `min(60vw, 340px)`. Choice tiles nestle close — slight overlap with the Cistercian's bounding box is intentional. | "Almost as if part of the same structure." Actual ink doesn't collide because the canonical V2 glyph leaves significant halo air around the rendered ensō. | [[arch]] |
| 2026-05-20 | Binary score row reads left-to-right, LSB first. Each bit is a brush mark: blob (`●`) for 1, hyphen (`–`) for 0. Always 8 marks. | Reading direction matches "the row fills from the left" intuition. Position 1 = bit 0 = first to light up. | [[dev]] |
| 2026-05-20 | Choice-glyph visual tune locked: gap 82°/46°, bulge 0.45/0.44/0.38, mark spread 0.8, dot 0.33 / dash 0.03, halo 0.85, wobble 0.5, vbPadFrac 0 (glyph fills the tile, no halo air margin). | User-dialed via the slider tuner, confirmed "satisfying." | [[dev]] |
| 2026-05-21 | theme_color = cream paper `#f6f1e7` (was ink `#161310`). manifest.webmanifest + index.html meta in sync. | The app's *background* is cream paper; theme_color should match that, not the foreground ink. iOS standalone status bar + Android chrome tint will now read as continuous paper. | [[dev]] |
| 2026-05-21 | All motion gated by `prefers-reduced-motion: reduce`: choice glow/shake animation neutralized; Cistercian opacity+blur transition becomes instantaneous; tile press-bounce removed; new-bit score pop disabled; mode-btn hover scale removed; toast + install affordance transitions zeroed. Discrete state changes still work (visibility, color). | OS accessibility setting MUST be honored — vestibular sensitivity is real. Game still plays; only the kinetic flourishes pause. | [[dev]] |
| 2026-05-21 | Meta-UI text policy: the "no Latin / no Arabic numerals during play" rule applies to the play surface. Update toast + install affordance appear ONLY on landing or game-over — meta-UI surfaces — and use universal symbols (↻ ⤓ ⊘ ✕) rather than text labels, to stay consistent with the project's symbol-only ethos. No words are introduced. | Symbols carry the same intent as text at a fraction of the noise. ↻ = "refresh," ⤓ = "save/install/download," ⊘ = "no signal," ✕ = "close." All near-universal. | [[pm]] |
| 2026-05-21 | Install affordance is symbol-only (⤓), 56px round, sits on the game-over screen below the score trinity. Cream-paper toast for SW updates, ↻ glyph + small dismiss ✕, 999px pill, sits above safe-area bottom. | Meta-UI must read as the same physical artifact as the rest of the app — same paper, same ink, same restraint. | [[dev]] |

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|
| 2026-05-20 | First-pass logograms with all-outward lobes and a top-positioned gap, justified as "lobes-only renderer needs to stay readable at small size." | User feedback: "you got the basic design of the lobes wrong." Canonical heptacipher lobes alternate out/in/out/in starting from the bottom-left notch. The "small-size adaptation" was a solution to a wrong problem (the actual fix was larger tiles + canonical balance, not a degenerate design). |
| 2026-05-20 | Second pass: opened the ensō gap wide (55°) with a tiny tail (15°) to make the gap clearly visible, and beefed up wet-drop + mark sizes for "legibility." | User reference (image of original heptapod-logograms render) showed a much more subtle gap and balanced marks. My over-corrected version felt heavy-handed. Reverted to canonical V2 gap (32° + jitter), tail (22° + jitter), wet-drop (0.13×r), and made the visible-size tuning a separate parameter layer (HEPTAWEAVE_CHOICE_TUNE). |
| 2026-05-20 | Choice tiles laid out on an ellipse, evenly spaced. | User reference mockup shows an organic quincunx (4 corners + bottom-center for 5 choices), with varied distances from the Cistercian. Replaced even-angle with explicit slot presets per count. |

## Lessons
- **The user's reference images are precise about visual intent — copy the proportions, not the abstract design.** — from the ensō re-balance, 2026-05-20. When the user provides a reference image, treat its proportions (gap size, ink density, lobe amplitude, layout asymmetry) as the spec, not as inspiration. The original heptapod-logograms render is the canonical reference for this project.
- **"Organic" layout is achieved by varied positions, not by jitter on a regular grid.** — from the orbital-to-quincunx switch. Even-angle distribution with random offsets still reads as "geometric with noise." True organic feel comes from intentionally non-uniform anchor positions (the mockup's slot pattern), with only TINY jitter on top.

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
- 2026-05-21 (PWA hardening) — theme_color flipped to cream paper. prefers-reduced-motion wrap added across all keyframes / transitions. Meta-UI surfaces (update toast, install affordance, offline page) introduced and styled in the cream/ink palette using symbol-only labels (↻ ⤓ ⊘ ✕).
- 2026-05-20 (tune session) — Layout decision locked (organic quincunx). Cistercian sized up to `min(60vw, 340px)` so it dominates. Score representation fixed to 8-bit LSB-left. Choice-glyph visual constants captured from the user's tune session. Two design lessons added (proportions-as-spec, organic-via-varied-positions).
- 2026-05-20 — Design role seeded.
