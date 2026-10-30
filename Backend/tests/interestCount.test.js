const { soloScore } = require('../services/scoring');
const { CATEGORIES } = require('../config/categories');

const vec = (map) => CATEGORIES.map((c) => map[c] || 0);

const POIS = {
  mosque: { interestVector: vec({ religious: 0.9, history_heritage: 0.4 }), intensity: 0.3 },
  museum: { interestVector: vec({ museums_art: 0.9, history_heritage: 0.3 }), intensity: 0.3 },
  fort: { interestVector: vec({ history_heritage: 0.9 }), intensity: 0.5 },
  zoo: { interestVector: vec({ family_entertainment: 0.7 }), intensity: 0.5 },
  viewpoint: { interestVector: vec({ viewpoints: 0.9, nature_parks: 0.3 }), intensity: 0.2 },
  trail: { interestVector: vec({ outdoor_adventure: 0.8, nature_parks: 0.4 }), intensity: 0.9 },
  market: { interestVector: vec({ shopping_markets: 0.8 }), intensity: 0.4 },
  park: { interestVector: vec({ nature_parks: 0.8 }), intensity: 0.3 },
};

test('more selected interests lower the score of the same single-category place', () => {
  const others = CATEGORIES.filter((c) => c !== 'history_heritage');
  const interestsOf = (n) => ['history_heritage', ...others.slice(0, n - 1)];
  const fortScore = (n) => soloScore({ interests: interestsOf(n), pace: 'moderate' }, POIS.fort);

  expect(fortScore(1)).toBeCloseTo(1.0, 3);
  expect(fortScore(2)).toBeCloseTo(0.7803, 3);
  expect(fortScore(5)).toBeCloseTo(0.5854, 3);
  expect(fortScore(10)).toBeCloseTo(0.4872, 3);
});

test('all 10 interests, moderate pace: scores sit in a narrow band', () => {
  const s = (poi) => soloScore({ interests: CATEGORIES, pace: 'moderate' }, poi);

  expect(s(POIS.mosque)).toBeCloseTo(0.513, 3);
  expect(s(POIS.museum)).toBeCloseTo(0.5, 3);
  expect(s(POIS.fort)).toBeCloseTo(0.487, 3);
  expect(s(POIS.zoo)).toBeCloseTo(0.487, 3);
  expect(s(POIS.viewpoint)).toBeCloseTo(0.475, 3);
  expect(s(POIS.trail)).toBeCloseTo(0.468, 3);
  expect(s(POIS.market)).toBeCloseTo(0.462, 3);
  expect(s(POIS.park)).toBeCloseTo(0.437, 3);

  const all = Object.values(POIS).map(s);
  expect(Math.max(...all) - Math.min(...all)).toBeLessThan(0.1);
});