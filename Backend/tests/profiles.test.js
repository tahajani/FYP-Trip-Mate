const { soloScore, poolSize } = require('../services/scoring');

// Hand-made POIs: viewpoint (low intensity), park, trail (high intensity)
const viewpoint = { interestVector: [0, 0, 0, 0.3, 0.9, 0, 0, 0, 0, 0], intensity: 0.2 };
const park = { interestVector: [0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0], intensity: 0.3 };
const trail = { interestVector: [0, 0, 0, 0.4, 0, 0, 0, 0.8, 0, 0], intensity: 0.9 };

const interests = ['nature_parks', 'outdoor_adventure', 'viewpoints'];
const score = (pace, poi) => soloScore({ interests, pace }, poi);

test('same interests, relaxed vs fast: the order flips', () => {
  expect(score('relaxed', viewpoint)).toBeCloseTo(0.7977, 3);
  expect(score('relaxed', park)).toBeCloseTo(0.658, 3);
  expect(score('relaxed', trail)).toBeCloseTo(0.6559, 3);
  expect(score('relaxed', viewpoint)).toBeGreaterThan(score('relaxed', trail));

  expect(score('fast', trail)).toBeCloseTo(0.8059, 3);
  expect(score('fast', viewpoint)).toBeCloseTo(0.6477, 3);
  expect(score('fast', park)).toBeCloseTo(0.558, 3);
  expect(score('fast', trail)).toBeGreaterThan(score('fast', viewpoint));
});

test('interest with no matching place: score comes from pace only', () => {
  const food = (pace, poi) => soloScore({ interests: ['food_cafes'], pace }, poi);
  expect(food('relaxed', viewpoint)).toBeCloseTo(0.25, 5);
  expect(food('relaxed', trail)).toBeCloseTo(0.075, 5);
  expect(food('fast', trail)).toBeCloseTo(0.225, 5);
});

test('pace changes the pool size', () => {
  expect(poolSize(2, 'relaxed', 30)).toBe(8);
  expect(poolSize(2, 'moderate', 30)).toBe(12);
  expect(poolSize(2, 'fast', 30)).toBe(16);
});