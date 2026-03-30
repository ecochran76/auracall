import type { ChromeClient, BrowserLogger, BrowserModelStrategy } from '../types.js';
import {
  MENU_CONTAINER_SELECTOR,
  MENU_ITEM_SELECTOR,
  MODEL_BUTTON_SELECTORS,
} from '../constants.js';
import { logDomFailure } from '../domDebug.js';
import { buildClickDispatcher } from './domEvents.js';

export async function ensureModelSelection(
  Runtime: ChromeClient['Runtime'],
  desiredModel: string,
  logger: BrowserLogger,
  strategy: BrowserModelStrategy = 'select',
) {
  const outcome = await Runtime.evaluate({
    expression: buildModelSelectionExpression(desiredModel, strategy),
    awaitPromise: true,
    returnByValue: true,
  });

  const result = outcome.result?.value as
    | { status: 'already-selected'; label?: string | null }
    | { status: 'switched'; label?: string | null }
    | { status: 'switched-best-effort'; label?: string | null }
    | { status: 'option-not-found'; hint?: { temporaryChat?: boolean; availableOptions?: string[] } }
    | { status: 'button-missing' }
    | undefined;

  switch (result?.status) {
    case 'already-selected':
    case 'switched':
    case 'switched-best-effort': {
      const label = result.label ?? desiredModel;
      logger(`Model picker: ${label}`);
      return;
    }
    case 'option-not-found': {
      await logDomFailure(Runtime, logger, 'model-switcher-option');
      const isTemporary = result.hint?.temporaryChat ?? false;
      const available = (result.hint?.availableOptions ?? []).filter(Boolean);
      const availableHint = available.length > 0 ? ` Available: ${available.join(', ')}.` : '';
      const tempHint =
        isTemporary && /\bpro\b/i.test(desiredModel)
          ? ' You are in Temporary Chat mode; Pro models are not available there. Remove "temporary-chat=true" from --chatgpt-url or use a non-Pro model (e.g. gpt-5.2-instant).'
          : '';
      throw new Error(`Unable to find model option matching "${desiredModel}" in the model switcher.${availableHint}${tempHint}`);
    }
    default: {
      await logDomFailure(Runtime, logger, 'model-switcher-button');
      throw new Error('Unable to locate the ChatGPT model selector button.');
    }
  }
}

/**
 * Builds the DOM expression that runs inside the ChatGPT tab to select a model.
 * The string is evaluated inside Chrome, so keep it self-contained and well-commented.
 */
