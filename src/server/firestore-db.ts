import { adminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { MAX_TITLE_LENGTH } from './validation';

export interface ActionIntelligenceSchema {
  keyIdeas: string[];
  insights: string[];
  actionItems: string[];
  suggestedNextStep: string;
  actionPlan: string;
}

/**
 * Serialises a Firestore Timestamp to an ISO 8601 string for API responses.
 * Returns null for a missing or non-Timestamp value — callers must NOT
 * substitute the current date for absent data.
 */
export function serializeTimestamp(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      const d = (value as { toDate: () => unknown }).toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {
      /* fall through to null */
    }
  }
  return null;
}

export interface JournalSession {
  sessionId: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt?: string | null;
  summary?: string;
  summaryInProgress?: boolean;
  actionPlanInProgress?: boolean;
  actionPlanStartedAt?: string;
  tags?: string[] | null;
  actionIntelligence?: ActionIntelligenceSchema | null;
}

export interface JournalMessage {
  messageId: string;
  role: 'user' | 'model';
  text: string;
  ts: string;
}

/**
 * Creates a new journal session under users/{uid}/journalSessions/{sessionId}
 */
export async function createSession(
  uid: string,
  title?: string
): Promise<{
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}> {
  const sessionsRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions');
  const sessionRef = sessionsRef.doc();

  // Resolve the title: an explicit non-empty title wins (trimmed + capped);
  // otherwise generate a per-user distinguishable default ("Journal N") so
  // multiple sessions created the same day are not visually identical.
  let resolvedTitle: string;
  const explicit = typeof title === 'string' ? title.trim() : '';
  if (explicit.length > 0) {
    resolvedTitle = explicit.slice(0, MAX_TITLE_LENGTH);
  } else {
    let existingCount = -1;
    try {
      const agg = await sessionsRef.count().get();
      existingCount = agg.data().count ?? 0;
    } catch {
      // Count aggregation unavailable — fall through to the id-based fallback.
    }
    resolvedTitle =
      existingCount >= 0
        ? `Journal ${existingCount + 1}`
        : // Distinguishable per session even without the count: the doc id is unique.
          `Journal ${sessionRef.id.slice(0, 6)}`;
  }

  const now = Timestamp.now();
  const sessionData = {
    title: resolvedTitle,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    summary: '',
    summaryInProgress: false,
    actionPlanInProgress: false,
    actionPlanStartedAt: null,
    tags: null,
    actionIntelligence: null,
  };

  await sessionRef.set(sessionData);

  const nowIso = now.toDate().toISOString();
  return {
    sessionId: sessionRef.id,
    title: sessionData.title,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastMessageAt: nowIso,
  };
}

/**
 * Lists all session metadata for a user (no message transcripts)
 */
export async function listSessions(uid: string): Promise<JournalSession[]> {
  const snapshot = await adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      sessionId: doc.id,
      title: data.title || 'Untitled',
      createdAt: serializeTimestamp(data.createdAt),
      updatedAt: serializeTimestamp(data.updatedAt),
      lastMessageAt: serializeTimestamp(data.lastMessageAt) ?? undefined,
      summary: data.summary || '',
      summaryInProgress: !!data.summaryInProgress,
      actionPlanInProgress: !!data.actionPlanInProgress,
      actionPlanStartedAt: serializeTimestamp(data.actionPlanStartedAt) ?? undefined,
      tags: data.tags || null,
      actionIntelligence: data.actionIntelligence || null,
    };
  });
}

/**
 * Fetches metadata for a single session without pulling full message history
 */
export async function getSessionMetadata(
  uid: string,
  sessionId: string
): Promise<JournalSession | null> {
  const docRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  const doc = await docRef.get();
  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    sessionId: doc.id,
    title: data.title || 'Untitled',
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    lastMessageAt: serializeTimestamp(data.lastMessageAt) ?? undefined,
    summary: data.summary || '',
    summaryInProgress: !!data.summaryInProgress,
    actionPlanInProgress: !!data.actionPlanInProgress,
    actionPlanStartedAt: serializeTimestamp(data.actionPlanStartedAt) ?? undefined,
    tags: data.tags || null,
    actionIntelligence: data.actionIntelligence || null,
  };
}

/**
 * Bounded history retriever: fetches only the most recent N messages
 */
export async function listRecentMessages(
  uid: string,
  sessionId: string,
  limitCount: number = 20
): Promise<JournalMessage[]> {
  const snapshot = await adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId)
    .collection('messages')
    .orderBy('ts', 'desc')
    .limit(limitCount)
    .get();

  const messages = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      messageId: doc.id,
      role: data.role as 'user' | 'model',
      text: data.text || '',
      ts: data.ts ? data.ts.toDate().toISOString() : new Date().toISOString(),
    };
  });

  // Return in chronological order
  return messages.reverse();
}

/**
 * Appends a message to the session's messages subcollection and updates parent timestamp
 */
