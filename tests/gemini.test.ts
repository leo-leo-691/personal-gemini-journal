import { describe, it, expect, vi } from 'vitest';

// Avoid loading the real firebase-admin (ADC / initializeApp) via the type
// import chain, and stub the Gemini SDK so we control the raw response.
vi.mock('../src/server/firebase-admin', () => ({ adminDb: {}, adminAuth: {} }));

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({ models: { generateContent } })),
}));

import { generateSummary, generateActionIntelligence } from '../src/server/gemini';

const history = [
  { messageId: 'm1', role: 'user' as const, text: 'I felt anxious today', ts: new Date().toISOString() },
];

// NOTE: each test fully replaces the mock behaviour via mockImplementation /
// mockResolvedValue, so no beforeEach reset is needed. (A beforeEach reset here
// interacts badly with vitest 1.6's rejected-promise tracking and spuriously
// surfaces the mock's own error as an unhandled failure.)

describe('generateSummary — truncation & error classification', () => {
  it('D1: rejects a truncated (MAX_TOKENS) response instead of returning partial text', async () => {
    generateContent.mockResolvedValue({
      text: 'Based on your journal transcript, here is a summary of',
      candidates: [{ finishReason: 'MAX_TOKENS' }],
    });
    await expect(generateSummary(history)).rejects.toMatchObject({
      name: 'GeminiError',
      code: 'TRUNCATED',
    });
  });

  it('D2: returns the trimmed text for a complete (STOP) response', async () => {
    generateContent.mockResolvedValue({
      text: '  You reflected on anxiety and named one coping step.  ',
      candidates: [{ finishReason: 'STOP' }],
    });
    await expect(generateSummary(history)).resolves.toBe(
      'You reflected on anxiety and named one coping step.'
    );
  });

  it('classifies quota / RESOURCE_EXHAUSTED errors as GeminiError code QUOTA', async () => {
    generateContent.mockImplementation(() => {
      // Synchronous throw: mirrors the @google/genai client surfacing an HTTP
      // error, without leaving a floating rejected promise for the spy to track.
      throw new Error('got status: 429 Too Many Requests. {"error":{"status":"RESOURCE_EXHAUSTED"}}');
    });
    await expect(generateSummary(history)).rejects.toMatchObject({ name: 'GeminiError', code: 'QUOTA' });
  });

  it('D3: does not silently fall back to a canned summary when output is empty', async () => {
    generateContent.mockResolvedValue({ text: '   ', candidates: [{ finishReason: 'STOP' }] });
    await expect(generateSummary(history)).rejects.toMatchObject({
      name: 'GeminiError',
      code: 'GENERATION',
    });
  });

  it('D4: prompt asks for a concise, completed summary and uses a workable output budget', async () => {
    generateContent.mockResolvedValue({
      text:
        'You worked through anxiety about a deadline and recognised that breaking the task down helped. ' +
        'The tone shifted from overwhelmed to cautiously hopeful. A key insight was that rest is part of the work.',
      candidates: [{ finishReason: 'STOP' }],
    });

    const out = await generateSummary(history);
    expect(out).toMatch(/cautiously hopeful/);

    const call = generateContent.mock.lastCall![0] as any;
    const promptText: string = call.contents[0].parts[0].text;

    // concise + explicitly bounded + "finished summary only"
    expect(promptText).toMatch(/concise/i);
    expect(promptText).toMatch(/sentence|word/i);
    expect(promptText).toMatch(/finish every sentence/i);
    expect(promptText).toMatch(/only the finished summary/i);
    // a workable, not "huge", output budget; system instruction still applied
    expect(call.config.maxOutputTokens).toBeGreaterThanOrEqual(1024);
    expect(call.config.maxOutputTokens).toBeLessThanOrEqual(4096);
    expect(call.config.systemInstruction).toBeTruthy();
  });
});

describe('generateActionIntelligence — truncation & error classification', () => {
  const okJson = JSON.stringify({
    keyIdeas: ['k'],
    insights: ['i'],
    actionItems: ['a'],
    suggestedNextStep: 's',
    actionPlan: 'p',
  });

  it('rejects a truncated (MAX_TOKENS) response', async () => {
    generateContent.mockResolvedValue({
      text: '{"keyIdeas":["I felt',
      candidates: [{ finishReason: 'MAX_TOKENS' }],
    });
    await expect(generateActionIntelligence('sum', history)).rejects.toMatchObject({
      name: 'GeminiError',
      code: 'TRUNCATED',
    });
  });

  it('converts malformed JSON into a GeminiError (not a raw SyntaxError)', async () => {
    generateContent.mockResolvedValue({
      text: '{"keyIdeas": ["oops',
      candidates: [{ finishReason: 'STOP' }],
    });
    await expect(generateActionIntelligence('sum', history)).rejects.toMatchObject({
      name: 'GeminiError',
      code: 'GENERATION',
    });
  });

  it('returns a validated schema for a complete response', async () => {
    generateContent.mockResolvedValue({ text: okJson, candidates: [{ finishReason: 'STOP' }] });
    await expect(generateActionIntelligence('sum', history)).resolves.toEqual({
      keyIdeas: ['k'],
      insights: ['i'],
      actionItems: ['a'],
      suggestedNextStep: 's',
      actionPlan: 'p',
    });
  });

  it('classifies availability errors (503 / UNAVAILABLE) as QUOTA', async () => {
    generateContent.mockImplementation(() => {
      throw new Error('got status: 503 Service Unavailable UNAVAILABLE');
    });
    await expect(generateActionIntelligence('sum', history)).rejects.toMatchObject({
      name: 'GeminiError',
      code: 'QUOTA',
    });
  });
});
