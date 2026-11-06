/**
 * Timezone-aware date/time helpers built on `Intl.DateTimeFormat`.
 *
 * Everything the scheduler reasons about is either
 *   - an *instant* (a JS `Date`, i.e. a point on the UTC timeline), or
 *   - a *wall-clock* value in the site's IANA timezone (an `IsoDate` + minutes-of-day).
 *
 * Converting between the two must go through this module. We deliberately never use
 * fixed UTC offsets: `America/New_York` is -05:00 in January and -04:00 in July, and a
 * hard-coded offset silently shifts every booking by an hour twice a year.
 */

import type { IsoDate, MinutesOfDay, Weekday } from '@/types';

export const MINUTES_PER_DAY = 1440;

/* ------------------------------------------------------------------ */
/* Formatter cache                                                     */
/* ------------------------------------------------------------------ */

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

/** Decompose an instant into its wall-clock representation in `timeZone`. */
export function getWallClock(instant: Date, timeZone: string): WallClock {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }
  // `hourCycle: 'h23'` should never yield 24, but some older engines do at midnight.
  const hour = Number(lookup.hour ?? '0') % 24;
  return {
    year: Number(lookup.year ?? '1970'),
    month: Number(lookup.month ?? '1'),
    day: Number(lookup.day ?? '1'),
    hour,
    minute: Number(lookup.minute ?? '0'),
    second: Number(lookup.second ?? '0'),
  };
}

/**
 * Offset of `timeZone` from UTC at a given instant, in milliseconds.
 * Positive east of Greenwich (Berlin in summer -> +7_200_000).
 */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const wall = getWallClock(instant, timeZone);
  const asIfUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  // `asIfUtc` is built from whole seconds; drop sub-second noise from the instant too.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/* ------------------------------------------------------------------ */
/* Date keys (`YYYY-MM-DD` in the site timezone)                       */
/* ------------------------------------------------------------------ */

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

export function makeDateKey(year: number, month: number, day: number): IsoDate {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export interface ParsedDateKey {
  year: number;
  month: number;
  day: number;
}

/** Parse `YYYY-MM-DD`. Throws on malformed input so callers fail loudly, not silently. */
export function parseDateKey(key: IsoDate): ParsedDateKey {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid date key: ${key}`);
  }
  return { year, month, day };
}

export function isValidDateKey(key: string): boolean {
  try {
    const { year, month, day } = parseDateKey(key);
    // Reject 2026-02-31 and friends by round-tripping through Date.UTC.
    const probe = new Date(Date.UTC(year, month - 1, day));
    return (
      probe.getUTCFullYear() === year &&
      probe.getUTCMonth() === month - 1 &&
      probe.getUTCDate() === day
    );
  } catch {
    return false;
  }
}

/** The calendar date an instant falls on, in `timeZone`. */
export function toDateKey(instant: Date, timeZone: string): IsoDate {
  const wall = getWallClock(instant, timeZone);
  return makeDateKey(wall.year, wall.month, wall.day);
}

/** Today's date in the site timezone — not the browser's. */
export function todayDateKey(timeZone: string, now: Date = new Date()): IsoDate {
  return toDateKey(now, timeZone);
}

/** Shift a date key by whole days. Timezone-independent: pure calendar arithmetic. */
export function addDays(key: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseDateKey(key);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return makeDateKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  const msA = Date.UTC(a.year, a.month - 1, a.day);
  const msB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((msB - msA) / 86_400_000);
}

/**
 * Weekday of a date key. Uses UTC arithmetic on the *calendar* values, which is
 * timezone-independent — 2026-09-02 is a Wednesday everywhere.
 */
export function weekdayOf(key: IsoDate): Weekday {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday;
}

/* ------------------------------------------------------------------ */
/* Wall clock <-> instant                                              */
/* ------------------------------------------------------------------ */

/**
 * Convert a wall-clock time in `timeZone` to the corresponding instant.
 *
 * Two-pass fixed point: guess by treating the wall time as UTC, correct by the offset
 * at that guess, then re-check the offset at the corrected instant. The second pass is
 * what makes DST transitions come out right.
 */
export function zonedTimeToUtc(
  key: IsoDate,
  minutesOfDay: MinutesOfDay,
  timeZone: string,
): Date {
  const { year, month, day } = parseDateKey(key);
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;

  // Note: `hour` may exceed 23 for minutesOfDay >= 1440 (a period ending at midnight).
  // Date.UTC handles the overflow by rolling into the next day, which is what we want.
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  const firstOffset = timeZoneOffsetMs(new Date(naive), timeZone);
  let instant = naive - firstOffset;

  const secondOffset = timeZoneOffsetMs(new Date(instant), timeZone);
  if (secondOffset !== firstOffset) {
    instant = naive - secondOffset;
  }
  return new Date(instant);
}

/**
 * True when the given wall-clock time actually exists in `timeZone`.
 *
 * During a spring-forward transition, local clocks jump (in New York, 02:00 -> 03:00 on
 * the second Sunday of March), so 02:30 does not exist that day. `zonedTimeToUtc` still
 * returns a deterministic instant for it, but that instant's wall time is *not* the one
 * asked for. Slot generation drops such times rather than quietly moving a session.
 */
export function wallTimeExists(
  key: IsoDate,
  minutesOfDay: MinutesOfDay,
  timeZone: string,
): boolean {
  if (minutesOfDay >= MINUTES_PER_DAY) return true; // end-of-day sentinel, never a start
  const instant = zonedTimeToUtc(key, minutesOfDay, timeZone);
  const wall = getWallClock(instant, timeZone);
  const { year, month, day } = parseDateKey(key);
  return (
    wall.year === year &&
    wall.month === month &&
    wall.day === day &&
    wall.hour * 60 + wall.minute === minutesOfDay
  );
}

/** Minutes from midnight for an instant, in `timeZone`. */
export function minutesOfDayIn(instant: Date, timeZone: string): MinutesOfDay {
  const wall = getWallClock(instant, timeZone);
  return wall.hour * 60 + wall.minute;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** `1110` -> `"6:30 PM"`. Pure function of the number; no timezone involved. */
export function formatMinutes(minutes: MinutesOfDay): string {
  const normalised = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(normalised / 60);
  const minute = normalised % 60;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad2(minute)} ${suffix}`;
}

/** `"18:30"` -> `1110`. Returns `null` for anything malformed. */
export function parseTimeInput(value: string): MinutesOfDay | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** `1110` -> `"18:30"`, the value format for `<input type="time">`. */
export function toTimeInputValue(minutes: MinutesOfDay): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minutes)));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

