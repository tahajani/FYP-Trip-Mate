// Adjust the require paths if your tests live somewhere other than backend/tests
jest.mock('../services/osrm', () => ({ getDurationMatrix: jest.fn() }));
const { getDurationMatrix } = require('../services/osrm');
const { recomputeDays } = require('../services/itineraryEdit');

const place = (name, lat, lon, extra = {}) => ({ name, kind: 'park', location: { lat, lon }, visitMinutes: 60, ...extra });
const existing = [
  { day: 1, capacityMinutes: 270, places: [] },
  { day: 2, capacityMinutes: 270, places: [] },
];

beforeEach(() => getDurationMatrix.mockReset());

test('uses OSRM legs, numbers the places and totals the day', async () => {
  getDurationMatrix.mockResolvedValue({
    durationsMin: [[0, 5, 9], [5, 0, 4], [9, 4, 0]],
    source: 'osrm',
    warnings: [],
  });
  const incoming = [
    { day: 1, places: [place('A', 33.7, 73.0), place('B', 33.71, 73.01), place('C', 33.72, 73.02)] },
    { day: 2, places: [] },
  ];
  const r = await recomputeDays(existing, incoming);
  const d1 = r.days[0];
  expect(d1.places.map((p) => p.order)).toEqual([1, 2, 3]);
  expect(d1.places.map((p) => p.travelMinutesFromPrevious)).toEqual([0, 5, 4]);
  expect(d1.visitMinutes).toBe(180);
  expect(d1.travelMinutes).toBe(9);
  expect(r.source).toBe('osrm');
  expect(r.warnings).toEqual([]);
});

test('falls back to a straight-line estimate when OSRM fails', async () => {
  getDurationMatrix.mockRejectedValue(new Error('network down'));
  const incoming = [
    { day: 1, places: [place('A', 33.7, 73.0), place('B', 33.75, 73.05)] },
    { day: 2, places: [] },
  ];
  const r = await recomputeDays(existing, incoming);
  expect(r.source).toBe('haversine');
  expect(r.days[0].places[1].travelMinutesFromPrevious).toBeGreaterThan(0);
  expect(r.warnings.join(' ')).toMatch(/estimated/);
});

test('warns, but does not throw, when a day goes over capacity', async () => {
  getDurationMatrix.mockResolvedValue({ durationsMin: [[0, 10], [10, 0]], source: 'osrm', warnings: [] });
  const long = (n) => place(n, 33.7, 73.0, { visitMinutes: 150 });
  const r = await recomputeDays(existing, [{ day: 1, places: [long('A'), long('B')] }, { day: 2, places: [] }]);
  expect(r.days[0].visitMinutes + r.days[0].travelMinutes).toBe(310);
  expect(r.warnings.join(' ')).toMatch(/Day 1/);
});

test('a place added by the user has no poiId and source manual; existing places keep theirs', async () => {
  getDurationMatrix.mockResolvedValue({ durationsMin: [[0, 3], [3, 0]], source: 'osrm', warnings: [] });
  const id = 'a'.repeat(24);
  const r = await recomputeDays(existing, [
    { day: 1, places: [place('Seeded', 33.7, 73.0, { poiId: id, source: 'solo', score: 0.9 }), place('Added', 33.71, 73.01)] },
    { day: 2, places: [] },
  ]);
  const [a, b] = r.days[0].places;
  expect(a.poiId).toBe(id);
  expect(a.source).toBe('solo');
  expect(b.poiId).toBeUndefined();
  expect(b.source).toBe('manual');
});

test('the date of a day and the matched interests of a place survive an edit', async () => {
  getDurationMatrix.mockResolvedValue({ durationsMin: [[0, 3], [3, 0]], source: 'osrm', warnings: [] });
  const dated = [
    { day: 1, date: '2026-11-12', capacityMinutes: 270, places: [] },
    { day: 2, date: '2026-11-13', capacityMinutes: 270, places: [] },
  ];
  const r = await recomputeDays(dated, [
    { day: 1, places: [place('A', 33.7, 73.0, { matched: ['museums_art'] }), place('B', 33.71, 73.01)] },
    { day: 2, places: [] },
  ]);
  expect(r.days.map((d) => d.date)).toEqual(['2026-11-12', '2026-11-13']);
  expect(r.days[0].places[0].matched).toEqual(['museums_art']);
  expect(r.days[0].places[1].matched).toEqual([]);
});

test('rejects bad input', async () => {
  await expect(recomputeDays(existing, 'x')).rejects.toThrow(/array/);
  await expect(recomputeDays(existing, [{ day: 1, places: [] }])).rejects.toThrow(/tadaad/);
  await expect(
    recomputeDays(existing, [{ day: 1, places: [place('Bad', 999, 73)] }, { day: 2, places: [] }])
  ).rejects.toThrow(/location/);
  await expect(
    recomputeDays(existing, [{ day: 1, places: [{ name: '', location: { lat: 1, lon: 1 } }] }, { day: 2, places: [] }])
  ).rejects.toThrow(/name/);
  await expect(
    recomputeDays(existing, [{ day: 1, places: [] }, { day: 9, places: [] }])
  ).rejects.toThrow(/maujood/);
  const many = Array.from({ length: 21 }, (_, i) => place('P' + i, 33.7, 73.0));
  await expect(recomputeDays(existing, [{ day: 1, places: many }, { day: 2, places: [] }])).rejects.toThrow(/20/);
});
