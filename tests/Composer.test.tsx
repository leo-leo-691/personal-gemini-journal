// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import Composer from '../src/components/Composer';

vi.mock('../src/server/firebase-admin', () => ({}));
vi.mock('../src/lib/firebase-client', () => ({
  authenticatedFetch: vi.fn(),
}));
import { authenticatedFetch } from '../src/lib/firebase-client';

const session: any = { sessionId: 'abc123', title: 'Timepass' };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  vi.mocked(authenticatedFetch).mockReset();
});
afterEach(() => {
  cleanup();
});

function renderComposer(handlers: {
  onNewMessage?: (m: any) => void;
  onMessageFailed?: (id: string) => void;
}) {
  return render(
    <Composer
      session={session}
      onNewMessage={handlers.onNewMessage ?? (() => {})}
      onMessageFailed={handlers.onMessageFailed ?? (() => {})}
    />
  );
}

describe('Composer', () => {
  it('posts the entry to /api/chat and forwards the model message', async () => {
    const onNewMessage = vi.fn();
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse(200, {
        reply: 'ok',
        message: { messageId: 'm2', role: 'model', text: 'ok', ts: '2026-09-06T10:30:00.000Z' },
      })
    );
    renderComposer({ onNewMessage });

    const box = screen.getByLabelText('Write a journal entry');
    fireEvent.change(box, { target: { value: 'A real entry' } });
    fireEvent.click(screen.getByLabelText('Send journal entry'));

    await waitFor(() => expect(onNewMessage).toHaveBeenCalledTimes(2));
    const [url, init] = vi.mocked(authenticatedFetch).mock.calls[0];
    expect(url).toBe('/api/chat');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      sessionId: 'abc123',
      message: 'A real entry',
    });
    // First call is the optimistic user turn, second is the model reply.
    expect(onNewMessage.mock.calls[0][0].role).toBe('user');
    expect(onNewMessage.mock.calls[1][0].role).toBe('model');
  });

  it('on failure: surfaces the server error inline, drops the optimistic turn, keeps the draft', async () => {
    const onNewMessage = vi.fn();
    const onMessageFailed = vi.fn();
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse(500, { error: 'Internal Server Error' })
    );
    renderComposer({ onNewMessage, onMessageFailed });

    const box = screen.getByLabelText('Write a journal entry') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Do not lose me' } });
    fireEvent.click(screen.getByLabelText('Send journal entry'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Internal Server Error/);
    const tempId = onNewMessage.mock.calls[0][0].messageId;
    await waitFor(() => expect(onMessageFailed).toHaveBeenCalledWith(tempId));
    expect(box.value).toBe('Do not lose me');
  });

  it('a 429 surfaces the rate-limit message and the Retry-After hint', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      jsonResponse(429, { error: 'Too many requests. Please slow down.' }, { 'Retry-After': '30' })
    );
    renderComposer({});

    fireEvent.change(screen.getByLabelText('Write a journal entry'), {
      target: { value: 'again' },
    });
    fireEvent.click(screen.getByLabelText('Send journal entry'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Too many requests/);
    expect(alert.textContent).toMatch(/30s/);
  });
});
