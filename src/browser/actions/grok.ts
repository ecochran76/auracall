import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserAutomationError } from '../../oracle/errors.js';
import type { ChromeClient, BrowserLogger, BrowserAttachment } from '../types.js';
import { delay } from '../utils.js';
import { GROK_PROVIDER } from '../providers/grok.js';
import { detectGrokSignedInIdentity } from '../providers/grokIdentity.js';
import { ensureServicesRegistry, normalizeServiceModelToken } from '../../services/registry.js';
import { buildFindAllSelectorsExpression, buildSelectorArrayLiteral } from '../providers/shared.js';
import {
  GROK_MODEL_MENU_ENTRIES_EXPRESSION,
  type GrokModelMenuEntry,
  normalizeGrokModelLabel,
} from '../providers/grokModelMenu.js';
import { isGrokRateLimitToastText, type GrokAssistantSnapshot } from '../providers/grokEvidence.js';
import { navigateAndSettle, type NavigateAndSettleOptions } from '../service/ui.js';

const GROK_SELECTORS = GROK_PROVIDER.selectors;
const GROK_INPUT_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.input);
const GROK_SEND_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.sendButton);
const GROK_MODEL_BUTTON_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.modelButton);
const GROK_ASSISTANT_BUBBLE_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.assistantBubble);
const GROK_ASSISTANT_ROLE_SELECTORS = buildSelectorArrayLiteral(GROK_SELECTORS.assistantRole);
const GROK_VISIBLE_INPUT_EXPRESSION = `(() => {
  const selectors = ${GROK_INPUT_SELECTORS};
  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (
      el.getAttribute('aria-hidden') !== 'true' &&
      !el.hasAttribute('disabled') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const candidates = [...new Set(selectors.flatMap(selector => Array.from(document.querySelectorAll(selector))))]
    .filter(el => isVisible(el) && !el.closest('[role="dialog"], [aria-modal="true"], [aria-hidden="true"]'));
  if (candidates.length !== 1) return null;
  return candidates[0];
})()`;

const GROK_COMPOSER_TOKEN_READER = `(root) => Array.from(root.querySelectorAll('[contenteditable="false"]'))
  .filter(node => !node.parentElement?.closest('[contenteditable="false"]'))
  .map(node => JSON.stringify([node.getAttribute('data-id'), node.getAttribute('data-entity-id'), node.getAttribute('data-type'), node.textContent || '']))`;

// Read editable text without counting immutable mention/connector tokens as prompt
// text. Paragraph and BR boundaries are significant, including blank lines.
const GROK_COMPOSER_TEXT_READER = `(root) => {
  const read = node => {
    if (node.nodeType === 3) {
      const siblings = Array.from(node.parentElement?.childNodes || []);
      const previous = siblings[siblings.indexOf(node) - 1];
      if (previous instanceof HTMLElement && previous.getAttribute('contenteditable') === 'false' && node.textContent === ' ') return '';
      return node.textContent || '';
    }
    if (!(node instanceof HTMLElement) || node.getAttribute('contenteditable') === 'false') return '';
    if (node.tagName === 'BR') return node.parentElement?.childNodes.length === 1 ? '' : '\\n';
    let text = '';
    Array.from(node.childNodes).forEach((child, index) => {
      if (index > 0 && child instanceof HTMLElement && /^(P|DIV)$/.test(child.tagName)) text += '\\n';
      text += read(child);
    });
    return text;
  };
  return read(root);
}`;

// Resolve controls from the selected editor outward, never from unrelated forms.
const GROK_SCOPED_SUBMIT_EXPRESSION = `(() => {
  const editor = ${GROK_VISIBLE_INPUT_EXPRESSION};
  if (!editor) return null;
  let root = editor.closest('form') || editor.parentElement;
  while (root && root !== document.body) {
    const candidates = [...new Set(${GROK_SEND_SELECTORS}.flatMap(selector => Array.from(root.querySelectorAll(selector))))]
      .filter(candidate => candidate instanceof HTMLButtonElement && !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true' &&
        candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0 &&
        window.getComputedStyle(candidate).display !== 'none' && window.getComputedStyle(candidate).visibility !== 'hidden');
    if (candidates.length > 1) return null;
    if (candidates.length === 1) return candidates[0];
    if (root.tagName === 'FORM' || root.tagName === 'MAIN') return null;
    root = root.parentElement;
  }
  return null;
})()`;

export async function navigateToGrok(
  Page: ChromeClient['Page'],
  Runtime: ChromeClient['Runtime'],
  url: string,
  logger: BrowserLogger,
  options: Pick<NavigateAndSettleOptions, 'mutationAudit' | 'mutationSource'> = {},
): Promise<void> {
  logger(`Navigating to ${url}`);
  const settled = await navigateAndSettle(
    { Page, Runtime },
    {
      url,
      timeoutMs: 45_000,
      mutationAudit: options.mutationAudit,
      mutationSource: options.mutationSource ?? 'legacy:grok:navigate',
    },
  );
  if (!settled.ok) {
    throw new Error(`Grok navigation to ${url} did not settle: ${settled.reason ?? settled.phase}`);
  }
}

