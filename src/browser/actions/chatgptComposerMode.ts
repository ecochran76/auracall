import { logDomFailure } from "../domDebug.js";
import type { BrowserLogger, BrowserModelStrategy, ChromeClient } from "../types.js";
import { buildClickDispatcher } from "./domEvents.js";

export type ChatgptComposerMode = "chat" | "work";

type ComposerModeOutcome =
	| { status: "already-selected" | "switched"; mode: ChatgptComposerMode }
	| { status: "mode-not-found"; availableModes: string[] }
	| { status: "selection-not-confirmed"; mode: ChatgptComposerMode };

export type ChatgptModelSelectionPlan =
	| { kind: "chat-model"; model: string; strategy: BrowserModelStrategy }
	| { kind: "work-model"; model: string; strategy: BrowserModelStrategy }
	| { kind: "work-current" }
	| { kind: "ignore" };

export function normalizeChatgptComposerMode(
	value: string | null | undefined,
): ChatgptComposerMode {
	if (value == null || value.trim().length === 0) return "chat";
	const normalized = value.trim().toLowerCase();
	if (normalized === "chat" || normalized === "work") return normalized;
	throw new Error(`Invalid ChatGPT mode: "${value}". Expected "chat" or "work".`);
}

export async function ensureChatgptComposerMode(
	Runtime: ChromeClient["Runtime"],
	desiredMode: ChatgptComposerMode,
	logger: BrowserLogger,
): Promise<void> {
	const outcome = await Runtime.evaluate({
		expression: buildChatgptComposerModeExpression(desiredMode),
		awaitPromise: true,
		returnByValue: true,
	});
	const result = outcome.result?.value as ComposerModeOutcome | null | undefined;
	const label = desiredMode === "chat" ? "Chat" : "Work";
	if (result?.status === "already-selected") {
		logger(`ChatGPT mode: ${label} (already selected)`);
		return;
	}
	if (result?.status === "switched") {
		logger(`ChatGPT mode: ${label}`);
		return;
	}
	await logDomFailure(Runtime, logger, "chatgpt-composer-mode");
	if (result?.status === "mode-not-found") {
		const available = result.availableModes.filter(Boolean);
		const hint = available.length > 0 ? ` Available: ${available.join(", ")}.` : "";
		throw new Error(`Unable to find the ChatGPT ${label} mode control.${hint}`);
	}
	throw new Error(`ChatGPT ${label} mode did not remain selected after activation.`);
}

export function resolveChatgptModelSelectionPlan(input: {
	mode: ChatgptComposerMode;
	desiredModel: string | null | undefined;
	workModel: string | null | undefined;
	strategy: BrowserModelStrategy;
}): ChatgptModelSelectionPlan {
	if (input.strategy === "ignore" || input.strategy === "current") return { kind: "ignore" };
	if (input.mode === "work") {
		const workModel = input.workModel?.trim();
		return workModel
			? { kind: "work-model", model: workModel, strategy: input.strategy }
			: { kind: "work-current" };
	}
	const desiredModel = input.desiredModel?.trim();
	return desiredModel
		? { kind: "chat-model", model: desiredModel, strategy: input.strategy }
		: { kind: "ignore" };
}

export function buildChatgptActiveConversationWorkMarkerHelpers(): string {
	return `
    const projectConversationRoute = (pathname) => {
      const segments = String(pathname ?? '').split('/').filter(Boolean);
      if (segments.length !== 4 || segments[0] !== 'g' || segments[2] !== 'c') return null;
      const projectRoute = segments[1];
      const conversationId = segments[3];
      const projectId = projectRoute.match(/^(g-p-[a-z0-9]{20,})(?:-|$)/i)?.[1] ?? null;
      if (!projectId || !conversationId) return null;
      return { projectId, conversationId };
    };
    const isCurrentConversationRoute = (pathname) => {
      if (pathname === location.pathname) return true;
      const candidate = projectConversationRoute(pathname);
      const current = projectConversationRoute(location.pathname);
      return Boolean(
        candidate &&
        current &&
        candidate.projectId === current.projectId &&
        candidate.conversationId === current.conversationId
      );
    };
    const hasActiveConversationWorkMarker = () =>
      Array.from(document.querySelectorAll('a[href][data-active]'))
        .filter(visible)
        .some((node) => {
          const href = node.getAttribute('href');
          if (!href) return false;
          let pathname = '';
          try {
            pathname = new URL(href, location.href).pathname;
          } catch {
            return false;
          }
          if (!isCurrentConversationRoute(pathname)) return false;
          return Array.from(node.querySelectorAll('span'))
            .some((marker) => normalize(marker.textContent) === 'work');
        });`;
}

