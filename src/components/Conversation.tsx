'use client';

import { useEffect, useRef } from 'react';
import { JournalMessage } from '@/server/firestore-db';
import MessageTurn from '@/components/MessageTurn';

interface ConversationProps {
  messages: JournalMessage[];
  sending: boolean;
}

export default function Conversation({ messages, sending }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll the conversation container itself rather than calling
  // scrollIntoView, which can move the whole page.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-4 md:px-10 xl:px-gutter"
    >
      {messages.length === 0 && !sending ? (
        <p className="max-w-measure pt-2 font-serif text-journal italic text-ink-3">
          This page is yours. Start anywhere.
        </p>
      ) : (
        <section
          aria-label="Journal conversation"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          className="flex flex-col gap-11 pb-4 sm:gap-14"
        >
          {messages.map((msg) => (
            <MessageTurn key={msg.messageId} message={msg} />
          ))}

          {sending && (
            <div
              className="max-w-measure border-l border-hairline-strong pl-6 sm:pl-10"
              aria-live="polite"
            >
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                <p className="font-mono text-label uppercase text-accent">Gemini</p>
              </div>
              <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
                <span className="h-1 w-1 rounded-full bg-accent animate-dot" />
                <span className="h-1 w-1 rounded-full bg-accent animate-dot [animation-delay:150ms]" />
                <span className="h-1 w-1 rounded-full bg-accent animate-dot [animation-delay:300ms]" />
                <span className="ml-2 font-mono text-label text-ink-3">Reflecting…</span>
              </div>
              <span className="sr-only">Gemini is reflecting on your entry.</span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
