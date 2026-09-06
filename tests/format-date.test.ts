import { describe, it, expect } from 'vitest';
import { formatDate, parseTimestamp, DATE_UNAVAILABLE } from '../src/lib/format-date';

const INSTANT = '2026-09-06T10:30:00.000Z';
const expected = new Date(INSTANT).toLocaleDateString();

describe('formatDate / parseTimestamp', () => {
  it('D9: formats a normal ISO 8601 string (the standard API serialization)', () => {
    expect(formatDate(INSTANT)).toBe(expected);
  });

  it('D9: formats an epoch-millis number', () => {
    expect(formatDate(new Date(INSTANT).getTime())).toBe(expected);
  });

  it('D5: formats a Firestore Timestamp instance (has toDate())', () => {
    const ts = { toDate: () => new Date(INSTANT) };
    expect(formatDate(ts)).toBe(expected);
  });

  it('D6: formats a serialized Firestore Timestamp ({seconds, nanoseconds})', () => {
    const seconds = Math.floor(new Date(INSTANT).getTime() / 1000);
    expect(formatDate({ seconds, nanoseconds: 0 })).toBe(expected);
  });

  it('D6: formats the Admin-SDK JSON shape ({_seconds, _nanoseconds})', () => {
    const _seconds = Math.floor(new Date(INSTANT).getTime() / 1000);
    expect(formatDate({ _seconds, _nanoseconds: 0 })).toBe(expected);
  });

  it('D7: null / undefined / empty-string never render "Invalid Date"', () => {
    for (const v of [null, undefined, '']) {
      expect(formatDate(v)).toBe(DATE_UNAVAILABLE);
      expect(formatDate(v)).not.toBe('Invalid Date');
    }
  });

  it('D8: malformed / unparseable values never render "Invalid Date"', () => {
    const bad: unknown[] = [
      'not-a-date',
      'undefined',
      {},
      { seconds: 'nope' },
      { toDate: 'not-a-function' },
      { toDate: () => { throw new Error('boom'); } },
      { toDate: () => 'still not a date' },
      NaN,
      Infinity,
      new Date('garbage'),
      [],
      true,
    ];
    for (const v of bad) {
      expect(formatDate(v), `input=${JSON.stringify(v)}`).toBe(DATE_UNAVAILABLE);
      expect(formatDate(v)).not.toBe('Invalid Date');
    }
  });

  it('parseTimestamp returns a valid Date for good input and null for bad input', () => {
    expect(parseTimestamp(INSTANT)).toBeInstanceOf(Date);
    expect((parseTimestamp(INSTANT) as Date).toISOString()).toBe(INSTANT);
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp('nope')).toBeNull();
    expect(parseTimestamp({})).toBeNull();
  });

  it('does not substitute the current date for missing data', () => {
    // A regression guard: the old server/client code fell back to `new Date()`.
    expect(formatDate(undefined)).toBe(DATE_UNAVAILABLE);
    expect(parseTimestamp(undefined)).toBeNull();
  });
});
