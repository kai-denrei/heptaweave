# heptaweave — v1 spec (frozen)

Symbol-only PWA quiz. See `.deban/_index.md` for project brief and active roles.

## Concept
Pick a mode (⧖ timed or ∞ endless). Each round a Cistercian numeral 0–9999 is
drawn in sumi-ink. The player taps the matching heptacipher logogram from N
choices. No Latin characters, no Arabic numerals visible during play.

## Modes
| Mode | Symbol | Rule | End |
|---|---|---|---|
| Time     | ⧖ | 60 s shrinking colour-shift ring (teal → orange → red). Wrong = −10 s. | Timer → 0 |
| Endless  | ∞ | First wrong answer = game over. | First error |

## Score
Variable-width binary in sumi-ink. Filled blob = 1, short dash = 0. 53 →
`110101` → 6 marks. Top-left of play screen. Grows leftward.

## Difficulty (bit-milestone tiers)
Tier = `bitlength(score)`. Three composable levers per tier:

| Score    | Tier | Reveal  | Choices | Closeness                |
|----------|------|---------|---------|--------------------------|
| 0        | 0    | stays   | 2       | random                   |
| 1        | 1    | stays   | 3       | random                   |
| 2–3      | 2    | 8000 ms | 3       | random                   |
| 4–7      | 3    | 6000 ms | 4       | 1 shared digit           |
| 8–15     | 4    | 5000 ms | 5       | 1 shared digit           |
| 16–31    | 5    | 4000 ms | 5       | 2 shared digits          |
| 32–63    | 6    | 3000 ms | 6       | 2 shared digits          |
| 64–127   | 7    | 2500 ms | 7       | 3 shared digits          |
| 128–255  | 8    | 2000 ms | 7       | 3 shared digits          |
| 256+     | 9+   | 1500 ms | 7       | 3 + magnitude-matched    |

## Choice renderers
Both ship in v1; toggle by 1-second long-press on bottom-right corner of landing.
- **Renderer A** — lobes-only. The choice circle IS the ensō; 4 lobes hang off it.
- **Renderer B** — full mini heptacipher (inner ensō + 4 outward/inward lobes).

## Game-over
Big binary score centered in ink. Single dot below: teal-green if no errors
in the run, dark red if any errors. Tap anywhere to return to landing.

## Persistence
`localStorage`:
- `heptaweave.renderer`  — 'A' | 'B'
- `heptaweave.best`      — JSON: `{ TIMED, ENDLESS }`

## File layout
See `.deban/roles/arch.md`.
