// services/itineraryEdit.js
// Recomputes order, travel legs and day totals after the user adjusts an itinerary
// (add / remove / reorder / move between days). The visiting order is the one the user chose;
// nothing is re-optimised here.
const { haversineKm } = require('../utils/geo');
const { getDurationMatrix } = require('./osrm');

const ROAD_FACTOR = 1.3; // same fallback assumption as the OSRM helper: x1.3 road factor
const FALLBACK_KMH = 30; // ... at 30 km/h
const MAX_PLACES_PER_DAY = 20;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round1 = (v) => Math.round(v * 10) / 10;

function cleanPlace(p, index, dayNo) {
  if (!p || typeof p.name !== 'string' || !p.name.trim()) {
    throw new Error(`Day ${dayNo}: place ${index + 1} ka name nahi hai`);
  }
  const lat = Number(p.location && p.location.lat);
  const lon = Number(p.location && p.location.lon);
  if (!isNum(lat) || !isNum(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error(`Day ${dayNo}: "${p.name}" ki location galat hai`);
  }
  const score = Number(p.score);
  return {
    poiId: p.poiId && /^[0-9a-f]{24}$/i.test(String(p.poiId)) ? String(p.poiId) : undefined,
    name: p.name.trim().slice(0, 200),
    kind: typeof p.kind === 'string' && p.kind ? p.kind.slice(0, 40) : 'attraction',
    location: { lat, lon },
    visitMinutes: Math.min(240, Math.max(15, Number(p.visitMinutes) || 60)),
    score: isNum(score) ? score : 0,
    // places already in the itinerary keep their source; places added by the user are 'manual'
    source: p.source === 'solo' || p.source === 'group' ? p.source : 'manual',
  };
}

// Minutes between consecutive places, in the given order.
async function legMinutes(places) {
  if (places.length < 2) return { legs: [], source: null, warning: null };
  const pts = places.map((p) => ({ lat: p.location.lat, lon: p.location.lon }));
  try {
    const m = await getDurationMatrix(pts);
    const mat = m && (m.durationsMin || m.durations || m);
    const legs = pts.slice(1).map((_, i) => mat[i][i + 1]);
    if (legs.every(isNum)) {
      const warn = m && Array.isArray(m.warnings) && m.warnings.length ? String(m.warnings[0]) : null;
      return { legs, source: (m && m.source) || 'osrm', warning: warn };
    }
  } catch (e) {
    // fall through to the straight-line estimate
  }
  const legs = pts.slice(1).map((b, i) => {
    const a = pts[i];
    return ((haversineKm(a.lat, a.lon, b.lat, b.lon) * ROAD_FACTOR) / FALLBACK_KMH) * 60;
  });
  return { legs, source: 'haversine', warning: 'Travel times estimated (OSRM unavailable)' };
}

// existing: the saved days (plain objects). incoming: [{ day, places: [...] }] from the client.
async function recomputeDays(existing, incoming) {
  if (!Array.isArray(incoming)) throw new Error('days array chahiye');
  if (incoming.length !== existing.length) throw new Error('Din ki tadaad badal nahi sakti');

  const byDay = new Map(existing.map((d) => [d.day, d]));
  const warnings = [];
  const out = [];
  let source = null;

  for (const inc of incoming) {
    const base = byDay.get(inc.day);
    if (!base) throw new Error(`Day ${inc.day} maujood nahi hai`);
    const raw = Array.isArray(inc.places) ? inc.places : [];
    if (raw.length > MAX_PLACES_PER_DAY) {
      throw new Error(`Day ${inc.day}: ek din mein ${MAX_PLACES_PER_DAY} se zyada places nahi ho sakti`);
    }

    const places = raw.map((p, i) => cleanPlace(p, i, inc.day));
    const { legs, source: s, warning } = await legMinutes(places);
    if (s) source = source === 'haversine' || s === 'haversine' ? 'haversine' : s;
    if (warning) warnings.push(`Day ${inc.day}: ${warning}`);

    const placesOut = places.map((p, i) => ({
      ...p,
      order: i + 1,
      travelMinutesFromPrevious: i === 0 ? 0 : round1(legs[i - 1]),
      selectedFor: null,
      memberScores: [],
    }));
    const visit = placesOut.reduce((sum, p) => sum + p.visitMinutes, 0);
    const travel = round1(placesOut.reduce((sum, p) => sum + p.travelMinutesFromPrevious, 0));
    if (visit + travel > base.capacityMinutes) {
      warnings.push(
        `Day ${inc.day}: ${Math.round(visit + travel)} min hai, capacity ${base.capacityMinutes} min se zyada`
      );
    }
    out.push({
      day: inc.day,
      places: placesOut,
      capacityMinutes: base.capacityMinutes,
      visitMinutes: visit,
      travelMinutes: travel,
    });
  }

  out.sort((a, b) => a.day - b.day);
  return { days: out, warnings, source };
}

module.exports = { recomputeDays, legMinutes, cleanPlace, MAX_PLACES_PER_DAY };
