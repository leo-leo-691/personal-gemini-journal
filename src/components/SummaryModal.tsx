'use client';

import { useState } from 'react';
import { JournalSession } from '@/server/firestore-db';
import { authenticatedFetch } from '@/lib/firebase-client';
import { X, FileText, Sparkles, Loader2 } from 'lucide-react';

interface SummaryModalProps {
  session: JournalSession;
  onClose: () => void;
  onSummaryUpdated: (summary: string) => void;
}

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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-slate-100">Session Summary</h2>
              <p className="text-[11px] text-slate-400">Explicit, user-triggered reflection summary</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/60 rounded-xl text-red-300 text-xs">
              {error}
            </div>
          )}

          {currentSummary ? (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 text-xs leading-relaxed text-slate-300">
              {currentSummary}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
              No summary has been generated for this session yet. Click below to generate one.
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" /> Guaranteed atomic transaction guard
            </span>
            <button
              onClick={handleGenerateSummary}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 px-4 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Summary'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