function buildModelSelectionExpression(targetModel: string, strategy: BrowserModelStrategy): string {
  const matchers = buildModelMatchersLiteral(targetModel);
  const labelLiteral = JSON.stringify(matchers.labelTokens);
  const idLiteral = JSON.stringify(matchers.testIdTokens);
  const semanticTargetLiteral = JSON.stringify(matchers.semanticTarget);
  const primaryLabelLiteral = JSON.stringify(targetModel);
  const strategyLiteral = JSON.stringify(strategy);
  const menuContainerLiteral = JSON.stringify(MENU_CONTAINER_SELECTOR);
  const menuItemLiteral = JSON.stringify(MENU_ITEM_SELECTOR);
  const buttonSelectorsLiteral = JSON.stringify(MODEL_BUTTON_SELECTORS);
  return `(() => {
    ${buildClickDispatcher()}
    // Capture the selectors and matcher literals up front so the browser expression stays pure.
    const BUTTON_SELECTORS = ${buttonSelectorsLiteral};
    const LABEL_TOKENS = ${labelLiteral};
    const TEST_IDS = ${idLiteral};
    const SEMANTIC_TARGET = ${semanticTargetLiteral};
    const PRIMARY_LABEL = ${primaryLabelLiteral};
    const MODEL_STRATEGY = ${strategyLiteral};
    const INITIAL_WAIT_MS = 150;
    const REOPEN_INTERVAL_MS = 400;
    const MAX_WAIT_MS = 20000;
    const normalizeText = (value) => {
      if (!value) {
        return '';
      }
      return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
    };
    // Normalize every candidate token to keep fuzzy matching deterministic.
    const normalizedTarget = normalizeText(PRIMARY_LABEL);
    const normalizedTokens = Array.from(new Set([normalizedTarget, ...LABEL_TOKENS]))
      .map((token) => normalizeText(token))
      .filter(Boolean);
    const targetWords = normalizedTarget.split(' ').filter(Boolean);

    const button = BUTTON_SELECTORS
      .map((selector) => document.querySelector(selector))
      .find((node) => node);
    if (!button) {
      return { status: 'button-missing' };
    }

    const getButtonLabel = () => (button.textContent ?? '').trim();
    if (MODEL_STRATEGY === 'current') {
      // We still open the menu below to discover the checked item because the top button label
      // currently only says "ChatGPT" and does not expose the active model.
    }

    let lastPointerClick = 0;
    const pointerClick = () => {
      if (dispatchClickSequence(button)) {
        lastPointerClick = performance.now();
      }
    };

    const getOptionLabel = (node) => node?.textContent?.trim() ?? '';
    const classifyOption = (normalizedText, normalizedTestId) => {
      if (
        normalizedText.includes(' pro') ||
        normalizedText.endsWith('pro') ||
        normalizedTestId.includes('pro')
      ) {
        return 'pro';
      }
      if (normalizedText.includes('thinking') || normalizedTestId.includes('thinking')) {
        return 'thinking';
      }
      if (
        normalizedText.includes('instant') ||
        normalizedTestId.includes('instant') ||
        normalizedTestId.includes('gpt-5-3') ||
        normalizedTestId.includes('gpt5-3') ||
        normalizedTestId.includes('gpt53')
      ) {
        return 'instant';
      }
      return null;
    };
    const optionIsSelected = (node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      const ariaChecked = node.getAttribute('aria-checked');
      const ariaSelected = node.getAttribute('aria-selected');
      const ariaCurrent = node.getAttribute('aria-current');
      const dataSelected = node.getAttribute('data-selected');
      const dataState = (node.getAttribute('data-state') ?? '').toLowerCase();
      const selectedStates = ['checked', 'selected', 'on', 'true'];
      if (ariaChecked === 'true' || ariaSelected === 'true' || ariaCurrent === 'true') {
        return true;
      }
      if (dataSelected === 'true' || selectedStates.includes(dataState)) {
        return true;
      }
      if (node.querySelector('[data-testid*="check"], [role="img"][data-icon="check"], svg[data-icon="check"]')) {
        return true;
      }
      const trailingIndicator = Array.from(node.children).some((child) => {
        if (!(child instanceof HTMLElement)) {
          return false;
        }
        if (!(child.classList.contains('trailing') || child.hasAttribute('data-trailing-style'))) {
          return false;
        }
        return Boolean(child.querySelector('svg, [role="img"]'));
      });
      if (trailingIndicator) {
        return true;
      }
      return false;
    };
    const collectOptionNodes = () => {
      const menus = Array.from(document.querySelectorAll(${menuContainerLiteral}));
      if (menus.length > 0) {
        return menus.flatMap((menu) => Array.from(menu.querySelectorAll(${menuItemLiteral})));
      }
      return Array.from(document.querySelectorAll(${menuItemLiteral}));
    };

    const scoreOption = (normalizedText, testid) => {
      // Assign a score to every node so we can pick the most likely match without brittle equality checks.
      if (!normalizedText && !testid) {
        return 0;
      }
      let score = 0;
      const normalizedTestId = (testid ?? '').toLowerCase();
      const optionKind = classifyOption(normalizedText, normalizedTestId);
      if (SEMANTIC_TARGET) {
        if (optionKind === SEMANTIC_TARGET) {
          score += 2000;
        } else if (optionKind && optionKind !== SEMANTIC_TARGET) {
          return 0;
        }
      }
      if (normalizedTestId) {
        // Exact testid matches take priority over substring matches
        const exactMatch = TEST_IDS.find((id) => id && normalizedTestId === id);
        if (exactMatch) {
          score += 1500;
          if (exactMatch.startsWith('model-switcher-')) score += 200;
        } else {
          const matches = TEST_IDS.filter((id) => id && normalizedTestId.includes(id));
          if (matches.length > 0) {
            // Prefer the most specific match (longest token) instead of treating any hit as equal.
            // This prevents generic tokens (e.g. "pro") from outweighing version-specific targets.
            const best = matches.reduce((acc, token) => (token.length > acc.length ? token : acc), '');
            score += 200 + Math.min(900, best.length * 25);
            if (best.startsWith('model-switcher-')) score += 120;
            if (best.includes('gpt-')) score += 60;
          }
        }
      }
      if (normalizedText && normalizedTarget) {
        if (normalizedText === normalizedTarget) {
          score += 500;
        } else if (normalizedText.startsWith(normalizedTarget)) {
          score += 420;
        } else if (normalizedText.includes(normalizedTarget)) {
          score += 380;
        }
      }
      for (const token of normalizedTokens) {
        // Reward partial matches to the expanded label/token set.
        if (token && normalizedText.includes(token)) {
          const tokenWeight = Math.min(120, Math.max(10, token.length * 4));
          score += tokenWeight;
        }
      }
      if (optionKind === 'instant' && normalizedText === 'instant') {
        score += 150;
      }
      if (optionKind === 'thinking' && normalizedText === 'thinking') {
        score += 150;
      }
      if (optionKind === 'pro' && normalizedText === 'pro') {
        score += 150;
      }
      if (targetWords.length > 1) {
        let missing = 0;
        for (const word of targetWords) {
          if (!normalizedText.includes(word)) {
            missing += 1;
          }
        }
        score -= missing * 12;
      }
      return Math.max(score, 0);
    };

    const findBestOption = () => {
      // Walk through every menu item and keep whichever earns the highest score.
      let bestMatch = null;
      const buttons = collectOptionNodes();
      for (const option of buttons) {
        const text = option.textContent ?? '';
        const normalizedText = normalizeText(text);
        const testid = option.getAttribute('data-testid') ?? '';
        const score = scoreOption(normalizedText, testid);
        if (score <= 0) {
          continue;
        }
        const label = getOptionLabel(option);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { node: option, label, score, testid, normalizedText };
        }
      }
      return bestMatch;
    };
    const findSelectedOption = () => {
      let selected = null;
      const buttons = collectOptionNodes();
      for (const option of buttons) {
        if (!optionIsSelected(option)) {
          continue;
        }
        const text = option.textContent ?? '';
        const normalizedText = normalizeText(text);
        const testid = option.getAttribute('data-testid') ?? '';
        const score = scoreOption(normalizedText, testid);
        const label = getOptionLabel(option);
        if (!selected || score > selected.score) {
          selected = { node: option, label, score, testid, normalizedText };
        }
      }
      return selected;
    };

    return new Promise((resolve) => {
      const start = performance.now();
      const detectTemporaryChat = () => {
        try {
          const url = new URL(window.location.href);
          const flag = (url.searchParams.get('temporary-chat') ?? '').toLowerCase();
          if (flag === 'true' || flag === '1' || flag === 'yes') return true;
        } catch {}
        const title = (document.title || '').toLowerCase();
        if (title.includes('temporary chat')) return true;
        const body = (document.body?.innerText || '').toLowerCase();
        return body.includes('temporary chat');
      };
      const collectAvailableOptions = () => {
        const labels = collectOptionNodes()
          .map((node) => (node?.textContent ?? '').trim())
          .filter(Boolean)
          .filter((label, index, arr) => arr.indexOf(label) === index);
        return labels.slice(0, 12);
      };
      const ensureMenuOpen = () => {
        const menuOpen = document.querySelector('[role="menu"], [data-radix-collection-root]');
        if (!menuOpen && performance.now() - lastPointerClick > REOPEN_INTERVAL_MS) {
          pointerClick();
        }
      };

      // Open once and wait a tick before first scan.
      pointerClick();
      const openDelay = () => new Promise((r) => setTimeout(r, INITIAL_WAIT_MS));
      let initialized = false;
      const attempt = async () => {
        if (!initialized) {
          initialized = true;
          await openDelay();
        }
        ensureMenuOpen();
        const selected = findSelectedOption();
        const match = findBestOption();
        if (MODEL_STRATEGY === 'current') {
          if (selected) {
            resolve({ status: 'already-selected', label: selected.label || getButtonLabel() });
            return;
          }
        } else if (selected && selected.score > 0) {
          resolve({ status: 'already-selected', label: selected.label || getButtonLabel() });
          return;
        }
        if (MODEL_STRATEGY !== 'current' && match) {
          dispatchClickSequence(match.node);
          // Submenus (e.g. "Legacy models") need a second pass to pick the actual model option.
          // Keep scanning once the submenu opens instead of treating the submenu click as a final switch.
          const isSubmenu = (match.testid ?? '').toLowerCase().includes('submenu');
          if (isSubmenu) {
            setTimeout(attempt, REOPEN_INTERVAL_MS / 2);
            return;
          }
          // Verify via the checked menu item instead of the top button label, which is often generic.
          setTimeout(attempt, Math.max(160, INITIAL_WAIT_MS));
          return;
        }
        if (performance.now() - start > MAX_WAIT_MS) {
          resolve({
            status: 'option-not-found',
            hint: { temporaryChat: detectTemporaryChat(), availableOptions: collectAvailableOptions() },
          });
          return;
        }
        setTimeout(attempt, REOPEN_INTERVAL_MS / 2);
      };
      attempt();
    });
  })()`;
}

