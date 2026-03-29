import type { ChromeClient } from '../types.js';

export const DEFAULT_DIALOG_SELECTORS = ['[role="dialog"]', 'dialog', '[aria-modal="true"]'] as const;

export type LabelMatchOptions = {
  includeAny?: string[];
  includeAll?: string[];
  startsWith?: string[];
  exact?: string[];
};

export type UiInteractionStrategy =
  | 'click'
  | 'pointer'
  | 'keyboard-enter'
  | 'keyboard-space'
  | 'keyboard-arrowdown';

export type FindAndClickOptions = {
  selectors: string[];
  match: LabelMatchOptions;
  rootSelectors?: readonly string[];
};

export type PressButtonOptions = {
  selector?: string;
  match?: LabelMatchOptions;
  rootSelectors?: readonly string[];
  interactionStrategies?: readonly UiInteractionStrategy[];
  requireVisible?: boolean;
  timeoutMs?: number;
  postSelector?: string;
  postGoneSelector?: string;
  logCandidatesOnMiss?: boolean;
};

export type SetInputValueOptions = {
  selector?: string;
  match?: LabelMatchOptions;
  rootSelectors?: readonly string[];
  value: string;
  requireVisible?: boolean;
  timeoutMs?: number;
};

export type QueryRowMatch = {
  text: string;
  caseSensitive?: boolean;
};

export type EnsureCollapsibleExpandedOptions = {
  rootSelector: string;
  rowSelector: string;
  toggleSelector?: string;
  toggleMatch?: LabelMatchOptions;
  timeoutMs?: number;
};

export type HoverRowActionOptions = {
  rootSelector: string;
  rowSelector: string;
  match: QueryRowMatch;
  actionMatch: LabelMatchOptions;
  timeoutMs?: number;
};

export type RowMatchInfo = {
  ok: boolean;
  reason?: string;
  selector?: string;
  text?: string;
};

export type OpenMenuOptions = {
  trigger: PressButtonOptions;
  menuSelector?: string;
  timeoutMs?: number;
};

export type OpenSurfaceAttempt = {
  name: string;
  trigger: PressButtonOptions;
};

export type OpenSurfaceOptions = {
  attempts: readonly OpenSurfaceAttempt[];
  readyExpression?: string;
  readySelector?: string;
  readyDescription?: string;
  timeoutMs?: number;
  readyTimeoutMs?: number;
  alreadyOpenTimeoutMs?: number;
  pollMs?: number;
};

export type OpenSurfaceResult = {
  ok: boolean;
  attempt?: string;
  reason?: string;
  attempts: Array<{
    name: string;
    triggerOk: boolean;
    triggerReason?: string;
    matchedLabel?: string;
    readyOk?: boolean;
  }>;
};

export type OpenRadixMenuOptions = OpenMenuOptions;

export type SelectMenuItemOptions = {
  menuSelector?: string;
  menuRootSelectors?: readonly string[];
  itemMatch: LabelMatchOptions;
  timeoutMs?: number;
  closeMenuAfter?: boolean;
};

