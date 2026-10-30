const { kMeans, toPoint } = require('../services/kmeans');

const isl = [{ lat: 33.70, lon: 73.05 }, { lat: 33.71, lon: 73.06 }, { lat: 33.69, lon: 73.04 }];
const lhr = [{ lat: 31.55, lon: 74.34 }, { lat: 31.56, lon: 74.35 }, { lat: 31.54, lon: 74.33 }];

test('days = 1 puts everything in one cluster', () => {
  expect(kMeans([...isl, ...lhr], 1)).toEqual([[0, 1, 2, 3, 4, 5]]);
});

test('fewer places than days: k clusters, extra days empty', () => {
  const r = kMeans(isl.slice(0, 2), 4);
  expect(r.length).toBe(4);
  expect(r.filter((c) => c.length > 0).length).toBe(2);
});

test('two far-apart groups split correctly', () => {
  const sets = kMeans([...isl, ...lhr], 2).map((c) => [...c].sort().join(','));
  expect(sets.sort()).toEqual(['0,1,2', '3,4,5']);
});

test('identical points: no empty cluster, every index used once', () => {
  const same = Array.from({ length: 5 }, () => ({ lat: 33.7, lon: 73.0 }));
  const r = kMeans(same, 3);
  expect(r.every((c) => c.length >= 1)).toBe(true);
  expect(r.flat().sort()).toEqual([0, 1, 2, 3, 4]);
});

test('same input gives same output (deterministic)', () => {
  const pts = [...isl, ...lhr];
  expect(kMeans(pts, 2)).toEqual(kMeans(pts, 2));
});

test('toPoint converts [lon, lat] to {lat, lon}', () => {
  expect(toPoint({ location: { coordinates: [73.05, 33.7] } })).toEqual({ lat: 33.7, lon: 73.05 });
});