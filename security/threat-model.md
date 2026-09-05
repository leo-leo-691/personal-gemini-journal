# Threat Model & Mitigations

| Threat | Mitigation |
|---|---|
| Hardcoded Gemini API key in source/bundle | Pinned Secret Manager version injected into Cloud Run; server-only env var |
| Cross-user data leakage in Firestore | Every query built strictly from verified UID path; least-privilege IAM; deny-all client rules as backstop |
| IDOR (session ID guessing/tampering) | Sessions resolved only under `users/{verifiedUid}/journalSessions/{id}` |
| UID spoofing | Server derives UID exclusively from `verifyIdToken()`; ignores body `uid` |
| Forged/stolen/expired tokens | `verifyIdToken()` on every route; generic 401 on failure |
| Replay/token misuse on deletion | Destructive operations use `verifyIdToken(token, { checkRevoked: true })` |
| Cross-Site Request Forgery (CSRF) | Authenticated via `Authorization: Bearer` header only (no cookies) |
| Prompt injection | System instruction treats journal text strictly as data; structured output validated |
| Oversized conversations / resource exhaustion | Bounded per-message length (~4,000 chars); bounded history retriever (`listRecentMessages`) |
| Abuse / cost control | Per-UID rate limiting + atomic Firestore transaction guard on summary generation |
| Orphaned data on deletion | Session deletion recursively removes `messages` subcollection docs |
| Excessive data exposure in errors | Generic client-facing errors; detailed tracebacks only in server logs |
| Missing baseline HTTP hardening | Standard global security headers (HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) |
