/**
 * Shared request-input validation helpers for API routes.
 */

/**
 * Strict safe-identifier format for Firestore document IDs supplied by clients.
 *
 * Firestore auto-generated IDs are 20-character alphanumeric strings. We accept
 * a slightly broader but still strict character set (`A-Z a-z 0-9 _ -`) and cap
 * the length at 128. This prevents:
 *   - path traversal when the value is passed to `.doc(id)` (a `/` in the value
 *     is interpreted by the Admin SDK as additional path segments),
 *   - oversized-key abuse,
 *   - injection of unexpected characters into Firestore reference paths.
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

/**
 * Maximum length for a user-supplied journal session title (post-trim).
 * Shared by the rename endpoint, session creation, and the Sidebar input.
 */
export const MAX_TITLE_LENGTH = 80;

/**
 * Maximum length of a single journal message (post-trim), in characters.
 *
 * Single source of truth for two limits that must agree:
 *   - the Firestore persistence cap in `appendMessage()`
 *   - the API input cap in `POST /api/chat`, applied *before* the message is
 *     persisted or sent to Gemini so an oversized payload is rejected outright
 *     rather than silently truncated.
 */
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * A valid session title is a non-empty (after trimming) string of at most
 * MAX_TITLE_LENGTH characters. Returns the trimmed title, or null if invalid.
 */
export function normalizeTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TITLE_LENGTH) return null;
  return trimmed;
}