export async function ensureGrokLoggedIn(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
  options: { headless: boolean; timeoutMs?: number } = { headless: false },
): Promise<void> {
  const checkLogin = async (): Promise<{
    ok: boolean;
    reason: 'identity' | 'guest-cta' | 'not-found' | 'unknown';
  }> => {
    const href = await readLocationHref(Runtime);
    if (GROK_PROVIDER.loginUrlHints?.some((hint) => href.includes(hint))) {
      return { ok: false, reason: 'guest-cta' };
    }
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const text = (document.body?.innerText || '').toLowerCase();
        const hasNotFound =
          text.includes("link doesn't exist") ||
          text.includes('link does not exist') ||
          text.includes('page not found') ||
          text.includes('issue finding id');
        return { hasNotFound };
      })()`,
      returnByValue: true,
    });
    if (result?.value?.hasNotFound) {
      return { ok: false, reason: 'not-found' };
    }
    const status = await detectGrokSignedInIdentity(Runtime);
    if (status.identity) {
      return { ok: true, reason: 'identity' };
    }
    if (status.guestAuthCta) {
      return { ok: false, reason: 'guest-cta' };
    }
    return { ok: false, reason: 'unknown' };
  };

  const initial = await checkLogin();
  if (initial.ok) {
    logger('Login check passed (identity verified)');
    return;
  }

  if (options.headless) {
    throw new Error(
      'Grok login required; could not verify a signed-in Grok account. Please sign in to grok.com and retry.',
    );
  }

  const deadline = Date.now() + Math.min(options.timeoutMs ?? 1_200_000, 10 * 60_000);
  let lastNotice = 0;
  while (Date.now() < deadline) {
    const status = await checkLogin();
    if (status.ok) {
      logger('Login check passed (identity verified)');
      return;
    }
    const now = Date.now();
    if (now - lastNotice > 5000) {
      const suffix =
        status.reason === 'guest-cta'
          ? 'visible Sign in/Sign up controls still present'
          : status.reason === 'not-found'
            ? 'page is not on a valid Grok chat route yet'
            : 'signed-in identity not detected yet';
      logger(`Waiting for Grok login to complete in the open browser (${suffix})...`);
      lastNotice = now;
    }
    await delay(1000);
  }
  throw new Error('Grok login required; timed out waiting for a verified signed-in Grok account.');
}

export async function ensureGrokPromptReady(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await Runtime.evaluate({
      expression: `(() => Boolean(${GROK_VISIBLE_INPUT_EXPRESSION}))()`,
      returnByValue: true,
    });
    if (ready.result?.value) {
      logger('Prompt textarea ready');
      return;
    }
    await delay(250);
  }
  throw new Error('Grok prompt not ready before timeout.');
}

type GrokPreparedPrompt = {
  composerId: string;
  prompt: string;
  tokens: string;
  state: 'invalid' | 'prepared' | 'dispatched';
};
const preparedGrokPrompts = new WeakMap<ChromeClient['Runtime'], GrokPreparedPrompt>();

export async function setGrokPrompt(
  Input: ChromeClient['Input'],
  Runtime: ChromeClient['Runtime'],
  prompt: string,
): Promise<void> {
  const composerId = randomUUID();
  preparedGrokPrompts.set(Runtime, { composerId, prompt, tokens: '[]', state: 'invalid' });
  const exactComposer = `document.querySelector('[data-auracall-grok-composer="${composerId}"]')`;
  const normalizeText = (value: string): string => value.replace(/\r\n/g, '\n');
  const focusOutcome = await Runtime.evaluate({
    expression: `(() => {
      const el = ${GROK_VISIBLE_INPUT_EXPRESSION};
      if (!el) return { ok: false };
      el.setAttribute('data-auracall-grok-composer', ${JSON.stringify(composerId)});
      window.__auracallGrokPreparedComposer = { id: ${JSON.stringify(composerId)}, element: el, tokens: Array.from(el.querySelectorAll('[contenteditable="false"]')).filter(token => !token.parentElement?.closest('[contenteditable="false"]')) };
      const tokenEvidence = (${GROK_COMPOSER_TOKEN_READER})(el);
      const dispatchClick = (target) => {
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          target.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            buttons: 1,
            view: window,
          }));
        }
      };
      dispatchClick(el);
      el.focus();
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        el.value = '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, mode: 'input', tokens: tokenEvidence };
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        const doc = el.ownerDocument;
        const selection = doc?.getSelection?.();
        if (selection) {
          const range = doc.createRange();
          range.selectNodeContents(el);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        const tokens = Array.from(el.querySelectorAll('[contenteditable="false"]'))
          .filter(token => !token.parentElement?.closest('[contenteditable="false"]'));
        el.replaceChildren(...tokens.flatMap(token => [token, document.createTextNode(' ')]));
        if (selection) {
          const caret = doc.createRange();
          caret.selectNodeContents(el);
          caret.collapse(false);
          selection.removeAllRanges();
          selection.addRange(caret);
        }
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: '', inputType: 'deleteByCut' }));
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
        return { ok: true, mode: 'contenteditable', tokens: tokenEvidence };
      }
      return { ok: false };
    })()`,
    returnByValue: true,
  });
  if (!focusOutcome.result?.value?.ok) {
    throw new Error('Unable to focus the Grok prompt composer.');
  }

  const expectedTokens = JSON.stringify(focusOutcome.result?.value?.tokens ?? []);
  const mode = String(focusOutcome.result?.value?.mode ?? '');
  const shouldPreferDomInjection = mode === 'contenteditable' && prompt.includes('\n');
  if (!shouldPreferDomInjection) {
    await Input.insertText({ text: prompt });
    await delay(250);
  }

  const verifyOutcome = await Runtime.evaluate({
    expression: `(() => {
      const el = ${exactComposer};
      if (!el || window.__auracallGrokPreparedComposer?.element !== el) return { ok: false, text: '' };
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return { ok: true, text: el.value || '', tokens: (${GROK_COMPOSER_TOKEN_READER})(el) };
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        return { ok: true, text: (${GROK_COMPOSER_TEXT_READER})(el), tokens: (${GROK_COMPOSER_TOKEN_READER})(el) };
      }
      return { ok: false, text: '' };
    })()`,
    returnByValue: true,
  });
  const observedText = normalizeText(String(verifyOutcome.result?.value?.text ?? ''));
  if (JSON.stringify(verifyOutcome.result?.value?.tokens ?? []) !== expectedTokens)
    throw new Error('Grok selected composer tokens changed; prompt was not submitted.');
  if (verifyOutcome.result?.value?.ok && observedText === normalizeText(prompt)) {
    preparedGrokPrompts.set(Runtime, {
      composerId,
      prompt: normalizeText(prompt),
      tokens: expectedTokens,
      state: 'prepared',
    });
    return;
  }

  const fallbackOutcome = await Runtime.evaluate({
    expression: `(() => {
      const el = ${exactComposer};
      if (!el || window.__auracallGrokPreparedComposer?.element !== el) return false;
      const text = ${JSON.stringify(prompt)};
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        const prototype = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (valueSetter) {
          valueSetter.call(el, text);
        } else {
          el.value = text;
        }
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertFromPaste' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        const tokens = Array.from(el.querySelectorAll('[contenteditable="false"]'))
          .filter(token => !token.parentElement?.closest('[contenteditable="false"]'));
        el.replaceChildren(...tokens.flatMap(token => [token, document.createTextNode(' ')]));
        const lines = text.split(/\\r?\\n/);
        lines.forEach((line, index) => {
          if (index > 0) {
            el.appendChild(document.createElement('br'));
          }
          el.appendChild(document.createTextNode(line));
        });
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: text, inputType: 'insertFromPaste' }));
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertFromPaste' }));
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
  });
  if (!fallbackOutcome.result?.value) {
    throw new Error('Unable to set Grok prompt text.');
  }

  const postFallback = await Runtime.evaluate({
    expression: `(() => {
      const el = ${exactComposer};
      if (!el || window.__auracallGrokPreparedComposer?.element !== el) return { ok: false, text: '' };
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return { ok: true, text: el.value || '', tokens: (${GROK_COMPOSER_TOKEN_READER})(el) };
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        return { ok: true, text: (${GROK_COMPOSER_TEXT_READER})(el), tokens: (${GROK_COMPOSER_TOKEN_READER})(el) };
      }
      return { ok: false, text: '' };
    })()`,
    returnByValue: true,
  });
  if (
    !postFallback.result?.value?.ok ||
    JSON.stringify(postFallback.result?.value?.tokens ?? []) !== expectedTokens ||
    normalizeText(String(postFallback.result?.value?.text ?? '')) !== normalizeText(prompt)
  ) {
    throw new Error('Unable to preserve Grok prompt formatting in the composer.');
  }
  preparedGrokPrompts.set(Runtime, {
    composerId,
    prompt: normalizeText(prompt),
    tokens: expectedTokens,
    state: 'prepared',
  });
}

