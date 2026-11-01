const { buildSoloDayClusters } = require('../services/dayClusters');

const mk = (osmId, lon, lat) => ({
  osmId,
  interestVector: [0, 0, 0, 0.3, 0.9, 0, 0, 0, 0, 0],
  intensity: 0.2,
  avgVisitDuration: 30,
  needsReview: false,
  location: { coordinates: [lon, lat] },
});

const islamabad = [mk(1, 73.05, 33.70), mk(2, 73.06, 33.71), mk(3, 73.04, 33.69)];
const lahore = [mk(4, 74.34, 31.55), mk(5, 74.35, 31.56), mk(6, 74.33, 31.54)];
const user = { interests: ['viewpoints'], pace: 'moderate' };

test('two far-apart cities become two separate days', () => {
  const r = buildSoloDayClusters(user, 2, [...islamabad, ...lahore]);
  expect(r.days.length).toBe(2);
  for (const d of r.days) {
    const lats = d.places.map((p) => p.poi.location.coordinates[1]);
    expect(lats.every((l) => l > 33) || lats.every((l) => l < 32)).toBe(true);
    expect(d.places.length).toBe(3);
    expect(d.visitMinutes).toBe(90);
  }
});

test('days = 1 keeps every candidate in one day', () => {
  const r = buildSoloDayClusters(user, 1, [...islamabad, ...lahore]);
  expect(r.days.length).toBe(1);
  expect(r.days[0].places.length).toBe(6);
});

test('every candidate appears in exactly one day', () => {
  const r = buildSoloDayClusters(user, 3, [...islamabad, ...lahore]);
  const ids = r.days.flatMap((d) => d.places.map((p) => p.poi.osmId)).sort();
  expect(ids).toEqual([1, 2, 3, 4, 5, 6]);
});