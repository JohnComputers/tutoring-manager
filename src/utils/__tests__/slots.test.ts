import { describe, expect, test } from 'vitest';
import type { AvailabilityException, SchedulingSettings, Weekday } from '@/types';
import {
  SLOT_GRAIN_MINUTES,
  generateSlots,
  grainsFor,
  lockIdsFor,
  mergePeriods,
  monthGrid,
  resolvePeriodsForDate,
  summariseDay,
} from '../slots';
import { zonedTimeToUtc } from '../time';

const NY = 'America/New_York';

function scheduling(overrides: Partial<SchedulingSettings> = {}): SchedulingSettings {
  const evening = { enabled: true, periods: [{ start: 18 * 60, end: 20 * 60 }] };
  const weekendDay = { enabled: true, periods: [{ start: 10 * 60, end: 18 * 60 }] };
  return {
    timezone: NY,
    defaultDurationMinutes: 60,
    sessionDurations: [30, 60, 90],
    bufferMinutes: 15,
    minimumNoticeMinutes: 120,
    maximumAdvanceDays: 60,
    weekendsEnabled: true,
    allowSameDayBookings: true,
    requireParentEmail: false,
    studentNotesEnabled: true,
    bookingIntro: '',
    privacyNotice: '',
    weekly: {
      0: weekendDay,
      1: evening,
      2: evening,
      3: evening,
      4: evening,
      5: evening,
      6: weekendDay,
    } as Record<Weekday, { enabled: boolean; periods: { start: number; end: number }[] }>,
    ...overrides,
  } as SchedulingSettings;
}

/** 2026-09-02 is a Wednesday. Reference "now" is well before the evening window. */
const NOW = new Date('2026-09-02T12:00:00Z'); // 08:00 EDT
const WED = '2026-09-02';

describe('mergePeriods', () => {
  test('coalesces overlapping and touching ranges', () => {
    expect(
      mergePeriods([
        { start: 600, end: 700 },
        { start: 680, end: 760 },
        { start: 760, end: 800 },
      ]),
    ).toEqual([{ start: 600, end: 800 }]);
  });

  test('keeps genuinely separate ranges apart and sorts them', () => {
    expect(
      mergePeriods([
        { start: 900, end: 1000 },
        { start: 600, end: 700 },
      ]),
    ).toEqual([
      { start: 600, end: 700 },
      { start: 900, end: 1000 },
    ]);
  });

  test('drops zero-length and inverted ranges', () => {
    expect(mergePeriods([{ start: 600, end: 600 }, { start: 800, end: 700 }])).toEqual([]);
  });
});

