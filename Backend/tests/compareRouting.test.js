// tests/compareRouting.test.js  (node:test)   node --test tests/compareRouting.test.js
// OSRM is replaced by a fake "road" matrix (Haversine x a random detour factor per pair, so it is asymmetric and
// different from the Haversine one). No network, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineMatrix } = require('../services/osrm');
const { isUsable } = require('../services/candidates');
const { parseArgs, mulberry32, randomPois, compareDay, run, printReport, OsrmUnavailableError } = require('../scripts/compareRouting');

function fakeRoadMatrix(points, seed = 99) {
  const rnd = mulberry32(seed);
  const h = haversineMatrix(points);
  const durationsMin = h.durationsMin.map((row, i) => row.map((v, j) => (i === j ? 0 : v * (0.7 + 0.9 * rnd()))));
  return { durationsMin, distancesKm: h.distancesKm, source: 'osrm', warnings: [] };
}
const fakeOsrm = async (points) => fakeRoadMatrix(points);
const pointsOf = (n, seed) => randomPois(n, seed).map((p) => ({ lat: p.location.coordinates[1], lon: p.location.coordinates[0] }));
const all = (n) => Array.from({ length: n }, (_, i) => i);

test('parseArgs: defaults, direct mode default days, validation', () => {
  const d = parseArgs([]);
  assert.deepEqual([d.region, d.pace, d.days, d.seed], ['islamabad', 'moderate', 2, 1]);
  assert.equal(parseArgs(['--random', '20', '--direct']).days, 1);
  assert.deepEqual(parseArgs(['--interests', 'viewpoints,food_cafes']).interests, ['viewpoints', 'food_cafes']);
  assert.throws(() => parseArgs(['--interests', 'nope']), /Unknown interest/);
  assert.throws(() => parseArgs(['--pace', 'sprint']), /pace must be/);
  assert.throws(() => parseArgs(['--direct']), /--direct needs --random/);
  assert.throws(() => parseArgs(['--days', '0']), /--days/);
  assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);
  assert.throws(() => parseArgs(['--days']), /needs a value/);
});

test('seeded random POIs are repeatable and usable by selectCandidates', () => {
  const a = randomPois(15, 7);
  const b = randomPois(15, 7);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, randomPois(15, 8));
  assert.ok(a.every(isUsable));
});

test('compareDay: identical matrices give zero regret and the same order', () => {
  const D = haversineMatrix(pointsOf(8, 1)).durationsMin;
  const r = compareDay(D, D, all(8));
  assert.equal(r.referenceMethod, 'held-karp');
  assert.ok(Math.abs(r.havExact.regretPct) < 1e-9);
  assert.equal(r.sameOrderAsReference, true);
});

test('compareDay (n <= 12): exact is a lower bound, regret is never negative', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const pts = pointsOf(9, seed);
    const road = fakeRoadMatrix(pts, seed).durationsMin;
    const hav = haversineMatrix(pts).durationsMin;
    const r = compareDay(road, hav, all(9));
    assert.equal(r.referenceMethod, 'held-karp');
    assert.ok(r.havExact.regretPct >= 0 && r.havHeur.regretPct >= 0);
    assert.ok(r.osrmHeur.osrmMin >= r.osrmExact.osrmMin - 1e-9, 'heuristic cannot beat the exact optimum');
    assert.ok(r.osrmHeur.gapPct >= -1e-9);
    assert.ok(r.havExact.osrmMin >= r.osrmExact.osrmMin - 1e-9);
  }
});

test('compareDay (n > 12): uses NN + 2-opt as the reference, no exact result', () => {
  const pts = pointsOf(15, 3);
  const r = compareDay(fakeRoadMatrix(pts).durationsMin, haversineMatrix(pts).durationsMin, all(15));
  assert.equal(r.n, 15);
  assert.equal(r.referenceMethod, 'nn-2opt');
  assert.equal(r.osrmExact, null);
  assert.equal(r.havExact, null);
  assert.deepEqual([...r.referenceOrder].sort((a, b) => a - b), all(15)); // a valid permutation
});

test('compareDay: fewer than 2 places is skipped', () => {
  const D = [[0]];
  assert.equal(compareDay(D, D, [0]).skipped, true);
  assert.equal(compareDay(D, D, []).skipped, true);
});

test('run (direct, 20 points, 1 day): NN + 2-opt branch', async () => {
  const rep = await run(parseArgs(['--random', '20', '--direct', '--days', '1', '--seed', '3']), { getMatrix: fakeOsrm });
  assert.equal(rep.places.length, 20);
  assert.equal(rep.days.length, 1);
  assert.equal(rep.days[0].referenceMethod, 'nn-2opt');
  assert.equal(rep.summary.days, 1);
});

test('run (selection mode): every selected place lands in exactly one day', async () => {
  const opts = parseArgs(['--random', '60', '--seed', '7', '--interests', 'viewpoints,food_cafes,nature_parks', '--pace', 'moderate', '--days', '3', '--diversify']);
  const rep = await run(opts, { getMatrix: fakeOsrm });
  assert.equal(rep.days.length, 3);
  const used = rep.days.flatMap((d) => d.idx);
  assert.equal(used.length, rep.places.length);
  assert.equal(new Set(used).size, used.length);
  assert.ok(rep.summary.meanRegretPct >= 0);
});

test('run is repeatable for the same seed', async () => {
  const args = ['--random', '40', '--seed', '11', '--days', '2'];
  const a = await run(parseArgs(args), { getMatrix: fakeOsrm });
  const b = await run(parseArgs(args), { getMatrix: fakeOsrm });
  assert.deepEqual(a.summary, b.summary);
});

test('run refuses to compare when OSRM was not used (haversine fallback)', async () => {
  const fallback = async (points) => ({ ...haversineMatrix(points), source: 'haversine', warnings: ['OSRM unreachable: test'] });
  await assert.rejects(
    () => run(parseArgs(['--random', '10', '--direct', '--seed', '1']), { getMatrix: fallback }),
    (e) => e instanceof OsrmUnavailableError && e.warnings[0] === 'OSRM unreachable: test'
  );
});

test('db mode uses the injected loader and printReport prints a summary', async () => {
  const lines = [];
  const rep = await run(parseArgs(['--interests', 'viewpoints,nature_parks', '--pace', 'relaxed', '--days', '2']), {
    getMatrix: fakeOsrm,
    loadPois: async (slug) => {
      assert.equal(slug, 'islamabad');
      return randomPois(50, 5);
    },
  });
  printReport(rep, (l) => lines.push(l));
  const text = lines.join('\n');
  assert.match(text, /SUMMARY:/);
  assert.match(text, /Day 1:/);
  assert.match(text, /Haversine plan/);
});