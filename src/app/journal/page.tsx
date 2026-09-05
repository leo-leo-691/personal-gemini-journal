'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, authenticatedFetch } from '@/lib/firebase-client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { JournalSession, JournalMessage, ActionIntelligenceSchema } from '@/server/firestore-db';
import Sidebar from '@/components/Sidebar';
import ChatPanel from '@/components/ChatPanel';
import SummaryModal from '@/components/SummaryModal';
import ActionPlanPanel from '@/components/ActionPlanPanel';
import DeleteSessionModal from '@/components/DeleteSessionModal';
import { Sparkles, Loader2 } from 'lucide-react';

export default function JournalPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<JournalSession | null>(null);
  const [messages, setMessages] = useState<JournalMessage[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Modals state
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showActionPlanModal, setShowActionPlanModal] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/login');
      } else {
        setUser(currentUser);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Load sessions list
  const loadSessions = async () => {
    try {
      const res = await authenticatedFetch('/api/entries');
      if (res.ok) {
        const list: JournalSession[] = await res.json();
        setSessions(list);
        if (list.length > 0 && !activeSessionId) {
          setActiveSessionId(list[0].sessionId);
        }
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  // Load active session detail & messages
  useEffect(() => {
    if (!activeSessionId || !user) return;

    const fetchSessionDetail = async () => {
      setDataLoading(true);
      try {
        const res = await authenticatedFetch(`/api/entries/${activeSessionId}`);
        if (res.ok) {
          const detail = await res.json();
          setActiveSession(detail);
          setMessages(detail.messages || []);
        }
      } catch (err) {
        console.error('Failed to fetch session detail:', err);
      } finally {
        setDataLoading(false);
      }
    };

    fetchSessionDetail();
  }, [activeSessionId, user]);

  const handleSessionCreated = (newSession: JournalSession) => {
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.sessionId);
  };

  const handleNewMessage = (msg: JournalMessage) => {
    setMessages((prev) => [...prev, msg]);
  };

  const handleSummaryUpdated = (summaryText: string) => {
    if (activeSession) {
      setActiveSession((prev) => (prev ? { ...prev, summary: summaryText } : null));
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === activeSession.sessionId ? { ...s, summary: summaryText } : s))
      );
    }
  };

  const handleActionPlanUpdated = (plan: ActionIntelligenceSchema) => {
    if (activeSession) {
      setActiveSession((prev) => (prev ? { ...prev, actionIntelligence: plan } : null));
    }
  };

  const handleSessionDeleted = (deletedId: string) => {
    setSessions((prev) => prev.filter((s) => s.sessionId !== deletedId));
    if (activeSessionId === deletedId) {
      const remaining = sessions.filter((s) => s.sessionId !== deletedId);
      setActiveSessionId(remaining.length > 0 ? remaining[0].sessionId : null);
      setActiveSession(null);
      setMessages([]);
    }
    setDeletingSessionId(null);
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-xs">Verifying session...</span>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-slate-950">
      {/* Sidebar */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => setActiveSessionId(id)}
        onSessionCreated={handleSessionCreated}
        onRequestDelete={(id) => setDeletingSessionId(id)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full relative">
        {dataLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
            Loading journal session...
          </div>
        ) : activeSession ? (
          <ChatPanel
            session={activeSession}
            messages={messages}
            onNewMessage={handleNewMessage}
            onOpenSummary={() => setShowSummaryModal(true)}
            onOpenActionPlan={() => setShowActionPlanModal(true)}
            onRequestDelete={() => setDeletingSessionId(activeSession.sessionId)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
            <Sparkles className="w-8 h-8 text-indigo-400 mb-1" />
            <h2 className="text-base font-semibold text-slate-200">No active journal session</h2>
            <p className="text-xs text-slate-400 max-w-sm">
              Select an existing session from the sidebar or click &quot;New Journal Session&quot; to begin.
            </p>
          </div>
        )}
      </main>

      {/* Modals */}
      {showSummaryModal && activeSession && (
        <SummaryModal
          session={activeSession}
          onClose={() => setShowSummaryModal(false)}
          onSummaryUpdated={handleSummaryUpdated}
        />
      )}

      {showActionPlanModal && activeSession && (
        <ActionPlanPanel
          session={activeSession}
          onClose={() => setShowActionPlanModal(false)}
          onActionPlanUpdated={handleActionPlanUpdated}
        />
      )}

      {deletingSessionId && (
        <DeleteSessionModal
          sessionId={deletingSessionId}
          onClose={() => setDeletingSessionId(null)}
          onDeleted={handleSessionDeleted}
        />
      )}
    </div>
  );
}
