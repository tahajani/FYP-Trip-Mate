// tests/osrmRoute.test.js  (node:test, no extra dependency)
//   node --test tests/osrmRoute.test.js
// All network calls are mocked through options.fetchImpl, so the test never touches the internet.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { getDayRoute, straightRoute, clearRouteCache, MAX_ROUTE_POINTS } = require('../services/osrmRoute');
const { createRouter } = require('../routes/routeRoutes');

const P = [
  { lat: 33.6844, lon: 73.0479 },
  { lat: 33.7294, lon: 73.0551 },
  { lat: 33.71, lon: 73.09 },
];
const FAST = { attempts: 2, retryDelayMs: 1 };

// A valid OSRM /route answer for 3 points (2 legs). GeoJSON coordinates are [lon, lat].
const okBody = () => ({
  code: 'Ok',
  routes: [
    {
      distance: 12345,
      duration: 1500,
      geometry: { coordinates: [[73.0479, 33.6844], [73.05, 33.7], [73.0551, 33.7294], [73.07, 33.72], [73.09, 33.71]] },
      legs: [
        { distance: 6000, duration: 600 },
        { distance: 6345, duration: 900 },
      ],
    },
  ],
});
const jsonRes = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const counter = (impl) => {
  const f = async (...a) => {
    f.calls.push(a);
    return impl(f.calls.length, ...a);
  };
  f.calls = [];
  return f;
};

test.beforeEach(() => clearRouteCache());

test('success: swaps GeoJSON lon,lat to Leaflet lat,lon and returns per-leg km/min', async () => {
  const fetchImpl = counter(() => jsonRes(okBody()));
  const r = await getDayRoute(P, { fetchImpl, ...FAST });
  assert.equal(r.source, 'osrm');
  assert.deepEqual(r.coordinates[0], [33.6844, 73.0479]);
  assert.equal(r.coordinates.length, 5);
  assert.deepEqual(r.legs, [{ km: 6, minutes: 10 }, { km: 6.35, minutes: 15 }]);
  assert.equal(r.totalKm, 12.35);
  assert.equal(r.totalMinutes, 25);
  assert.deepEqual(r.warnings, []);
});

test('request URL: lon,lat order, full geojson geometry, trailing slash on base URL is fine', async () => {
  const fetchImpl = counter(() => jsonRes(okBody()));
  await getDayRoute(P, { fetchImpl, baseUrl: 'http://osrm.local:5001///', ...FAST });
  const url = fetchImpl.calls[0][0];
  assert.ok(url.startsWith('http://osrm.local:5001/route/v1/driving/73.0479,33.6844;73.0551,33.7294;73.09,33.71?'));
  assert.match(url, /overview=full/);
  assert.match(url, /geometries=geojson/);
});

test('network error: retried once, then straight-line fallback with the real reason', async () => {
  const fetchImpl = counter(() => {
    const e = new TypeError('fetch failed');
    e.cause = { code: 'ECONNRESET' };
    throw e;
  });
  const r = await getDayRoute(P, { fetchImpl, ...FAST });
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(r.source, 'haversine');
  assert.deepEqual(r.coordinates, P.map((p) => [p.lat, p.lon]));
  assert.equal(r.legs.length, 2);
  assert.ok(r.legs.every((l) => l.km > 0 && l.minutes > 0));
  assert.match(r.warnings[0], /ECONNRESET/);
});

test('HTTP 500 is retried, a later success wins', async () => {
  const fetchImpl = counter((n) => (n === 1 ? jsonRes({}, 500) : jsonRes(okBody())));
  const r = await getDayRoute(P, { fetchImpl, ...FAST });
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(r.source, 'osrm');
});

test('HTTP 500 on every attempt falls back', async () => {
  const fetchImpl = counter(() => jsonRes({}, 500));
  const r = await getDayRoute(P, { fetchImpl, ...FAST });
  assert.equal(r.source, 'haversine');
  assert.match(r.warnings[0], /HTTP 500/);
});

test('HTTP 400 is not retried', async () => {
  const fetchImpl = counter(() => jsonRes({}, 400));
  const r = await getDayRoute(P, { fetchImpl, ...FAST });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(r.source, 'haversine');
});

test('OSRM code != Ok (NoRoute) falls back', async () => {
  const fetchImpl = counter(() => jsonRes({ code: 'NoRoute' }));
  const r = await getDayRoute(P, { fetchImpl, ...FAST });
  assert.equal(r.source, 'haversine');
  assert.match(r.warnings[0], /NoRoute/);
});

