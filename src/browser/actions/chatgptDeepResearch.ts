import type { BrowserLogger, ChromeClient } from '../types.js';
import { logDomFailure } from '../domDebug.js';
import { buildClickDispatcher } from './domEvents.js';

export type ChatgptDeepResearchStage =
  | 'not-requested'
  | 'tool-selected'
  | 'plan-ready'
  | 'plan-edit-opened'
  | 'start-clicked'
  | 'auto-started'
  | 'research-started';

export type ChatgptDeepResearchPlanAction = 'start' | 'edit';

export type ChatgptDeepResearchStartResult = {
  stage: Extract<ChatgptDeepResearchStage, 'start-clicked' | 'auto-started' | 'plan-edit-opened'>;
  startMethod: 'manual' | 'auto' | null;
  startLabel: string | null;
  modifyPlanLabel: string | null;
  modifyPlanVisible: boolean;
};

type ChatgptDeepResearchPlanProbe =
  | {
      status: 'start-clicked';
      startLabel: string | null;
      modifyPlanLabel: string | null;
      modifyPlanVisible: boolean;
    }
  | {
      status: 'iframe-edit-target';
      modifyPlanLabel: string | null;
      modifyPlanVisible: boolean;
      clickX: number;
      clickY: number;
    }
  | {
      status: 'plan-edit-opened';
      modifyPlanLabel: string | null;
      modifyPlanVisible: boolean;
    }
  | {
      status: 'auto-started';
      modifyPlanLabel: string | null;
      modifyPlanVisible: boolean;
    }
  | {
      status: 'plan-ready-no-start';
      modifyPlanLabel: string | null;
      modifyPlanVisible: boolean;
    }
  | {
      status: 'plan-not-found';
      modifyPlanLabel: string | null;
      modifyPlanVisible: boolean;
    };

export function isChatgptDeepResearchTool(tool: string | null | undefined): boolean {
  const normalized = normalizeDeepResearchToolLabel(tool);
  if (!normalized) return false;
  return normalized === 'research' || normalized === 'deep research' || (normalized.includes('deep') && normalized.includes('research'));
}

export function buildDeepResearchPlanStartExpressionForTest(timeoutMs = 45_000): string {
  return buildDeepResearchPlanStartExpression(timeoutMs, 'start');
}

export function buildDeepResearchPlanEditExpressionForTest(timeoutMs = 45_000): string {
  return buildDeepResearchPlanStartExpression(timeoutMs, 'edit');
}

export async function startChatgptDeepResearchPlan(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
  action: ChatgptDeepResearchPlanAction = 'start',
  timeoutMs = 45_000,
  Input?: ChromeClient['Input'],
): Promise<ChatgptDeepResearchStartResult> {
  const probe = await Runtime.evaluate({
    expression: buildDeepResearchPlanStartExpression(timeoutMs, action),
    awaitPromise: true,
    returnByValue: true,
  });
  const result = probe.result?.value as ChatgptDeepResearchPlanProbe | null | undefined;
  switch (result?.status) {
    case 'start-clicked':
      logger(`Deep Research plan accepted${result.startLabel ? ` (${result.startLabel})` : ''}`);
      return {
        stage: 'start-clicked',
        startMethod: 'manual',
        startLabel: result.startLabel,
        modifyPlanLabel: result.modifyPlanLabel,
        modifyPlanVisible: result.modifyPlanVisible,
      };
    case 'plan-edit-opened':
      logger(`Deep Research plan edit opened${result.modifyPlanLabel ? ` (${result.modifyPlanLabel})` : ''}`);
      return {
        stage: 'plan-edit-opened',
        startMethod: null,
        startLabel: null,
        modifyPlanLabel: result.modifyPlanLabel,
        modifyPlanVisible: result.modifyPlanVisible,
      };
    case 'iframe-edit-target':
      if (!Input) {
        await logDomFailure(Runtime, logger, 'chatgpt-deep-research-plan-iframe-no-input');
        throw new Error('ChatGPT Deep Research plan edit target is inside an iframe, but CDP Input is unavailable.');
      }
      await Input.dispatchMouseEvent({ type: 'mouseMoved', x: result.clickX, y: result.clickY });
      await Input.dispatchMouseEvent({ type: 'mousePressed', x: result.clickX, y: result.clickY, button: 'left', clickCount: 1 });
      await Input.dispatchMouseEvent({ type: 'mouseReleased', x: result.clickX, y: result.clickY, button: 'left', clickCount: 1 });
      logger(`Deep Research iframe plan edit opened${result.modifyPlanLabel ? ` (${result.modifyPlanLabel})` : ''}`);
      return {
        stage: 'plan-edit-opened',
        startMethod: null,
        startLabel: null,
        modifyPlanLabel: result.modifyPlanLabel,
        modifyPlanVisible: result.modifyPlanVisible,
      };
    case 'auto-started':
      logger('Deep Research plan auto-started by ChatGPT');
      return {
        stage: 'auto-started',
        startMethod: 'auto',
        startLabel: null,
        modifyPlanLabel: result.modifyPlanLabel,
        modifyPlanVisible: result.modifyPlanVisible,
      };
    case 'plan-ready-no-start':
      await logDomFailure(Runtime, logger, 'chatgpt-deep-research-plan-no-start');
      throw new Error(
        'ChatGPT Deep Research plan appeared, but AuraCall could not find the Start CTA. The plan may need human review or provider selectors may have changed.',
      );
    case 'plan-not-found':
    default:
      await logDomFailure(Runtime, logger, 'chatgpt-deep-research-plan-not-found');
      throw new Error('ChatGPT Deep Research did not present a startable research plan before timeout.');
  }
}