export function buildModelMatchersLiteralForTest(targetModel: string) {
  return buildModelMatchersLiteral(targetModel);
}

function buildModelMatchersLiteral(targetModel: string): {
  semanticTarget: 'instant' | 'thinking' | 'pro' | null;
  labelTokens: string[];
  testIdTokens: string[];
} {
  const base = targetModel.trim().toLowerCase();
  const labelTokens = new Set<string>();
  const testIdTokens = new Set<string>();
  const semanticTarget =
    base.includes(' pro') || base.endsWith('pro')
      ? 'pro'
      : base.includes('thinking')
        ? 'thinking'
        : base.includes('instant') || base.startsWith('gpt-') || base.includes('chatgpt')
          ? 'instant'
          : null;

  const push = (value: string | null | undefined, set: Set<string>) => {
    const normalized = value?.trim();
    if (normalized) {
      set.add(normalized);
    }
  };

  push(base, labelTokens);
  push(base.replace(/\s+/g, ' '), labelTokens);
  const collapsed = base.replace(/\s+/g, '');
  push(collapsed, labelTokens);
  const dotless = base.replace(/[.]/g, '');
  push(dotless, labelTokens);
  push(`chatgpt ${base}`, labelTokens);
  push(`chatgpt ${dotless}`, labelTokens);
  push(`gpt ${base}`, labelTokens);
  push(`gpt ${dotless}`, labelTokens);
  if (semanticTarget === 'instant') {
    push('instant', labelTokens);
    push('latest', labelTokens);
    testIdTokens.add('instant');
    testIdTokens.add('gpt-5-3');
    testIdTokens.add('gpt5-3');
    testIdTokens.add('gpt53');
    testIdTokens.add('model-switcher-gpt-5-3');
  }
  if (semanticTarget === 'thinking') {
    push('thinking', labelTokens);
    testIdTokens.add('thinking');
    testIdTokens.add('model-switcher-gpt-5-4-thinking');
  }
  if (semanticTarget === 'pro') {
    push('pro', labelTokens);
    push('research grade', labelTokens);
    push('advanced reasoning', labelTokens);
    testIdTokens.add('pro');
    testIdTokens.add('proresearch');
    testIdTokens.add('model-switcher-gpt-5-4-pro');
  }
  // Numeric variations (5.1 ↔ 51 ↔ gpt-5-1)
  if (base.includes('5.1') || base.includes('5-1') || base.includes('51')) {
    push('5.1', labelTokens);
    push('gpt-5.1', labelTokens);
    push('gpt5.1', labelTokens);
    push('gpt-5-1', labelTokens);
    push('gpt5-1', labelTokens);
    push('gpt51', labelTokens);
    push('chatgpt 5.1', labelTokens);
    testIdTokens.add('gpt-5-1');
    testIdTokens.add('gpt5-1');
    testIdTokens.add('gpt51');
  }
  // Numeric variations (5.0 ↔ 50 ↔ gpt-5-0)
  if (base.includes('5.0') || base.includes('5-0') || base.includes('50')) {
    push('5.0', labelTokens);
    push('gpt-5.0', labelTokens);
    push('gpt5.0', labelTokens);
    push('gpt-5-0', labelTokens);
    push('gpt5-0', labelTokens);
    push('gpt50', labelTokens);
    push('chatgpt 5.0', labelTokens);
    testIdTokens.add('gpt-5-0');
    testIdTokens.add('gpt5-0');
    testIdTokens.add('gpt50');
  }
  // Numeric variations (5.2 ↔ 52 ↔ gpt-5-2)
  if (base.includes('5.2') || base.includes('5-2') || base.includes('52')) {
    push('5.2', labelTokens);
    push('gpt-5.2', labelTokens);
    push('gpt5.2', labelTokens);
    push('gpt-5-2', labelTokens);
    push('gpt5-2', labelTokens);
    push('gpt52', labelTokens);
    push('chatgpt 5.2', labelTokens);
    // Thinking variant: explicit testid for "Thinking" picker option
    if (base.includes('thinking')) {
      push('thinking', labelTokens);
      testIdTokens.add('model-switcher-gpt-5-2-thinking');
      testIdTokens.add('gpt-5-2-thinking');
      testIdTokens.add('gpt-5.2-thinking');
    }
    // Instant variant: explicit testid for "Instant" picker option
    if (base.includes('instant')) {
      push('instant', labelTokens);
      testIdTokens.add('model-switcher-gpt-5-2-instant');
      testIdTokens.add('gpt-5-2-instant');
      testIdTokens.add('gpt-5.2-instant');
    }
    // Base 5.2 testids (for "Auto" mode when no suffix specified)
    if (!base.includes('thinking') && !base.includes('instant') && !base.includes('pro')) {
      testIdTokens.add('model-switcher-gpt-5-2');
    }
    testIdTokens.add('gpt-5-2');
    testIdTokens.add('gpt5-2');
    testIdTokens.add('gpt52');
  }
  // Pro / research variants
  if (base.includes('pro')) {
    push('proresearch', labelTokens);
    push('research grade', labelTokens);
    push('advanced reasoning', labelTokens);
    if (base.includes('5.1') || base.includes('5-1') || base.includes('51')) {
      testIdTokens.add('gpt-5.1-pro');
      testIdTokens.add('gpt-5-1-pro');
      testIdTokens.add('gpt51pro');
    }
    if (base.includes('5.0') || base.includes('5-0') || base.includes('50')) {
      testIdTokens.add('gpt-5.0-pro');
      testIdTokens.add('gpt-5-0-pro');
      testIdTokens.add('gpt50pro');
    }
    if (base.includes('5.2') || base.includes('5-2') || base.includes('52')) {
      testIdTokens.add('gpt-5.2-pro');
      testIdTokens.add('gpt-5-2-pro');
      testIdTokens.add('gpt52pro');
    }
    testIdTokens.add('pro');
    testIdTokens.add('proresearch');
  }
  base
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      push(token, labelTokens);
    });

  const hyphenated = base.replace(/\s+/g, '-');
  push(hyphenated, testIdTokens);
  push(collapsed, testIdTokens);
  push(dotless, testIdTokens);
  // data-testid values observed in the ChatGPT picker (e.g., model-switcher-gpt-5.1-pro)
  push(`model-switcher-${hyphenated}`, testIdTokens);
  push(`model-switcher-${collapsed}`, testIdTokens);
  push(`model-switcher-${dotless}`, testIdTokens);

  if (!labelTokens.size) {
    labelTokens.add(base);
  }
  if (!testIdTokens.size) {
    testIdTokens.add(base.replace(/\s+/g, '-'));
  }

  return {
    semanticTarget,
    labelTokens: Array.from(labelTokens).filter(Boolean),
    testIdTokens: Array.from(testIdTokens).filter(Boolean),
  };
}

export function buildModelSelectionExpressionForTest(targetModel: string): string {
  return buildModelSelectionExpression(targetModel, 'select');
}
