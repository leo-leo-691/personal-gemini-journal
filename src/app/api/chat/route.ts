import { NextResponse } from 'next/server';
import { verifyIdToken, AuthError } from '@/server/firebase-admin';
import {
  getSessionMetadata,
  listRecentMessages,
  appendMessage,
} from '@/server/firestore-db';
import { generateReply } from '@/server/gemini';
import { rateLimit } from '@/server/rate-limit';
import { isValidSessionId, MAX_MESSAGE_LENGTH } from '@/server/validation';

// Best-effort in-memory per-user rate limit (see src/server/rate-limit.ts for
// the horizontal-scaling caveat). Max 30 chat turns per minute per user.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

export async function POST(req: Request) {
  try {
    const uid = await verifyIdToken(req);

    const rl = rateLimit(`chat:${uid}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW);
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const { sessionId, message } = body;

    if (!isValidSessionId(sessionId)) {
      return NextResponse.json({ error: 'Invalid or missing sessionId' }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'message content is required' }, { status: 400 });
    }

    // Reject an oversized message BEFORE it is persisted or sent to Gemini.
    // Never silently truncate and forward a shortened version.
    if (message.trim().length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `message exceeds the ${MAX_MESSAGE_LENGTH}-character limit` },
        { status: 400 }
      );
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