export async function submitGrokPrompt(
  Input: ChromeClient['Input'],
  Runtime: ChromeClient['Runtime'],
): Promise<void> {
  const preparation = preparedGrokPrompts.get(Runtime);
  if (preparation && preparation.state !== 'prepared')
    throw new BrowserAutomationError(
      'Grok prepared composer is unavailable or already dispatched; prepare and verify a new draft before sending.',
      { stage: 'grok-prompt-submit', effectState: 'pre_effect' },
    );
  const submitId = randomUUID();
  const readSubmissionState = async (): Promise<{
    composerText: string;
    turnCount: number;
    submitDisabled: boolean;
    hasEnabledSubmit: boolean;
  }> => {
    const state = await Runtime.evaluate({
      expression: `(() => {
        const isVisible = (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const selectors = ${GROK_SEND_SELECTORS};
        const btn = ${GROK_SCOPED_SUBMIT_EXPRESSION};
        if (btn) btn.setAttribute('data-auracall-grok-submit', ${JSON.stringify(submitId)});
        const el = ${GROK_VISIBLE_INPUT_EXPRESSION};
        const composerText =
          el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
            ? (el.value || '')
            : el instanceof HTMLElement && el.isContentEditable
              ? (el.innerText || el.textContent || '')
              : '';
        const turnCount = document.querySelectorAll('[id^="response-"]').length;
        return {
          composerText,
          turnCount,
          submitDisabled: btn ? Boolean(btn.disabled) : false,
          hasEnabledSubmit: Boolean(btn),
        };
      })()`,
      returnByValue: true,
    });
    return {
      composerText: String(state.result?.value?.composerText ?? ''),
      turnCount: Number(state.result?.value?.turnCount ?? 0),
      submitDisabled: Boolean(state.result?.value?.submitDisabled),
      hasEnabledSubmit: Boolean(state.result?.value?.hasEnabledSubmit),
    };
  };

  const waitDeadline = Date.now() + 10_000;
  let baseline = await readSubmissionState();
  while (!baseline.hasEnabledSubmit && Date.now() < waitDeadline) {
    await delay(250);
    baseline = await readSubmissionState();
  }
  if (!baseline.hasEnabledSubmit) {
    throw new Error('Unable to locate Grok submit button.');
  }

  let outcome: Awaited<ReturnType<ChromeClient['Runtime']['evaluate']>>;
  try {
    if (preparation) preparation.state = 'dispatched';
    outcome = await Runtime.evaluate({
      expression: `(() => {
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const selectors = ${GROK_SEND_SELECTORS};
      const expected = ${JSON.stringify(preparation ? { composerId: preparation.composerId, prompt: preparation.prompt, tokens: preparation.tokens } : null)};
      if (expected) {
        const editor = ${GROK_VISIBLE_INPUT_EXPRESSION};
        const retained = window.__auracallGrokPreparedComposer;
        if (!editor || retained?.element !== editor || retained.id !== expected.composerId || editor.getAttribute('data-auracall-grok-composer') !== expected.composerId) return 'prepared-composer-changed';
        const tokens = Array.from(editor.querySelectorAll('[contenteditable="false"]')).filter(token => !token.parentElement?.closest('[contenteditable="false"]'));
        if (tokens.length !== retained.tokens.length || tokens.some((token, index) => token !== retained.tokens[index])) return 'prepared-composer-changed';
        const text = editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement ? editor.value : (${GROK_COMPOSER_TEXT_READER})(editor);
        if (String(text).replace(/\\r\\n/g, '\\n') !== expected.prompt || JSON.stringify((${GROK_COMPOSER_TOKEN_READER})(editor)) !== expected.tokens) return 'prepared-composer-changed';
      }
      const btn = ${GROK_SCOPED_SUBMIT_EXPRESSION};
      const captured = document.querySelector('[data-auracall-grok-submit="${submitId}"]');
      if (!btn || btn !== captured) return false;
      btn.click();
      return true;
    })()`,
      returnByValue: true,
    });
  } catch (error) {
    throw new BrowserAutomationError(
      'Grok submission outcome unknown after click dispatch; reconcile the conversation before retrying.',
      { stage: 'grok-prompt-submit', effectState: 'unknown' },
      error,
    );
  }
  if (outcome.result?.value !== true) {
    if (
      preparation &&
      (outcome.result?.value === false || outcome.result?.value === 'prepared-composer-changed')
    )
      preparation.state = 'prepared';
    if (outcome.result?.value === 'prepared-composer-changed')
      throw new BrowserAutomationError(
        'Grok prepared composer identity, draft text or selected tokens changed; no click dispatched.',
        { stage: 'grok-prompt-submit', effectState: 'pre_effect' },
      );
    if (outcome.result?.value === false && !outcome.exceptionDetails)
      throw new Error('Unable to locate the exact Grok submit button; no click dispatched.');
    throw new BrowserAutomationError(
      'Grok submission outcome unknown after click dispatch; reconcile the conversation before retrying.',
      { stage: 'grok-prompt-submit', effectState: 'unknown' },
    );
  }

  // Once a click has been dispatched, absence of an immediate UI change is
  // uncertain effect custody. Observe the same target; never send Enter/reclick.
  const commitDeadline = Date.now() + 5_000;
  while (Date.now() < commitDeadline) {
    let current: Awaited<ReturnType<typeof readSubmissionState>>;
    try {
      current = await readSubmissionState();
    } catch (error) {
      throw new BrowserAutomationError(
        'Grok submission observation failed after one click; reconcile the conversation before retrying.',
        { stage: 'grok-prompt-submit', effectState: 'unknown' },
        error,
      );
    }
    if (current.turnCount > baseline.turnCount) return;
    await delay(250);
  }
  throw new BrowserAutomationError(
    'Grok submission unconfirmed after one click; the prompt may have committed. Reconcile the conversation before retrying.',
    { stage: 'grok-prompt-submit', effectState: 'unknown' },
  );
}

