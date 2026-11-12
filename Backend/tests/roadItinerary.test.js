const { generateSoloItinerary } = require('../services/soloItinerary');
const { resolveOverflow, medoidOf, priorityScores } = require('../services/overflow');
const { getDurationMatrix } = require('../services/osrm');
const { CATEGORIES } = require('../config/categories');

const vec = (map) => CATEGORIES.map((c) => map[c] || 0);
const poi = (osmId, name, v, lat, lon, extra = {}) => ({
  _id: `id${osmId}`, osmId, name, kind: 'x', interestVector: vec(v), intensity: 0.5, avgVisitDuration: 60,
  needsReview: false, location: { coordinates: [lon, lat] }, ...extra,
});
const matrixFrom = (D, source = 'osrm', warnings = []) => async (pts) => {
  expect(pts.length).toBe(D.length);
  return { durationsMin: D, distancesKm: D.map((r) => r.map(() => 0)), source, warnings };
};

describe('road-based days', () => {
  // Map: A, B, C, D are in a line 1 km apart. By road A-B and C-D are close, but B-C are far (a river).
  test('places are grouped by road time, even when the map says otherwise', async () => {
    const pois = [
      poi(1, 'A', { museums_art: 1 }, 33.700, 73.00),
      poi(2, 'B', { museums_art: 1 }, 33.701, 73.00),
      poi(3, 'C', { museums_art: 1 }, 33.702, 73.00),
      poi(4, 'D', { museums_art: 1 }, 33.703, 73.00),
    ];
    // pool order is by osmId (equal scores), so index 0..3 = A..D
    const D = [
      [0, 10, 60, 70],
      [10, 0, 55, 65],
      [60, 55, 0, 10],
      [70, 65, 10, 0],
    ];
    const user = { interests: ['museums_art'], pace: 'fast' };
    const r = await generateSoloItinerary({ user, days: 2, pois }, { getMatrix: matrixFrom(D) });
    const dayNames = r.days.map((d) => d.places.map((p) => p.name).sort().join(''));
    expect(dayNames.sort()).toEqual(['AB', 'CD']);
    expect(r.travelTimeSource).toBe('osrm');
  });

  test('clustering: "kmeans" still works as the older option', async () => {
    const pois = [poi(1, 'A', { museums_art: 1 }, 33.7, 73.0), poi(2, 'B', { museums_art: 1 }, 31.5, 74.3)];
    const D = [[0, 5], [5, 0]];
    const r = await generateSoloItinerary(
      { user: { interests: ['museums_art'], pace: 'fast' }, days: 2, pois },
      { getMatrix: matrixFrom(D), options: { clustering: 'kmeans' } }
    );
    expect(r.days.map((d) => d.places.length)).toEqual([1, 1]);
  });

  test('the OSRM matrix is asked for BEFORE the days are decided (one call, for the whole pool)', async () => {
    const pois = [poi(1, 'A', { museums_art: 1 }, 33.7, 73.0), poi(2, 'B', { museums_art: 1 }, 33.71, 73.0)];
    let calls = 0;
    const getMatrix = async (pts) => {
      calls += 1;
      return { durationsMin: pts.map(() => pts.map(() => 5)), source: 'osrm', warnings: [] };
    };
    await generateSoloItinerary({ user: { interests: ['museums_art'], pace: 'fast' }, days: 1, pois }, { getMatrix });
    expect(calls).toBe(1);
  });
});

describe('interests in the output', () => {
  const pois = [
    poi(1, 'Museum', { museums_art: 1, history_heritage: 0.3 }, 33.70, 73.00),
    poi(2, 'Market', { shopping_markets: 1 }, 33.71, 73.00),
  ];
  const D = [[0, 5], [5, 0]];

  test('every place says which chosen interests it matches, and an interest with no place is reported', async () => {
    const user = { interests: ['museums_art', 'shopping_markets', 'religious'], pace: 'fast' };
    const r = await generateSoloItinerary({ user, days: 1, pois }, { getMatrix: matrixFrom(D) });
    const byName = Object.fromEntries(r.days[0].places.map((p) => [p.name, p.matched]));
    expect(byName.Museum).toEqual(['museums_art']);
    expect(byName.Market).toEqual(['shopping_markets']);
    expect(r.coverage).toEqual({ museums_art: 1, shopping_markets: 1, religious: 0 });
    expect(r.warnings.some((w) => w.includes('"religious"'))).toBe(true);
  });

  test('a name with two parts joined by ; is shown as one clean name', async () => {
    const p = [poi(1, 'لوک ورثہ;Lok Virsa Museum', { museums_art: 1 }, 33.7, 73.0)];
    const r = await generateSoloItinerary(
      { user: { interests: ['museums_art'], pace: 'fast' }, days: 1, pois: p },
      { getMatrix: matrixFrom([[0]]) }
    );
    expect(r.days[0].places[0].name).toBe('Lok Virsa Museum');
  });

  test('the same mall seeded twice appears once', async () => {
    const dup = [
      poi(1, 'The Centaurus Mall', { shopping_markets: 1 }, 33.7078, 73.0501),
      poi(2, 'The Centaurus Mall', { shopping_markets: 1 }, 33.7079, 73.0501),
    ];
    const r = await generateSoloItinerary(
      { user: { interests: ['shopping_markets'], pace: 'fast' }, days: 1, pois: dup },
      { getMatrix: matrixFrom([[0]]) }
    );
    expect(r.days[0].places.length).toBe(1);
  });
});