export async function appendMessage(
  uid: string,
  sessionId: string,
  role: 'user' | 'model',
  text: string
): Promise<JournalMessage> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  const messageRef = sessionRef.collection('messages').doc();
  const now = Timestamp.now();

  const messageData = {
    role,
    text: text.slice(0, 4000), // Enforce 4,000 char per message cap
    ts: now,
  };

  const batch = adminDb.batch();
  batch.set(messageRef, messageData);
  batch.update(sessionRef, {
    updatedAt: now,
    lastMessageAt: now,
  });

  await batch.commit();

  return {
    messageId: messageRef.id,
    role,
    text: messageData.text,
    ts: now.toDate().toISOString(),
  };
}

/**
 * Secure session deletion: recursively deletes subcollection messages before parent doc
 */
export async function deleteSessionWithMessages(
  uid: string,
  sessionId: string
): Promise<boolean> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  const doc = await sessionRef.get();
  if (!doc.exists) return false;

  const messagesRef = sessionRef.collection('messages');
  const messagesSnapshot = await messagesRef.get();

  // Batch delete subcollection documents
  if (!messagesSnapshot.empty) {
    const batch = adminDb.batch();
    messagesSnapshot.docs.forEach((msgDoc) => {
      batch.delete(msgDoc.ref);
    });
    await batch.commit();
  }

  // Delete parent document
  await sessionRef.delete();
  return true;
}

/**
 * Renames a session the caller owns. The path is built strictly from the
 * verified UID, so a caller can only reach their own sessions; a missing doc
 * (including another user's session id under this UID) returns false → 404.
 * Only the existing `title` field is written; the document structure and id
 * are unchanged. Returns true on success, false if the session does not exist.
 */
export async function renameSession(
  uid: string,
  sessionId: string,
  title: string
): Promise<boolean> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  const doc = await sessionRef.get();
  if (!doc.exists) return false;

  await sessionRef.update({ title });
  return true;
}

/**
 * Firestore transaction guard to prevent duplicate/racing summarize requests
 */
export async function beginSummary(uid: string, sessionId: string): Promise<boolean> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  return adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(sessionRef);
    if (!doc.exists) {
      throw new Error('Session not found');
    }

    const data = doc.data();
    if (data?.summaryInProgress) {
      return false; // Already in progress
    }

    transaction.update(sessionRef, { summaryInProgress: true });
    return true;
  });
}

export async function completeSummary(
  uid: string,
  sessionId: string,
  summary: string
): Promise<void> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  await sessionRef.update({
    summary,
    summaryInProgress: false,
    updatedAt: Timestamp.now(),
  });
}

export async function failSummary(uid: string, sessionId: string): Promise<void> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  await sessionRef.update({
    summaryInProgress: false,
  });
}

export async function updateActionIntelligence(
  uid: string,
  sessionId: string,
  data: ActionIntelligenceSchema
): Promise<void> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  await sessionRef.update({
    actionIntelligence: data,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Time-bounded lease for the action-plan generation lock.
 *
 * A crash between lock acquisition and cleanup would otherwise leave a plain
 * boolean flag stuck `true` forever, permanently blocking the session. Instead
 * the lock carries an `actionPlanStartedAt` Firestore Timestamp; a lease older
 * than this window is considered abandoned and may be reclaimed.
 */
export const ACTION_PLAN_LEASE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Firestore transaction guard to prevent duplicate/racing action-plan requests
 * for the same session. Mirrors `beginSummary` / `summaryInProgress`, but uses a
 * timestamped lease so a stale lock left by a dead process self-heals.
 *
 * Returns `true` when the caller acquired (or reclaimed) the lease, `false` when
 * another request holds a still-active lease. The read + write happen inside one
 * Firestore transaction, so two concurrent callers can never both acquire.
 */
export async function beginActionPlan(uid: string, sessionId: string): Promise<boolean> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  return adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(sessionRef);
    if (!doc.exists) {
      throw new Error('Session not found');
    }

    const data = doc.data();
    const now = Timestamp.now();

    if (data?.actionPlanInProgress) {
      const startedAt = data.actionPlanStartedAt;
      const startedMs =
        startedAt && typeof startedAt.toMillis === 'function' ? startedAt.toMillis() : null;

      // An in-progress flag with no (or unreadable) timestamp is treated as
      // stale so it can never wedge the session permanently.
      const leaseActive = startedMs !== null && now.toMillis() - startedMs < ACTION_PLAN_LEASE_MS;
      if (leaseActive) {
        return false; // Another request holds a still-valid lease.
      }
      // Otherwise the lease is stale/abandoned: fall through and reclaim it
      // within this same transaction.
    }

    transaction.update(sessionRef, {
      actionPlanInProgress: true,
      actionPlanStartedAt: now,
    });
    return true;
  });
}

export async function completeActionPlan(
  uid: string,
  sessionId: string,
  data: ActionIntelligenceSchema
): Promise<void> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  await sessionRef.update({
    actionIntelligence: data,
    actionPlanInProgress: false,
    actionPlanStartedAt: null,
    updatedAt: Timestamp.now(),
  });
}

export async function failActionPlan(uid: string, sessionId: string): Promise<void> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc(sessionId);

  await sessionRef.update({
    actionPlanInProgress: false,
    actionPlanStartedAt: null,
  });
}
