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
- Summary generation and action plan generation are each guarded by a Firestore transaction lease (`summaryInProgress` + `summaryStartedAt`, `actionPlanInProgress` + `actionPlanStartedAt`). Dual/racing requests for the same session return an immediate 409 Conflict without invoking Gemini. The lease is time-bounded (5 minutes): a lock orphaned by a dead process is reclaimed atomically inside the transaction instead of wedging the session permanently.

### 5. CSRF & Security Headers
- Authentication uses `Authorization: Bearer` headers exclusively. No auth cookies are set or read, removing CSRF as an applicable threat by design.
- Standard global security headers (`HSTS`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) are set on all responses via `next.config.js`.
- `Content-Security-Policy` is set per request in `src/middleware.ts` so it can carry a fresh nonce. `script-src` contains no `'unsafe-inline'` and no `'unsafe-eval'`; the single inline bootstrap script (pre-hydration theme resolution) carries the request nonce. `style-src 'unsafe-inline'` is retained and documented (inline `style` attribute on the auth screen and Next.js built-in error pages, neither of which can carry a nonce).

---

## Google AI Studio Configuration

Google AI Studio was configured with a "Production Security Constitution" as the
Phase 1 system-instruction preset for this challenge. See
[`ai-studio-config.md`](./ai-studio-config.md) for the **verbatim** instructions
as entered into AI Studio, the screenshot evidence
(`ai-studio-config-1.png`, `ai-studio-config-2.png`), and how each area
(threat modeling, authentication/authorization, data isolation, secret
management, AI/prompt security, input/API security, cloud security, verification)
maps to the implemented controls in this repository.

The AI Studio system instruction is a development-time constitution for how code
was generated and reviewed. It is distinct from the **runtime** Gemini system
instruction in [`../src/server/gemini.ts`](../src/server/gemini.ts), which governs
the journal assistant's behaviour on live user requests.

Chronology note: the initial application prototype was committed on 2026-09-05;
the AI Studio configuration file and screenshots were added to the repository on
2026-09-07. The configuration is genuine, but the repository does not assert that
it existed before the first line of application code was written.
