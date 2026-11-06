import { describe, expect, test } from 'vitest';
import type { BookingFormValues, SchedulingSettings } from '@/types';
import { DEFAULT_SCHEDULING } from '@/services/defaults';
import {
  cleanMultiline,
  cleanText,
  formatPhone,
  generateConfirmationCode,
  hasErrors,
  initialsOf,
  isValidEmail,
  isValidPhone,
  normalisePhone,
  telHref,
  validateBookingForm,
} from '../validation';

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

function form(overrides: Partial<BookingFormValues> = {}): BookingFormValues {
  return {
    parentName: 'Dana Rivera',
    studentName: 'Sam',
    phone: '786-452-6881',
    email: '',
    subject: '',
    notes: '',
    policyAccepted: true,
    ...overrides,
  };
}

const scheduling: SchedulingSettings = DEFAULT_SCHEDULING;

describe('phone handling', () => {
  test('normalises to digits, keeping a leading +', () => {
    expect(normalisePhone('(786) 452-6881')).toBe('7864526881');
    expect(normalisePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  test('formats 10-digit and 1+10-digit US numbers', () => {
    expect(formatPhone('7864526881')).toBe('(786) 452-6881');
    expect(formatPhone('17864526881')).toBe('(786) 452-6881');
  });

  test('leaves international numbers close to as-typed', () => {
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });

  test('accepts valid numbers and rejects junk', () => {
    expect(isValidPhone('786-452-6881')).toBe(true);
    expect(isValidPhone('+442079460958')).toBe(true);
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('not a phone')).toBe(false);
    expect(isValidPhone('786452688')).toBe(false); // 9 digits
  });

  test('telHref adds a country code to bare US numbers', () => {
    expect(telHref('786-452-6881')).toBe('tel:+17864526881');
    expect(telHref('+442079460958')).toBe('tel:+442079460958');
  });
});

describe('email', () => {
  test('accepts ordinary and unusual-but-real addresses', () => {
    expect(isValidEmail('parent@example.com')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.example.co.uk')).toBe(true);
  });

  test('rejects obvious non-addresses', () => {
    expect(isValidEmail('parent@')).toBe(false);
    expect(isValidEmail('parent at example.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('text cleaning', () => {
  test('cleanText collapses whitespace and removes control characters', () => {
    expect(cleanText(`  Dana${TAB}${NUL}  Rivera  `)).toBe('Dana Rivera');
  });

  test('cleanText flattens newlines', () => {
    expect(cleanText(`Dana${NL}Rivera`)).toBe('Dana Rivera');
  });

  test('cleanMultiline preserves paragraph breaks', () => {
    const input = `First line.${NL}${NL}Second paragraph.`;
    expect(cleanMultiline(input)).toBe(`First line.${NL}${NL}Second paragraph.`);
  });

  test('cleanMultiline normalises CRLF and collapses blank-line runs', () => {
    const input = `A.${CR}${NL}${NL}${NL}${NL}B.`;
    expect(cleanMultiline(input)).toBe(`A.${NL}${NL}B.`);
  });

  test('cleanMultiline strips control characters but keeps newlines', () => {
    expect(cleanMultiline(`A${NUL}B${NL}C`)).toBe(`A B${NL}C`);
  });
});

describe('validateBookingForm', () => {
  test('accepts a complete, valid form', () => {
    expect(hasErrors(validateBookingForm(form(), scheduling))).toBe(false);
  });

  test('requires parent name, student name and phone', () => {
    const errors = validateBookingForm(
      form({ parentName: '', studentName: '', phone: '' }),
      scheduling,
    );
    expect(errors.parentName).toBeTruthy();
    expect(errors.studentName).toBeTruthy();
    expect(errors.phone).toBeTruthy();
  });

  test('requires the policy checkbox', () => {
    const errors = validateBookingForm(form({ policyAccepted: false }), scheduling);
    expect(errors.policyAccepted).toBeTruthy();
  });

  test('leaves email optional by default', () => {
    expect(validateBookingForm(form({ email: '' }), scheduling).email).toBeUndefined();
  });

  test('requires email when the setting demands it', () => {
    const strict = { ...scheduling, requireParentEmail: true };
    expect(validateBookingForm(form({ email: '' }), strict).email).toBeTruthy();
    expect(
      validateBookingForm(form({ email: 'a@b.com' }), strict).email,
    ).toBeUndefined();
  });

  test('rejects a malformed optional email', () => {
    expect(validateBookingForm(form({ email: 'nope' }), scheduling).email).toBeTruthy();
  });

  test('enforces length limits', () => {
    const errors = validateBookingForm(
      form({ notes: 'x'.repeat(801), studentName: 'y'.repeat(81) }),
      scheduling,
    );
    expect(errors.notes).toBeTruthy();
    expect(errors.studentName).toBeTruthy();
  });
});

describe('confirmation codes', () => {
  test('match the expected shape', () => {
    expect(generateConfirmationCode('JW')).toMatch(/^JW-[23456789BCDFGHJKMNPQRSTVWXYZ]{6}$/);
  });

  test('avoid characters that get misheard', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateConfirmationCode('JW')).not.toMatch(/[01OIL]/);
    }
  });

  test('are not trivially repeating', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateConfirmationCode('JW'));
    expect(seen.size).toBeGreaterThan(490);
  });

  test('initialsOf derives a sane prefix', () => {
    expect(initialsOf('John Williams')).toBe('JW');
    expect(initialsOf('  Ada  ')).toBe('A');
    expect(initialsOf('')).toBe('MT');
  });
});
