import { describe, expect, test } from 'vitest';
import {
  pressButton,
  waitForDocumentReady,
  waitForNotSelector,
  waitForPredicate,
  waitForScriptText,
  waitForSelector,
  waitForVisibleSelector,
} from '../../packages/browser-service/src/service/ui.js';

function createRuntime(values: unknown[]) {
  let callIndex = 0;
  return {
    evaluate: async () => {
      const value = callIndex < values.length ? values[callIndex] : values.at(-1);
      callIndex += 1;
      return { result: { value } };
    },
  } as {
    evaluate: (options: { expression: string; returnByValue?: boolean }) => Promise<{ result: { value: unknown } }>;
  };
}

describe('browser-service ui wait helpers', () => {
  test('waitForPredicate returns attempts, elapsed time, and truthy value', async () => {
    const runtime = createRuntime([null, false, { ready: true }]);

    const result = await waitForPredicate(runtime as never, 'window.__ready', {
      timeoutMs: 50,
      pollMs: 1,
      description: 'custom predicate',
    });

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ ready: true });
    expect(result.attempts).toBe(3);
    expect(result.description).toBe('custom predicate');
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  test('waitForDocumentReady requires visible documents when requested', async () => {
    const runtime = createRuntime([
      null,
      { readyState: 'interactive', visibilityState: 'visible' },
    ]);

    const result = await waitForDocumentReady(runtime as never, {
      timeoutMs: 50,
      pollMs: 1,
      requireVisible: true,
    });

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      readyState: 'interactive',
      visibilityState: 'visible',
    });
    expect(result.attempts).toBe(2);
  });

  test('selector waits use the shared predicate helper', async () => {
    const selectorRuntime = createRuntime([true]);
    const notSelectorRuntime = createRuntime([true]);

    await expect(waitForSelector(selectorRuntime as never, '#composer', 50)).resolves.toBe(true);
    await expect(waitForNotSelector(notSelectorRuntime as never, '#spinner', 50)).resolves.toBe(true);
  });

  test('waitForVisibleSelector returns selector metadata', async () => {
    const runtime = createRuntime([
      {
        tagName: 'button',
        text: 'Submit',
        rect: { x: 10, y: 20, width: 100, height: 30 },
      },
    ]);

    const result = await waitForVisibleSelector(runtime as never, 'button[type="submit"]', {
      timeoutMs: 50,
      pollMs: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      tagName: 'button',
      text: 'Submit',
      rect: { x: 10, y: 20, width: 100, height: 30 },
    });
  });

  test('waitForScriptText matches script payload text', async () => {
    const runtime = createRuntime([
      null,
      { matchedLength: 42, preview: 'window.__NEXT_DATA__={"user":{"name":"Eric"}}' },
    ]);

    const result = await waitForScriptText(runtime as never, {
      includeAll: ['__NEXT_DATA__', '"user"'],
      timeoutMs: 50,
      pollMs: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      matchedLength: 42,
      preview: 'window.__NEXT_DATA__={"user":{"name":"Eric"}}',
    });
  });

  test('pressButton waits for a visible selector before clicking', async () => {
    const runtime = createRuntime([
      {
        tagName: 'button',
        text: 'Submit',
        rect: { x: 10, y: 20, width: 100, height: 30 },
      },
      { ok: true, matchedLabel: 'submit' },
    ]);

    const result = await pressButton(runtime as never, {
      selector: 'button[type="submit"]',
      requireVisible: true,
      timeoutMs: 50,
    });

    expect(result).toEqual({ ok: true, matchedLabel: 'submit' });
  });
});
