// scripts/smoke-pure.mjs — DOM-free smoke test of the game logic.
//
// Validates:
//   - RNG determinism + shuffle()
//   - difficulty table monotonic
//   - distractor generation honors sharedDigits at low and high K
//   - buildRound produces a target ∈ choices, all distinct
//   - bitLength + binary score correctness
//
// Run: node scripts/smoke-pure.mjs

import { createRng } from '../src/util/rng.js';
import { difficultyFor, bitLength } from '../src/game/difficulty.js';
import { pickChoices } from '../src/game/distractors.js';
import { buildRound } from '../src/game/round.js';
import { digitsOf, PATTERNS } from '../src/heptacipher/morsePatterns.js';
import { MODE_CONFIG, isCleanResult } from '../src/game/modes.js';

let fails = 0;
function ok(msg, cond) {
  console.log(cond ? `  ok  — ${msg}` : `  FAIL — ${msg}`);
  if (!cond) fails++;
}

console.log('rng');
{
  const a = createRng(42);
  const b = createRng(42);
  const da = [a.next(), a.next(), a.next(), a.next()].map(x => +x.toFixed(6));
  const db = [b.next(), b.next(), b.next(), b.next()].map(x => +x.toFixed(6));
  ok('deterministic by seed', JSON.stringify(da) === JSON.stringify(db));
  const c = createRng(99);
  const s = c.shuffle([1,2,3,4,5,6,7,8]);
  ok('shuffle returns same length', s.length === 8);
  ok('shuffle preserves set', new Set(s).size === 8);
}

console.log('\nbitLength');
{
  ok('bitLength(0) = 0', bitLength(0) === 0);
  ok('bitLength(1) = 1', bitLength(1) === 1);
  ok('bitLength(3) = 2', bitLength(3) === 2);
  ok('bitLength(7) = 3', bitLength(7) === 3);
  ok('bitLength(8) = 4', bitLength(8) === 4);
  ok('bitLength(255) = 8', bitLength(255) === 8);
  ok('bitLength(256) = 9', bitLength(256) === 9);
}

console.log('\ndifficulty table');
{
  const t0 = difficultyFor(0);
  const t1 = difficultyFor(1);
  const t3 = difficultyFor(3);
  const t8 = difficultyFor(8);
  const t128 = difficultyFor(128);
  const t1000 = difficultyFor(1000);
  ok('tier 0 has 2 choices, no fade', t0.choiceCount === 2 && t0.revealMs === 0);
  ok('tier 1 has 3 choices, no fade', t1.choiceCount === 3 && t1.revealMs === 0);
  ok('tier 2 (score=3) has 3 choices, 8000ms', t3.choiceCount === 3 && t3.revealMs === 8000);
  ok('tier 4 (score=8) has 5 choices', t8.choiceCount === 5);
  ok('tier 8 (score=128) revealMs 2000', t128.revealMs === 2000);
  ok('tier 9 (score=1000) magnitudeMatched', t1000.magnitudeMatched === true);
}

console.log('\ndistractors');
{
  const rng = createRng(1234);
  // K=0 random
  const c0 = pickChoices({ target: 5000, count: 5, sharedDigits: 0, rng });
  ok('K=0 returns 5 unique', new Set(c0).size === 5);
  ok('K=0 includes target', c0.includes(5000));

  const r2 = createRng(99);
  const c2 = pickChoices({ target: 1234, count: 5, sharedDigits: 2, rng: r2 });
  // For each distractor, count shared digits
  const targetDigits = digitsOf(1234);
  for (const d of c2) {
    if (d === 1234) continue;
    const dd = digitsOf(d);
    let shared = 0;
    for (let i = 0; i < 4; i++) if (dd[i] === targetDigits[i]) shared++;
    ok(`K=2 distractor ${d} shares ≥2 with 1234 (shared=${shared})`, shared >= 2);
  }

  const r3 = createRng(99);
  const c3 = pickChoices({ target: 4321, count: 7, sharedDigits: 3, rng: r3 });
  ok('K=3 returns 7 unique', new Set(c3).size === 7);

  // Magnitude-matched.
  const r4 = createRng(77);
  const c4 = pickChoices({ target: 4000, count: 7, sharedDigits: 3, magnitudeMatched: true, rng: r4 });
  ok('K=3 magnitude returns 7 unique', new Set(c4).size === 7);
  for (const d of c4) {
    if (d === 4000) continue;
    ok(`mag distractor ${d} within ±25% of 4000`, d >= 3000 && d <= 5000);
  }
}

console.log('\nbuildRound');
{
  const rng = createRng(0xbaad);
  const r = buildRound({ score: 0, rng });
  ok('round target is integer', Number.isInteger(r.target) && r.target >= 0 && r.target <= 9999);
  ok('round choices count = 2 for tier 0', r.choices.length === 2);
  ok('round choices include target', r.choices.includes(r.target));

  const rng2 = createRng(0xbeef);
  const r2 = buildRound({ score: 64, rng: rng2 });
  ok('tier 7 has 7 choices', r2.choices.length === 7);
}

console.log('\nmorse patterns');
{
  ok('10 patterns', PATTERNS.length === 10);
  for (let d = 0; d < 10; d++) ok(`pattern ${d} length 5`, PATTERNS[d].length === 5);
  ok('digitsOf(1234) = [1,2,3,4]', JSON.stringify(digitsOf(1234)) === '[1,2,3,4]');
  ok('digitsOf(9) = [0,0,0,9]', JSON.stringify(digitsOf(9)) === '[0,0,0,9]');
  ok('digitsOf(9999) = [9,9,9,9]', JSON.stringify(digitsOf(9999)) === '[9,9,9,9]');
}

console.log('\nmodes');
{
  ok('TIMED initialTimeMs = 60000', MODE_CONFIG.TIMED.initialTimeMs === 60_000);
  ok('TIMED penaltyMs = 10000', MODE_CONFIG.TIMED.penaltyMs === 10_000);
  ok('ENDLESS endOnError', MODE_CONFIG.ENDLESS.endOnError === true);
  ok('clean iff errors=0', isCleanResult({ mode: 'TIMED', errors: 0 }) === true);
  ok('errors=1 not clean', isCleanResult({ mode: 'TIMED', errors: 1 }) === false);
}

console.log(`\ndone — ${fails} failures`);
process.exit(fails ? 1 : 0);
