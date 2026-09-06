'use client';

import { useState } from 'react';
import { JournalSession } from '@/server/firestore-db';
import { authenticatedFetch, signOut } from '@/lib/firebase-client';
import { formatDate } from '@/lib/format-date';
import { useRenameSession } from '@/lib/useRenameSession';
import ThemeToggle from '@/components/ThemeToggle';
import { Plus, LogOut, Trash2, Pencil, X } from 'lucide-react';

interface SidebarProps {
  sessions: JournalSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onSessionCreated: (session: JournalSession) => void;
  onSessionRenamed: (sessionId: string, title: string) => void;
  onRequestDelete: (id: string) => void;
  /** Present on tablet/mobile, where the sidebar is a sheet. */
  onClose?: () => void;
  userEmail?: string | null;
  /** Google account photo (Firebase `user.photoURL`); falls back to a plain dot. */
  userPhotoURL?: string | null;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onSessionCreated,
  onSessionRenamed,
  onRequestDelete,
  onClose,
  userEmail,
  userPhotoURL,
}: SidebarProps) {
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const rename = useRenameSession(onSessionRenamed);

  const handleCreateSession = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      // No title sent: the server assigns a per-user distinguishable default
      // ("Journal 1", "Journal 2", …).
      const res = await authenticatedFetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const newSession = await res.json();
        onSessionCreated(newSession);
      } else {
        let message = 'Could not start a new session.';
        try {
          const data = await res.json();
          if (data && typeof data.error === 'string' && data.error.trim()) message = data.error;
        } catch {
          /* keep default */
        }
        setCreateError(message);
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      setCreateError('Could not start a new session. Check your connection.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside className="flex h-full w-full flex-col bg-surface md:border-r md:border-hairline">
      {/* Identity */}
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-accent-quiet">
          <span className="block h-2 w-2 rounded-[2px] bg-accent" aria-hidden="true" />
        </div>
        <h2 className="font-serif text-[1rem] tracking-[-0.01em] text-ink">Journal</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sessions"
            className="ml-auto grid h-8 w-8 place-items-center rounded-md text-ink-3 transition-colors duration-fast hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface md:hidden"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* New session — secondary, so the accent fill stays with the composer */}
      <div className="px-4 pb-5">
        <button
          onClick={handleCreateSession}
          disabled={creating}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-hairline-strong bg-surface-hover text-ui font-medium text-ink transition-colors duration-fast hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Plus className="h-4 w-4 text-ink-2" strokeWidth={1.5} aria-hidden="true" />
          {creating ? 'Starting…' : 'New journal session'}
        </button>
        {createError && (
          <p className="mt-2 font-mono text-label text-critical" role="alert">
            {createError}
          </p>
        )}
      </div>

      {/* Sessions */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {sessions.length === 0 ? (
          <p className="px-3 py-4 text-ui-sm text-ink-3">No journal sessions yet. Start one above.</p>
        ) : (
          <>
            <div className="px-3 pb-2.5 font-mono text-label uppercase text-ink-3">Your sessions</div>
            <ul className="flex flex-col gap-0.5">
              {sessions.map((session) => {
                const isActive = session.sessionId === activeSessionId;
                const isEditing = rename.editingId === session.sessionId;
                const isSaving = rename.savingId === session.sessionId;
                return (
                  <li key={session.sessionId}>
                    <div
                      className={`group relative rounded-md px-3 py-2.5 transition-colors duration-fast ${
                        isActive ? 'bg-accent-quiet' : 'hover:bg-surface-hover'
                      } ${isEditing ? '' : 'cursor-pointer'}`}
                      onClick={() => {
                        if (!isEditing) onSelectSession(session.sessionId);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        rename.start(session);
                      }}
                      role="button"
                      tabIndex={isEditing ? -1 : 0}
                      aria-current={isActive ? 'true' : undefined}
                      onKeyDown={(e) => {
                        if (isEditing) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectSession(session.sessionId);
                        }
                      }}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-3.5 h-4 w-0.5 rounded-full bg-accent"
                        />
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <input
                              aria-label="Session title"
                              autoFocus
                              value={rename.draft}
                              maxLength={rename.maxLength}
                              disabled={isSaving}
                              onClick={(e) => e.stopPropagation()}
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
                              className="w-full border-b border-hairline-strong bg-transparent pb-0.5 text-ui text-ink caret-accent focus:outline-none disabled:opacity-60"
                            />
                          ) : (
                            <p
                              className={`truncate text-ui ${
                                isActive ? 'font-medium text-ink' : 'text-ink-2 group-hover:text-ink'
                              }`}
                            >
                              {session.title}
                            </p>
                          )}
                          <p className="mt-0.5 font-mono text-meta text-ink-3">
                            {formatDate(session.updatedAt)}
                          </p>
                        </div>

                        {!isEditing && (
                          <div className="flex shrink-0 items-center opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover:opacity-100">
                            <button
                              aria-label="Rename session"
                              title="Rename session"
                              onClick={(e) => {
                                e.stopPropagation();
                                rename.start(session);
                              }}
                              className="grid h-7 w-7 place-items-center rounded-sm text-ink-3 transition-colors duration-fast hover:bg-surface-raised hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring"
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                            </button>
                            <button
                              aria-label="Delete session"
                              title="Delete session"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRequestDelete(session.sessionId);
                              }}
                              className="grid h-7 w-7 place-items-center rounded-sm text-ink-3 transition-colors duration-fast hover:bg-surface-raised hover:text-critical focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>

                      {isEditing && (
                        <div className="mt-1.5 flex items-center justify-between gap-3">
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
                      )}

                      {isEditing && rename.error && (
                        <p className="mt-1.5 font-mono text-label text-critical" role="alert">
                          {rename.error}
                        </p>
                      )}

                      {!isEditing && rename.savedId === session.sessionId && (
                        <p className="mt-1 font-mono text-label text-positive/75">Saved</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Account */}
      <div className="flex items-center gap-2.5 border-t border-hairline px-4 py-3.5">
        {userPhotoURL && !avatarBroken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={userPhotoURL}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setAvatarBroken(true)}
            className="h-6 w-6 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="h-6 w-6 shrink-0 rounded-full bg-surface-hover" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-ui-sm text-ink-3">
          {userEmail || 'Signed in'}
        </span>
        <ThemeToggle />
        <button
          onClick={() => signOut()}
          aria-label="Sign out"
          title="Sign out"
          className="grid h-8 w-8 place-items-center rounded-md text-ink-3 transition-colors duration-fast hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
