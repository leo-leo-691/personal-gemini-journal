# Repository Security Constitution (v3 Architecture)

## Core Security Principles

### 1. Zero Trust Client Boundary
- The browser NEVER communicates directly with Google Gemini API or Cloud Firestore.
- All requests route through Cloud Run server-side API endpoints (`/api/*`).
- API key for Gemini is stored strictly in Secret Manager and injected at Cloud Run deployment time as an environment variable (`GEMINI_API_KEY`). It is never present in client bundles or `.env` files.

### 2. Authentication & Authorization
- Every API endpoint requires a verified Firebase ID token in `Authorization: Bearer <token>`.
- Server-side ID token verification is performed via `verifyIdToken()` using Firebase Admin SDK.
- Application Default Credentials (ADC) are used for Firebase Admin SDK initialization. No service account private keys exist in the repository or container.
- For high-risk destructive operations (e.g. `DELETE /api/entries/{sessionId}`), token verification explicitly sets `checkRevoked: true`.

### 3. Data Scoping & Subcollection Cleanup
- All Firestore queries are constructed using the verified UID: `users/{verifiedUid}/journalSessions/{sessionId}`.
- Request body parameters (e.g. `uid`) are NEVER trusted for authorization.
- Session deletion explicitly and recursively deletes every document in the `messages` subcollection (`users/{uid}/journalSessions/{id}/messages/*`) prior to deleting the session document.

### 4. Explicit Trigger Lifecycle & Atomic Summary Guard
- Session creation, session deletion, summarization, and action plan generation are strictly explicit, user-triggered API calls.
- No client-side timers, background inactivity triggers, or automatic side effects exist.
- Summary generation is guarded by a Firestore transaction flag (`summaryInProgress`). Dual/racing summarization requests for the same session return an immediate 409 Conflict without invoking Gemini.

### 5. CSRF & Security Headers
- Authentication uses `Authorization: Bearer` headers exclusively. No auth cookies are set or read, removing CSRF as an applicable threat by design.
- Standard global security headers (`HSTS`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`) are set on all responses.
