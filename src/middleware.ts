import { NextRequest, NextResponse } from 'next/server';

/**
 * Per-request Content-Security-Policy nonce.
 *
 * Why middleware instead of a static hash in `next.config.js`:
 *
 * The theme-detection script in `src/app/layout.tsx` is static and could be
 * covered by a SHA-256 `script-src` hash on its own. But Next.js 14 App Router
 * also serves its own hydration / RSC bootstrap as *dynamic* inline `<script>`
 * tags (`self.__next_f.push(...)`) whose exact bytes change per route and per
 * render and therefore cannot be pre-hashed. And a CSP Level 2+ browser ignores
 * `'unsafe-inline'` whenever any hash or nonce is present in that directive. So
 * the only way to drop `script-src 'unsafe-inline'` without breaking hydration
 * is a per-request nonce: Next.js reads it from the request
 * `Content-Security-Policy` header and stamps it onto every inline script it
 * emits, and `layout.tsx` reads it back from `x-nonce` for the theme script.
 *
 * `'unsafe-eval'` is also removed: the production client bundle contains no
 * `eval` / `new Function` (verified against `.next/static/chunks`, `@google/genai`
 * and `@firebase/auth`); it was only ever a Next.js dev-mode requirement.
 *
 * `style-src` intentionally keeps `'unsafe-inline'`: it is required by an inline
 * `style` attribute on the auth screen (the Quiet Intelligence radial wash, per
 * `security/architecture.md` / DESIGN) and by Next.js's built-in error / 404
 * pages, neither of which can carry a nonce or a stable hash. Risk is low — the
 * app has no user-controlled HTML rendering path (all React-escaped, no
 * `dangerouslySetInnerHTML` over user data).
 *
 * Every other directive is byte-for-byte identical to the previous policy.
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://apis.google.com https://www.gstatic.com`,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com",
    "frame-src https://accounts.google.com https://*.firebaseapp.com",
    "img-src 'self' data: https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Run on every route that returns markup; skip static assets and images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
