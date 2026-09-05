'use client';

import { useState } from 'react';
import { JournalSession, ActionIntelligenceSchema } from '@/server/firestore-db';
import { authenticatedFetch } from '@/lib/firebase-client';
import { X, Brain, CheckSquare, Lightbulb, Compass, Loader2 } from 'lucide-react';

interface ActionPlanPanelProps {
  session: JournalSession;
  onClose: () => void;
  onActionPlanUpdated: (plan: ActionIntelligenceSchema) => void;
}

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

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to generate action plan');
      }

      const result = await res.json();
      setData(result.actionIntelligence);
      onActionPlanUpdated(result.actionIntelligence);
    } catch (err: any) {
      setError(err.message || 'Error generating action plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-slate-100">AI Action Intelligence</h2>
              <p className="text-[11px] text-slate-400">
                Action extraction & reflection points from your journal text
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/60 rounded-xl text-red-300">
              {error}
            </div>
          )}

          {!data ? (
            <div className="p-8 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 space-y-3">
              <p>No Action Intelligence generated for this session yet.</p>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="mx-auto bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Extracting Insights...
                  </>
                ) : (
                  'Generate Action Intelligence'
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Key Ideas & Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold mb-2">
                    <Lightbulb className="w-4 h-4" /> Key Ideas
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {data.keyIdeas.map((idea, idx) => (
                      <li key={idx}>{idea}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80">
                  <div className="flex items-center gap-2 text-purple-400 font-semibold mb-2">
                    <Brain className="w-4 h-4" /> Reflection Insights
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {data.insights.map((insight, idx) => (
                      <li key={idx}>{insight}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action Items */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-2.5">
                  <CheckSquare className="w-4 h-4" /> Action Checklist
                </div>
                <div className="space-y-2">
                  {data.actionItems.map((item, idx) => (
                    <label
                      key={idx}
                      className="flex items-start gap-2.5 text-slate-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Suggested Next Step & Plan */}
              {data.suggestedNextStep && (
                <div className="p-4 bg-indigo-950/40 border border-indigo-800/40 rounded-xl">
                  <div className="flex items-center gap-2 text-indigo-300 font-semibold mb-1">
                    <Compass className="w-4 h-4" /> Suggested Next Step
                  </div>
                  <p className="text-slate-300">{data.suggestedNextStep}</p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-2 px-3 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all"
                >
                  {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                  Regenerate Insights
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
