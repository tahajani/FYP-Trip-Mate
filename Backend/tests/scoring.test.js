const {
  cosine, userVectorFromInterests, paceCompat, soloScore, poolSize,
} = require('../services/scoring');

test('cosine: identical, orthogonal, zero and null vectors', () => {
  expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  expect(cosine([0, 0], [1, 1])).toBe(0);
  expect(cosine(null, [1, 1])).toBe(0);
});

test('userVectorFromInterests puts 1 at the right index', () => {
  const v = userVectorFromInterests(['viewpoints']);
  expect(v.length).toBe(10);
  expect(v[4]).toBe(1);
  expect(v.reduce((s, x) => s + x, 0)).toBe(1);
});

test('paceCompat', () => {
  expect(paceCompat(0.2, 0.2)).toBeCloseTo(1);
  expect(paceCompat(0.2, 0.9)).toBeCloseTo(0.3);
});

test('soloScore for a viewpoints+relaxed user on Daman-e-Koh style POI', () => {
  const poi = { interestVector: [0, 0, 0, 0.3, 0.9, 0, 0, 0, 0, 0], intensity: 0.2 };
  const user = { interests: ['viewpoints'], pace: 'relaxed' };
  // cosine = 0.9 / sqrt(0.09 + 0.81) = sqrt(0.9); paceCompat = 1
  expect(soloScore(user, poi)).toBeCloseTo(0.75 * Math.sqrt(0.9) + 0.25, 5);
});

test('poolSize', () => {
  expect(poolSize(3, 'moderate', 60)).toBe(12); // k = floor(360/90) = 4
  expect(poolSize(2, 'relaxed', 60)).toBe(6);   // k = floor(270/90) = 3
  expect(poolSize(1, 'fast', 90)).toBe(4);      // k = floor(480/120) = 4
});