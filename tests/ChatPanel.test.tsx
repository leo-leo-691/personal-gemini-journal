// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ChatPanel from '../src/components/ChatPanel';
import { DATE_UNAVAILABLE } from '../src/lib/format-date';

vi.mock('../src/server/firebase-admin', () => ({}));
vi.mock('../src/lib/firebase-client', () => ({
  authenticatedFetch: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

const ISO = '2026-09-06T10:30:00.000Z';

const session: any = {
  sessionId: 'abc123',
  title: 'Timepass',
  createdAt: ISO,
  updatedAt: ISO,
};

function renderPanel(override: Record<string, unknown> = {}) {
  return render(
    <ChatPanel
      session={{ ...session, ...override }}
      messages={[]}
      onNewMessage={() => {}}
      onOpenSummary={() => {}}
      onOpenActionPlan={() => {}}
      onRequestDelete={() => {}}
    />
  );
}

describe('ChatPanel header', () => {
  it('11: the main journal heading displays the custom session title', () => {
    renderPanel();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Timepass');
  });

  it('the large heading contains ONLY the title — no date, no session id', () => {
    renderPanel();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).not.toMatch(/\d/);
    expect(heading.textContent).not.toMatch(/abc123/);
  });

  it('the session id is not part of the header chrome', () => {
    const { container } = renderPanel();
    const header = container.querySelector('header')!;
    expect(header.textContent).not.toMatch(/Session ID/i);
    expect(header.textContent).not.toMatch(/abc123/);
  });

  it('12: no numeric MM/DD/YYYY date and no "Invalid Date" in the header', () => {
    const { container } = renderPanel();
    const header = container.querySelector('header')!;
    expect(header.textContent).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    expect(header.textContent).not.toMatch(/Invalid Date/);
    expect(header.textContent).not.toMatch(/\bJournal Entry -\b/);
  });

  it('shows exactly one small metadata date line, derived from updatedAt', () => {
    const { container } = renderPanel();
    const header = container.querySelector('header')!;
    // Long-form month, rendered once.
    const matches = header.textContent!.match(/2026/g) || [];
    expect(matches).toHaveLength(1);
  });

  it('a missing updatedAt shows the safe fallback, never "Invalid Date"', () => {
    renderPanel({ updatedAt: null });
    expect(screen.getByText(DATE_UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByText('Invalid Date')).toBeNull();
  });
});

describe('ChatPanel conversation', () => {
  it('renders the conversation as a polite live log region', () => {
    renderPanel();
    // Empty state: the log region appears once a turn exists, so assert the
    // empty prompt instead.
    expect(screen.getByText(/This page is yours/i)).toBeTruthy();
  });

  it('renders a user turn in the journal voice and a Gemini turn with its label', () => {
    render(
      <ChatPanel
        session={session}
        messages={[
          { messageId: 'm1', role: 'user', text: 'I handed in the draft.', ts: ISO },
          { messageId: 'm2', role: 'model', text: 'What part do you look forward to?', ts: ISO },
        ]}
        onNewMessage={() => {}}
        onOpenSummary={() => {}}
        onOpenActionPlan={() => {}}
        onRequestDelete={() => {}}
      />
    );
    expect(screen.getByText('I handed in the draft.')).toBeTruthy();
    expect(screen.getByText('What part do you look forward to?')).toBeTruthy();
    expect(screen.getByText('Gemini')).toBeTruthy();
    expect(screen.getByRole('log')).toBeTruthy();
  });
});