describe('dates', () => {
  test('each day gets its calendar date and the trip gets startDate / endDate', async () => {
    const pois = [poi(1, 'A', { museums_art: 1 }, 33.7, 73.0)];
    const r = await generateSoloItinerary(
      { user: { interests: ['museums_art'], pace: 'fast' }, days: 3, pois, startDate: '2026-11-29' },
      { getMatrix: matrixFrom([[0]]) }
    );
    expect(r.startDate).toBe('2026-11-29');
    expect(r.endDate).toBe('2026-12-01');
    expect(r.dayCount).toBe(3);
    expect(r.days.map((d) => d.date)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
  });

  test('without a start date there are no dates, and a bad date is rejected', async () => {
    const pois = [poi(1, 'A', { museums_art: 1 }, 33.7, 73.0)];
    const user = { interests: ['museums_art'], pace: 'fast' };
    const r = await generateSoloItinerary({ user, days: 1, pois }, { getMatrix: matrixFrom([[0]]) });
    expect(r.startDate).toBeUndefined();
    expect(r.days[0].date).toBeUndefined();
    await expect(generateSoloItinerary({ user, days: 1, pois, startDate: '2026-02-30' })).rejects.toThrow(/startDate/);
  });

  test('empty days also carry dates', async () => {
    const r = await generateSoloItinerary(
      { user: { interests: ['museums_art'], pace: 'fast' }, days: 2, pois: [], startDate: '2026-11-12' },
      { getMatrix: matrixFrom([]) }
    );
    expect(r.days.map((d) => d.date)).toEqual(['2026-11-12', '2026-11-13']);
  });
});

describe('overflow in road mode', () => {
  const mk = (osmId, score) => ({ poi: { osmId, avgVisitDuration: 60, location: { coordinates: [73, 33] } }, score });

  test('medoidOf picks the member closest to the others by road time', () => {
    const D = [[0, 10, 50], [10, 0, 10], [50, 10, 0]];
    expect(medoidOf([0, 1, 2], D)).toBe(1);
  });

  test('priorityScores in road mode measures proximity as road time to the medoid', () => {
    const D = [[0, 10, 50], [10, 0, 10], [50, 10, 0]];
    const places = [mk(1, 0.5), mk(2, 0.5), mk(3, 0.5)];
    const pts = places.map((p) => ({ lat: 33, lon: 73 })); // identical points: straight-line proximity would be 1 for all
    const road = priorityScores([0, 1, 2], places, pts, undefined, D);
    expect(road.map((s) => s.proximity)).toEqual([1 - 10 / 10, 1, 1 - 10 / 10]); // medoid is 1; A and C are 10 min away
    const straight = priorityScores([0, 1, 2], places, pts);
    expect(straight.every((s) => s.proximity === 1)).toBe(true);
  });

  test('the road-far place is the one dropped when a day is too long', () => {
    // 3 places x 60 visit = 180; the far one adds 100 minutes of travel -> 280 > 270 (relaxed)
    const places = [mk(1, 0.5), mk(2, 0.5), mk(3, 0.5)];
    const D = [[0, 5, 100], [5, 0, 100], [100, 100, 0]];
    const r = resolveOverflow({
      places, clusters: [[0, 1, 2]], durationsMin: D, capacityMinutes: 270, options: { proximity: 'road' },
    });
    expect(r.dropped.length).toBe(1);
    expect(r.dropped[0].index).toBe(2);
    expect(r.days[0].order.length).toBe(2);
  });
});

describe('OSRM retry', () => {
  const pts = [{ lat: 33.7, lon: 73.0 }, { lat: 33.71, lon: 73.01 }];
  const okBody = { code: 'Ok', durations: [[0, 120], [130, 0]], distances: [[0, 1000], [1100, 0]] };
  const okRes = { ok: true, status: 200, json: async () => okBody };

  test('a timeout on the first try is retried and the road matrix is used', async () => {
    const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(okRes);
    const r = await getDurationMatrix(pts, { fetchImpl, retryDelayMs: 1 });
    expect(r.source).toBe('osrm');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r.durationsMin[0][1]).toBeCloseTo(2, 6);
  });

  test('HTTP 503 is retried, then the estimate is used with a warning', async () => {
    const bad = { ok: false, status: 503, json: async () => ({}) };
    const fetchImpl = jest.fn().mockResolvedValue(bad);
    const r = await getDurationMatrix(pts, { fetchImpl, retryDelayMs: 1 });
    expect(r.source).toBe('haversine');
    expect(r.warnings[0]).toMatch(/HTTP 503/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('HTTP 400 is not retried', async () => {
    const bad = { ok: false, status: 400, json: async () => ({}) };
    const fetchImpl = jest.fn().mockResolvedValue(bad);
    const r = await getDurationMatrix(pts, { fetchImpl, retryDelayMs: 1 });
    expect(r.source).toBe('haversine');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('attempts: 1 turns the retry off', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('down'));
    const r = await getDurationMatrix(pts, { fetchImpl, attempts: 1 });
    expect(r.source).toBe('haversine');
    expect(r.warnings[0]).toMatch(/OSRM unreachable: down/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
