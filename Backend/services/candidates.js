const { CATEGORIES } = require('../config/categories');
const { soloScore, poolSize, userVectorFromInterests } = require('./scoring');
const { haversineKm } = require('../utils/geo');
const { normalizeName } = require('../utils/names');

const DUPLICATE_METERS = 300; // same name within this distance = the same place seeded twice

// A POI is usable only if it was classified (no needsReview, real vector, numbers present).
function isUsable(poi) {
  return Boolean(
    poi &&
      !poi.needsReview &&
      Array.isArray(poi.interestVector) &&
      poi.interestVector.length === CATEGORIES.length &&
      typeof poi.intensity === 'number' &&
      typeof poi.avgVisitDuration === 'number' &&
      poi.location &&
      Array.isArray(poi.location.coordinates)
  );
}

// Removes the same place seeded twice (for example a mall stored as a node and as a building).
// Two POIs are duplicates when their normalised names are equal and they are within DUPLICATE_METERS.
// The one with the lower osmId is kept, so the result is deterministic.
function dedupePois(pois, meters = DUPLICATE_METERS) {
  const sorted = [...pois].sort((a, b) => (a.osmId || 0) - (b.osmId || 0));
  const kept = [];
  for (const p of sorted) {
    const key = normalizeName(p.name);
    const dup =
      key &&
      kept.some(
        (k) =>
          normalizeName(k.name) === key &&
          haversineKm(
            k.location.coordinates[1], k.location.coordinates[0],
            p.location.coordinates[1], p.location.coordinates[0]
          ) * 1000 <= meters
      );
    if (!dup) kept.push(p);
  }
  return kept;
}

// Categories the user picked that this place belongs to (weight > 0), strongest first.
function matchedCategories(user, poi) {
  const uv = userVectorFromInterests(user.interests);
  return CATEGORIES.map((name, i) => ({ name, w: uv[i] === 1 && poi.interestVector ? poi.interestVector[i] : 0 }))
    .filter((c) => c.w > 0)
    .sort((a, b) => b.w - a.w)
    .map((c) => c.name);
}

const byScore = (a, b) => b.score - a.score || (a.poi.osmId || 0) - (b.poi.osmId || 0);

// Coverage re-ranking (resolves the open "7A" question). The plain top-N can be taken over by one category
// (7 museums, 0 religious places). Here the top-N is filled round-robin: one place per chosen category in turn
// (best scores first), then whatever is left by plain score. Categories with no places simply give their turns away.
function diversify(ranked, user, N) {
  const uv = userVectorFromInterests(user.interests);
  const wanted = CATEGORIES.map((_, i) => i).filter((i) => uv[i] === 1);
  if (wanted.length < 2) return ranked.slice(0, N);

  const buckets = new Map(wanted.map((i) => [i, []]));
  for (const r of ranked) {
    let best = -1;
    let bestW = 0;
    for (const i of wanted) {
      if (r.poi.interestVector[i] > bestW) { bestW = r.poi.interestVector[i]; best = i; }
    }
    if (best >= 0) buckets.get(best).push(r);
  }
  // categories whose best place scores higher get the first turn in each round
  const order = [...buckets.entries()]
    .filter(([, b]) => b.length > 0)
    .sort((a, b) => b[1][0].score - a[1][0].score || a[0] - b[0])
    .map(([i]) => i);

  const picked = [];
  for (let round = 0; picked.length < N; round++) {
    let added = false;
    for (const i of order) {
      const b = buckets.get(i);
      if (round < b.length && picked.length < N) { picked.push(b[round]); added = true; }
    }
    if (!added) break;
  }
  if (picked.length < N) {
    const have = new Set(picked);
    for (const r of ranked) {
      if (picked.length >= N) break;
      if (!have.has(r)) picked.push(r);
    }
  }
  return picked.sort(byScore); // pool order = rank order (used by tie rules later)
}

// Pure function: ranks POIs for a solo user and returns the top N.
// user = { interests: [...], pace: 'relaxed' | 'moderate' | 'fast' }
// options.dedupe (default true): drop places seeded twice. options.diversify (default false): see diversify().
function selectCandidates(user, days, pois, options = {}) {
  if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive integer');
  const { dedupe = true, diversify: useDiversify = false } = options;

  const usableAll = pois.filter(isUsable);
  const usable = dedupe ? dedupePois(usableAll) : usableAll;
  if (usable.length === 0) return { places: [], poolSize: 0, avgVisitUsed: null };

  const ranked = usable
    .map((poi) => ({ poi, score: soloScore(user, poi) }))
    // Sort by score; ties broken by osmId so the result is deterministic.
    .sort(byScore);

  // [Open, suggested]: average visit time of the top 3 x days candidates.
  const top = ranked.slice(0, 3 * days);
  const avgVisitUsed = top.reduce((s, r) => s + r.poi.avgVisitDuration, 0) / top.length;

  const N = Math.max(1, poolSize(days, user.pace, avgVisitUsed));
  const places = useDiversify ? diversify(ranked, user, N) : ranked.slice(0, N);
  return { places, poolSize: N, avgVisitUsed };
}

// DB part. Models are required lazily so tests of the pure function need no database.
async function loadRegionPois(slug) {
  const Region = require('../models/Region');
  const Poi = require('../models/Poi');

  const region = await Region.findOne({ slug });
  if (!region) throw new Error(`Region not found: ${slug}`);
  if (!region.seeded) throw new Error(`Region not seeded yet: ${slug}`);

  return Poi.find({
    regionId: region._id,
    needsReview: false,
    interestVector: { $ne: null },
  }).lean();
}

async function getCandidates(user, regionSlug, days, options) {
  const pois = await loadRegionPois(regionSlug);
  return selectCandidates(user, days, pois, options);
}

module.exports = {
  isUsable, dedupePois, matchedCategories, diversify, selectCandidates, loadRegionPois, getCandidates,
};
