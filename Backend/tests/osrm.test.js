const { getDurationMatrix, haversineMatrix } = require('../services/osrm');
const { haversineKm } = require('../utils/geo');

const A = { lat: 33.7, lon: 73.05 };
const B = { lat: 33.71, lon: 73.06 };
const okBody = { code: 'Ok', durations: [[0, 600], [660, 0]], distances: [[0, 5000], [5500, 0]] };
const respond = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test('converts an OSRM response to minutes and km', async () => {
  const r = await getDurationMatrix([A, B], { fetchImpl: respond(okBody) });
  expect(r.source).toBe('osrm');
  expect(r.warnings).toEqual([]);
  expect(r.durationsMin).toEqual([[0, 10], [11, 0]]);
  expect(r.distancesKm).toEqual([[0, 5], [5.5, 0]]);
});

test('request URL uses lon,lat order and asks for duration and distance', async () => {
  const fetchImpl = jest.fn(respond(okBody));
  await getDurationMatrix([A, B], { fetchImpl, baseUrl: 'http://localhost:5001/' });
  expect(fetchImpl.mock.calls[0][0]).toBe(
    'http://localhost:5001/table/v1/driving/73.05,33.7;73.06,33.71?annotations=duration,distance'
  );
});

test('zero or one point needs no network call', async () => {
  const fetchImpl = jest.fn();
  const one = await getDurationMatrix([A], { fetchImpl });
  const none = await getDurationMatrix([], { fetchImpl });
  expect(one.durationsMin).toEqual([[0]]);
  expect(none.durationsMin).toEqual([]);
  expect(one.source).toBe('none');
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('network error falls back to an estimate with a warning', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const r = await getDurationMatrix([A, B], { fetchImpl });
  expect(r.source).toBe('haversine');
  expect(r.warnings.length).toBe(1);
  expect(r.warnings[0]).toMatch(/estimated/);
  expect(r.durationsMin[0][1]).toBeGreaterThan(0);
});

test('HTTP error falls back', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const r = await getDurationMatrix([A, B], { fetchImpl });
  expect(r.source).toBe('haversine');
  expect(r.warnings[0]).toMatch(/429/);
});

test('OSRM code other than Ok falls back', async () => {
  const r = await getDurationMatrix([A, B], { fetchImpl: respond({ code: 'InvalidQuery' }) });
  expect(r.source).toBe('haversine');
});

test('a null (unreachable) entry makes the whole matrix fall back', async () => {
  const body = { code: 'Ok', durations: [[0, null], [660, 0]], distances: [[0, 5000], [5500, 0]] };
  const r = await getDurationMatrix([A, B], { fetchImpl: respond(body) });
  expect(r.source).toBe('haversine');
  expect(r.warnings.length).toBe(1);
});

test('wrong matrix size falls back', async () => {
  const body = { code: 'Ok', durations: [[0]], distances: [[0]] };
  const r = await getDurationMatrix([A, B], { fetchImpl: respond(body) });
  expect(r.source).toBe('haversine');
});

test('too many points falls back without calling the network', async () => {
  const fetchImpl = jest.fn();
  const r = await getDurationMatrix([A, B], { fetchImpl, maxPoints: 1 });
  expect(r.source).toBe('haversine');
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('haversineMatrix: distance, speed and road factor', () => {
  const km = haversineKm(A.lat, A.lon, B.lat, B.lon);
  const plain = haversineMatrix([A, B], { speedKmh: 30, roadFactor: 1 });
  expect(plain.distancesKm[0][1]).toBeCloseTo(km, 6);
  expect(plain.durationsMin[0][1]).toBeCloseTo((km / 30) * 60, 6);
  expect(plain.durationsMin[0][0]).toBe(0);
  expect(plain.durationsMin[0][1]).toBeCloseTo(plain.durationsMin[1][0], 6);

  const withRoads = haversineMatrix([A, B], { speedKmh: 30, roadFactor: 1.3 });
  expect(withRoads.distancesKm[0][1]).toBeCloseTo(km * 1.3, 6);
});

test('an invalid point is a programming error and throws', async () => {
  await expect(getDurationMatrix([A, { lat: NaN, lon: 1 }])).rejects.toThrow(/Invalid point/);
});