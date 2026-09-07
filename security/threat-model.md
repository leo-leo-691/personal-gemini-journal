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
| Missing baseline HTTP hardening | Standard global security headers (HSTS, `X-Content-Type-Options`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy) plus a per-request nonce CSP (`src/middleware.ts`): `script-src` has no `'unsafe-inline'` / `'unsafe-eval'` |
| Oversized message reaching Gemini before the persistence cap | `POST /api/chat` rejects any message longer than `MAX_MESSAGE_LENGTH` (single source of truth in `src/server/validation.ts`) **before** `generateReply()` / `appendMessage()`; no silent truncation |
| Summary lock wedged by a crashed request | `beginSummary()` uses a 5-minute timestamped lease (`summaryInProgress` + `summaryStartedAt`), mirroring the Action Intelligence lease; a stale lease is reclaimed atomically inside the transaction |

---

## Known / Tracked Issues

These were identified during the final security-remediation pass and **deliberately
not changed** in it, because the only available fixes are major version bumps /
destabilizing downgrades that are out of scope for a hardening pass on a live
production deployment. Each should be scheduled as its own change with independent
verification.

| # | Advisory / issue | Affected dependency chain | Reachability in this app | Fix | Planned remediation |
|---|---|---|---|---|---|
| K1 | `uuid` — missing buffer bounds check in `v3`/`v5`/`v6` when `buf` is provided (moderate) | `firebase-admin` → `@google-cloud/firestore` → `google-gax` → `uuid`; also `@google/genai` → `google-auth-library` → `gaxios` → `uuid`; and `firebase-admin` → `@google-cloud/storage` → `teeny-request` → `uuid` | **Not reachable.** All three consumers call only `uuid.v4()` (verified against the installed builds); none call the vulnerable `v3`/`v5`/`v6` buffered API, and none pass a `buf` argument. The `@google-cloud/storage` chain is entirely dead code — the app uses no Firebase/Cloud Storage. | Clean fix requires **`firebase-admin@14.x` (semver-major)**. | Upgrade `firebase-admin` 12 → 14 as a dedicated change, with a full auth + Firestore integration re-verification. Deferred. |
| K2 | `firebase-admin` / `google-gax` / `gaxios` (moderate) | direct `firebase-admin@12.7.0` and its Google client libraries | Flagged transitively (via `uuid` + `@google-cloud/*`), not a direct bug in firebase-admin. Token verification and Firestore access paths are unaffected. | `firebase-admin@14.3.0` (**semver-major**). `npm audit fix` (no `--force`) does **not** apply it. | Same as K1 — bundled into the `firebase-admin` 12 → 14 upgrade. Deferred. |
| K3 | `undici` — multiple advisories incl. WebSocket DoS / request smuggling (high) | transitive via `firebase-admin` and `firebase` | Not directly used by app code. The Admin SDK's HTTP calls to Google endpoints are server-to-Google only. | `npm audit fix` (no `--force`) would **downgrade `undici` 6.19.7 → 5.28.4** (a worse, older major) and downgrade `firebase` / `@firebase/auth` — rejected as destabilizing. A forward fix needs newer `firebase` / `firebase-admin` majors. | Resolve as part of the `firebase` 10 → 12 and `firebase-admin` 12 → 14 upgrades. Deferred. |
| K4 | `next` — large advisory set incl. "Authorization Bypass in Next.js Middleware" (critical, `<14.2.25`) and "XSS in App Router apps using CSP nonces" (moderate) | direct `next@14.2.3` | Mostly **not reachable**: no `next/image` / Image Optimization API, no Server Actions, no i18n, no Pages Router. The middleware added in this pass is **CSP-only (no authorization logic)** — an `x-middleware-subrequest` bypass would only skip CSP-header injection (degrading to no CSP), not bypass auth, which is enforced in every route handler via `verifyIdToken()`. The CSP-nonce XSS requires a user-controlled-data → render path; the app has none (all user text is React-escaped; the only `dangerouslySetInnerHTML` is a static string). | `next@14.2.35` (**semver-minor, non-major**) closes the critical/high items with 14.x backports. The CSP-nonce XSS backport / full fix is in later releases. | **Recommended:** bump `next` 14.2.3 → 14.2.35 as a dedicated change, re-run build + the CSP nonce verification, then deploy. A `next` 15.x major is a separate evaluation. Deferred from this pass because the "do not modify `package.json` / lockfile" constraint and one-change-at-a-time discipline applied. |
| K5 | Dev-only: `esbuild` / `vite` / `vite-node` / `vitest` (moderate), `glob` / `minimatch` / `@typescript-eslint/*` via `eslint-config-next` (high) | `devDependencies` only (`vitest`, `eslint-config-next`) | **Not shipped.** These run only in local test / lint; they are not in the production image (`Dockerfile` builds from `package.json` and the standalone output, which excludes dev deps). The `esbuild` advisory is a local dev-server SSRF; there is no exposed dev server in CI/prod. | `vitest@5` and `eslint-config-next@16` are **semver-major**. | Upgrade the test/lint toolchain as a routine, non-security-critical maintenance change. Deferred. |

**`@google/genai`** (`0.2.0`) has **no** advisory in `npm audit`. It was left unchanged: a jump to the current `2.x` line is a large, speculative major migration with no security or compatibility trigger, and the current `ai.models.generateContent({ systemInstruction, responseMimeType, … })` usage plus `finishReason` handling and error mapping all work (build + Gemini tests pass). Do not upgrade it without a concrete reason.
