/**
 * Availability algorithm and the reservation-grain scheme.
 *
 * ## Why grains
 *
 * Two bookings collide when their time intervals overlap — not when they share a start
 * time. A 90-minute session at 6:00 and a 60-minute session at 6:30 have different
 * starts and still cannot both happen. Comparing start times (the obvious bug) would
 * happily double-book them.
 *
 * So instead of reserving "the 6pm slot", a booking reserves every fixed-width *grain*
 * of the timeline it touches, buffer included. Two bookings conflict exactly when their
 * grain sets intersect, which is what makes the check both correct for arbitrary
 * durations and expressible as a set of Firestore document IDs — and a document ID is
 * something Firestore can make atomic. See `services/bookings.ts`.
 *
 * Grain indices are absolute (floor of UTC epoch-minutes), so they are immune to
 * timezone and DST changes: the same wall-clock hour before and after a DST shift maps
 * to different grains, which is correct, because they are different instants.
 */

import type {
  AvailabilityException,
  AvailabilityPeriod,
  IsoDate,
  MinutesOfDay,
  SchedulingSettings,
  TimeSlot,
  Weekday,
} from '@/types';
import {
  MINUTES_PER_DAY,
  addDays,
  daysBetween,
  formatMinutes,
  minutesOfDayIn,
  todayDateKey,
  wallTimeExists,
  weekdayOf,
  zonedTimeToUtc,
} from './time';

/** Width of one reservation grain, in minutes. */
export const SLOT_GRAIN_MINUTES = 5;

/**
 * Hard ceiling on grains a single booking may reserve (24h). Guards against a malformed
 * duration turning one booking into a transaction larger than Firestore's 500-write cap.
 */
export const MAX_LOCKS_PER_BOOKING = MINUTES_PER_DAY / SLOT_GRAIN_MINUTES;

/** Normalize overnight weekly windows into adjacent local dates without fixed UTC offsets. */
export function normalizeWeekly(weekly: SchedulingSettings['weekly']): SchedulingSettings['weekly'] {
  const out=Object.fromEntries([0,1,2,3,4,5,6].map(d=>[d,{enabled:weekly[d as Weekday]?.enabled??false,periods:[]}])) as unknown as SchedulingSettings['weekly'];
  for(let day=0;day<7;day++){
    const original=weekly[day as Weekday];if(!original?.enabled)continue;
    for(const p of original.periods){
      if(!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.start>=1440||p.end<0||p.end>1440||p.start===p.end)throw new Error('Choose distinct start and end times between midnight and 24:00.');
      if(p.end>p.start)out[day as Weekday].periods.push({...p});
      else{
        out[day as Weekday].periods.push({start:p.start,end:1440});
        if(p.end>0){const next=((day+1)%7) as Weekday;out[next].enabled=true;out[next].periods.push({start:0,end:p.end});}
      }
    }
  }
  for(const day of [0,1,2,3,4,5,6])out[day as Weekday].periods=mergePeriods(out[day as Weekday].periods);
  return out;
}

const MS_PER_MINUTE = 60_000;

/* ------------------------------------------------------------------ */
/* Grain arithmetic                                                    */
/* ------------------------------------------------------------------ */

/** Absolute grain index containing an instant. */
export function grainOf(instant: Date): number {
  return Math.floor(instant.getTime() / MS_PER_MINUTE / SLOT_GRAIN_MINUTES);
}

/** Firestore document ID for a grain. */
export function grainDocId(grain: number): string {
  return `g${grain}`;
}

export function grainFromDocId(id: string): number {
  return Number(id.slice(1));
}

/**
 * Grains occupied by a session, rounded *outward* so partial grains are fully reserved.
 *
 * The occupied interval is `[start, end + buffer)`: a session protects the gap after
 * itself. Applying the buffer on one side only is deliberate — reserving it on both
 * sides would force a 2x buffer gap between consecutive sessions, since each booking
 * would claim the same gap independently.
 */
export function grainRange(
  start: Date,
  end: Date,
  bufferMinutes: number,
): { first: number; last: number } {
  const firstGrain = Math.floor(start.getTime() / MS_PER_MINUTE / SLOT_GRAIN_MINUTES);
  const endWithBufferMs = end.getTime() + bufferMinutes * MS_PER_MINUTE;
  // Exclusive end -> the last *occupied* grain is the one before the boundary.
  const lastGrain =
    Math.ceil(endWithBufferMs / MS_PER_MINUTE / SLOT_GRAIN_MINUTES) - 1;
  return { first: firstGrain, last: Math.max(firstGrain, lastGrain) };
}

