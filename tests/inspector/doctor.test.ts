import { describe, expect, test } from 'vitest';
import { diagnoseProvider } from '../../src/inspector/doctor.js';
import { CHATGPT_PROVIDER } from '../../src/browser/providers/chatgpt.js';
import { GROK_PROVIDER } from '../../src/browser/providers/grok.js';
import type { ChromeClient } from '../../src/browser/types.js';

function createClient(url: string, counts: Record<string, number>): ChromeClient {
  return {
    Runtime: {
      evaluate: async ({ expression }: { expression: string }) => {
        if (expression === 'location.href') {
          return { result: { value: url } };
        }
        const selectorMatch = expression.match(/^document\.querySelectorAll\((.*)\)\.length$/);
        if (selectorMatch?.[1]) {
          const selector = JSON.parse(selectorMatch[1]) as string;
          return { result: { value: counts[selector] ?? 0 } };
        }
        return { result: { value: null } };
      },
    },
  } as unknown as ChromeClient;
}

function countsFor(selectors: readonly string[]): Record<string, number> {
  return Object.fromEntries(selectors.map((selector) => [selector, 1]));
}

describe('diagnoseProvider', () => {
  test('treats a healthy ChatGPT home surface as passing without conversation-output selectors', async () => {
    const counts = {
      ...countsFor(CHATGPT_PROVIDER.selectors.input.slice(0, 1)),
      ...countsFor(CHATGPT_PROVIDER.selectors.modelButton.slice(0, 1)),
      ...countsFor(CHATGPT_PROVIDER.selectors.menuItem.slice(0, 1)),
      ...countsFor(CHATGPT_PROVIDER.selectors.composerRoot.slice(0, 1)),
      ...countsFor(CHATGPT_PROVIDER.selectors.fileInput.slice(0, 1)),
      ...countsFor(CHATGPT_PROVIDER.selectors.attachmentMenu.slice(0, 1)),
    };

    const report = await diagnoseProvider(createClient('https://chatgpt.com/', counts), CHATGPT_PROVIDER);

    expect(report.allPassed).toBe(true);
    expect(report.surface).toMatchObject({
      kind: 'non-conversation',
      reason: 'no-conversation-route',
      deferredChecks: ['sendButton', 'assistantBubble', 'assistantRole', 'copyButton'],
    });
    expect(report.failedRequiredChecks).toEqual([]);
    expect(report.checks.find((check) => check.name === 'sendButton')).toMatchObject({
      matched: false,
      requirement: 'deferred',
      deferredReason: 'prompt-dependent-control-not-expected-before-input',
    });
    expect(report.checks.find((check) => check.name === 'assistantBubble')).toMatchObject({
      matched: false,
      requirement: 'deferred',
      deferredReason: 'conversation-output-not-expected-on-current-surface',
    });
  });

  test('treats a healthy Grok home surface as passing without assistant conversation selectors', async () => {
    const counts = {
      ...countsFor(GROK_PROVIDER.selectors.input.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.sendButton.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.modelButton.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.menuItem.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.composerRoot.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.fileInput.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.attachmentMenu.slice(0, 1)),
    };

    const report = await diagnoseProvider(createClient('https://grok.com/', counts), GROK_PROVIDER);

    expect(report.allPassed).toBe(true);
    expect(report.surface.kind).toBe('non-conversation');
    expect(report.surface.deferredChecks).toEqual(['sendButton', 'assistantBubble', 'assistantRole', 'copyButton']);
    expect(report.failedRequiredChecks).toEqual([]);
    expect(report.checks.find((check) => check.name === 'assistantRole')).toMatchObject({
      matched: false,
      requirement: 'deferred',
    });
  });

  test('treats Grok Imagine as a workbench surface without requiring the chat model selector', async () => {
    const counts = {
      ...countsFor(GROK_PROVIDER.selectors.input.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.sendButton.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.menuItem.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.composerRoot.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.fileInput.slice(0, 1)),
      ...countsFor(GROK_PROVIDER.selectors.attachmentMenu.slice(0, 1)),
    };

    const report = await diagnoseProvider(createClient('https://grok.com/imagine', counts), GROK_PROVIDER);

    expect(report.allPassed).toBe(true);
    expect(report.surface).toMatchObject({
      kind: 'workbench',
      reason: 'grok-imagine-route',
      deferredChecks: ['sendButton', 'modelButton', 'assistantBubble', 'assistantRole', 'copyButton'],
    });
    expect(report.failedRequiredChecks).toEqual([]);
    expect(report.checks.find((check) => check.name === 'modelButton')).toMatchObject({
      matched: false,
      requirement: 'deferred',
      deferredReason: 'generic-chat-control-not-expected-on-workbench-surface',
    });
  });

  test('keeps assistant selectors required on conversation surfaces', async () => {
    const counts = {
      ...countsFor(CHATGPT_PROVIDER.selectors.input.slice(0, 1)),
      ...countsFor(CHATGPT_PROVIDER.selectors.modelButton.slice(0, 1)),
      ...countsFor(CHATGPT_PROVIDER.selectors.menuItem.slice(0, 1)),
      ...countsFor(CHATGPT_PROVIDER.selectors.composerRoot.slice(0, 1)),
      ...countsFor(CHATGPT_PROVIDER.selectors.fileInput.slice(0, 1)),
      ...countsFor(CHATGPT_PROVIDER.selectors.attachmentMenu.slice(0, 1)),
    };

    const report = await diagnoseProvider(createClient('https://chatgpt.com/c/test-conversation', counts), CHATGPT_PROVIDER);

    expect(report.allPassed).toBe(false);
    expect(report.surface).toMatchObject({
      kind: 'conversation',
      reason: 'conversation-route',
      deferredChecks: [],
    });
    expect(report.failedRequiredChecks).toEqual(['sendButton', 'assistantBubble', 'assistantRole', 'copyButton']);
    expect(report.checks.find((check) => check.name === 'assistantBubble')).toMatchObject({
      matched: false,
      requirement: 'required',
    });
  });
});
