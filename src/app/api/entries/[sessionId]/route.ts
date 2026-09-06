import { NextResponse } from 'next/server';
import { verifyIdToken, AuthError } from '@/server/firebase-admin';
import {
  getSessionMetadata,
  listRecentMessages,
  deleteSessionWithMessages,
  renameSession,
} from '@/server/firestore-db';
import { isValidSessionId, normalizeTitle, MAX_TITLE_LENGTH } from '@/server/validation';

export async function GET(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const uid = await verifyIdToken(req);
    const { sessionId } = params;

    if (!isValidSessionId(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const metadata = await getSessionMetadata(uid, sessionId);
    if (!metadata) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const messages = await listRecentMessages(uid, sessionId, 30);
    return NextResponse.json(
      {
        ...metadata,
        messages,
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error?.name === 'AuthError' || error?.statusCode === 401) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 401 });
    }
    console.error('GET /api/entries/[sessionId] error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const uid = await verifyIdToken(req);
    const { sessionId } = params;

    if (!isValidSessionId(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!('title' in (body ?? {}))) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const title = normalizeTitle(body.title);
    if (title === null) {
      return NextResponse.json(
        {
          error: `Title must be between 1 and ${MAX_TITLE_LENGTH} characters (after trimming whitespace).`,
        },
        { status: 400 }
      );
    }

    const renamed = await renameSession(uid, sessionId, title);
    if (!renamed) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ sessionId, title }, { status: 200 });
  } catch (error: any) {
    if (error?.name === 'AuthError' || error?.statusCode === 401) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 401 });
    }
    console.error('PATCH /api/entries/[sessionId] error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    // High-risk operation: verify with token revocation checking
    const uid = await verifyIdToken(req, { checkRevoked: true });
    const { sessionId } = params;

    if (!isValidSessionId(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const success = await deleteSessionWithMessages(uid, sessionId);
    if (!success) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Session deleted' }, { status: 200 });
  } catch (error: any) {
    if (error?.name === 'AuthError' || error?.statusCode === 401) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 401 });
    }
    console.error('DELETE /api/entries/[sessionId] error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
