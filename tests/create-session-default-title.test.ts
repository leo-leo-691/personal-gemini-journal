import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory stand-in for the user's journalSessions collection.
const { adminDbMock, state, setMock } = vi.hoisted(() => {
  const state = { count: 0, countThrows: false };
  const setMock = vi.fn(async () => {});
  const sessionsRef = {
    // Fake Firestore auto-id: real ids are 20 random chars, so createSession's
    // `id.slice(0, 6)` fallback has real entropy. Keep this long enough that the
    // "count query fails" case reliably produces two distinct titles.
    doc: () => ({
      id: `s${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
      set: setMock,
    }),
    count: () => ({
      get: async () => {
        if (state.countThrows) throw new Error('aggregation unavailable');
        return { data: () => ({ count: state.count }) };
      },
    }),
  };
  const adminDbMock = {
    collection: () => ({ doc: () => ({ collection: () => sessionsRef }) }),
  };
  return { adminDbMock, state, setMock };
});

vi.mock('../src/server/firebase-admin', () => ({ adminDb: adminDbMock }));

import { createSession } from '../src/server/firestore-db';
import { MAX_TITLE_LENGTH } from '../src/server/validation';

beforeEach(() => {
  state.count = 0;
  state.countThrows = false;
  setMock.mockClear();
});

describe('createSession default title', () => {
  it('1: a new session with no title gets a distinguishable default ("Journal 1")', async () => {
    state.count = 0;
    const s = await createSession('userA-uid');
    expect(s.title).toBe('Journal 1');
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Journal 1' }));
  });

  it('2: sessions created in sequence do NOT share the same default title', async () => {
    state.count = 0;
    const s1 = await createSession('userA-uid');
    state.count = 1; // first session now persisted
    const s2 = await createSession('userA-uid');
    state.count = 2;
    const s3 = await createSession('userA-uid');

    expect([s1.title, s2.title, s3.title]).toEqual(['Journal 1', 'Journal 2', 'Journal 3']);
    expect(new Set([s1.title, s2.title, s3.title]).size).toBe(3);
  });

  it('respects an explicit non-empty title (trimmed)', async () => {
    const s = await createSession('userA-uid', '  Timepass  ');
    expect(s.title).toBe('Timepass');
  });

  it('caps an over-long explicit title at MAX_TITLE_LENGTH', async () => {
    const s = await createSession('userA-uid', 'x'.repeat(200));
    expect(s.title.length).toBe(MAX_TITLE_LENGTH);
  });

  it('falls back to a still-distinguishable title if the count query fails', async () => {
    state.countThrows = true;
    const a = await createSession('userA-uid');
    const b = await createSession('userA-uid');
    expect(a.title).toMatch(/^Journal /);
    expect(b.title).toMatch(/^Journal /);
    expect(a.title).not.toBe(b.title); // derived from the unique doc id
  });
});
