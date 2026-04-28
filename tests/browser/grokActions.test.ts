import { describe, expect, test, vi } from 'vitest';
import type { ChromeClient } from '../../src/browser/types.js';
import {
  buildGrokAssistantSnapshotExpressionForTest,
  ensureGrokLoggedIn,
  ensureGrokPromptReady,
  setGrokPrompt,
  submitGrokPrompt,
  waitForGrokAssistantResult,
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

  test('setGrokPrompt clears and refills Grok composers with CDP input plus fallback events', async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ result: { value: { ok: true, mode: 'contenteditable' } } })
      .mockResolvedValueOnce({ result: { value: { ok: true, text: '' } } })
      .mockResolvedValueOnce({ result: { value: true } })
      .mockResolvedValueOnce({ result: { value: { ok: true, text: 'ping' } } });
    const input = {
      insertText: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChromeClient['Input'];
    const runtime = {
      evaluate,
    } as unknown as ChromeClient['Runtime'];

    await expect(setGrokPrompt(input, runtime, 'ping')).resolves.toBeUndefined();

    expect(input.insertText).toHaveBeenCalledWith({ text: 'ping' });
    const focusExpression = String(evaluate.mock.calls[0]?.[0]?.expression ?? '');
    expect(focusExpression).toContain('MouseEvent');
    expect(focusExpression).toContain("InputEvent('beforeinput'");
    expect(focusExpression).toContain("getAttribute('aria-hidden') !== 'true'");
    const fallbackExpression = String(evaluate.mock.calls[2]?.[0]?.expression ?? '');
    expect(fallbackExpression).toContain("insertFromPaste");
    expect(fallbackExpression).toContain("InputEvent('input'");
  });

  test('submitGrokPrompt falls back to Enter when click does not commit the turn', async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          value: { composerText: 'ping', turnCount: 0, submitDisabled: false, hasEnabledSubmit: true },
        },
      })
      .mockResolvedValueOnce({ result: { value: true } })
      .mockResolvedValueOnce({
        result: {
          value: { composerText: 'ping', turnCount: 0, submitDisabled: false, hasEnabledSubmit: true },
        },
      });
    const input = {
      dispatchKeyEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChromeClient['Input'];
    const runtime = {
      evaluate,
    } as unknown as ChromeClient['Runtime'];

    await expect(submitGrokPrompt(input, runtime)).resolves.toBeUndefined();

    expect(input.dispatchKeyEvent).toHaveBeenCalledTimes(2);
    const clickExpression = String(evaluate.mock.calls[1]?.[0]?.expression ?? '');
    expect(clickExpression).toContain('candidate instanceof HTMLButtonElement');
    expect(clickExpression).toContain("style.display !== 'none'");
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

  test('waitForGrokAssistantResult preserves markdown and strips code-block UI chrome', async () => {
    const logger = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ result: { value: { count: 1, lastText: '', lastMarkdown: '', lastHtml: '', toastText: '' } } })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'alpha\n\nbeta',
            lastMarkdown: '- alpha\n\n```txt\nbeta\n```',
            lastHtml: '<ul><li>alpha</li></ul>',
            toastText: '',
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'alpha\n\nbeta',
            lastMarkdown: '- alpha\n\n```txt\nbeta\n```',
            lastHtml: '<ul><li>alpha</li></ul>',
            toastText: '',
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'alpha\n\nbeta',
            lastMarkdown: '- alpha\n\n```txt\nbeta\n```',
            lastHtml: '<ul><li>alpha</li></ul>',
            toastText: '',
          },
        },
      });
    const runtime = { evaluate } as unknown as ChromeClient['Runtime'];

    await expect(waitForGrokAssistantResult(runtime, 2000, logger)).resolves.toEqual({
      text: 'alpha\n\nbeta',
      markdown: '- alpha\n\n```txt\nbeta\n```',
      html: '<ul><li>alpha</li></ul>',
    });

    const expression = String(evaluate.mock.calls[0]?.[0]?.expression ?? '');
    expect(expression).toContain('data-testid');
    expect(expression).toContain('code-block');
    expect(expression).toContain("node.tagName === 'BUTTON'");
    expect(logger).toHaveBeenCalledWith('Recovered assistant response');
  });

  test('waitForGrokAssistantResponse returns plain text from the richer assistant result', async () => {
    const logger = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ result: { value: { count: 1, lastText: '', lastMarkdown: '', lastHtml: '', toastText: '' } } })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'plain text',
            lastMarkdown: '- plain text',
            lastHtml: '<p>plain text</p>',
            toastText: '',
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'plain text',
            lastMarkdown: '- plain text',
            lastHtml: '<p>plain text</p>',
            toastText: '',
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'plain text',
            lastMarkdown: '- plain text',
            lastHtml: '<p>plain text</p>',
            toastText: '',
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'plain text',
            lastMarkdown: '- plain text',
            lastHtml: '<p>plain text</p>',
            toastText: '',
          },
        },
      })
      .mockResolvedValue({
        result: {
          value: {
            count: 1,
            lastText: 'plain text',
            lastMarkdown: '- plain text',
            lastHtml: '<p>plain text</p>',
            toastText: '',
          },
        },
      });
    const runtime = { evaluate } as unknown as ChromeClient['Runtime'];

    await expect(waitForGrokAssistantResponse(runtime, 2500, logger)).resolves.toBe('plain text');
  });

  test('waitForGrokAssistantResult accepts a pre-submit baseline so fast replies do not self-baseline', async () => {
    const logger = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'AURACALL_TEAM_SMOKE_OK',
            lastMarkdown: 'AURACALL_TEAM_SMOKE_OK',
            lastHtml: '<p>AURACALL_TEAM_SMOKE_OK</p>',
            toastText: '',
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'AURACALL_TEAM_SMOKE_OK',
            lastMarkdown: 'AURACALL_TEAM_SMOKE_OK',
            lastHtml: '<p>AURACALL_TEAM_SMOKE_OK</p>',
            toastText: '',
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'AURACALL_TEAM_SMOKE_OK',
            lastMarkdown: 'AURACALL_TEAM_SMOKE_OK',
            lastHtml: '<p>AURACALL_TEAM_SMOKE_OK</p>',
            toastText: '',
          },
        },
      });
    const runtime = { evaluate } as unknown as ChromeClient['Runtime'];

    await expect(
      waitForGrokAssistantResult(runtime, 2000, logger, {
        baseline: {
          count: 0,
          lastText: '',
          lastMarkdown: '',
          lastHtml: '',
        },
      }),
    ).resolves.toEqual({
      text: 'AURACALL_TEAM_SMOKE_OK',
      markdown: 'AURACALL_TEAM_SMOKE_OK',
      html: '<p>AURACALL_TEAM_SMOKE_OK</p>',
    });

    expect(logger).toHaveBeenCalledWith('Recovered assistant response');
  });

  test('waitForGrokAssistantResult notifies once when first new assistant content appears', async () => {
    const logger = vi.fn();
    const onResponseIncoming = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: '',
            lastMarkdown: '',
            lastHtml: '',
            toastText: '',
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'alpha',
            lastMarkdown: 'alpha',
            lastHtml: '<p>alpha</p>',
            toastText: '',
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'alpha',
            lastMarkdown: 'alpha',
            lastHtml: '<p>alpha</p>',
            toastText: '',
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          value: {
            count: 1,
            lastText: 'alpha',
            lastMarkdown: 'alpha',
            lastHtml: '<p>alpha</p>',
            toastText: '',
          },
        },
      });
    const runtime = { evaluate } as unknown as ChromeClient['Runtime'];

    await expect(
      waitForGrokAssistantResult(runtime, 2500, logger, { onResponseIncoming }),
    ).resolves.toEqual({
      text: 'alpha',
      markdown: 'alpha',
      html: '<p>alpha</p>',
    });

    expect(onResponseIncoming).toHaveBeenCalledTimes(1);
  });

  test('buildGrokAssistantSnapshotExpression strips sticky copy chrome and serializes code blocks', () => {
    const expression = buildGrokAssistantSnapshotExpressionForTest();
    expect(expression).toContain('data-testid');
    expect(expression).toContain('code-block');
    expect(expression).toContain('span.font-mono');
    expect(expression).toContain("className.includes('sticky')");
    expect(expression).toContain("node.tagName === 'BUTTON'");
  });

  test('waitForGrokAssistantResult fails fast on visible query-limit toast text', async () => {
    const logger = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ result: { value: { count: 1, lastText: '', lastMarkdown: '', lastHtml: '', toastText: '' } } })
      .mockResolvedValue({
        result: {
          value: {
            count: 1,
            lastText: '',
            lastMarkdown: '',
            lastHtml: '',
            toastText: 'Query limit reached for Auto. Try again in 4 minutes.',
          },
        },
      });
    const runtime = { evaluate } as unknown as ChromeClient['Runtime'];

    await expect(waitForGrokAssistantResult(runtime, 2000, logger)).rejects.toThrow(
      'Query limit reached for Auto. Try again in 4 minutes.',
    );
  });
});
