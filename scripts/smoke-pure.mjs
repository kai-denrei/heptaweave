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
import { createParams, DEFAULTS, encodeDiff, decodeDiff, diffFromHash, dissipFor } from '../src/params.js';

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

  // Test-mode overrides.
  const r3 = buildRound({ score: 0, rng: createRng(5), overrides: { pinTier: 7 } });
  ok('pinTier 7 at score 0 → tier 7, 7 choices, 2500ms', r3.tier === 7 && r3.choices.length === 7 && r3.revealMs === 2500);
  const r4 = buildRound({ score: 0, rng: createRng(6), overrides: { choiceCount: 5 } });
  ok('choiceCount override 5 at tier 0', r4.choices.length === 5 && r4.tier === 0);
  const r5 = buildRound({ score: 0, rng: createRng(7), overrides: { pinTier: -1, choiceCount: 0, sharedDigits: -1 } });
  ok('neutral overrides = table', r5.tier === 0 && r5.choices.length === 2);
  const r6 = buildRound({ score: 0, rng: createRng(8), overrides: { sharedDigits: 3, choiceCount: 4 } });
  ok('sharedDigits override honoured', r6.sharedDigits === 3 && r6.choices.length === 4);
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

console.log('\nparams');
{
  const diff = { flowStrength: 2.1, pinTier: 7, holdMs: 0 };
  const enc = encodeDiff(diff);
  ok('encode is base64url (no + / =)', /^[A-Za-z0-9_-]+$/.test(enc));
  ok('decode round-trips', JSON.stringify(decodeDiff(enc)) === JSON.stringify(diff));
  ok('decode drops unknown keys', Object.keys(decodeDiff(encodeDiff({ nope: 1, grain: 0.1 }))).join() === 'grain');
  ok('decode of garbage is {}', Object.keys(decodeDiff('!!notbase64')).length === 0);
  ok('empty diff encodes to empty string', encodeDiff({}) === '');
  ok('diffFromHash finds p= among other flags', diffFromHash('#test&p=' + enc).pinTier === 7);
  ok('diffFromHash without p= is {}', Object.keys(diffFromHash('#test')).length === 0);

  // Overlay precedence: defaults ← storage ← hash.
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  storage.setItem('k', JSON.stringify({ flowStrength: 0.5, grain: 0.1 }));
  const p = createParams({ storageKey: 'k', hash: '#p=' + encodeDiff({ flowStrength: 2.9 }), storage });
  ok('hash beats storage', p.get('flowStrength') === 2.9);
  ok('storage beats default', p.get('grain') === 0.1);
  ok('untouched key is default', p.get('holdMs') === DEFAULTS.holdMs);
  ok('diff lists only changed keys', Object.keys(p.diff()).sort().join() === 'flowStrength,grain');
  let seen = null;
  p.on((k, v) => { seen = [k, v]; });
  p.set('holdMs', 900);
  ok('set emits', seen && seen[0] === 'holdMs' && seen[1] === 900);
  p.set('bogus', 1);
  ok('unknown key ignored', p.get('bogus') === undefined);
  p.save();
  ok('save writes the diff', JSON.parse(mem.get('k')).holdMs === 900);
  p.reset();
  ok('reset returns to defaults', Object.keys(p.diff()).length === 0);
  ok('shareHash empty at defaults', p.shareHash() === '');
  p.set('caustic', 3);
  ok('shareHash carries p=', p.shareHash().startsWith('p='));

  // Dissolve math: density after `seconds` at 60 steps/s hits the floor.
  const d = dissipFor(1.5, 0.02);
  ok('dissipFor(1.5s) < 1', d < 1 && d > 0.9);
  ok('dissipFor lands on floor', Math.abs(Math.pow(d, 90) - 0.02) < 1e-9);
  ok('dissipFor(8s) slower than 1.5s', dissipFor(8, 0.02) > d);
  ok('dissipFor(0) = 1 (stays)', dissipFor(0) === 1);
}


