import { describe, expect, test } from 'vitest';
import {
  addDays,
  daysBetween,
  formatMinutes,
  isValidDateKey,
  minutesOfDayIn,
  parseTimeInput,
  timeZoneOffsetMs,
  toDateKey,
  toTimeInputValue,
  wallTimeExists,
  weekdayOf,
  zonedTimeToUtc,
} from '../time';

const NY = 'America/New_York';

describe('timeZoneOffsetMs', () => {
  test('is -5h in New York during standard time', () => {
    // 2026-01-15T12:00:00Z
    const offset = timeZoneOffsetMs(new Date('2026-01-15T12:00:00Z'), NY);
    expect(offset).toBe(-5 * 60 * 60 * 1000);
  });

  test('is -4h in New York during daylight saving time', () => {
    const offset = timeZoneOffsetMs(new Date('2026-07-15T12:00:00Z'), NY);
    expect(offset).toBe(-4 * 60 * 60 * 1000);
  });

  test('is 0 for UTC', () => {
    expect(timeZoneOffsetMs(new Date('2026-07-15T12:00:00Z'), 'UTC')).toBe(0);
  });
});

describe('zonedTimeToUtc', () => {
  test('maps a winter evening to the right instant', () => {
    // 6:00 PM EST == 23:00 UTC
    const instant = zonedTimeToUtc('2026-01-15', 18 * 60, NY);
    expect(instant.toISOString()).toBe('2026-01-15T23:00:00.000Z');
  });

  test('maps a summer evening to the right instant', () => {
    // 6:00 PM EDT == 22:00 UTC
    const instant = zonedTimeToUtc('2026-07-15', 18 * 60, NY);
    expect(instant.toISOString()).toBe('2026-07-15T22:00:00.000Z');
  });

  test('round-trips through toDateKey and minutesOfDayIn', () => {
    for (const key of ['2026-01-15', '2026-03-08', '2026-07-04', '2026-11-01']) {
      for (const minutes of [0, 9 * 60 + 30, 13 * 60, 18 * 60, 23 * 60 + 55]) {
        if (!wallTimeExists(key, minutes, NY)) continue;
        const instant = zonedTimeToUtc(key, minutes, NY);
        expect(toDateKey(instant, NY)).toBe(key);
        expect(minutesOfDayIn(instant, NY)).toBe(minutes);
      }
    }
  });

  test('handles the spring-forward day either side of the gap', () => {
    // 2026-03-08: New York jumps 02:00 -> 03:00.
    const before = zonedTimeToUtc('2026-03-08', 60, NY); // 01:00 EST
    expect(before.toISOString()).toBe('2026-03-08T06:00:00.000Z');

    const after = zonedTimeToUtc('2026-03-08', 3 * 60, NY); // 03:00 EDT
    expect(after.toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });

  test('an evening slot is unaffected by a same-day DST shift', () => {
    // 6:00 PM on the spring-forward day is EDT, so 22:00 UTC, not 23:00.
    const instant = zonedTimeToUtc('2026-03-08', 18 * 60, NY);
    expect(instant.toISOString()).toBe('2026-03-08T22:00:00.000Z');
    expect(minutesOfDayIn(instant, NY)).toBe(18 * 60);
  });

  test('handles the fall-back day', () => {
    // 2026-11-01: New York falls back 02:00 -> 01:00.
    const instant = zonedTimeToUtc('2026-11-01', 18 * 60, NY); // 6 PM EST
    expect(instant.toISOString()).toBe('2026-11-01T23:00:00.000Z');
    expect(minutesOfDayIn(instant, NY)).toBe(18 * 60);
  });
});

describe('wallTimeExists', () => {
  test('rejects times inside the spring-forward gap', () => {
    expect(wallTimeExists('2026-03-08', 2 * 60, NY)).toBe(false);
    expect(wallTimeExists('2026-03-08', 2 * 60 + 30, NY)).toBe(false);
  });

  test('accepts times either side of the gap', () => {
    expect(wallTimeExists('2026-03-08', 60, NY)).toBe(true);
    expect(wallTimeExists('2026-03-08', 3 * 60, NY)).toBe(true);
    expect(wallTimeExists('2026-03-08', 18 * 60, NY)).toBe(true);
  });

  test('accepts ordinary days', () => {
    expect(wallTimeExists('2026-06-15', 2 * 60 + 30, NY)).toBe(true);
  });
});

describe('date key helpers', () => {
  test('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29'); // leap year
  });

  test('daysBetween is signed', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7);
    expect(daysBetween('2026-09-08', '2026-09-01')).toBe(-7);
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0);
  });

  test('daysBetween is unaffected by DST-length days', () => {
    // The week containing spring-forward has a 23-hour day.
    expect(daysBetween('2026-03-05', '2026-03-12')).toBe(7);
  });

  test('weekdayOf matches the real calendar', () => {
    expect(weekdayOf('2026-09-02')).toBe(3); // Wednesday
    expect(weekdayOf('2026-08-24')).toBe(1); // Monday
  });

  test('isValidDateKey rejects impossible dates', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-2-01')).toBe(false);
    expect(isValidDateKey('2026-02-28')).toBe(true);
  });
});

describe('minute formatting', () => {
  test('formatMinutes uses 12-hour clock with AM/PM', () => {
    expect(formatMinutes(0)).toBe('12:00 AM');
    expect(formatMinutes(12 * 60)).toBe('12:00 PM');
    expect(formatMinutes(18 * 60 + 30)).toBe('6:30 PM');
    expect(formatMinutes(9 * 60 + 5)).toBe('9:05 AM');
  });

  test('parseTimeInput round-trips with toTimeInputValue', () => {
    for (const minutes of [0, 545, 1110, 1439]) {
      expect(parseTimeInput(toTimeInputValue(minutes))).toBe(minutes);
    }
  });

  test('parseTimeInput rejects nonsense', () => {
    expect(parseTimeInput('25:00')).toBeNull();
    expect(parseTimeInput('12:60')).toBeNull();
    expect(parseTimeInput('noon')).toBeNull();
  });
});