/** Discover observed picker labels and account gates, including Build when exposed. */
export async function discoverGrokModels(
  Input: ChromeClient['Input'],
  Runtime: ChromeClient['Runtime'],
): Promise<GrokModelMenuEntry[]> {
  if (!(await openGrokModelMenu(Runtime, Input)))
    throw new Error('Unable to open Grok model menu.');
  const outcome = await Runtime.evaluate({
    expression: `(() => ${GROK_MODEL_MENU_ENTRIES_EXPRESSION}.map(({ label, selected, entitlement }) => ({ label, selected, entitlement })))()`,
    returnByValue: true,
  });
  const entries = outcome.result?.value;
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error('Unable to discover an unambiguous Grok model menu.');
  return entries;
}

/** Verify the selected entry without choosing a different model. */
export async function verifyGrokCurrentModel(
  Input: ChromeClient['Input'],
  Runtime: ChromeClient['Runtime'],
): Promise<string> {
  const entries = await discoverGrokModels(Input, Runtime);
  const selected = entries.filter((entry) => entry.selected);
  if (selected.length !== 1)
    throw new Error('Unable to verify the current Grok model unambiguously.');
  if (selected[0].entitlement !== 'available')
    throw new Error('Current Grok model is account-gated; required entitlement is unavailable.');
  await pressKey(Input, 'Escape', 'Escape');
  return selected[0].label;
}

