import { describe, expect, test, vi } from 'vitest';
import {
  clickRevealedRowAction,
  collectUiDiagnostics,
  findAndClickByLabel,
  navigateAndSettle,
  openRevealedRowMenu,
  pressButton,
  waitForDocumentReady,
  waitForNotSelector,
  waitForPredicate,
  waitForScriptText,
  waitForSelector,
  waitForVisibleSelector,
  withUiDiagnostics,
} from '../../packages/browser-service/src/service/ui.js';

function createRuntime(values: unknown[]) {
  let callIndex = 0;
  const evaluate = vi.fn(async () => {
    const value = callIndex < values.length ? values[callIndex] : values.at(-1);
    callIndex += 1;
    return { result: { value } };
  });
  return {
    evaluate,
  } as {
    evaluate: ReturnType<typeof vi.fn>;
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

  test('findAndClickByLabel searches across all matching root selectors, not only the first', async () => {
    const runtime = createRuntime([true]);

    const clicked = await findAndClickByLabel(runtime as never, {
      selectors: ['[role="menuitem"]'],
      match: { exact: ['rename'] },
      rootSelectors: ['[role="menu"]'],
    });

    expect(clicked).toBe(true);
  });

  test('collectUiDiagnostics returns a bounded structured page snapshot', async () => {
    const runtime = createRuntime([
      {
        url: 'https://grok.com/project/abc123',
        title: 'Grok',
        readyState: 'interactive',
        activeElement: { tag: 'input', role: 'textbox', ariaLabel: 'Rename', text: null },
        dialogs: [{ selector: '[role="dialog"]', tag: 'div', role: 'dialog', ariaLabel: null, text: 'Rename project' }],
        menus: [{ selector: '[role="menu"]', tag: 'div', role: 'menu', ariaLabel: null, text: 'Menu', items: ['Rename', 'Delete'] }],
        buttons: [{ selector: 'button[aria-label="Options"]', tag: 'button', role: null, ariaLabel: 'Options', text: null }],
        candidates: [{ selector: '[data-oracle-project-row="true"]', count: 1, samples: ['Oracle'] }],
        roots: ['nav'],
      },
    ]);

    const result = await collectUiDiagnostics(runtime as never, {
      rootSelectors: ['nav'],
      candidateSelectors: ['[data-oracle-project-row="true"]'],
      limit: 5,
    });

    expect(result).toEqual({
      url: 'https://grok.com/project/abc123',
      title: 'Grok',
      readyState: 'interactive',
      activeElement: { tag: 'input', role: 'textbox', ariaLabel: 'Rename', text: null },
      dialogs: [{ selector: '[role="dialog"]', tag: 'div', role: 'dialog', ariaLabel: null, text: 'Rename project' }],
      menus: [{ selector: '[role="menu"]', tag: 'div', role: 'menu', ariaLabel: null, text: 'Menu', items: ['Rename', 'Delete'] }],
      buttons: [{ selector: 'button[aria-label="Options"]', tag: 'button', role: null, ariaLabel: 'Options', text: null }],
      candidates: [{ selector: '[data-oracle-project-row="true"]', count: 1, samples: ['Oracle'] }],
      roots: ['nav'],
    });
  });

  test('withUiDiagnostics appends a diagnostics payload to thrown errors', async () => {
    const runtime = createRuntime([
      {
        url: 'https://grok.com/project/abc123',
        title: 'Grok',
        readyState: 'complete',
        activeElement: null,
        dialogs: [],
        menus: [],
        buttons: [],
        candidates: [],
        roots: [],
      },
    ]);

    await expect(
      withUiDiagnostics(
        runtime as never,
        async () => {
          throw new Error('Menu item not found');
        },
        { label: 'grok-project-menu' },
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('grok-project-menu: Menu item not found'),
      uiDiagnostics: {
        url: 'https://grok.com/project/abc123',
        title: 'Grok',
      },
    });
  });

  test('navigateAndSettle runs route/document/ready checks after Page.navigate', async () => {
    const runtime = createRuntime([
      { path: '/files' },
      { readyState: 'interactive', visibilityState: 'visible' },
      { loaded: true },
    ]);
    const Page = {
      navigate: vi.fn(async () => undefined),
    };

    const result = await navigateAndSettle({ Page: Page as never, Runtime: runtime as never }, {
      url: 'https://grok.com/files',
      routeExpression: 'location.pathname === "/files"',
      readyExpression: 'window.__filesReady',
      timeoutMs: 50,
      pollMs: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(Page.navigate).toHaveBeenCalledWith({ url: 'https://grok.com/files' });
    expect(runtime.evaluate).toHaveBeenCalledTimes(3);
  });

  test('navigateAndSettle retries with location.assign when the first route settle fails', async () => {
    let fallbackTriggered = false;
    const runtime = {
      evaluate: vi.fn(async (options: { expression: string }) => {
        if (options.expression.includes('location.assign')) {
          fallbackTriggered = true;
          return { result: { value: 'assigned' } };
        }
        if (options.expression.includes('location.pathname === "/files"')) {
          return { result: { value: fallbackTriggered ? { path: '/files' } : null } };
        }
        if (options.expression.includes('document.readyState')) {
          return { result: { value: { readyState: 'interactive', visibilityState: 'visible' } } };
        }
        if (options.expression.includes('window.__filesReady')) {
          return { result: { value: { loaded: true } } };
        }
        return { result: { value: null } };
      }),
    };
    const Page = {
      navigate: vi.fn(async () => undefined),
    };

    const result = await navigateAndSettle({ Page: Page as never, Runtime: runtime as never }, {
      url: 'https://grok.com/files',
      routeExpression: 'location.pathname === "/files"',
      readyExpression: 'window.__filesReady',
      timeoutMs: 50,
      fallbackToLocationAssign: true,
      pollMs: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.fallbackUsed).toBe(true);
    expect(
      runtime.evaluate.mock.calls.some(
        (call) => typeof call?.[0]?.expression === 'string' && call[0].expression.includes('location.assign'),
      ),
    ).toBe(true);
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

  test('clickRevealedRowAction reveals a hover action before pressing it', async () => {
    const runtime = {
      evaluate: vi.fn(async (options: { expression: string }) => {
        if (options.expression.includes('document.elementFromPoint')) {
          return { result: { value: { ok: true, element: { tag: 'button' } } } };
        }
        if (options.expression.includes('const matchOptions =')) {
          return { result: { value: { ok: true, actions: [{ label: 'rename' }] } } };
        }
        if (options.expression.includes('const anchorSelector =')) {
          return { result: { value: { ok: true, matchedLabel: 'rename' } } };
        }
        if (options.expression.includes('center: { x: rect.left + rect.width / 2')) {
          return {
            result: {
              value: {
                ok: true,
                rect: { x: 10, y: 20, width: 100, height: 32 },
                center: { x: 60, y: 36 },
              },
            },
          };
        }
        return { result: { value: null } };
      }),
    };
    const input = {
      dispatchMouseEvent: vi.fn(async () => undefined),
    };

    const result = await clickRevealedRowAction(
      { Runtime: runtime as never, Input: input as never },
      {
        rowSelector: '[data-row="true"]',
        anchorSelector: '[data-item="true"]',
        rootSelectors: ['[role="dialog"]'],
        actionMatch: { exact: ['rename'] },
        timeoutMs: 50,
      },
    );

    expect(result).toEqual({ ok: true, matchedLabel: 'rename' });
    expect(input.dispatchMouseEvent).toHaveBeenCalledTimes(2);
  });

  test('openRevealedRowMenu reveals a row menu trigger before opening the menu', async () => {
    const runtime = {
      evaluate: vi.fn(async (options: { expression: string }) => {
        if (options.expression.includes('document.elementFromPoint')) {
          return { result: { value: { ok: true, element: { tag: 'button' } } } };
        }
        if (options.expression.includes('const matchOptions =')) {
          return { result: { value: { ok: true, actions: [{ label: 'options' }] } } };
        }
        if (options.expression.includes('const selector = "[data-options=\\"true\\"]"')) {
          return { result: { value: { ok: true, listId: 'menu-123' } } };
        }
        if (options.expression.includes('Boolean(document.querySelector("#menu-123"))')) {
          return { result: { value: true } };
        }
        if (options.expression.includes('center: { x: rect.left + rect.width / 2')) {
          return {
            result: {
              value: {
                ok: true,
                rect: { x: 10, y: 20, width: 100, height: 32 },
                center: { x: 60, y: 36 },
              },
            },
          };
        }
        return { result: { value: null } };
      }),
    };
    const input = {
      dispatchMouseEvent: vi.fn(async () => undefined),
    };

    const result = await openRevealedRowMenu(
      { Runtime: runtime as never, Input: input as never },
      {
        rowSelector: '[data-row="true"]',
        triggerSelector: '[data-options="true"]',
        rootSelectors: ['nav'],
        triggerRootSelectors: ['[data-row="true"]'],
        actionMatch: { exact: ['options'] },
        menuSelector: '[role="menu"]',
        timeoutMs: 50,
      },
    );

    expect(result).toEqual({ ok: true, menuSelector: '#menu-123' });
    expect(input.dispatchMouseEvent).toHaveBeenCalledTimes(2);
  });

  test('openRevealedRowMenu can prepare the trigger and fall back to a direct click', async () => {
    const runtime = {
      evaluate: vi.fn(async (options: { expression: string }) => {
        if (options.expression.includes('document.elementFromPoint')) {
          return { result: { value: { ok: true, element: { tag: 'button' } } } };
        }
        if (options.expression.includes('const matchOptions =')) {
          return { result: { value: { ok: true, actions: [{ label: 'options' }] } } };
        }
        if (options.expression.includes("trigger.style.pointerEvents = 'auto'")) {
          return { result: { value: { ok: true } } };
        }
        if (options.expression.includes('const selector = "[data-options=\\"true\\"]"')) {
          return { result: { value: { ok: false } } };
        }
        if (options.expression.includes('trigger.click();')) {
          return { result: { value: { ok: true } } };
        }
        if (options.expression.includes('Boolean(document.querySelector("[role=\\"menu\\"]"))')) {
          return { result: { value: true } };
        }
        if (options.expression.includes('center: { x: rect.left + rect.width / 2')) {
          return {
            result: {
              value: {
                ok: true,
                rect: { x: 10, y: 20, width: 100, height: 32 },
                center: { x: 60, y: 36 },
              },
            },
          };
        }
        return { result: { value: null } };
      }),
    };
    const input = {
      dispatchMouseEvent: vi.fn(async () => undefined),
    };

    const result = await openRevealedRowMenu(
      { Runtime: runtime as never, Input: input as never },
      {
        rowSelector: '[data-row="true"]',
        triggerSelector: '[data-options="true"]',
        rootSelectors: ['nav'],
        triggerRootSelectors: ['[data-row="true"]'],
        actionMatch: { exact: ['options'] },
        menuSelector: '[role="menu"]',
        prepareTriggerBeforeOpen: true,
        directTriggerClickFallback: true,
        timeoutMs: 50,
      },
    );

    expect(result).toEqual({ ok: true, menuSelector: '[role="menu"]' });
    expect(input.dispatchMouseEvent).toHaveBeenCalledTimes(2);
  });
});
