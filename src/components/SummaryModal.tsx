'use client';

import { useState } from 'react';
import { JournalSession } from '@/server/firestore-db';
import { authenticatedFetch } from '@/lib/firebase-client';
import { Loader2, AlertCircle } from 'lucide-react';

interface SummaryModalProps {
  session: JournalSession;
  onClose: () => void;
  onSummaryUpdated: (summary: string) => void;
}

/**
 * Session Summary — now the "Summary" tab of the insight rail.
 *
 * File path, export name and props are unchanged so existing imports and tests
 * keep resolving. The fetch logic, the 409 message and the `onSummaryUpdated`
 * contract are a verbatim lift from the previous modal; only the presentation
 * changed (prose on the rail surface instead of a centered card).
 *
 * Error gate: while `error` is set, NO summary prose is rendered — stale content
 * can never be presented as the result of a failed generation.
 */
export default function SummaryModal({
  session,
  onClose,
  onSummaryUpdated,
}: SummaryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSummary, setCurrentSummary] = useState(session.summary || '');

  const handleGenerateSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await authenticatedFetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      if (res.status === 409) {
        setError('Summary generation is already in progress by another request.');
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate summary');
      }

      const data = await res.json();
      setCurrentSummary(data.summary);
      onSummaryUpdated(data.summary);
    } catch (err: any) {
      setError(err.message || 'Error triggering summary');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div aria-busy="true">
            <p className="font-mono text-label uppercase text-ink-3">Reading your session…</p>
            <div className="mt-3.5 h-0.5 overflow-hidden rounded-full bg-surface-hover">
              <div className="h-0.5 w-2/3 animate-shimmer bg-accent" />
            </div>
            <p className="mt-3.5 text-ui-sm text-ink-3">
              Gemini is re-reading your entries. This usually takes a few seconds.
            </p>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-sm border border-critical/30 bg-critical-quiet px-3.5 py-3"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-critical"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div>
              <p className="text-ui-sm text-ink">{error}</p>
              <p className="mt-1.5 text-ui-sm text-ink-3">
                Any previously saved summary is unchanged.
              </p>
              <button
                onClick={handleGenerateSummary}
                disabled={loading}
                className="mt-2.5 text-ui-sm text-accent underline-offset-4 hover:underline disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring"
              >
                Try again
              </button>
            </div>
          </div>
        ) : currentSummary ? (
          <div>
            <p className="font-mono text-label uppercase text-ink-3">Summary</p>
            <p className="mt-3 max-w-rail whitespace-pre-wrap font-serif text-journal-sm text-ink [text-wrap:pretty]">
              {currentSummary}
            </p>
          </div>
        ) : (
          <div>
            <p className="font-mono text-label uppercase text-ink-3">No summary yet</p>
            <p className="mt-2.5 max-w-rail text-ui-sm text-ink-2">
              A summary reads back what you actually wrote in this session — the turn in your
              thinking, in your own words.
            </p>
            <button
              onClick={handleGenerateSummary}
              disabled={loading}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-hairline-strong px-3.5 text-ui text-ink transition-colors duration-fast hover:bg-surface-hover disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Summarize this session
            </button>
          </div>
        )}
      </div>

      {(currentSummary || error) && (
        <div className="flex shrink-0 items-center justify-end border-t border-hairline px-6 py-3.5">
          <button
            onClick={handleGenerateSummary}
            disabled={loading}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-hairline-strong px-3 text-ui-sm text-ink-2 transition-colors duration-fast hover:bg-surface-hover hover:text-ink disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {loading && (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} aria-hidden="true" />
            )}
            Generate Summary
          </button>
        </div>
      )}
    </div>
  );
}
