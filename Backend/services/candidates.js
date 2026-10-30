const { CATEGORIES } = require('../config/categories');
const { soloScore, poolSize } = require('./scoring');

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

// Pure function: ranks POIs for a solo user and returns the top N.
// user = { interests: [...], pace: 'relaxed' | 'moderate' | 'fast' }
function selectCandidates(user, days, pois) {
  if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive integer');

  const usable = pois.filter(isUsable);
  if (usable.length === 0) return { places: [], poolSize: 0, avgVisitUsed: null };

  const ranked = usable
    .map((poi) => ({ poi, score: soloScore(user, poi) }))
    // Sort by score; ties broken by osmId so the result is deterministic.
    .sort((a, b) => b.score - a.score || (a.poi.osmId || 0) - (b.poi.osmId || 0));

  // [Open, suggested]: average visit time of the top 3 x days candidates.
  const top = ranked.slice(0, 3 * days);
  const avgVisitUsed = top.reduce((s, r) => s + r.poi.avgVisitDuration, 0) / top.length;

  const N = Math.max(1, poolSize(days, user.pace, avgVisitUsed));
  return { places: ranked.slice(0, N), poolSize: N, avgVisitUsed };
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

async function getCandidates(user, regionSlug, days) {
  const pois = await loadRegionPois(regionSlug);
  return selectCandidates(user, days, pois);
}

module.exports = { isUsable, selectCandidates, loadRegionPois, getCandidates };