describe('grain reservation', () => {
  test('a 60-minute session with a 15-minute buffer reserves 75 minutes of grains', () => {
    const start = zonedTimeToUtc(WED, 18 * 60, NY);
    const end = new Date(start.getTime() + 60 * 60_000);
    const grains = grainsFor(start, end, 15);
    expect(grains).toHaveLength(75 / SLOT_GRAIN_MINUTES);
  });

  test('grains are contiguous and ascending', () => {
    const start = zonedTimeToUtc(WED, 18 * 60, NY);
    const end = new Date(start.getTime() + 90 * 60_000);
    const grains = grainsFor(start, end, 15);
    for (let i = 1; i < grains.length; i += 1) {
      expect(grains[i]).toBe((grains[i - 1] as number) + 1);
    }
  });

  test('lock ids are stable strings', () => {
    const start = zonedTimeToUtc(WED, 18 * 60, NY);
    const end = new Date(start.getTime() + 30 * 60_000);
    const ids = lockIdsFor(start, end, 0);
    expect(ids[0]).toMatch(/^g\d+$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('two sessions at the same instant in different timezones share grains', () => {
    // Grains are absolute, so the *same instant* expressed via a different zone must
    // land on the same grain — otherwise a timezone change could double-book.
    const viaNy = zonedTimeToUtc(WED, 18 * 60, NY);
    const viaUtc = zonedTimeToUtc(WED, 22 * 60, 'UTC'); // same instant in September
    expect(viaNy.getTime()).toBe(viaUtc.getTime());
    expect(grainsFor(viaNy, new Date(viaNy.getTime() + 3_600_000), 0)).toEqual(
      grainsFor(viaUtc, new Date(viaUtc.getTime() + 3_600_000), 0),
    );
  });
});

describe('generateSlots', () => {
  test('fills a 2-hour window with 60-minute sessions', () => {
    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling(),
      exceptions: [],
      occupiedGrains: new Set(),
      durationMinutes: 60,
      now: NOW,
    });
    expect(slots.map((s) => s.label)).toEqual(['6:00 PM', '7:00 PM']);
    expect(slots.every((s) => s.available)).toBe(true);
  });

  test('fills the same window with 30-minute sessions', () => {
    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling(),
      exceptions: [],
      occupiedGrains: new Set(),
      durationMinutes: 30,
      now: NOW,
    });
    expect(slots.map((s) => s.label)).toEqual([
      '6:00 PM',
      '6:30 PM',
      '7:00 PM',
      '7:30 PM',
    ]);
  });

  test('does not offer a session that would overrun the window', () => {
    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling(),
      exceptions: [],
      occupiedGrains: new Set(),
      durationMinutes: 90,
      now: NOW,
    });
    // 6:00-7:30 fits in 18:00-20:00; 7:30-9:00 does not.
    expect(slots.map((s) => s.label)).toEqual(['6:00 PM']);
  });

  test('THE BUFFER RULE: a booking at 6:00 blocks a 7:00 start when the buffer is 15', () => {
    const bookedStart = zonedTimeToUtc(WED, 18 * 60, NY);
    const bookedEnd = new Date(bookedStart.getTime() + 60 * 60_000);
    const occupied = new Set(grainsFor(bookedStart, bookedEnd, 15));

    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling(),
      exceptions: [],
      occupiedGrains: occupied,
      durationMinutes: 60,
      now: NOW,
    });

    const six = slots.find((s) => s.label === '6:00 PM');
    const seven = slots.find((s) => s.label === '7:00 PM');
    expect(six?.available).toBe(false);
    expect(six?.reason).toBe('booked');
    expect(seven?.available).toBe(false);
    expect(seven?.reason).toBe('booked');
  });

  test('with no buffer, a 7:00 start immediately after a 6:00-7:00 booking is allowed', () => {
    const bookedStart = zonedTimeToUtc(WED, 18 * 60, NY);
    const bookedEnd = new Date(bookedStart.getTime() + 60 * 60_000);
    const occupied = new Set(grainsFor(bookedStart, bookedEnd, 0));

    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling({ bufferMinutes: 0 }),
      exceptions: [],
      occupiedGrains: occupied,
      durationMinutes: 60,
      now: NOW,
    });

    expect(slots.find((s) => s.label === '6:00 PM')?.available).toBe(false);
    expect(slots.find((s) => s.label === '7:00 PM')?.available).toBe(true);
  });

  test('OVERLAP, NOT EQUALITY: a 90-minute booking at 6:00 blocks a 30-minute 7:00 start', () => {
    const bookedStart = zonedTimeToUtc(WED, 18 * 60, NY);
    const bookedEnd = new Date(bookedStart.getTime() + 90 * 60_000);
    const occupied = new Set(grainsFor(bookedStart, bookedEnd, 0));

    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling({ bufferMinutes: 0 }),
      exceptions: [],
      occupiedGrains: occupied,
      durationMinutes: 30,
      now: NOW,
    });

    // 6:00-7:30 is taken; a 30-minute slot at 7:00 overlaps it despite a different start.
    expect(slots.find((s) => s.label === '7:00 PM')?.available).toBe(false);
    expect(slots.find((s) => s.label === '7:30 PM')?.available).toBe(true);
  });

  test('a booking ending exactly when a candidate starts still blocks it via buffer', () => {
    // Booking 5:00-6:00 with a 15-minute buffer runs to 6:15, so 6:00 is unavailable.
    const bookedStart = zonedTimeToUtc(WED, 17 * 60, NY);
    const bookedEnd = new Date(bookedStart.getTime() + 60 * 60_000);
    const occupied = new Set(grainsFor(bookedStart, bookedEnd, 15));

    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling(),
      exceptions: [],
      occupiedGrains: occupied,
      durationMinutes: 60,
      now: NOW,
    });
    expect(slots.find((s) => s.label === '6:00 PM')?.available).toBe(false);
  });

  test('respects minimum notice', () => {
    // "Now" is 5:30 PM EDT; a 120-minute notice pushes past the whole 6-8 window.
    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling({ minimumNoticeMinutes: 120 }),
      exceptions: [],
      occupiedGrains: new Set(),
      durationMinutes: 60,
      now: new Date('2026-09-02T21:30:00Z'),
    });
    expect(slots.every((s) => !s.available)).toBe(true);
    expect(slots.map((s) => s.reason)).toEqual(['tooSoon', 'tooSoon']);
  });

  test('blocks same-day bookings when disabled', () => {
    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling({ allowSameDayBookings: false, minimumNoticeMinutes: 0 }),
      exceptions: [],
      occupiedGrains: new Set(),
      durationMinutes: 60,
      now: NOW,
    });
    expect(slots.every((s) => s.reason === 'tooSoon')).toBe(true);
  });

  test('blocks dates beyond the advance window', () => {
    const slots = generateSlots({
      dateKey: '2026-12-02',
      scheduling: scheduling({ maximumAdvanceDays: 30 }),
      exceptions: [],
      occupiedGrains: new Set(),
      durationMinutes: 60,
      now: NOW,
    });
    expect(slots.every((s) => s.reason === 'outsideWindow')).toBe(true);
  });

  test('returns nothing for a weekday with no configured periods', () => {
    const settings = scheduling();
    settings.weekly[3] = { enabled: false, periods: [] };
    expect(
      generateSlots({
        dateKey: WED,
        scheduling: settings,
        exceptions: [],
        occupiedGrains: new Set(),
        durationMinutes: 60,
        now: NOW,
      }),
    ).toEqual([]);
  });

  test('bypassNoticeRules lets an admin reschedule inside the notice period', () => {
    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling({ minimumNoticeMinutes: 10_000 }),
      exceptions: [],
      occupiedGrains: new Set(),
      durationMinutes: 60,
      now: NOW,
      bypassNoticeRules: true,
    });
    expect(slots.every((s) => s.available)).toBe(true);
  });

  test('ignoreGrains frees a booking from blocking its own reschedule', () => {
    const bookedStart = zonedTimeToUtc(WED, 18 * 60, NY);
    const bookedEnd = new Date(bookedStart.getTime() + 60 * 60_000);
    const own = new Set(grainsFor(bookedStart, bookedEnd, 15));

    const slots = generateSlots({
      dateKey: WED,
      scheduling: scheduling(),
      exceptions: [],
      occupiedGrains: own,
      ignoreGrains: own,
      durationMinutes: 60,
      now: NOW,
    });
    expect(slots.find((s) => s.label === '6:00 PM')?.available).toBe(true);
  });

  test('skips start times inside a DST gap', () => {
    // Force an availability window across the 2 AM spring-forward gap.
    const settings = scheduling({ minimumNoticeMinutes: 0 });
    settings.weekly[0] = { enabled: true, periods: [{ start: 60, end: 5 * 60 }] };
    const slots = generateSlots({
      dateKey: '2026-03-08', // a Sunday
      scheduling: settings,
      exceptions: [],
      occupiedGrains: new Set(),
      durationMinutes: 60,
      now: new Date('2026-03-07T00:00:00Z'),
    });
    // 1:00 exists, 2:00 does not, 3:00 and 4:00 do.
    expect(slots.map((s) => s.label)).toEqual(['1:00 AM', '3:00 AM', '4:00 AM']);
  });
});