test('invalid JSON and incomplete responses fall back', async () => {
  const badJson = counter(() => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } }));
  assert.equal((await getDayRoute(P, { fetchImpl: badJson, ...FAST })).source, 'haversine');

  const body = okBody();
  body.routes[0].legs.pop(); // 1 leg for 3 points
  const incomplete = counter(() => jsonRes(body));
  const r = await getDayRoute(P, { fetchImpl: incomplete, ...FAST });
  assert.equal(r.source, 'haversine');
  assert.match(r.warnings[0], /incomplete/);
});

test('fewer than 2 stops: source none, no network call', async () => {
  const fetchImpl = counter(() => jsonRes(okBody()));
  const one = await getDayRoute([P[0]], { fetchImpl });
  assert.equal(one.source, 'none');
  assert.deepEqual(one.coordinates, [[P[0].lat, P[0].lon]]);
  assert.deepEqual((await getDayRoute([], { fetchImpl })).coordinates, []);
  assert.equal(fetchImpl.calls.length, 0);
});

test('too many stops: straight lines without calling OSRM', async () => {
  const many = Array.from({ length: MAX_ROUTE_POINTS + 1 }, (_, i) => ({ lat: 33 + i * 0.001, lon: 73 }));
  const fetchImpl = counter(() => jsonRes(okBody()));
  const r = await getDayRoute(many, { fetchImpl });
  assert.equal(r.source, 'haversine');
  assert.equal(fetchImpl.calls.length, 0);
});

test('invalid point throws', async () => {
  await assert.rejects(() => getDayRoute([{ lat: 'x', lon: 1 }, P[0]]), /Invalid point at index 0/);
});

test('cache: second identical request does not hit OSRM; fallbacks are never cached', async () => {
  const fetchImpl = counter(() => jsonRes(okBody()));
  await getDayRoute(P, { fetchImpl, ...FAST });
  const second = await getDayRoute(P, { fetchImpl, ...FAST });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(second.cached, true);

  clearRouteCache();
  const down = counter(() => jsonRes({}, 500));
  await getDayRoute(P, { fetchImpl: down, ...FAST });
  const up = counter(() => jsonRes(okBody()));
  const r = await getDayRoute(P, { fetchImpl: up, ...FAST });
  assert.equal(r.source, 'osrm'); // OSRM is asked again after an earlier failure
});

test('cache entries expire after the TTL', async () => {
  const fetchImpl = counter(() => jsonRes(okBody()));
  let t = 1000;
  await getDayRoute(P, { fetchImpl, now: () => t, ...FAST });
  t += 61 * 60 * 1000;
  await getDayRoute(P, { fetchImpl, now: () => t, ...FAST });
  assert.equal(fetchImpl.calls.length, 2);
});

test('straightRoute honours speed and roadFactor', () => {
  const a = straightRoute(P, 'test', { roadFactor: 1 });
  const b = straightRoute(P, 'test', { roadFactor: 2 });
  assert.ok(b.totalKm > a.totalKm * 1.9);
});

// ---- HTTP layer: POST /api/routes/day ----
async function withServer(getDayRouteFake, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/routes', createRouter({ getDayRoute: getDayRouteFake, authMiddleware: (req, res, next) => next() }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/routes/day`;
  try {
    await fn((body) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('POST /day returns the service result and passes clean points', async () => {
  let seen;
  await withServer(async (pts) => ((seen = pts), { source: 'osrm', coordinates: [], legs: [], totalKm: 0, totalMinutes: 0, warnings: [] }), async (post) => {
    const res = await post({ places: [{ lat: 33.6, lon: 73.0, extra: 'ignored' }, { lat: 33.7, lon: 73.1 }] });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).source, 'osrm');
    assert.deepEqual(seen, [{ lat: 33.6, lon: 73.0 }, { lat: 33.7, lon: 73.1 }]);
  });
});

test('POST /day validates input (400) and reports service crashes (500)', async () => {
  await withServer(async () => ({}), async (post) => {
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ places: [{ lat: '33', lon: 73 }] })).status, 400);
    assert.equal((await post({ places: [{ lat: 95, lon: 73 }] })).status, 400);
    assert.equal((await post({ places: Array.from({ length: MAX_ROUTE_POINTS + 1 }, () => ({ lat: 1, lon: 1 })) })).status, 400);
  });
  await withServer(async () => { throw new Error('boom'); }, async (post) => {
    const res = await post({ places: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] });
    assert.equal(res.status, 500);
  });
});