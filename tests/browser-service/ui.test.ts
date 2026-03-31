import { describe, expect, test, vi } from 'vitest';
import {
  armDownloadCapture,
  readDownloadCapture,
  clickRevealedRowAction,
  collectVisibleOverlayInventory,
  collectVisibleMenuInventory,
  collectUiDiagnostics,
  dismissOverlayRoot,
  dismissOpenMenus,
  findAndClickByLabel,
  inspectNestedMenuPathSelection,
  navigateAndSettle,
  openMenu,
  openRevealedRowMenu,
  openAndSelectMenuItemFromTriggers,
  selectAndVerifyNestedMenuPathOption,
  openSubmenu,
  openSurface,
  pressButton,
  selectNestedMenuPath,
  selectMenuItem,
  submitInlineRename,
  waitForDownloadCapture,
  waitForDocumentReady,
  waitForMenuOpen,
  waitForNotSelector,
  waitForPredicate,
  waitForScriptText,
  waitForSelector,
  waitForVisibleSelector,
  withBlockingSurfaceRecovery,
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

  test('armDownloadCapture installs window-level capture hooks for the default state key', async () => {
    const runtime = createRuntime([true]);

    await armDownloadCapture(runtime as never);

    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    const expression = runtime.evaluate.mock.calls[0]?.[0]?.expression as string;
    expect(expression).toContain('__auracallDownloadCapture');
    expect(expression).toContain('window.open = function');
    expect(expression).toContain('HTMLAnchorElement.prototype.click');
  });

  test('readDownloadCapture returns href and downloadName from runtime state', async () => {
    const runtime = createRuntime([
      {
        href: 'https://chatgpt.com/files/artifact.zip',
        downloadName: 'artifact.zip',
      },
    ]);

    const value = await readDownloadCapture(runtime as never, '__customCapture');

    expect(value).toEqual({
      href: 'https://chatgpt.com/files/artifact.zip',
      downloadName: 'artifact.zip',
    });
  });

  test('waitForDownloadCapture polls until a capture appears', async () => {
    const runtime = createRuntime([
      { href: null, downloadName: null },
      { href: 'https://chatgpt.com/files/artifact.zip', downloadName: 'artifact.zip' },
    ]);

    const value = await waitForDownloadCapture(runtime as never, {
      stateKey: '__customCapture',
      timeoutMs: 20,
      pollMs: 1,
    });

    expect(value).toEqual({
      href: 'https://chatgpt.com/files/artifact.zip',
      downloadName: 'artifact.zip',
    });
    expect(runtime.evaluate).toHaveBeenCalledTimes(2);
  });

  test('waitForDownloadCapture can return immediately when target is not required', async () => {
    const runtime = createRuntime([{ href: null, downloadName: null }]);

    const value = await waitForDownloadCapture(runtime as never, {
      stateKey: '__customCapture',
      timeoutMs: 20,
      pollMs: 1,
      requireTarget: false,
    });

    expect(value).toEqual({ href: null, downloadName: null });
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
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

  test('pressButton default candidate selectors include menuitemradio and option roles', async () => {
    const runtime = createRuntime([{ ok: true, matchedLabel: 'web search' }]);

    const result = await pressButton(runtime as never, {
      match: { exact: ['web search'] },
    });

    expect(result.ok).toBe(true);
    const expression = runtime.evaluate.mock.calls[0]?.[0]?.expression as string;
    expect(expression).toContain('[role="menuitemradio"]');
    expect(expression).toContain('[role="option"]');
  });

  test('selectMenuItem includes menuitemradio and option selectors', async () => {
    const runtime = createRuntime([true, true]);

    const clicked = await selectMenuItem(runtime as never, {
      menuSelector: '[role="menu"]',
      itemMatch: { exact: ['web search'] },
    });

    expect(clicked).toBe(true);
    const expression = runtime.evaluate.mock.calls[1]?.[0]?.expression as string;
    expect(expression).toContain('[role=\\"menuitemradio\\"]');
    expect(expression).toContain('[role=\\"option\\"]');
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

  test('collectVisibleMenuInventory tags visible menus with specific selectors', async () => {
    const runtime = createRuntime([
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: '{"selector":"[role=\\"menu\\"]"}',
          rect: { x: 100, y: 20, width: 240, height: 160 },
          distanceToAnchor: 18,
          items: [{ label: 'rename', role: 'menuitem', selected: false }],
          itemLabels: ['rename'],
        },
      ],
    ]);

    const result = await collectVisibleMenuInventory(runtime as never, {
      menuSelectors: ['[role="menu"]'],
      anchorSelector: 'button[aria-label="Options"]',
    });

    expect(result).toEqual([
      {
        selector: '[data-oracle-visible-menu-index="0"]',
        sourceSelector: '[role="menu"]',
        signature: '{"selector":"[role=\\"menu\\"]"}',
        rect: { x: 100, y: 20, width: 240, height: 160 },
        distanceToAnchor: 18,
        items: [{ label: 'rename', role: 'menuitem', selected: false }],
        itemLabels: ['rename'],
      },
    ]);
  });

  test('collectVisibleOverlayInventory tags visible overlays with specific selectors', async () => {
    const runtime = createRuntime([
      [
        {
          selector: '[role="dialog"]',
          oracleSelector: '[data-oracle-visible-overlay-index="0"]',
          signature: '{"selector":"[role=\\"dialog\\"]"}',
          rect: { x: 80, y: 40, width: 320, height: 180 },
          distanceToAnchor: 12,
          tag: 'div',
          role: 'dialog',
          ariaLabel: 'Too many requests',
          text: 'Too many requests You are making requests too quickly.',
          buttonLabels: ['Okay'],
        },
      ],
    ]);

    const result = await collectVisibleOverlayInventory(runtime as never, {
      overlaySelectors: ['[role="dialog"]'],
      anchorSelector: 'button[aria-label="Send"]',
    });

    expect(result).toEqual([
      {
        selector: '[data-oracle-visible-overlay-index="0"]',
        sourceSelector: '[role="dialog"]',
        signature: '{"selector":"[role=\\"dialog\\"]"}',
        rect: { x: 80, y: 40, width: 320, height: 180 },
        distanceToAnchor: 12,
        tag: 'div',
        role: 'dialog',
        ariaLabel: 'Too many requests',
        text: 'Too many requests You are making requests too quickly.',
        buttonLabels: ['Okay'],
      },
    ]);
  });

  test('waitForMenuOpen picks the best visible menu by expected item labels and novelty', async () => {
    const runtime = createRuntime([
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'old-menu',
          rect: { x: 400, y: 40, width: 220, height: 150 },
          distanceToAnchor: 240,
          items: [{ label: 'delete', role: 'menuitem', selected: false }],
          itemLabels: ['delete'],
        },
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="1"]',
          signature: 'new-menu',
          rect: { x: 140, y: 48, width: 240, height: 180 },
          distanceToAnchor: 16,
          items: [
            { label: 'project only', role: 'menuitemradio', selected: true },
            { label: 'default', role: 'menuitemradio', selected: false },
          ],
          itemLabels: ['project only', 'default'],
        },
      ],
    ]);

    const result = await waitForMenuOpen(runtime as never, {
      menuSelector: '[role="menu"]',
      fallbackSelectors: ['[role="menu"]'],
      expectedItemMatch: { startsWith: ['project only'] },
      existingMenuSignatures: ['old-menu'],
      timeoutMs: 50,
    });

    expect(result).toEqual({
      ok: true,
      menuSelector: '[data-oracle-visible-menu-index="1"]',
    });
  });

  test('openSubmenu promotes a nested visible menu into a specific selector', async () => {
    const runtime = createRuntime([
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'more', role: 'menuitem', selected: false }],
          itemLabels: ['more'],
        },
      ],
      { ok: true, matchedLabel: 'more' },
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'more', role: 'menuitem', selected: false }],
          itemLabels: ['more'],
        },
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="1"]',
          signature: 'submenu',
          rect: { x: 360, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'canvas', role: 'menuitem', selected: false }],
          itemLabels: ['canvas'],
        },
      ],
    ]);

    const result = await openSubmenu(runtime as never, {
      parentMenuSelector: '[data-oracle-visible-menu-index="0"]',
      itemMatch: { exact: ['more'] },
      expectedItemMatch: { exact: ['canvas'] },
      timeoutMs: 50,
    });

    expect(result).toEqual({
      ok: true,
      menuSelector: '[data-oracle-visible-menu-index="1"]',
      interactionStrategy: 'pointer',
    });
  });

  test('selectNestedMenuPath can drive a top-level trigger through a submenu path', async () => {
    const runtime = createRuntime([
      [],
      { ok: true, matchedLabel: 'add files and more' },
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'more', role: 'menuitem', selected: false }],
          itemLabels: ['more'],
        },
      ],
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'more', role: 'menuitem', selected: false }],
          itemLabels: ['more'],
        },
      ],
      { ok: true, matchedLabel: 'more' },
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'more', role: 'menuitem', selected: false }],
          itemLabels: ['more'],
        },
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="1"]',
          signature: 'submenu',
          rect: { x: 360, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'canvas', role: 'menuitem', selected: false }],
          itemLabels: ['canvas'],
        },
      ],
      true,
      true,
    ]);

    const result = await selectNestedMenuPath(runtime as never, {
      trigger: {
        selector: '#composer-plus-btn',
        requireVisible: true,
        interactionStrategies: ['pointer'],
      },
      menuSelector: '[role="menu"]',
      steps: [
        { itemMatch: { exact: ['more'] }, interactionStrategies: ['pointer'] },
        { itemMatch: { exact: ['canvas'] } },
      ],
      timeoutMs: 50,
    });

    expect(result).toEqual({
      ok: true,
      menuSelector: '[data-oracle-visible-menu-index="1"]',
    });
  });

  test('inspectNestedMenuPathSelection reopens nested menus and reads selected state from the final menu', async () => {
    const runtime = createRuntime([
      [],
      { ok: true, matchedLabel: 'add files and more' },
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'more', role: 'menuitem', selected: false }],
          itemLabels: ['more'],
        },
      ],
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'more', role: 'menuitem', selected: false }],
          itemLabels: ['more'],
        },
      ],
      { ok: true, matchedLabel: 'more' },
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'more', role: 'menuitem', selected: false }],
          itemLabels: ['more'],
        },
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="1"]',
          signature: 'submenu',
          rect: { x: 360, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'canvas', role: 'menuitem', selected: true }],
          itemLabels: ['canvas'],
        },
      ],
      [
        {
          selector: '[data-oracle-visible-menu-index="1"]',
          oracleSelector: '[data-oracle-visible-menu-index="1"]',
          signature: 'submenu',
          rect: { x: 360, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'canvas', role: 'menuitem', selected: true }],
          itemLabels: ['canvas'],
        },
      ],
    ]);

    const result = await inspectNestedMenuPathSelection(runtime as never, {
      trigger: {
        selector: '#composer-plus-btn',
        requireVisible: true,
        interactionStrategies: ['pointer'],
      },
      menuSelector: '[role="menu"]',
      steps: [
        { itemMatch: { exact: ['more'] }, interactionStrategies: ['pointer'] },
        { itemMatch: { exact: ['canvas'] } },
      ],
      closeMenusAfter: false,
      timeoutMs: 50,
    });

    expect(result).toEqual({
      ok: true,
      selected: true,
      label: 'canvas',
      menuSelector: '[data-oracle-visible-menu-index="1"]',
      availableLabels: ['canvas'],
    });
  });

  test('selectAndVerifyNestedMenuPathOption reopens the menu path and confirms the option stayed selected', async () => {
    const runtime = createRuntime([
      [],
      { ok: true, matchedLabel: 'add files and more' },
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'web search', role: 'menuitem', selected: false }],
          itemLabels: ['web search'],
        },
      ],
      [
        {
          selector: '[data-oracle-visible-menu-index="0"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'web search', role: 'menuitem', selected: false }],
          itemLabels: ['web search'],
        },
      ],
      [],
      { ok: true, matchedLabel: 'add files and more' },
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'web search', role: 'menuitem', selected: false }],
          itemLabels: ['web search'],
        },
      ],
      true,
      true,
      [],
      { ok: true, matchedLabel: 'add files and more' },
      [
        {
          selector: '[role="menu"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'web search', role: 'menuitem', selected: true }],
          itemLabels: ['web search'],
        },
      ],
      [
        {
          selector: '[data-oracle-visible-menu-index="0"]',
          oracleSelector: '[data-oracle-visible-menu-index="0"]',
          signature: 'top-menu',
          rect: { x: 120, y: 48, width: 240, height: 180 },
          distanceToAnchor: null,
          items: [{ label: 'web search', role: 'menuitem', selected: true }],
          itemLabels: ['web search'],
        },
      ],
    ]);

    const result = await selectAndVerifyNestedMenuPathOption(runtime as never, {
      trigger: {
        selector: '#composer-plus-btn',
        requireVisible: true,
        interactionStrategies: ['pointer'],
      },
      menuSelector: '[role="menu"]',
      steps: [{ itemMatch: { exact: ['web search'] } }],
      closeMenusAfter: false,
      timeoutMs: 50,
    });

    expect(result).toEqual({
      ok: true,
      alreadySelected: false,
      label: 'web search',
      menuSelector: '[data-oracle-visible-menu-index="0"]',
      availableLabels: ['web search'],
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

  test('withUiDiagnostics preserves caller context in the diagnostics payload', async () => {
    const runtime = createRuntime([
      {
        url: 'https://chatgpt.com/',
        title: 'ChatGPT',
        readyState: 'complete',
        activeElement: null,
        dialogs: [],
        menus: [],
        buttons: [],
        candidates: [],
        roots: [],
        context: {
          triggerLabel: 'Project settings',
          interactionStrategies: ['pointer', 'keyboard-space'],
        },
      },
    ]);

    await expect(
      withUiDiagnostics(
        runtime as never,
        async () => {
          throw new Error('Menu did not open');
        },
        {
          label: 'chatgpt-project-memory',
          context: {
            triggerLabel: 'Project settings',
            interactionStrategies: ['pointer', 'keyboard-space'],
          },
        },
      ),
    ).rejects.toMatchObject({
      uiDiagnostics: {
        context: {
          triggerLabel: 'Project settings',
          interactionStrategies: ['pointer', 'keyboard-space'],
        },
      },
    });
  });

  test('withBlockingSurfaceRecovery retries after a pre-existing blocking surface is dismissed', async () => {
    let inspectCalls = 0;
    let dismissCalls = 0;
    let actionCalls = 0;

    const result = await withBlockingSurfaceRecovery(
      async () => {
        actionCalls += 1;
        return 'ok';
      },
      {
        pauseMs: 0,
        inspect: async () =>
          inspectCalls++ === 0
            ? { kind: 'rate-limit', summary: 'Too many requests', selector: '[data-oracle-visible-overlay-index="0"]' }
            : null,
        dismiss: async () => {
          dismissCalls += 1;
        },
      },
    );

    expect(result).toBe('ok');
    expect(actionCalls).toBe(1);
    expect(dismissCalls).toBe(1);
  });

  test('withBlockingSurfaceRecovery can recover from classified action errors', async () => {
    let actionCalls = 0;
    let dismissCalls = 0;

    const result = await withBlockingSurfaceRecovery(
      async () => {
        actionCalls += 1;
        if (actionCalls === 1) {
          throw new Error('Too many requests. You are making requests too quickly.');
        }
        return 'ok';
      },
      {
        pauseMs: 0,
        inspect: async () => null,
        dismiss: async () => {
          dismissCalls += 1;
        },
        classifyError: async (error) => {
          const message = error instanceof Error ? error.message : String(error);
          return /too many requests/i.test(message)
            ? { kind: 'rate-limit', summary: 'Too many requests' }
            : null;
        },
      },
    );

    expect(result).toBe('ok');
    expect(actionCalls).toBe(2);
    expect(dismissCalls).toBe(1);
  });

  test('dismissOpenMenus sends Escape only when a visible menu is present', async () => {
    const runtime = createRuntime([true, true, true]);

    const dismissed = await dismissOpenMenus(runtime as never, 50);

    expect(dismissed).toBe(true);
    const escapeExpression = runtime.evaluate.mock.calls[1]?.[0]?.expression as string;
    expect(escapeExpression).toContain('Escape');
  });

  test('dismissOverlayRoot targets the specific overlay selector before waiting for it to disappear', async () => {
    const runtime = createRuntime([{ ok: true }, true]);

    const dismissed = await dismissOverlayRoot(runtime as never, '[data-oracle-visible-overlay-index="0"]', {
      closeButtonMatch: { includeAny: ['okay'] },
      timeoutMs: 50,
    });

    expect(dismissed).toBe(true);
    const expression = runtime.evaluate.mock.calls[0]?.[0]?.expression as string;
    expect(expression).toContain('[data-oracle-visible-overlay-index=\\"0\\"]');
    expect(expression).toContain('okay');
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

  test('openMenu retries interaction strategies until one opens the menu', async () => {
    const runtime = {
      evaluate: vi.fn(async (options: { expression: string }) => {
        if (options.expression.includes('"pointer"')) {
          return {
            result: {
              value: {
                ok: true,
                matchedLabel: 'project settings',
                rootSelectorUsed: 'dialog[open]',
                listId: '',
              },
            },
          };
        }
        if (options.expression.includes('"keyboard-space"')) {
          return {
            result: {
              value: {
                ok: true,
                matchedLabel: 'project settings',
                rootSelectorUsed: 'dialog[open]',
                listId: 'menu-123',
              },
            },
          };
        }
        if (options.expression.includes('Boolean(document.querySelector("[role=\\"menu\\"]"))')) {
          return { result: { value: false } };
        }
        if (options.expression.includes('Boolean(document.querySelector("#menu-123"))')) {
          return { result: { value: true } };
        }
        return { result: { value: false } };
      }),
    };

    const result = await openMenu(runtime as never, {
      trigger: {
        match: { exact: ['project settings'] },
        requireVisible: false,
        interactionStrategies: ['pointer', 'keyboard-space'],
      },
      menuSelector: '[role="menu"]',
      timeoutMs: 50,
    });

    expect(result).toEqual({
      ok: true,
      menuSelector: '#menu-123',
      interactionStrategy: 'keyboard-space',
      rootSelectorUsed: 'dialog[open]',
      attemptedStrategies: ['pointer', 'keyboard-space'],
    });
  }, 15_000);

  test('openAndSelectMenuItemFromTriggers falls back to later triggers with per-attempt setup', async () => {
    const beforeSecondAttempt = vi.fn(async () => undefined);
    const runtime = {
      evaluate: vi.fn(async (options: { expression: string }) => {
        if (options.expression.includes('const nodes = Array.from(document.querySelectorAll("[role=\\"menu\\"], [role=\\"listbox\\"], [data-radix-collection-root]"))')) {
          return { result: { value: false } };
        }
        if (options.expression.includes('const menuSelectors =') && options.expression.includes('#menu-456')) {
          return {
            result: {
              value: [
                {
                  selector: '#menu-456',
                  sourceSelector: '#menu-456',
                  signature: 'menu-456',
                  rect: { x: 10, y: 20, width: 200, height: 160 },
                  distanceToAnchor: null,
                  items: [{ label: 'delete', role: 'menuitem', selected: false }],
                  itemLabels: ['delete'],
                },
              ],
            },
          };
        }
        if (options.expression.includes('const menuSelectors =')) {
          return { result: { value: [] } };
        }
        if (options.expression.includes('const selector = "[data-row-menu=\\"true\\"]"')) {
          return { result: { value: { ok: false, reason: 'Button not found' } } };
        }
        if (options.expression.includes('const selector = "[data-header-menu=\\"true\\"]"')) {
          return {
            result: {
              value: {
                ok: true,
                matchedLabel: 'options',
                rootSelectorUsed: 'document',
                listId: 'menu-456',
              },
            },
          };
        }
        if (options.expression.includes('Boolean(document.querySelector("#menu-456"))')) {
          return { result: { value: true } };
        }
        if (options.expression.includes('[role=\\"menuitemradio\\"]') && options.expression.includes('"delete"')) {
          return { result: { value: true } };
        }
        return { result: { value: false } };
      }),
    };

    const result = await openAndSelectMenuItemFromTriggers(runtime as never, {
      triggers: [
        {
          name: 'row',
          trigger: {
            selector: '[data-row-menu="true"]',
            requireVisible: true,
            timeoutMs: 50,
          },
          menuSelector: '[role="menu"]',
          closeMenuAfter: true,
        },
        {
          name: 'header',
          beforeAttempt: beforeSecondAttempt,
          trigger: {
            selector: '[data-header-menu="true"]',
            requireVisible: true,
            timeoutMs: 50,
          },
          menuSelector: '[role="menu"]',
          closeMenuAfter: true,
        },
      ],
      itemMatch: { exact: ['delete'] },
      timeoutMs: 50,
    });

    expect(beforeSecondAttempt).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      triggerIndex: 1,
      triggerName: 'header',
      menuSelector: '#menu-456',
      attempts: [
        {
          triggerIndex: 0,
          triggerName: 'row',
          menuOpened: false,
          menuSelected: false,
          reason: 'Button not found',
        },
        {
          triggerIndex: 1,
          triggerName: 'header',
          menuOpened: true,
          menuSelected: true,
          menuSelector: '#menu-456',
        },
      ],
    });
  });

  test('openSurface uses fallback triggers until the ready state appears', async () => {
    const runtime = createRuntime([
      false,
      { ok: true, matchedLabel: 'edit the title of oracle' },
      false,
      { ok: true, matchedLabel: 'show project details' },
      { open: true },
    ]);

    const result = await openSurface(runtime as never, {
      readyExpression: 'window.__projectSettingsOpen',
      readyDescription: 'project settings ready',
      timeoutMs: 50,
      alreadyOpenTimeoutMs: 50,
      attempts: [
        {
          name: 'edit-title',
          trigger: {
            match: { startsWith: ['edit the title of'] },
            requireVisible: false,
          },
        },
        {
          name: 'show-project-details',
          trigger: {
            match: { exact: ['show project details'] },
            requireVisible: false,
          },
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      attempt: 'show-project-details',
      attempts: [
        {
          name: 'edit-title',
          triggerOk: true,
          triggerReason: undefined,
          matchedLabel: 'edit the title of oracle',
          readyOk: false,
        },
        {
          name: 'show-project-details',
          triggerOk: true,
          triggerReason: undefined,
          matchedLabel: 'show project details',
          readyOk: true,
        },
      ],
    });
  }, 15_000);

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

  test('submitInlineRename waits for the target input to become editable before submitting', async () => {
    const runtime = createRuntime([
      true,
      { ok: true },
      { ok: true },
    ]);

    const result = await submitInlineRename(runtime as never, {
      value: 'Renamed conversation',
      inputSelector: 'input[type="text"]',
      timeoutMs: 50,
    });

    expect(result).toEqual({ ok: true });
    expect(runtime.evaluate).toHaveBeenCalledTimes(4);
  });

  test('submitInlineRename reports non-editable inputs before trying to submit', async () => {
    const runtime = createRuntime([
      true,
      null,
    ]);

    const result = await submitInlineRename(runtime as never, {
      value: 'Renamed conversation',
      inputSelector: 'input[type="text"]',
      timeoutMs: 50,
    });

    expect(result).toEqual({ ok: false, reason: 'Rename input not editable' });
  });

  test('submitInlineRename can submit with native Enter before synthetic fallback', async () => {
    const runtime = createRuntime([
      true,
      { ok: true },
      { ok: true, usedSaveButton: false },
      false,
      true,
    ]);
    const input = {
      dispatchKeyEvent: vi.fn(async () => undefined),
    };

    const result = await submitInlineRename(
      runtime as never,
      {
        value: 'Renamed conversation',
        inputSelector: 'input[type="text"]',
        closeSelector: 'input[type="text"]',
        timeoutMs: 50,
        submitStrategy: 'native-then-synthetic',
      },
      { Input: input as never },
    );

    expect(result).toEqual({ ok: true });
    expect(input.dispatchKeyEvent).toHaveBeenCalledTimes(2);
    expect(input.dispatchKeyEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'keyDown', key: 'Enter' }),
    );
    expect(input.dispatchKeyEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'keyUp', key: 'Enter' }),
    );
  });
});
