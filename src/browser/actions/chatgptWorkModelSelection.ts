import { logDomFailure } from "../domDebug.js";
import type { BrowserLogger, BrowserModelStrategy, ChromeClient } from "../types.js";
import { buildActiveChatgptWorkConversationMarkerDefinition } from "./chatgptComposerMode.js";
import { buildClickDispatcher } from "./domEvents.js";

type WorkModelOutcome =
	| { status: "already-selected" | "switched"; label?: string | null }
	| { status: "trigger-not-found" }
	| { status: "option-not-found"; availableOptions?: string[] }
	| { status: "selection-not-confirmed"; label?: string | null };

export async function ensureChatgptWorkModelSelection(
	Runtime: ChromeClient["Runtime"],
	desiredModel: string,
	logger: BrowserLogger,
	strategy: BrowserModelStrategy,
): Promise<void> {
	const outcome = await Runtime.evaluate({
		expression: buildChatgptWorkModelSelectionExpression(desiredModel, strategy),
		awaitPromise: true,
		returnByValue: true,
	});
	const result = outcome.result?.value as WorkModelOutcome | null | undefined;
	if (result?.status === "already-selected" || result?.status === "switched") {
		logger(`Work model picker: ${result.label ?? desiredModel}`);
		return;
	}
	await logDomFailure(Runtime, logger, "chatgpt-work-model-selector");
	if (result?.status === "option-not-found") {
		const available = result.availableOptions?.filter(Boolean) ?? [];
		const hint = available.length > 0 ? ` Available: ${available.join(", ")}.` : "";
		throw new Error(`Unable to find Work model option matching "${desiredModel}".${hint}`);
	}
	if (result?.status === "trigger-not-found") {
		throw new Error(
			"Unable to locate the dedicated ChatGPT Work model selector. AuraCall did not fall back to the Chat model picker.",
		);
	}
	throw new Error(`ChatGPT Work model "${desiredModel}" did not remain selected after activation.`);
}

function buildChatgptWorkModelSelectionExpression(
	desiredModel: string,
	strategy: BrowserModelStrategy,
): string {
	const desiredLiteral = JSON.stringify(desiredModel);
	const strategyLiteral = JSON.stringify(strategy);
	return `(async () => {
    ${buildClickDispatcher()}
    const DESIRED_MODEL = ${desiredLiteral};
    const STRATEGY = ${strategyLiteral};
			const normalize = (value) => String(value ?? '').replace(/[^a-z0-9]+/gi, ' ').replace(/\\s+/g, ' ').trim().toLowerCase();
			const labelOf = (node) => normalize([
				node.getAttribute?.('aria-label'), node.innerText, node.textContent,
			].filter(Boolean).join(' '));
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    ${buildActiveChatgptWorkConversationMarkerDefinition()}
    const isSelected = (node) => node.getAttribute('aria-checked') === 'true' ||
      node.getAttribute('aria-selected') === 'true' || node.getAttribute('data-state') === 'on';
    const selectedWork = Array.from(document.querySelectorAll('[role="radio"], [role="menuitemradio"]'))
      .find((node) => visible(node) && normalize(node.textContent) === 'work' && isSelected(node));
    const workTrigger = Array.from(document.querySelectorAll('button[aria-haspopup="menu"]'))
      .find((node) => visible(node) && normalize(node.textContent) === 'work');
    if (!selectedWork && !workTrigger && !hasActiveConversationWorkMarker()) {
      return { status: 'trigger-not-found' };
    }
    const triggerMarker = Array.from(document.querySelectorAll('[data-animated-slider-trigger="true"]'))
      .find(visible);
			const trigger = triggerMarker?.closest('button[aria-haspopup="menu"]');
			if (!trigger) return { status: 'trigger-not-found' };
			const waitFor = async (predicate, timeoutMs = 2000) => {
				const startedAt = performance.now();
				while (performance.now() - startedAt < timeoutMs) {
					const value = predicate();
					if (value) return value;
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
				return null;
			};
			const canonicalModel = (value) => normalize(value).replace(/^gpt\\s+/, '');
    const target = canonicalModel(DESIRED_MODEL);
    if (canonicalModel(trigger.textContent).includes(target)) {
      return { status: 'already-selected', label: String(trigger.textContent ?? '').trim() };
    }
			if (trigger.getAttribute('aria-expanded') !== 'true') {
				if (!dispatchClickSequence(trigger)) return { status: 'selection-not-confirmed' };
				await waitFor(() => trigger.getAttribute('aria-expanded') === 'true');
			}
			const advanced = Array.from(document.querySelectorAll('[role="menuitem"]'))
				.map((node) => ({ node, label: labelOf(node) }))
				.find(({ node, label }) => visible(node) && label === 'show advanced options');
			if (advanced) {
				if (!dispatchClickSequence(advanced.node)) return { status: 'selection-not-confirmed' };
				await waitFor(() => Array.from(document.querySelectorAll('[role="menuitem"][aria-haspopup="menu"]'))
					.some((node) => visible(node) && labelOf(node).startsWith('model ')));
			}
			const modelMenu = Array.from(document.querySelectorAll('[role="menuitem"][aria-haspopup="menu"]'))
				.map((node) => ({ node, label: labelOf(node) }))
				.find(({ node, label }) => visible(node) && label.startsWith('model '));
			const modelOptionsVisible = () => Array.from(document.querySelectorAll('[role="menuitemradio"]'))
				.some((node) => visible(node) && !['chat', 'work'].includes(normalize(node.textContent)));
			if (modelMenu && modelMenu.node.getAttribute('aria-expanded') !== 'true') {
				if (!dispatchClickSequence(modelMenu.node)) return { status: 'selection-not-confirmed' };
				let mounted = await waitFor(modelOptionsVisible);
				if (!mounted && typeof modelMenu.node.click === 'function') {
					modelMenu.node.click();
					mounted = await waitFor(modelOptionsVisible);
				}
			}
    const options = Array.from(document.querySelectorAll('[role="menuitemradio"]'))
      .filter((node) => visible(node) && !['chat', 'work'].includes(normalize(node.textContent)));
    const labels = options.map((node) => String(node.textContent ?? '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
    const selected = options.find(isSelected);
    if (STRATEGY === 'current') {
      return selected
        ? { status: 'already-selected', label: String(selected.textContent ?? '').trim() }
        : { status: 'selection-not-confirmed' };
    }
    const match = options.find((node) => canonicalModel(node.textContent) === target);
    if (!match) return { status: 'option-not-found', availableOptions: labels };
    if (isSelected(match)) {
      return { status: 'already-selected', label: String(match.textContent ?? '').trim() };
    }
    if (!dispatchClickSequence(match)) return { status: 'selection-not-confirmed' };
    const startedAt = performance.now();
    while (performance.now() - startedAt < 5000) {
      const selectedOption = Array.from(document.querySelectorAll('[role="menuitemradio"]'))
        .find((node) => canonicalModel(node.textContent) === target && isSelected(node));
      if (selectedOption || canonicalModel(trigger.textContent).includes(target)) {
        return { status: 'switched', label: String(match.textContent ?? '').trim() };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { status: 'selection-not-confirmed', label: String(match.textContent ?? '').trim() };
  })()`;
}

export function buildChatgptWorkModelSelectionExpressionForTest(desiredModel: string): string {
	return buildChatgptWorkModelSelectionExpression(desiredModel, "select");
}
