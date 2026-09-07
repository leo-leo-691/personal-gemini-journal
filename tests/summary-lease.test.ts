import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Exercises the *real* beginSummary / completeSummary / failSummary transaction
 * logic in src/server/firestore-db.ts against a fake transactional adminDb.
 * (Timestamp.now() from firebase-admin/firestore is real.)
 */
const { adminDb, seed } = vi.hoisted(() => {
  const seed: { exists: boolean; data: Record<string, any> } = { exists: true, data: {} };
  const sessionRef = {
    update: async (patch: Record<string, any>) => {
      Object.assign(seed.data, patch);
    },
  };
  const tx = {
    get: async (_ref: unknown) => ({ exists: seed.exists, data: () => seed.data }),
    update: (_ref: unknown, patch: Record<string, any>) => {
      Object.assign(seed.data, patch);
    },
  };
  const adminDb = {
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => sessionRef }) }) }),
    runTransaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { adminDb, seed };
});

vi.mock('../src/server/firebase-admin', () => ({ adminDb, adminAuth: {} }));

import {
  beginSummary,
  completeSummary,
  failSummary,
  SUMMARY_LEASE_MS,
} from '../src/server/firestore-db';

beforeEach(() => {
  seed.exists = true;
  seed.data = {};
});

describe('beginSummary() — real transaction lease', () => {
  it('SUMMARY_LEASE_MS matches the Action Intelligence lease (5 minutes)', () => {
    expect(SUMMARY_LEASE_MS).toBe(5 * 60 * 1000);
  });

  it('acquires the lease when no summary is in progress', async () => {
    expect(await beginSummary('u', 's')).toBe(true);
    expect(seed.data.summaryInProgress).toBe(true);
    expect(typeof seed.data.summaryStartedAt.toMillis).toBe('function');
  });

  it('rejects while a fresh lease is held', async () => {
    seed.data = { summaryInProgress: true, summaryStartedAt: { toMillis: () => Date.now() } };
    expect(await beginSummary('u', 's')).toBe(false);
  });

  it('reclaims a stale lease', async () => {
    seed.data = {
      summaryInProgress: true,
      summaryStartedAt: { toMillis: () => Date.now() - SUMMARY_LEASE_MS - 1_000 },
    };
    expect(await beginSummary('u', 's')).toBe(true);
    expect(typeof seed.data.summaryStartedAt.toMillis).toBe('function'); // refreshed to now
  });

  it('reclaims an in-progress record that has no timestamp (legacy data)', async () => {
    seed.data = { summaryInProgress: true }; // no summaryStartedAt
    expect(await beginSummary('u', 's')).toBe(true);
  });

  it('throws "Session not found" for a missing session', async () => {
    seed.exists = false;
    await expect(beginSummary('u', 's')).rejects.toThrow(/not found/i);
  });

  it('completeSummary releases the lease and stores the summary', async () => {
    seed.data = { summaryInProgress: true, summaryStartedAt: { toMillis: () => Date.now() } };
    await completeSummary('u', 's', 'final text');
    expect(seed.data.summary).toBe('final text');
    expect(seed.data.summaryInProgress).toBe(false);
    expect(seed.data.summaryStartedAt).toBeNull();
  });

  it('failSummary releases the lease without writing a summary', async () => {
    seed.data = { summaryInProgress: true, summaryStartedAt: { toMillis: () => Date.now() } };
    await failSummary('u', 's');
    expect(seed.data.summaryInProgress).toBe(false);
    expect(seed.data.summaryStartedAt).toBeNull();
    expect(seed.data.summary).toBeUndefined();
  });
});
