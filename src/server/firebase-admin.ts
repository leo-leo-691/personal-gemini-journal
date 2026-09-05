import * as admin from 'firebase-admin';

export class AuthError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

if (!admin.apps.length) {
  // Rely exclusively on Application Default Credentials (ADC)
  admin.initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();

export interface VerifyTokenOptions {
  checkRevoked?: boolean;
}

/**
 * Reads "Authorization: Bearer <token>" header, verifies with Firebase Admin SDK,
 * and returns the verified UID.
 */
export async function verifyIdToken(
  req: Request,
  options?: VerifyTokenOptions
): Promise<string> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header', 401);
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    throw new AuthError('Bearer token is empty', 401);
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(
      token,
      options?.checkRevoked ?? false
    );
    return decodedToken.uid;
  } catch (error: any) {
    if (error.code === 'auth/id-token-revoked') {
      throw new AuthError('Token has been revoked', 401);
    }
    if (error.code === 'auth/id-token-expired') {
      throw new AuthError('Token has expired', 401);
    }
    throw new AuthError('Invalid authentication token', 401);
  }
}
