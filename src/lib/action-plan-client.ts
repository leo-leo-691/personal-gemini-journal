import { ActionIntelligenceSchema } from '@/server/firestore-db';

/**
 * Normalised outcome of a POST /api/action-plan call, used by ActionPlanPanel.
 *
 * The panel must never show an error banner next to stale generated insights,
 * so a non-success outcome carries no data and the panel gates rendering on it.
 */
export type ActionPlanOutcome =
  | { kind: 'success'; data: ActionIntelligenceSchema }
  | { kind: 'in-progress'; message: string }
  | { kind: 'error'; message: string };

export const ACTION_PLAN_IN_PROGRESS_MESSAGE =
  'Generation already in progress — try again shortly.';

export async function readActionPlanResponse(res: Response): Promise<ActionPlanOutcome> {
  // 409: the timestamped lease is held by another in-flight request.
  if (res.status === 409) {
    return { kind: 'in-progress', message: ACTION_PLAN_IN_PROGRESS_MESSAGE };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      body && typeof body.error === 'string' && body.error.trim()
        ? body.error
        : 'Failed to generate action plan';
    return { kind: 'error', message };
  }

  return { kind: 'success', data: body?.actionIntelligence as ActionIntelligenceSchema };
}
