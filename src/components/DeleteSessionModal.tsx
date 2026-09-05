'use client';

import { useState } from 'react';
import { authenticatedFetch } from '@/lib/firebase-client';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteSessionModalProps {
  sessionId: string;
  onClose: () => void;
  onDeleted: (sessionId: string) => void;
}

export default function DeleteSessionModal({
  sessionId,
  onClose,
  onDeleted,
}: DeleteSessionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-800/60 text-red-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-100">Delete Journal Session</h3>
            <p className="text-xs text-slate-400">
              This will permanently delete the session and its message subcollection.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800/60 rounded-xl text-red-300 text-xs">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-red-600/20 transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              'Confirm Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
