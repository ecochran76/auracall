import type { ChromeClient } from "../types.js";
import { GROK_PROVIDER } from "./grok.js";

/** A Build submission starts only on the observed root composer, preserving drafts
 * and existing conversations. These selectors are the shared Grok text surface. */
export async function hasEmptyGrokBuildRoot(runtime: ChromeClient["Runtime"]): Promise<boolean> {
	const result = await runtime.evaluate({
		expression: `(() => {
    const url = new URL(location.href);
    if (url.origin !== 'https://grok.com' || url.pathname !== '/') return false;
    const visible = el => el instanceof HTMLElement && !el.closest('[role="dialog"], [aria-hidden="true"]') && !el.hasAttribute('disabled') &&
      window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const editors = [...new Set(${JSON.stringify(GROK_PROVIDER.selectors.input)}.flatMap(selector => Array.from(document.querySelectorAll(selector))))].filter(visible);
    if (editors.length !== 1) return false;
    const editor = editors[0];
    if (String(editor.value ?? editor.textContent ?? '').trim() || editor.querySelectorAll('[contenteditable="false"]').length) return false;
    const form = editor.closest('form') || editor.parentElement;
    return Boolean(form) && !form.querySelectorAll('[data-file-id], [data-attachment-id]').length;
  })()`,
		returnByValue: true,
	});
	if (result.exceptionDetails) throw new Error("grok_build_composer_read_failed");
	return result.result?.value === true;
}
export async function readGrokBuildResponseIdentity(
	runtime: ChromeClient["Runtime"],
	responseId: string,
): Promise<{ conversationId: string; conversationUrl: string } | null> {
	const result = await runtime.evaluate({
		expression: `(() => {
    const url = new URL(location.href);
    if (url.origin !== 'https://grok.com') return null;
    const conversationId = /^\\/c\\/([^/?#]+)\\/?$/.exec(url.pathname)?.[1];
    const responses = Array.from(document.querySelectorAll('[id]')).filter(node => node.getAttribute('id') === ${JSON.stringify(responseId)});
    if (!conversationId || responses.length !== 1) return null;
    return {conversationId, conversationUrl:url.origin + url.pathname};
  })()`,
		returnByValue: true,
	});
	if (result.exceptionDetails) throw new Error("grok_build_response_read_failed");
	return result.result?.value ?? null;
}
