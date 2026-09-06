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

// Lease window mirrors ACTION_PLAN_LEASE_MS in src/server/firestore-db.ts.
const LEASE_MS = 5 * 60 * 1000;

// Stateful in-memory session store that mirrors the real timestamped-lease
// semantics of beginActionPlan / completeActionPlan / failActionPlan. The
// check-and-set in `beginActionPlan` runs synchronously (no await points),
// modelling the atomicity that a Firestore transaction provides in production.
const store: Record<string, any> = {};

vi.mock('../src/server/firestore-db', () => ({
  getSessionMetadata: vi.fn(async (uid: string, sessionId: string) => {
    const s = store[sessionId];
    return s && s.uid === uid ? s : null;
  }),
  listRecentMessages: vi.fn(async () => [
    { messageId: 'm1', role: 'user', text: 'hi', ts: new Date().toISOString() },
  ]),
  beginActionPlan: vi.fn(async (uid: string, sessionId: string) => {
    const s = store[sessionId];
    if (!s || s.uid !== uid) throw new Error('Session not found');
    const now = Date.now();
    if (s.actionPlanInProgress) {
      const startedMs = typeof s.actionPlanStartedAt === 'number' ? s.actionPlanStartedAt : null;
      const leaseActive = startedMs !== null && now - startedMs < LEASE_MS;
      if (leaseActive) return false;
      // stale / missing timestamp -> fall through and reclaim atomically
    }
    s.actionPlanInProgress = true;
    s.actionPlanStartedAt = now;
    return true;
  }),
  completeActionPlan: vi.fn(async (uid: string, sessionId: string, data: any) => {
    const s = store[sessionId];
    if (s) {
      s.actionIntelligence = data;
      s.actionPlanInProgress = false;
      s.actionPlanStartedAt = null;
    }
  }),
  failActionPlan: vi.fn(async (uid: string, sessionId: string) => {
    const s = store[sessionId];
    if (s) {
      s.actionPlanInProgress = false;
      s.actionPlanStartedAt = null;
    }
  }),
}));

const { generateActionIntelligence } = vi.hoisted(() => ({
  generateActionIntelligence: vi.fn(async () => ({
    keyIdeas: ['k'],
    insights: ['i'],
    actionItems: ['a'],
    suggestedNextStep: 's',
    actionPlan: 'p',
  })),
}));

vi.mock('../src/server/gemini', () => ({ generateActionIntelligence }));

import { POST as actionPlanHandler } from '../src/app/api/action-plan/route';
import { __resetRateLimitStore } from '../src/server/rate-limit';

const AUTH = { Authorization: 'Bearer userA-token', 'Content-Type': 'application/json' };

function makeReq(sessionId: string) {
  return new Request('http://localhost/api/action-plan', {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({ sessionId }),
  });
}

describe('FIX 3 (Phase 3) — action-plan timestamped lease', () => {
  beforeEach(() => {
    __resetRateLimitStore(); // isolate each case from the per-user rate limiter
    for (const k of Object.keys(store)) delete store[k];
    store['sessionA'] = {
      sessionId: 'sessionA',
      uid: 'userA-uid',
      summary: 'sum',
      actionPlanInProgress: false,
      actionPlanStartedAt: null,
    };
    generateActionIntelligence.mockClear();
  });

  // A
  it('fresh lease -> 409 and Gemini is NOT called', async () => {
    store['sessionA'].actionPlanInProgress = true;
    store['sessionA'].actionPlanStartedAt = Date.now(); // brand new lease

    const res = await actionPlanHandler(makeReq('sessionA'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.inProgress).toBe(true);
    expect(generateActionIntelligence).not.toHaveBeenCalled();
  });

  // B
  it('stale lease -> request reclaims the lease and proceeds', async () => {
    store['sessionA'].actionPlanInProgress = true;
    store['sessionA'].actionPlanStartedAt = Date.now() - (LEASE_MS + 60_000); // 6 min old

    const res = await actionPlanHandler(makeReq('sessionA'));
    expect(res.status).toBe(200);
    expect(generateActionIntelligence).toHaveBeenCalledTimes(1);
    // lease refreshed then cleared on success
    expect(store['sessionA'].actionPlanInProgress).toBe(false);
    expect(store['sessionA'].actionPlanStartedAt).toBeNull();
  });

  it('in-progress flag with NO timestamp is treated as stale and reclaimable', async () => {
    store['sessionA'].actionPlanInProgress = true;
    store['sessionA'].actionPlanStartedAt = null;

    const res = await actionPlanHandler(makeReq('sessionA'));
    expect(res.status).toBe(200);
    expect(generateActionIntelligence).toHaveBeenCalledTimes(1);
  });

  // C
  it('successful generation -> lease is cleared', async () => {
    const res = await actionPlanHandler(makeReq('sessionA'));
    expect(res.status).toBe(200);
    expect(store['sessionA'].actionPlanInProgress).toBe(false);
    expect(store['sessionA'].actionPlanStartedAt).toBeNull();

    const res2 = await actionPlanHandler(makeReq('sessionA'));
    expect(res2.status).toBe(200);
  });

  // D
  it('Gemini failure -> lease is cleared, session not wedged', async () => {
    generateActionIntelligence.mockRejectedValueOnce(new Error('gemini boom'));

    const res = await actionPlanHandler(makeReq('sessionA'));
    expect(res.status).toBe(500);
    expect(store['sessionA'].actionPlanInProgress).toBe(false);
    expect(store['sessionA'].actionPlanStartedAt).toBeNull();

    const res2 = await actionPlanHandler(makeReq('sessionA'));
    expect(res2.status).toBe(200);
  });

  // E
  it('two concurrent requests -> only one acquires the lease and calls Gemini', async () => {
    const [a, b] = await Promise.all([
      actionPlanHandler(makeReq('sessionA')),
      actionPlanHandler(makeReq('sessionA')),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(generateActionIntelligence).toHaveBeenCalledTimes(1);
  });

  // F
  it('stale-lease recovery is atomic: concurrent reclaimers -> exactly one wins', async () => {
    store['sessionA'].actionPlanInProgress = true;
    store['sessionA'].actionPlanStartedAt = Date.now() - (LEASE_MS + 60_000); // stale

    const [a, b] = await Promise.all([
      actionPlanHandler(makeReq('sessionA')),
      actionPlanHandler(makeReq('sessionA')),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(generateActionIntelligence).toHaveBeenCalledTimes(1);
  });
});
