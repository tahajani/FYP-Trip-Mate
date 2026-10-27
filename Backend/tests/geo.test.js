const { haversineKm } = require('../utils/geo');

test('same point has zero distance', () => {
  expect(haversineKm(33.7, 73.0, 33.7, 73.0)).toBe(0);
});

test('1 degree of latitude is about 111.19 km', () => {
  expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1);
});