// resolve_overflow: makes each day fit its capacity by moving or dropping the lowest-priority place.
// A day's length is measured on its REAL sequenced route (visit minutes + travel minutes).
//
// Two modes for "how close is a place to the centre of its day" (F6 and the start of the route):
//   proximity: 'straight' (default)  straight-line distance to the average point of the day (Haversine)
//   proximity: 'road'                OSRM travel time to the day's medoid (a real place), from durationsMin
const { haversineKm } = require('../utils/geo');
const { toPoint } = require('./kmeans');
const { sequenceDay } = require('./sequencing');

const EPS = 1e-9;
const DEFAULT_WEIGHTS = { interest: 0.7, proximity: 0.3 }; // F5 (heuristic, not from a paper)

const sym = (D, i, j) => (D[i][j] + D[j][i]) / 2; // OSRM matrices can be asymmetric

function centroidOf(points) {
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lon: points.reduce((s, p) => s + p.lon, 0) / points.length,
  };
}

// Index (inside the given list) of the point closest to the centroid. Ties: lowest index.
function nearestToCentroid(points) {
  const c = centroidOf(points);
  let best = 0;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = haversineKm(p.lat, p.lon, c.lat, c.lon);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// Global index of the day's member with the smallest total road time to the other members. Ties: lowest index.
function medoidOf(indexes, D) {
  let best = indexes[0];
  let bestSum = Infinity;
  for (const i of indexes) {
    let s = 0;
    for (const j of indexes) s += sym(D, i, j);
    if (s < bestSum - EPS || (Math.abs(s - bestSum) <= EPS && i < best)) { bestSum = s; best = i; }
  }
  return best;
}

// indexes = global indexes of the places in one day. Returns the day in visit order with its totals.
function evaluateDay(indexes, ctx) {
  if (indexes.length === 0) {
    return { order: [], visitMinutes: 0, travelMinutes: 0, totalMinutes: 0, fits: true, method: 'none' };
  }
  const visitMinutes = indexes.reduce((s, i) => s + ctx.places[i].poi.avgVisitDuration, 0);
  const sub = indexes.map((a) => indexes.map((b) => ctx.durationsMin[a][b]));
  const start = ctx.road
    ? indexes.indexOf(medoidOf(indexes, ctx.durationsMin)) // [Suggested] open path from the road-centre of the day
    : nearestToCentroid(indexes.map((i) => ctx.points[i]));
  const seq = sequenceDay(sub, { start, exactLimit: ctx.exactLimit });
  const totalMinutes = visitMinutes + seq.cost;
  return {
    order: seq.order.map((k) => indexes[k]),
    visitMinutes,
    travelMinutes: seq.cost,
    totalMinutes,
    fits: totalMinutes <= ctx.capacityMinutes + EPS,
    method: seq.method,
  };
}

// F5 and F6 on the CURRENT members of one day (not empty).
// durationsMin (optional): when given, "distance to the centre" is road time to the day's medoid.
function priorityScores(indexes, places, points, weights = DEFAULT_WEIGHTS, durationsMin = null) {
  let dist;
  if (durationsMin) {
    const c = medoidOf(indexes, durationsMin);
    dist = indexes.map((i) => (i === c ? 0 : sym(durationsMin, c, i)));
  } else {
    const c = centroidOf(indexes.map((i) => points[i]));
    dist = indexes.map((i) => haversineKm(points[i].lat, points[i].lon, c.lat, c.lon));
  }
  const dMax = Math.max(...dist);
  return indexes.map((index, k) => {
    const proximity = dMax > 0 ? 1 - dist[k] / dMax : 1;
    const interest = places[index].score;
    return { index, interest, proximity, priority: weights.interest * interest + weights.proximity * proximity };
  });
}

// Lowest priority first; on a tie the lower-ranked place (higher index) goes first.
function pickVictim(scored) {
  return scored.reduce((worst, s) => {
    if (s.priority < worst.priority - EPS) return s;
    if (Math.abs(s.priority - worst.priority) <= EPS && s.index > worst.index) return s;
    return worst;
  });
}

// Tries the other days, nearest centre first. Accepts only a day that still fits afterwards.
function tryMove(victim, fromDay, dayIdx, ctx) {
  const vp = ctx.points[victim];
  const options = dayIdx
    .map((ix, day) => ({ day, ix }))
    .filter((o) => o.day !== fromDay)
    .map((o) => {
      let dist = Infinity; // an empty day is tried last
      if (o.ix.length) {
        if (ctx.road) {
          dist = sym(ctx.durationsMin, victim, medoidOf(o.ix, ctx.durationsMin));
        } else {
          const c = centroidOf(o.ix.map((i) => ctx.points[i]));
          dist = haversineKm(vp.lat, vp.lon, c.lat, c.lon);
        }
      }
      return { ...o, dist };
    })
    .sort((a, b) => a.dist - b.dist || a.day - b.day);

  for (const o of options) {
    const indexes = [...o.ix, victim];
    if (evaluateDay(indexes, ctx).fits) return { day: o.day, indexes };
  }
  return null;
}

// places = [{ poi, score }] (pool order), clusters = arrays of global indexes (one per day),
// durationsMin = n x n matrix for ALL places in the pool.
// Returns { days: [evaluated day], dropped: [...], moved: [...] } (day numbers in dropped/moved are 1-based).
function resolveOverflow({ places, clusters, durationsMin, capacityMinutes, options = {} }) {
  const { allowMove = true, weights = DEFAULT_WEIGHTS, exactLimit, proximity = 'straight' } = options;
  const n = places.length;
  if (!Number.isFinite(capacityMinutes) || capacityMinutes <= 0) {
    throw new Error('capacityMinutes must be a positive number');
  }
  if (!Array.isArray(durationsMin) || durationsMin.length !== n ||
      !durationsMin.every((r) => Array.isArray(r) && r.length === n)) {
    throw new Error('durationsMin must be an n x n matrix for n places');
  }

  const road = proximity === 'road';
  const points = places.map((p) => toPoint(p.poi));
  const ctx = { places, points, durationsMin, capacityMinutes, exactLimit, road };
  const dayIdx = clusters.map((c) => c.slice());
  const dropped = [];
  const moved = [];

  for (let d = 0; d < dayIdx.length; d++) {
    let ev = evaluateDay(dayIdx[d], ctx);
    while (!ev.fits) {
      const victim = pickVictim(priorityScores(dayIdx[d], places, points, weights, road ? durationsMin : null));
      dayIdx[d] = dayIdx[d].filter((i) => i !== victim.index);
      const target = allowMove ? tryMove(victim.index, d, dayIdx, ctx) : null;
      if (target) {
        dayIdx[target.day] = target.indexes;
        moved.push({ index: victim.index, fromDay: d + 1, toDay: target.day + 1 });
      } else {
        dropped.push({ index: victim.index, fromDay: d + 1, priority: victim.priority, reason: 'day capacity exceeded' });
      }
      ev = evaluateDay(dayIdx[d], ctx);
    }
  }

  return { days: dayIdx.map((ix) => evaluateDay(ix, ctx)), dropped, moved };
}

module.exports = {
  centroidOf, nearestToCentroid, medoidOf, evaluateDay, priorityScores, pickVictim, resolveOverflow,
};
