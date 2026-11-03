const { haversineKm } = require('../utils/geo');

// Public OSRM demo server: fine for development only. Self-hosted OSRM (Docker) is planned for the demo.
const DEFAULT_OSRM_URL = 'https://router.project-osrm.org';
const FALLBACK_SPEED_KMH = 30; // [Suggested] average city speed used only when OSRM is unavailable
const ROAD_FACTOR = 1.3; // my assumption: roads are longer than straight lines; set 1 to disable
const MAX_POINTS = 100; // assumption about the server's table-size limit; check your server's docs
const TIMEOUT_MS = 8000;

function assertPoints(points) {
  points.forEach((p, i) => {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) {
      throw new Error(`Invalid point at index ${i}: expected { lat, lon } numbers`);
    }
  });
}

// Estimated matrices from straight-line distance (no network).
function haversineMatrix(points, { speedKmh = FALLBACK_SPEED_KMH, roadFactor = ROAD_FACTOR } = {}) {
  assertPoints(points);
  const distancesKm = [];
  const durationsMin = [];
  for (let i = 0; i < points.length; i++) {
    distancesKm.push([]);
    durationsMin.push([]);
    for (let j = 0; j < points.length; j++) {
      const km = i === j
        ? 0
        : haversineKm(points[i].lat, points[i].lon, points[j].lat, points[j].lon) * roadFactor;
      distancesKm[i].push(km);
      durationsMin[i].push((km / speedKmh) * 60);
    }
  }
  return { durationsMin, distancesKm };
}

function fallback(points, opts, reason) {
  return {
    ...haversineMatrix(points, opts),
    source: 'haversine',
    warnings: [`Travel times are estimated from straight-line distance (${reason}).`],
  };
}

// A usable matrix is n x n and every entry is a finite number (OSRM returns null when unreachable).
function isValidMatrix(m, n) {
  return (
    Array.isArray(m) &&
    m.length === n &&
    m.every((row) => Array.isArray(row) && row.length === n && row.every(Number.isFinite))
  );
}

// points: [{ lat, lon }]. OSRM wants lon,lat in the URL, handled here.
// Returns { durationsMin, distancesKm, source: 'osrm' | 'haversine' | 'none', warnings: [] }.
// Matrices can be asymmetric (one-way roads), so sequencing code must not assume symmetry.
async function getDurationMatrix(points, options = {}) {
  const {
    baseUrl = process.env.OSRM_URL || DEFAULT_OSRM_URL,
    fetchImpl = globalThis.fetch,
    timeoutMs = TIMEOUT_MS,
    maxPoints = MAX_POINTS,
    speedKmh,
    roadFactor,
  } = options;
  const fbOpts = { speedKmh, roadFactor };

  assertPoints(points);
  const n = points.length;
  if (n === 0) return { durationsMin: [], distancesKm: [], source: 'none', warnings: [] };
  if (n === 1) return { durationsMin: [[0]], distancesKm: [[0]], source: 'none', warnings: [] };
  if (n > maxPoints) return fallback(points, fbOpts, `more than ${maxPoints} points`);

  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const url = `${baseUrl.replace(/\/+$/, '')}/table/v1/driving/${coords}?annotations=duration,distance`;

  let res;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    return fallback(points, fbOpts, `OSRM unreachable: ${err.message}`);
  }
  if (!res.ok) return fallback(points, fbOpts, `OSRM returned HTTP ${res.status}`);

  let body;
  try {
    body = await res.json();
  } catch {
    return fallback(points, fbOpts, 'OSRM response was not valid JSON');
  }
  if (!body || body.code !== 'Ok') {
    return fallback(points, fbOpts, `OSRM error code: ${body && body.code}`);
  }
  if (!isValidMatrix(body.durations, n) || !isValidMatrix(body.distances, n)) {
    return fallback(points, fbOpts, 'OSRM response was incomplete or had unreachable pairs');
  }

  return {
    durationsMin: body.durations.map((row) => row.map((s) => s / 60)), // OSRM: seconds
    distancesKm: body.distances.map((row) => row.map((m) => m / 1000)), // OSRM: metres
    source: 'osrm',
    warnings: [],
  };
}

module.exports = { getDurationMatrix, haversineMatrix };