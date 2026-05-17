import type { ChromeClient, BrowserLogger } from '../types.js';
import type { ThinkingTimeLevel } from '../../oracle/types.js';
import type { ProviderUserIdentity } from '../providers/types.js';
import { MENU_CONTAINER_SELECTOR, MENU_ITEM_SELECTOR } from '../constants.js';
import { logDomFailure } from '../domDebug.js';
import { buildClickDispatcher } from './domEvents.js';

export type ChatgptProMode = 'standard' | 'extended';

export type ChatgptProModeGate = {
  allowed: boolean;
  proMode: ChatgptProMode;
  accountLevel?: string | null;
  accountPlanType?: string | null;
  accountStructure?: string | null;
  reason?: 'account-unverified' | 'requires-pro-account';
};

type ThinkingTimeOutcome =
  | { status: 'already-selected'; label?: string | null }
  | { status: 'switched'; label?: string | null }
  | { status: 'chip-not-found' }
  | { status: 'menu-not-found' }
  | { status: 'option-not-found' };

const THINKING_TIME_EVALUATE_TIMEOUT_MS = 25_000;

/**
 * Selects a specific thinking time level in ChatGPT's composer pill menu.
 * @param level - The thinking time intensity: 'light', 'standard', 'extended', or 'heavy'
 */
export async function ensureThinkingTime(
  Runtime: ChromeClient['Runtime'],
  level: ThinkingTimeLevel,
  logger: BrowserLogger,
) {
  const result = await evaluateThinkingTimeSelection(Runtime, level);
  const capitalizedLevel = level.charAt(0).toUpperCase() + level.slice(1);

  switch (result?.status) {
    case 'already-selected':
      logger(`Thinking time: ${result.label ?? capitalizedLevel} (already selected)`);
      return;
    case 'switched':
      logger(`Thinking time: ${result.label ?? capitalizedLevel}`);
      return;
    case 'chip-not-found': {
      await logDomFailure(Runtime, logger, 'thinking-chip');
      throw new Error('Unable to find the Thinking chip button in the composer area.');
    }
    case 'menu-not-found': {
      await logDomFailure(Runtime, logger, 'thinking-time-menu');
      throw new Error('Unable to find the Thinking time dropdown menu.');
    }
    case 'option-not-found': {
      await logDomFailure(Runtime, logger, `${level}-option`);
      throw new Error(`Unable to find the ${capitalizedLevel} option in the Thinking time menu.`);
    }
    default: {
      await logDomFailure(Runtime, logger, 'thinking-time-unknown');
      throw new Error(`Unknown error selecting ${capitalizedLevel} thinking time.`);
    }
  }
}

/**
 * Best-effort selection of a thinking time level in ChatGPT's composer pill menu.
 * Safe by default: if the pill/menu/option isn't present, we continue without throwing.
 * @param level - The thinking time intensity: 'light', 'standard', 'extended', or 'heavy'
 */
