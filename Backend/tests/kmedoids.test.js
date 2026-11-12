const { kMedoids } = require('../services/kmedoids');
const { haversineMatrix } = require('../services/osrm');

const matrixOf = (pts) => haversineMatrix(pts, { speedKmh: 60, roadFactor: 1 }).durationsMin;

test('two far-apart groups become two clusters (like K-Means would do)', () => {
  const pts = [
    { lat: 33.70, lon: 73.05 }, { lat: 33.71, lon: 73.06 }, { lat: 33.72, lon: 73.07 },
    { lat: 31.55, lon: 74.34 }, { lat: 31.56, lon: 74.35 }, { lat: 31.57, lon: 74.36 },
  ];
  const c = kMedoids(matrixOf(pts), 2);
  const sets = c.map((x) => x.slice().sort().join(','));
  expect(sets.sort()).toEqual(['0,1,2', '3,4,5']);
});

test('every place is in exactly one cluster and no cluster is empty', () => {
  const pts = Array.from({ length: 12 }, (_, i) => ({ lat: 33 + (i % 4) * 0.05, lon: 73 + Math.floor(i / 4) * 0.05 }));
  const c = kMedoids(matrixOf(pts), 3);
  expect(c.length).toBe(3);
  expect(c.every((x) => x.length > 0)).toBe(true);
  expect(c.flat().sort((a, b) => a - b)).toEqual(pts.map((_, i) => i));
});

test('road time decides, not the straight line', () => {
  // A and B are next to each other on the map but 60 minutes apart by road (a river, no bridge).
  // C is far on the map but only 5 minutes from A by road. Straight-line K-Means would pair A with B.
  const D = [
    [0, 60, 5, 70],
    [60, 0, 65, 5],
    [5, 65, 0, 75],
    [70, 5, 75, 0],
  ];
  const sets = kMedoids(D, 2).map((x) => x.join(','));
  expect(sets.sort()).toEqual(['0,2', '1,3']);
});

test('works with an asymmetric matrix (one-way roads) and is deterministic', () => {
  const D = [
    [0, 5, 40, 41],
    [9, 0, 38, 44],
    [39, 42, 0, 6],
    [40, 41, 8, 0],
  ];
  const a = kMedoids(D, 2);
  const b = kMedoids(D, 2);
  expect(a).toEqual(b);
  expect(a.map((x) => x.join(',')).sort()).toEqual(['0,1', '2,3']);
});

test('places at the same spot never leave a cluster empty', () => {
  const D = [
    [0, 0, 20, 20],
    [0, 0, 20, 20],
    [20, 20, 0, 0],
    [20, 20, 0, 0],
  ];
  const c = kMedoids(D, 2);
  expect(c.every((x) => x.length === 2)).toBe(true);
});

test('edge cases: k = 1, fewer places than days, no places, bad input', () => {
  const D = [[0, 3], [3, 0]];
  expect(kMedoids(D, 1)).toEqual([[0, 1]]);
  expect(kMedoids(D, 3)).toEqual([[0], [1], []]);
  expect(kMedoids([], 2)).toEqual([[], []]);
  expect(() => kMedoids(D, 0)).toThrow(/k must/);
  expect(() => kMedoids([[0, 1]], 1)).toThrow(/n x n/);
  expect(() => kMedoids([[0, NaN], [1, 0]], 2)).toThrow(/finite/);
});
