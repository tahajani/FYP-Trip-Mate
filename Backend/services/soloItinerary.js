const { selectCandidates } = require('./candidates');
const { kMeans, toPoint } = require('./kmeans');
const { getDurationMatrix } = require('./osrm');
const { resolveOverflow } = require('./overflow');
const { DAY_CAPACITY } = require('../config/pace');

const MAX_DAYS = 14; // [Suggested] input sanity limit, not from the plan
const round1 = (x) => Math.round(x * 10) / 10;

function validateInput(user, days) {
  if (!user || !Array.isArray(user.interests)) throw new Error('user.interests must be an array');
  if (!Object.prototype.hasOwnProperty.call(DAY_CAPACITY, user.pace)) {
    throw new Error('pace must be relaxed, moderate or fast');
  }
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw new Error(`days must be an integer from 1 to ${MAX_DAYS}`);
  }
}

const emptyDays = (days, capacityMinutes) =>
  Array.from({ length: days }, (_, d) => ({
    day: d + 1, capacityMinutes, visitMinutes: 0, travelMinutes: 0, places: [],
  }));

// Pure of the database: pois are already loaded (see loadRegionPois). deps.getMatrix can be replaced in tests.
// The result mirrors the Itinerary model; ownerId, regionId and saving are the caller's job.
// "dropped", "moved", "poolSize" and "avgVisitUsed" are extra information (strip them before saving).
async function generateSoloItinerary({ user, days, pois, regionSlug = null, userId = null }, deps = {}) {
  validateInput(user, days);
  const { getMatrix = getDurationMatrix, options } = deps;
  const capacityMinutes = DAY_CAPACITY[user.pace];

  const base = {
    type: 'solo',
    regionSlug,
    dayCount: days,
    participants: [{ ...(userId ? { userId } : {}), interests: user.interests, pace: user.pace }],
  };

  const cand = selectCandidates(user, days, pois);
  const warnings = [];
  if (cand.places.length === 0) {
    warnings.push('No usable places found for this region and profile.');
    return { ...base, days: emptyDays(days, capacityMinutes), poolSize: 0, avgVisitUsed: null, dropped: [], moved: [], warnings };
  }

  const places = cand.places;
  const points = places.map((p) => toPoint(p.poi));
  const clusters = kMeans(points, days);
  const m = await getMatrix(points);
  warnings.push(...(m.warnings || []));
  if (places.length < days) warnings.push(`Only ${places.length} place(s) for ${days} days: some days are empty.`);

  const resolved = resolveOverflow({ places, clusters, durationsMin: m.durationsMin, capacityMinutes, options });

  const dayList = resolved.days.map((ev, d) => {
    const dayPlaces = ev.order.map((gi, k) => {
      const { poi, score } = places[gi];
      return {
        poiId: poi._id,
        name: poi.name,
        kind: poi.kind,
        location: { lat: points[gi].lat, lon: points[gi].lon },
        order: k + 1,
        visitMinutes: poi.avgVisitDuration,
        travelMinutesFromPrevious: k === 0 ? 0 : round1(m.durationsMin[ev.order[k - 1]][gi]),
        score,
        source: 'solo',
        selectedFor: null,
        memberScores: [],
      };
    });
    const travelMinutes = round1(dayPlaces.reduce((s, p) => s + p.travelMinutesFromPrevious, 0));
    return {
      day: d + 1,
      capacityMinutes,
      visitMinutes: ev.visitMinutes,
      travelMinutes,
      places: dayPlaces,
    };
  });

  const droppedInfo = resolved.dropped.map((x) => ({
    name: places[x.index].poi.name, osmId: places[x.index].poi.osmId, fromDay: x.fromDay, reason: x.reason,
  }));
  const movedInfo = resolved.moved.map((x) => ({
    name: places[x.index].poi.name, osmId: places[x.index].poi.osmId, fromDay: x.fromDay, toDay: x.toDay,
  }));
  droppedInfo.forEach((x) =>
    warnings.push(`Dropped "${x.name}" from day ${x.fromDay}: the day did not fit ${capacityMinutes} minutes.`));
  movedInfo.forEach((x) =>
    warnings.push(`Moved "${x.name}" from day ${x.fromDay} to day ${x.toDay} to fit the day length.`));

  return {
    ...base,
    days: dayList,
    travelTimeSource: ['osrm', 'haversine'].includes(m.source) ? m.source : undefined,
    poolSize: cand.poolSize,
    avgVisitUsed: cand.avgVisitUsed,
    dropped: droppedInfo,
    moved: movedInfo,
    warnings,
  };
}

module.exports = { generateSoloItinerary, MAX_DAYS };