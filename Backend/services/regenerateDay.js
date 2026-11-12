// Picks NEW places for one day. excludeIds = poiIds already used in the trip.
const { selectCandidates } = require('./candidates');
const { poolSize } = require('./scoring');
const { getDurationMatrix } = require('./osrm');
const { kMedoids } = require('./kmedoids');
const { sequenceDay } = require('./sequencing');

async function pickDayPlaces(user, pois, excludeIds = [], { getMatrix = getDurationMatrix, diversify = true } = {}) {
  const exclude = new Set(excludeIds.map(String));
  const available = pois.filter((p) => !exclude.has(String(p._id)));
  const pool = selectCandidates(user, 2, available, { diversify });
  if (pool.places.length === 0) return { places: [], travelTimeSource: 'none', warnings: [], method: 'none' };

  const oneDay = Math.max(1, poolSize(1, user.pace, pool.avgVisitUsed));
  const pts = pool.places.map(({ poi }) => ({ lat: poi.location.coordinates[1], lon: poi.location.coordinates[0] }));
  const m = await getMatrix(pts);

  let chosen = pool.places.map((_, i) => i);
  if (chosen.length > oneDay) {
    const value = (c) => c.reduce((s, i) => s + pool.places[i].score, 0);
    const best = kMedoids(m.durationsMin, 2)
      .filter((c) => c.length > 0)
      .sort((a, b) => value(b) - value(a) || b.length - a.length)[0];
    if (best.length >= Math.min(2, oneDay)) chosen = best;
    chosen = [...chosen].sort((a, b) => pool.places[b].score - pool.places[a].score || a - b).slice(0, oneDay);
  }

  const sub = chosen.map((i) => chosen.map((j) => m.durationsMin[i][j]));
  const seq = sequenceDay(sub, { start: null });
  return {
    places: seq.order.map((k) => pool.places[chosen[k]]),
    travelTimeSource: m.source,
    warnings: m.warnings || [],
    method: seq.method,
  };
}

module.exports = { pickDayPlaces };