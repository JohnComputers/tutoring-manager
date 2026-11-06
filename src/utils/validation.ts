/**
 * Booking-form validation, shared by the public form and the admin reschedule flow.
 *
 * Runs before anything touches Firestore so users get instant, field-level feedback, and
 * is mirrored (in structure and limits) by `firestore.rules` so a crafted request cannot
 * bypass it. Client validation is UX; the rules are the enforcement.
 */

import type { BookingFormValues, SchedulingSettings } from '@/types';

export const LIMITS = {
  parentName: { min: 2, max: 80 },
  studentName: { min: 1, max: 80 },
  phone: { min: 7, max: 20 },
  email: { max: 120 },
  subject: { max: 80 },
  notes: { max: 800 },
  internalNotes: { max: 2000 },
} as const;

export type FieldErrors = Partial<Record<keyof BookingFormValues, string>>;

/* ------------------------------------------------------------------ */
/* Phone                                                               */
/* ------------------------------------------------------------------ */

/** Digits only, with a leading `+` preserved for international numbers. */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/**
 * `"7864526881"` -> `"(786) 452-6881"`.
 *
 * North American numbers get the familiar grouping; anything else is returned close to
 * as-typed, because guessing at foreign grouping rules produces worse output than leaving
 * it alone.
 */
export function formatPhone(raw: string): string {
  const normalised = normalisePhone(raw);
  const digits = normalised.replace(/\D/g, '');

  if (!normalised.startsWith('+') && digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (!normalised.startsWith('+') && digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw.trim();
}

/** A `tel:` href. Strips formatting so the dialler gets clean digits. */
export function telHref(raw: string): string {
  const normalised = normalisePhone(raw);
  if (normalised.startsWith('+')) return `tel:${normalised}`;
  const digits = normalised.replace(/\D/g, '');
  // Assume North America for bare 10-digit numbers so the link works from abroad.
  return digits.length === 10 ? `tel:+1${digits}` : `tel:${digits}`;
}

export function isValidPhone(raw: string): boolean {
  const normalised = normalisePhone(raw);
  const digits = normalised.replace(/\D/g, '');
  if (normalised.startsWith('+')) return digits.length >= 8 && digits.length <= 15;
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits.startsWith('1')) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

/**
 * Deliberately permissive. The only way to truly validate an address is to send to it;
 * an over-strict regex just rejects real people with unusual addresses.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/* ------------------------------------------------------------------ */
/* Text cleaning                                                       */
/* ------------------------------------------------------------------ */

const NEWLINE = String.fromCharCode(10);

/**
 * Strip control characters without a regex literal.
 *
 * A character class covering the C0 range has to contain either literal control bytes
 * or backslash escapes. Literal control bytes do not survive every editor, diff and
 * encoding round trip intact, and the escaped form reads like line noise. Comparing
 * char codes has neither problem.
 */
function stripControlChars(value: string, keepNewline: boolean): string {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isControl = code < 32 || code === 127;
    if (!isControl) out += char;
    else if (keepNewline && code === 10) out += char;
    else out += ' ';
  }
  return out;
}

/** Collapse runs of spaces down to one. */
function collapseSpaces(value: string): string {
  let out = '';
  let previousWasSpace = false;
  for (const char of value) {
    const isSpace = char === ' ';
    if (isSpace && previousWasSpace) continue;
    out += char;
    previousWasSpace = isSpace;
  }
  return out;
}

/** Collapse whitespace and strip control characters before anything is stored. */
export function cleanText(value: string): string {
  return collapseSpaces(stripControlChars(value, false)).trim();
}

/**
 * Same, but keeps newlines so paragraph breaks survive — for the notes textarea.
 * Carriage returns become spaces via stripControlChars and are then trimmed away
 * per line, so CRLF input needs no special handling.
 */
export function cleanMultiline(value: string): string {
  const cleaned = stripControlChars(value, true)
    .split(NEWLINE)
    .map((line) => collapseSpaces(line).trim());

  const out: string[] = [];
  for (const line of cleaned) {
    if (line === '' && out[out.length - 1] === '') continue;
    out.push(line);
  }
  return out.join(NEWLINE).trim();
}

/* ------------------------------------------------------------------ */
/* Booking form                                                        */
/* ------------------------------------------------------------------ */

export function validateBookingForm(
  values: BookingFormValues,
  scheduling: SchedulingSettings,
): FieldErrors {
  const errors: FieldErrors = {};

  const parentName = values.parentName.trim();
  if (!parentName) {
    errors.parentName = 'Please enter the parent or guardian name.';
  } else if (parentName.length < LIMITS.parentName.min) {
    errors.parentName = 'That name looks too short.';
  } else if (parentName.length > LIMITS.parentName.max) {
    errors.parentName = `Please keep this under ${LIMITS.parentName.max} characters.`;
  }

  const studentName = values.studentName.trim();
  if (!studentName) {
    errors.studentName = "Please enter the student's name.";
  } else if (studentName.length > LIMITS.studentName.max) {
    errors.studentName = `Please keep this under ${LIMITS.studentName.max} characters.`;
  }

  const phone = values.phone.trim();
  if (!phone) {
    errors.phone = 'Please enter a phone number.';
  } else if (!isValidPhone(phone)) {
    errors.phone = 'Enter a 10-digit number, or start with + for international.';
  }

  const email = values.email.trim();
  if (email) {
    if (!isValidEmail(email)) errors.email = 'That does not look like a valid email address.';
    else if (email.length > LIMITS.email.max) errors.email = 'That email is too long.';
  } else if (scheduling.requireParentEmail) {
    errors.email = 'An email address is required.';
  }

  if (values.subject.trim().length > LIMITS.subject.max) {
    errors.subject = 'That subject name is too long.';
  }

  if (values.notes.trim().length > LIMITS.notes.max) {
    errors.notes = `Please keep notes under ${LIMITS.notes.max} characters.`;
  }

  if (!values.policyAccepted) {
    errors.policyAccepted = 'Please agree to the policies before booking.';
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/* ------------------------------------------------------------------ */
/* Confirmation codes                                                  */
/* ------------------------------------------------------------------ */

/**
 * Excludes 0/O/1/I/L and vowels: the code gets read aloud over the phone, and it should
 * neither be misheard nor accidentally spell something.
 */
const CODE_ALPHABET = '23456789BCDFGHJKMNPQRSTVWXYZ';

/**
 * A short, human-friendly booking reference, e.g. `"JW-7K2M9Q"`.
 *
 * Deliberately *not* the Firestore document ID. Document IDs are internal addresses; if
 * one is printed on a confirmation page it invites people to try them against the API,
 * and it tells them how the database is shaped. The code is only ever used by a human
 * quoting it back over the phone.
 */
export function generateConfirmationCode(prefix = 'MT'): string {
  const size = 6;
  let out = '';

  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(size);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < size; i += 1) {
      out += CODE_ALPHABET[(bytes[i] as number) % CODE_ALPHABET.length];
    }
  } else {
    for (let i = 0; i < size; i += 1) {
      out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  }

  const safePrefix = prefix.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'MT';
  return `${safePrefix}-${out}`;
}

/** Initials from a name, for the confirmation-code prefix. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'MT';
  const letters = parts
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('');
  return letters.toUpperCase() || 'MT';
}
