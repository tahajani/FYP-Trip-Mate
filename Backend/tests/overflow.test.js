const {
  centroidOf, nearestToCentroid, priorityScores, resolveOverflow,
} = require('../services/overflow');
const { toPoint } = require('../services/kmeans');

const place = (osmId, lat, lon, score, visit) => ({
  poi: { osmId, avgVisitDuration: visit, location: { coordinates: [lon, lat] } },
  score,
});
const flat = (n, minutes) =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : minutes)));

// Three places in one spot and one outlier 0.1 degrees north: the outlier has the lowest priority.
const cluster4 = () => [
  place(1, 33.7, 73.0, 0.8, 60),
  place(2, 33.7, 73.0, 0.8, 60),
  place(3, 33.7, 73.0, 0.8, 60),
  place(4, 33.8, 73.0, 0.8, 60),
];

test('a day that already fits is left alone', () => {
  const places = [place(1, 33.7, 73.0, 0.8, 30), place(2, 33.7, 73.0, 0.8, 30), place(3, 33.7, 73.0, 0.8, 30)];
  const r = resolveOverflow({ places, clusters: [[0, 1, 2]], durationsMin: flat(3, 10), capacityMinutes: 270 });
  expect(r.dropped).toEqual([]);
  expect(r.moved).toEqual([]);
  expect(r.days[0].order.length).toBe(3);
  expect(r.days[0].visitMinutes).toBe(90);
  expect(r.days[0].travelMinutes).toBeCloseTo(20, 6);
  expect(r.days[0].fits).toBe(true);
});

test('priority score: the outlier gets proximity 0', () => {
  const places = cluster4();
  const points = places.map((p) => toPoint(p.poi));
  const pr = priorityScores([0, 1, 2, 3], places, points);
  expect(pr[3].proximity).toBeCloseTo(0, 6);
  expect(pr[0].proximity).toBeCloseTo(2 / 3, 5);
  expect(pr[3].priority).toBeCloseTo(0.7 * 0.8, 6);
  expect(pr[0].priority).toBeCloseTo(0.7 * 0.8 + 0.3 * (2 / 3), 5);
});

test('overflow drops the lowest priority place', () => {
  // 4 x 60 visit + 3 x 20 travel = 300 > 270; without the outlier: 180 + 40 = 220
  const r = resolveOverflow({ places: cluster4(), clusters: [[0, 1, 2, 3]], durationsMin: flat(4, 20), capacityMinutes: 270 });
  expect(r.dropped.length).toBe(1);
  expect(r.dropped[0].index).toBe(3);
  expect(r.dropped[0].fromDay).toBe(1);
  expect([...r.days[0].order].sort()).toEqual([0, 1, 2]);
  expect(r.days[0].totalMinutes).toBeCloseTo(220, 6);
  expect(r.days[0].fits).toBe(true);
});

test('a dropped place is moved to another day when that day has room', () => {
  const places = [...cluster4(), place(5, 33.78, 73.0, 0.8, 60)];
  const r = resolveOverflow({ places, clusters: [[0, 1, 2, 3], [4]], durationsMin: flat(5, 20), capacityMinutes: 270 });
  expect(r.dropped).toEqual([]);
  expect(r.moved).toEqual([{ index: 3, fromDay: 1, toDay: 2 }]);
  expect(r.days[0].order.length).toBe(3);
  expect([...r.days[1].order].sort()).toEqual([3, 4]);
  expect(r.days.every((d) => d.fits)).toBe(true);
});

test('with allowMove false the place is dropped instead', () => {
  const places = [...cluster4(), place(5, 33.78, 73.0, 0.8, 60)];
  const r = resolveOverflow({
    places, clusters: [[0, 1, 2, 3], [4]], durationsMin: flat(5, 20), capacityMinutes: 270, options: { allowMove: false },
  });
  expect(r.moved).toEqual([]);
  expect(r.dropped.map((d) => d.index)).toEqual([3]);
  expect(r.days[1].order).toEqual([4]);
});

test('a move is refused when the other day would overflow', () => {
  const places = [...cluster4(), place(5, 33.78, 73.0, 0.8, 120), place(6, 33.78, 73.0, 0.8, 120)];
  // day 2 alone: 240 + 20 = 260 (fits); adding the 60-minute place gives 340 (does not fit)
  const r = resolveOverflow({ places, clusters: [[0, 1, 2, 3], [4, 5]], durationsMin: flat(6, 20), capacityMinutes: 270 });
  expect(r.moved).toEqual([]);
  expect(r.dropped.map((d) => d.index)).toEqual([3]);
  expect(r.days.every((d) => d.fits)).toBe(true);
});

test('a single place longer than the day is dropped and the day becomes empty', () => {
  const r = resolveOverflow({
    places: [place(1, 33.7, 73.0, 0.8, 150)], clusters: [[0]], durationsMin: flat(1, 0), capacityMinutes: 100,
  });
  expect(r.dropped.length).toBe(1);
  expect(r.days[0].order).toEqual([]);
  expect(r.days[0].totalMinutes).toBe(0);
});

test('equal priorities: the lower-ranked place (higher index) is dropped first', () => {
  const places = [place(1, 33.7, 73.0, 0.8, 150), place(2, 33.7, 73.0, 0.8, 150)];
  const r = resolveOverflow({ places, clusters: [[0, 1]], durationsMin: flat(2, 10), capacityMinutes: 200 });
  expect(r.dropped.map((d) => d.index)).toEqual([1]);
  expect(r.days[0].order).toEqual([0]);
});

test('centroid helpers', () => {
  const pts = [{ lat: 33.70, lon: 73.0 }, { lat: 33.71, lon: 73.0 }, { lat: 33.72, lon: 73.0 }];
  expect(centroidOf(pts).lat).toBeCloseTo(33.71, 6);
  expect(nearestToCentroid(pts)).toBe(1);
});