export async function selectGrokMode(
  Input: ChromeClient['Input'],
  Runtime: ChromeClient['Runtime'],
  label: string,
  logger: BrowserLogger,
): Promise<string> {
  const servicesRegistry = await ensureServicesRegistry();
  const inputToken = normalizeServiceModelToken(label);
  const candidateLabels = (servicesRegistry.services.grok?.models ?? [])
    .filter((model) =>
      [model.id, model.label, ...(model.aliases ?? [])].some(
        (token) => normalizeServiceModelToken(token) === inputToken,
      ),
    )
    .map((model) => model.label);
  const normalizedCandidates = candidateLabels
    .concat(candidateLabels.length === 0 ? [label] : [])
    .map((candidate) => normalizeGrokModelLabel(candidate))
    .filter(Boolean);
  const menuOpened = await openGrokModelMenu(Runtime, Input);
  if (!menuOpened) {
    throw new Error('Unable to open Grok model menu; explicit selection was not performed.');
  }
  const matchExpression = `entry => ${JSON.stringify(normalizedCandidates.map((value) => value.toLowerCase()))}
    .some(candidate => entry.label.toLowerCase() === candidate || entry.label.toLowerCase().startsWith(candidate + ' '))`;
  const outcome = await Runtime.evaluate({
    expression: `(() => {
      const entries = ${GROK_MODEL_MENU_ENTRIES_EXPRESSION};
      const targets = entries.filter(${matchExpression});
      if (targets.length !== 1) return { ok: false, available: entries.map(entry => entry.label) };
      const target = targets[0];
      if (target.entitlement !== 'available') return { ok: false, gated: true };
      if (!target.selected) target.node.click();
      return { ok: true, label: target.label };
    })()`,
    returnByValue: true,
  });
  const result = outcome.result?.value as
    | { ok?: boolean; available?: string[]; gated?: boolean; label?: string }
    | undefined;
  if (result?.gated)
    throw new Error(`Grok model "${label}" is account-gated; required entitlement is unavailable.`);
  if (!result?.ok) {
    const availableHint = result?.available?.length
      ? ` Available: ${result.available.join(', ')}.`
      : '';
    throw new Error(`Unable to find Grok mode "${label}" unambiguously in menu.${availableHint}`);
  }
  const verifyDeadline = Date.now() + 2_000;
  let verified = false;
  let menuReopened = false;
  while (Date.now() < verifyDeadline) {
    const observed = await Runtime.evaluate({
      expression: `(() => {
        const entries = ${GROK_MODEL_MENU_ENTRIES_EXPRESSION};
        if (entries.length) return entries.filter(${matchExpression}).some(entry => entry.selected && entry.entitlement === 'available');
        return 'menu-closed';
      })()`,
      returnByValue: true,
    });
    if (observed.result?.value === 'menu-closed' && !menuReopened) {
      menuReopened = true;
      await openGrokModelMenu(Runtime, Input);
    }
    if (observed.result?.value === true) {
      verified = true;
      break;
    }
    await delay(100);
  }
  if (!verified)
    throw new Error(`Unable to verify selected Grok mode "${label}"; prompt was not submitted.`);
  logger(`Selected Grok mode: ${result.label ?? normalizedCandidates[0] ?? label}`);
  return result.label ?? normalizedCandidates[0] ?? label;
}

export interface GrokTextAssistantSnapshot extends GrokAssistantSnapshot {
  responseId: string;
  streaming: boolean;
  terminal: boolean;
  terminalEvidence: string;
}

export async function waitForGrokAssistantResponse(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
): Promise<string> {
  const result = await waitForGrokAssistantResult(Runtime, timeoutMs, logger);
  return result.text;
}

export async function waitForGrokAssistantResult(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
  options: {
    baseline?: {
      count: number;
      lastText: string;
      lastMarkdown: string;
      lastHtml: string;
      toastText?: string;
      responseId?: string;
    } | null;
    onResponseIncoming?: () => void;
    checkWarning?: () => Promise<void>;
    abortSignal?: AbortSignal;
  } = {},
): Promise<{ text: string; markdown: string; html?: string }> {
  const baseline = options.baseline ?? (await readAssistantSnapshot(Runtime));
  let lastSignature = baseline.lastMarkdown || baseline.lastText;
  let stableCount = 0;
  let responseIncomingNotified = false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    options.abortSignal?.throwIfAborted();
    await options.checkWarning?.();
    const current = await readAssistantSnapshot(Runtime);
    if (current.toastText && isGrokRateLimitToastText(current.toastText)) {
      throw new Error(current.toastText);
    }
    const currentSignature = current.lastMarkdown || current.lastText;
    const baselineSignature = baseline.lastMarkdown || baseline.lastText;
    const hasNewContent =
      current.count > baseline.count ||
      Boolean(current.responseId && current.responseId !== baseline.responseId) ||
      (!baselineSignature.trim() && currentSignature !== baselineSignature);

    if (hasNewContent && currentSignature.trim().length > 0) {
      if (!responseIncomingNotified) {
        responseIncomingNotified = true;
        options.onResponseIncoming?.();
      }
      if (currentSignature === lastSignature) {
        stableCount += 1;
      } else {
        stableCount = 0;
        lastSignature = currentSignature;
      }
      if (stableCount >= 2 && !current.streaming && current.terminal) {
        logger('Recovered assistant response');
        return {
          text: current.lastText,
          markdown: current.lastMarkdown || current.lastText,
          html: current.lastHtml || undefined,
        };
      }
    }
    await delay(500);
  }
  throw new BrowserAutomationError('Timed out waiting for Grok response with terminal evidence.', {
    stage: 'grok-response-observation',
    effectState: 'effect_observed',
  });
}

