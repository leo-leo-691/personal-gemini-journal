import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/server/firebase-admin', () => ({
  verifyIdToken: vi.fn(async (req: Request) => {
    const h = req.headers.get('Authorization');
    if (!h || !h.startsWith('Bearer ')) {
      const e: any = new Error('Missing auth');
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

// Minimal stateful summary store mirroring beginSummary/completeSummary/failSummary.
const state: { inProgress: boolean; persisted?: string } = { inProgress: false };

vi.mock('../src/server/firestore-db', () => ({
  beginSummary: vi.fn(async () => {
    if (state.inProgress) return false;
    state.inProgress = true;
    return true;
  }),
  completeSummary: vi.fn(async (_uid: string, _sid: string, summary: string) => {
    state.inProgress = false;
    state.persisted = summary;
  }),
  failSummary: vi.fn(async () => {
    state.inProgress = false;
  }),
  listRecentMessages: vi.fn(async () => [
    { messageId: 'm1', role: 'user', text: 'hi', ts: new Date().toISOString() },
  ]),
}));

const { generateSummary } = vi.hoisted(() => ({ generateSummary: vi.fn() }));
vi.mock('../src/server/gemini', () => ({ generateSummary }));

import { POST as summarizeHandler } from '../src/app/api/summarize/route';
import { __resetRateLimitStore } from '../src/server/rate-limit';

function makeReq(sessionId = 'sessionA') {
  return new Request('http://localhost/api/summarize', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
}

function truncatedError() {
  const e: any = new Error('The summary was cut off before completion and was not saved. Please try again.');
  e.name = 'GeminiError';
  e.code = 'TRUNCATED';
  return e;
}

function quotaError() {
  const e: any = new Error('quota');
  e.name = 'GeminiError';
  e.code = 'QUOTA';
  return e;
}

function emptyOutputError() {
  const e: any = new Error('The AI returned an empty summary.');
  e.name = 'GeminiError';
  e.code = 'GENERATION';
  return e;
}

describe('POST /api/summarize — truncation, persistence, concurrency', () => {
  beforeEach(() => {
    __resetRateLimitStore();
    state.inProgress = false;
    state.persisted = undefined;
    generateSummary.mockReset();
  });

  it('D2: persists a successful summary and returns it', async () => {
    generateSummary.mockResolvedValue('A complete reflective summary of the session.');
    const res = await summarizeHandler(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: 'A complete reflective summary of the session.' });
    expect(state.persisted).toBe('A complete reflective summary of the session.');
    expect(state.inProgress).toBe(false);
  });

  it('D1: does NOT persist a truncated (MAX_TOKENS) summary and clears the lease', async () => {
    generateSummary.mockRejectedValue(truncatedError());
    const res = await summarizeHandler(makeReq());
    expect(res.status).toBe(500);
    expect(state.persisted).toBeUndefined();
    expect(state.inProgress).toBe(false);
  });

  it('D3: rejects empty Gemini output (GENERATION) with 500 and persists nothing', async () => {
    generateSummary.mockRejectedValue(emptyOutputError());
    const res = await summarizeHandler(makeReq());
    expect(res.status).toBe(500);
    expect(state.persisted).toBeUndefined();
    expect(state.inProgress).toBe(false);
  });

  it('maps a Gemini QUOTA error to HTTP 503 (distinct from an app 500)', async () => {
    generateSummary.mockRejectedValue(quotaError());
    const res = await summarizeHandler(makeReq());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(state.persisted).toBeUndefined();
  });

  it('preserves the concurrency guard: 409 while a summary is already in progress', async () => {
    state.inProgress = true;
    const res = await summarizeHandler(makeReq());
    expect(res.status).toBe(409);
  });
});
