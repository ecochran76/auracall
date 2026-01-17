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

export type PressButtonOptions = {
  selector?: string;
  match?: LabelMatchOptions;
  rootSelectors?: string[];
  requireVisible?: boolean;
  timeoutMs?: number;
  postSelector?: string;
  postGoneSelector?: string;
};

export type SetInputValueOptions = {
  selector?: string;
  match?: LabelMatchOptions;
  rootSelectors?: string[];
  value: string;
  requireVisible?: boolean;
  timeoutMs?: number;
};

export type OpenMenuOptions = {
  trigger: PressButtonOptions;
  menuSelector?: string;
  timeoutMs?: number;
};

export type SelectMenuItemOptions = {
  menuSelector?: string;
  itemMatch: LabelMatchOptions;
  timeoutMs?: number;
  closeMenuAfter?: boolean;
};

export type SelectFromListboxOptions = {
  trigger: PressButtonOptions;
  itemMatch: LabelMatchOptions;
  listboxSelector?: string;
  timeoutMs?: number;
  closeAfter?: boolean;
};

export type OpenAndSelectMenuItemOptions = {
  trigger: PressButtonOptions;
  itemMatch: LabelMatchOptions;
  menuSelector?: string;
  timeoutMs?: number;
  closeMenuAfter?: boolean;
};

export type OpenAndSelectListboxOptions = {
  trigger: PressButtonOptions;
  itemMatch: LabelMatchOptions;
  listboxSelector?: string;
  timeoutMs?: number;
  closeAfter?: boolean;
};

export type TogglePanelOptions = {
  trigger: PressButtonOptions;
  isOpenSelector: string;
  open: boolean;
  timeoutMs?: number;
};

export type HoverElementOptions = {
  selector: string;
  rootSelectors?: string[];
  timeoutMs?: number;
};

export type HoverElementResult = {
  ok: boolean;
  reason?: string;
  point?: { x: number; y: number };
  rect?: { x: number; y: number; width: number; height: number };
  element?: { tag?: string | null; ariaLabel?: string | null; className?: string | null; id?: string | null };
};

export type PressRowActionOptions = {
  anchorSelector: string;
  actionMatch: LabelMatchOptions;
  rootSelectors?: string[];
  timeoutMs?: number;
};

export type PressDialogButtonOptions = {
  match: LabelMatchOptions;
  rootSelectors?: string[];
  timeoutMs?: number;
  preferLast?: boolean;
};

