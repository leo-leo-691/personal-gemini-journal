'use client';

import { useState } from 'react';
import { JournalSession } from '@/server/firestore-db';
import { authenticatedFetch, signOut } from '@/lib/firebase-client';
import { Plus, BookOpen, LogOut, Trash2, Sparkles } from 'lucide-react';

interface SidebarProps {
  sessions: JournalSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onSessionCreated: (session: JournalSession) => void;
  onRequestDelete: (id: string) => void;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onSessionCreated,
  onRequestDelete,
}: SidebarProps) {
  const [creating, setCreating] = useState(false);

  const handleCreateSession = async () => {
    setCreating(true);
    try {
      const res = await authenticatedFetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Journal Entry - ${new Date().toLocaleDateString()}` }),
      });
      if (res.ok) {
        const newSession = await res.json();
        onSessionCreated(newSession);
      }
    } catch (err) {
      console.error('Failed to create session:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-slate-100">Gemini Journal</h2>
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
              v3 ADC Secure
            </span>
          </div>
        </div>
      </div>

      {/* New Session Button */}
      <div className="p-4">
        <button
          onClick={handleCreateSession}
          disabled={creating}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Creating...' : 'New Journal Session'}
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1">
        <div className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold text-slate-500">
          Your Sessions
        </div>
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">
            No journal sessions yet. Click above to start!
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.sessionId === activeSessionId;
            return (
              <div
                key={session.sessionId}
                className={`group relative flex items-center justify-between p-3 rounded-xl cursor-pointer text-xs transition-all ${
                  isActive
                    ? 'bg-slate-800/90 text-slate-100 border border-slate-700 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                }`}
                onClick={() => onSelectSession(session.sessionId)}
              >
                <div className="flex items-center gap-2.5 truncate pr-6">
                  <BookOpen className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <div className="truncate">
                    <p className="font-medium truncate">{session.title}</p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(session.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDelete(session.sessionId);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity text-slate-500"
                  title="Delete Session"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer / Sign Out */}
      <div className="p-4 border-t border-slate-800">
        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4 text-slate-500" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
