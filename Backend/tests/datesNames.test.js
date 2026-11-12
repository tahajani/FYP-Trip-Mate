const { isValidISODate, addDays, daysInclusive, todayISO, validateTripDates } = require('../utils/dates');
const { cleanName, normalizeName } = require('../utils/names');

describe('dates', () => {
  test('isValidISODate accepts real dates only', () => {
    expect(isValidISODate('2026-11-12')).toBe(true);
    expect(isValidISODate('2028-02-29')).toBe(true); // leap year
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('12-11-2026')).toBe(false);
    expect(isValidISODate(null)).toBe(false);
  });

  test('addDays crosses month and year borders', () => {
    expect(addDays('2026-11-12', 0)).toBe('2026-11-12');
    expect(addDays('2026-11-29', 2)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('daysInclusive counts both the first and the last day', () => {
    expect(daysInclusive('2026-11-12', '2026-11-12')).toBe(1);
    expect(daysInclusive('2026-11-12', '2026-11-14')).toBe(3);
    expect(daysInclusive('2026-11-28', '2026-12-02')).toBe(5);
    expect(daysInclusive('2026-11-14', '2026-11-12')).toBe(-1);
  });

  test('validateTripDates returns the number of days or throws a clear error', () => {
    const now = new Date('2026-11-11T10:00:00Z');
    expect(validateTripDates('2026-11-12', '2026-11-14', { now })).toBe(3);
    expect(validateTripDates('2026-11-10', '2026-11-10', { now })).toBe(1); // yesterday (UTC) is tolerated
    expect(() => validateTripDates('2026-11-01', '2026-11-03', { now })).toThrow(/past/);
    expect(() => validateTripDates('2026-11-14', '2026-11-12', { now })).toThrow(/before/);
    expect(() => validateTripDates('2026-11-12', '2026-12-30', { now })).toThrow(/at most 14/);
    expect(() => validateTripDates('nope', '2026-11-12', { now })).toThrow(/startDate/);
    expect(() => validateTripDates('2026-11-12', undefined, { now })).toThrow(/endDate/);
  });

  test('todayISO uses the UTC date', () => {
    expect(todayISO(new Date('2026-11-11T23:30:00Z'))).toBe('2026-11-11');
  });
});

describe('names', () => {
  test('cleanName prefers the Latin part of a name joined with ;', () => {
    expect(cleanName('لوک ورثہ;لوک ورثہ عجائب گھر')).toBe('لوک ورثہ');
    expect(cleanName('لوک ورثہ;Lok Virsa Museum')).toBe('Lok Virsa Museum');
    expect(cleanName('  Faisal Mosque ')).toBe('Faisal Mosque');
    expect(cleanName(';;')).toBe('');
    expect(cleanName(undefined)).toBe('');
  });

  test('normalizeName ignores case and extra spaces', () => {
    expect(normalizeName('The  Centaurus   Mall')).toBe(normalizeName('the centaurus mall'));
  });
});
