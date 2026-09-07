import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_MESSAGE_LENGTH } from '../src/server/validation';

// --- Mocks -----------------------------------------------------------------

vi.mock('../src/server/firebase-admin', () => ({
  verifyIdToken: vi.fn(async (req: Request) => {
    const h = req.headers.get('Authorization');
    if (!h || !h.startsWith('Bearer ')) {
      const e: any = new Error('Missing or invalid Authorization header');
      e.name = 'AuthError';
      e.statusCode = 401;
      throw e;
    }
    return 'userA-uid';
  }),
  AuthError: class AuthError extends Error {
    statusCode = 401;
  },
}));

const { appendMessage, getSessionMetadata, listRecentMessages } = vi.hoisted(() => ({
  appendMessage: vi.fn(async (_uid: string, _sid: string, role: string, text: string) => ({
    messageId: `m-${role}`,
    role,
    text,
    ts: new Date().toISOString(),
  })),
  getSessionMetadata: vi.fn(async () => ({ sessionId: 'sessionA', title: 'S' })),
  listRecentMessages: vi.fn(async () => []),
}));

vi.mock('../src/server/firestore-db', () => ({
  appendMessage,
  getSessionMetadata,
  listRecentMessages,
}));

const { generateReply } = vi.hoisted(() => ({
  generateReply: vi.fn(async () => 'model reply'),
}));
vi.mock('../src/server/gemini', () => ({ generateReply }));

import { POST as chatHandler } from '../src/app/api/chat/route';
import { __resetRateLimitStore } from '../src/server/rate-limit';

function makeReq(message: string) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer userA-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'sessionA', message }),
  });
}

beforeEach(() => {
  __resetRateLimitStore();
  appendMessage.mockClear();
  getSessionMetadata.mockClear();
  listRecentMessages.mockClear();
  generateReply.mockClear();
});

describe('POST /api/chat — outbound message length cap', () => {
  it('the cap constant is 4000 and is the single source of truth', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(4000);
  });

  it('a message of exactly MAX_MESSAGE_LENGTH characters passes validation', async () => {
    const res = await chatHandler(makeReq('x'.repeat(MAX_MESSAGE_LENGTH)));
    expect(res.status).toBe(200);
    expect(generateReply).toHaveBeenCalledTimes(1);
    // one write for the user message, one for the model reply
    expect(appendMessage).toHaveBeenCalledTimes(2);
    expect(appendMessage.mock.calls[0][3]).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  it('a message longer than MAX_MESSAGE_LENGTH is rejected with 400 before Gemini and before persistence', async () => {
    const res = await chatHandler(makeReq('x'.repeat(MAX_MESSAGE_LENGTH + 1)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(new RegExp(`${MAX_MESSAGE_LENGTH}`));
    // the actual call boundary: neither the model nor Firestore is touched
    expect(generateReply).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('an oversized message is not silently truncated and forwarded', async () => {
    await chatHandler(makeReq('y'.repeat(MAX_MESSAGE_LENGTH + 500)));
    expect(generateReply).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('a normal short message retains existing behaviour', async () => {
    const res = await chatHandler(makeReq('How am I doing today?'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe('model reply');
    expect(body.message).toMatchObject({ role: 'model' });
    expect(generateReply).toHaveBeenCalledTimes(1);
    expect(appendMessage).toHaveBeenCalledTimes(2);
    expect(appendMessage.mock.calls[0]).toEqual([
      'userA-uid',
      'sessionA',
      'user',
      'How am I doing today?',
    ]);
  });
});
