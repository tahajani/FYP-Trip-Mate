const { selectCandidates, isUsable } = require('../services/candidates');

const mk = (osmId, vec, intensity, dur, extra = {}) => ({
  osmId,
  interestVector: vec,
  intensity,
  avgVisitDuration: dur,
  needsReview: false,
  location: { coordinates: [73, 33.7] },
  ...extra,
});

const viewpoint = mk(1, [0, 0, 0, 0.3, 0.9, 0, 0, 0, 0, 0], 0.2, 30);
const mosque = mk(2, [0.4, 0.9, 0, 0, 0, 0, 0, 0, 0, 0], 0.3, 45);
const park = mk(3, [0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0], 0.3, 60);
const flagged = mk(4, null, undefined, undefined, { needsReview: true });
const nullVec = mk(5, null, 0.3, 45);

const user = { interests: ['viewpoints'], pace: 'moderate' };

test('isUsable rejects needsReview, null vector and missing numbers', () => {
  expect(isUsable(viewpoint)).toBe(true);
  expect(isUsable(flagged)).toBe(false);
  expect(isUsable(nullVec)).toBe(false);
  expect(isUsable(mk(6, [1, 2], 0.3, 45))).toBe(false); // wrong length
});

test('unusable POIs are excluded and the best match is first', () => {
  const r = selectCandidates(user, 1, [flagged, park, nullVec, mosque, viewpoint]);
  expect(r.places.length).toBe(3);
  expect(r.places[0].poi.osmId).toBe(1);
  // viewpoint: 0.75 * sqrt(0.9) + 0.25 * 0.7
  expect(r.places[0].score).toBeCloseTo(0.75 * Math.sqrt(0.9) + 0.25 * 0.7, 4);
});

test('equal scores are ordered by osmId (deterministic)', () => {
  const r = selectCandidates(user, 1, [park, mosque, viewpoint]);
  expect(r.places.map((p) => p.poi.osmId)).toEqual([1, 2, 3]);
});

test('pool size comes from the mean visit time of the top 3 x days', () => {
  const r = selectCandidates(user, 1, [viewpoint, mosque, park]);
  expect(r.avgVisitUsed).toBeCloseTo(45, 5); // (30 + 45 + 60) / 3
  expect(r.poolSize).toBe(4); // floor(360 / 75) = 4, but only 3 places exist
});

test('N caps the result', () => {
  const longVisits = Array.from({ length: 10 }, (_, i) =>
    mk(100 + i, [0, 0, 0, 0, 1, 0, 0, 0, 0, 0], 0.2, 150)
  );
  const r = selectCandidates({ interests: ['viewpoints'], pace: 'relaxed' }, 1, longVisits);
  expect(r.poolSize).toBe(1); // floor(270 / 180) = 1
  expect(r.places.length).toBe(1);
});

test('empty or invalid input', () => {
  expect(selectCandidates(user, 2, []).places).toEqual([]);
  expect(() => selectCandidates(user, 0, [viewpoint])).toThrow();
  expect(() => selectCandidates(user, 1.5, [viewpoint])).toThrow();
});