import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/server/firebase-admin', () => ({ adminDb: {}, adminAuth: {} }));

import { serializeTimestamp } from '../src/server/firestore-db';

describe('serializeTimestamp (server serialization boundary)', () => {
  it('serializes a Firestore Timestamp to an ISO 8601 string', () => {
    const iso = '2026-09-06T10:30:00.000Z';
    expect(serializeTimestamp({ toDate: () => new Date(iso) })).toBe(iso);
  });

  it('returns null for missing / non-Timestamp / malformed values (never the current date)', () => {
    expect(serializeTimestamp(undefined)).toBeNull();
    expect(serializeTimestamp(null)).toBeNull();
    expect(serializeTimestamp('2026-09-06T10:30:00Z')).toBeNull(); // a plain string is not a Timestamp
    expect(serializeTimestamp(1_757_154_600_000)).toBeNull();
    expect(serializeTimestamp({})).toBeNull();
    expect(serializeTimestamp({ toDate: 'not-a-function' })).toBeNull();
    expect(serializeTimestamp({ toDate: () => { throw new Error('boom'); } })).toBeNull();
    expect(serializeTimestamp({ toDate: () => 'still not a date' })).toBeNull();
    expect(serializeTimestamp({ toDate: () => new Date('garbage') })).toBeNull();
  });
});
