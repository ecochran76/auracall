import { describe, expect, test, vi } from 'vitest';
import type { ChromeClient } from '../../src/browser/types.js';
import {
  ensureGrokLoggedIn,
  ensureGrokPromptReady,
  setGrokPrompt,
  waitForGrokAssistantResponse,
} from '../../src/browser/actions/grok.js';

describe('grok actions', () => {
  test('ensureGrokPromptReady accepts the current textarea-based composer', async () => {
    const logger = vi.fn();
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: true } }),
    } as unknown as ChromeClient['Runtime'];

    await expect(ensureGrokPromptReady(runtime, 1000, logger)).resolves.toBeUndefined();
    expect(runtime.evaluate).toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith('Prompt textarea ready');
  });

  test('setGrokPrompt supports textarea/input composers with input events', async () => {
    const evaluate = vi.fn().mockResolvedValue({ result: { value: true } });
    const runtime = {
      evaluate,
    } as unknown as ChromeClient['Runtime'];

    await expect(setGrokPrompt(runtime, 'ping')).resolves.toBeUndefined();

    const expression = String(evaluate.mock.calls[0]?.[0]?.expression ?? '');
    expect(expression).toContain('HTMLTextAreaElement');
    expect(expression).toContain("dispatchEvent(new Event('input'");
    expect(expression).toContain("dispatchEvent(new Event('change'");
    expect(expression).toContain("getAttribute('aria-hidden') !== 'true'");
  });

  test('ensureGrokLoggedIn rejects visible guest auth CTAs in headless mode', async () => {
    const logger = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ result: { value: 'https://grok.com/' } })
      .mockResolvedValueOnce({ result: { value: { hasNotFound: false } } })
      .mockResolvedValueOnce({
        result: {
          value: {
            id: null,
            name: null,
            handle: null,
            email: null,
            source: null,
            guestAuthCta: true,
          },
        },
      });
    const runtime = {
      evaluate,
    } as unknown as ChromeClient['Runtime'];

    await expect(ensureGrokLoggedIn(runtime, logger, { headless: true })).rejects.toThrow(
      'Grok login required; could not verify a signed-in Grok account. Please sign in to grok.com and retry.',
    );

    const expression = evaluate.mock.calls
      .map((call) => String(call?.[0]?.expression ?? ''))
      .find((candidate) => candidate.includes('create account')) ?? '';
    expect(expression).toContain("style.display !== 'none'");
    expect(expression).toContain('/^(sign in|log in|login|create account|sign up)$/i');
  });

  test('ensureGrokLoggedIn accepts a positive identity signal', async () => {
    const logger = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ result: { value: 'https://grok.com/' } })
      .mockResolvedValueOnce({ result: { value: { hasNotFound: false } } })
      .mockResolvedValueOnce({
        result: {
          value: {
            id: 'user-123',
            name: 'Eric C',
            handle: '@SwantonDoug',
            email: 'ez86944@gmail.com',
            source: 'next-data',
            guestAuthCta: false,
          },
        },
      });
    const runtime = { evaluate } as unknown as ChromeClient['Runtime'];

    await expect(ensureGrokLoggedIn(runtime, logger, { headless: true })).resolves.toBeUndefined();
    expect(logger).toHaveBeenCalledWith('Login check passed (identity verified)');
  });

  test('waitForGrokAssistantResponse prefers markdown content and ignores action/suggestion UI', async () => {
    const logger = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ result: { value: { count: 1, lastText: '' } } })
      .mockResolvedValueOnce({ result: { value: { count: 1, lastText: 'live dom marker' } } })
      .mockResolvedValueOnce({ result: { value: { count: 1, lastText: 'live dom marker' } } })
      .mockResolvedValueOnce({ result: { value: { count: 1, lastText: 'live dom marker' } } });
    const runtime = { evaluate } as unknown as ChromeClient['Runtime'];

    await expect(waitForGrokAssistantResponse(runtime, 2000, logger)).resolves.toBe('live dom marker');

    const expression = String(evaluate.mock.calls[0]?.[0]?.expression ?? '');
    expect(expression).toContain('.response-content-markdown');
    expect(expression).toContain('.action-buttons');
    expect(expression).toContain("node.tagName === 'BUTTON'");
    expect(logger).toHaveBeenCalledWith('Recovered assistant response');
  });
});
