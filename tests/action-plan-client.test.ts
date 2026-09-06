import { describe, it, expect } from 'vitest';
import {
  readActionPlanResponse,
  ACTION_PLAN_IN_PROGRESS_MESSAGE,
} from '../src/lib/action-plan-client';

function res(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('readActionPlanResponse', () => {
  it('409 -> in-progress outcome with the explicit message and no data', async () => {
    const out = await readActionPlanResponse(res(409, { message: 'x', inProgress: true }));
    expect(out).toEqual({ kind: 'in-progress', message: ACTION_PLAN_IN_PROGRESS_MESSAGE });
  });

  it('500 with an error body -> error outcome carrying that message, no data', async () => {
    const out = await readActionPlanResponse(res(500, { error: 'Failed to generate action plan' }));
    expect(out).toEqual({ kind: 'error', message: 'Failed to generate action plan' });
  });

  it('503 quota -> error outcome with the availability message', async () => {
    const out = await readActionPlanResponse(
      res(503, { error: 'The AI service is temporarily unavailable. Please try again shortly.' })
    );
    expect(out).toEqual({
      kind: 'error',
      message: 'The AI service is temporarily unavailable. Please try again shortly.',
    });
  });

  it('non-JSON error body still yields a generic error outcome', async () => {
    const out = await readActionPlanResponse(new Response('gateway timeout', { status: 504 }));
    expect(out).toEqual({ kind: 'error', message: 'Failed to generate action plan' });
  });

  it('200 -> success outcome carrying the action intelligence', async () => {
    const ai = {
      keyIdeas: ['k'],
      insights: ['i'],
      actionItems: ['a'],
      suggestedNextStep: 's',
      actionPlan: 'p',
    };
    const out = await readActionPlanResponse(res(200, { actionIntelligence: ai }));
    expect(out).toEqual({ kind: 'success', data: ai });
  });
});
