const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineMatrix } = require('../services/osrm');
const { randomPois, mulberry32 } = require('../scripts/compareRouting');
const { generateGroupItinerary } = require('../services/groupItinerary');

const pois = randomPois(80, 4).map((p) => ({ ...p, _id: `id${p.osmId}` }));
const members = [
  { id: 'a', name: 'Ali', interests: ['viewpoints', 'nature_parks'], pace: 'moderate' },
  { id: 'b', name: 'Bilal', interests: ['food_cafes', 'viewpoints'], pace: 'relaxed' },
  { id: 'c', name: 'Cara', interests: ['history_heritage', 'nature_parks', 'food_cafes'], pace: 'fast' },
];
const roadMatrix = async (pts) => {
  const r = mulberry32(9);
  const h = haversineMatrix(pts);
  return { ...h, durationsMin: h.durationsMin.map((row, i) => row.map((v, j) => (i === j ? 0 : v * (0.8 + 0.6 * r())))), source: 'osrm', warnings: [] };
};
const run = (extra = {}, deps = {}) =>
  generateGroupItinerary({ members, days: 3, pois, regionSlug: 'islamabad', ownerId: 'o1', groupId: 'g1', startDate: '2026-12-01', ...extra }, { getMatrix: roadMatrix, ...deps });
const allPlaces = (r) => r.days.flatMap((d) => d.places);

test('shape: dates, capacity of the slowest member, every place once, per-place group fields', async () => {
  const r = await run();
  assert.equal(r.dayCount, 3);
  assert.deepEqual(r.days.map((d) => d.date), ['2026-12-01', '2026-12-02', '2026-12-03']);
  assert.equal(r.endDate, '2026-12-03');
  assert.equal(r.pace, 'relaxed');
  assert.ok(r.days.every((d) => d.capacityMinutes === 270));
  assert.equal(r.travelTimeSource, 'osrm');
  const ps = allPlaces(r);
  assert.equal(new Set(ps.map((p) => p.poiId)).size, ps.length);
  assert.equal(ps.length + r.dropped.length, r.selectedCount);
  assert.equal(r.type, 'group');
  assert.deepEqual(r.participants.map((x) => x.userId), ['a', 'b', 'c']);
  for (const p of ps) {
    assert.ok(['consensus', 'roundrobin'].includes(p.source));
    assert.deepEqual(p.memberScores.map((x) => x.userId).sort(), ['a', 'b', 'c']);
    assert.ok(p.reason.length > 0);
    assert.ok(p.source === 'consensus' ? p.selectedFor === null : ['a', 'b', 'c'].includes(p.selectedFor));
  }
  r.days.forEach((d) => d.places.forEach((p, k) => assert.equal(p.order, k + 1)));
});

test('every day fits its capacity (rounding tolerance), day totals match the places', async () => {
  const r = await run();
  for (const d of r.days) {
    assert.equal(d.visitMinutes, d.places.reduce((s, p) => s + p.visitMinutes, 0));
    assert.equal(d.travelMinutes, d.places.reduce((s, p) => s + p.travelMinutesFromPrevious, 0));
    assert.ok(d.places.length <= 1 || d.visitMinutes + d.travelMinutes <= d.capacityMinutes + d.places.length);
  }
});

test('overflow: a tiny capacity moves or drops places, nothing is lost or duplicated, consensus survives longest', async () => {
  const r = await run({}, { options: { capacityMinutes: 150 } });
  assert.ok(r.moved.length + r.dropped.length > 0);
  const ps = allPlaces(r);
  assert.equal(new Set(ps.map((p) => p.poiId)).size, ps.length);
  assert.equal(ps.length + r.dropped.length, r.selectedCount);
  assert.ok(r.dropped.every((x) => x.source === 'roundrobin') || ps.every((p) => p.source === 'consensus'), 'a consensus place was dropped while round-robin places stayed');
  for (const d of r.days) assert.ok(d.places.length <= 1 || d.visitMinutes + d.travelMinutes <= 150 + d.places.length);
  assert.ok(r.warnings.some((w) => /hata di gayi|rakhi gayi/.test(w)));
});

test('satisfaction: cumSat is the sum and avgScore the mean of the member scores over the places that stayed', async () => {
  const r = await run({}, { options: { capacityMinutes: 150 } });
  const ps = allPlaces(r);
  assert.equal(r.satisfaction.length, 3);
  for (const id of ['a', 'b', 'c']) {
    const sat = r.satisfaction.find((s) => s.userId === id);
    const scores = ps.map((p) => p.memberScores.find((x) => x.userId === id).score);
    const total = scores.reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(sat.cumSat - total) < 0.0011, `${id} cumSat ${sat.cumSat} vs ${total}`);
    assert.ok(Math.abs(sat.avgScore - total / ps.length) < 0.0011);
    assert.ok(sat.avgScore >= 0 && sat.avgScore <= 1);
  }
});

test('the output is valid for the real Itinerary schema (type, ObjectIds, arrays, reason kept)', async () => {
  const mongoose = require('mongoose');
  const Itinerary = require('../models/Itinerary');
  const oid = () => new mongoose.Types.ObjectId();
  const ms = members.map((m) => ({ ...m, id: String(oid()) }));
  const ps = pois.map((p) => ({ ...p, _id: oid() }));
  const r = await generateGroupItinerary(
    { members: ms, days: 3, pois: ps, regionSlug: 'islamabad', ownerId: oid(), groupId: oid(), startDate: '2026-12-01' },
    { getMatrix: roadMatrix }
  );
  const { dropped, moved, poolSize, avgVisitUsed, selectedCount, consensusCount, pace, ...toSave } = r;
  const doc = new Itinerary(toSave);
  assert.equal(doc.validateSync(), undefined);
  assert.ok(doc.days[0].places[0].reason.length > 0, 'add `reason: String` to placeSchema, otherwise it is dropped');
  assert.equal(doc.days[0].places[0].memberScores.length, 3);
  assert.equal(doc.satisfaction.length, 3);
});

test('deterministic: same input, same itinerary', async () => {
  const a = await run();
  const b = await run();
  assert.deepEqual(a.days.map((d) => d.places.map((p) => p.poiId)), b.days.map((d) => d.places.map((p) => p.poiId)));
});

test('OSRM fallback: source and the "estimated" warning come through', async () => {
  const getMatrix = async (pts) => ({ ...haversineMatrix(pts), source: 'haversine', warnings: ['Travel times are estimated from straight-line distance (test).'] });
  const r = await generateGroupItinerary({ members, days: 2, pois, regionSlug: 'islamabad', ownerId: 'o1', groupId: 'g1' }, { getMatrix });
  assert.equal(r.travelTimeSource, 'haversine');
  assert.ok(r.warnings.some((w) => /estimated from straight-line/i.test(w)));
  assert.equal(r.startDate, undefined);
  assert.equal(r.days[0].date, undefined);
});

test('validation and empty region', async () => {
  await assert.rejects(() => run({ days: 0 }), /days must be/);
  await assert.rejects(() => run({ days: 15 }), /days must be/);
  await assert.rejects(() => run({ members: [members[0]] }), /2 to \d+/);
  let called = 0;
  const r = await run({ pois: [] }, { getMatrix: async () => { called++; return roadMatrix([]); } });
  assert.equal(called, 0);
  assert.equal(r.days.length, 3);
  assert.ok(r.days.every((d) => d.places.length === 0));
  assert.deepEqual(r.satisfaction, []);
  assert.equal(r.travelTimeSource, undefined);
  assert.ok(r.warnings.some((w) => /koi jagah nahi/.test(w)));
});