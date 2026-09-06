'use client';

import { useEffect, useState } from 'react';
import { JournalMessage, JournalSession } from '@/server/firestore-db';
import { useRenameSession } from '@/lib/useRenameSession';
import SessionHeader from '@/components/SessionHeader';
import Conversation from '@/components/Conversation';
import Composer from '@/components/Composer';

interface ChatPanelProps {
  session: JournalSession;
  messages: JournalMessage[];
  onNewMessage: (msg: JournalMessage) => void;
  onOpenSummary: () => void;
  onOpenActionPlan: () => void;
  onRequestDelete: () => void;
  /** Optional: kept out of the required set so existing callers/tests still type-check. */
  onSessionRenamed?: (sessionId: string, title: string) => void;
  onMessageFailed?: (messageId: string) => void;
  onOpenSidebar?: () => void;
  activeRailTab?: 'summary' | 'actions' | null;
}

/**
 * Composition wrapper: header + conversation + composer.
 * The props contract is unchanged; only the internals were split out.
 */
export default function ChatPanel({
  session,
  messages,
  onNewMessage,
  onOpenSummary,
  onOpenActionPlan,
  onRequestDelete,
  onSessionRenamed,
  onMessageFailed,
  onOpenSidebar,
  activeRailTab = null,
}: ChatPanelProps) {
  const [sending, setSending] = useState(false);
  const rename = useRenameSession(onSessionRenamed ?? (() => {}));

  // ⌘E / Ctrl+E starts renaming the current session, wherever focus is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        rename.start(session);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rename, session]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-canvas">
      <SessionHeader
        session={session}
        rename={rename}
        onOpenSummary={onOpenSummary}
        onOpenActionPlan={onOpenActionPlan}
        onRequestDelete={onRequestDelete}
        onOpenSidebar={onOpenSidebar}
        activeRailTab={activeRailTab}
      />
      <Conversation messages={messages} sending={sending} />
      <Composer
        session={session}
        onNewMessage={onNewMessage}
        onMessageFailed={onMessageFailed}
        onSendingChange={setSending}
      />
    </div>
  );
}
