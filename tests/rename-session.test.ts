import { describe, it, expect, vi, beforeEach } from 'vitest';

function authErr() {
  const e: any = new Error('Missing or invalid Authorization header');
  e.name = 'AuthError';
  e.statusCode = 401;
  return e;
}

vi.mock('../src/server/firebase-admin', () => ({
  verifyIdToken: vi.fn(async (req: Request) => {
    const h = req.headers.get('Authorization');
    if (!h || !h.startsWith('Bearer ')) throw authErr();
    const token = h.split('Bearer ')[1]?.trim();
    if (token === 'userA') return 'userA-uid';
    if (token === 'userB') return 'userB-uid';
    throw authErr();
  }),
  AuthError: class AuthError extends Error {
    statusCode = 401;
  },
}));

const store: Record<string, { uid: string; title: string }> = {};

vi.mock('../src/server/firestore-db', () => ({
  renameSession: vi.fn(async (uid: string, sessionId: string, title: string) => {
    const s = store[sessionId];
    if (!s || s.uid !== uid) return false; // not found OR not owned -> 404
    s.title = title;
    return true;
  }),
  getSessionMetadata: vi.fn(async (uid: string, sessionId: string) => {
    const s = store[sessionId];
    if (!s || s.uid !== uid) return null;
    return { sessionId, title: s.title, createdAt: null, updatedAt: null };
  }),
  listRecentMessages: vi.fn(async () => []),
  deleteSessionWithMessages: vi.fn(async () => false),
}));

import {
  PATCH as patchHandler,
  GET as getHandler,
} from '../src/app/api/entries/[sessionId]/route';

function req(sessionId: string, token: string | null, body: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(`http://localhost/api/entries/${sessionId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store['sessA'] = { uid: 'userA-uid', title: 'Journal 1' };
});

describe('PATCH /api/entries/[sessionId] — rename', () => {
  it('3: a user can rename their own session', async () => {
    const res = await patchHandler(req('sessA', 'userA', { title: 'Timepass' }), {
      params: { sessionId: 'sessA' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: 'sessA', title: 'Timepass' });
    expect(store['sessA'].title).toBe('Timepass');
  });

  it('4: the rename persists — a later read returns the new title', async () => {
    await patchHandler(req('sessA', 'userA', { title: 'Timepass' }), {
      params: { sessionId: 'sessA' },
    });
    const getReq = new Request('http://localhost/api/entries/sessA', {
      headers: { Authorization: 'Bearer userA' },
    });
    const res = await getHandler(getReq, { params: { sessionId: 'sessA' } });
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Timepass');
  });

  it('5: an empty or whitespace-only title is rejected with 400 and does not change the title', async () => {
    for (const bad of ['', '   ', '\t\n']) {
      const res = await patchHandler(req('sessA', 'userA', { title: bad }), {
        params: { sessionId: 'sessA' },
      });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(store['sessA'].title).toBe('Journal 1');
  });

  it('5b: a missing title field is rejected with 400', async () => {
    const res = await patchHandler(req('sessA', 'userA', {}), { params: { sessionId: 'sessA' } });
    expect(res.status).toBe(400);
  });

  it('6: title length is bounded (81 chars rejected, 80 chars accepted)', async () => {
    const tooLong = await patchHandler(req('sessA', 'userA', { title: 'x'.repeat(81) }), {
      params: { sessionId: 'sessA' },
    });
    expect(tooLong.status).toBe(400);
    expect(store['sessA'].title).toBe('Journal 1');

    const ok = await patchHandler(req('sessA', 'userA', { title: 'x'.repeat(80) }), {
      params: { sessionId: 'sessA' },
    });
    expect(ok.status).toBe(200);
    expect(store['sessA'].title).toBe('x'.repeat(80));
  });

  it('7: rename requires authentication (401 without a Bearer token)', async () => {
    const res = await patchHandler(req('sessA', null, { title: 'Timepass' }), {
      params: { sessionId: 'sessA' },
    });
    expect(res.status).toBe(401);
    expect(store['sessA'].title).toBe('Journal 1');
  });

  it('8: a user cannot rename another user’s session (404, no change)', async () => {
    const res = await patchHandler(req('sessA', 'userB', { title: 'hijacked' }), {
      params: { sessionId: 'sessA' },
    });
    expect(res.status).toBe(404);
    expect(store['sessA'].title).toBe('Journal 1');
  });

  it('rejects a malformed sessionId with 400', async () => {
    const res = await patchHandler(req('a%2Fb', 'userA', { title: 'x' }), {
      params: { sessionId: 'a/b' },
    });
    expect(res.status).toBe(400);
  });
});