export type WaitForMenuOpenOptions = {
  menuSelector?: string;
  fallbackSelectors?: string[];
  timeoutMs?: number;
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
  menuRootSelectors?: readonly string[];
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

export type PressMenuButtonByAriaLabelOptions = {
  label: string;
  rootSelectors?: readonly string[];
  menuSelector?: string;
  timeoutMs?: number;
};

export type HoverElementOptions = {
  selector: string;
  rootSelectors?: readonly string[];
  timeoutMs?: number;
};

export type HoverElementResult = {
  ok: boolean;
  reason?: string;
  point?: { x: number; y: number };
  rect?: { x: number; y: number; width: number; height: number };
  element?: { tag?: string | null; ariaLabel?: string | null; className?: string | null; id?: string | null };
};

export type HoverAndRevealOptions = {
  rowSelector: string;
  actionMatch?: LabelMatchOptions;
  rootSelectors?: readonly string[];
  timeoutMs?: number;
};

export type HoverAndRevealResult = {
  ok: boolean;
  reason?: string;
  point?: { x: number; y: number };
  row?: { selector: string };
  actions?: { label: string }[];
};

export type PressRowActionOptions = {
  anchorSelector: string;
  actionMatch: LabelMatchOptions;
  rootSelectors?: readonly string[];
  timeoutMs?: number;
};

export type ClickRevealedRowActionOptions = {
  rowSelector: string;
  anchorSelector?: string;
  actionMatch: LabelMatchOptions;
  rootSelectors?: readonly string[];
  timeoutMs?: number;
};

export type OpenRevealedRowMenuOptions = {
  rowSelector: string;
  triggerSelector: string;
  actionMatch: LabelMatchOptions;
  rootSelectors?: readonly string[];
  triggerRootSelectors?: readonly string[];
  menuSelector?: string;
  prepareTriggerBeforeOpen?: boolean;
  directTriggerClickFallback?: boolean;
  timeoutMs?: number;
};

export type PressDialogButtonOptions = {
  match: LabelMatchOptions;
  rootSelectors?: readonly string[];
  timeoutMs?: number;
  preferLast?: boolean;
};

export type SubmitInlineRenameOptions = {
  value: string;
  inputSelector?: string;
  inputMatch?: LabelMatchOptions;
  rootSelectors?: readonly string[];
  saveButtonMatch?: LabelMatchOptions;
  timeoutMs?: number;
  closeSelector?: string;
};

export type WaitForPredicateOptions = {
  timeoutMs?: number;
  pollMs?: number;
  description?: string;
};

export type WaitForPredicateResult = {
  ok: boolean;
  value?: unknown;
  attempts: number;
  elapsedMs: number;
  description?: string;
};

export type WaitForDocumentReadyOptions = WaitForPredicateOptions & {
  states?: Array<'loading' | 'interactive' | 'complete'>;
  requireVisible?: boolean;
};

export type WaitForVisibleSelectorOptions = WaitForPredicateOptions & {
  rootSelectors?: readonly string[];
};

export type WaitForScriptTextOptions = WaitForPredicateOptions & {
  includeAny?: string[];
  includeAll?: string[];
  scriptSelector?: string;
  caseSensitive?: boolean;
};

export type NavigateAndSettleOptions = WaitForPredicateOptions & {
  url: string;
  routeExpression?: string;
  routeDescription?: string;
  readyExpression?: string;
  readyDescription?: string;
  waitForDocumentReady?: boolean;
  documentReadyStates?: Array<'loading' | 'interactive' | 'complete'>;
  requireVisibleDocument?: boolean;
  fallbackToLocationAssign?: boolean;
  fallbackTimeoutMs?: number;
};

export type NavigateAndSettleResult = {
  ok: boolean;
  url: string;
  fallbackUsed: boolean;
  phase: 'complete' | 'route' | 'document-ready' | 'ready';
  reason?: string;
  route?: WaitForPredicateResult;
  documentReady?: WaitForPredicateResult;
  ready?: WaitForPredicateResult;
};

export type CollectUiDiagnosticsOptions = {
  rootSelectors?: readonly string[];
  dialogSelectors?: readonly string[];
  menuSelectors?: readonly string[];
  candidateSelectors?: readonly string[];
  buttonSelectors?: readonly string[];
  limit?: number;
  context?: Record<string, unknown>;
};

export type UiDiagnosticElement = {
  selector: string;
  tag: string | null;
  role: string | null;
  ariaLabel: string | null;
  text: string | null;
};

export type UiDiagnosticMenu = UiDiagnosticElement & {
  items: string[];
};

export type UiDiagnosticCandidate = {
  selector: string;
  count: number;
  samples: string[];
};

export type UiDiagnostics = {
  url: string | null;
  title: string | null;
  readyState: string | null;
  activeElement: {
    tag: string | null;
    role: string | null;
    ariaLabel: string | null;
    text: string | null;
  } | null;
  dialogs: UiDiagnosticElement[];
  menus: UiDiagnosticMenu[];
  buttons: UiDiagnosticElement[];
  candidates: UiDiagnosticCandidate[];
  roots: string[];
  context?: Record<string, unknown>;
};

export type WithUiDiagnosticsOptions = CollectUiDiagnosticsOptions & {
  label?: string;
};

const DEFAULT_WAIT_POLL_MS = 200;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveInteractionStrategies(
  strategies: readonly UiInteractionStrategy[] | undefined,
  fallback: readonly UiInteractionStrategy[],
): UiInteractionStrategy[] {
  const unique = new Set<UiInteractionStrategy>();
  for (const strategy of strategies ?? fallback) {
    unique.add(strategy);
  }
  return Array.from(unique);
}

async function dispatchMatchedTrigger(
  Runtime: ChromeClient['Runtime'],
  options: PressButtonOptions,
  interactionStrategy: UiInteractionStrategy,
): Promise<{ ok: boolean; reason?: string; matchedLabel?: string; listId?: string; rootSelectorUsed?: string | null }> {
  const result = await Runtime.evaluate({
    expression: `(() => {
      const selector = ${JSON.stringify(options.selector ?? null)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const requireVisible = ${JSON.stringify(options.requireVisible ?? true)};
      const includeAny = ${JSON.stringify(options.match?.includeAny ?? [])};
      const includeAll = ${JSON.stringify(options.match?.includeAll ?? [])};
      const startsWith = ${JSON.stringify(options.match?.startsWith ?? [])};
      const exact = ${JSON.stringify(options.match?.exact ?? [])};
      const interactionStrategy = ${JSON.stringify(interactionStrategy)};
      const logCandidatesOnMiss = ${JSON.stringify(options.logCandidatesOnMiss ?? false)};
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => ({ selector: sel, root: document.querySelector(sel) })).filter((entry) => entry.root)
        : [{ selector: 'document', root: document }];
      const matchesLabel = (label) => {
        if (!label) return false;
        if (exact.length && exact.includes(label)) return true;
        if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
        if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
        if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const dispatchInteraction = (match) => {
        if (interactionStrategy === 'pointer') {
          const pointerOpts = { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 1 };
          match.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
          match.dispatchEvent(new MouseEvent('mousedown', pointerOpts));
          match.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
          match.dispatchEvent(new MouseEvent('mouseup', pointerOpts));
          match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return;
        }
        if (interactionStrategy === 'keyboard-enter') {
          match.focus?.();
          const keyOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
          match.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
          match.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
          return;
        }
        if (interactionStrategy === 'keyboard-space') {
          match.focus?.();
          const keyOpts = { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true, cancelable: true };
          match.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
          match.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
          return;
        }
        if (interactionStrategy === 'keyboard-arrowdown') {
          match.focus?.();
          const keyOpts = { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true };
          match.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
          match.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
          return;
        }
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        match.dispatchEvent(clickEvent);
      };

      const candidateLabels = [];
      for (const entry of roots) {
        const root = entry.root;
        if (!root) continue;
        const candidates = selector
          ? Array.from(root.querySelectorAll(selector))
          : Array.from(root.querySelectorAll('button,[role="button"],a,[role="link"],[role="menuitem"]'));
        const visibleCandidates = requireVisible ? candidates.filter(isVisible) : candidates;
        const match = selector
          ? visibleCandidates[0] || null
          : visibleCandidates.find((el) => {
              const label = normalize(el.getAttribute?.('aria-label') || el.textContent || '');
              return matchesLabel(label);
            }) || null;
        if (!match) {
          if (logCandidatesOnMiss) {
            candidateLabels.push(
              ...visibleCandidates
                .map((el) => normalize(el.getAttribute?.('aria-label') || el.textContent || ''))
                .filter(Boolean)
                .slice(0, 12 - candidateLabels.length),
            );
          }
          continue;
        }
        const label = normalize(match.getAttribute?.('aria-label') || match.textContent || '');
        const listId = match.getAttribute?.('aria-controls') || '';
        dispatchInteraction(match);
        return {
          ok: true,
          matchedLabel: label,
          listId,
          rootSelectorUsed: entry.selector,
        };
      }

      if (logCandidatesOnMiss && candidateLabels.length > 0) {
        return { ok: false, reason: 'Button not found (candidates: ' + candidateLabels.join(', ') + ')' };
      }
      return { ok: false, reason: 'Button not found' };
    })()`,
    returnByValue: true,
  });
  const info = result.result?.value as
    | { ok?: boolean; reason?: string; matchedLabel?: string; listId?: string; rootSelectorUsed?: string | null }
    | undefined;
  if (!info?.ok) {
    return { ok: false, reason: info?.reason || 'Button click failed' };
  }
  return {
    ok: true,
    matchedLabel: info.matchedLabel,
    listId: info.listId,
    rootSelectorUsed: info.rootSelectorUsed ?? null,
  };
}

export async function waitForPredicate(
  Runtime: ChromeClient['Runtime'],
  expression: string,
  options: WaitForPredicateOptions = {},
): Promise<WaitForPredicateResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollMs = options.pollMs ?? DEFAULT_WAIT_POLL_MS;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastValue: unknown;
  while (Date.now() < deadline) {
    attempts += 1;
    const { result } = await Runtime.evaluate({
      expression,
      returnByValue: true,
    });
    lastValue = result?.value;
    if (result?.value) {
      return {
        ok: true,
        value: result.value,
        attempts,
        elapsedMs: Date.now() - startedAt,
        description: options.description,
      };
    }
    await sleep(pollMs);
  }
  return {
    ok: false,
    value: lastValue,
    attempts,
    elapsedMs: Date.now() - startedAt,
    description: options.description,
  };
}

