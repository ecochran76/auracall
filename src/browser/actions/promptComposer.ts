import { createHash } from "node:crypto";
import { BrowserAutomationError } from "../../oracle/errors.js";
import {
	ASSISTANT_ROLE_SELECTOR,
	CONVERSATION_TURN_SELECTOR,
	INPUT_SELECTORS,
	PROMPT_FALLBACK_SELECTOR,
	PROMPT_PRIMARY_SELECTOR,
	SEND_BUTTON_SELECTORS,
	STOP_BUTTON_SELECTOR,
} from "../constants.js";
import { logDomFailure } from "../domDebug.js";
import type { BrowserLogger, ChromeClient } from "../types.js";
import { delay } from "../utils.js";
import { buildClickDispatcher } from "./domEvents.js";

const ENTER_KEY_EVENT = {
	key: "Enter",
	code: "Enter",
	windowsVirtualKeyCode: 13,
	nativeVirtualKeyCode: 13,
} as const;
const ENTER_KEY_TEXT = "\r";
const PROMPT_TARGET_ATTRIBUTE = "data-auracall-prompt-target";
const PROMPT_TARGET_SELECTOR = `[${PROMPT_TARGET_ATTRIBUTE}="true"]`;

function normalizedComposerText(value: string): string {
	return value
		.replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
		.replace(/```/g, " ")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/^\s{0,3}#{1,6}\s+/gm, "")
		.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, "")
		.replace(/\s+/g, " ")
		.trim();
}

function composerContainsPrompt(value: string, prompt: string): boolean {
	const normalizedPrompt = normalizedComposerText(prompt);
	return Boolean(normalizedPrompt) && normalizedComposerText(value) === normalizedPrompt;
}

function promptMismatchDiagnostics(value: string, prompt: string) {
	const observed = normalizedComposerText(value);
	const expected = normalizedComposerText(prompt);
	let commonPrefixLength = 0;
	while (
		commonPrefixLength < observed.length &&
		commonPrefixLength < expected.length &&
		observed[commonPrefixLength] === expected[commonPrefixLength]
	) {
		commonPrefixLength += 1;
	}
	return {
		expectedNormalizedLength: expected.length,
		observedNormalizedLength: observed.length,
		commonPrefixLength,
		expectedSha256: createHash("sha256").update(expected).digest("hex"),
		observedSha256: createHash("sha256").update(observed).digest("hex"),
	};
}

function buildReadComposerUserTextFunction(): string {
	return `(node) => {
	  if (!node) return '';
	  if (node instanceof HTMLTextAreaElement) return node.value ?? '';
	  const protectedSelector =
	    '[data-inline-selection-pill], [data-system-hint-type^="plugin:"], [data-id^="plugin:"]';
	  const chunks = [];
	  const appendBoundary = () => {
	    if (chunks.length > 0 && !/\\s$/.test(chunks[chunks.length - 1] || '')) chunks.push('\\n');
	  };
	  const walk = (current) => {
	    if (current.nodeType === Node.TEXT_NODE) {
	      chunks.push(current.textContent || '');
	      return;
	    }
	    if (!(current instanceof Element) || current.matches(protectedSelector)) return;
	    const display = window.getComputedStyle(current).display;
	    const blockBoundary = /^(block|list-item|table-row|flex|grid)$/.test(display);
	    if (blockBoundary) appendBoundary();
	    current.childNodes.forEach(walk);
	    if (blockBoundary) appendBoundary();
	  };
	  node.childNodes.forEach(walk);
	  return chunks.join('');
	}`;
}

function buildReadCommittedTurnTextFunction(): string {
	return `(node) => {
	  if (!node) return '';
	  const presentationOnlySelector = [
	    'button',
	    '[role="button"]',
	    '[role="group"][class*="file-tile"]',
	    '[data-testid="collapsible-user-message-toggle"]',
	    '[data-testid$="-turn-action-button"]',
	  ].join(', ');
	  const chunks = [];
	  const appendBoundary = () => {
	    if (chunks.length > 0 && !/\\s$/.test(chunks[chunks.length - 1] || '')) chunks.push('\\n');
	  };
	  const walk = (current) => {
	    if (current.nodeType === Node.TEXT_NODE) {
	      chunks.push(current.textContent || '');
	      return;
	    }
	    if (!(current instanceof Element) || current.matches(presentationOnlySelector)) return;
	    const display = window.getComputedStyle(current).display;
	    const blockBoundary = /^(block|list-item|table-row|flex|grid)$/.test(display);
	    if (blockBoundary) appendBoundary();
	    current.childNodes.forEach(walk);
	    if (blockBoundary) appendBoundary();
	  };
	  node.childNodes.forEach(walk);
	  return chunks.join('');
	}`;
}

async function preparePromptComposer(
	Runtime: ChromeClient["Runtime"],
	logger: BrowserLogger,
): Promise<void> {
	const promptTargetSelectorLiteral = JSON.stringify(PROMPT_TARGET_SELECTOR);
	const result = await Runtime.evaluate({
		expression: `(() => {
	    const target = document.querySelector(${promptTargetSelectorLiteral});
	    if (!target) return { cleared: false, reason: 'missing-target' };
	    const protectedSelector =
	      '[data-inline-selection-pill], [data-system-hint-type^="plugin:"], [data-id^="plugin:"]';
	    const readUserText = ${buildReadComposerUserTextFunction()};
	    const before = readUserText(target);
	    if (target instanceof HTMLTextAreaElement) {
	      target.value = '';
	      target.dispatchEvent(
	        new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }),
	      );
	      target.dispatchEvent(new Event('change', { bubbles: true }));
	    } else {
	      const protectedNodes = new Set(Array.from(target.querySelectorAll(protectedSelector)));
	      const walker = target.ownerDocument.createTreeWalker(target, NodeFilter.SHOW_TEXT);
	      const removable = [];
	      let current = walker.nextNode();
	      while (current) {
	        const protectedAncestor = Array.from(protectedNodes).some(
	          (protectedNode) => protectedNode === current.parentElement || protectedNode.contains(current),
	        );
	        if (!protectedAncestor) removable.push(current);
	        current = walker.nextNode();
	      }
	      removable.forEach((node) => { node.textContent = ''; });
	      target.dispatchEvent(
	        new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }),
	      );
	    }
	    if (typeof target.focus === 'function') target.focus();
	    const selection = target.ownerDocument?.getSelection?.();
	    if (selection && !(target instanceof HTMLTextAreaElement)) {
	      const range = target.ownerDocument.createRange();
	      range.selectNodeContents(target);
	      range.collapse(false);
	      selection.removeAllRanges();
	      selection.addRange(range);
	    }
	    const after = readUserText(target);
	    return { cleared: !after.trim(), beforeLength: before.length, afterLength: after.length };
	  })()`,
		returnByValue: true,
	});
	if (!result.result?.value?.cleared) {
		await logDomFailure(Runtime, logger, "prepare-composer");
		throw new BrowserAutomationError(
			"Prompt composer retained user-authored text; refusing to submit.",
			{
				stage: "submit-prompt",
				code: "prompt-composer-not-cleared",
				beforeLength: result.result?.value?.beforeLength,
				afterLength: result.result?.value?.afterLength,
				reason: result.result?.value?.reason,
			},
		);
	}
}

function buildPromptFocusExpression(): string {
	return `(() => {
    ${buildClickDispatcher()}
    const SELECTORS = ${JSON.stringify(INPUT_SELECTORS)};
    const TARGET_ATTRIBUTE = ${JSON.stringify(PROMPT_TARGET_ATTRIBUTE)};
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const isEnabled = (node) =>
      !node.hasAttribute('disabled') &&
      node.getAttribute('aria-disabled') !== 'true' &&
      node.getAttribute('contenteditable') !== 'false';
    const isComposerOwned = (node) => {
      if (node.matches('#prompt-textarea, textarea[name="prompt-textarea"]')) return true;
      const composer = node.closest('[data-testid*="composer"], form');
      if (!composer) return false;
      if (composer.matches('[data-testid*="composer"]')) return true;
      return Boolean(
        composer.querySelector(
          '#composer-plus-btn, button[data-testid="send-button"], button[data-testid*="composer-send"], input#upload-files',
        ),
      );
    };
    const focusNode = (node) => {
      if (!isVisible(node) || !isEnabled(node) || !isComposerOwned(node)) return false;
      document.querySelectorAll('[' + TARGET_ATTRIBUTE + ']').forEach((candidate) =>
        candidate.removeAttribute(TARGET_ATTRIBUTE),
      );
      node.setAttribute(TARGET_ATTRIBUTE, 'true');
      dispatchClickSequence(node);
      if (typeof node.focus === 'function') node.focus();
      const doc = node.ownerDocument;
      const selection = doc?.getSelection?.();
      if (selection && !(node instanceof HTMLTextAreaElement)) {
        const range = doc.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return true;
    };

    for (const selector of SELECTORS) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (focusNode(node)) return { focused: true, selector, tagName: node.tagName };
      }
    }
    return { focused: false };
  })()`;
}

export async function submitPrompt(
	deps: {
		runtime: ChromeClient["Runtime"];
		input: ChromeClient["Input"];
		attachmentNames?: string[];
		baselineTurns?: number | null;
		inputTimeoutMs?: number | null;
		onPromptDispatched?: () => void | Promise<void>;
	},
	prompt: string,
	logger: BrowserLogger,
): Promise<number | null> {
	const { runtime, input } = deps;

	await waitForDomReady(runtime, logger, deps.inputTimeoutMs ?? undefined);
	const encodedPrompt = JSON.stringify(prompt);
	const focusResult = await runtime.evaluate({
		expression: buildPromptFocusExpression(),
		returnByValue: true,
		awaitPromise: true,
	});
	if (!focusResult.result?.value?.focused) {
		await logDomFailure(runtime, logger, "focus-textarea");
		throw new Error("Failed to focus prompt textarea");
	}

	await preparePromptComposer(runtime, logger);
	await input.insertText({ text: prompt });

	// Some pages (notably ChatGPT when subscriptions/widgets load) need a brief settle
	// before the send button becomes enabled; give it a short breather to avoid races.
	await delay(500);

	const primarySelectorLiteral = JSON.stringify(PROMPT_PRIMARY_SELECTOR);
	const fallbackSelectorLiteral = JSON.stringify(PROMPT_FALLBACK_SELECTOR);
	const promptTargetSelectorLiteral = JSON.stringify(PROMPT_TARGET_SELECTOR);
	const verification = await runtime.evaluate({
		expression: `(() => {
      const editor = document.querySelector(${primarySelectorLiteral});
      const fallback = document.querySelector(${fallbackSelectorLiteral});
      const target = document.querySelector(${promptTargetSelectorLiteral});
      const readText = (node) => node instanceof HTMLTextAreaElement ? node.value ?? '' : node?.innerText ?? node?.textContent ?? '';
	      const readUserText = ${buildReadComposerUserTextFunction()};
      return {
        editorText: editor?.innerText ?? '',
        fallbackValue: fallback?.value ?? '',
        editorUserText: readUserText(editor),
        targetText: readText(target),
        targetUserText: readUserText(target),
      };
    })()`,
		returnByValue: true,
	});

	const fallbackValueRaw = verification.result?.value?.fallbackValue ?? "";
	const editorUserTextRaw = verification.result?.value?.editorUserText ?? "";
	const targetUserTextRaw = verification.result?.value?.targetUserText ?? "";
	const observedInitialText = targetUserTextRaw || editorUserTextRaw || fallbackValueRaw;
	if (!observedInitialText.trim()) {
		// Input.insertText occasionally misses a pill-bearing ProseMirror editor.
		// Insert at the editable tail without replacing the selected app pill.
		await runtime.evaluate({
			expression: `(() => {
	        const target = document.querySelector(${promptTargetSelectorLiteral});
	        const fallback = target instanceof HTMLTextAreaElement ? target : document.querySelector(${fallbackSelectorLiteral});
	        if (fallback) {
          fallback.value = ${encodedPrompt};
          fallback.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${encodedPrompt}, inputType: 'insertFromPaste' }));
          fallback.dispatchEvent(new Event('change', { bubbles: true }));
	        }
	        const editor = target && !(target instanceof HTMLTextAreaElement) ? target : document.querySelector(${primarySelectorLiteral});
	        if (editor) {
	          if (typeof editor.focus === 'function') editor.focus();
	          const selection = editor.ownerDocument?.getSelection?.();
	          if (selection) {
	            const range = editor.ownerDocument.createRange();
	            range.selectNodeContents(editor);
	            range.collapse(false);
	            selection.removeAllRanges();
	            selection.addRange(range);
	          }
	          const inserted =
	            typeof document.execCommand === 'function' &&
	            document.execCommand('insertText', false, ${encodedPrompt});
	          if (!inserted) {
	            const tail = editor.querySelector('p:last-child') || editor;
	            tail.appendChild(editor.ownerDocument.createTextNode(${encodedPrompt}));
	            editor.dispatchEvent(
	              new InputEvent('input', {
	                bubbles: true,
	                data: ${encodedPrompt},
	                inputType: 'insertText',
	              }),
	            );
	          }
	        }
	      })()`,
		});
	} else if (
		!composerContainsPrompt(targetUserTextRaw, prompt) &&
		!composerContainsPrompt(editorUserTextRaw, prompt) &&
		!composerContainsPrompt(fallbackValueRaw, prompt)
	) {
		await logDomFailure(runtime, logger, "prompt-composer-mismatch");
		throw new BrowserAutomationError(
			"Prompt composer contains text other than the requested prompt; refusing to submit.",
			{
				stage: "submit-prompt",
				code: "prompt-composer-mismatch",
				promptLength: prompt.length,
				observedLength: observedInitialText.length,
				...promptMismatchDiagnostics(observedInitialText, prompt),
			},
		);
	}

	const promptLength = prompt.length;
	const postVerification = await runtime.evaluate({
		expression: `(() => {
      const editor = document.querySelector(${primarySelectorLiteral});
      const fallback = document.querySelector(${fallbackSelectorLiteral});
      const target = document.querySelector(${promptTargetSelectorLiteral});
      const readText = (node) => node instanceof HTMLTextAreaElement ? node.value ?? '' : node?.innerText ?? node?.textContent ?? '';
	      const readUserText = ${buildReadComposerUserTextFunction()};
      return {
        editorText: editor?.innerText ?? '',
        fallbackValue: fallback?.value ?? '',
        editorUserText: readUserText(editor),
        targetText: readText(target),
        targetUserText: readUserText(target),
      };
    })()`,
		returnByValue: true,
	});
	const observedEditor = postVerification.result?.value?.editorText ?? "";
	const observedFallback = postVerification.result?.value?.fallbackValue ?? "";
	const observedEditorUserText = postVerification.result?.value?.editorUserText ?? "";
	const observedTarget = postVerification.result?.value?.targetText ?? "";
	const observedTargetUserText = postVerification.result?.value?.targetUserText ?? "";
	if (
		!composerContainsPrompt(observedTargetUserText, prompt) &&
		!composerContainsPrompt(observedEditorUserText, prompt) &&
		!composerContainsPrompt(observedFallback, prompt)
	) {
		await logDomFailure(runtime, logger, "prompt-not-in-composer");
		throw new BrowserAutomationError(
			"Prompt text did not appear in the composer; refusing to submit.",
			{
				stage: "submit-prompt",
				code: "prompt-not-in-composer",
				promptLength,
			},
		);
	}
	const observedLength = Math.max(
		observedTarget.length,
		observedEditor.length,
		observedFallback.length,
	);
	if (promptLength >= 50_000 && observedLength > 0 && observedLength < promptLength - 2_000) {
		// Learned: very large prompts can truncate silently; fail fast so we can fall back to file uploads.
		await logDomFailure(runtime, logger, "prompt-too-large");
		throw new BrowserAutomationError(
			"Prompt appears truncated in the composer (likely too large).",
			{
				stage: "submit-prompt",
				code: "prompt-too-large",
				promptLength,
				observedLength,
			},
		);
	}

	await waitForComposerReadyToSubmit(runtime, Math.max(8_000, deps.inputTimeoutMs ?? 0));
	const clicked = await attemptSendButton(runtime, logger, deps?.attachmentNames);
	if (!clicked) {
		await input.dispatchKeyEvent({
			type: "keyDown",
			...ENTER_KEY_EVENT,
			text: ENTER_KEY_TEXT,
			unmodifiedText: ENTER_KEY_TEXT,
		});
		await input.dispatchKeyEvent({
			type: "keyUp",
			...ENTER_KEY_EVENT,
		});
		logger("Submitted prompt via Enter key");
	} else {
		logger("Clicked send button");
	}
	await deps.onPromptDispatched?.();

	const commitTimeoutMs = Math.max(60_000, deps.inputTimeoutMs ?? 0);
	// Learned: the send button can succeed but the turn doesn't appear immediately; verify commit via turns/stop button.
	return await verifyPromptCommitted(
		runtime,
		prompt,
		commitTimeoutMs,
		logger,
		deps.baselineTurns ?? undefined,
	);
}

export async function clearPromptComposer(Runtime: ChromeClient["Runtime"], logger: BrowserLogger) {
	const primarySelectorLiteral = JSON.stringify(PROMPT_PRIMARY_SELECTOR);
	const fallbackSelectorLiteral = JSON.stringify(PROMPT_FALLBACK_SELECTOR);
	const result = await Runtime.evaluate({
		expression: `(() => {
      const fallback = document.querySelector(${fallbackSelectorLiteral});
      const editor = document.querySelector(${primarySelectorLiteral});
      let cleared = false;
      if (fallback) {
        fallback.value = '';
        fallback.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
        fallback.dispatchEvent(new Event('change', { bubbles: true }));
        cleared = true;
      }
      if (editor) {
        editor.textContent = '';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
        cleared = true;
      }
      return { cleared };
    })()`,
		returnByValue: true,
	});
	if (!result.result?.value?.cleared) {
		await logDomFailure(Runtime, logger, "clear-composer");
		throw new Error("Failed to clear prompt composer");
	}
	await delay(250);
}

async function waitForDomReady(
	Runtime: ChromeClient["Runtime"],
	logger?: BrowserLogger,
	timeoutMs = 10_000,
) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const { result } = await Runtime.evaluate({
			expression: `(() => {
        const ready = document.readyState === 'complete';
        const composer = document.querySelector('[data-testid*="composer"]') || document.querySelector('form');
        const fileInput = document.querySelector('input[type="file"]');
        return { ready, composer: Boolean(composer), fileInput: Boolean(fileInput) };
      })()`,
			returnByValue: true,
		});
		const value = result?.value as
			| { ready?: boolean; composer?: boolean; fileInput?: boolean }
			| undefined;
		if (value?.ready && value.composer) {
			return;
		}
		await delay(150);
	}
	logger?.(`Page did not reach ready/composer state within ${timeoutMs}ms; continuing cautiously.`);
}

function buildAttachmentReadyExpression(attachmentNames: string[]): string {
	const namesLiteral = JSON.stringify(attachmentNames.map((name) => name.toLowerCase()));
	return `(() => {
    const names = ${namesLiteral};
    const composer =
      document.querySelector('[data-testid*="composer"]') ||
      document.querySelector('form') ||
      document.body ||
      document;
    const match = (node, name) => (node?.textContent || '').toLowerCase().includes(name);

    // Restrict to attachment affordances; never scan generic div/span nodes (prompt text can contain the file name).
    const attachmentSelectors = [
      '[data-testid*="chip"]',
      '[data-testid*="attachment"]',
      '[data-testid*="upload"]',
      '[aria-label="Remove file"]',
      'button[aria-label="Remove file"]',
    ];

    const chipsReady = names.every((name) =>
      Array.from(composer.querySelectorAll(attachmentSelectors.join(','))).some((node) => match(node, name)),
    );
    const inputsReady = names.every((name) =>
      Array.from(composer.querySelectorAll('input[type="file"]')).some((el) =>
        Array.from((el instanceof HTMLInputElement ? el.files : []) || []).some((file) =>
          file?.name?.toLowerCase?.().includes(name),
        ),
      ),
    );

    return chipsReady || inputsReady;
  })()`;
}

export function buildAttachmentReadyExpressionForTest(attachmentNames: string[]) {
	return buildAttachmentReadyExpression(attachmentNames);
}

async function attemptSendButton(
	Runtime: ChromeClient["Runtime"],
	_logger?: BrowserLogger,
	_attachmentNames?: string[],
): Promise<boolean> {
	const script = `(() => {
    ${buildClickDispatcher()}
    const selectors = ${JSON.stringify(SEND_BUTTON_SELECTORS)};
    let button = null;
    for (const selector of selectors) {
      button = document.querySelector(selector);
      if (button) break;
    }
    if (!button) return 'missing';
    const ariaDisabled = button.getAttribute('aria-disabled');
    const dataDisabled = button.getAttribute('data-disabled');
    const style = window.getComputedStyle(button);
    const disabled =
      button.hasAttribute('disabled') ||
      ariaDisabled === 'true' ||
      dataDisabled === 'true' ||
      style.pointerEvents === 'none' ||
      style.display === 'none';
    // Learned: some send buttons render but are inert; only click when truly enabled.
    if (disabled) return 'disabled';
    // Use unified pointer/mouse sequence to satisfy React handlers.
    dispatchClickSequence(button);
    return 'clicked';
  })()`;

	const deadline = Date.now() + 8_000;
	while (Date.now() < deadline) {
		const { result } = await Runtime.evaluate({ expression: script, returnByValue: true });
		if (result.value === "clicked") {
			return true;
		}
		if (result.value === "missing") {
			break;
		}
		await delay(100);
	}
	return false;
}

async function waitForComposerReadyToSubmit(
	Runtime: ChromeClient["Runtime"],
	timeoutMs = 10_000,
): Promise<void> {
	const sendSelectorsLiteral = JSON.stringify(SEND_BUTTON_SELECTORS);
	const stopSelectorLiteral = JSON.stringify(STOP_BUTTON_SELECTOR);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const { result } = await Runtime.evaluate({
			expression: `(() => {
        const selectors = ${sendSelectorsLiteral};
        const stopVisible = Boolean(document.querySelector(${stopSelectorLiteral}));
        let button = null;
        for (const selector of selectors) {
          button = document.querySelector(selector);
          if (button) break;
        }
        if (!stopVisible && !button) {
          return { ready: true };
        }
        if (!button) {
          return { ready: false };
        }
        const ariaDisabled = button.getAttribute('aria-disabled');
        const dataDisabled = button.getAttribute('data-disabled');
        const style = window.getComputedStyle(button);
        const disabled =
          button.hasAttribute('disabled') ||
          ariaDisabled === 'true' ||
          dataDisabled === 'true' ||
          style.pointerEvents === 'none' ||
          style.display === 'none';
        return {
          ready: !stopVisible && !disabled,
        };
      })()`,
			returnByValue: true,
		});
		if (result?.value?.ready) {
			return;
		}
		await delay(100);
	}
}

async function verifyPromptCommitted(
	Runtime: ChromeClient["Runtime"],
	prompt: string,
	timeoutMs: number,
	logger?: BrowserLogger,
	baselineTurns?: number,
): Promise<number | null> {
	const deadline = Date.now() + timeoutMs;
	const encodedPrompt = JSON.stringify(prompt.trim());
	const primarySelectorLiteral = JSON.stringify(PROMPT_PRIMARY_SELECTOR);
	const fallbackSelectorLiteral = JSON.stringify(PROMPT_FALLBACK_SELECTOR);
	const inputSelectorsLiteral = JSON.stringify(INPUT_SELECTORS);
	const stopSelectorLiteral = JSON.stringify(STOP_BUTTON_SELECTOR);
	const assistantSelectorLiteral = JSON.stringify(ASSISTANT_ROLE_SELECTOR);
	const turnSelectorLiteral = JSON.stringify(CONVERSATION_TURN_SELECTOR);
	let baseline: number | null =
		typeof baselineTurns === "number" && Number.isFinite(baselineTurns) && baselineTurns >= 0
			? Math.floor(baselineTurns)
			: null;
	if (baseline === null) {
		try {
			const { result } = await Runtime.evaluate({
				expression: `document.querySelectorAll(${turnSelectorLiteral}).length`,
				returnByValue: true,
			});
			const raw = typeof result?.value === "number" ? result.value : Number(result?.value);
			if (Number.isFinite(raw)) {
				baseline = Math.max(0, Math.floor(raw));
			}
		} catch {
			// ignore; baseline stays unknown
		}
	}
	const baselineLiteral = baseline ?? -1;
	// Require the newly committed user turn to equal the requested prompt after
	// presentation-only markdown and whitespace normalization.
	const script = `(() => {
	    const editor = document.querySelector(${primarySelectorLiteral});
	    const fallback = document.querySelector(${fallbackSelectorLiteral});
	    const inputSelectors = ${inputSelectorsLiteral};
	    const normalize = (value) => {
	      let text = String(value ?? '');
	      // Strip markdown *markers* but keep content (ChatGPT renders fence markers differently).
	      text = text.replace(/\`\`\`[^\\n]*\\n([\\s\\S]*?)\`\`\`/g, ' $1 ');
	      text = text.replace(/\`\`\`/g, ' ');
	      text = text.replace(/\`([^\`]*)\`/g, '$1');
	      text = text.replace(/^\\s{0,3}#{1,6}\\s+/gm, '');
	      text = text.replace(/^\\s*(?:[-*+]\\s+|\\d+[.)]\\s+)/gm, '');
	      return text.replace(/\\s+/g, ' ').trim();
	    };
	    const normalizedPrompt = normalize(${encodedPrompt});
	    const normalizedPromptPrefix = normalizedPrompt.slice(0, 120);
	    const CONVERSATION_SELECTOR = ${JSON.stringify(CONVERSATION_TURN_SELECTOR)};
	    const articles = Array.from(document.querySelectorAll(CONVERSATION_SELECTOR));
	    const userArticles = articles.filter((node) => {
	      const role = String(
	        node.getAttribute?.('data-message-author-role') || node.getAttribute?.('data-turn') || '',
	      ).toLowerCase();
	      return role === 'user' || Boolean(node.querySelector?.('[data-message-author-role="user"], [data-turn="user"]'));
	    });
	    const candidateArticles = userArticles.length > 0 ? userArticles : articles;
	    const readCommittedTurnText = ${buildReadCommittedTurnTextFunction()};
	    const normalizedTurns = candidateArticles.map((node) => normalize(readCommittedTurnText(node)));
	    const readValue = (node) => {
	      if (!node) return '';
	      if (node instanceof HTMLTextAreaElement) return node.value ?? '';
	      return node.innerText ?? '';
	    };
	    const isVisible = (node) => {
	      if (!node || typeof node.getBoundingClientRect !== 'function') return false;
	      const rect = node.getBoundingClientRect();
	      return rect.width > 0 && rect.height > 0;
	    };
	    const inputs = inputSelectors
	      .map((selector) => document.querySelector(selector))
	      .filter((node) => Boolean(node));
	    const visibleInputs = inputs.filter((node) => isVisible(node));
	    const activeInputs = visibleInputs.length > 0 ? visibleInputs : inputs;
	    const userMatched =
	      normalizedPrompt.length > 0 && normalizedTurns.some((text) => text.includes(normalizedPrompt));
	    const prefixMatched =
	      normalizedPromptPrefix.length > 30 &&
	      normalizedTurns.some((text) => text.includes(normalizedPromptPrefix));
	    const lastTurn = normalizedTurns[normalizedTurns.length - 1] ?? '';
	    const lastMatched =
	      normalizedPrompt.length > 0 &&
	      (lastTurn.includes(normalizedPrompt) ||
	        (normalizedPromptPrefix.length > 30 && lastTurn.includes(normalizedPromptPrefix)));
	    const lastExactMatched = normalizedPrompt.length > 0 && lastTurn === normalizedPrompt;
	    const baseline = ${baselineLiteral};
	    const hasNewTurn = baseline < 0 ? false : articles.length > baseline;
      const stopVisible = Boolean(document.querySelector(${stopSelectorLiteral}));
      const assistantVisible = Boolean(
        document.querySelector(${assistantSelectorLiteral}) ||
        document.querySelector('[data-testid*="assistant"]'),
      );
      // Learned: composer clearing + stop button or assistant presence is a reliable fallback signal.
      const editorValue = editor?.innerText ?? '';
      const fallbackValue = fallback?.value ?? '';
      const activeEmpty =
        activeInputs.length === 0 ? null : activeInputs.every((node) => !String(readValue(node)).trim());
      const composerCleared = activeEmpty ?? !(String(editorValue).trim() || String(fallbackValue).trim());
      const href = typeof location === 'object' && location.href ? location.href : '';
      const inConversation = /\\/c\\//.test(href);
	    return {
      baseline,
      userMatched,
      prefixMatched,
      lastMatched,
	  lastExactMatched,
      hasNewTurn,
      stopVisible,
      assistantVisible,
      composerCleared,
      inConversation,
      href,
      fallbackValue,
      editorValue,
      lastTurn,
	      turnsCount: articles.length,
    };
  })()`;

	while (Date.now() < deadline) {
		const { result } = await Runtime.evaluate({ expression: script, returnByValue: true });
		const info = result.value as {
			userMatched?: boolean;
			prefixMatched?: boolean;
			lastMatched?: boolean;
			lastExactMatched?: boolean;
			hasNewTurn?: boolean;
			stopVisible?: boolean;
			assistantVisible?: boolean;
			composerCleared?: boolean;
			inConversation?: boolean;
			turnsCount?: number;
			baseline?: number;
		};
		const turnsCount = (result.value as { turnsCount?: number } | undefined)?.turnsCount;
		const matchesPrompt = Boolean(info?.lastExactMatched);
		const baselineUnknown =
			typeof info?.baseline === "number" ? info.baseline < 0 : baselineLiteral < 0;
		if (matchesPrompt && (baselineUnknown || info?.hasNewTurn)) {
			return typeof turnsCount === "number" && Number.isFinite(turnsCount) ? turnsCount : null;
		}
		await delay(100);
	}
	if (logger) {
		logger(
			`Prompt commit check failed; latest state: ${await Runtime.evaluate({
				expression: script,
				returnByValue: true,
			})
				.then((res) => JSON.stringify(res?.result?.value))
				.catch(() => "unavailable")}`,
		);
		await logDomFailure(Runtime, logger, "prompt-commit");
	}
	if (prompt.trim().length >= 50_000) {
		throw new BrowserAutomationError(
			"Prompt did not appear in conversation before timeout (likely too large).",
			{
				stage: "submit-prompt",
				code: "prompt-too-large",
				promptLength: prompt.trim().length,
				timeoutMs,
			},
		);
	}
	throw new Error("Prompt did not appear in conversation before timeout (send may have failed)");
}

export const __test__ = {
	composerContainsPrompt,
	normalizedComposerText,
	promptMismatchDiagnostics,
	buildReadComposerUserTextFunction,
	buildReadCommittedTurnTextFunction,
	preparePromptComposer,
	verifyPromptCommitted,
	waitForComposerReadyToSubmit,
};

export const buildPromptFocusExpressionForTest = buildPromptFocusExpression;
