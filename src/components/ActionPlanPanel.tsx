'use client';

import { useState } from 'react';
import { JournalSession, ActionIntelligenceSchema } from '@/server/firestore-db';
import { authenticatedFetch } from '@/lib/firebase-client';
import { readActionPlanResponse } from '@/lib/action-plan-client';
import { Loader2, AlertCircle } from 'lucide-react';

interface ActionPlanPanelProps {
  session: JournalSession;
  onClose: () => void;
  onActionPlanUpdated: (plan: ActionIntelligenceSchema) => void;
}

/**
 * AI Action Intelligence — now the "Actions" tab of the insight rail.
 *
 * File path, export name and props are unchanged. `readActionPlanResponse`,
 * the outcome switch and the render gate are a verbatim lift: while `error` is
 * set the panel renders ONLY the banner, so stale insights are never presented
 * as the result of a failed regeneration. Previously saved data in Firestore is
 * untouched by a failure.
 *
 * Checklist items render as read-only rows. `actionItems` is `string[]` in the
 * schema, so there is nowhere to persist completion — the UI does not pretend
 * otherwise.
 */
export default function ActionPlanPanel({
  session,
  onClose,
  onActionPlanUpdated,
}: ActionPlanPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ActionIntelligenceSchema | null>(
    session.actionIntelligence || null
  );

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await authenticatedFetch('/api/action-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      const outcome = await readActionPlanResponse(res);

      if (outcome.kind === 'success') {
        setData(outcome.data);
        onActionPlanUpdated(outcome.data);
        return;
      }

      // in-progress (409) or error: surface the message. `data` is left in
      // state but the render gates on `error`, so stale insights are never
      // shown alongside an error/in-progress banner.
      setError(outcome.message);
    } catch (err: any) {
      setError(err.message || 'Error generating action plan');
    } finally {
      setLoading(false);
    }
  };

  const sectionLabel = 'font-mono text-label uppercase text-ink-3';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div aria-busy="true">
            <p className={sectionLabel}>Reading your session…</p>
            <div className="mt-3.5 h-0.5 overflow-hidden rounded-full bg-surface-hover">
              <div className="h-0.5 w-2/3 animate-shimmer bg-accent" />
            </div>
            <p className="mt-3.5 text-ui-sm text-ink-3">
              Gemini is pulling ideas, observations and actions out of this session.
            </p>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-sm border border-critical/30 bg-critical-quiet px-3.5 py-3"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-critical"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div>
              <p className="text-ui-sm text-ink">{error}</p>
              <p className="mt-1.5 text-ui-sm text-ink-3">
                Generation did not complete. Any previously saved insights are unchanged.
              </p>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="mt-2.5 text-ui-sm text-accent underline-offset-4 hover:underline disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : !data ? (
          <div>
            <p className={sectionLabel}>Nothing extracted yet</p>
            <p className="mt-2.5 max-w-rail text-ui-sm text-ink-2">
              This rail will hold the ideas worth keeping, a few honest observations, the actions
              you named, and one suggested next step.
            </p>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-hairline-strong px-3.5 text-ui text-ink transition-colors duration-fast hover:bg-surface-hover disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Generate Action Intelligence
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {data.keyIdeas?.length > 0 && (
              <section>
                <h3 className={sectionLabel}>Key ideas</h3>
                <ul className="mt-3">
                  {data.keyIdeas.map((idea, idx) => (
                    <li
                      key={idx}
                      className="flex gap-3 border-b border-hairline py-2.5 last:border-b-0"
                    >
                      <span
                        className="mt-2 h-[3px] w-[3px] shrink-0 rounded-full bg-accent"
                        aria-hidden="true"
                      />
                      <span className="text-ui leading-relaxed text-ink">{idea}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.insights?.length > 0 && (
              <section>
                <h3 className={sectionLabel}>Reflection insights</h3>
                <div className="mt-3 flex flex-col gap-4 border-l border-hairline-strong pl-4">
                  {data.insights.map((insight, idx) => (
                    <p key={idx} className="font-serif text-journal-sm italic text-ink-2">
                      {insight}
                    </p>
                  ))}
                </div>
              </section>
            )}

            {data.actionItems?.length > 0 && (
              <section>
                <h3 className={sectionLabel}>Action checklist</h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {data.actionItems.map((item, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span
                        className="mt-1 h-4 w-4 shrink-0 rounded-xs border border-hairline-strong"
                        aria-hidden="true"
                      />
                      <span className="text-ui leading-snug text-ink">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.suggestedNextStep && (
              <section className="rounded-lg border-l-2 border-warm bg-warm-quiet px-4 py-4">
                <h3 className="font-mono text-label uppercase text-warm">Suggested next step</h3>
                <p className="mt-2 font-serif text-journal-sm text-ink">
                  {data.suggestedNextStep}
                </p>
              </section>
            )}

            {data.actionPlan && (
              <section>
                <h3 className={sectionLabel}>Plan</h3>
                <p className="mt-2.5 whitespace-pre-wrap text-ui leading-relaxed text-ink-2">
                  {data.actionPlan}
                </p>
              </section>
            )}
          </div>
        )}
      </div>

      {(data || error) && (
        <div className="flex shrink-0 items-center justify-end border-t border-hairline px-6 py-3.5">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-hairline-strong px-3 text-ui-sm text-ink-2 transition-colors duration-fast hover:bg-surface-hover hover:text-ink disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {loading && (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} aria-hidden="true" />
            )}
            Regenerate Insights
          </button>
        </div>
      )}
    </div>
  );
}