export async function ensureThinkingTimeIfAvailable(
  Runtime: ChromeClient['Runtime'],
  level: ThinkingTimeLevel,
  logger: BrowserLogger,
): Promise<boolean> {
  try {
    const result = await evaluateThinkingTimeSelection(Runtime, level);
    const capitalizedLevel = level.charAt(0).toUpperCase() + level.slice(1);

    switch (result?.status) {
      case 'already-selected':
        logger(`Thinking time: ${result.label ?? capitalizedLevel} (already selected)`);
        return true;
      case 'switched':
        logger(`Thinking time: ${result.label ?? capitalizedLevel}`);
        return true;
      case 'chip-not-found':
      case 'menu-not-found':
      case 'option-not-found':
        if (logger.verbose) {
          logger(`Thinking time: ${result.status.replaceAll('-', ' ')}; continuing with default.`);
        }
        return false;
      default:
        if (logger.verbose) {
          logger('Thinking time: unknown outcome; continuing with default.');
        }
        return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (logger.verbose) {
      logger(`Thinking time selection failed (${message}); continuing with default.`);
      await logDomFailure(Runtime, logger, 'thinking-time');
    }
    return false;
  }
}

async function evaluateThinkingTimeSelection(
  Runtime: ChromeClient['Runtime'],
  level: ThinkingTimeLevel,
): Promise<ThinkingTimeOutcome | undefined> {
  const outcome = await withStageTimeout(
    Runtime.evaluate({
      expression: buildThinkingTimeExpression(level),
      awaitPromise: true,
      returnByValue: true,
    }),
    THINKING_TIME_EVALUATE_TIMEOUT_MS,
    `Timed out waiting for ChatGPT thinking-time selector after ${Math.round(THINKING_TIME_EVALUATE_TIMEOUT_MS / 1000)}s.`,
  );

  return outcome.result?.value as ThinkingTimeOutcome | undefined;
}

function withStageTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([task, timer]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function buildThinkingTimeExpression(level: ThinkingTimeLevel): string {
  const menuContainerLiteral = JSON.stringify(MENU_CONTAINER_SELECTOR);
  const menuItemLiteral = JSON.stringify(MENU_ITEM_SELECTOR);
  const targetLevelsLiteral = JSON.stringify(resolveThinkingTimeCandidates(level));

  return `(async () => {
    ${buildClickDispatcher()}

    const MENU_CONTAINER_SELECTOR = ${menuContainerLiteral};
    const MENU_ITEM_SELECTOR = ${menuItemLiteral};
    const TARGET_LEVELS = ${targetLevelsLiteral};

    const CHIP_SELECTORS = [
      '[data-testid="composer-footer-actions"] button[aria-haspopup="menu"]',
      'button.__composer-pill[aria-haspopup="menu"]',
      '.__composer-pill-composite button[aria-haspopup="menu"]',
    ];

    const INITIAL_WAIT_MS = 150;
    const REOPEN_INTERVAL_MS = 400;
    const MAX_WAIT_MS = 10000;

    const normalize = (value) => (value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();

    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const findSelectedLevelPill = () => {
      const candidates = document.querySelectorAll(
        'button.__composer-pill, .__composer-pill-composite button, [data-testid="composer-footer-actions"] button'
      );
      for (const candidate of candidates) {
        if (!visible(candidate)) continue;
        const text = normalize([candidate.textContent ?? '', candidate.getAttribute?.('aria-label') ?? ''].join(' '));
        if (TARGET_LEVELS.some((target) => text.includes(target))) {
          return candidate;
        }
      }
      return null;
    };

    const findThinkingChip = () => {
      for (const selector of CHIP_SELECTORS) {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          // Skip toggle buttons (no haspopup) - only click dropdown triggers to avoid disabling Pro mode
          if (btn.getAttribute?.('aria-haspopup') !== 'menu') continue;
          const aria = normalize(btn.getAttribute?.('aria-label') ?? '');
          const text = normalize(btn.textContent ?? '');
          if (aria.includes('thinking') || text.includes('thinking')) {
            return btn;
          }

          // In some cases the pill is labeled "Pro".
          if (aria.includes('pro') || text.includes('pro')) {
            return btn;
          }
        }
      }
      return null;
    };

    const selectedLevelPill = findSelectedLevelPill();
    if (selectedLevelPill) {
      return { status: 'already-selected', label: selectedLevelPill.textContent?.trim?.() || null };
    }

    const chip = findThinkingChip();
    if (!chip) {
      return { status: 'chip-not-found' };
    }
    const chipLabel = [chip.textContent ?? '', chip.getAttribute?.('aria-label') ?? '']
      .map(normalize)
      .filter(Boolean)
      .join(' ');
    if (TARGET_LEVELS.some((target) => chipLabel.includes(target))) {
      return { status: 'already-selected', label: chip.textContent?.trim?.() || null };
    }

    dispatchClickSequence(chip);

    return new Promise((resolve) => {
      const start = performance.now();
      let lastOpenAttemptAt = performance.now();
      let configureOpened = false;
      let depthComboOpened = false;

      const findMenu = () => {
        const menus = document.querySelectorAll(MENU_CONTAINER_SELECTOR + ', [role="group"]');
        for (const menu of menus) {
          const label = menu.querySelector?.('.__menu-label, [class*="menu-label"]');
          if (normalize(label?.textContent ?? '').includes('thinking time')) {
            return menu;
          }
          const text = normalize(menu.textContent ?? '');
          if (text.includes('standard') && text.includes('extended')) {
            return menu;
          }
        }
        return null;
      };

      const findConfigureNode = () => Array.from(document.querySelectorAll(MENU_ITEM_SELECTOR + ', button'))
        .filter(visible)
        .find((node) => normalize([node.textContent ?? '', node.getAttribute?.('aria-label') ?? ''].join(' ')).includes('configure'));

      const findDialog = () => Array.from(document.querySelectorAll('[role="dialog"], [data-radix-dialog-content], div[aria-modal="true"]'))
        .filter(visible)
        .at(-1);

      const findDepthCombo = (dialog) => Array.from(dialog?.querySelectorAll?.('[role="combobox"], button') ?? [])
        .filter(visible)
        .find((node) => {
          const text = normalize([node.textContent ?? '', node.getAttribute?.('aria-label') ?? ''].join(' '));
          return text.includes('thinking time') ||
            text.includes('effort') ||
            text.includes('mode') ||
            text.includes('standard') ||
            text.includes('extended');
        });

      const findTargetOption = (menu) => {
        const items = menu.querySelectorAll(MENU_ITEM_SELECTOR);
        for (const item of items) {
          const text = normalize(item.textContent ?? '');
          if (TARGET_LEVELS.some((target) => text.includes(target))) {
            return item;
          }
        }
        return null;
      };

      const optionIsSelected = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const ariaChecked = node.getAttribute('aria-checked');
        const dataState = (node.getAttribute('data-state') || '').toLowerCase();
        if (ariaChecked === 'true') return true;
        if (dataState === 'checked' || dataState === 'selected' || dataState === 'on') return true;
        return false;
      };

      let attempt;

      const attemptDirectMenu = () => {
        const menu = findMenu();
        if (!menu) {
          if (performance.now() - start > MAX_WAIT_MS) {
            resolve({ status: 'menu-not-found' });
            return;
          }
          if (performance.now() - lastOpenAttemptAt >= REOPEN_INTERVAL_MS) {
            dispatchClickSequence(chip);
            lastOpenAttemptAt = performance.now();
          }
          setTimeout(attempt, 100);
          return;
        }

        const targetOption = findTargetOption(menu);
        if (!targetOption) {
          resolve({ status: 'option-not-found' });
          return;
        }

        const alreadySelected =
          optionIsSelected(targetOption) ||
          optionIsSelected(targetOption.querySelector?.('[aria-checked="true"], [data-state="checked"], [data-state="selected"]'));
        const label = targetOption.textContent?.trim?.() || null;
        if (alreadySelected) {
          resolve({ status: 'already-selected', label });
          return;
        }
        dispatchClickSequence(targetOption);
        resolve({ status: 'switched', label });
      };

      const attemptViaConfigure = () => {
        const menu = findMenu();
        if (menu) {
          return false;
        }

        const dialog = findDialog();
        if (dialog) {
          const dialogTarget = findTargetOption(dialog);
          if (dialogTarget) {
            const label = dialogTarget.textContent?.trim?.() || null;
            if (
              optionIsSelected(dialogTarget) ||
              optionIsSelected(dialogTarget.querySelector?.('[aria-checked="true"], [data-state="checked"], [data-state="selected"]'))
            ) {
              resolve({ status: 'already-selected', label });
              return true;
            }
            dispatchClickSequence(dialogTarget);
            resolve({ status: 'switched', label });
            return true;
          }
          if (!depthComboOpened) {
            const depthCombo = findDepthCombo(dialog);
            if (depthCombo) {
              dispatchClickSequence(depthCombo);
              depthComboOpened = true;
              setTimeout(attempt, 150);
              return true;
            }
          }
        }

        if (!configureOpened) {
          const configureNode = findConfigureNode();
          if (configureNode) {
            dispatchClickSequence(configureNode);
            configureOpened = true;
            setTimeout(attempt, 200);
            return true;
          }
        }
        return false;
      };

      attempt = () => {
        const menu = findMenu();
        if (!menu && attemptViaConfigure()) {
          return;
        }
        attemptDirectMenu();
      };

      setTimeout(attempt, INITIAL_WAIT_MS);
    });
  })()`;
}

export function buildThinkingTimeExpressionForTest(level: ThinkingTimeLevel = 'extended'): string {
  return buildThinkingTimeExpression(level);
}

export function resolveChatgptProModeFromThinkingTime(level: ThinkingTimeLevel): ChatgptProMode {
  return level === 'extended' || level === 'heavy' ? 'extended' : 'standard';
}

export function isChatgptProModelTarget(desiredModel: string | null | undefined): boolean {
  if (!desiredModel) return false;
  return /\bpro\b/i.test(desiredModel);
}

export function evaluateChatgptProModeGate(
  level: ThinkingTimeLevel,
  identity: ProviderUserIdentity | null | undefined,
): ChatgptProModeGate {
  const proMode = resolveChatgptProModeFromThinkingTime(level);
  const accountLevel = identity?.accountLevel ?? null;
  const accountPlanType = identity?.accountPlanType ?? null;
  const accountStructure = identity?.accountStructure ?? null;
  const normalizedLevel = accountLevel?.trim().toLowerCase();
  const normalizedPlan = accountPlanType?.trim().toLowerCase();
  const isPro = normalizedLevel === 'pro' || normalizedPlan === 'pro';

  if (isPro) {
    return { allowed: true, proMode, accountLevel, accountPlanType, accountStructure };
  }
  return {
    allowed: false,
    proMode,
    accountLevel,
    accountPlanType,
    accountStructure,
    reason: accountLevel || accountPlanType || accountStructure ? 'requires-pro-account' : 'account-unverified',
  };
}

export function formatChatgptProModeGateError(gate: ChatgptProModeGate): string {
  if (gate.reason === 'account-unverified') {
    return `ChatGPT Pro mode "${gate.proMode}" requires a verified Pro account, but AuraCall could not verify the current browser profile account level. Run the ChatGPT identity smoke for this AuraCall runtime profile before using --browser-thinking-time.`;
  }
  const accountSummary = [
    gate.accountLevel ? `level=${gate.accountLevel}` : null,
    gate.accountPlanType ? `plan=${gate.accountPlanType}` : null,
    gate.accountStructure ? `structure=${gate.accountStructure}` : null,
  ].filter(Boolean).join(', ');
  const suffix = accountSummary ? ` Current account: ${accountSummary}.` : '';
  return `ChatGPT Pro mode "${gate.proMode}" requires a Pro account.${suffix} Use a Pro-bound AuraCall runtime profile or omit --browser-thinking-time.`;
}

function resolveThinkingTimeCandidates(level: ThinkingTimeLevel): string[] {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case 'light':
      return ['light', 'standard'];
    case 'heavy':
      return ['heavy', 'extended'];
    case 'standard':
      return ['standard'];
    default:
      return ['extended'];
  }
}
