// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ActionPlanPanel from '../src/components/ActionPlanPanel';

// Insurance: keep the firebase-admin ADC chain out of the component test even if
// the type-only import is not tree-shaken.
vi.mock('../src/server/firebase-admin', () => ({}));

vi.mock('../src/lib/firebase-client', () => ({
  authenticatedFetch: vi.fn(),
}));
import { authenticatedFetch } from '../src/lib/firebase-client';

const STALE = {
  keyIdeas: ['STALE key idea'],
  insights: ['STALE reflection insight'],
  actionItems: ['STALE action item'],
  suggestedNextStep: 'STALE next step',
  actionPlan: 'STALE plan',
};

const session: any = {
  sessionId: 'sess1',
  title: 'T',
  createdAt: '',
  updatedAt: '',
  actionIntelligence: STALE,
};

function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPanel() {
  return render(
    <ActionPlanPanel session={session} onClose={() => {}} onActionPlanUpdated={() => {}} />
  );
}

beforeEach(() => {
  vi.mocked(authenticatedFetch).mockReset();
});
afterEach(() => {
  cleanup();
});

describe('ActionPlanPanel', () => {
  it('D5: renders existing (previously successful) action intelligence normally', () => {
    renderPanel();
    expect(screen.getByText('STALE key idea')).toBeTruthy();
    expect(screen.getByText('STALE reflection insight')).toBeTruthy();
    expect(screen.getByText('STALE next step')).toBeTruthy();
    expect(screen.queryByText(/Failed to generate/i)).toBeNull();
  });

  it('D3: on a failed regeneration, stale insights are NOT shown alongside the error', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse(500, { error: 'Failed to generate action plan' })
    );
    renderPanel();
    fireEvent.click(screen.getByText('Regenerate Insights'));

    expect(await screen.findByText('Failed to generate action plan')).toBeTruthy();
    expect(screen.queryByText('STALE key idea')).toBeNull();
    expect(screen.queryByText('STALE reflection insight')).toBeNull();
    expect(screen.queryByText('STALE next step')).toBeNull();
  });

  it('D4: a 409 response shows the explicit in-progress message, no stale data', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse(409, { message: 'Action plan generation is already in progress.', inProgress: true })
    );
    renderPanel();
    fireEvent.click(screen.getByText('Regenerate Insights'));

    expect(
      await screen.findByText('Generation already in progress — try again shortly.')
    ).toBeTruthy();
    expect(screen.queryByText('STALE key idea')).toBeNull();
  });

  it('maps a 503 quota response to its distinct message', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse(503, { error: 'The AI service is temporarily unavailable. Please try again shortly.' })
    );
    renderPanel();
    fireEvent.click(screen.getByText('Regenerate Insights'));

    expect(
      await screen.findByText('The AI service is temporarily unavailable. Please try again shortly.')
    ).toBeTruthy();
  });

  it('D5b: a successful regeneration renders the fresh insights', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse(200, {
        actionIntelligence: {
          keyIdeas: ['FRESH idea'],
          insights: ['FRESH insight'],
          actionItems: ['FRESH item'],
          suggestedNextStep: 'FRESH step',
          actionPlan: 'FRESH plan',
        },
      })
    );
    renderPanel();
    fireEvent.click(screen.getByText('Regenerate Insights'));

    expect(await screen.findByText('FRESH idea')).toBeTruthy();
    expect(screen.getByText('FRESH step')).toBeTruthy();
    expect(screen.queryByText('STALE key idea')).toBeNull();
  });
});
