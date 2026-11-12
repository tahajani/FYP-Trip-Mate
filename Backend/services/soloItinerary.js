const { selectCandidates, matchedCategories } = require('./candidates');
const { kMeans, toPoint } = require('./kmeans');
const { kMedoids } = require('./kmedoids');
const { getDurationMatrix } = require('./osrm');
const { resolveOverflow } = require('./overflow');
const { DAY_CAPACITY } = require('../config/pace');
const { cleanName } = require('../utils/names');
const { isValidISODate, addDays } = require('../utils/dates');

const MAX_DAYS = 14; // [Suggested] input sanity limit, not from the plan
const round1 = (x) => Math.round(x * 10) / 10;

function validateInput(user, days, startDate) {
  if (!user || !Array.isArray(user.interests)) throw new Error('user.interests must be an array');
  if (!Object.prototype.hasOwnProperty.call(DAY_CAPACITY, user.pace)) {
    throw new Error('pace must be relaxed, moderate or fast');
  }
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw new Error(`days must be an integer from 1 to ${MAX_DAYS}`);
  }
  if (startDate != null && !isValidISODate(startDate)) throw new Error('startDate must look like YYYY-MM-DD');
}

const emptyDays = (days, capacityMinutes, startDate) =>
  Array.from({ length: days }, (_, d) => ({
    day: d + 1,
    ...(startDate ? { date: addDays(startDate, d) } : {}),
    capacityMinutes, visitMinutes: 0, travelMinutes: 0, places: [],
  }));

// Pure of the database: pois are already loaded (see loadRegionPois). deps.getMatrix can be replaced in tests.
// The result mirrors the Itinerary model; ownerId, regionId and saving are the caller's job.
// "dropped", "moved", "poolSize", "avgVisitUsed" and "coverage" are extra information (strip them before saving).
//
// startDate ('YYYY-MM-DD', optional): day 1 is that date, day 2 the next one, and so on. endDate is derived from it.
// deps.options:
//   clustering  'road' (default): days are grouped by OSRM travel time (k-medoids) and the day centre is a real place
//               'kmeans': the older version, straight-line K-Means
//   diversify   true (default): the pool is filled round-robin over the chosen categories
//   allowMove, weights, exactLimit: passed on to resolveOverflow
async function generateSoloItinerary(
  { user, days, pois, regionSlug = null, userId = null, startDate = null },
  deps = {}
) {
  validateInput(user, days, startDate);
  const { getMatrix = getDurationMatrix, options = {} } = deps;
  const { clustering = 'road', diversify = true, ...overflowOptions } = options;
  const capacityMinutes = DAY_CAPACITY[user.pace];

  const base = {
    type: 'solo',
    regionSlug,
    dayCount: days,
    ...(startDate ? { startDate, endDate: addDays(startDate, days - 1) } : {}),
    participants: [{ ...(userId ? { userId } : {}), interests: user.interests, pace: user.pace }],
  };

  const cand = selectCandidates(user, days, pois, { diversify });
  const warnings = [];
  if (cand.places.length === 0) {
    warnings.push('No usable places found for this region and profile.');
    return {
      ...base, days: emptyDays(days, capacityMinutes, startDate), poolSize: 0, avgVisitUsed: null,
      dropped: [], moved: [], coverage: {}, warnings,
    };
  }

  const places = cand.places;
  const points = places.map((p) => toPoint(p.poi));

  // Road times first: they are used for grouping the days, for the order inside a day and for the day lengths.
  const m = await getMatrix(points);
  warnings.push(...(m.warnings || []));
  if (places.length < days) warnings.push(`Only ${places.length} place(s) for ${days} days: some days are empty.`);

  const useRoad = clustering !== 'kmeans';
  const clusters = useRoad ? kMedoids(m.durationsMin, days) : kMeans(points, days);

  const resolved = resolveOverflow({
    places, clusters, durationsMin: m.durationsMin, capacityMinutes,
    options: { ...overflowOptions, proximity: useRoad ? 'road' : 'straight' },
  });

  const dayList = resolved.days.map((ev, d) => {
    const dayPlaces = ev.order.map((gi, k) => {
      const { poi, score } = places[gi];
      return {
        poiId: poi._id,
        name: cleanName(poi.name) || poi.name,
        kind: poi.kind,
        location: { lat: points[gi].lat, lon: points[gi].lon },
        order: k + 1,
        visitMinutes: poi.avgVisitDuration,
        travelMinutesFromPrevious: k === 0 ? 0 : round1(m.durationsMin[ev.order[k - 1]][gi]),
        score,
        matched: matchedCategories(user, poi), // which of the user's interests this place fits
        source: 'solo',
        selectedFor: null,
        memberScores: [],
      };
    });
    const travelMinutes = round1(dayPlaces.reduce((s, p) => s + p.travelMinutesFromPrevious, 0));
    return {
      day: d + 1,
      ...(startDate ? { date: addDays(startDate, d) } : {}),
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

  // How many places of the final trip fit each chosen interest. A zero is reported instead of hidden.
  const coverage = Object.fromEntries(user.interests.map((c) => [c, 0]));
  dayList.forEach((d) => d.places.forEach((p) => p.matched.forEach((c) => { if (c in coverage) coverage[c] += 1; })));
  Object.entries(coverage).forEach(([c, count]) => {
    if (count === 0) {
      warnings.push(`No place in this trip matches your interest "${c}" (the region may have few seeded places for it).`);
    }
  });

  return {
    ...base,
    days: dayList,
    travelTimeSource: ['osrm', 'haversine'].includes(m.source) ? m.source : undefined,
    poolSize: cand.poolSize,
    avgVisitUsed: cand.avgVisitUsed,
    dropped: droppedInfo,
    moved: movedInfo,
    coverage,
    warnings,
  };
}

module.exports = { generateSoloItinerary, MAX_DAYS };
