// services/osrmRoute.js
// Road geometry for ONE day (ordered stops) from OSRM's Route API, with a straight-line fallback.
// getDayRoute never throws for network/OSRM problems: it returns source 'haversine' and says why in warnings.
const { haversineKm } = require('../utils/geo');

// Public OSRM demo server: fine for development only. Self-hosted OSRM is planned (Week 15).
const DEFAULT_OSRM_URL = 'https://router.project-osrm.org';
const FALLBACK_SPEED_KMH = 30; // same estimate as services/osrm.js
const ROAD_FACTOR = 1.3; // same estimate as services/osrm.js
const MAX_ROUTE_POINTS = 30; // a day has far fewer stops; the demo server's real limit is not verified
const TIMEOUT_MS = 10000;
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 600;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_MAX = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (x, dp) => Math.round(x * 10 ** dp) / 10 ** dp;

const cache = new Map(); // key -> { at, value }; only real OSRM answers are cached

function clearRouteCache() {
  cache.clear();
}

function assertPoints(points) {
  if (!Array.isArray(points)) throw new Error('points must be an array of { lat, lon }');
  points.forEach((p, i) => {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) {
      throw new Error(`Invalid point at index ${i}: expected { lat, lon } numbers`);
    }
  });
}

const toLatLon = (points) => points.map((p) => [p.lat, p.lon]);

// Straight line between the stops. km/min per leg are ESTIMATES (straight distance x roadFactor).
function straightRoute(points, reason, { speedKmh = FALLBACK_SPEED_KMH, roadFactor = ROAD_FACTOR } = {}) {
  const legs = [];
  for (let i = 1; i < points.length; i++) {
    const km = haversineKm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon) * roadFactor;
    legs.push({ km: round(km, 2), minutes: round((km / speedKmh) * 60, 1) });
  }
  return {
    source: 'haversine',
    coordinates: toLatLon(points),
    legs,
    totalKm: round(legs.reduce((a, l) => a + l.km, 0), 2),
    totalMinutes: round(legs.reduce((a, l) => a + l.minutes, 0), 1),
    warnings: [`Road route not available, showing straight lines with estimated distances (${reason}).`],
  };
}

function validOsrmRoute(route, n) {
  return (
    route &&
    route.geometry &&
    Array.isArray(route.geometry.coordinates) &&
    route.geometry.coordinates.length >= 2 &&
    Array.isArray(route.legs) &&
    route.legs.length === n - 1 &&
    route.legs.every((l) => l && Number.isFinite(l.distance) && Number.isFinite(l.duration))
  );
}

const cacheKey = (baseUrl, points) =>
  `${baseUrl}|${points.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';')}`;

// points: [{ lat, lon }] in visiting order.
// Returns { source: 'osrm' | 'haversine' | 'none', coordinates: [[lat, lon], ...] (Leaflet order),
//           legs: [{ km, minutes }] (legs[i] = stop i -> stop i+1), totalKm, totalMinutes, warnings: [] }
async function getDayRoute(points, options = {}) {
  const {
    baseUrl = process.env.OSRM_URL || DEFAULT_OSRM_URL,
    fetchImpl = globalThis.fetch,
    timeoutMs = TIMEOUT_MS,
    attempts = ATTEMPTS,
    retryDelayMs = RETRY_DELAY_MS,
    maxPoints = MAX_ROUTE_POINTS,
    useCache = true,
    now = Date.now,
    speedKmh,
    roadFactor,
  } = options;
  const fbOpts = { speedKmh, roadFactor };

  assertPoints(points);
  const n = points.length;
  if (n < 2) {
    return { source: 'none', coordinates: toLatLon(points), legs: [], totalKm: 0, totalMinutes: 0, warnings: [] };
  }
  if (n > maxPoints) return straightRoute(points, `more than ${maxPoints} stops`, fbOpts);

  const base = baseUrl.replace(/\/+$/, '');
  const key = cacheKey(base, points);
  if (useCache) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_TTL_MS) return { ...hit.value, cached: true };
    if (hit) cache.delete(key);
  }

  // OSRM wants lon,lat
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;

  let res;
  let lastError = null;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      lastError = null;
      if (res.ok || (res.status < 500 && res.status !== 429)) break; // other 4xx will not improve by retrying
    } catch (err) {
      res = undefined;
      lastError = err;
    }
    if (attempt < attempts) await sleep(retryDelayMs);
  }
  if (!res) {
    // Node's fetch hides the real reason in err.cause (ENOTFOUND, ECONNRESET, UND_ERR_CONNECT_TIMEOUT ...)
    const cause = lastError && lastError.cause ? ` (${lastError.cause.code || lastError.cause.message})` : '';
    const why = lastError ? `${lastError.name}: ${lastError.message}${cause}` : 'no response';
    return straightRoute(points, `OSRM unreachable, ${why}`, fbOpts);
  }
  if (!res.ok) return straightRoute(points, `OSRM returned HTTP ${res.status}`, fbOpts);

  let body;
  try {
    body = await res.json();
  } catch {
    return straightRoute(points, 'OSRM response was not valid JSON', fbOpts);
  }
  if (!body || body.code !== 'Ok') {
    return straightRoute(points, `OSRM error code: ${body && body.code}`, fbOpts);
  }
  const route = body.routes && body.routes[0];
  if (!validOsrmRoute(route, n)) {
    return straightRoute(points, 'OSRM response was incomplete', fbOpts);
  }

  const legs = route.legs.map((l) => ({ km: round(l.distance / 1000, 2), minutes: round(l.duration / 60, 1) }));
  const value = {
    source: 'osrm',
    // GeoJSON is [lon, lat]; Leaflet wants [lat, lon]
    coordinates: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    legs,
    totalKm: round(route.distance / 1000, 2),
    totalMinutes: round(route.duration / 60, 1),
    warnings: [],
  };

  if (useCache) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); // drop the oldest entry
    cache.set(key, { at: now(), value });
  }
  return value;
}

module.exports = { getDayRoute, straightRoute, clearRouteCache, MAX_ROUTE_POINTS };