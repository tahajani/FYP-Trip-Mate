const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineMatrix } = require('../services/osrm');
const { randomPois, mulberry32 } = require('../scripts/compareRouting');
const { pickDayPlaces } = require('../services/regenerateDay');

const pois = randomPois(40, 5).map((p) => ({ ...p, _id: `id${p.osmId}` }));
const user = { interests: ['viewpoints', 'food_cafes', 'nature_parks'], pace: 'moderate' };
const mkMatrix = () => {
  const calls = [];
  const fn = async (pts) => {
    calls.push(pts.length);
    const r = mulberry32(3);
    const h = haversineMatrix(pts);
    return { ...h, durationsMin: h.durationsMin.map((row, i) => row.map((v, j) => (i === j ? 0 : v * (0.8 + 0.6 * r())))), source: 'osrm', warnings: [] };
  };
  fn.calls = calls;
  return fn;
};

test('returns an ordered day without excluded places, one matrix call', async () => {
  const getMatrix = mkMatrix();
  const excluded = pois.slice(0, 10).map((p) => p._id);
  const r = await pickDayPlaces(user, pois, excluded, { getMatrix });
  assert.ok(r.places.length >= 1);
  const ids = r.places.map((x) => x.poi._id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => !excluded.includes(id)));
  assert.equal(getMatrix.calls.length, 1);
  assert.equal(r.travelTimeSource, 'osrm');
});

test('same input gives the same day; excluding it gives different places', async () => {
  const a = await pickDayPlaces(user, pois, [], { getMatrix: mkMatrix() });
  const b = await pickDayPlaces(user, pois, [], { getMatrix: mkMatrix() });
  assert.deepEqual(a.places.map((x) => x.poi._id), b.places.map((x) => x.poi._id));
  const c = await pickDayPlaces(user, pois, a.places.map((x) => x.poi._id), { getMatrix: mkMatrix() });
  assert.equal(c.places.filter((x) => a.places.some((y) => y.poi._id === x.poi._id)).length, 0);
});

test('nothing left to pick: empty day, no matrix call', async () => {
  const getMatrix = mkMatrix();
  const r = await pickDayPlaces(user, pois, pois.map((p) => p._id), { getMatrix });
  assert.deepEqual(r.places, []);
  assert.equal(getMatrix.calls.length, 0);
});

test('OSRM fallback is passed through', async () => {
  const getMatrix = async (pts) => ({ ...haversineMatrix(pts), source: 'haversine', warnings: ['estimated'] });
  const r = await pickDayPlaces(user, pois, [], { getMatrix });
  assert.equal(r.travelTimeSource, 'haversine');
  assert.deepEqual(r.warnings, ['estimated']);
});