describe('resolvePeriodsForDate', () => {
  test('blockAll closes the day even when the weekly schedule is open', () => {
    const exception: AvailabilityException = {
      id: 'x1',
      date: WED,
      kind: 'blockAll',
      periods: [],
      reason: 'Competition',
    };
    expect(resolvePeriodsForDate(WED, scheduling(), [exception])).toEqual([]);
  });

  test('replace overrides the weekly schedule', () => {
    const exception: AvailabilityException = {
      id: 'x2',
      date: WED,
      kind: 'replace',
      periods: [{ start: 19 * 60, end: 21 * 60 }],
      reason: 'Late start',
    };
    expect(resolvePeriodsForDate(WED, scheduling(), [exception])).toEqual([
      { start: 19 * 60, end: 21 * 60 },
    ]);
  });

  test('add layers on top of the weekly schedule', () => {
    const exception: AvailabilityException = {
      id: 'x3',
      date: WED,
      kind: 'add',
      periods: [{ start: 12 * 60, end: 14 * 60 }],
      reason: 'Free afternoon',
    };
    expect(resolvePeriodsForDate(WED, scheduling(), [exception])).toEqual([
      { start: 12 * 60, end: 14 * 60 },
      { start: 18 * 60, end: 20 * 60 },
    ]);
  });

  test('add can open a normally-closed weekend day', () => {
    const settings = scheduling({ weekendsEnabled: false });
    const saturday = '2026-09-05';
    const exception: AvailabilityException = {
      id: 'x4',
      date: saturday,
      kind: 'add',
      periods: [{ start: 12 * 60, end: 16 * 60 }],
      reason: 'One-off Saturday',
    };
    expect(resolvePeriodsForDate(saturday, settings, [exception])).toEqual([
      { start: 12 * 60, end: 16 * 60 },
    ]);
  });

  test('blockAll beats replace and add on the same date', () => {
    const exceptions: AvailabilityException[] = [
      { id: 'a', date: WED, kind: 'add', periods: [{ start: 600, end: 700 }], reason: '' },
      { id: 'b', date: WED, kind: 'blockAll', periods: [], reason: '' },
    ];
    expect(resolvePeriodsForDate(WED, scheduling(), exceptions)).toEqual([]);
  });

  test('the weekend master switch closes Saturday and Sunday', () => {
    const settings = scheduling({ weekendsEnabled: false });
    expect(resolvePeriodsForDate('2026-09-05', settings, [])).toEqual([]);
    expect(resolvePeriodsForDate('2026-09-06', settings, [])).toEqual([]);
    expect(resolvePeriodsForDate(WED, settings, []).length).toBeGreaterThan(0);
  });

  test('exceptions on other dates are ignored', () => {
    const exception: AvailabilityException = {
      id: 'x5',
      date: '2026-09-03',
      kind: 'blockAll',
      periods: [],
      reason: '',
    };
    expect(resolvePeriodsForDate(WED, scheduling(), [exception]).length).toBe(1);
  });
});

describe('summariseDay', () => {
  test('flags past, today and beyond-window days', () => {
    const settings = scheduling({ maximumAdvanceDays: 30 });
    expect(summariseDay('2026-09-01', settings, [], NOW).isPast).toBe(true);
    expect(summariseDay(WED, settings, [], NOW).isToday).toBe(true);
    expect(summariseDay('2026-11-01', settings, [], NOW).isBeyondWindow).toBe(true);
  });

  test('a blocked day reports no availability', () => {
    const exception: AvailabilityException = {
      id: 'x6',
      date: '2026-09-03',
      kind: 'blockAll',
      periods: [],
      reason: '',
    };
    expect(
      summariseDay('2026-09-03', scheduling(), [exception], NOW).hasAvailability,
    ).toBe(false);
  });
});

describe('monthGrid', () => {
  test('pads to whole weeks starting Sunday', () => {
    const grid = monthGrid(2026, 9);
    expect(grid.length % 7).toBe(0);
    expect(grid[0]).toBe('2026-08-30'); // the Sunday before September 1
    expect(grid).toContain('2026-09-30');
  });
});