export async function uploadGrokAttachments(
  dom: ChromeClient['DOM'],
  runtime: ChromeClient['Runtime'],
  attachments: BrowserAttachment[],
  logger: BrowserLogger,
): Promise<void> {
  if (!attachments.length) return;
  const inputNode = await queryFileInputNode(dom);
  if (!inputNode.nodeId) {
    throw new Error('Unable to locate Grok file input.');
  }
  for (const attachment of attachments) {
    await dom.setFileInputFiles({ nodeId: inputNode.nodeId, files: [attachment.path] });
    const name = path.basename(attachment.displayPath ?? attachment.path);
    const appeared = await waitForAttachmentName(runtime, name);
    if (!appeared) {
      logger(`Attachment name not detected for ${attachment.displayPath}; proceeding anyway.`);
    }
  }
}

async function waitForAttachmentName(
  runtime: ChromeClient['Runtime'],
  name: string,
): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const outcome = await runtime.evaluate({
      expression: `(() => document.body?.innerText?.includes(${JSON.stringify(name)}) ?? false)()`,
      returnByValue: true,
    });
    if (outcome.result?.value) return true;
    await delay(250);
  }
  return false;
}

export function buildGrokAssistantSnapshotExpressionForTest(): string {
  return buildGrokAssistantSnapshotExpression();
}

export async function readGrokAssistantSnapshotForRuntime(
  Runtime: ChromeClient['Runtime'],
): Promise<GrokTextAssistantSnapshot> {
  return readAssistantSnapshot(Runtime);
}

