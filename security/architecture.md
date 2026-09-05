# System Architecture & Design Decisions

## High-Level Component Diagram

```
                         PERSONAL GEMINI JOURNAL

                                Browser
                                   |
                           Firebase Auth SDK
                                   |
                              Firebase ID Token
                                   |
                                   v
                         +----------------------+
                         |      Cloud Run       |
                         |      Next.js         |
                         |                      |
                         |  verifyIdToken()     |
                         |  Security headers    |
                         |  API routes          |
                         |  Input validation    |
                         |  Rate limiting       |
                         +----------+-----------+
                                    |
                     +--------------+--------------+
                     |                             |
                     v                             v
             Firebase Admin SDK              Google Gen AI SDK
             via ADC (Cloud Run               (@google/genai)
             runtime service account)               |
                     |                               |
                     v                               v
                Firestore                       Gemini API
                     |
              UID-scoped paths
              users/{uid}/journalSessions/{id}/messages/{id}


                 Secret Manager
                       |
                       | pinned version injection
                       v
                    Cloud Run
                 GEMINI_API_KEY (env var, server-only)
```

## Security & Architecture Decisions

### 1. CSRF Decision
CSRF attacks exploit ambient browser credentials (cookies). This application never sets or reads auth cookies and authenticates strictly via `Authorization: Bearer <Firebase ID Token>` attached by first-party code (`authenticatedFetch()`). Third-party sites cannot read or attach this token, mitigating CSRF by design.

### 2. Token Revocation Policy
Default `verifyIdToken()` is used for read/write endpoints to minimize latency. Destructive operations (session deletion) enforce `checkRevoked: true` to reject revoked/disabled accounts immediately even if the token has not expired.

### 3. Subcollection Cleanup Decision
Firestore does not automatically cascade-delete subcollections. `deleteSessionWithMessages()` reads all docs in `messages` subcollection and batch-deletes them before deleting the parent session document.
