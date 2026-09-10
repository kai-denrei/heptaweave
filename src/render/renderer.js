// renderer.js — the Renderer contract every theme implements.
//
// main.js owns the rules (store, rounds, modes, persistence) and calls into a
// renderer; a renderer owns the DOM/canvas and never reads rules. Every method
// is synchronous. `noopRenderer` documents the shape and is a safe base to
// spread over so a theme can omit what it doesn't need.
//
//   mount({ root, on })        — build/gather DOM once. `on` carries callbacks:
//                                on.modeSelect(mode), on.gameOverTap(),
//                                on.countHold() (1 s press on the count screen),
//                                on.copyLink() → Promise<boolean> (the hidden ⧉),
//                                on.cornerHold() (1 s press on landing's
//                                bottom-right — themes may use it or not).
//   showScreen(name)           — 'landing' | 'play' | 'gameover' | 'count'
//   startRun({ mode, totalMs })
//   paintPrompt({ number, seed, revealMs, mode, timeRemainingMs, totalMs })
//   clearPrompt({ reason })    — 'reveal' | 'correct' | 'wrong' | 'end'
//   renderChoices({ numbers, seed, onPick })   — onPick(number, tileEl)
//   feedback({ number, tileEl, correct })
//   renderScore({ score, animateNewBit })
//   tick({ dt, mode, phase, timeRemainingMs, totalMs })  — every frame in play
//   showGameOver({ mode, score, errors, clean })
//   renderCount({ value, periodMs, glyph })  — a + mode's number changed;
//                                glyph is 'heptaweave' | 'cistercian' | 'ringstave'
//   teardown()
//
//   delays: { correct, wrongContinue, wrongEnd } — ms main.js waits after a
//   pick before advancing, so a theme can size its own reaction beat.

export const noopRenderer = {
  mount() {},
  showScreen() {},
  startRun() {},
  paintPrompt() {},
  clearPrompt() {},
  renderChoices() {},
  feedback() {},
  renderScore() {},
  tick() {},
  showGameOver() {},
  renderCount() {},
  teardown() {},
  delays: { correct: 380, wrongContinue: 700, wrongEnd: 600 },
};
