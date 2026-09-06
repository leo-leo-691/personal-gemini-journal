'use client';

import { JournalSession } from '@/server/firestore-db';
import { RenameController } from '@/lib/useRenameSession';
import { formatLongDate, formatTime, DATE_UNAVAILABLE } from '@/lib/format-date';
import { FileText, Brain, Trash2, Pencil, Menu } from 'lucide-react';

interface SessionHeaderProps {
  session: JournalSession;
  rename: RenameController;
  onOpenSummary: () => void;
  onOpenActionPlan: () => void;
  onRequestDelete: () => void;
  onOpenSidebar?: () => void;
  activeRailTab?: 'summary' | 'actions' | null;
}

/**
 * The large heading contains ONLY the session title.
 * Exactly one small metadata line sits beneath it, in mono, built from
 * `updatedAt` via the safe parser — never "Invalid Date", never a second date.
 */
export default function SessionHeader({
  session,
  rename,
  onOpenSummary,
  onOpenActionPlan,
  onRequestDelete,
  onOpenSidebar,
  activeRailTab,
}: SessionHeaderProps) {
  const isEditing = rename.editingId === session.sessionId;
  const isSaving = rename.savingId === session.sessionId;

  const dateLabel = formatLongDate(session.updatedAt);
  const timeLabel = formatTime(session.updatedAt);
  const meta =
    dateLabel === DATE_UNAVAILABLE
      ? DATE_UNAVAILABLE
      : timeLabel
      ? `${dateLabel} · last written ${timeLabel}`
      : dateLabel;

  const tab = (active: boolean) =>
    `hidden h-9 items-center gap-2 rounded-md px-3 text-ui transition-colors duration-fast sm:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
      active ? 'bg-surface-hover text-ink' : 'text-ink-2 hover:bg-surface-hover hover:text-ink'
    }`;

  return (
    <header className="flex items-start justify-between gap-6 px-6 pb-4 pt-5 md:px-10 xl:px-gutter">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {onOpenSidebar && (
            <button
              type="button"
              onClick={onOpenSidebar}
              aria-label="Open sessions"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-2 transition-colors duration-fast hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring md:hidden"
            >
              <Menu className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}

          {isEditing ? (
            <input
              aria-label="Session title"
              autoFocus
              value={rename.draft}
              maxLength={rename.maxLength}
              disabled={isSaving}
              onChange={(e) => rename.setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  rename.commit(session);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  rename.cancel();
                }
              }}
              onBlur={() => rename.commit(session)}
              className="w-full min-w-0 border-b border-hairline-strong bg-transparent pb-1 font-serif text-title text-ink caret-accent focus:outline-none disabled:opacity-60"
            />
          ) : (
            <div className="group flex min-w-0 items-center gap-2">
              <h1
                className="min-w-0 truncate font-serif text-title text-ink"
                onDoubleClick={() => rename.start(session)}
                title={session.title}
              >
                {session.title}
              </h1>
              <button
                type="button"
                aria-label="Rename session"
                title="Rename session (⌘E)"
                onClick={() => rename.start(session)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-ink-3 opacity-0 transition-opacity duration-fast hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring group-hover:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              </button>
              {rename.savedId === session.sessionId && (
                <span className="shrink-0 font-mono text-label text-positive/75">Saved</span>
              )}
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="mt-1.5 flex items-center gap-4">
            <span className="font-mono text-label text-ink-3">
              {isSaving ? 'Saving…' : '⏎ save · esc revert'}
            </span>
            {rename.draft.length >= rename.maxLength * 0.9 && (
              <span
                aria-live="polite"
                className={`font-mono text-label ${
                  rename.draft.length > rename.maxLength ? 'text-critical' : 'text-ink-3'
                }`}
              >
                {rename.draft.length}/{rename.maxLength}
              </span>
            )}
          </div>
        ) : (
          <p className="mt-1.5 font-mono text-meta text-ink-3">{meta}</p>
        )}

        {isEditing && rename.error && (
          <p className="mt-1.5 font-mono text-label text-critical" role="alert">
            {rename.error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onOpenSummary}
          className={tab(activeRailTab === 'summary')}
          aria-label="Open session summary"
        >
          <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          Summary
        </button>
        <button
          onClick={onOpenActionPlan}
          className={tab(activeRailTab === 'actions')}
          aria-label="Open action intelligence"
        >
          <Brain className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          Reflection
        </button>
        <button
          onClick={onOpenActionPlan}
          aria-label="Open reflection"
          className="grid h-8 w-8 place-items-center rounded-md text-ink-2 transition-colors duration-fast hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring sm:hidden"
        >
          <Brain className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          onClick={onRequestDelete}
          aria-label="Delete session"
          title="Delete session"
          className="grid h-8 w-8 place-items-center rounded-md text-ink-3 transition-colors duration-fast hover:bg-surface-hover hover:text-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