export async function waitForDocumentReady(
  Runtime: ChromeClient['Runtime'],
  options: WaitForDocumentReadyOptions = {},
): Promise<WaitForPredicateResult> {
  const states = options.states?.length ? options.states : ['interactive', 'complete'];
  const requireVisible = options.requireVisible ?? false;
  return waitForPredicate(
    Runtime,
    `(() => {
      const allowedStates = ${JSON.stringify(states)};
      const readyState = document.readyState;
      const visibilityState = document.visibilityState ?? null;
      const ok =
        allowedStates.includes(readyState) &&
        (${JSON.stringify(requireVisible)} ? visibilityState === 'visible' : true);
      if (!ok) {
        return null;
      }
      return { readyState, visibilityState };
    })()`,
    {
      ...options,
      description:
        options.description ??
        `document.readyState in [${states.join(', ')}]${requireVisible ? ' and visible' : ''}`,
    },
  );
}

export async function waitForVisibleSelector(
  Runtime: ChromeClient['Runtime'],
  selector: string,
  options: WaitForVisibleSelectorOptions = {},
): Promise<WaitForPredicateResult> {
  const rootSelectors = options.rootSelectors ?? [];
  return waitForPredicate(
    Runtime,
    `(() => {
      const selector = ${JSON.stringify(selector)};
      const rootSelectors = ${JSON.stringify(rootSelectors)};
      const roots = rootSelectors.length
        ? rootSelectors.map((root) => document.querySelector(root)).filter(Boolean)
        : [document];
      for (const root of roots) {
        const node = root?.querySelector?.(selector);
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) continue;
        return {
          tagName: node.tagName?.toLowerCase?.() ?? null,
          text: (node.textContent || '').trim().slice(0, 120) || null,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }
      return null;
    })()`,
    {
      ...options,
      description: options.description ?? `visible selector ${selector}`,
    },
  );
}

export async function waitForScriptText(
  Runtime: ChromeClient['Runtime'],
  options: WaitForScriptTextOptions,
): Promise<WaitForPredicateResult> {
  const includeAny = options.includeAny ?? [];
  const includeAll = options.includeAll ?? [];
  const caseSensitive = options.caseSensitive ?? false;
  const scriptSelector = options.scriptSelector ?? 'script';
  return waitForPredicate(
    Runtime,
    `(() => {
      const includeAny = ${JSON.stringify(includeAny)};
      const includeAll = ${JSON.stringify(includeAll)};
      const caseSensitive = ${JSON.stringify(caseSensitive)};
      const normalize = (value) => {
        const text = String(value || '');
        return caseSensitive ? text : text.toLowerCase();
      };
      const texts = Array.from(document.querySelectorAll(${JSON.stringify(scriptSelector)}))
        .map((node) => normalize(node.textContent || ''))
        .filter(Boolean);
      const anyTokens = includeAny.map(normalize);
      const allTokens = includeAll.map(normalize);
      const match = texts.find((text) => {
        if (allTokens.length && !allTokens.every((token) => text.includes(token))) {
          return false;
        }
        if (anyTokens.length && !anyTokens.some((token) => text.includes(token))) {
          return false;
        }
        return allTokens.length > 0 || anyTokens.length > 0;
      });
      if (!match) {
        return null;
      }
      return {
        matchedLength: match.length,
        preview: match.slice(0, 160),
      };
    })()`,
    {
      ...options,
      description:
        options.description ??
        `script text contains ${[...includeAll, ...includeAny].map((token) => JSON.stringify(token)).join(', ')}`,
    },
  );
}

