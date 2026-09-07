import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks -----------------------------------------------------------------

vi.mock('../src/server/firebase-admin', () => ({
  verifyIdToken: vi.fn(async (req: Request) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = new Error('Missing or invalid Authorization header');
      (err as any).name = 'AuthError';
      (err as any).statusCode = 401;
      throw err;
    }
    return 'userA-uid';
  }),
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(msg: string, code = 401) {
      super(msg);
      this.name = 'AuthError';
      this.statusCode = code;
    }
  },
}));

// Lease window mirrors SUMMARY_LEASE_MS in src/server/firestore-db.ts.
const LEASE_MS = 5 * 60 * 1000;

// Stateful in-memory session store that mirrors the real timestamped-lease
// semantics of beginSummary / completeSummary / failSummary. The check-and-set
// in `beginSummary` runs synchronously (no await points), modelling the
// atomicity a Firestore transaction provides in production.
const store: Record<string, any> = {};

vi.mock('../src/server/firestore-db', () => ({
  listRecentMessages: vi.fn(async () => [
    { messageId: 'm1', role: 'user', text: 'hi', ts: new Date().toISOString() },
  ]),
  beginSummary: vi.fn(async (uid: string, sessionId: string) => {
    const s = store[sessionId];
    if (!s || s.uid !== uid) throw new Error('Session not found');
    const now = Date.now();
    if (s.summaryInProgress) {
      const startedMs = typeof s.summaryStartedAt === 'number' ? s.summaryStartedAt : null;
      const leaseActive = startedMs !== null && now - startedMs < LEASE_MS;
      if (leaseActive) return false;
      // stale / missing timestamp -> fall through and reclaim atomically
    }
    s.summaryInProgress = true;
    s.summaryStartedAt = now;
    return true;
  }),
  completeSummary: vi.fn(async (uid: string, sessionId: string, summary: string) => {
    const s = store[sessionId];
    if (s) {
      s.summary = summary;
      s.summaryInProgress = false;
      s.summaryStartedAt = null;
    }
  }),
  failSummary: vi.fn(async (uid: string, sessionId: string) => {
    const s = store[sessionId];
    if (s) {
      s.summaryInProgress = false;
      s.summaryStartedAt = null;
    }
  }),
}));

const { generateSummary } = vi.hoisted(() => ({
  generateSummary: vi.fn(async () => 'A complete reflective summary of the session.'),
}));
vi.mock('../src/server/gemini', () => ({ generateSummary }));

import { POST as summarizeHandler } from '../src/app/api/summarize/route';
import { __resetRateLimitStore } from '../src/server/rate-limit';

const AUTH = { Authorization: 'Bearer userA-token', 'Content-Type': 'application/json' };

function makeReq(sessionId: string) {
  return new Request('http://localhost/api/summarize', {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({ sessionId }),
  });
}

describe('Summary generation — timestamped self-healing lease', () => {
  beforeEach(() => {
    __resetRateLimitStore();
    for (const k of Object.keys(store)) delete store[k];
    store['sessionA'] = {
      sessionId: 'sessionA',
      uid: 'userA-uid',
      summaryInProgress: false,
      summaryStartedAt: null,
    };
    generateSummary.mockClear();
  });

  // A — initial acquisition
  it('acquires the lease on the first request and produces a summary', async () => {
    const res = await summarizeHandler(makeReq('sessionA'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: 'A complete reflective summary of the session.' });
    expect(generateSummary).toHaveBeenCalledTimes(1);
    expect(store['sessionA'].summaryInProgress).toBe(false);
    expect(store['sessionA'].summaryStartedAt).toBeNull();
  });

  // B — fresh lease blocks duplicate
  it('a fresh lease returns 409 and Gemini is NOT called', async () => {
    store['sessionA'].summaryInProgress = true;
    store['sessionA'].summaryStartedAt = Date.now();

    const res = await summarizeHandler(makeReq('sessionA'));
    expect(res.status).toBe(409);
    expect((await res.json()).inProgress).toBe(true);
    expect(generateSummary).not.toHaveBeenCalled();
  });

  // stale-timestamp reclaim
  it('a stale lease is reclaimed and the request proceeds', async () => {
    store['sessionA'].summaryInProgress = true;
    store['sessionA'].summaryStartedAt = Date.now() - (LEASE_MS + 60_000);

    const res = await summarizeHandler(makeReq('sessionA'));
    expect(res.status).toBe(200);
    expect(generateSummary).toHaveBeenCalledTimes(1);
    expect(store['sessionA'].summaryInProgress).toBe(false);
    expect(store['sessionA'].summaryStartedAt).toBeNull();
  });

  it('an in-progress flag with NO timestamp (legacy record) is treated as stale and reclaimable', async () => {
    store['sessionA'].summaryInProgress = true;
    store['sessionA'].summaryStartedAt = null;

    const res = await summarizeHandler(makeReq('sessionA'));
    expect(res.status).toBe(200);
    expect(generateSummary).toHaveBeenCalledTimes(1);
  });

  // C — completion releases the lease
  it('successful completion releases the lease so a later request succeeds', async () => {
    const res1 = await summarizeHandler(makeReq('sessionA'));
    expect(res1.status).toBe(200);
    expect(store['sessionA'].summaryInProgress).toBe(false);
    expect(store['sessionA'].summaryStartedAt).toBeNull();

    const res2 = await summarizeHandler(makeReq('sessionA'));
    expect(res2.status).toBe(200);
  });

  // D — failure releases the lease
  it('a failed generation releases the lease, session not wedged', async () => {
    generateSummary.mockRejectedValueOnce(new Error('gemini boom'));

    const res = await summarizeHandler(makeReq('sessionA'));
    expect(res.status).toBe(500);
    expect(store['sessionA'].summaryInProgress).toBe(false);
    expect(store['sessionA'].summaryStartedAt).toBeNull();

    const res2 = await summarizeHandler(makeReq('sessionA'));
    expect(res2.status).toBe(200);
  });

  // E — concurrent acquisition is atomic
  it('two concurrent requests -> only one acquires the lease and calls Gemini', async () => {
    const [a, b] = await Promise.all([
      summarizeHandler(makeReq('sessionA')),
      summarizeHandler(makeReq('sessionA')),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(generateSummary).toHaveBeenCalledTimes(1);
  });

  // F — stale-lease recovery is atomic under concurrency
  it('concurrent reclaimers of a stale lease -> exactly one wins', async () => {
    store['sessionA'].summaryInProgress = true;
    store['sessionA'].summaryStartedAt = Date.now() - (LEASE_MS + 60_000);

    const [a, b] = await Promise.all([
      summarizeHandler(makeReq('sessionA')),
      summarizeHandler(makeReq('sessionA')),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(generateSummary).toHaveBeenCalledTimes(1);
  });
});
