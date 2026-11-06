const { classify } = require('../utils/tagRules');
const { CATEGORIES } = require('../config/categories');

const idx = (c) => CATEGORIES.indexOf(c);

test('Faisal Mosque style: no tourism tag, found through the name keyword', () => {
  const r = classify({ amenity: 'place_of_worship', religion: 'muslim' }, 'Faisal Mosque');
  expect(r.needsReview).toBe(false);
  expect(r.kind).toBe('mosque');
  expect(r.vector[idx('religious')]).toBe(0.9);
  expect(r.avgVisitDuration).toBe(45);
});

test('wayside shrine tag becomes kind shrine', () => {
  const r = classify({ historic: 'wayside_shrine' }, 'Darbar, Baba Shaheed R.A');
  expect(r.kind).toBe('shrine');
  expect(r.vector[idx('religious')]).toBe(0.9);
  expect(r.avgVisitDuration).toBe(45);
});

test('shrine keyword in the name', () => {
  expect(classify({}, 'Shiait Shrine').kind).toBe('shrine');
});

test('restaurant + viewpoint stays a viewpoint but gets a food entry', () => {
  const r = classify({ amenity: 'restaurant', tourism: 'viewpoint' }, 'Daman-e-Koh');
  expect(r.kind).toBe('viewpoint');
  expect(r.vector[idx('viewpoints')]).toBe(0.9);
  expect(r.vector[idx('food_cafes')]).toBe(0.8);
  expect(r.vector[idx('nature_parks')]).toBe(0.3);
  expect(r.avgVisitDuration).toBe(30);
  expect(r.intensity).toBe(0.2);
});

test('plain restaurant without tourism/wikidata/wikipedia needs review', () => {
  const r = classify({ amenity: 'restaurant' }, 'Some Diner');
  expect(r.needsReview).toBe(true);
  expect(r.reviewReason).toBe('no matching tag or keyword');
});

test('restaurant with wikidata becomes kind restaurant', () => {
  const r = classify({ amenity: 'restaurant', wikidata: 'Q1' }, 'Monal');
  expect(r.kind).toBe('restaurant');
  expect(r.vector[idx('food_cafes')]).toBe(0.8);
  expect(r.avgVisitDuration).toBe(60);
  expect(r.intensity).toBe(0.2);
});

test('reservoir becomes kind lake with waterfront_beach', () => {
  const r = classify({ natural: 'water', water: 'reservoir' }, 'Rawal Lake');
  expect(r.kind).toBe('lake');
  expect(r.vector[idx('waterfront_beach')]).toBe(0.8);
  expect(r.avgVisitDuration).toBe(60);
  expect(r.intensity).toBe(0.3);
});

test('hiking route becomes a trail', () => {
  const r = classify({ route: 'hiking' }, 'Trail 5');
  expect(r.kind).toBe('trail');
  expect(r.vector[idx('outdoor_adventure')]).toBe(0.8);
  expect(r.vector[idx('nature_parks')]).toBe(0.4);
  expect(r.avgVisitDuration).toBe(150);
  expect(r.intensity).toBe(0.9);
});

test('no name needs review', () => {
  expect(classify({ tourism: 'museum' }, undefined)).toEqual({ needsReview: true, reviewReason: 'no name' });
});

test('museum rule still works', () => {
  const r = classify({ tourism: 'museum' }, 'Lok Virsa Museum');
  expect(r.kind).toBe('museum');
  expect(r.vector[idx('museums_art')]).toBe(0.9);
  expect(r.vector[idx('history_heritage')]).toBe(0.3);
  expect(r.avgVisitDuration).toBe(90);
});