export async function navigateAndSettle(
  client: Pick<ChromeClient, 'Page' | 'Runtime'>,
  options: NavigateAndSettleOptions,
): Promise<NavigateAndSettleResult> {
  const evaluateState = async (
    timeoutMs: number | undefined,
    fallbackUsed: boolean,
  ): Promise<NavigateAndSettleResult> => {
    let route: WaitForPredicateResult | undefined;
    if (options.routeExpression) {
      route = await waitForPredicate(client.Runtime, options.routeExpression, {
        timeoutMs,
        pollMs: options.pollMs,
        description: options.routeDescription ?? `route settled for ${options.url}`,
      });
      if (!route.ok) {
        return {
          ok: false,
          url: options.url,
          fallbackUsed,
          phase: 'route',
          route,
          reason: `${route.description ?? 'route'} did not settle`,
        };
      }
    }

    let documentReady: WaitForPredicateResult | undefined;
    if (options.waitForDocumentReady !== false) {
      documentReady = await waitForDocumentReady(client.Runtime, {
        timeoutMs,
        pollMs: options.pollMs,
        states: options.documentReadyStates,
        requireVisible: options.requireVisibleDocument,
        description: `document ready for ${options.url}`,
      });
      if (!documentReady.ok) {
        return {
          ok: false,
          url: options.url,
          fallbackUsed,
          phase: 'document-ready',
          route,
          documentReady,
          reason: `${documentReady.description ?? 'document ready'} did not settle`,
        };
      }
    }

    let ready: WaitForPredicateResult | undefined;
    if (options.readyExpression) {
      ready = await waitForPredicate(client.Runtime, options.readyExpression, {
        timeoutMs,
        pollMs: options.pollMs,
        description: options.readyDescription ?? `ready state for ${options.url}`,
      });
      if (!ready.ok) {
        return {
          ok: false,
          url: options.url,
          fallbackUsed,
          phase: 'ready',
          route,
          documentReady,
          ready,
          reason: `${ready.description ?? 'ready state'} did not settle`,
        };
      }
    }

    return {
      ok: true,
      url: options.url,
      fallbackUsed,
      phase: 'complete',
      route,
      documentReady,
      ready,
    };
  };

  await client.Page.navigate({ url: options.url });
  const primary = await evaluateState(options.timeoutMs, false);
  if (primary.ok || !options.fallbackToLocationAssign) {
    return primary;
  }

  await client.Runtime.evaluate({
    expression: `(() => {
      const target = ${JSON.stringify(options.url)};
      if (location.href !== target) {
        location.assign(target);
        return 'assigned';
      }
      return 'already-there';
    })()`,
    awaitPromise: false,
  }).catch(() => undefined);

  return evaluateState(options.fallbackTimeoutMs ?? options.timeoutMs, true);
}

export async function collectUiDiagnostics(
  Runtime: ChromeClient['Runtime'],
  options: CollectUiDiagnosticsOptions = {},
): Promise<UiDiagnostics> {
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20));
  const result = await Runtime.evaluate({
    expression: `(() => {
      const limit = ${JSON.stringify(limit)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const summarize = (el, selector) => ({
        selector,
        tag: el?.tagName?.toLowerCase?.() ?? null,
        role: el?.getAttribute?.('role') ?? null,
        ariaLabel: normalize(el?.getAttribute?.('aria-label') || '') || null,
        text: normalize(el?.textContent || '').slice(0, 160) || null,
      });
      const uniqueVisible = (selectors) => {
        const entries = [];
        const seen = new Set();
        for (const selector of selectors) {
          for (const el of Array.from(document.querySelectorAll(selector))) {
            if (!isVisible(el) || seen.has(el)) continue;
            seen.add(el);
            entries.push({ el, selector });
            if (entries.length >= limit) {
              return entries;
            }
          }
        }
        return entries;
      };
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const dialogSelectors = ${JSON.stringify(options.dialogSelectors ?? Array.from(DEFAULT_DIALOG_SELECTORS))};
      const menuSelectors = ${JSON.stringify(options.menuSelectors ?? ['[role="menu"]', '[role="listbox"]', '[data-radix-menu-content][data-state="open"]'])};
      const candidateSelectors = ${JSON.stringify(options.candidateSelectors ?? [])};
      const buttonSelectors = ${JSON.stringify(options.buttonSelectors ?? ['button', '[role="button"]', '[role="menuitem"]', 'a[role="button"]'])};
      const roots = rootSelectors.length
        ? rootSelectors
            .map((selector) => ({ selector, node: document.querySelector(selector) }))
            .filter((entry) => entry.node && isVisible(entry.node))
            .slice(0, limit)
            .map((entry) => entry.selector)
        : [];

      const dialogs = uniqueVisible(dialogSelectors).map(({ el, selector }) => summarize(el, selector));
      const menuEntries = uniqueVisible(menuSelectors).map(({ el, selector }) => {
        const items = Array.from(el.querySelectorAll('[role="menuitem"], [role="option"], button, a'))
          .filter((node) => isVisible(node))
          .map((node) => normalize(node.textContent || node.getAttribute?.('aria-label') || ''))
          .filter(Boolean)
          .slice(0, limit);
        return {
          ...summarize(el, selector),
          items,
        };
      });

      const buttonRoots = rootSelectors.length
        ? rootSelectors.map((selector) => document.querySelector(selector)).filter((node) => node instanceof Element || node instanceof Document)
        : [document];
      const buttonResults = [];
      const seenButtons = new Set();
      for (const root of buttonRoots) {
        if (!(root instanceof Element || root instanceof Document)) continue;
        for (const selector of buttonSelectors) {
          for (const el of Array.from(root.querySelectorAll(selector))) {
            if (!isVisible(el) || seenButtons.has(el)) continue;
            seenButtons.add(el);
            buttonResults.push(summarize(el, selector));
            if (buttonResults.length >= limit) {
              break;
            }
          }
          if (buttonResults.length >= limit) {
            break;
          }
        }
        if (buttonResults.length >= limit) {
          break;
        }
      }

      const candidates = candidateSelectors.slice(0, limit).map((selector) => {
        const nodes = Array.from(document.querySelectorAll(selector)).filter((el) => isVisible(el));
        return {
          selector,
          count: nodes.length,
          samples: nodes
            .map((el) => normalize(el.textContent || el.getAttribute?.('aria-label') || ''))
            .filter(Boolean)
            .slice(0, Math.min(limit, 5)),
        };
      });

      const activeElement = document.activeElement instanceof Element
        ? {
            tag: document.activeElement.tagName?.toLowerCase?.() ?? null,
            role: document.activeElement.getAttribute?.('role') ?? null,
            ariaLabel: normalize(document.activeElement.getAttribute?.('aria-label') || '') || null,
            text: normalize(document.activeElement.textContent || '').slice(0, 160) || null,
          }
        : null;

      return {
        url: location.href || null,
        title: document.title || null,
        readyState: document.readyState || null,
        activeElement,
        dialogs,
        menus: menuEntries,
        buttons: buttonResults,
        candidates,
        roots,
        context: ${JSON.stringify(options.context ?? null)},
      };
    })()`,
    returnByValue: true,
  });
  const value = result.result?.value as UiDiagnostics | undefined;
  return (
    value ?? {
      url: null,
      title: null,
      readyState: null,
      activeElement: null,
      dialogs: [],
      menus: [],
      buttons: [],
      candidates: [],
      roots: [],
      context: options.context,
    }
  );
}