// ---------------------------------------------------------------------------
// growth front (one-trait Cistercian)
// ---------------------------------------------------------------------------
console.log('growth front');
{
  const { cistercianGrowth, cistercianGrowthPx } = await import('../src/cistercian/growthFront.js');
  const { cistercianSegmentsPx } = await import('../src/cistercian/cistercianInk.js');
  let allFinite = true, allReach = true, staveOk = true;
  for (let n = 0; n <= 9999; n += 7) {
    const { paths, maxD } = cistercianGrowth(n);
    for (const p of paths) {
      for (const q of p.points) if (!Number.isFinite(q.d) || q.d < 0) allFinite = false;
      // Every path starts at its smallest d (front origin first).
      if (p.points[0].d > Math.min(...p.points.map(q => q.d)) + 1e-9) allReach = false;
    }
    if (!(maxD > 0 && maxD <= 3.5)) staveOk = false;
  }
  ok('every point has a finite, non-negative distance', allFinite);
  ok('every path begins at its front origin', allReach);
  ok('maxD is within the glyph box', staveOk);

  const six = cistercianGrowth(6);
  const seeded = six.paths.filter(p => p.seeded);
  ok('digit 6 grows from its own seed (two halves)', seeded.length === 2 && seeded.every(p => Math.abs(p.points[0].d - 1.0) < 1e-9));
  const nine = cistercianGrowth(9);
  const ninePath = nine.paths.find(p => p.digit === 9);
  ok('digit 9 attaches at both ends (fronts meet)', ninePath && ninePath.points[0].d === 0.5 && ninePath.points[3].d === 1.5 && ninePath.points[1].d === 1.5 && ninePath.points[2].d === 2.5);
  const zero = cistercianGrowth(0);
  ok('0 is just the stave', zero.paths.length === 2 && Math.abs(zero.maxD - 1.5) < 1e-9);

  // Pixel mapping agrees with the segment builder's endpoints.
  const px = cistercianGrowthPx({ number: 1234, size: 300, padFrac: 0.1 });
  const segs = cistercianSegmentsPx({ number: 1234, size: 300, padFrac: 0.1 });
  const segPts = new Set(segs.flatMap(s => [s.from, s.to]).map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`));
  const growPts = px.paths.flatMap(p => p.points).filter(q => q.d > 1e-9 || true).map(q => `${q.x.toFixed(3)},${q.y.toFixed(3)}`);
  const covered = [...segPts].every(k => growPts.includes(k));
  ok('growth px vertices cover every segment endpoint', covered);
}

// ---------------------------------------------------------------------------
// band layout
// ---------------------------------------------------------------------------
console.log('ring stave');
{
  const { ringStaveGrowthPx } = await import('../src/cistercian/ringStave.js');
  let finite = true, monotone = true, inside = true, sixSeeded = true;
  for (let n = 0; n <= 9999; n += 13) {
    const { paths, maxD } = ringStaveGrowthPx({ number: n, size: 300, padFrac: 0.1 });
    if (!(maxD > 0)) finite = false;
    for (const p of paths) {
      for (const q of p.points) {
        if (!Number.isFinite(q.d) || q.d < 0) finite = false;
        if (q.x < -1 || q.y < -1 || q.x > 301 || q.y > 301) inside = false;
      }
      const md = Math.min(...p.points.map(q => q.d));
      if (p.points[0].d > md + 1e-9 && p.points[p.points.length - 1].d > md + 1e-9) monotone = false;
    }
    const digits = [Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
    const seeded = paths.filter(p => p.seeded).length;
    if (seeded !== 2 * digits.filter(d => d === 6).length) sixSeeded = false;
  }
  ok('every point has a finite, non-negative distance', finite);
  ok('every path starts its front at an endpoint', monotone);
  ok('the figure stays inside its cell', inside);
  ok('digit 6 (and only 6) grows from its own seed', sixSeeded);
  const zero = ringStaveGrowthPx({ number: 0, size: 300 });
  ok('0 is the bare ring', zero.paths.length === 2);
  const { placeDigits } = await import('../src/cistercian/ringStave.js');
  ok('digits read from the right, no leading zeros', JSON.stringify(placeDigits(20)) === '[0,2]' && JSON.stringify(placeDigits(12345)) === '[5,4,3,2,1]' && JSON.stringify(placeDigits(0)) === '[0]');
  const five = ringStaveGrowthPx({ number: 12345, size: 300, slots: 8 });
  ok('a 5-digit number occupies five slots', new Set(five.paths.filter(p => p.place !== 'stave').map(p => p.place)).size === 5);
  const wide = ringStaveGrowthPx({ number: 1234567890123456, size: 300, slots: 16 });
  ok('16 slots hold a 16-digit number inside the cell', wide.paths.every(p => p.points.every(q => q.x >= -1 && q.y >= -1 && q.x <= 301 && q.y <= 301)));
}

console.log('band layout');
{
  const { layoutBands } = await import('../src/render/ink/bandLayout.js');
  const sizes = [[420, 860], [360, 640], [1024, 700], [800, 800]];
  let inside = true, disjoint = true, bigger = true;
  for (const [w, h] of sizes) {
    const promptSize = Math.min(w, h) * 0.4;
    for (let count = 2; count <= 7; count++) {
      const { tileSize, centers } = layoutBands({ width: w, height: h, promptSize, count, gap: 8, maxTile: 220 });
      const r = tileSize / 2;
      for (const c of centers) {
        if (c.x - r < -0.5 || c.y - r < -0.5 || c.x + r > w + 0.5 || c.y + r > h + 0.5) inside = false;
        // clear of the prompt square
        if (Math.abs(c.x - w / 2) < promptSize / 2 + r - 0.5 && Math.abs(c.y - h / 2) < promptSize / 2 + r - 0.5) inside = false;
      }
      for (let i = 0; i < centers.length; i++) for (let j = i + 1; j < centers.length; j++) {
        const a = centers[i], b = centers[j];
        if (Math.abs(a.x - b.x) < tileSize - 0.5 && Math.abs(a.y - b.y) < tileSize - 0.5) disjoint = false;
      }
      if (centers.length !== count) inside = false;
    }
  }
  ok('tiles stay inside the container and clear of the prompt', inside);
  ok('tiles do not overlap', disjoint);
  const phone = layoutBands({ width: 420, height: 860, promptSize: 168, count: 7, gap: 8, maxTile: 220 });
  ok(`phone 7-up tile is much bigger than the 95px orbit (got ${phone.tileSize})`, phone.tileSize >= 140);
}


console.log(`\ndone — ${fails} failures`);
process.exit(fails ? 1 : 0);