const longDateCache = new Map<string, Intl.DateTimeFormat>();

function longDateFormatter(timeZone: string, weekday: boolean): Intl.DateTimeFormat {
  const cacheKey = `${timeZone}|${weekday}`;
  let fmt = longDateCache.get(cacheKey);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', // we feed it a UTC-midnight instant built from the calendar values
      ...(weekday ? { weekday: 'long' as const } : {}),
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    longDateCache.set(cacheKey, fmt);
  }
  return fmt;
}

/**
 * `"2026-09-02"` -> `"Wednesday, September 2, 2026"`.
 *
 * The key already *is* the local calendar date, so we render it from a UTC-midnight
 * instant. Formatting it in the site timezone instead would risk rolling backwards a day
 * for zones west of UTC.
 */
export function formatDateKey(key: IsoDate, withWeekday = true): string {
  const { year, month, day } = parseDateKey(key);
  const instant = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return longDateFormatter('UTC', withWeekday).format(instant);
}

/** `"2026-09-02"` -> `"Sep 2"`. */
export function formatDateKeyShort(key: IsoDate): string {
  const { year, month, day } = parseDateKey(key);
  const instant = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(instant);
}

/** Render an instant as a time in the site timezone, e.g. `"6:00 PM"`. */
export function formatInstantTime(instant: Date, timeZone: string): string {
  return formatMinutes(minutesOfDayIn(instant, timeZone));
}

/** Render an instant as `"Wed, Sep 2 · 6:00 PM"` in the site timezone. */
export function formatInstantFull(instant: Date, timeZone: string): string {
  const key = toDateKey(instant, timeZone);
  const { year, month, day } = parseDateKey(key);
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  return `${dateLabel} · ${formatInstantTime(instant, timeZone)}`;
}

/**
 * Short timezone label for the current date, e.g. `"EDT"`. Recomputed per instant so it
 * flips correctly across a DST boundary.
 */
export function timeZoneAbbreviation(timeZone: string, instant: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(instant);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** Whether the runtime recognises an IANA identifier. Used to validate admin input. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The visitor's own IANA zone, for the "times shown in ..." hint. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Weekday names indexed 0-6, matching the `Weekday` type. */
export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export function weekdayLabel(day: Weekday): string {
  return WEEKDAY_LABELS[day] ?? 'Unknown';
}
