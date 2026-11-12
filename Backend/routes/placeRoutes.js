// routes/placeRoutes.js
//   GET /api/places/regions                      -> seeded regions for the "Plan a trip" form
//   GET /api/places/search?q=&lat=&lon=          -> Nominatim first; seeded POIs if Nominatim fails or has no result
//
// Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/):
// max 1 request/second, identify the app with a User-Agent, cache results, no search-as-you-type.
// The frontend therefore searches only when the user presses the button.
//
// ASSUMPTIONS to check: models/Region.js has `slug` (and `name`); models/Poi.js has `name`, `kind`,
// `avgVisitDuration` and a GeoJSON `location` ({ type: 'Point', coordinates: [lon, lat] }) with a 2dsphere index.

const express = require('express');
const auth = require('../middleware/auth');
const Region = require('../models/Region');
const Poi = require('../models/Poi');

const router = express.Router();

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'TripMate-FYP/1.0 (university final year project)';
const MIN_GAP_MS = 1100;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const BOX_DEG = 0.3; // about 33 km around the trip centre
const NEAR_METERS = 40000;

const cache = new Map(); // key -> { at, value }
let chain = Promise.resolve();
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs calls one after another, at least MIN_GAP_MS apart.
function throttled(fn) {
  const run = chain.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

function reasonError(message, reason) {
  const e = new Error(message);
  e.reason = reason; // 'limit' | 'error'
  return e;
}

async function nominatimSearch(q, lat, lon) {
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '8', countrycodes: 'pk' });
  params.set('viewbox', `${lon - BOX_DEG},${lat + BOX_DEG},${lon + BOX_DEG},${lat - BOX_DEG}`); // west,north,east,south
  params.set('bounded', '1');

  const res = await throttled(() =>
    fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(6000),
    })
  );
  if (res.status === 429) throw reasonError('Nominatim rate limit', 'limit');
  if (!res.ok) throw reasonError(`Nominatim HTTP ${res.status}`, 'error');

  const rows = await res.json();
  return rows
    .map((r) => ({
      source: 'nominatim',
      name: r.name || String(r.display_name || '').split(',')[0].trim(),
      displayName: r.display_name,
      kind: r.type || r.category || 'attraction',
      location: { lat: Number(r.lat), lon: Number(r.lon) },
      visitMinutes: 60,
    }))
    .filter((r) => r.name && Number.isFinite(r.location.lat) && Number.isFinite(r.location.lon));
}

async function seededSearch(q, lat, lon) {
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const rows = await Poi.find({
    name: rx,
    location: { $near: { $geometry: { type: 'Point', coordinates: [lon, lat] }, $maxDistance: NEAR_METERS } },
  })
    .limit(8)
    .lean();

  return rows
    .filter((p) => p.location && Array.isArray(p.location.coordinates))
    .map((p) => ({
      source: 'seeded',
      poiId: String(p._id),
      name: p.name,
      kind: p.kind || 'attraction',
      location: { lat: p.location.coordinates[1], lon: p.location.coordinates[0] },
      visitMinutes: p.avgVisitDuration || 60,
    }));
}

router.get('/regions', auth, async (req, res) => {
  try {
    // only regions whose POIs have been seeded can be planned (loadRegionPois refuses the others)
    const regions = await Region.find({ seeded: true }).select('slug name').lean();
    res.json(regions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/search', auth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (q.length < 2 || q.length > 100) {
      return res.status(400).json({ message: 'q 2 se 100 characters ka ho' });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ message: 'lat aur lon chahiye' });
    }

    const key = `${q.toLowerCase()}|${lat.toFixed(2)}|${lon.toFixed(2)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return res.json(hit.value);

    let payload;
    try {
      const results = await nominatimSearch(q, lat, lon);
      payload =
        results.length > 0
          ? { source: 'nominatim', results }
          : { source: 'seeded', fallbackReason: 'no_results', results: await seededSearch(q, lat, lon) };
    } catch (err) {
      console.warn('Nominatim failed, using seeded POIs:', err.message);
      payload = { source: 'seeded', fallbackReason: err.reason || 'error', results: await seededSearch(q, lat, lon) };
    }

    // only cache real Nominatim answers, so a temporary failure is retried next time
    if (payload.source === 'nominatim') {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), value: payload });
    }
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
