/**
 * Date/time formatting for display.
 *
 * `parseTimestamp`, `formatDate` and `DATE_UNAVAILABLE` are UNCHANGED from the
 * existing implementation — `formatDate` still returns exactly
 * `toLocaleDateString()` output, which the Sidebar tests pin.
 *
 * `formatLongDate` and `formatTime` are additive, built on the same parser, and
 * follow the same rules: they NEVER return "Invalid Date" and NEVER substitute
 * the current date for missing input.
 */
export const DATE_UNAVAILABLE = 'Date unavailable';

export function parseTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // Firestore Timestamp instance
    if (typeof obj.toDate === 'function') {
      try {
        const d = (obj.toDate as () => unknown)();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }

    // Serialized Firestore Timestamp ({seconds,nanoseconds} or {_seconds,_nanoseconds})
    const seconds =
      typeof obj.seconds === 'number'
        ? obj.seconds
        : typeof obj._seconds === 'number'
        ? obj._seconds
        : undefined;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      const nanos =
        typeof obj.nanoseconds === 'number'
          ? obj.nanoseconds
          : typeof obj._nanoseconds === 'number'
          ? obj._nanoseconds
          : 0;
      const d = new Date(seconds * 1000 + Math.floor((Number.isFinite(nanos) ? nanos : 0) / 1e6));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}

/** Localized date (no time). `DATE_UNAVAILABLE` when the value is missing/invalid. */
export function formatDate(value: unknown): string {
  const d = parseTimestamp(value);
  return d ? d.toLocaleDateString() : DATE_UNAVAILABLE;
}

/**
 * Long-form date for the session header metadata line, e.g. "6 Sept 2026".
 *
 * Deliberately NOT the numeric `MM/DD/YYYY` form: the large session heading must
 * contain only the title, and the header must carry exactly one small date.
 */
export function formatLongDate(value: unknown): string {
  const d = parseTimestamp(value);
  if (!d) return DATE_UNAVAILABLE;
  try {
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return DATE_UNAVAILABLE;
  }
}

/** Short local time, e.g. "09:41". Empty string when unavailable. */
export function formatTime(value: unknown): string {
  const d = parseTimestamp(value);
  if (!d) return '';
  try {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
