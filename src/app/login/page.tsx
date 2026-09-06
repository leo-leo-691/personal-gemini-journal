'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
} from '@/lib/firebase-client';
import { ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      router.push('/journal');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      router.push('/journal');
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const field =
    'h-10 w-full rounded-sm border border-hairline bg-canvas px-3 text-ui text-ink caret-accent transition-colors duration-fast placeholder:text-ink-3 hover:border-hairline-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-45';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      {/* One quiet wash. No gradient orb, no glow. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--accent) 8%, transparent), transparent)',
        }}
      />

      <div className="relative w-full max-w-[380px]">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-accent-quiet">
          <span className="block h-2.5 w-2.5 rounded-[2px] bg-accent" aria-hidden="true" />
        </div>

        <h1 className="mt-6 font-serif text-display text-ink">
          {isSignUp ? 'Start your journal.' : 'Your journal is waiting.'}
        </h1>
        <p className="mt-2 text-ui text-ink-3">Private by default. Only you and this page.</p>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-6 rounded-sm border border-critical/30 bg-critical-quiet px-3.5 py-3 text-ui-sm text-ink"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <div>
            <label
              htmlFor="email"
              className="block font-mono text-label uppercase text-ink-3"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              className={`mt-2 ${field}`}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block font-mono text-label uppercase text-ink-3"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              disabled={loading}
              className={`mt-2 ${field}`}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-accent-strong text-ui font-semibold text-accent-on transition-[filter,transform] duration-fast hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                {isSignUp ? 'Creating account…' : 'Signing in…'}
              </>
            ) : (
              <>
                {isSignUp ? 'Create account' : 'Sign in'}
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </>
            )}
          </button>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2.5 rounded-sm border border-hairline-strong text-ui text-ink transition-colors duration-fast hover:bg-surface-hover disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9c-.6-1.5-1-3.2-1-5z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            Continue with Google
          </button>
        </form>

        <p className="mt-6 text-center text-ui-sm text-ink-3">
          {isSignUp ? 'Already have an account?' : 'No account yet?'}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring"
          >
            {isSignUp ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </main>
  );
}
