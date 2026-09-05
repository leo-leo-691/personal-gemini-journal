import { NextResponse } from 'next/server';
import { verifyIdToken, AuthError } from '@/server/firebase-admin';
import {
  getSessionMetadata,
  listRecentMessages,
  deleteSessionWithMessages,
} from '@/server/firestore-db';

export async function GET(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const uid = await verifyIdToken(req);
    const { sessionId } = params;

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

export async function DELETE(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    // High-risk operation: verify with token revocation checking
    const uid = await verifyIdToken(req, { checkRevoked: true });
    const { sessionId } = params;

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