function buildGrokAssistantSnapshotExpression(): string {
  return `(() => {
      const bubbles = ${buildFindAllSelectorsExpression(GROK_ASSISTANT_BUBBLE_SELECTORS)};
      const assistant = ${buildFindAllSelectorsExpression(GROK_ASSISTANT_ROLE_SELECTORS)};
      const candidates = assistant.length > 0
        ? assistant
        : bubbles.filter((b) => !b.className.includes('bg-surface-l1'));
      const last = candidates[candidates.length - 1];
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const readToastText = () => {
        const selectors = [
          '[role="alert"]',
          '[role="status"]',
          '[data-sonner-toast]',
          '[data-toast]',
          '[data-radix-toast-viewport] *',
        ];
        const values = selectors
          .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
          .filter((node) => isVisible(node))
          .map((node) => normalizeText(node.textContent || ''))
          .filter(Boolean)
          .filter((text) => /query limit|too many requests|rate limit|request limit|try again in\\s+\\d+/i.test(text));
        return values[values.length - 1] || '';
      };
      const normalizeText = (value) =>
        String(value || '')
          .replace(/\\u200b/g, '')
          .replace(/\\r\\n/g, '\\n')
          .replace(/\\n{3,}/g, '\\n\\n')
          .trim();
      if (!last) return { count: candidates.length, lastText: '', lastMarkdown: '', lastHtml: '', toastText: readToastText(), responseId: '', streaming: false, terminal: false, terminalEvidence: '' };
      const responseRoot = last.closest('[id^="response-"]') || last;
      const responseId = responseRoot.getAttribute('id') || last.getAttribute('data-message-id') || '';
      const stopVisible = Array.from(document.querySelectorAll('button[aria-label*="Stop"], button[aria-label*="stop"], button[data-testid="stop-button"]')).some(isVisible);
      const streaming = stopVisible || responseRoot.getAttribute('aria-busy') === 'true' ||
        responseRoot.getAttribute('data-is-streaming') === 'true' ||
        Array.from(responseRoot.querySelectorAll('[data-is-streaming="true"], [data-state="streaming"]')).some(isVisible);
      const explicitComplete = responseRoot.getAttribute('data-state') === 'complete' || responseRoot.getAttribute('data-is-streaming') === 'false';
      const actionGroup = responseRoot.querySelector('.action-buttons');
      const terminalActions = actionGroup && isVisible(actionGroup) &&
        Array.from(actionGroup.querySelectorAll('button[aria-label*="Copy"], button[title*="Copy"], button[aria-label*="Regenerate"]')).some(isVisible);
      const terminalEvidence = !streaming && explicitComplete ? 'response-complete-state' : !streaming && terminalActions ? 'response-terminal-actions' : '';
      const completion = { responseId, streaming, terminal: Boolean(terminalEvidence), terminalEvidence };
      const normalizeInlineWhitespace = (value) => String(value || '').replace(/\\s+/g, ' ');
      const collapseInline = (value) => normalizeText(normalizeInlineWhitespace(value));
      const normalizeCode = (value) => String(value || '').replace(/\\u200b/g, '').replace(/\\r\\n/g, '\\n').replace(/\\n$/, '');
      const markdownRoot =
        last.querySelector('.response-content-markdown') ||
        last.querySelector('[class*="response-content-markdown"]') ||
        Array.from(last.querySelectorAll('.markdown')).find((node) =>
          !node.closest('.thinking-container') && !node.closest('.action-buttons'),
        );

      const isExcluded = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.tagName === 'BUTTON') return true;
        const testId = (node.getAttribute('data-testid') || '').toLowerCase();
        const className = (node.className || '').toString().toLowerCase();
        if (
          testId.includes('follow-up') ||
          testId.includes('suggest') ||
          testId.includes('thinking') ||
          className.includes('thinking-container') ||
          className.includes('action-buttons') ||
          className.includes('sticky')
        ) {
          return true;
        }
        return false;
      };

      const cleanPlainText = (root) => {
        if (!(root instanceof HTMLElement)) return '';
        const clone = root.cloneNode(true);
        clone.querySelectorAll('*').forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (isExcluded(node)) {
            node.remove();
            return;
          }
          if ((node.getAttribute('data-testid') || '').toLowerCase() === 'code-block') {
            const codeNode = Array.from(node.querySelectorAll('code')).find((candidate) =>
              !candidate.closest('button'),
            );
            const replacement = document.createElement('div');
            replacement.textContent = normalizeCode(codeNode?.textContent || '');
            node.replaceWith(replacement);
          }
        });
        return normalizeText(clone.textContent || '');
      };

      const inlineText = (node) => {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent || '';
        }
        if (!(node instanceof HTMLElement)) {
          return '';
        }
        if (isExcluded(node)) return '';
        if ((node.getAttribute('data-testid') || '').toLowerCase() === 'code-block') {
          const codeNode = Array.from(node.querySelectorAll('code')).find((candidate) => !candidate.closest('button'));
          return normalizeCode(codeNode?.textContent || '');
        }
        if (node.tagName === 'BR') {
          return '\\n';
        }
        if (node.tagName === 'CODE' && !node.closest('[data-testid="code-block"]')) {
          return \`\\\`\${collapseInline(node.textContent || '')}\\\`\`;
        }
        return Array.from(node.childNodes).map((child) => inlineText(child)).join('');
      };

      const serializeListItem = (node, depth, ordered, index) => {
        const indent = '  '.repeat(depth);
        const marker = ordered ? \`\${index + 1}. \` : '- ';
        const bodyParts = [];
        const nestedParts = [];
        for (const child of Array.from(node.childNodes)) {
          if (child instanceof HTMLElement && (child.tagName === 'UL' || child.tagName === 'OL')) {
            const nested = serializeBlock(child, depth + 1);
            if (nested) nestedParts.push(nested);
            continue;
          }
          const value = inlineText(child);
          if (value) bodyParts.push(value);
        }
        const body = collapseInline(bodyParts.join(''));
        const firstLine = \`\${indent}\${marker}\${body}\`.trimEnd();
        return [firstLine, ...nestedParts].filter(Boolean).join('\\n');
      };

      const serializeCodeBlock = (node) => {
        const languageNode = node.querySelector('span.font-mono');
        const language = collapseInline(languageNode?.textContent || '');
        const codeNode = Array.from(node.querySelectorAll('code')).find((candidate) => !candidate.closest('button'));
        const code = normalizeCode(codeNode?.textContent || '');
        if (!code) return '';
        return \`\\\`\\\`\\\`\${language}\\n\${code}\\n\\\`\\\`\\\`\`;
      };

      const serializeBlock = (node, depth = 0) => {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) {
          return collapseInline(node.textContent || '');
        }
        if (!(node instanceof HTMLElement)) return '';
        if (isExcluded(node)) return '';
        const testId = (node.getAttribute('data-testid') || '').toLowerCase();
        if (testId === 'code-block') {
          return serializeCodeBlock(node);
        }
        const tag = node.tagName;
        if (tag === 'UL' || tag === 'OL') {
          const ordered = tag === 'OL';
          return Array.from(node.children)
            .filter((child) => child.tagName === 'LI')
            .map((child, index) => serializeListItem(child, depth, ordered, index))
            .filter(Boolean)
            .join('\\n');
        }
        if (tag === 'LI') {
          return serializeListItem(node, depth, false, 0);
        }
        if (/^H[1-6]$/.test(tag)) {
          const level = Number(tag.slice(1));
          return \`\${'#'.repeat(level)} \${collapseInline(inlineText(node))}\`.trim();
        }
        if (tag === 'P') {
          return collapseInline(inlineText(node));
        }
        if (tag === 'BLOCKQUOTE') {
          return normalizeText(inlineText(node))
            .split('\\n')
            .map((line) => \`> \${line}\`.trimEnd())
            .join('\\n');
        }
        if (tag === 'PRE') {
          const codeNode = node.querySelector('code');
          const code = normalizeCode(codeNode?.textContent || node.textContent || '');
          return code ? \`\\\`\\\`\\\`\\n\${code}\\n\\\`\\\`\\\`\` : '';
        }
        const directChildren = Array.from(node.children).filter((child) => !isExcluded(child));
        if (directChildren.length === 0) {
          return collapseInline(inlineText(node));
        }
        const nestedBlocks = directChildren
          .map((child) => serializeBlock(child, depth))
          .filter(Boolean);
        if (nestedBlocks.length > 0) {
          return nestedBlocks.join('\\n\\n');
        }
        return collapseInline(inlineText(node));
      };

      if (markdownRoot) {
        const markdown = normalizeText(
          Array.from(markdownRoot.children).map((child) => serializeBlock(child)).filter(Boolean).join('\\n\\n') ||
            serializeBlock(markdownRoot),
        );
        const text = cleanPlainText(markdownRoot);
        return {
          ...completion,
          count: candidates.length,
          lastText: text || markdown,
          lastMarkdown: markdown || text,
          lastHtml: markdownRoot.innerHTML || '',
          toastText: readToastText(),
        };
      }

      const clone = last.cloneNode(true);
      const removableSelectors = [
        '.thinking-container',
        '.action-buttons',
        '[data-testid*="follow-up"]',
        '[data-testid*="suggest"]',
      ];
      for (const selector of removableSelectors) {
        clone.querySelectorAll(selector).forEach((node) => node.remove());
      }
      clone.querySelectorAll('*').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const className = (node.className || '').toString().toLowerCase();
        const ariaLabel = (node.getAttribute('aria-label') || '').toLowerCase();
        if (
          node.tagName === 'BUTTON' ||
          className.includes('action-buttons') ||
          className.includes('suggest') ||
          ariaLabel.includes('suggest')
        ) {
          node.remove();
        }
      });

      const fallbackText = normalizeText(clone.textContent || '');
      return {
        ...completion,
        count: candidates.length,
        lastText: fallbackText,
        lastMarkdown: fallbackText,
        lastHtml: '',
        toastText: readToastText(),
      };
    })()`;
}

