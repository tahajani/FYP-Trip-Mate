const { CATEGORIES } = require('../config/categories');
const { dedupePois, matchedCategories, diversify, selectCandidates } = require('../services/candidates');

const vec = (map) => CATEGORIES.map((c) => map[c] || 0);
const poi = (osmId, name, v, lat = 33.7, lon = 73.05, extra = {}) => ({
  _id: `id${osmId}`, osmId, name, kind: 'x', interestVector: vec(v), intensity: 0.5, avgVisitDuration: 60,
  needsReview: false, location: { coordinates: [lon, lat] }, ...extra,
});

describe('dedupePois', () => {
  test('the same name within 300 m is one place; the lower osmId is kept', () => {
    const a = poi(2, 'The Centaurus Mall', { shopping_markets: 1 }, 33.7078, 73.0501);
    const b = poi(1, 'the  centaurus mall', { shopping_markets: 1 }, 33.7079, 73.0502);
    const kept = dedupePois([a, b]);
    expect(kept.map((p) => p.osmId)).toEqual([1]);
  });

  test('the same name far apart (two branches) and different names are both kept', () => {
    const a = poi(1, 'Mall', { shopping_markets: 1 }, 33.70, 73.05);
    const b = poi(2, 'Mall', { shopping_markets: 1 }, 33.60, 73.10);
    const c = poi(3, 'Other Mall', { shopping_markets: 1 }, 33.70, 73.05);
    expect(dedupePois([a, b, c]).length).toBe(3);
  });

  test('places without a name are never merged', () => {
    const a = poi(1, '', { shopping_markets: 1 });
    const b = poi(2, '', { shopping_markets: 1 });
    expect(dedupePois([a, b]).length).toBe(2);
  });
});

describe('matchedCategories', () => {
  test('lists only the chosen categories the place belongs to, strongest first', () => {
    const p = poi(1, 'X', { history_heritage: 0.3, museums_art: 0.9, nature_parks: 0.5 });
    expect(matchedCategories({ interests: ['history_heritage', 'museums_art'] }, p)).toEqual(['museums_art', 'history_heritage']);
    expect(matchedCategories({ interests: ['religious'] }, p)).toEqual([]);
  });
});

describe('diversify / selectCandidates', () => {
  // 6 museums with a high score, 2 mosques and 2 markets with lower ones
  const museums = Array.from({ length: 6 }, (_, i) => poi(10 + i, `Museum ${i}`, { museums_art: 1 }, 33.70 + i * 0.01));
  const mosques = [poi(20, 'Mosque A', { religious: 1 }, 33.65), poi(21, 'Mosque B', { religious: 1 }, 33.66)];
  const markets = [poi(30, 'Market A', { shopping_markets: 1 }, 33.75), poi(31, 'Market B', { shopping_markets: 1 }, 33.76)];
  const pois = [...museums, ...mosques, ...markets];
  const user = { interests: ['museums_art', 'religious', 'shopping_markets'], pace: 'moderate' };

  test('without diversify the top of the list is just the best scores (here: all museums)', () => {
    const r = selectCandidates({ interests: ['museums_art'], pace: 'moderate' }, 1, pois); // pool of 4
    const kinds = r.places.map((p) => p.poi.name.split(' ')[0]);
    expect(kinds.every((k) => k === 'Museum')).toBe(true);
  });

  test('diversify gives every chosen category a turn before a category gets a second place', () => {
    const r = selectCandidates(user, 1, pois, { diversify: true }); // pool = floor(360/(60+30)) = 4
    expect(r.poolSize).toBe(4);
    const names = r.places.map((p) => p.poi.name);
    const count = (prefix) => names.filter((n) => n.startsWith(prefix)).length;
    // 3 categories, 4 slots: each category appears at least once, one of them gets a second place
    expect(count('Museum')).toBeGreaterThanOrEqual(1);
    expect(count('Mosque')).toBeGreaterThanOrEqual(1);
    expect(count('Market')).toBeGreaterThanOrEqual(1);
    expect(count('Museum') + count('Mosque') + count('Market')).toBe(4);
    // the plain top-4 would have been 4 museums
    const plain = selectCandidates(user, 1, pois).places.map((p) => p.poi.name);
    expect(plain.every((n) => n.startsWith('Museum'))).toBe(true); // ties are broken by osmId, museums come first
  });

  test('a category with no places gives its turns to the others (no empty slots)', () => {
    const only = [...museums, ...markets];
    const r = selectCandidates(user, 1, only, { diversify: true });
    expect(r.places.length).toBe(4);
  });

  test('with one chosen category diversify changes nothing', () => {
    const ranked = [{ poi: museums[0], score: 1 }, { poi: museums[1], score: 0.9 }];
    expect(diversify(ranked, { interests: ['museums_art'] }, 1)).toEqual([ranked[0]]);
  });

  test('the pool stays in rank order', () => {
    const r = selectCandidates(user, 1, pois, { diversify: true });
    const scores = r.places.map((p) => p.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  test('duplicates are removed before ranking (default)', () => {
    const dup = [poi(1, 'Mall', { shopping_markets: 1 }), poi(2, 'Mall', { shopping_markets: 1 })];
    const r = selectCandidates({ interests: ['shopping_markets'], pace: 'moderate' }, 1, dup);
    expect(r.places.length).toBe(1);
    const kept = selectCandidates({ interests: ['shopping_markets'], pace: 'moderate' }, 1, dup, { dedupe: false });
    expect(kept.places.length).toBe(2);
  });
});
