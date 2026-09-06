// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import Sidebar from '../src/components/Sidebar';
import { DATE_UNAVAILABLE } from '../src/lib/format-date';

vi.mock('../src/server/firebase-admin', () => ({}));
vi.mock('../src/lib/firebase-client', () => ({
  authenticatedFetch: vi.fn(),
  signOut: vi.fn(),
}));
import { authenticatedFetch } from '../src/lib/firebase-client';

const onSessionRenamed = vi.fn();

const baseProps = {
  activeSessionId: null,
  onSelectSession: vi.fn(),
  onSessionCreated: vi.fn(),
  onSessionRenamed,
  onRequestDelete: vi.fn(),
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderWith(session: Record<string, unknown>) {
  return render(<Sidebar {...baseProps} sessions={[session as any]} />);
}

beforeEach(() => {
  vi.mocked(authenticatedFetch).mockReset();
  onSessionRenamed.mockReset();
});
afterEach(() => {
  cleanup();
});

const ISO = '2026-09-06T10:30:00.000Z';
const FORMATTED = new Date(ISO).toLocaleDateString();

describe('Sidebar — session date line', () => {
  it('D9: renders a valid ISO session date correctly, no "Invalid Date"', () => {
    renderWith({ sessionId: 's1', title: 'Timepass', createdAt: ISO, updatedAt: ISO });
    expect(screen.getByText(FORMATTED)).toBeTruthy();
    expect(screen.queryByText('Invalid Date')).toBeNull();
  });

  it('D7: null updatedAt shows "Date unavailable", never "Invalid Date"', () => {
    renderWith({ sessionId: 's1', title: 'Timepass', createdAt: null, updatedAt: null });
    expect(screen.getByText(DATE_UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByText('Invalid Date')).toBeNull();
  });

  it('D7: missing updatedAt shows the fallback', () => {
    renderWith({ sessionId: 's1', title: 'Timepass' });
    expect(screen.getByText(DATE_UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByText('Invalid Date')).toBeNull();
  });

  it('D8: malformed updatedAt shows the fallback, never "Invalid Date"', () => {
    renderWith({ sessionId: 's1', title: 'Timepass', updatedAt: 'totally-not-a-date' });
    expect(screen.getByText(DATE_UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByText('Invalid Date')).toBeNull();
  });

  it('D6: a serialized Firestore timestamp on updatedAt formats correctly', () => {
    const seconds = Math.floor(new Date(ISO).getTime() / 1000);
    renderWith({ sessionId: 's1', title: 'Timepass', updatedAt: { _seconds: seconds, _nanoseconds: 0 } });
    expect(screen.getByText(FORMATTED)).toBeTruthy();
  });
});

describe('Sidebar — title display', () => {
  it('9: displays the custom session title', () => {
    renderWith({ sessionId: 's1', title: 'Timepass', updatedAt: ISO });
    expect(screen.getByText('Timepass')).toBeTruthy();
  });

  it('10: shows the small date exactly once and not inside the title', () => {
    renderWith({ sessionId: 's1', title: 'Timepass', updatedAt: ISO });
    expect(screen.getAllByText(FORMATTED)).toHaveLength(1);
    // title element carries no date
    expect(screen.getByText('Timepass').textContent).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
  });

  it('12: default "Journal N" titles carry no date', () => {
    render(
      <Sidebar
        {...baseProps}
        sessions={[
          { sessionId: 's1', title: 'Journal 1', updatedAt: ISO } as any,
          { sessionId: 's2', title: 'Journal 2', updatedAt: ISO } as any,
        ]}
      />
    );
    expect(screen.getByText('Journal 1')).toBeTruthy();
    expect(screen.getByText('Journal 2')).toBeTruthy();
    expect(screen.queryByText('Invalid Date')).toBeNull();
  });
});

describe('Sidebar — inline rename', () => {
  const session = { sessionId: 's1', title: 'Journal 1', updatedAt: ISO };

  it('3: user renames their own session inline; PATCH is sent and parent notified', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse(200, { sessionId: 's1', title: 'Timepass' })
    );
    renderWith(session);

    fireEvent.click(screen.getByLabelText('Rename session'));
    const input = screen.getByLabelText('Session title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Timepass' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onSessionRenamed).toHaveBeenCalledWith('s1', 'Timepass'));

    const [url, init] = vi.mocked(authenticatedFetch).mock.calls[0];
    expect(url).toBe('/api/entries/s1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ title: 'Timepass' });
  });

  it('Escape cancels without sending a request or changing the title', async () => {
    renderWith(session);
    fireEvent.click(screen.getByLabelText('Rename session'));
    const input = screen.getByLabelText('Session title');
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(authenticatedFetch).not.toHaveBeenCalled();
    expect(screen.getByText('Journal 1')).toBeTruthy();
    expect(screen.queryByLabelText('Session title')).toBeNull();
  });

  it('5: an empty title is rejected client-side — no request, title preserved', async () => {
    renderWith(session);
    fireEvent.click(screen.getByLabelText('Rename session'));
    const input = screen.getByLabelText('Session title');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(authenticatedFetch).not.toHaveBeenCalled();
    expect(onSessionRenamed).not.toHaveBeenCalled();
    expect(screen.getByText('Journal 1')).toBeTruthy();
  });

  it('6: input enforces the 80-character max length', () => {
    renderWith(session);
    fireEvent.click(screen.getByLabelText('Rename session'));
    const input = screen.getByLabelText('Session title') as HTMLInputElement;
    expect(input.maxLength).toBe(80);
  });

  it('shows an error and preserves the previous title when the rename request fails', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse(500, { error: 'Internal Server Error' })
    );
    renderWith(session);

    fireEvent.click(screen.getByLabelText('Rename session'));
    const input = screen.getByLabelText('Session title');
    fireEvent.change(input, { target: { value: 'Timepass' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Internal Server Error');
    expect(onSessionRenamed).not.toHaveBeenCalled();
    // still editing, previous title not replaced in the tree
    expect(screen.getByLabelText('Session title')).toBeTruthy();
    expect(screen.queryByText('Timepass')).toBeNull();
  });
});
