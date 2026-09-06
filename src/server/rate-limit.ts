/**
 * Best-effort in-memory, per-key rate limiter.
 *
 * IMPORTANT — SCOPE AND LIMITATIONS:
 * This limiter keeps its counters in the memory of a single Node.js process.
 * Cloud Run scales horizontally, so every running container has its own
 * independent counters. The effective global limit is therefore approximately
 *   (configured limit) x (number of active instances).
 *
 * This is an intentional trade-off. It provides meaningful, low-cost protection
 * against a single user hammering an expensive Gemini endpoint (runaway cost /
 * accidental client retry loops) without introducing a distributed dependency
 * (Redis, Firestore counters, Cloud Armor, API Gateway quotas).
 *
 * It is NOT a hard, globally-consistent quota. If a strict global guarantee is
 * required, replace `rateLimit()` with a shared-store implementation while
 * keeping the same signature.
 *
 * Counters also reset on container restart / cold start.
 */

interface Bucket {
  count: number;
  resetTime: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  limited: boolean;
  /** Seconds until the current window resets (only meaningful when limited). */
  retryAfterSeconds: number;
}

/**
 * Records one hit against `key` and reports whether the caller is over the limit.
 *
 * @param key       Caller-scoped identifier, e.g. `chat:<uid>`.
 * @param max       Maximum allowed hits per window.
 * @param windowMs  Sliding fixed-window length in milliseconds.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetTime) {
    buckets.set(key, { count: 1, resetTime: now + windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }

  if (bucket.count >= max) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetTime - now) / 1000)),
    };
  }

  bucket.count++;
  return { limited: false, retryAfterSeconds: 0 };
}

/**
 * Test-only helper to reset all counters between test cases.
 */
export function __resetRateLimitStore(): void {
  buckets.clear();
}
