'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auth, authenticatedFetch } from '@/lib/firebase-client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { JournalSession, JournalMessage, ActionIntelligenceSchema } from '@/server/firestore-db';
import Sidebar from '@/components/Sidebar';
import ChatPanel from '@/components/ChatPanel';
import InsightRail, { RailTab } from '@/components/InsightRail';
import DeleteSessionModal from '@/components/DeleteSessionModal';
import { Menu } from 'lucide-react';

/** Indeterminate 2px hairline across the top of the viewport — replaces the
 *  full-screen boot spinner. */
function BootHairline({ label }: { label: string }) {
  return (
    <div className="fixed inset-x-0 top-0 z-50" role="status" aria-live="polite">
      <div className="h-0.5 overflow-hidden bg-transparent">
        <div className="h-0.5 w-1/3 animate-sweep bg-accent" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default function JournalPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<JournalSession | null>(null);
  const [messages, setMessages] = useState<JournalMessage[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Rail replaces the two centered modals.
  const [railOpen, setRailOpen] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>('summary');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load active session detail & messages
  const fetchSessionDetail = useCallback(async () => {
    if (!activeSessionId || !user) return;
    setDataLoading(true);
    setDetailError(null);
    try {
      const res = await authenticatedFetch(`/api/entries/${activeSessionId}`);
      if (res.ok) {
        const detail = await res.json();
        setActiveSession(detail);
        setMessages(detail.messages || []);
      } else {
        let message = 'Could not open this session.';
        try {
          const data = await res.json();
          if (data && typeof data.error === 'string' && data.error.trim()) message = data.error;
        } catch {
          /* keep default */
        }
        setDetailError(message);
      }
    } catch (err) {
      console.error('Failed to fetch session detail:', err);
      setDetailError('Could not open this session. Check your connection.');
    } finally {
      setDataLoading(false);
    }
  }, [activeSessionId, user]);

  useEffect(() => {
    fetchSessionDetail();
  }, [fetchSessionDetail]);

  // Keyboard: ⌘I / Ctrl+I toggles the rail; Escape closes overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setRailOpen((open) => !open);
      } else if (e.key === 'Escape') {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSessionCreated = (newSession: JournalSession) => {
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.sessionId);
    setSidebarOpen(false);
  };

  const handleNewMessage = (msg: JournalMessage) => {
    setMessages((prev) => [...prev, msg]);
  };

  /** Removes an optimistic message whose POST never succeeded. The draft is
   *  restored by the composer, so nothing the user wrote is lost. */
  const handleMessageFailed = (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.messageId !== messageId));
  };

  const handleSessionRenamed = (sessionId: string, title: string) => {
    setSessions((prev) => prev.map((s) => (s.sessionId === sessionId ? { ...s, title } : s)));
    setActiveSession((prev) => (prev && prev.sessionId === sessionId ? { ...prev, title } : prev));
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
      setRailOpen(false);
    }
    setDeletingSessionId(null);
  };

  const openRail = (tab: RailTab) => {
    setRailTab(tab);
    setRailOpen(true);
  };

  const deletingSession = sessions.find((s) => s.sessionId === deletingSessionId) || null;

  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-canvas">
        <BootHairline label="Verifying your session" />
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-canvas">
      {/* Sidebar — static column from md up, sheet below */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 animate-fade bg-[var(--backdrop)] md:hidden"
          onMouseDown={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`${
          sidebarOpen
            ? 'fixed inset-y-0 left-0 z-40 flex w-[86%] max-w-[320px] shadow-overlay'
            : 'hidden'
        } md:static md:z-auto md:flex md:w-[300px] md:max-w-none md:shrink-0 md:shadow-none`}
      >
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => {
            setActiveSessionId(id);
            setSidebarOpen(false);
          }}
          onSessionCreated={handleSessionCreated}
          onSessionRenamed={handleSessionRenamed}
          onRequestDelete={(id) => setDeletingSessionId(id)}
          onClose={() => setSidebarOpen(false)}
          userEmail={user?.email ?? null}
          userPhotoURL={user?.photoURL ?? null}
        />
      </div>

      {/* Journal column */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {dataLoading ? (
          <div className="flex-1 px-6 pt-10 md:px-10 xl:px-gutter" aria-busy="true">
            <p className="font-mono text-label uppercase text-ink-3">Loading session</p>
            <div className="mt-5 flex max-w-measure flex-col gap-3.5" aria-hidden="true">
              <div className="h-3 w-1/4 animate-shimmer rounded-xs bg-surface-hover" />
              <div className="h-3 w-3/5 animate-shimmer rounded-xs bg-surface-hover [animation-delay:200ms]" />
              <div className="h-3 w-2/5 animate-shimmer rounded-xs bg-surface-hover [animation-delay:400ms]" />
            </div>
          </div>
        ) : detailError ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div
              role="alert"
              className="max-w-prose34 rounded-sm border border-critical/30 bg-critical-quiet px-4 py-3.5 text-ui-sm text-ink"
            >
              {detailError}{' '}
              <button
                onClick={fetchSessionDetail}
                className="text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring"
              >
                Retry
              </button>
            </div>
          </div>
        ) : activeSession ? (
          <ChatPanel
            session={activeSession}
            messages={messages}
            onNewMessage={handleNewMessage}
            onMessageFailed={handleMessageFailed}
            onSessionRenamed={handleSessionRenamed}
            onOpenSummary={() => openRail('summary')}
            onOpenActionPlan={() => openRail('actions')}
            onRequestDelete={() => setDeletingSessionId(activeSession.sessionId)}
            onOpenSidebar={() => setSidebarOpen(true)}
            activeRailTab={railOpen ? railTab : null}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sessions"
              className="absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-md text-ink-2 hover:bg-surface-hover md:hidden"
            >
              <Menu className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <div className="grid h-8 w-8 place-items-center rounded-md bg-accent-quiet">
              <span className="block h-2.5 w-2.5 rounded-[2px] bg-accent" aria-hidden="true" />
            </div>
            <h2 className="mt-4 font-serif text-[1.375rem] tracking-[-0.01em] text-ink">
              Nothing written yet
            </h2>
            <p className="mt-2 max-w-prose34 text-ui-sm text-ink-3">
              Sessions are private, and there&apos;s no right way to start one.
            </p>
          </div>
        )}
      </main>

      {/* Insight rail — in flow at xl, overlay below. Single mount, so each tab
          keeps its own loading/error state across breakpoints. */}
      {railOpen && activeSession && (
        <>
          <div
            className="fixed inset-0 z-30 animate-fade bg-[var(--backdrop)] xl:hidden"
            onMouseDown={() => setRailOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] shadow-overlay xl:static xl:z-auto xl:w-[380px] xl:max-w-none xl:shrink-0 xl:shadow-none">
            <InsightRail
              session={activeSession}
              tab={railTab}
              onTabChange={setRailTab}
              onClose={() => setRailOpen(false)}
              onSummaryUpdated={handleSummaryUpdated}
              onActionPlanUpdated={handleActionPlanUpdated}
            />
          </div>
        </>
      )}

      {deletingSessionId && (
        <DeleteSessionModal
          sessionId={deletingSessionId}
          title={
            deletingSession?.title ??
            (activeSession?.sessionId === deletingSessionId ? activeSession.title : undefined)
          }
          onClose={() => setDeletingSessionId(null)}
          onDeleted={handleSessionDeleted}
        />
      )}
    </div>
  );
}
