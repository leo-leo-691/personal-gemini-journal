'use client';

import { JournalMessage } from '@/server/firestore-db';
import { formatTime } from '@/lib/format-date';

/**
 * No bubbles, no avatars.
 *
 * The writer's voice: serif, full measure, on the canvas.
 * Gemini's voice: sans, indented behind a 1px hairline rule.
 * Both carry a visible mono speaker label (never icon-only, for screen readers
 * and for the "who said this" hierarchy).
 */
export default function MessageTurn({ message }: { message: JournalMessage }) {
  const isUser = message.role === 'user';
  const time = formatTime(message.ts);
  const pending = isUser && message.messageId.startsWith('temp-');

  if (isUser) {
    return (
      <article
        className={`max-w-measure animate-rise ${pending ? 'opacity-60' : ''}`}
        aria-label="Your journal entry"
      >
        <p className="font-mono text-label uppercase text-ink-3">
          You{time ? ` · ${time}` : ''}
        </p>
        <p className="mt-2.5 whitespace-pre-wrap font-serif text-journal text-ink [text-wrap:pretty]">
          {message.text}
        </p>
      </article>
    );
  }

  return (
    <article
      className="max-w-measure animate-rise border-l border-hairline-strong pl-6 sm:pl-10"
      aria-label="Gemini response"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        <p className="font-mono text-label uppercase text-accent">Gemini</p>
      </div>
      <p className="mt-2.5 whitespace-pre-wrap text-body text-ink-2 [text-wrap:pretty]">
        {message.text}
      </p>
    </article>
  );
}
