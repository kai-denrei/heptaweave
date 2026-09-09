// state.js — game state machine.
//
// Phases:
//   LANDING        — mode-pick screen
//   ROUND_INIT     — compute target, distractors, push to RENDER
//   RENDER         — draw cistercian + choices; about to start reveal/CHOOSE
//   REVEAL         — cistercian fades after revealMs (or stays = no fade)
//   CHOOSE         — waiting for user tap on a choice
//   ANSWER_OK      — correct; score++; queue next round
//   ANSWER_BAD     — wrong; mode-specific penalty; queue next round or GAME_OVER
//   GAME_OVER      — show summary; tap to return to LANDING
//   COUNT          — the + mode: no rounds, a number counting up; hold to leave
//
// The store is a tiny event-emitter with a getState() + on(fn) + dispatch(action).

export const PHASE = Object.freeze({
  LANDING: 'LANDING',
  ROUND_INIT: 'ROUND_INIT',
  RENDER: 'RENDER',
  REVEAL: 'REVEAL',
  CHOOSE: 'CHOOSE',
  ANSWER_OK: 'ANSWER_OK',
  ANSWER_BAD: 'ANSWER_BAD',
  GAME_OVER: 'GAME_OVER',
  COUNT: 'COUNT',        // + counter running; hold to leave
});

export const MODE = Object.freeze({
  TIMED: 'TIMED', // ⧖
  ENDLESS: 'ENDLESS', // ∞
  COUNT: 'COUNT', // + (right): heptaweave logogram
  COUNT_C: 'COUNT_C', // + (left): Cistercian glyph
});

export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  function get() { return state; }
  function set(patch) {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  }
  function on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  return { get, set, on };
}
