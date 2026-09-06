'use client';

import { useCallback, useState } from 'react';
import { JournalSession } from '@/server/firestore-db';
import { authenticatedFetch } from '@/lib/firebase-client';
import { MAX_TITLE_LENGTH } from '@/server/validation';

/**
 * Shared rename behaviour for the sidebar row AND the session header.
 *
 * This is a verbatim lift of the logic that lived inside Sidebar.tsx — same
 * PATCH endpoint, same client-side validation, same failure semantics:
 *   - empty / whitespace-only draft  → no request, revert
 *   - unchanged draft                → no request, exit edit mode
 *   - over MAX_TITLE_LENGTH          → local error, no request
 *   - non-OK response                → surface the server message, KEEP editing,
 *                                      never replace the previous title
 * The only addition is a transient `saved` flag that drives the "Saved" whisper.
 */
export function useRenameSession(onRenamed: (sessionId: string, title: string) => void) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const start = useCallback((session: Pick<JournalSession, 'sessionId' | 'title'>) => {
    setEditingId(session.sessionId);
    setDraft(session.title);
    setError(null);
    setSavedId(null);
  }, []);

  const cancel = useCallback(() => {
    setEditingId(null);
    setDraft('');
    setError(null);
  }, []);

  const commit = useCallback(
    async (session: Pick<JournalSession, 'sessionId' | 'title'>) => {
      if (savingId) return;
      const next = draft.trim();

      if (next.length === 0) {
        cancel();
        return;
      }
      if (next === session.title) {
        cancel();
        return;
      }
      if (next.length > MAX_TITLE_LENGTH) {
        setError(`Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
        return;
      }

      setSavingId(session.sessionId);
      setError(null);
      try {
        const res = await authenticatedFetch(`/api/entries/${session.sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: next }),
        });

        if (!res.ok) {
          let message = 'Rename failed. Please try again.';
          try {
            const data = await res.json();
            if (data && typeof data.error === 'string' && data.error.trim()) {
              message = data.error;
            }
          } catch {
            /* keep default message */
          }
          // Previous title is untouched in state; do not pretend success.
          setError(message);
          return;
        }

        onRenamed(session.sessionId, next);
        setEditingId(null);
        setDraft('');
        setError(null);
        setSavedId(session.sessionId);
        window.setTimeout(() => {
          setSavedId((current) => (current === session.sessionId ? null : current));
        }, 1000);
      } catch {
        setError('Rename failed. Please check your connection and try again.');
      } finally {
        setSavingId(null);
      }
    },
    [draft, savingId, cancel, onRenamed]
  );

  return {
    editingId,
    draft,
    setDraft,
    savingId,
    error,
    savedId,
    start,
    cancel,
    commit,
    maxLength: MAX_TITLE_LENGTH,
  };
}

export type RenameController = ReturnType<typeof useRenameSession>;
