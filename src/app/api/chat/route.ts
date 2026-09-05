import { NextResponse } from 'next/server';
import { verifyIdToken, AuthError } from '@/server/firebase-admin';
import {
  getSessionMetadata,
  listRecentMessages,
  appendMessage,
} from '@/server/firestore-db';
import { generateReply } from '@/server/gemini';

// In-memory rate limiting store (prototype level)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 30; // Max 30 chats per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function isRateLimited(uid: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(uid);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(uid, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count++;
  return false;
}

export async function POST(req: Request) {
  try {
    const uid = await verifyIdToken(req);

    if (isRateLimited(uid)) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { sessionId, message } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'message content is required' }, { status: 400 });
    }

    // Explicit check: session MUST already exist. No implicit session creation!
    const session = await getSessionMetadata(uid, sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found. Sessions must be explicitly created first.' },
        { status: 404 }
      );
    }

    // Load bounded history
    const history = await listRecentMessages(uid, sessionId, 20);

    // Save user message
    await appendMessage(uid, sessionId, 'user', message.trim());

    // Generate AI response
    const replyText = await generateReply(history, message.trim());

    // Save AI message
    const modelMsg = await appendMessage(uid, sessionId, 'model', replyText);

    return NextResponse.json(
      {
        reply: replyText,
        message: modelMsg,
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error?.name === 'AuthError' || error?.statusCode === 401) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 401 });
    }
    console.error('POST /api/chat error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