function normalizeDeepResearchToolLabel(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDeepResearchPlanStartExpression(timeoutMs: number, action: ChatgptDeepResearchPlanAction): string {
  const timeoutLiteral = JSON.stringify(Math.max(5_000, timeoutMs));
  const actionLiteral = JSON.stringify(action);
  return `(async () => {
    ${buildClickDispatcher()}

    const TIMEOUT_MS = ${timeoutLiteral};
    const PLAN_ACTION = ${actionLiteral};
    const POLL_MS = 350;
    const start = Date.now();
    const normalize = (value) => String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const buttonLabel = (node) => {
      const aria = node.getAttribute?.('aria-label') || '';
      const text = node.textContent || '';
      return normalize(aria || text);
    };
    const buttonDisplayLabel = (node) => {
      const aria = node.getAttribute?.('aria-label') || '';
      const text = node.textContent || '';
      return String(text || aria || '').replace(/\\s+/g, ' ').trim() || null;
    };
    const isStartLabel = (label) => {
      if (!label) return false;
      if (label === 'start') return true;
      if (label === 'start research' || label === 'start deep research') return true;
      if (label.includes('start') && label.includes('research')) return true;
      return false;
    };
    const isModifyPlanLabel = (label, planVisible) => {
      if (!label) return false;
      if (
        label.includes('plan') &&
        (label.includes('modify') || label.includes('edit') || label.includes('refine') || label.includes('change'))
      ) {
        return true;
      }
      return Boolean(planVisible) && (label === 'edit' || label === 'modify' || label === 'refine' || label === 'update');
    };
    const researchStartedVisible = (bodyText, labels) => {
      if (labels.some((label) => label.includes('stop') && (label.includes('research') || label.includes('responding')))) {
        return true;
      }
      if (bodyText.includes('researching') || bodyText.includes('research in progress')) return true;
      if (bodyText.includes('preparing analytical research') || bodyText.includes('report for user')) return true;
      if (bodyText.includes('searching') && bodyText.includes('sources')) return true;
      if (bodyText.includes('deep research') && (bodyText.includes('running') || bodyText.includes('started'))) return true;
      return false;
    };
    const conversationAssistantText = () => {
      const turns = Array.from(document.querySelectorAll('[data-testid^="conversation-turn"]'));
      const assistantTurns = turns.filter((turn) => {
        const text = normalize(turn.innerText || turn.textContent || '');
        return text.startsWith('chatgpt said') || text.startsWith('chatgpt');
      });
      return normalize(assistantTurns.map((turn) => turn.innerText || turn.textContent || '').join('\\n'));
    };
    const readDeepResearchIframeEditTarget = () => {
      const frames = Array.from(document.querySelectorAll('iframe')).filter(isVisible);
      const frame = frames.find((candidate) => {
        const title = normalize(candidate.getAttribute('title') || '');
        const src = normalize(candidate.getAttribute('src') || '');
        return title.includes('deep research') || src.includes('deep research') || src.includes('deep research');
      });
      if (!frame) return null;
      const rect = frame.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 80) return null;
      return {
        clickX: Math.round(rect.left + rect.width * 0.68),
        clickY: Math.round(rect.top + Math.min(36, rect.height * 0.12)),
      };
    };
    const readState = () => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(isVisible);
      const labeled = buttons.map((button) => ({ button, label: buttonLabel(button), displayLabel: buttonDisplayLabel(button) }));
      const startEntry = labeled.find((entry) => isStartLabel(entry.label));
      const bodyText = normalize(document.body?.innerText || document.body?.textContent || '');
      const assistantText = conversationAssistantText();
      const iframeEditTarget = readDeepResearchIframeEditTarget();
      const hasUpdateButton = labeled.some((entry) => entry.label === 'update');
      const assistantPlanVisible =
        assistantText.includes('research plan') ||
        assistantText.includes('preparing analytical research') ||
        assistantText.includes('report for user') ||
        (assistantText.includes('deep research') && (assistantText.includes('start') || assistantText.includes('edit') || assistantText.includes('update')));
      const preliminaryPlanVisible =
        Boolean(startEntry) ||
        hasUpdateButton ||
        Boolean(iframeEditTarget) ||
        assistantPlanVisible;
      const labels = labeled.map((entry) => entry.label);
      const modifyEntry = labeled.find((entry) => isModifyPlanLabel(entry.label, preliminaryPlanVisible));
      const modifyPlanVisible = Boolean(modifyEntry);
      return {
        startEntry,
        modifyEntry,
        iframeEditTarget,
        modifyPlanVisible,
        planVisible: preliminaryPlanVisible || modifyPlanVisible,
        researchStarted: researchStartedVisible(bodyText, labels),
      };
    };

    while (Date.now() - start < TIMEOUT_MS) {
      const state = readState();
      if (PLAN_ACTION === 'edit' && state.modifyEntry?.button) {
        dispatchClickSequence(state.modifyEntry.button);
        await new Promise((resolve) => setTimeout(resolve, 650));
        return {
          status: 'plan-edit-opened',
          modifyPlanLabel: state.modifyEntry.displayLabel,
          modifyPlanVisible: state.modifyPlanVisible,
        };
      }
      if (PLAN_ACTION === 'edit' && state.iframeEditTarget) {
        return {
          status: 'iframe-edit-target',
          modifyPlanLabel: 'Update',
          modifyPlanVisible: true,
          clickX: state.iframeEditTarget.clickX,
          clickY: state.iframeEditTarget.clickY,
        };
      }
      if (state.researchStarted && !state.startEntry?.button) {
        return {
          status: 'auto-started',
          modifyPlanLabel: state.modifyEntry?.displayLabel ?? null,
          modifyPlanVisible: state.modifyPlanVisible,
        };
      }
      if (PLAN_ACTION === 'edit' && state.startEntry?.button) {
        return {
          status: 'plan-ready-no-start',
          modifyPlanLabel: state.modifyEntry?.displayLabel ?? null,
          modifyPlanVisible: state.modifyPlanVisible,
        };
      }
      if (state.startEntry?.button) {
        dispatchClickSequence(state.startEntry.button);
        await new Promise((resolve) => setTimeout(resolve, 650));
        return {
          status: 'start-clicked',
          startLabel: state.startEntry.displayLabel,
          modifyPlanLabel: state.modifyEntry?.displayLabel ?? null,
          modifyPlanVisible: state.modifyPlanVisible,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    const state = readState();
    if (state.researchStarted) {
      return {
        status: 'auto-started',
        modifyPlanLabel: state.modifyEntry?.displayLabel ?? null,
        modifyPlanVisible: state.modifyPlanVisible,
      };
    }
    if (state.planVisible) {
      return {
        status: 'plan-ready-no-start',
        modifyPlanLabel: state.modifyEntry?.displayLabel ?? null,
        modifyPlanVisible: state.modifyPlanVisible,
      };
    }
    return {
      status: 'plan-not-found',
      modifyPlanLabel: state.modifyEntry?.displayLabel ?? null,
      modifyPlanVisible: state.modifyPlanVisible,
    };
  })()`;
}
