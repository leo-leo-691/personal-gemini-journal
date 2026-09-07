import { describe, it, expect, vi } from 'vitest';
import { MAX_MESSAGE_LENGTH } from '../src/server/validation';

// Minimal in-memory Firestore Admin stand-in that records the message payload
// written by appendMessage(), so we can assert the real persistence cap.
const { adminDb, writes } = vi.hoisted(() => {
  const writes: Array<{ text: string; role: string }> = [];
  const batch = {
    set: (_ref: unknown, data: { text: string; role: string }) => writes.push(data),
    update: () => {},
    commit: async () => {},
  };
  const messageDoc = { id: 'msg-1' };
  const sessionRef = {
    collection: () => ({ doc: () => messageDoc }),
  };
  const adminDb = {
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => sessionRef }) }) }),
    batch: () => batch,
  };
  return { adminDb, writes };
});

vi.mock('../src/server/firebase-admin', () => ({ adminDb, adminAuth: {} }));

import { appendMessage } from '../src/server/firestore-db';

describe('appendMessage() persistence cap', () => {
  it('truncates a stored message at exactly MAX_MESSAGE_LENGTH characters', async () => {
    writes.length = 0;
    await appendMessage('u', 's', 'user', 'x'.repeat(MAX_MESSAGE_LENGTH + 2500));
    expect(writes).toHaveLength(1);
    expect(writes[0].text).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  it('stores a normal message unchanged', async () => {
    writes.length = 0;
    await appendMessage('u', 's', 'model', 'a short reply');
    expect(writes[0].text).toBe('a short reply');
  });
});