/** Every grain index a session occupies, buffer included. */
export function grainsFor(start: Date, end: Date, bufferMinutes: number): number[] {
  const { first, last } = grainRange(start, end, bufferMinutes);
  const count = last - first + 1;
  if (count > MAX_LOCKS_PER_BOOKING) {
    throw new Error(
      `Session spans ${count} grains, above the ${MAX_LOCKS_PER_BOOKING} limit. ` +
        'Check the session duration and buffer settings.',
    );
  }
  const out: number[] = [];
  for (let g = first; g <= last; g += 1) out.push(g);
  return out;
}

export function lockIdsFor(start: Date, end: Date, bufferMinutes: number): string[] {
  return grainsFor(start, end, bufferMinutes).map(grainDocId);
}

/** Inclusive grain bounds covering a whole calendar day in `timeZone`, plus slack. */
export function dayGrainBounds(
  dateKey: IsoDate,
  timeZone: string,
  bufferMinutes: number,
): { first: number; last: number } {
  // Widen by a day on each side: a booking on the previous evening can extend its buffer
  // into this day, and a late slot's buffer can spill into the next.
  const start = zonedTimeToUtc(addDays(dateKey, -1), 0, timeZone);
  const end = zonedTimeToUtc(addDays(dateKey, 2), 0, timeZone);
  return {
    first: grainOf(start),
    last: grainOf(new Date(end.getTime() + bufferMinutes * MS_PER_MINUTE)),
  };
}

/* ------------------------------------------------------------------ */
/* Availability periods                                                */
/* ------------------------------------------------------------------ */

/** Sort and coalesce touching/overlapping periods so slot stepping never double-counts. */
export function mergePeriods(periods: AvailabilityPeriod[]): AvailabilityPeriod[] {
  const valid = periods
    .filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start)
    .map((p) => ({
      start: Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(p.start))),
      end: Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(p.end))),
    }))
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start - b.start);

  const merged: AvailabilityPeriod[] = [];
  for (const period of valid) {
    const last = merged[merged.length - 1];
    if (last && period.start <= last.end) {
      last.end = Math.max(last.end, period.end);
    } else {
      merged.push({ ...period });
    }
  }
  return merged;
}

/**
 * The availability windows that actually apply on a date, after exceptions.
 *
 * Precedence, strongest first:
 *   1. any `blockAll`  -> the day is closed, full stop
 *   2. any `replace`   -> the weekly schedule is discarded for this date
 *   3. `add`           -> layered on top of whatever survived
 */
export function resolvePeriodsForDate(
  dateKey: IsoDate,
  scheduling: SchedulingSettings,
  exceptions: AvailabilityException[],
): AvailabilityPeriod[] {
  const relevant = exceptions.filter((e) => e.date === dateKey);

  if (relevant.some((e) => e.kind === 'blockAll')) return [];

  const weekday = weekdayOf(dateKey);
  const isWeekend = weekday === 0 || weekday === 6;

  let base: AvailabilityPeriod[];
  const replacements = relevant.filter((e) => e.kind === 'replace');
  if (replacements.length > 0) {
    base = replacements.flatMap((e) => e.periods);
  } else if (!scheduling.weekendsEnabled && isWeekend) {
    base = [];
  } else {
    const day = scheduling.weekly[weekday as Weekday];
    base = day?.enabled ? day.periods : [];
  }

  const additions = relevant.filter((e) => e.kind === 'add').flatMap((e) => e.periods);
  let periods = mergePeriods([...base, ...additions]);
  for (const block of relevant.filter(e=>e.kind==='subtract').flatMap(e=>e.periods)) {
    periods = periods.flatMap(p=>block.end<=p.start||block.start>=p.end?[p]:[
      ...(block.start>p.start?[{start:p.start,end:block.start}]:[]),
      ...(block.end<p.end?[{start:block.end,end:p.end}]:[]),
    ]);
  }
  return mergePeriods(periods);
}

/* ------------------------------------------------------------------ */
/* Slot generation                                                     */
/* ------------------------------------------------------------------ */

export interface SlotGenerationInput {
  dateKey: IsoDate;
  scheduling: SchedulingSettings;
  exceptions: AvailabilityException[];
  /** Grains already reserved by confirmed bookings. */
  occupiedGrains: ReadonlySet<number>;
  durationMinutes: number;
  /** Injectable for tests; defaults to the real clock. */
  now?: Date;
  /**
   * Grains belonging to a booking being rescheduled, which should not block itself.
   */
  ignoreGrains?: ReadonlySet<number>;
  /**
   * When true, notice/same-day/advance-window limits are skipped. The admin reschedules
   * around the tutor's real life, not the public booking policy — but conflict checks
   * still apply.
   */
  bypassNoticeRules?: boolean;
}

/**
 * Produce every candidate start time for a date, each tagged available or not.
 *
 * Unavailable slots are returned rather than dropped so the UI can render them as
 * visibly disabled — that reads as "taken", where an absent button reads as "broken".
 */