async function readAssistantSnapshot(
  Runtime: ChromeClient['Runtime'],
): Promise<GrokTextAssistantSnapshot> {
  const outcome = await Runtime.evaluate({
    expression: buildGrokAssistantSnapshotExpression(),
    returnByValue: true,
  });
  return {
    count: outcome.result?.value?.count ?? 0,
    lastText: outcome.result?.value?.lastText ?? '',
    lastMarkdown: outcome.result?.value?.lastMarkdown ?? '',
    lastHtml: outcome.result?.value?.lastHtml ?? '',
    toastText: outcome.result?.value?.toastText ?? '',
    responseId: outcome.result?.value?.responseId ?? '',
    streaming: outcome.result?.value?.streaming === true,
    terminal: outcome.result?.value?.terminal === true,
    terminalEvidence: outcome.result?.value?.terminalEvidence ?? '',
  };
}

async function _waitForDocumentReady(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (result?.value === 'complete' || result?.value === 'interactive') {
      return;
    }
    await delay(200);
  }
  throw new Error('Page did not reach ready state in time');
}

async function readLocationHref(Runtime: ChromeClient['Runtime']): Promise<string> {
  const { result } = await Runtime.evaluate({
    expression: 'location.href',
    returnByValue: true,
  });
  return typeof result?.value === 'string' ? result.value : '';
}

async function queryFileInputNode(dom: ChromeClient['DOM']) {
  const documentNode = await dom.getDocument();
  for (const selector of GROK_PROVIDER.selectors.fileInput) {
    const match = await dom.querySelector({
      nodeId: documentNode.root.nodeId,
      selector,
    });
    if (match.nodeId) {
      return match;
    }
  }
  return { nodeId: 0 };
}

async function openGrokModelMenu(
  Runtime: ChromeClient['Runtime'],
  _Input: ChromeClient['Input'],
): Promise<boolean> {
  const existing = await Runtime.evaluate({
    expression: `Boolean(${GROK_MODEL_MENU_ENTRIES_EXPRESSION}.length)`,
    returnByValue: true,
  });
  if (existing.result?.value) return true;
  const clicked = await Runtime.evaluate({
    expression: `(() => {
      const buttons = [...new Set(${GROK_MODEL_BUTTON_SELECTORS}.flatMap(selector => Array.from(document.querySelectorAll(selector))))]
        .filter(node => node instanceof HTMLElement && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0 && window.getComputedStyle(node).display !== 'none' && window.getComputedStyle(node).visibility !== 'hidden' && !node.closest('[role="dialog"], [aria-hidden="true"]'));
      if (buttons.length !== 1) return false;
      buttons[0].click();
      return true;
    })()`,
    returnByValue: true,
  });
  if (!clicked.result?.value) return false;
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const observed = await Runtime.evaluate({
      expression: `Boolean(${GROK_MODEL_MENU_ENTRIES_EXPRESSION}.length)`,
      returnByValue: true,
    });
    if (observed.result?.value) return true;
    await delay(100);
  }
  return false;
}

async function pressKey(Input: ChromeClient['Input'], key: string, code: string): Promise<void> {
  await Input.dispatchKeyEvent({ type: 'keyDown', key, code });
  await Input.dispatchKeyEvent({ type: 'keyUp', key, code });
}
