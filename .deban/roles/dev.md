---
role: dev
owner: claude-on-kainode
status: active
last-updated: 2026-05-20
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

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|
| 2026-05-20 | Copied `morseDigitArc.js` verbatim from heptacipher; imports `./brush.js` / `./splotch.js` relative. | In heptaweave the ink primitives live under `src/ink/`, not flat `src/`. Browser silently ate the error (`Failed to fetch dynamically imported module` with no underlying cause). Fixed by rewriting imports to `../ink/brush.js` / `../ink/splotch.js`. Lesson: when porting a file from a flat-src project to a nested-src project, audit relative imports first. |

## Lessons
- Verbatim ports across differing folder layouts need an import-rewrite pass.
- Chrome's dynamic-import error message is unhelpful; cascade-import each file in isolation to find the broken one.

## Open Questions
- [ ] Should the bust.sh from heptacipher walk all .js too, or just .html/.htm? Current: also rewrites <meta cb> in any .html/.htm/.js but only fingerprints URLs in .html/.css. Good enough for now. — owner: claude-on-kainode — since: 2026-05-20

## Assumptions
- Python 3 is on PATH (it is on macOS). — status: validated — since: 2026-05-20
- The dev server can be reached on `http://127.0.0.1:8766` from the user's browser. — status: untested — since: 2026-05-20

## Dependencies
Blocked by:
Feeds into:

## Session Log
- 2026-05-20 — Dev role seeded.
