// Group itinerary: select (consensus + round-robin) -> road matrix -> k-medoids days -> day order -> overflow protection.
// Uses only kMedoids, sequenceDay, getDurationMatrix and selectGroupCandidates (it does not depend on soloItinerary/overflow).
const { selectGroupCandidates } = require('./groupScoring');
const { matchedCategories } = require('./candidates');
const { getDurationMatrix } = require('./osrm');
const { kMedoids } = require('./kmedoids');
const { sequenceDay } = require('./sequencing');

const CAPACITY = { relaxed: 270, moderate: 360, fast: 480 }; // [Decided] minutes per day
const MAX_DAYS = 14;

const addDaysISO = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const sum = (a) => a.reduce((s, x) => s + x, 0);

// input: { members:[{id,name,interests,pace}], days, pois, regionSlug, ownerId, groupId, startDate }
// deps:  { getMatrix, options: { select, capacityMinutes } }   (all optional, used by tests)
async function generateGroupItinerary(input, { getMatrix = getDurationMatrix, options = {} } = {}) {
  const { members, days, pois, regionSlug, ownerId, groupId, startDate = null } = input;
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new Error(`days must be an integer from 1 to ${MAX_DAYS}`);

  const sel = selectGroupCandidates(members, days, pois, options.select);
  const voters = members.filter((m) => Array.isArray(m.interests) && m.interests.length > 0);
  const capacity = options.capacityMinutes ?? CAPACITY[sel.pace];
  const warnings = [...sel.warnings];
  const base = {
    type: 'group',
    participants: members.map((mem) => ({ userId: mem.id, interests: mem.interests || [], pace: mem.pace })),
    ownerId, groupId, regionSlug, startDate: startDate || undefined,
    endDate: startDate ? addDaysISO(startDate, days - 1) : undefined,
    dayCount: days, pace: sel.pace, poolSize: sel.poolSize, avgVisitUsed: sel.avgVisitUsed,
    selectedCount: sel.places.length, moved: [], dropped: [],
  };
  if (sel.places.length === 0) {
    warnings.push('Is region me group ke liye koi jagah nahi mili.');
    return {
      ...base, days: Array.from({ length: days }, (_, d) => emptyDay(d, startDate, capacity)),
      warnings, satisfaction: [], consensusCount: 0, // no travelTimeSource: the schema only allows 'osrm' | 'haversine'
    };
  }

  const items = sel.places;
  const pts = items.map(({ poi }) => ({ lat: poi.location.coordinates[1], lon: poi.location.coordinates[0] }));
  const m = await getMatrix(pts); // fetched BEFORE clustering: days are grouped by road time
  warnings.push(...(m.warnings || []));
  const D = m.durationsMin;
  const visit = items.map((r) => r.poi.avgVisitDuration);

  // order one day (free start) and measure it
  const plan = (idxs) => {
    if (idxs.length === 0) return { order: [], total: 0 };
    const sub = idxs.map((i) => idxs.map((j) => D[i][j]));
    const seq = sequenceDay(sub, { start: null });
    return { order: seq.order.map((k) => idxs[k]), total: seq.cost + sum(idxs.map((i) => visit[i])) };
  };

  const dayIdx = kMedoids(D, days);
  const plans = dayIdx.map(plan);
  const moved = [];
  const dropped = [];

  // Overflow protection: while a day is over capacity take out one place. Never a consensus place first; among
  // round-robin places the one chosen for the member with the HIGHEST cumSat goes first (that member has got the most).
  // The place is moved to the day that has room with the least extra time, else it is dropped.
  const alive = new Set(items.map((_, i) => i));
  const cumOf = () => {
    const cum = {};
    voters.forEach((v) => { cum[v.id] = sum([...alive].map((i) => items[i].memberScores[v.id])); });
    return cum;
  };
  const victimOf = (idxs) => {
    const cum = cumOf();
    return [...idxs].sort((a, b) => {
      const ca = items[a].source === 'consensus' ? 1 : 0;
      const cb = items[b].source === 'consensus' ? 1 : 0;
      if (ca !== cb) return ca - cb; // round-robin places first
      const ka = ca ? 0 : cum[items[a].selectedFor] ?? 0;
      const kb = cb ? 0 : cum[items[b].selectedFor] ?? 0;
      return kb - ka || items[a].score - items[b].score || b - a;
    })[0];
  };
  for (let d = 0; d < days; d++) {
    while (plans[d].total > capacity && dayIdx[d].length > 1) {
      const v = victimOf(dayIdx[d]);
      let best = null;
      for (let e = 0; e < days; e++) {
        if (e === d) continue;
        const cand = plan([...dayIdx[e], v]);
        if (cand.total <= capacity && (!best || cand.total - plans[e].total < best.extra)) {
          best = { e, cand, extra: cand.total - plans[e].total };
        }
      }
      dayIdx[d] = dayIdx[d].filter((i) => i !== v);
      plans[d] = plan(dayIdx[d]);
      const name = items[v].poi.name;
      if (best) {
        dayIdx[best.e] = [...dayIdx[best.e], v];
        plans[best.e] = best.cand;
        moved.push({ name, fromDay: d + 1, toDay: best.e + 1 });
        warnings.push(`${name} Din ${d + 1} me time kam tha, isliye Din ${best.e + 1} me rakhi gayi.`);
      } else {
        alive.delete(v);
        dropped.push({ name, day: d + 1, source: items[v].source, selectedFor: items[v].selectedFor });
        warnings.push(`${name} Din ${d + 1} me time na hone ki wajah se hata di gayi.`);
      }
    }
  }

  const outDays = plans.map((p, d) => {
    if (p.order.length === 0) {
      warnings.push(`Din ${d + 1} ke liye koi jagah nahi bachi.`);
      return emptyDay(d, startDate, capacity);
    }
    const places = p.order.map((i, k) => {
      const r = items[i];
      const matched = [...new Set(voters.flatMap((v) => matchedCategories(v, r.poi)))];
      return {
        order: k + 1,
        poiId: r.poi._id,
        name: r.poi.name,
        kind: r.poi.kind,
        location: { lat: r.poi.location.coordinates[1], lon: r.poi.location.coordinates[0] },
        visitMinutes: r.poi.avgVisitDuration,
        travelMinutesFromPrevious: k === 0 ? 0 : Math.round(D[p.order[k - 1]][i]),
        score: r.score,
        matched,
        source: r.source,
                selectedFor: r.source === 'consensus' ? null : r.selectedFor, // schema: a user id or null
        memberScores: voters.map((v) => ({ userId: v.id, score: r.memberScores[v.id] })), // schema: [{ userId, score }]
        reason: r.reason,
      };
    });
    return {
      day: d + 1,
      date: startDate ? addDaysISO(startDate, d) : undefined,
      capacityMinutes: capacity,
      visitMinutes: sum(places.map((x) => x.visitMinutes)),
      travelMinutes: sum(places.map((x) => x.travelMinutesFromPrevious)),
      places,
    };
  });

  // satisfaction again over the places that really stayed in the trip
  const finalItems = [...alive].map((i) => items[i]);
    // schema: [{ userId, cumSat, avgScore }]  (cumSat = sum of the member's scores over the final places)
  const satisfaction = voters.map((v) => {
    const total = sum(finalItems.map((r) => r.memberScores[v.id]));
    return {
      userId: v.id,
      cumSat: Math.round(total * 1000) / 1000,
      avgScore: finalItems.length ? Math.round((total / finalItems.length) * 1000) / 1000 : 0,
    };
  });
  return {
    ...base, days: outDays, travelTimeSource: m.source === 'none' ? undefined : m.source, warnings, satisfaction,
    consensusCount: finalItems.filter((r) => r.source === 'consensus').length, moved, dropped,
  };
}

function emptyDay(d, startDate, capacity) {
  return {
    day: d + 1, date: startDate ? addDaysISO(startDate, d) : undefined, capacityMinutes: capacity,
    visitMinutes: 0, travelMinutes: 0, places: [],
  };
}

module.exports = { generateGroupItinerary, CAPACITY, MAX_DAYS };