export type SubmitInlineRenameOptions = {
  value: string;
  inputSelector?: string;
  inputMatch?: LabelMatchOptions;
  rootSelectors?: string[];
  saveButtonMatch?: LabelMatchOptions;
  timeoutMs?: number;
  closeSelector?: string;
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

export async function waitForSelector(
  Runtime: ChromeClient['Runtime'],
  selector: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({
      expression: `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
      returnByValue: true,
    });
    if (result?.value) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

export async function waitForNotSelector(
  Runtime: ChromeClient['Runtime'],
  selector: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({
      expression: `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
      returnByValue: true,
    });
    if (!result?.value) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

export async function hoverElement(
  Runtime: ChromeClient['Runtime'],
  Input: ChromeClient['Input'],
  options: HoverElementOptions,
): Promise<HoverElementResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  let lastError: string | undefined;
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const selector = ${JSON.stringify(options.selector)};
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
        const roots = rootSelectors.length
          ? rootSelectors.map((root) => document.querySelector(root)).filter(Boolean)
          : [document];
        const root = roots[0] || document;
        const el = root.querySelector(selector);
        if (!el) return { ok: false, reason: 'Selector not found: ' + selector };
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          return { ok: false, reason: 'Element not visible', rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
        }
        return {
          ok: true,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        };
      })()`,
      returnByValue: true,
    });
    const info = result?.value as
      | { ok: true; rect: { x: number; y: number; width: number; height: number }; center: { x: number; y: number } }
      | { ok: false; reason?: string; rect?: { x: number; y: number; width: number; height: number } }
      | undefined;
    if (!info?.ok) {
      lastError = info?.reason || 'Hover target not found';
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }

    const x = Math.round(info.center.x);
    const y = Math.round(info.center.y);
    await Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
    await Input.dispatchMouseEvent({ type: 'mouseMoved', x: x + 1, y: y + 1 });

    const verify = await Runtime.evaluate({
      expression: `(() => {
        const selector = ${JSON.stringify(options.selector)};
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
        const roots = rootSelectors.length
          ? rootSelectors.map((root) => document.querySelector(root)).filter(Boolean)
          : [document];
        const root = roots[0] || document;
        const el = root.querySelector(selector);
        const hit = document.elementFromPoint(${x}, ${y});
        const ok = Boolean(el && hit && (el === hit || el.contains(hit)));
        return {
          ok,
          element: hit
            ? {
                tag: hit.tagName.toLowerCase(),
                ariaLabel: hit.getAttribute('aria-label'),
                className: hit.className,
                id: hit.id,
              }
            : null,
        };
      })()`,
      returnByValue: true,
    });
    const verifyInfo = verify.result?.value as
      | { ok: boolean; element?: { tag?: string | null; ariaLabel?: string | null; className?: string | null; id?: string | null } }
      | undefined;
    if (verifyInfo?.ok) {
      return { ok: true, point: { x, y }, rect: info.rect, element: verifyInfo.element };
    }
    lastError = 'Hover point did not hit element';
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return { ok: false, reason: lastError || 'Hover target not found' };
}

export async function pressRowAction(
  Runtime: ChromeClient['Runtime'],
  options: PressRowActionOptions,
): Promise<{ ok: boolean; reason?: string; matchedLabel?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const anchorSelector = ${JSON.stringify(options.anchorSelector)};
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
        const includeAny = ${JSON.stringify(options.actionMatch.includeAny ?? [])};
        const includeAll = ${JSON.stringify(options.actionMatch.includeAll ?? [])};
        const startsWith = ${JSON.stringify(options.actionMatch.startsWith ?? [])};
        const exact = ${JSON.stringify(options.actionMatch.exact ?? [])};
        const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
        const matches = (label) => {
          if (!label) return false;
          if (exact.length && exact.includes(label)) return true;
          if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
          if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
          if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
          return false;
        };

        const roots = rootSelectors.length
          ? rootSelectors.map((selector) => document.querySelector(selector)).filter(Boolean)
          : [document];
        const root = roots[0] || document;
        let anchor = root.querySelector(anchorSelector);
        if (!anchor && root !== document) {
          anchor = document.querySelector(anchorSelector);
        }
        if (!anchor) {
          return { ok: false, reason: 'Anchor not found' };
        }
        const row =
          anchor.closest('div.grid') ||
          anchor.closest('div[class*="rounded"]') ||
          anchor.closest('li') ||
          anchor.closest('div') ||
          anchor.parentElement;
        if (!row) {
          return { ok: false, reason: 'Row container not found' };
        }

        const visibleRect = (el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 ? rect : null;
        };
        const rowRect = visibleRect(row);
        const distanceToRow = (rect) => {
          if (!rowRect) return 0;
          const dx = Math.abs(rect.x - rowRect.x);
          const dy = Math.abs(rect.y - rowRect.y);
          return dx + dy;
        };

        const candidates = Array.from(
          row.querySelectorAll('button, [role="button"]'),
        ).concat(Array.from(root.querySelectorAll('button, [role="button"]')));

        const matching = candidates
          .map((button) => ({
            button,
            label: normalize(button.getAttribute?.('aria-label') || button.textContent || ''),
          }))
          .filter((entry) => matches(entry.label));

        if (matching.length === 0) {
          return { ok: false, reason: 'Action button not found' };
        }

        let target =
          matching.find((entry) => row.contains(entry.button)) ||
          null;
        if (!target && rowRect) {
          target =
            matching
              .map((entry) => ({ ...entry, rect: visibleRect(entry.button) }))
              .filter((entry) => entry.rect)
              .sort((a, b) => distanceToRow(a.rect) - distanceToRow(b.rect))[0] || null;
        }
        if (!target) {
          target = matching[0];
        }
        target.button.click();
        return { ok: true, matchedLabel: target.label };
      })()`,
      returnByValue: true,
    });
    const info = result?.value as { ok: boolean; reason?: string; matchedLabel?: string } | undefined;
    if (info?.ok) {
      return info;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { ok: false, reason: 'Action button not found' };
}

