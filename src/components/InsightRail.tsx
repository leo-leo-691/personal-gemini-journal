'use client';

import { useEffect, useRef } from 'react';
import { JournalSession, ActionIntelligenceSchema } from '@/server/firestore-db';
import SummaryModal from '@/components/SummaryModal';
import ActionPlanPanel from '@/components/ActionPlanPanel';
import { X } from 'lucide-react';

export type RailTab = 'summary' | 'actions';

interface InsightRailProps {
  session: JournalSession;
  tab: RailTab;
  onTabChange: (tab: RailTab) => void;
  onClose: () => void;
  onSummaryUpdated: (summary: string) => void;
  onActionPlanUpdated: (plan: ActionIntelligenceSchema) => void;
}

/**
 * The insight rail: one surface, two tabs.
 *
 * Both tab panels stay MOUNTED (the inactive one is hidden) so each keeps its
 * own loading/error state. A failure in Actions can therefore never blank the
 * Summary, and switching tabs mid-generation does not lose the request.
 */
export default function InsightRail({
  session,
  tab,
  onTabChange,
  onClose,
  onSummaryUpdated,
  onActionPlanUpdated,
}: InsightRailProps) {
  const tablistRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabClass = (active: boolean) =>
    `pb-2 text-ui transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
      active
        ? 'border-b-[1.5px] border-accent font-medium text-ink'
        : 'border-b-[1.5px] border-transparent text-ink-3 hover:text-ink-2'
    }`;

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: RailTab = tab === 'summary' ? 'actions' : 'summary';
    onTabChange(next);
    const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next === 'summary' ? 0 : 1]?.focus();
  };

  return (
    <aside
      aria-label="Reflection"
      className="flex h-full w-full flex-col bg-surface md:w-[380px] md:border-l md:border-hairline"
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div className="min-w-0">
          <p className="font-mono text-label uppercase text-ink-3">Reflection</p>
          <div
            ref={tablistRef}
            role="tablist"
            aria-label="Reflection views"
            onKeyDown={onTabKeyDown}
            className="mt-3.5 flex gap-5"
          >
            <button
              role="tab"
              id="rail-tab-summary"
              aria-selected={tab === 'summary'}
              aria-controls="rail-panel-summary"
              tabIndex={tab === 'summary' ? 0 : -1}
              onClick={() => onTabChange('summary')}
              className={tabClass(tab === 'summary')}
            >
              Summary
            </button>
            <button
              role="tab"
              id="rail-tab-actions"
              aria-selected={tab === 'actions'}
              aria-controls="rail-panel-actions"
              tabIndex={tab === 'actions' ? 0 : -1}
              onClick={() => onTabChange('actions')}
              className={tabClass(tab === 'actions')}
            >
              Actions
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reflection"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-3 transition-colors duration-fast hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className="h-px shrink-0 bg-hairline" />

      <div
        role="tabpanel"
        id="rail-panel-summary"
        aria-labelledby="rail-tab-summary"
        hidden={tab !== 'summary'}
        className={tab === 'summary' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
      >
        <SummaryModal
          session={session}
          onClose={onClose}
          onSummaryUpdated={onSummaryUpdated}
        />
      </div>

      <div
        role="tabpanel"
        id="rail-panel-actions"
        aria-labelledby="rail-tab-actions"
        hidden={tab !== 'actions'}
        className={tab === 'actions' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
      >
        <ActionPlanPanel
          session={session}
          onClose={onClose}
          onActionPlanUpdated={onActionPlanUpdated}
        />
      </div>
    </aside>
  );
}
