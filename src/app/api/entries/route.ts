import { NextResponse } from 'next/server';
import { verifyIdToken, AuthError } from '@/server/firebase-admin';
import { createSession, listSessions } from '@/server/firestore-db';
import { MAX_TITLE_LENGTH } from '@/server/validation';

export async function POST(req: Request) {
  try {
    const uid = await verifyIdToken(req);
    let title: string | undefined;

    try {
      const body = await req.json();
      if (typeof body.title === 'string') {
        // Defensive cap; createSession trims and applies the per-user default
        // when no usable title is provided.
        title = body.title.slice(0, MAX_TITLE_LENGTH * 2);
      }
    } catch {
      // Body may be empty / missing — the per-user default title applies.
    }

    const session = await createSession(uid, title);
    return NextResponse.json(session, { status: 201 });
  } catch (error: any) {
    if (error?.name === 'AuthError' || error?.statusCode === 401) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 401 });
    }
    console.error('POST /api/entries error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const uid = await verifyIdToken(req);
    const sessions = await listSessions(uid);
    return NextResponse.json(sessions, { status: 200 });
  } catch (error: any) {
    if (error?.name === 'AuthError' || error?.statusCode === 401) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 401 });
    }
    console.error('GET /api/entries error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
