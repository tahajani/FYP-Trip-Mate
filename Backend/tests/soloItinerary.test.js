const { generateSoloItinerary } = require('../services/soloItinerary');
const { haversineMatrix } = require('../services/osrm');

const poi = (osmId, lat, lon, extra = {}) => ({
  _id: `id${osmId}`, osmId, name: `P${osmId}`, kind: 'viewpoint',
  interestVector: [0, 0, 0, 0.3, 0.9, 0, 0, 0, 0, 0], intensity: 0.2, avgVisitDuration: 30,
  needsReview: false, location: { coordinates: [lon, lat] }, ...extra,
});
const user = { interests: ['viewpoints', 'nature_parks'], pace: 'relaxed' };

const constMatrix = (minutes, source = 'osrm', warnings = []) => async (pts) => ({
  durationsMin: pts.map((_, i) => pts.map((_, j) => (i === j ? 0 : minutes))),
  distancesKm: pts.map(() => pts.map(() => 0)),
  source,
  warnings,
});
const haversineMock = async (pts) => ({
  ...haversineMatrix(pts, { speedKmh: 30, roadFactor: 1 }), source: 'osrm', warnings: [],
});

test('two far-apart cities become two separate, valid days', async () => {
  const pois = [
    poi(1, 33.70, 73.05), poi(2, 33.71, 73.06), poi(3, 33.72, 73.07),
    poi(4, 31.55, 74.34), poi(5, 31.56, 74.35), poi(6, 31.57, 74.36),
  ];
  const r = await generateSoloItinerary({ user, days: 2, pois }, { getMatrix: haversineMock });
  expect(r.days.length).toBe(2);
  expect(r.travelTimeSource).toBe('osrm');
  expect(r.dropped).toEqual([]);
  expect(r.moved).toEqual([]);
  for (const d of r.days) {
    expect(d.places.length).toBe(3);
    const lats = d.places.map((p) => p.location.lat);
    expect(lats.every((l) => l > 33) || lats.every((l) => l < 32)).toBe(true);
    expect(d.places.map((p) => p.order)).toEqual([1, 2, 3]);
    expect(d.places[0].travelMinutesFromPrevious).toBe(0);
    expect(d.visitMinutes).toBe(90);
    expect(d.travelMinutes).toBeCloseTo(d.places.reduce((s, p) => s + p.travelMinutesFromPrevious, 0), 6);
    expect(d.visitMinutes + d.travelMinutes).toBeLessThanOrEqual(d.capacityMinutes);
  }
});

test('an overflowing day drops the farthest place and says so', async () => {
  // 4 x 30 visit + 3 x 80 travel = 360 > 270; without P4: 90 + 160 = 250
  const pois = [poi(1, 33.0, 73.0), poi(2, 33.3, 73.0), poi(3, 33.6, 73.0), poi(4, 34.0, 73.0)];
  const r = await generateSoloItinerary({ user, days: 1, pois }, { getMatrix: constMatrix(80) });
  expect(r.dropped.length).toBe(1);
  expect(r.dropped[0].name).toBe('P4');
  const day = r.days[0];
  expect(day.places.map((p) => p.name)).not.toContain('P4');
  expect(day.places.length).toBe(3);
  expect(day.visitMinutes).toBe(90);
  expect(day.travelMinutes).toBeCloseTo(160, 6);
  expect(r.warnings.some((w) => w.includes('P4'))).toBe(true);
});

test('fewer places than days leaves some days empty', async () => {
  const r = await generateSoloItinerary({ user, days: 3, pois: [poi(1, 33.7, 73.0)] }, { getMatrix: constMatrix(0) });
  expect(r.days.length).toBe(3);
  expect(r.days[0].places.length).toBe(1);
  expect(r.days[1].places).toEqual([]);
  expect(r.days[2].places).toEqual([]);
  expect(r.warnings.some((w) => /days are empty/.test(w))).toBe(true);
});

test('no usable places gives empty days and a warning', async () => {
  const r = await generateSoloItinerary(
    { user, days: 2, pois: [poi(1, 33.7, 73.0, { needsReview: true })] }, { getMatrix: constMatrix(0) });
  expect(r.days.length).toBe(2);
  expect(r.days.every((d) => d.places.length === 0)).toBe(true);
  expect(r.warnings.some((w) => /No usable places/.test(w))).toBe(true);
  expect(r.travelTimeSource).toBeUndefined();
});

test('invalid input is rejected', async () => {
  await expect(generateSoloItinerary({ user: { interests: ['viewpoints'], pace: 'turbo' }, days: 1, pois: [] }))
    .rejects.toThrow(/pace/);
  await expect(generateSoloItinerary({ user, days: 0, pois: [] })).rejects.toThrow(/days/);
  await expect(generateSoloItinerary({ user: { pace: 'relaxed' }, days: 1, pois: [] })).rejects.toThrow(/interests/);
});

test('OSRM source and warnings are passed through', async () => {
  const getMatrix = constMatrix(5, 'haversine', ['Travel times are estimated']);
  const r = await generateSoloItinerary(
    { user, days: 1, pois: [poi(1, 33.7, 73.0), poi(2, 33.71, 73.0)] }, { getMatrix });
  expect(r.travelTimeSource).toBe('haversine');
  expect(r.warnings).toContain('Travel times are estimated');
});

test('the output has the shape of the Itinerary model', async () => {
  const r = await generateSoloItinerary(
    { user, days: 1, pois: [poi(1, 33.7, 73.0)], regionSlug: 'islamabad', userId: 'u1' }, { getMatrix: constMatrix(0) });
  expect(r.type).toBe('solo');
  expect(r.regionSlug).toBe('islamabad');
  expect(r.dayCount).toBe(1);
  expect(r.participants).toEqual([{ userId: 'u1', interests: user.interests, pace: 'relaxed' }]);
  expect(r.days[0].capacityMinutes).toBe(270);
  const p = r.days[0].places[0];
  expect(p).toMatchObject({
    poiId: 'id1', name: 'P1', kind: 'viewpoint', location: { lat: 33.7, lon: 73.0 }, order: 1,
    visitMinutes: 30, travelMinutesFromPrevious: 0, source: 'solo', selectedFor: null, memberScores: [],
  });
  expect(p.score).toBeCloseTo(0.921, 2);
});