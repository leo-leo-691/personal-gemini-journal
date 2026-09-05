import { adminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export interface ActionIntelligenceSchema {
  keyIdeas: string[];
  insights: string[];
  actionItems: string[];
  suggestedNextStep: string;
  actionPlan: string;
}

export interface JournalSession {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  summary?: string;
  summaryInProgress?: boolean;
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
): Promise<{ sessionId: string; title: string; createdAt: string }> {
  const sessionRef = adminDb
    .collection('users')
    .doc(uid)
    .collection('journalSessions')
    .doc();

  const now = Timestamp.now();
  const sessionData = {
    title: title && title.trim().length > 0 ? title.trim() : 'Untitled Journal Session',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    summary: '',
    summaryInProgress: false,
    tags: null,
    actionIntelligence: null,
  };

  await sessionRef.set(sessionData);

  return {
    sessionId: sessionRef.id,
    title: sessionData.title,
    createdAt: now.toDate().toISOString(),
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
      createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
      updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
      lastMessageAt: data.lastMessageAt ? data.lastMessageAt.toDate().toISOString() : undefined,
      summary: data.summary || '',
      summaryInProgress: !!data.summaryInProgress,
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
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
    updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
    lastMessageAt: data.lastMessageAt ? data.lastMessageAt.toDate().toISOString() : undefined,
    summary: data.summary || '',
    summaryInProgress: !!data.summaryInProgress,
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
