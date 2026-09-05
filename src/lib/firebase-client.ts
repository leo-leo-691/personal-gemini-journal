import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  User,
  Auth,
} from 'firebase/auth';

function getFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    const missing: string[] = [];
    if (!apiKey) missing.push('NEXT_PUBLIC_FIREBASE_API_KEY');
    if (!authDomain) missing.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
    if (!projectId) missing.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
    if (!appId) missing.push('NEXT_PUBLIC_FIREBASE_APP_ID');

    throw new Error(
      `Firebase client initialization failed: Missing required environment variables at build time: ${missing.join(', ')}. Ensure build-time NEXT_PUBLIC_* variables are configured.`
    );
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
}

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(getFirebaseConfig());
}

export const auth: Auth = getAuth(getFirebaseApp());

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

export const signInWithEmail = async (email: string, pass: string) => {
  return signInWithEmailAndPassword(auth, email, pass);
};

export const signUpWithEmail = async (email: string, pass: string) => {
  return createUserWithEmailAndPassword(auth, email, pass);
};

export const signOut = async () => {
  return firebaseSignOut(auth);
};

export const getIdToken = async (): Promise<string | null> => {
  const user: User | null = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
};

/**
 * Shared authenticated fetch helper.
 * Attaches the current Firebase ID token as `Authorization: Bearer <token>`.
 */
export const authenticatedFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const token = await getIdToken();
  if (!token) {
    throw new Error('User is not authenticated');
  }

  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers,
  });
};