export async function withUiDiagnostics<T>(
  Runtime: ChromeClient['Runtime'],
  action: () => Promise<T>,
  options: WithUiDiagnosticsOptions = {},
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const diagnostics = await collectUiDiagnostics(Runtime, options).catch((diagError) => ({
      url: null,
      title: null,
      readyState: null,
      activeElement: null,
      dialogs: [],
      menus: [],
      buttons: [],
      candidates: [],
      roots: [],
      context: options.context,
      collectionError: String(diagError),
    }));
    const labelPrefix = options.label ? `${options.label}: ` : '';
    const serialized = JSON.stringify(diagnostics);
    if (error instanceof Error) {
      const enriched = error as Error & { uiDiagnostics?: unknown };
      enriched.uiDiagnostics = diagnostics;
      if (!enriched.message.includes('UI diagnostics:')) {
        enriched.message = `${labelPrefix}${enriched.message}\nUI diagnostics: ${serialized}`;
      } else if (labelPrefix && !enriched.message.startsWith(labelPrefix)) {
        enriched.message = `${labelPrefix}${enriched.message}`;
      }
      throw enriched;
    }
    const enriched = new Error(`${labelPrefix}${String(error)}\nUI diagnostics: ${serialized}`) as Error & {
      cause?: unknown;
      uiDiagnostics?: unknown;
    };
    enriched.cause = error;
    enriched.uiDiagnostics = diagnostics;
    throw enriched;
  }
}

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
  const ready = await waitForPredicate(
    Runtime,
    `(() => {
      const selectors = ${JSON.stringify(dialogSelectors)};
      return selectors.some((selector) => Boolean(document.querySelector(selector)));
    })()`,
    { timeoutMs, description: 'dialog open' },
  );
  return ready.ok;
}

