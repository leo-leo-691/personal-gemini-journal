'use client';

import { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '@/lib/firebase-client';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteSessionModalProps {
  sessionId: string;
  onClose: () => void;
  onDeleted: (sessionId: string) => void;
  /** Optional so existing callers keep type-checking; quoted in the copy when present. */
  title?: string;
}

export default function DeleteSessionModal({
  sessionId,
  onClose,
  onDeleted,
  title,
}: DeleteSessionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm action, trap Tab inside the dialog, close on Escape, and
  // return focus to whatever was focused before opening.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose, loading]);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await authenticatedFetch(`/api/entries/${sessionId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete session');
      }

      onDeleted(sessionId);
    } catch (err: any) {
      setError(err.message || 'Error deleting session');
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-[var(--backdrop)] p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-session-title"
        className="w-full max-w-[440px] animate-modal-in rounded-xl border border-hairline bg-surface-raised p-6 shadow-overlay"
      >
        <div className="flex items-baseline gap-2.5">
          <AlertTriangle
            className="h-4 w-4 shrink-0 translate-y-0.5 text-critical"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h3 id="delete-session-title" className="font-serif text-heading text-ink">
            Delete this session?
          </h3>
        </div>

        <p className="mt-2.5 text-ui-sm text-ink-2">
          {title ? (
            <>
              <span className="font-serif text-[0.9375rem] text-ink">“{title}”</span> and all of
              its entries will be permanently removed. This can&apos;t be undone.
            </>
          ) : (
            <>
              This session and all of its entries will be permanently removed. This can&apos;t be
              undone.
            </>
          )}
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-sm border border-critical/30 bg-critical-quiet px-3.5 py-3 text-ui-sm text-ink"
          >
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="h-9 rounded-md px-3.5 text-ui text-ink-2 transition-colors duration-fast hover:bg-surface-hover hover:text-ink disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={handleDelete}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-critical-strong px-3.5 text-ui font-medium text-white transition-[filter] duration-fast hover:brightness-110 disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                Deleting…
              </>
            ) : (
              'Delete session'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
