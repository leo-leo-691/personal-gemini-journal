import { NextResponse } from 'next/server';
import { verifyIdToken, AuthError } from '@/server/firebase-admin';
import {
  beginSummary,
  completeSummary,
  failSummary,
  listRecentMessages,
} from '@/server/firestore-db';
import { generateSummary } from '@/server/gemini';

export async function POST(req: Request) {
  try {
    const uid = await verifyIdToken(req);
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    try {
      // Atomic transaction guard to block racing/duplicate summary calls
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
