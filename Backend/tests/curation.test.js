const { curate } = require('../utils/curation');

const ok = (kind) => ({ kind, vector: [], avgVisitDuration: 60, intensity: 0.3, needsReview: false });
const base = { osmType: 'node', osmId: 1 };
const REVIEW = (reason) => ({ needsReview: true, reviewReason: reason });

test('an already flagged result passes through untouched', () => {
  const r = { needsReview: true, reviewReason: 'no name' };
  expect(curate({ ...base, result: r, tags: {}, name: undefined })).toBe(r);
});

test('excludeNames ignores case, edge spaces and repeated spaces', () => {
  const r = curate({
    ...base,
    result: ok('viewpoint'),
    tags: { tourism: 'viewpoint' },
    name: ' Muhammadi  Colony ',
    overrides: { excludeNames: ['muhammadi colony'] },
  });
  expect(r).toEqual(REVIEW('manual exclude'));
});

test('excludeIds works by type/id', () => {
  const r = curate({
    osmType: 'node', osmId: 5, result: ok('viewpoint'), tags: {}, name: 'X Point',
    overrides: { excludeIds: ['node/5'] },
  });
  expect(r).toEqual(REVIEW('manual exclude'));
});

test('generic names are excluded', () => {
  expect(curate({ ...base, result: ok('monument'), tags: {}, name: 'Monument' })).toEqual(REVIEW('generic name'));
  expect(curate({ ...base, result: ok('fort'), tags: {}, name: 'HAVELI' })).toEqual(REVIEW('generic name'));
});

test('excludeCities uses the English or default city tag', () => {
  const overrides = { excludeCities: ['rawalpindi'] };
  expect(
    curate({ ...base, result: ok('viewpoint'), tags: { 'addr:city:en': 'Rawalpindi' }, name: 'Some Point', overrides })
  ).toEqual(REVIEW('outside region (city tag)'));
  const kept = ok('viewpoint');
  expect(
    curate({ ...base, result: kept, tags: { 'addr:city:en': 'Islamabad' }, name: 'Some Point', overrides })
  ).toBe(kept);
});

test('a park without any notability sign is excluded', () => {
  expect(curate({ ...base, result: ok('park'), tags: { leisure: 'park' }, name: 'Sector Park' })).toEqual(
    REVIEW('not notable')
  );
});

test('a park is kept with wikidata, tourism, includeNames or landmarkNames', () => {
  const run = (tags, overrides) => {
    const kept = ok('park');
    expect(curate({ ...base, result: kept, tags, name: 'Fatima Jinnah Park', overrides })).toBe(kept);
  };
  run({ wikidata: 'Q1' });
  run({ tourism: 'attraction' });
  run({}, { includeNames: ['fatima jinnah park'] });
  run({}, { landmarkNames: ['Fatima Jinnah Park'] });
});

test('markets: mall is kept, plain marketplace is excluded', () => {
  const mall = ok('market');
  expect(curate({ ...base, result: mall, tags: { shop: 'mall' }, name: 'Some Mall' })).toBe(mall);
  expect(curate({ ...base, result: ok('market'), tags: { amenity: 'marketplace' }, name: 'Shoe Market' })).toEqual(
    REVIEW('not notable')
  );
});

test('other kinds are not filtered unless notableKinds says so', () => {
  const v = ok('viewpoint');
  expect(curate({ ...base, result: v, tags: { tourism: 'viewpoint' }, name: 'Some Viewpoint Spot' })).toBe(v);
  expect(
    curate({
      ...base, result: ok('viewpoint'), tags: {}, name: 'Some Viewpoint Spot',
      overrides: { notableKinds: ['viewpoint'] },
    })
  ).toEqual(REVIEW('not notable'));
});