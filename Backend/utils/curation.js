// Curation layer applied AFTER classify(): manual excludes, generic names, outside-region
// cities and a notability filter for noisy kinds (parks, markets).
const DEFAULT_NOTABLE_KINDS = ['park', 'market'];

const GENERIC_NAMES = new Set([
  'monument', 'memorial', 'park', 'garden', 'lawn', 'haveli', 'market', 'bazaar', 'bazar',
  'mosque', 'masjid', 'shrine', 'viewpoint', 'museum', 'zoo',
]);

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const review = (reason) => ({ needsReview: true, reviewReason: reason });

// overrides = { excludeNames, excludeIds ("node/123"), excludeCities, includeNames, landmarkNames, notableKinds }
function curate({ result, tags = {}, name, osmType, osmId, overrides = {} }) {
  if (result.needsReview) return result;

  const nameKey = norm(name);

  const excludeNames = new Set((overrides.excludeNames ?? []).map(norm));
  const excludeIds = new Set(overrides.excludeIds ?? []);
  if (excludeIds.has(`${osmType}/${osmId}`) || excludeNames.has(nameKey)) return review('manual exclude');

  const cities = new Set((overrides.excludeCities ?? []).map(norm));
  const placeCities = [tags['addr:city:en'], tags['addr:city']].map(norm).filter(Boolean);
  if (placeCities.some((c) => cities.has(c))) return review('outside region (city tag)');

  if (GENERIC_NAMES.has(nameKey)) return review('generic name');

  const notableKinds = overrides.notableKinds ?? DEFAULT_NOTABLE_KINDS;
  if (notableKinds.includes(result.kind)) {
    const include = new Set([...(overrides.includeNames ?? []), ...(overrides.landmarkNames ?? [])].map(norm));
    const notable =
      include.has(nameKey) ||
      Boolean(tags.wikidata || tags.wikipedia || tags.tourism) ||
      (result.kind === 'market' && tags.shop === 'mall');
    if (!notable) return review('not notable');
  }

  return result;
}

module.exports = { curate };