import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for Firebase Admin SDK
vi.mock('../src/server/firebase-admin', () => ({
  verifyIdToken: vi.fn(async (req: Request, options?: { checkRevoked?: boolean }) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = new Error('Missing or invalid Authorization header');
      (err as any).name = 'AuthError';
      (err as any).statusCode = 401;
      throw err;
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (token === 'invalid-token') {
      const err = new Error('Invalid authentication token');
      (err as any).name = 'AuthError';
      (err as any).statusCode = 401;
      throw err;
    }

    if (token === 'revoked-token' && options?.checkRevoked) {
      const err = new Error('Token has been revoked');
      (err as any).name = 'AuthError';
      (err as any).statusCode = 401;
      throw err;
    }

    if (token === 'userA-token') return 'userA-uid';
    if (token === 'userB-token') return 'userB-uid';

    const err = new Error('Unauthorized');
    (err as any).name = 'AuthError';
    (err as any).statusCode = 401;
    throw err;
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

// Mocks for Firestore Data Layer
const mockSessions: Record<string, any> = {
  'session-userA': {
    sessionId: 'session-userA',
    uid: 'userA-uid',
    title: 'User A Journal',
    summary: 'A summary',
    summaryInProgress: false,
  },
};

vi.mock('../src/server/firestore-db', () => ({
  createSession: vi.fn(async (uid: string, title?: string) => ({
    sessionId: `session-${Date.now()}`,
    title: title || 'Untitled Journal Session',
    createdAt: new Date().toISOString(),
  })),
  listSessions: vi.fn(async (uid: string) => {
    return Object.values(mockSessions).filter((s) => s.uid === uid);
  }),
  getSessionMetadata: vi.fn(async (uid: string, sessionId: string) => {
    const session = mockSessions[sessionId];
    if (session && session.uid === uid) return session;
    return null;
  }),
  listRecentMessages: vi.fn(async (uid: string, sessionId: string) => {
    const session = mockSessions[sessionId];
    if (session && session.uid === uid) {
      return [{ messageId: 'msg-1', role: 'user', text: 'Hello', ts: new Date().toISOString() }];
    }
    return [];
  }),
  appendMessage: vi.fn(async (uid: string, sessionId: string, role: string, text: string) => ({
    messageId: 'msg-new',
    role,
    text,
    ts: new Date().toISOString(),
  })),
  deleteSessionWithMessages: vi.fn(async (uid: string, sessionId: string) => {
    const session = mockSessions[sessionId];
    if (session && session.uid === uid) {
      delete mockSessions[sessionId];
      return true; // Removes session AND subcollection
    }
    return false;
  }),
  beginSummary: vi.fn(async (uid: string, sessionId: string) => {
    const session = mockSessions[sessionId];
    if (!session || session.uid !== uid) throw new Error('Session not found');
    if (session.summaryInProgress) return false; // Duplicate guard triggered
    session.summaryInProgress = true;
    return true;
  }),
  completeSummary: vi.fn(async (uid: string, sessionId: string, summary: string) => {
    if (mockSessions[sessionId]) {
      mockSessions[sessionId].summary = summary;
      mockSessions[sessionId].summaryInProgress = false;
    }
  }),
  failSummary: vi.fn(async (uid: string, sessionId: string) => {
    if (mockSessions[sessionId]) {
      mockSessions[sessionId].summaryInProgress = false;
    }
  }),
  updateActionIntelligence: vi.fn(async () => {}),
}));

// Mocks for Gemini AI
vi.mock('../src/server/gemini', () => ({
  generateReply: vi.fn(async () => 'Model reply'),
  generateSummary: vi.fn(async () => 'Generated summary'),
  generateActionIntelligence: vi.fn(async () => ({
    keyIdeas: ['Idea 1'],
    insights: ['Insight 1'],
    actionItems: ['Task 1'],
    suggestedNextStep: 'Step 1',
    actionPlan: 'Plan 1',
  })),
}));

// Import API route handlers
import { POST as createEntryHandler, GET as listEntriesHandler } from '../src/app/api/entries/route';
import { GET as getSessionHandler, DELETE as deleteSessionHandler } from '../src/app/api/entries/[sessionId]/route';
import { POST as chatHandler } from '../src/app/api/chat/route';
import { POST as summarizeHandler } from '../src/app/api/summarize/route';
import { POST as actionPlanHandler } from '../src/app/api/action-plan/route';

describe('Security & Authorization Test Suite', () => {
  beforeEach(() => {
    mockSessions['session-userA'] = {
      sessionId: 'session-userA',
      uid: 'userA-uid',
      title: 'User A Journal',
      summary: 'A summary',
      summaryInProgress: false,
    };
  });

  it('rejects unauthenticated requests with 401 across endpoints', async () => {
    const req1 = new Request('http://localhost:3000/api/entries', { method: 'GET' });
    const res1 = await listEntriesHandler(req1);
    expect(res1.status).toBe(401);

    const req2 = new Request('http://localhost:3000/api/entries/session-userA', { method: 'GET' });
    const res2 = await getSessionHandler(req2, { params: { sessionId: 'session-userA' } });
    expect(res2.status).toBe(401);

    const req3 = new Request('http://localhost:3000/api/chat', { method: 'POST' });
    const res3 = await chatHandler(req3);
    expect(res3.status).toBe(401);
  });

  it('rejects invalid authentication tokens with 401', async () => {
    const req = new Request('http://localhost:3000/api/entries/session-userA', {
      method: 'GET',
      headers: { Authorization: 'Bearer invalid-token' },
    });
    const res = await getSessionHandler(req, { params: { sessionId: 'session-userA' } });
    expect(res.status).toBe(401);
  });

  it('enforces revocation checking on DELETE endpoint', async () => {
    const req = new Request('http://localhost:3000/api/entries/session-userA', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer revoked-token' },
    });
    const res = await deleteSessionHandler(req, { params: { sessionId: 'session-userA' } });
    expect(res.status).toBe(401);
  });

  it('prevents IDOR: User B cannot access User A session', async () => {
    const req = new Request('http://localhost:3000/api/entries/session-userA', {
      method: 'GET',
      headers: { Authorization: 'Bearer userB-token' },
    });
    const res = await getSessionHandler(req, { params: { sessionId: 'session-userA' } });
    expect(res.status).toBe(404);
  });

  it('prevents IDOR: User B cannot delete User A session', async () => {
    const req = new Request('http://localhost:3000/api/entries/session-userA', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer userB-token' },
    });
    const res = await deleteSessionHandler(req, { params: { sessionId: 'session-userA' } });
    expect(res.status).toBe(404);
    expect(mockSessions['session-userA']).toBeDefined(); // Session preserved
  });

  it('prevents IDOR: User B cannot trigger action plan on User A session', async () => {
    const req = new Request('http://localhost:3000/api/action-plan', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer userB-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId: 'session-userA' }),
    });
    const res = await actionPlanHandler(req);
    expect(res.status).toBe(404);
  });

  it('prevents UID spoofing via request body', async () => {
    const req = new Request('http://localhost:3000/api/summarize', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer userB-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId: 'session-userA', uid: 'userA-uid' }),
    });
    const res = await summarizeHandler(req);
    expect(res.status).toBe(404); // Fails with 404 because User B does not own session-userA
  });

  it('rejects chat on non-existent session (no implicit creation)', async () => {
    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer userA-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId: 'non-existent-session', message: 'Hello' }),
    });
    const res = await chatHandler(req);
    expect(res.status).toBe(404);
  });

  it('blocks duplicate/racing summarization requests via transaction guard', async () => {
    mockSessions['session-userA'].summaryInProgress = true;

    const req = new Request('http://localhost:3000/api/summarize', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer userA-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId: 'session-userA' }),
    });
    const res = await summarizeHandler(req);
    expect(res.status).toBe(409); // 409 Conflict
  });
});
