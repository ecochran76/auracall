import { dismissOpenMenus, pressButton } from "../service/ui.js";
import type { ChromeClient } from "../types.js";

export interface ChatgptEcosystemMentionRequest {
	label: string;
	acceptedPluginIds: string[];
}

export interface ChatgptEcosystemMentionSelection {
	label: string | null;
	pluginId: string | null;
}

export async function readChatgptEcosystemMention(
	client: ChromeClient,
): Promise<ChatgptEcosystemMentionSelection | null> {
	const result = await client.Runtime.evaluate({
		expression: `(() => {
      const pills = Array.from(document.querySelectorAll('#prompt-textarea [data-inline-selection-pill]'));
      const ecosystem = pills.filter((pill) => pill.getAttribute('data-symbol') === 'ecosystemMention');
      const documents = pills.filter((pill) => pill.getAttribute('data-symbol') === 'documentReference');
      if (ecosystem.length !== 1 || documents.length !== 0) return null;
      const pill = ecosystem[0];
      return {
        label: String(pill.textContent || '').replace(/\\s+/g, ' ').trim() || null,
        pluginId: pill.getAttribute('data-system-hint-type') || pill.getAttribute('data-id') || null,
      };
    })()`,
		returnByValue: true,
	});
	return isRecord(result.result?.value)
		? {
				label: readString(result.result.value.label),
				pluginId: readString(result.result.value.pluginId),
			}
		: null;
}

export async function ensureChatgptEcosystemMention(
	client: ChromeClient,
	request: ChatgptEcosystemMentionRequest,
): Promise<void> {
	const acceptedPluginIds = request.acceptedPluginIds.map(normalizeAppIdentity).filter(Boolean);
	if (!request.label.trim() || acceptedPluginIds.length === 0) {
		throw new Error("ChatGPT ecosystem mention requires a label and at least one app identity.");
	}
	const pristine = await client.Runtime.evaluate({
		expression: `(() => {
      const editor = document.querySelector('#prompt-textarea[contenteditable="true"]');
      if (!editor) return false;
      const text = String(editor.innerText || '').trim();
      const pills = editor.querySelectorAll('[data-inline-selection-pill]');
      const turns = document.querySelectorAll('[data-message-author-role="user"], [data-message-author-role="assistant"]');
      return text.length === 0 && pills.length === 0 && turns.length === 0;
    })()`,
		returnByValue: true,
	});
	if (pristine.result?.value !== true) {
		throw new Error(
			`ChatGPT developer app ${request.label} requires a fresh empty pill-free composer before selection.`,
		);
	}

	await dismissOpenMenus(client.Runtime);
	const focused = await pressButton(client.Runtime, {
		selector: '#prompt-textarea[contenteditable="true"]',
		interactionStrategies: ["pointer"],
		requireVisible: true,
		timeoutMs: 5_000,
	});
	if (!focused.ok) {
		throw new Error("Unable to focus the blank ChatGPT composer for app selection.");
	}
	await client.Runtime.evaluate({
		expression: `(() => {
      const editor = document.querySelector('#prompt-textarea[contenteditable="true"]');
      if (!editor) return false;
      editor.focus();
      const selection = document.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return true;
    })()`,
		returnByValue: true,
	});
	await client.Input.insertText({ text: `@${request.label}` });
	const selected = await pressButton(client.Runtime, {
		selector: ".popover .__menu-item[tabindex]",
		interactionStrategies: ["pointer"],
		requireVisible: true,
		postSelector: '#prompt-textarea [data-inline-selection-pill][data-symbol="ecosystemMention"]',
		timeoutMs: 8_000,
	});
	const mention = await readChatgptEcosystemMention(client);
	if (
		!selected.ok ||
		!normalize(selected.matchedLabel).includes(normalize(request.label)) ||
		!mention ||
		!acceptedPluginIds.includes(normalizeAppIdentity(mention.pluginId))
	) {
		const diagnostic = await readMentionPickerDiagnostic(client);
		throw new Error(
			`Unable to select ChatGPT developer app ${request.label} from the composer mention picker: ${selected.reason ?? "exact app pill not verified"} (${diagnostic}).`,
		);
	}
}

function normalizeAppIdentity(value: string | null | undefined): string {
	return normalize(value)
		.replace(/^plugin:/, "")
		.replace(/^plugin_/, "");
}

function normalize(value: string | null | undefined): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function readMentionPickerDiagnostic(client: ChromeClient): Promise<string> {
	const result = await client.Runtime.evaluate({
		expression: `JSON.stringify({
      url: location.href,
      editorText: document.querySelector('#prompt-textarea')?.innerText || '',
      activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
      popovers: Array.from(document.querySelectorAll('.popover,[role="listbox"],[role="menu"]'))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((node) => String(node.textContent || '').trim().slice(0, 240)),
    })`,
		returnByValue: true,
	});
	return readString(result.result?.value) ?? "no composer diagnostic available";
}
