import { NextResponse } from 'next/server';
import { verifyIdToken, AuthError } from '@/server/firebase-admin';
import {
  beginSummary,
  completeSummary,
  failSummary,
  listRecentMessages,
} from '@/server/firestore-db';
import { generateSummary } from '@/server/gemini';
import { rateLimit } from '@/server/rate-limit';
import { isValidSessionId } from '@/server/validation';

// Best-effort in-memory per-user rate limit for this expensive Gemini endpoint
// (see src/server/rate-limit.ts for the horizontal-scaling caveat).
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes

export async function POST(req: Request) {
  try {
    const uid = await verifyIdToken(req);
    const body = await req.json();
    const { sessionId } = body;

    if (!isValidSessionId(sessionId)) {
      return NextResponse.json({ error: 'Invalid or missing sessionId' }, { status: 400 });
    }

    const rl = rateLimit(`summarize:${uid}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW);
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    try {
      // Atomic transaction guard to block racing/duplicate summary calls for
      // the same session. Uses a 5-minute timestamped lease so a lock orphaned
      // by a dead process self-heals instead of wedging the session forever.
      const canProceed = await beginSummary(uid, sessionId);
      if (!canProceed) {
        return NextResponse.json(
          { message: 'Summary generation is already in progress.', inProgress: true },
          { status: 409 }
        );
      }

      const history = await listRecentMessages(uid, sessionId, 50);
      if (history.length === 0) {
        await failSummary(uid, sessionId);
        return NextResponse.json(
          { error: 'Cannot summarize empty session' },
          { status: 400 }
        );
      }

      const summary = await generateSummary(history);
      await completeSummary(uid, sessionId, summary);

      return NextResponse.json({ summary }, { status: 200 });
    } catch (err: any) {
      await failSummary(uid, sessionId).catch(() => {});
      if (err?.message && /not found/i.test(err.message)) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      console.error('Summarize generation failed:', err);
      // Distinguish a transient AI quota/availability problem from an app error.
      if (err?.name === 'GeminiError' && err.code === 'QUOTA') {
        return NextResponse.json(
          { error: 'The AI service is temporarily unavailable. Please try again shortly.' },
          { status: 503 }
        );
      }
      if (err?.name === 'GeminiError') {
        // TRUNCATED / GENERATION: nothing was persisted; surface the safe reason.
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
      return NextResponse.json(
        { error: 'Failed to generate summary' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    if (error?.name === 'AuthError' || error?.statusCode === 401) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 401 });
    }
    console.error('POST /api/summarize error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
