import { NextResponse } from 'next/server';
import { verifyIdToken, AuthError } from '@/server/firebase-admin';
import {
  getSessionMetadata,
  listRecentMessages,
  updateActionIntelligence,
} from '@/server/firestore-db';
import { generateActionIntelligence } from '@/server/gemini';

export async function POST(req: Request) {
  try {
    const uid = await verifyIdToken(req);
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const session = await getSessionMetadata(uid, sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const history = await listRecentMessages(uid, sessionId, 50);
    const summaryText = session.summary || 'General journal conversation history';

    const actionData = await generateActionIntelligence(summaryText, history);
    await updateActionIntelligence(uid, sessionId, actionData);

    return NextResponse.json({ actionIntelligence: actionData }, { status: 200 });
  } catch (error: any) {
    if (error?.name === 'AuthError' || error?.statusCode === 401) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 401 });
    }
    console.error('POST /api/action-plan error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
