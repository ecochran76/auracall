import type { ChromeClient } from '../types.js';

export const DEFAULT_DIALOG_SELECTORS = ['[role="dialog"]', 'dialog', '[aria-modal="true"]'] as const;

export type LabelMatchOptions = {
  includeAny?: string[];
  includeAll?: string[];
  startsWith?: string[];
  exact?: string[];
};

export type FindAndClickOptions = {
  selectors: string[];
  match: LabelMatchOptions;
  rootSelectors?: string[];
};

export async function isDialogOpen(
  Runtime: ChromeClient['Runtime'],
  dialogSelectors: readonly string[] = DEFAULT_DIALOG_SELECTORS,
): Promise<boolean> {
  const expression = `(() => {
    const selectors = ${JSON.stringify(dialogSelectors)};
    return selectors.some((selector) => Boolean(document.querySelector(selector)));
  })()`;
  const { result } = await Runtime.evaluate({ expression, returnByValue: true });
  return Boolean(result?.value);
}

export async function waitForDialog(
  Runtime: ChromeClient['Runtime'],
  timeoutMs = 10_000,
  dialogSelectors: readonly string[] = DEFAULT_DIALOG_SELECTORS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isDialogOpen(Runtime, dialogSelectors)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

export async function findAndClickByLabel(
  Runtime: ChromeClient['Runtime'],
  options: FindAndClickOptions,
): Promise<boolean> {
  const expression = `(() => {
    const selectors = ${JSON.stringify(options.selectors)};
    const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
    const includeAny = ${JSON.stringify(options.match.includeAny ?? [])};
    const includeAll = ${JSON.stringify(options.match.includeAll ?? [])};
    const startsWith = ${JSON.stringify(options.match.startsWith ?? [])};
    const exact = ${JSON.stringify(options.match.exact ?? [])};
    const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();

    const roots = rootSelectors.length
      ? rootSelectors.map((selector) => document.querySelector(selector)).filter(Boolean)
      : [document];
    const root = roots[0] || document;
    const nodes = Array.from(root.querySelectorAll(selectors.join(',')));

    const matches = (label) => {
      if (!label) return false;
      if (exact.length && exact.includes(label)) return true;
      if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
      if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
      if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
      return false;
    };

    for (const node of nodes) {
      const label = normalize(node.getAttribute?.('aria-label') || node.textContent || '');
      if (!matches(label)) continue;
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      node.dispatchEvent(clickEvent);
      return true;
    }
    return false;
  })()`;
  const { result } = await Runtime.evaluate({ expression, returnByValue: true });
  return Boolean(result?.value);
}

export async function closeDialog(
  Runtime: ChromeClient['Runtime'],
  dialogSelectors: readonly string[] = DEFAULT_DIALOG_SELECTORS,
): Promise<void> {
  const expression = `(() => {
    const selectors = ${JSON.stringify(dialogSelectors)};
    const getDialog = () => selectors.map((selector) => document.querySelector(selector)).find(Boolean);
    const dialog = getDialog();
    if (!dialog) return true;

    const closeButton =
      dialog.querySelector('[aria-label*="close" i], [data-state="open"] [aria-label*="close" i]') ||
      dialog.querySelector('button[aria-label*="close" i]') ||
      dialog.querySelector('button[title*="close" i]');
    if (closeButton) {
      closeButton.click();
    }

    const backdrop =
      dialog.parentElement?.querySelector?.('[data-state="open"][class*="backdrop"]') ||
      document.querySelector('[data-state="open"][data-radix-portal] > [class*="backdrop"]') ||
      document.querySelector('[data-radix-portal] [data-state="open"]');
    if (backdrop && backdrop !== dialog) {
      backdrop.click();
    }

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    const active = getDialog();
    if (active) {
      active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    }
    return true;
  })()`;
  await Runtime.evaluate({ expression, returnByValue: true });

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!(await isDialogOpen(Runtime, dialogSelectors))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