function buildChatgptComposerModeExpression(desiredMode: ChatgptComposerMode): string {
	const desiredLiteral = JSON.stringify(desiredMode);
	return `(async () => {
    ${buildClickDispatcher()}
    const DESIRED_MODE = ${desiredLiteral};
    const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const isSelected = (node) =>
      node.getAttribute('aria-checked') === 'true' ||
      node.getAttribute('data-state') === 'on';
    ${buildChatgptActiveConversationWorkMarkerHelpers()}
    const radios = Array.from(document.querySelectorAll('[role="radio"]'))
      .filter(visible)
      .map((node) => ({ node, label: normalize(node.textContent) }))
      .filter(({ label }) => label === 'chat' || label === 'work');
    const radioTarget = radios.find(({ label }) => label === DESIRED_MODE);
    if (radioTarget) {
      if (isSelected(radioTarget.node)) return { status: 'already-selected', mode: DESIRED_MODE };
      if (!dispatchClickSequence(radioTarget.node)) return { status: 'selection-not-confirmed', mode: DESIRED_MODE };
      const startedAt = performance.now();
      while (performance.now() - startedAt < 5000) {
        if (isSelected(radioTarget.node)) return { status: 'switched', mode: DESIRED_MODE };
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return { status: 'selection-not-confirmed', mode: DESIRED_MODE };
    }
    const modeTriggers = Array.from(document.querySelectorAll('button[aria-haspopup="menu"]'))
      .filter(visible)
      .map((node) => ({ node, label: normalize(node.textContent) }))
      .filter(({ label }) => label === 'chat' || label === 'work');
    const trigger = modeTriggers[0];
    const triggerLabel = trigger?.label;
    if (triggerLabel === DESIRED_MODE) {
      return { status: 'already-selected', mode: DESIRED_MODE };
    }
    if (!trigger) {
      const activeConversationIsWork = hasActiveConversationWorkMarker();
      if (activeConversationIsWork) {
        return DESIRED_MODE === 'work'
          ? { status: 'already-selected', mode: DESIRED_MODE }
          : { status: 'mode-not-found', availableModes: ['Work'] };
      }
      if (DESIRED_MODE === 'chat' && radios.length === 0) {
        const composerStartedAt = performance.now();
        while (performance.now() - composerStartedAt < 10000) {
          if (hasActiveConversationWorkMarker()) break;
          const promptEditors = Array.from(document.querySelectorAll(
            '#prompt-textarea[role="textbox"][contenteditable="true"], textarea#prompt-textarea, textarea[name="prompt-textarea"]',
          )).filter((node) =>
            visible(node) &&
            node.getAttribute('aria-disabled') !== 'true' &&
            !('disabled' in node && node.disabled === true)
          );
          if (promptEditors.length > 0) {
            return { status: 'already-selected', mode: DESIRED_MODE };
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      return {
        status: 'mode-not-found',
        availableModes: [...radios, ...modeTriggers]
          .map(({ node }) => String(node.textContent ?? '').trim()).filter(Boolean),
      };
    }
    if (!dispatchClickSequence(trigger.node)) {
      return {
        status: 'mode-not-found',
        availableModes: [...radios, ...modeTriggers]
          .map(({ node }) => String(node.textContent ?? '').trim()).filter(Boolean),
      };
    }
    const menuStartedAt = performance.now();
    while (performance.now() - menuStartedAt < 2000) {
      if (trigger.node.getAttribute('aria-expanded') === 'true') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const menuItems = Array.from(document.querySelectorAll('[role="menuitemradio"]'))
      .filter(visible)
      .map((node) => ({ node, label: normalize(node.textContent) }))
      .filter(({ label }) => label === 'chat' || label === 'work');
    const target = menuItems.find(({ label }) => label === DESIRED_MODE);
    if (!target) {
      return {
        status: 'mode-not-found',
        availableModes: menuItems.map(({ node }) => String(node.textContent ?? '').trim()).filter(Boolean),
      };
    }
    if (!dispatchClickSequence(target.node)) return { status: 'selection-not-confirmed', mode: DESIRED_MODE };
    const startedAt = performance.now();
    while (performance.now() - startedAt < 5000) {
      if (normalize(trigger.node.textContent) === DESIRED_MODE || isSelected(target.node)) {
        return { status: 'switched', mode: DESIRED_MODE };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { status: 'selection-not-confirmed', mode: DESIRED_MODE };
  })()`;
}

export function buildChatgptComposerModeExpressionForTest(
	desiredMode: ChatgptComposerMode,
): string {
	return buildChatgptComposerModeExpression(desiredMode);
}

export const resolveChatgptModelSelectionPlanForTest = resolveChatgptModelSelectionPlan;