export async function pressDialogButton(
  Runtime: ChromeClient['Runtime'],
  options: PressDialogButtonOptions,
): Promise<{ ok: boolean; reason?: string; matchedLabel?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? DEFAULT_DIALOG_SELECTORS)};
        const includeAny = ${JSON.stringify(options.match.includeAny ?? [])};
        const includeAll = ${JSON.stringify(options.match.includeAll ?? [])};
        const startsWith = ${JSON.stringify(options.match.startsWith ?? [])};
        const exact = ${JSON.stringify(options.match.exact ?? [])};
        const preferLast = ${JSON.stringify(Boolean(options.preferLast))};
        const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
        const matches = (label) => {
          if (!label) return false;
          if (exact.length && exact.includes(label)) return true;
          if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
          if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
          if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
          return false;
        };
        const roots = rootSelectors
          .map((selector) => document.querySelector(selector))
          .filter(Boolean);
        const root = roots[0] || document;
        const buttons = Array.from(root.querySelectorAll('button, [role="button"]'));
        const matchesList = buttons
          .map((button) => ({
            button,
            label: normalize(button.getAttribute?.('aria-label') || button.textContent || ''),
          }))
          .filter((entry) => matches(entry.label));
        if (matchesList.length === 0) {
          return { ok: false, reason: 'Dialog button not found' };
        }
        const target = preferLast ? matchesList[matchesList.length - 1] : matchesList[0];
        target.button.click();
        return { ok: true, matchedLabel: target.label };
      })()`,
      returnByValue: true,
    });
    const info = result?.value as { ok: boolean; reason?: string; matchedLabel?: string } | undefined;
    if (info?.ok) {
      return info;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { ok: false, reason: 'Dialog button not found' };
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

  const combined = dialogSelectors.join(', ');
  await waitForNotSelector(Runtime, combined, 3000);
}

export async function pressButton(
  Runtime: ChromeClient['Runtime'],
  options: PressButtonOptions,
): Promise<{ ok: boolean; reason?: string; matchedLabel?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (options.selector) {
    const ready = await waitForSelector(Runtime, options.selector, timeoutMs);
    if (!ready) {
      return { ok: false, reason: 'Selector not found: ' + options.selector };
    }
  }

  const result = await Runtime.evaluate({
    expression: `(() => {
      const selector = ${JSON.stringify(options.selector ?? null)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const requireVisible = ${JSON.stringify(options.requireVisible ?? true)};
      const includeAny = ${JSON.stringify(options.match?.includeAny ?? [])};
      const includeAll = ${JSON.stringify(options.match?.includeAll ?? [])};
      const startsWith = ${JSON.stringify(options.match?.startsWith ?? [])};
      const exact = ${JSON.stringify(options.match?.exact ?? [])};
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
        : [document];
      const matchesLabel = (label) => {
        if (!label) return false;
        if (exact.length && exact.includes(label)) return true;
        if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
        if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
        if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const candidates = [];
      for (const root of roots) {
        if (!root) continue;
        if (selector) {
          candidates.push(...Array.from(root.querySelectorAll(selector)));
        } else {
          candidates.push(...Array.from(root.querySelectorAll('button,[role=\"button\"],a,[role=\"link\"],[role=\"menuitem\"]')));
        }
      }
      const visibleCandidates = requireVisible ? candidates.filter(isVisible) : candidates;
      let match = null;
      if (selector) {
        match = visibleCandidates[0] || null;
      } else {
        match = visibleCandidates.find((el) => {
          const label = normalize(el.getAttribute?.('aria-label') || el.textContent || '');
          return matchesLabel(label);
        }) || null;
      }
      if (!match) {
        return { ok: false, reason: 'Button not found' };
      }
      const label = normalize(match.getAttribute?.('aria-label') || match.textContent || '');
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      match.dispatchEvent(clickEvent);
      return { ok: true, matchedLabel: label };
    })()`,
    returnByValue: true,
  });
  const info = result.result?.value as { ok: boolean; reason?: string; matchedLabel?: string } | undefined;
  if (!info?.ok) {
    return { ok: false, reason: info?.reason || 'Button click failed' };
  }

  if (options.postSelector) {
    const ok = await waitForSelector(Runtime, options.postSelector, timeoutMs);
    if (!ok) {
      return { ok: false, reason: 'Post selector not found: ' + options.postSelector };
    }
  }
  if (options.postGoneSelector) {
    const ok = await waitForNotSelector(Runtime, options.postGoneSelector, timeoutMs);
    if (!ok) {
      return { ok: false, reason: 'Post-gone selector still present: ' + options.postGoneSelector };
    }
  }
  return { ok: true, matchedLabel: info.matchedLabel };
}

export async function openDialog(
  Runtime: ChromeClient['Runtime'],
  options: PressButtonOptions & { dialogSelectors?: readonly string[]; readySelector?: string },
): Promise<boolean> {
  const pressed = await pressButton(Runtime, options);
  if (!pressed.ok) return false;
  const dialogSelectors = options.dialogSelectors ?? DEFAULT_DIALOG_SELECTORS;
  const opened = await waitForDialog(Runtime, options.timeoutMs ?? 5000, dialogSelectors);
  if (!opened) return false;
  if (options.readySelector) {
    return waitForSelector(Runtime, options.readySelector, options.timeoutMs ?? 5000);
  }
  return true;
}

export async function openMenu(
  Runtime: ChromeClient['Runtime'],
  options: OpenMenuOptions,
): Promise<{ ok: boolean; menuSelector?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const result = await Runtime.evaluate({
    expression: `(() => {
      const selector = ${JSON.stringify(options.trigger.selector ?? null)};
      const rootSelectors = ${JSON.stringify(options.trigger.rootSelectors ?? [])};
      const requireVisible = ${JSON.stringify(options.trigger.requireVisible ?? true)};
      const includeAny = ${JSON.stringify(options.trigger.match?.includeAny ?? [])};
      const includeAll = ${JSON.stringify(options.trigger.match?.includeAll ?? [])};
      const startsWith = ${JSON.stringify(options.trigger.match?.startsWith ?? [])};
      const exact = ${JSON.stringify(options.trigger.match?.exact ?? [])};
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
        : [document];
      const matchesLabel = (label) => {
        if (!label) return false;
        if (exact.length && exact.includes(label)) return true;
        if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
        if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
        if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const candidates = [];
      for (const root of roots) {
        if (!root) continue;
        if (selector) {
          candidates.push(...Array.from(root.querySelectorAll(selector)));
        } else {
          candidates.push(...Array.from(root.querySelectorAll('button,[role=\"button\"],a,[role=\"link\"],[role=\"menuitem\"]')));
        }
      }
      const visibleCandidates = requireVisible ? candidates.filter(isVisible) : candidates;
      let match = null;
      if (selector) {
        match = visibleCandidates[0] || null;
      } else {
        match = visibleCandidates.find((el) => {
          const label = normalize(el.getAttribute?.('aria-label') || el.textContent || '');
          return matchesLabel(label);
        }) || null;
      }
      if (!match) {
        return { ok: false };
      }
      const listId = match.getAttribute?.('aria-controls') || '';
      const pointerOpts = { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 1 };
      match.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
      match.dispatchEvent(new MouseEvent('mousedown', pointerOpts));
      match.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
      match.dispatchEvent(new MouseEvent('mouseup', pointerOpts));
      match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return { ok: true, listId };
    })()`,
    returnByValue: true,
  });
  const info = result.result?.value as { ok: boolean; listId?: string } | undefined;
  if (!info?.ok) {
    return { ok: false };
  }
  const menuSelector = info.listId ? `#${info.listId}` : options.menuSelector;
  const ready = await waitForSelector(
    Runtime,
    menuSelector || '[role="menu"], [role="listbox"], [data-radix-collection-item]',
    timeoutMs,
  );
  return ready ? { ok: true, menuSelector } : { ok: false };
}

export async function openAndSelectMenuItem(
  Runtime: ChromeClient['Runtime'],
  options: OpenAndSelectMenuItemOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const opened = await openMenu(Runtime, {
    trigger: options.trigger,
    menuSelector: options.menuSelector,
    timeoutMs,
  });
  if (!opened.ok) return false;
  const menuSelector = opened.menuSelector || options.menuSelector;
  const clicked = await selectMenuItem(Runtime, {
    menuSelector,
    itemMatch: options.itemMatch,
    timeoutMs,
    closeMenuAfter: options.closeMenuAfter,
  });
  return clicked;
}

export async function selectMenuItem(
  Runtime: ChromeClient['Runtime'],
  options: SelectMenuItemOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const ready = await waitForSelector(
    Runtime,
    options.menuSelector || '[role="menu"], [role="listbox"], [data-radix-collection-item]',
    timeoutMs,
  );
  if (!ready) return false;
  const clicked = await findAndClickByLabel(Runtime, {
    selectors: ['[role="menuitem"]', '[data-radix-collection-item]', 'button', 'a'],
    match: options.itemMatch,
    rootSelectors: options.menuSelector ? [options.menuSelector] : undefined,
  });
  if (!clicked) return false;
  if (options.closeMenuAfter) {
    await waitForNotSelector(Runtime, options.menuSelector || '[role="menu"], [role="listbox"]', timeoutMs);
  }
  return true;
}

export async function selectFromListbox(
  Runtime: ChromeClient['Runtime'],
  options: SelectFromListboxOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const opened = await openMenu(Runtime, { trigger: options.trigger, menuSelector: options.listboxSelector, timeoutMs });
  if (!opened.ok) return false;
  const menuSelector = opened.menuSelector || options.listboxSelector;
  const clicked = await findAndClickByLabel(Runtime, {
    selectors: ['[role="option"]', '[data-radix-collection-item]', '[data-slot="select-item"]'],
    match: options.itemMatch,
    rootSelectors: menuSelector ? [menuSelector] : undefined,
  });
  if (!clicked) return false;
  if (options.closeAfter !== false) {
    await waitForNotSelector(Runtime, menuSelector || '[role="listbox"]', timeoutMs);
  }
  return true;
}

export async function openAndSelectListbox(
  Runtime: ChromeClient['Runtime'],
  options: OpenAndSelectListboxOptions,
): Promise<boolean> {
  return selectFromListbox(Runtime, options);
}

export async function setInputValue(
  Runtime: ChromeClient['Runtime'],
  options: SetInputValueOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (options.selector) {
    const ready = await waitForSelector(Runtime, options.selector, timeoutMs);
    if (!ready) return false;
  }
  const result = await Runtime.evaluate({
    expression: `(() => {
      const selector = ${JSON.stringify(options.selector ?? null)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const requireVisible = ${JSON.stringify(options.requireVisible ?? true)};
      const includeAny = ${JSON.stringify(options.match?.includeAny ?? [])};
      const includeAll = ${JSON.stringify(options.match?.includeAll ?? [])};
      const startsWith = ${JSON.stringify(options.match?.startsWith ?? [])};
      const exact = ${JSON.stringify(options.match?.exact ?? [])};
      const value = ${JSON.stringify(options.value)};
      const normalize = (v) => String(v || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const matchesLabel = (label) => {
        if (!label) return false;
        if (exact.length && exact.includes(label)) return true;
        if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
        if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
        if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
        : [document];
      const candidates = [];
      for (const root of roots) {
        if (!root) continue;
        if (selector) {
          candidates.push(...Array.from(root.querySelectorAll(selector)));
        } else {
          candidates.push(...Array.from(root.querySelectorAll('input, textarea, [contenteditable=\"true\"]')));
        }
      }
      const visibleCandidates = requireVisible ? candidates.filter(isVisible) : candidates;
      let match = null;
      if (selector) {
        match = visibleCandidates[0] || null;
      } else {
        match = visibleCandidates.find((el) => {
          const label = normalize(el.getAttribute?.('aria-label') || el.getAttribute?.('placeholder') || el.textContent || '');
          return matchesLabel(label);
        }) || null;
      }
      if (!match) return { ok: false };
      if (match.tagName === 'INPUT' || match.tagName === 'TEXTAREA') {
        const setter =
          Object.getOwnPropertyDescriptor(match.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(match, value);
        } else {
          match.value = value;
        }
        match.dispatchEvent(new Event('input', { bubbles: true }));
        match.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        match.textContent = value;
        match.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  return Boolean((result.result?.value as { ok?: boolean } | undefined)?.ok);
}

export async function submitInlineRename(
  Runtime: ChromeClient['Runtime'],
  options: SubmitInlineRenameOptions,
): Promise<{ ok: boolean; reason?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (options.inputSelector) {
    const ready = await waitForSelector(Runtime, options.inputSelector, timeoutMs);
    if (!ready) return { ok: false, reason: 'Rename input not found' };
  }

  const result = await Runtime.evaluate({
    expression: `(() => {
      const value = ${JSON.stringify(options.value)};
      const selector = ${JSON.stringify(options.inputSelector ?? null)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const includeAny = ${JSON.stringify(options.inputMatch?.includeAny ?? [])};
      const includeAll = ${JSON.stringify(options.inputMatch?.includeAll ?? [])};
      const startsWith = ${JSON.stringify(options.inputMatch?.startsWith ?? [])};
      const exact = ${JSON.stringify(options.inputMatch?.exact ?? [])};
      const saveIncludeAny = ${JSON.stringify(options.saveButtonMatch?.includeAny ?? [])};
      const saveIncludeAll = ${JSON.stringify(options.saveButtonMatch?.includeAll ?? [])};
      const saveStartsWith = ${JSON.stringify(options.saveButtonMatch?.startsWith ?? [])};
      const saveExact = ${JSON.stringify(options.saveButtonMatch?.exact ?? [])};

      const normalize = (v) => String(v || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const matchesLabel = (label, match) => {
        if (!label) return false;
        if (match.exact.length && match.exact.includes(label)) return true;
        if (match.startsWith.length && match.startsWith.some((token) => label.startsWith(token))) return true;
        if (match.includeAll.length && match.includeAll.every((token) => label.includes(token))) return true;
        if (match.includeAny.length && match.includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
        : [document];
      const root = roots[0] || document;

      let input = null;
      if (selector) {
        input = root.querySelector(selector) || (root !== document ? document.querySelector(selector) : null);
      } else {
        const match = { includeAny, includeAll, startsWith, exact };
        const candidates = Array.from(root.querySelectorAll('input, textarea, [contenteditable=\"true\"]')).filter(visible);
        input = candidates.find((el) => {
          const label = normalize(el.getAttribute?.('aria-label') || el.getAttribute?.('placeholder') || el.textContent || '');
          return matchesLabel(label, match);
        }) || null;
      }
      if (!input) return { ok: false, reason: 'Rename input not found' };

      input.focus();
      if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
        const proto = input.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) {
          setter.call(input, value);
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        input.textContent = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const saveMatch = {
        includeAny: saveIncludeAny,
        includeAll: saveIncludeAll,
        startsWith: saveStartsWith,
        exact: saveExact,
      };
      if (saveMatch.includeAny.length || saveMatch.includeAll.length || saveMatch.startsWith.length || saveMatch.exact.length) {
        const saveButtons = Array.from(root.querySelectorAll('button[aria-label], button')).filter(visible);
        const saveBtn = saveButtons.find((btn) => {
          const label = normalize(btn.getAttribute?.('aria-label') || btn.textContent || '');
          return matchesLabel(label, saveMatch);
        }) || null;
        if (saveBtn) {
          saveBtn.click();
        }
      }

      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
      );
      input.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
      );
      return { ok: true };
    })()`,
    returnByValue: true,
  });

  const info = result.result?.value as { ok: boolean; reason?: string } | undefined;
  if (!info?.ok) {
    return { ok: false, reason: info?.reason || 'Rename submit failed' };
  }

  if (options.closeSelector) {
    const closed = await waitForNotSelector(Runtime, options.closeSelector, timeoutMs);
    if (!closed) {
      return { ok: false, reason: 'Rename input did not close' };
    }
  }
  return { ok: true };
}

export async function togglePanel(
  Runtime: ChromeClient['Runtime'],
  options: TogglePanelOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const isOpen = await waitForSelector(Runtime, options.isOpenSelector, 250);
  if (options.open && isOpen) return true;
  if (!options.open && !isOpen) return true;
  const pressed = await pressButton(Runtime, options.trigger);
  if (!pressed.ok) return false;
  if (options.open) {
    return waitForSelector(Runtime, options.isOpenSelector, timeoutMs);
  }
  return waitForNotSelector(Runtime, options.isOpenSelector, timeoutMs);
}
