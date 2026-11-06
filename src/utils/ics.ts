/**
 * Minimal iCalendar (RFC 5545) generation for the "Add to calendar" button.
 *
 * Times are written in UTC with a trailing `Z`, which every calendar client understands
 * and which sidesteps shipping a VTIMEZONE block — the instant is unambiguous, and the
 * client renders it in the reader's own zone.
 */

const CRLF = '\r\n';

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** `2026-09-02T22:00:00Z` -> `20260902T220000Z`. */
function toIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Escape per RFC 5545: backslash first (so later escapes are not re-escaped), then
 * semicolons, commas, and newlines.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold lines to 75 octets, as the spec requires. Some clients genuinely reject longer
 * lines, and a description with a policy reminder in it overruns easily.
 */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(` ${rest}`);
  return chunks.join(CRLF);
}

export interface CalendarEventInput {
  title: string;
  description: string;
  start: Date;
  end: Date;
  location?: string;
  /** Stable identifier; the booking's confirmation code works well. */
  uid: string;
}

export function buildIcs(event: CalendarEventInput): string {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Math Tutoring//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}@math-tutoring`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Tutoring session in 1 hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(fold).join(CRLF) + CRLF;
}

/**
 * Trigger a download of the .ics file.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking before
 * the browser has started the download cancels it in some versions of Safari.
 */
export function downloadIcs(event: CalendarEventInput, filename = 'tutoring-session.ics'): void {
  const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