export async function waitForSelector(
  Runtime: ChromeClient['Runtime'],
  selector: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const ready = await waitForPredicate(
    Runtime,
    `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    { timeoutMs, description: `selector ${selector}` },
  );
  return ready.ok;
}

export async function waitForNotSelector(
  Runtime: ChromeClient['Runtime'],
  selector: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const gone = await waitForPredicate(
    Runtime,
    `!Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    { timeoutMs, description: `selector gone ${selector}` },
  );
  return gone.ok;
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

export async function hoverAndReveal(
  Runtime: ChromeClient['Runtime'],
  Input: ChromeClient['Input'],
  options: HoverAndRevealOptions,
): Promise<HoverAndRevealResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const hoverResult = await hoverElement(Runtime, Input, {
    selector: options.rowSelector,
    rootSelectors: options.rootSelectors,
    timeoutMs,
  });
  if (!hoverResult.ok) {
    return { ok: false, reason: hoverResult.reason };
  }

  const evalResult = await Runtime.evaluate({
    expression: `(() => {
      const selector = ${JSON.stringify(options.rowSelector)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const matchOptions = ${JSON.stringify(options.actionMatch ?? {})};
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
        : [document];
      const root = roots[0] || document;
      const row = root.querySelector(selector);
      if (!row) return { ok: false, reason: 'Row not found' };
      const actions = Array.from(row.querySelectorAll('button,[role="button"],a'))
        .map((el) => ({ label: normalize(el.getAttribute?.('aria-label') || el.textContent || '') }))
        .filter((entry) => entry.label);
      const matches = (label) => {
        if (!label) return false;
        const exact = (matchOptions.exact || []).map(normalize);
        const startsWith = (matchOptions.startsWith || []).map(normalize);
        const includeAll = (matchOptions.includeAll || []).map(normalize);
        const includeAny = (matchOptions.includeAny || []).map(normalize);
        if (exact.length && exact.includes(label)) return true;
        if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
        if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
        if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      if (
        matchOptions.exact ||
        matchOptions.startsWith ||
        matchOptions.includeAll ||
        matchOptions.includeAny
      ) {
        const match = actions.find((entry) => matches(entry.label));
        if (!match) {
          return { ok: false, reason: 'Action not revealed', actions };
        }
      }
      return { ok: true, actions };
    })()`,
    returnByValue: true,
  });
  const info = evalResult.result?.value as
    | { ok: true; actions?: { label: string }[] }
    | { ok: false; reason?: string; actions?: { label: string }[] }
    | undefined;
  if (!info?.ok) {
    return { ok: false, reason: info?.reason, actions: info?.actions };
  }
  return {
    ok: true,
    point: hoverResult.point,
    row: { selector: options.rowSelector },
    actions: info?.actions,
  };
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

export async function clickRevealedRowAction(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
  options: ClickRevealedRowActionOptions,
): Promise<{ ok: boolean; reason?: string; matchedLabel?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const revealed = await hoverAndReveal(client.Runtime, client.Input, {
    rowSelector: options.rowSelector,
    rootSelectors: options.rootSelectors,
    actionMatch: options.actionMatch,
    timeoutMs,
  });
  if (!revealed.ok) {
    return { ok: false, reason: revealed.reason || 'Row action did not appear' };
  }
  return pressRowAction(client.Runtime, {
    anchorSelector: options.anchorSelector ?? options.rowSelector,
    rootSelectors: options.rootSelectors,
    actionMatch: options.actionMatch,
    timeoutMs,
  });
}

export async function openRevealedRowMenu(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
  options: OpenRevealedRowMenuOptions,
): Promise<{ ok: boolean; reason?: string; menuSelector?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const revealed = await hoverAndReveal(client.Runtime, client.Input, {
    rowSelector: options.rowSelector,
    rootSelectors: options.rootSelectors,
    actionMatch: options.actionMatch,
    timeoutMs,
  });
  if (!revealed.ok) {
    return { ok: false, reason: revealed.reason || 'Row menu trigger did not appear' };
  }

  const prepareTrigger = async (): Promise<{ ok: boolean; reason?: string }> => {
    if (!options.prepareTriggerBeforeOpen) {
      return { ok: true };
    }
    const prepared = await client.Runtime.evaluate({
      expression: `(() => {
        const row = document.querySelector(${JSON.stringify(options.rowSelector)});
        const trigger = document.querySelector(${JSON.stringify(options.triggerSelector)});
        if (!(row instanceof HTMLElement)) {
          return { ok: false, reason: 'Row not found' };
        }
        if (!(trigger instanceof HTMLElement)) {
          return { ok: false, reason: 'Trigger not found' };
        }
        const link =
          trigger.closest('a[href], [role="link"]') ||
          row.querySelector('a[href], [role="link"]');
        const stopNav = (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
        };
        if (link instanceof HTMLElement) {
          for (const type of ['click', 'auxclick']) {
            link.addEventListener(type, stopNav, { once: true });
          }
        }
        trigger.style.opacity = '1';
        trigger.style.pointerEvents = 'auto';
        trigger.style.visibility = 'visible';
        trigger.style.display = trigger.style.display || 'inline-flex';
        for (const eventName of ['mouseenter', 'mouseover', 'mousemove']) {
          row.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true }));
          trigger.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true }));
        }
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    const info = prepared.result?.value as { ok?: boolean; reason?: string } | undefined;
    return info?.ok ? { ok: true } : { ok: false, reason: info?.reason || 'Trigger prep failed' };
  };

  const prep = await prepareTrigger();
  if (!prep.ok) {
    return { ok: false, reason: prep.reason };
  }

  const opened = await openMenu(client.Runtime, {
    trigger: {
      selector: options.triggerSelector,
      rootSelectors: options.triggerRootSelectors ?? [options.rowSelector],
      requireVisible: true,
    },
    menuSelector: options.menuSelector,
    timeoutMs,
  });
  if (!opened.ok && options.directTriggerClickFallback) {
    const fallbackClick = await client.Runtime.evaluate({
      expression: `(() => {
        const trigger = document.querySelector(${JSON.stringify(options.triggerSelector)});
        if (!(trigger instanceof HTMLElement)) {
          return { ok: false, reason: 'Trigger not found' };
        }
        trigger.click();
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    const fallbackInfo = fallbackClick.result?.value as { ok?: boolean; reason?: string } | undefined;
    if (!fallbackInfo?.ok) {
      return { ok: false, reason: fallbackInfo?.reason || 'Row menu did not open' };
    }
    const ready = await waitForMenuOpen(client.Runtime, {
      menuSelector: options.menuSelector,
      fallbackSelectors: options.menuSelector
        ? [options.menuSelector, '[role="menu"], [role="listbox"], [data-radix-collection-item]']
        : ['[role="menu"], [role="listbox"], [data-radix-collection-item]'],
      timeoutMs,
    });
    if (!ready.ok) {
      return { ok: false, reason: 'Row menu did not open' };
    }
    return { ok: true, menuSelector: ready.menuSelector || options.menuSelector };
  }
  if (!opened.ok) {
    return { ok: false, reason: 'Row menu did not open' };
  }
  return { ok: true, menuSelector: opened.menuSelector || options.menuSelector };
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
      ? rootSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      : [document];
    const seen = new Set();
    const nodes = [];
    for (const root of roots) {
      if (!(root instanceof Element || root instanceof Document)) continue;
      for (const node of Array.from(root.querySelectorAll(selectors.join(',')))) {
        if (seen.has(node)) continue;
        seen.add(node);
        nodes.push(node);
      }
    }

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
    const ready = options.requireVisible ?? true
      ? await waitForVisibleSelector(Runtime, options.selector, {
          timeoutMs,
          rootSelectors: options.rootSelectors,
        })
      : await waitForPredicate(
          Runtime,
          `Boolean(document.querySelector(${JSON.stringify(options.selector)}))`,
          { timeoutMs, description: `selector ${options.selector}` },
        );
    if (!ready.ok) {
      return {
        ok: false,
        reason: `${options.requireVisible ?? true ? 'Visible selector' : 'Selector'} not found: ${options.selector}`,
      };
    }
  }
  const interactionStrategies = resolveInteractionStrategies(options.interactionStrategies, ['click']);
  const perAttemptTimeoutMs = Math.max(250, Math.floor(timeoutMs / Math.max(interactionStrategies.length, 1)));
  let lastReason = 'Button click failed';
  let matchedLabel: string | undefined;

  for (const interactionStrategy of interactionStrategies) {
    const info = await dispatchMatchedTrigger(Runtime, options, interactionStrategy);
    if (!info.ok) {
      lastReason = info.reason || lastReason;
      continue;
    }
    matchedLabel = info.matchedLabel;
    if (options.postSelector) {
      const ok = await waitForSelector(Runtime, options.postSelector, perAttemptTimeoutMs);
      if (!ok) {
        lastReason = 'Post selector not found: ' + options.postSelector;
        continue;
      }
    }
    if (options.postGoneSelector) {
      const ok = await waitForNotSelector(Runtime, options.postGoneSelector, perAttemptTimeoutMs);
      if (!ok) {
        lastReason = 'Post-gone selector still present: ' + options.postGoneSelector;
        continue;
      }
    }
    return { ok: true, matchedLabel };
  }

  return { ok: false, reason: lastReason };
}

export async function openSurface(
  Runtime: ChromeClient['Runtime'],
  options: OpenSurfaceOptions,
): Promise<OpenSurfaceResult> {
  if (!options.readyExpression && !options.readySelector) {
    throw new Error('openSurface requires readyExpression or readySelector');
  }
  const attempts: OpenSurfaceResult['attempts'] = [];
  const waitForReady = async (timeoutMs: number): Promise<boolean> => {
    if (options.readySelector) {
      return waitForSelector(Runtime, options.readySelector, timeoutMs);
    }
    const ready = await waitForPredicate(Runtime, options.readyExpression!, {
      timeoutMs,
      pollMs: options.pollMs,
      description: options.readyDescription,
    });
    return ready.ok;
  };

  const alreadyOpen = await waitForReady(options.alreadyOpenTimeoutMs ?? 500);
  if (alreadyOpen) {
    return { ok: true, attempt: 'already-open', attempts };
  }

  for (const attempt of options.attempts) {
    const pressed = await pressButton(Runtime, {
      ...attempt.trigger,
      timeoutMs: attempt.trigger.timeoutMs ?? options.timeoutMs,
    });
    const record: OpenSurfaceResult['attempts'][number] = {
      name: attempt.name,
      triggerOk: pressed.ok,
      triggerReason: pressed.reason,
      matchedLabel: pressed.matchedLabel,
    };
    if (!pressed.ok) {
      attempts.push(record);
      continue;
    }
    const ready = await waitForReady(options.readyTimeoutMs ?? options.timeoutMs ?? 5000);
    record.readyOk = ready;
    attempts.push(record);
    if (ready) {
      return { ok: true, attempt: attempt.name, attempts };
    }
  }

  const last = attempts.at(-1);
  return {
    ok: false,
    reason: last?.triggerReason || `Surface did not become ready${options.readyDescription ? `: ${options.readyDescription}` : ''}`,
    attempts,
  };
}

export async function queryRowsByText(
  Runtime: ChromeClient['Runtime'],
  options: { rootSelector: string; rowSelector: string; match: QueryRowMatch },
): Promise<RowMatchInfo> {
  const result = await Runtime.evaluate({
    expression: `(() => {
      const root = document.querySelector(${JSON.stringify(options.rootSelector)});
      if (!root) return { ok: false, reason: 'Root not found' };
      const rows = Array.from(root.querySelectorAll(${JSON.stringify(options.rowSelector)}));
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const target = ${JSON.stringify(options.match.text)};
      const needle = ${JSON.stringify(options.match.caseSensitive ? null : options.match.text.toLowerCase())};
      const matchRow = rows.find((row) => {
        const text = normalize(row.textContent || '');
        if (!text) return false;
        if (${JSON.stringify(Boolean(options.match.caseSensitive))}) {
          return text.includes(target);
        }
        return text.toLowerCase().includes(needle);
      });
      if (!matchRow) return { ok: false, reason: 'Row not found' };
      const selector = matchRow.getAttribute('data-oracle-row-selector') || '';
      return { ok: true, text: normalize(matchRow.textContent || ''), selector };
    })()`,
    returnByValue: true,
  });
  const info = result.result?.value as RowMatchInfo | undefined;
  return info ?? { ok: false, reason: 'Row not found' };
}

export async function ensureCollapsibleExpanded(
  Runtime: ChromeClient['Runtime'],
  options: EnsureCollapsibleExpandedOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const result = await Runtime.evaluate({
    expression: `(() => {
      const root = document.querySelector(${JSON.stringify(options.rootSelector)});
      if (!root) return { ok: false, reason: 'Root not found' };
      const rows = root.querySelectorAll(${JSON.stringify(options.rowSelector)});
      return { ok: rows.length > 0 };
    })()`,
    returnByValue: true,
  });
  if (result.result?.value?.ok) {
    return;
  }
  const pressed = await pressButton(Runtime, {
    selector: options.toggleSelector,
    match: options.toggleMatch,
    rootSelectors: options.toggleSelector ? undefined : [options.rootSelector],
    requireVisible: true,
    timeoutMs,
  });
  if (!pressed.ok) {
    throw new Error(pressed.reason || 'Collapsible toggle not found');
  }
  const ready = await waitForSelector(Runtime, options.rowSelector, timeoutMs);
  if (!ready) {
    throw new Error('Collapsible rows did not appear');
  }
}

export async function hoverRowAndClickAction(
  Runtime: ChromeClient['Runtime'],
  Input: ChromeClient['Input'],
  options: HoverRowActionOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const rectResult = await Runtime.evaluate({
    expression: `(() => {
      const root = document.querySelector(${JSON.stringify(options.rootSelector)});
      if (!root) return { ok: false, reason: 'Root not found' };
      const rows = Array.from(root.querySelectorAll(${JSON.stringify(options.rowSelector)}));
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const target = ${JSON.stringify(options.match.text)};
      const needle = ${JSON.stringify(options.match.caseSensitive ? null : options.match.text.toLowerCase())};
      const row = rows.find((el) => {
        const text = normalize(el.textContent || '');
        if (!text) return false;
        if (${JSON.stringify(Boolean(options.match.caseSensitive))}) {
          return text.includes(target);
        }
        return text.toLowerCase().includes(needle);
      });
      if (!row) return { ok: false, reason: 'Row not found' };
      row.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = row.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return { ok: false, reason: 'Row not visible' };
      }
      return {
        ok: true,
        center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      };
    })()`,
    returnByValue: true,
  });
  const rectInfo = rectResult.result?.value as
    | { ok: true; center: { x: number; y: number } }
    | { ok: false; reason?: string }
    | undefined;
  if (!rectInfo?.ok) {
    throw new Error(rectInfo?.reason || 'Row not found');
  }
  const x = Math.round(rectInfo.center.x);
  const y = Math.round(rectInfo.center.y);
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x: x + 1, y: y + 1 });

  const clicked = await pressButton(Runtime, {
    match: options.actionMatch,
    rootSelectors: [options.rootSelector],
    requireVisible: true,
    timeoutMs,
  });
  if (!clicked.ok) {
    throw new Error(clicked.reason || 'Row action not found');
  }
}

export async function openRadixMenu(
  Runtime: ChromeClient['Runtime'],
  options: OpenRadixMenuOptions,
): Promise<{ ok: boolean; menuSelector?: string }> {
  return openMenu(Runtime, options);
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
): Promise<{
  ok: boolean;
  menuSelector?: string;
  interactionStrategy?: UiInteractionStrategy;
  rootSelectorUsed?: string | null;
  reason?: string;
  attemptedStrategies?: UiInteractionStrategy[];
}> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const interactionStrategies = resolveInteractionStrategies(options.trigger.interactionStrategies, ['pointer']);
  const perAttemptTimeoutMs = Math.max(250, Math.floor(timeoutMs / Math.max(interactionStrategies.length, 1)));
  let lastReason = 'Menu trigger not found';
  let lastRootSelectorUsed: string | null = null;

  for (const interactionStrategy of interactionStrategies) {
    const info = await dispatchMatchedTrigger(Runtime, options.trigger, interactionStrategy);
    if (!info.ok) {
      lastReason = info.reason || lastReason;
      continue;
    }
    lastRootSelectorUsed = info.rootSelectorUsed ?? null;
    const menuSelector = info.listId ? `#${info.listId}` : options.menuSelector;
    const ready = await waitForMenuOpen(Runtime, {
      menuSelector,
      fallbackSelectors: options.menuSelector
        ? [options.menuSelector, '[role="menu"], [role="listbox"], [data-radix-collection-item]']
        : ['[role="menu"], [role="listbox"], [data-radix-collection-item]'],
      timeoutMs: perAttemptTimeoutMs,
    });
    if (ready.ok) {
      return {
        ok: true,
        menuSelector: ready.menuSelector,
        interactionStrategy,
        rootSelectorUsed: lastRootSelectorUsed,
        attemptedStrategies: interactionStrategies,
      };
    }
    lastReason = `Menu did not open after ${interactionStrategy}`;
  }
  return {
    ok: false,
    reason: lastReason,
    rootSelectorUsed: lastRootSelectorUsed,
    attemptedStrategies: interactionStrategies,
  };
}

export async function waitForMenuOpen(
  Runtime: ChromeClient['Runtime'],
  options: WaitForMenuOpenOptions,
): Promise<{ ok: boolean; menuSelector?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const fallbackSelectors = options.fallbackSelectors ?? [
    '[role="menu"], [role="listbox"], [data-radix-collection-item]',
  ];
  const primarySelector = options.menuSelector ?? fallbackSelectors[0];
  const primaryReady = await waitForSelector(Runtime, primarySelector, timeoutMs);
  if (primaryReady) {
    return { ok: true, menuSelector: primarySelector };
  }
  for (const selector of fallbackSelectors) {
    if (selector === primarySelector) continue;
    const ready = await waitForSelector(Runtime, selector, timeoutMs);
    if (ready) {
      return { ok: true, menuSelector: selector };
    }
  }
  return { ok: false };
}

export async function pressMenuButtonByAriaLabel(
  Runtime: ChromeClient['Runtime'],
  options: PressMenuButtonByAriaLabelOptions,
): Promise<{ ok: boolean; menuSelector?: string }> {
  return openMenu(Runtime, {
    trigger: {
      match: { exact: [options.label.toLowerCase()] },
      rootSelectors: options.rootSelectors,
    },
    menuSelector: options.menuSelector,
    timeoutMs: options.timeoutMs,
  });
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
    menuRootSelectors: options.menuRootSelectors,
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
    rootSelectors: options.menuRootSelectors ?? (options.menuSelector ? [options.menuSelector] : undefined),
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
        const hasMatch =
          match.includeAny.length || match.includeAll.length || match.startsWith.length || match.exact.length;
        const candidates = Array.from(root.querySelectorAll('input, textarea, [contenteditable=\"true\"]')).filter(visible);
        const active = document.activeElement;
        const activeValid =
          active &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true') &&
          visible(active);
        if (activeValid) {
          input = active;
        } else if (hasMatch) {
          input = candidates.find((el) => {
            const label = normalize(el.getAttribute?.('aria-label') || el.getAttribute?.('placeholder') || el.textContent || '');
            return matchesLabel(label, match);
          }) || null;
        } else {
          input = candidates[0] || null;
        }
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