export function generateSlots(input: SlotGenerationInput): TimeSlot[] {
  const {
    dateKey,
    scheduling,
    exceptions,
    occupiedGrains,
    durationMinutes,
    now = new Date(),
    ignoreGrains,
    bypassNoticeRules = false,
  } = input;

  const timeZone = scheduling.timezone;
  const duration = Math.round(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const periods = resolvePeriodsForDate(dateKey, scheduling, exceptions);
  if (periods.length === 0) return [];

  const todayKey = todayDateKey(timeZone, now);
  const daysOut = daysBetween(todayKey, dateKey);

  // Whole-day rejections. Still generate the slots so the UI can explain *why* the day
  // is empty rather than showing a blank panel.
  let dayReason: TimeSlot['reason'] = null;
  if (!bypassNoticeRules) {
    if (daysOut < 0) dayReason = 'past';
    else if (daysOut > scheduling.maximumAdvanceDays) dayReason = 'outsideWindow';
    else if (daysOut === 0 && !scheduling.allowSameDayBookings) dayReason = 'tooSoon';
  }

  const noticeCutoffMs = bypassNoticeRules
    ? now.getTime()
    : now.getTime() + scheduling.minimumNoticeMinutes * MS_PER_MINUTE;

  const step = Math.max(SLOT_GRAIN_MINUTES, duration);
  const slots: TimeSlot[] = [];
  const seen = new Set<MinutesOfDay>();

  for (const period of periods) {
    for (let minute = period.start; minute + duration <= period.end; minute += step) {
      if (seen.has(minute)) continue;
      // A start time that does not exist locally (spring-forward gap) is not offered:
      // booking it would silently move the session by an hour.
      if (!wallTimeExists(dateKey, minute, timeZone)) continue;
      seen.add(minute);

      const start = zonedTimeToUtc(dateKey, minute, timeZone);
      const end = new Date(start.getTime() + duration * MS_PER_MINUTE);

      let reason: TimeSlot['reason'] = dayReason;

      if (!reason && !bypassNoticeRules && start.getTime() < noticeCutoffMs) {
        reason = start.getTime() <= now.getTime() ? 'past' : 'tooSoon';
      }

      if (!reason) {
        const { first, last } = grainRange(start, end, scheduling.bufferMinutes);
        for (let g = first; g <= last; g += 1) {
          if (occupiedGrains.has(g) && !ignoreGrains?.has(g)) {
            reason = 'booked';
            break;
          }
        }
      }

      slots.push({
        start,
        end,
        minutesOfDay: minute,
        label: formatMinutes(minute),
        available: reason === null,
        reason,
      });
    }
  }

  return slots.sort((a, b) => a.minutesOfDay - b.minutesOfDay);
}

/* ------------------------------------------------------------------ */
/* Calendar helpers                                                    */
/* ------------------------------------------------------------------ */

export interface DayAvailabilitySummary {
  dateKey: IsoDate;
  /** Inside the bookable window and has at least one configured period. */
  hasAvailability: boolean;
  isPast: boolean;
  isToday: boolean;
  isBeyondWindow: boolean;
}

/**
 * Cheap per-day summary for the calendar grid.
 *
 * Deliberately does *not* consult bookings: that would mean loading a month of
 * reservations to grey out a handful of dots, and the time-slot panel already reports
 * the exact truth once a date is picked.
 */
export function summariseDay(
  dateKey: IsoDate,
  scheduling: SchedulingSettings,
  exceptions: AvailabilityException[],
  now: Date = new Date(),
): DayAvailabilitySummary {
  const todayKey = todayDateKey(scheduling.timezone, now);
  const daysOut = daysBetween(todayKey, dateKey);
  const periods = resolvePeriodsForDate(dateKey, scheduling, exceptions);

  const isPast = daysOut < 0;
  const isToday = daysOut === 0;
  const isBeyondWindow = daysOut > scheduling.maximumAdvanceDays;
  const sameDayBlocked = isToday && !scheduling.allowSameDayBookings;

  return {
    dateKey,
    hasAvailability:
      periods.length > 0 && !isPast && !isBeyondWindow && !sameDayBlocked,
    isPast,
    isToday,
    isBeyondWindow,
  };
}

/** Date keys for a calendar month grid, padded to whole weeks starting Sunday. */
export function monthGrid(year: number, month: number): IsoDate[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const leading = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;

  const keys: IsoDate[] = [];
  for (let i = 0; i < total; i += 1) {
    const cell = new Date(Date.UTC(year, month - 1, 1 - leading + i));
    keys.push(
      `${cell.getUTCFullYear()}-${String(cell.getUTCMonth() + 1).padStart(2, '0')}-${String(
        cell.getUTCDate(),
      ).padStart(2, '0')}`,
    );
  }
  return keys;
}

/** Minutes-of-day of an instant, for admin views that show a booking's local time. */
export function localMinutes(instant: Date, timeZone: string): MinutesOfDay {
  return minutesOfDayIn(instant, timeZone);
}
