'use client';

import { useRef, useState } from 'react';
import { JournalMessage, JournalSession } from '@/server/firestore-db';
import { authenticatedFetch } from '@/lib/firebase-client';
import { ArrowUp, Loader2, AlertCircle } from 'lucide-react';

interface ComposerProps {
  session: JournalSession;
  onNewMessage: (msg: JournalMessage) => void;
  /** Removes an optimistic message that never reached the server. */
  onMessageFailed?: (messageId: string) => void;
  onSendingChange?: (sending: boolean) => void;
}

const MAX_ROWS = 8;

export default function Composer({
  session,
  onNewMessage,
  onMessageFailed,
  onSendingChange,
}: ComposerProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setBusy = (value: boolean) => {
    setSending(value);
    onSendingChange?.(value);
  };

  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 29; // 17px serif at 1.7
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * MAX_ROWS)}px`;
  };

  const send = async (text: string) => {
    const tempId = `temp-${Date.now()}`;
    const tempMsg: JournalMessage = {
      messageId: tempId,
      role: 'user',
      text,
      ts: new Date().toISOString(),
    };

    setError(null);
    setBusy(true);
    onNewMessage(tempMsg);

    try {
      const res = await authenticatedFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          message: text,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          onNewMessage(data.message);
        }
        return;
      }

      // Failure: surface the server's own message verbatim, drop the optimistic
      // turn, and give the draft back to the writer. Nothing is hidden.
      let message = 'That entry did not reach the server. Nothing was lost.';
      try {
        const data = await res.json();
        if (data && typeof data.error === 'string' && data.error.trim()) message = data.error;
      } catch {
        /* keep default */
      }
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter) message = `${message} Try again in ${retryAfter}s.`;
      }
      onMessageFailed?.(tempId);
      setInput(text);
      setError(message);
    } catch (err) {
      console.error('Chat error:', err);
      onMessageFailed?.(tempId);
      setInput(text);
      setError('That entry did not reach the server. Check your connection — nothing was lost.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    send(text);
  };

  const retry = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    send(text);
  };

  return (
    <div className="px-6 pb-6 pt-5 md:px-10 xl:px-gutter">
      <form onSubmit={handleSubmit} className="max-w-measure">
        <div className="rounded-lg border border-hairline bg-surface p-4 transition-colors duration-fast focus-within:border-hairline-strong">
          <label htmlFor="journal-composer" className="sr-only">
            Write a journal entry
          </label>
          <textarea
            id="journal-composer"
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder="Write what's on your mind…"
            aria-busy={sending}
            className="block w-full resize-none bg-transparent font-serif text-journal-sm text-ink caret-accent outline-none placeholder:font-serif placeholder:italic placeholder:text-ink-3"
          />

          <div className="mt-3.5 flex items-center justify-between gap-4">
            <span className="font-mono text-label text-ink-3">
              {sending ? 'Sending…' : '⏎ send · ⇧⏎ new line'}
            </span>
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send journal entry"
              className="grid h-11 w-11 place-items-center rounded-md bg-accent-strong text-accent-on transition-[filter,transform] duration-fast hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:h-8 sm:w-8"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2.5 rounded-sm border border-critical/30 bg-critical-quiet px-3.5 py-3"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-critical"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="text-ui-sm text-ink">
              {error}{' '}
              <button
                type="button"
                onClick={retry}
                disabled={!input.trim() || sending}
                className="text-accent underline-offset-4 hover:underline disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring"
              >
                Retry
              </button>
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
