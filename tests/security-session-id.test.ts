import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidSessionId } from '../src/server/validation';

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

// If any of these are reached, the sessionId guard failed to short-circuit.
// `vi.hoisted` is required because vi.mock factories are hoisted above imports.
const { shouldNotBeCalled } = vi.hoisted(() => ({
  shouldNotBeCalled: vi.fn(() => {
    throw new Error('Firestore/Gemini reached despite invalid sessionId');
  }),
}));

vi.mock('../src/server/firestore-db', () => ({
  getSessionMetadata: shouldNotBeCalled,
  listRecentMessages: shouldNotBeCalled,
  listSessions: shouldNotBeCalled,
  createSession: shouldNotBeCalled,
  appendMessage: shouldNotBeCalled,
  deleteSessionWithMessages: shouldNotBeCalled,
  beginSummary: shouldNotBeCalled,
  completeSummary: shouldNotBeCalled,
  failSummary: shouldNotBeCalled,
  beginActionPlan: shouldNotBeCalled,
  completeActionPlan: shouldNotBeCalled,
  failActionPlan: shouldNotBeCalled,
  updateActionIntelligence: shouldNotBeCalled,
}));

vi.mock('../src/server/gemini', () => ({
  generateReply: shouldNotBeCalled,
  generateSummary: shouldNotBeCalled,
  generateActionIntelligence: shouldNotBeCalled,
}));

import { GET as getSessionHandler, DELETE as deleteSessionHandler } from '../src/app/api/entries/[sessionId]/route';
import { POST as chatHandler } from '../src/app/api/chat/route';
import { POST as summarizeHandler } from '../src/app/api/summarize/route';
import { POST as actionPlanHandler } from '../src/app/api/action-plan/route';

const AUTH = { Authorization: 'Bearer userA-token', 'Content-Type': 'application/json' };

const INVALID_IDS = [
  '',
  'a/b',
  '../session',
  'users/other-uid/journalSessions/x',
  'has space',
  'has.dot',
  'emoji😀',
  'x'.repeat(129),
];

const VALID_IDS = ['abcDEF123', 'a', 'with-hyphen_and_underscore', 'x'.repeat(128)];

describe('FIX 1 — sessionId validation regression suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isValidSessionId accepts strict safe identifiers only', () => {
    for (const id of VALID_IDS) expect(isValidSessionId(id)).toBe(true);
    for (const id of INVALID_IDS) expect(isValidSessionId(id)).toBe(false);
    expect(isValidSessionId(undefined)).toBe(false);
    expect(isValidSessionId(null)).toBe(false);
    expect(isValidSessionId(123 as any)).toBe(false);
  });

  it('GET /api/entries/[sessionId] rejects invalid sessionId with 400', async () => {
    for (const id of INVALID_IDS) {
      const req = new Request('http://localhost/api/entries/x', { headers: AUTH });
      const res = await getSessionHandler(req, { params: { sessionId: id } });
      expect(res.status, `id=${JSON.stringify(id)}`).toBe(400);
    }
  });

  it('DELETE /api/entries/[sessionId] rejects invalid sessionId with 400', async () => {
    for (const id of INVALID_IDS) {
      const req = new Request('http://localhost/api/entries/x', { method: 'DELETE', headers: AUTH });
      const res = await deleteSessionHandler(req, { params: { sessionId: id } });
      expect(res.status, `id=${JSON.stringify(id)}`).toBe(400);
    }
  });

  it('POST /api/chat rejects invalid sessionId with 400', async () => {
    for (const id of INVALID_IDS) {
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: AUTH,
        body: JSON.stringify({ sessionId: id, message: 'hello' }),
      });
      const res = await chatHandler(req);
      expect(res.status, `id=${JSON.stringify(id)}`).toBe(400);
    }
  });

  it('POST /api/summarize rejects invalid sessionId with 400', async () => {
    for (const id of INVALID_IDS) {
      const req = new Request('http://localhost/api/summarize', {
        method: 'POST',
        headers: AUTH,
        body: JSON.stringify({ sessionId: id }),
      });
      const res = await summarizeHandler(req);
      expect(res.status, `id=${JSON.stringify(id)}`).toBe(400);
    }
  });

  it('POST /api/action-plan rejects invalid sessionId with 400', async () => {
    for (const id of INVALID_IDS) {
      const req = new Request('http://localhost/api/action-plan', {
        method: 'POST',
        headers: AUTH,
        body: JSON.stringify({ sessionId: id }),
      });
      const res = await actionPlanHandler(req);
      expect(res.status, `id=${JSON.stringify(id)}`).toBe(400);
    }
  });

  it('authentication is still enforced before sessionId validation', async () => {
    const req = new Request('http://localhost/api/entries/x', {});
    const res = await getSessionHandler(req, { params: { sessionId: 'a/b' } });
    expect(res.status).toBe(401);
  });
});
