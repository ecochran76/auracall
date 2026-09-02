import { createHash } from "node:crypto";

import type { DevToolsConnectionOptions } from "../../../packages/browser-service/src/types.js";
import type {
	ChatgptSkill,
	ChatgptSkillMutationOutcome,
	ChatgptSkillSource,
	ChatgptSkillState,
} from "../../cli/chatgptSkillsCommand.js";
import type { ResolvedUserConfig } from "../../config.js";
import {
	navigateAndSettle,
	pressButtonWithTrustedPointer,
	reloadAndSettle,
	setInputValue,
	waitForPredicate,
} from "../service/ui.js";
import type { ChromeClient } from "../types.js";
import { classifyChatgptBlockingSurfaceProbe } from "./chatgptAdapter.js";

type SkillIdentity = {
	email?: string | null;
	accountPlanType?: string | null;
	accountLevel?: string | null;
};

export interface ChatgptSkillInventoryProbe {
	complete: boolean;
	entries: Array<{
		id: string;
		name: string;
		collection?: string | null;
		reviewStatus?: string | null;
	}>;
}

export interface ChatgptSkillDetailProbe {
	id: string;
	name: string;
	owner?: string | null;
	description?: string | null;
	filePaths?: string[];
	instructions?: string | null;
}

export interface ChatgptSkillBrowserClient {
	readonly userConfig: ResolvedUserConfig;
	getUserIdentity(options?: { abortSignal?: AbortSignal }): Promise<SkillIdentity | null>;
	connectDevTools(options?: DevToolsConnectionOptions): Promise<{ client: ChromeClient; port: number }>;
}

export function hashChatgptSkillInstructions(value: string): string {
	return createHash("sha256").update(normalizeInstructions(value), "utf8").digest("hex");
}

export function normalizeInstructions(value: string): string {
	return `${String(value).replace(/\r\n?/g, "\n").trimEnd()}\n`;
}

export function joinChatgptCodeMirrorLines(lines: string[]): string {
	return lines.join("\n");
}

export function readChatgptSkillIdFromUrl(value: string): string | null {
	try {
		const url = new URL(value);
		if (url.origin !== "https://chatgpt.com") return null;
		const editorMatch = url.pathname.match(/^\/skills\/editor\/([a-f0-9]{32})$/i);
		const id =
			url.pathname === "/skills"
				? (url.searchParams.get("skill_id")?.toLowerCase() ?? "")
				: (editorMatch?.[1]?.toLowerCase() ?? "");
		return /^[a-f0-9]{32}$/.test(id) ? id : null;
	} catch {
		return null;
	}
}

export function deriveChatgptSkillState(input: {
	identity: SkillIdentity | null;
	inventory: ChatgptSkillInventoryProbe;
	observedAt: string;
}): ChatgptSkillState {
	const seen = new Set<string>();
	const skills = input.inventory.entries
		.map((entry): ChatgptSkill | null => {
			const id = entry.id.trim().toLowerCase();
			const name = entry.name.trim();
			if (!/^[a-f0-9]{32}$/.test(id) || !name || seen.has(id)) return null;
			seen.add(id);
			const collection = normalizeCollection(entry.collection);
			return {
				id,
				name,
				collection,
				reviewStatus: normalizeReviewStatus(entry.reviewStatus),
				owner: null,
				description: null,
				files: [],
				contentHash: null,
			};
		})
		.filter((skill): skill is ChatgptSkill => skill !== null);
	return {
		account: {
			email: readString(input.identity?.email),
			plan: readString(input.identity?.accountPlanType ?? input.identity?.accountLevel),
		},
		inventoryComplete: input.inventory.complete === true,
		skills,
		observedAt: input.observedAt,
	};
}

export function normalizeChatgptSkillInventoryPayloads(input: {
	installed: unknown;
	created: unknown;
}): ChatgptSkillInventoryProbe {
	const installed = readHazelnuts(input.installed);
	const created = readHazelnuts(input.created);
	if (!installed || !created) return { complete: false, entries: [] };
	const entries = new Map<string, ChatgptSkillInventoryProbe["entries"][number]>();
	for (const [collection, values] of [
		["installed", installed],
		["created-by-me", created],
	] as const) {
		for (const value of values) {
			if (!isRecord(value)) continue;
			const id = readString(value.id)?.toLowerCase() ?? "";
			const name = readString(value.display_name) ?? readString(value.name) ?? "";
			if (!/^[a-f0-9]{32}$/.test(id) || !name) continue;
			const safetyStatus = readString(value.safety_check_status)?.toLowerCase();
			entries.set(id, {
				id,
				name,
				collection,
				reviewStatus:
					safetyStatus === "unchecked"
						? "Needs review"
						: safetyStatus === "ready"
							? "Ready"
							: null,
			});
		}
	}
	return { complete: true, entries: [...entries.values()] };
}

export function deriveChatgptSkillDetail(input: ChatgptSkillDetailProbe): ChatgptSkill {
	const instructions = readNonEmptyText(input.instructions);
	const contentHash = instructions ? hashChatgptSkillInstructions(instructions) : null;
	const paths = [...new Set((input.filePaths ?? []).map((path) => path.trim()).filter(Boolean))];
	return {
		id: input.id.trim().toLowerCase(),
		name: input.name.trim(),
		collection: "unknown",
		reviewStatus: "unknown",
		owner: readString(input.owner),
		description: readString(input.description),
		files: paths.map((path) => ({
			path,
			sha256: path.toLowerCase() === "skill.md" ? contentHash : null,
		})),
		contentHash,
	};
}

export class ChatgptSkillBrowserAdapter {
	private cdpClient: ChromeClient | null = null;
	private originalUrl: string | null = null;
	private restoreOriginalUrl = true;

	constructor(
		private readonly browser: ChatgptSkillBrowserClient,
		private readonly abortSignal?: AbortSignal,
	) {}

	async readState(): Promise<ChatgptSkillState> {
		this.throwIfAborted();
		const identity = await this.browser.getUserIdentity({ abortSignal: this.abortSignal });
		const client = await this.ensureClient();
		const inventory = await captureSkillInventory(client);
		return deriveChatgptSkillState({ identity, inventory, observedAt: new Date().toISOString() });
	}

	async readSkill(id: string): Promise<ChatgptSkill | null> {
		if (!/^[a-f0-9]{32}$/.test(id)) return null;
		const client = await this.ensureClient();
		await navigateSkills(client, `https://chatgpt.com/skills/editor/${id}`);
		await assertNoBlockingSurface(client, `read skill ${id}`);
		await waitForEditor(client, id);
		const probe = await readEditorProbe(client, id);
		return probe ? deriveChatgptSkillDetail(probe) : null;
	}

	async create(source: ChatgptSkillSource): Promise<ChatgptSkillMutationOutcome> {
		const client = await this.ensureClient();
		await navigateSkills(client, "https://chatgpt.com/skills");
		await assertNoBlockingSurface(client, "create skill");
		const opened = await pressButtonWithTrustedPointer(client, {
			selector: 'button[aria-label="Create"]',
			requireVisible: true,
			timeoutMs: 8_000,
		});
		const menu = await waitForPredicate(
			client.Runtime,
			`Boolean(document.querySelector('[role="menu"][aria-label="Create skill menu"]'))`,
			{ timeoutMs: 2_000, description: "ChatGPT Skill Create menu" },
		);
		if (!menu.ok) {
			throw new Error(`Unable to open ChatGPT skill Create menu: ${opened.reason}.`);
		}
		const editor = await pressButtonWithTrustedPointer(client, {
			rootSelectors: ['[role="menu"][aria-label="Create skill menu"]'],
			match: { exact: ["create with editor"] },
			requireVisible: true,
			timeoutMs: 8_000,
		});
		if (!editor.ok && !editor.matchedLabel) {
			throw new Error(`Unable to open ChatGPT skill editor: ${editor.reason}.`);
		}
		await waitForEditor(client, null);
		await setEditorSource(client, source);
		const outcome = await submitEditor(client, source, "create");
		if (outcome.status !== "completed") this.restoreOriginalUrl = false;
		return outcome;
	}

	async update(skill: ChatgptSkill, source: ChatgptSkillSource): Promise<ChatgptSkillMutationOutcome> {
		const client = await this.ensureClient();
		await navigateSkills(client, `https://chatgpt.com/skills/editor/${skill.id}`);
		await assertNoBlockingSurface(client, `update skill ${skill.id}`);
		await waitForEditor(client, skill.id);
		await setEditorSource(client, source);
		const outcome = await submitEditor(client, source, "update", skill.id);
		if (outcome.status !== "completed") this.restoreOriginalUrl = false;
		return outcome;
	}

	async delete(skill: ChatgptSkill): Promise<ChatgptSkillMutationOutcome> {
		const client = await this.ensureClient();
		const inventory = await captureSkillInventory(client);
		const createdMatches = inventory.entries.filter(
			(entry) => entry.collection === "created-by-me" && entry.name === skill.name,
		);
		if (!inventory.complete || createdMatches.length !== 1 || createdMatches[0]?.id !== skill.id) {
			throw new Error(
				`ChatGPT skill ${skill.id} could not be bound to one exact Created by me card before delete.`,
			);
		}
		await assertNoBlockingSurface(client, `delete skill ${skill.id}`);
		const cardTriggerSelector = await markCreatedSkillCardAction(client, skill.name);
		const opened = await pressButtonWithTrustedPointer(client, {
			selector: cardTriggerSelector,
			requireVisible: true,
			postSelector: '[role="menu"]',
			timeoutMs: 8_000,
		});
		if (!opened.ok && !opened.matchedLabel) {
			throw new Error(`ChatGPT skill ${skill.id} did not expose its exact action menu.`);
		}
		const selected = await pressButtonWithTrustedPointer(client, {
			rootSelectors: ['[role="menu"]'],
			match: { exact: ["delete"] },
			requireVisible: true,
			timeoutMs: 8_000,
		});
		if (!selected.ok && !selected.matchedLabel) {
			throw new Error(`ChatGPT skill ${skill.id} did not expose one exact Delete action.`);
		}
		const confirmed = await pressButtonWithTrustedPointer(client, {
			rootSelectors: ['[role="dialog"]'],
			match: { exact: ["delete"] },
			requireVisible: true,
			timeoutMs: 8_000,
		});
		if (!confirmed.ok && !confirmed.matchedLabel) {
			throw new Error(`Unable to confirm exact deletion of ChatGPT skill ${skill.id}.`);
		}
		const absent = await waitForPredicate(
			client.Runtime,
			`(() => { const url = new URL(location.href); return url.searchParams.get('skill_id') !== ${JSON.stringify(skill.id)} && url.pathname !== ${JSON.stringify(`/skills/editor/${skill.id}`)}; })()`,
			{ timeoutMs: 15_000, description: `skill ${skill.id} delete navigation` },
		);
		const outcome: ChatgptSkillMutationOutcome = absent.ok
			? { status: "completed", message: `${skill.id} delete submitted.`, skillId: skill.id }
			: {
					status: "outcome-unknown",
					message: `${skill.id} delete was dispatched but the provider postcondition was not observed; do not retry.`,
					skillId: skill.id,
			  };
		if (
			outcome.status !== "completed" ||
			(this.originalUrl && readChatgptSkillIdFromUrl(this.originalUrl) === skill.id)
		) {
			this.restoreOriginalUrl = false;
		}
		return outcome;
	}

	async close(): Promise<void> {
		const client = this.cdpClient;
		this.cdpClient = null;
		if (client && this.restoreOriginalUrl && this.originalUrl?.startsWith("https://chatgpt.com/")) {
			const currentUrl = await readCurrentUrl(client).catch(() => null);
			if (currentUrl !== this.originalUrl) {
				await navigateSkills(client, this.originalUrl).catch(() => undefined);
			}
		}
		await client?.close().catch(() => undefined);
	}

	private async ensureClient(): Promise<ChromeClient> {
		this.throwIfAborted();
		if (this.cdpClient) return this.cdpClient;
		const connected = await this.browser.connectDevTools({
			abortSignal: this.abortSignal,
			stageTimeoutMs: 10_000,
		});
		this.cdpClient = connected.client;
		await this.cdpClient.Runtime.enable();
		await this.cdpClient.Page.enable();
		this.originalUrl = await readCurrentUrl(this.cdpClient);
		return this.cdpClient;
	}

	private throwIfAborted(): void {
		this.abortSignal?.throwIfAborted();
	}
}

export function createChatgptSkillBrowserAdapter(
	browser: ChatgptSkillBrowserClient,
	options: { abortSignal?: AbortSignal } = {},
): ChatgptSkillBrowserAdapter {
	return new ChatgptSkillBrowserAdapter(browser, options.abortSignal);
}

async function navigateSkills(client: ChromeClient, url: string): Promise<void> {
	const settled = await navigateAndSettle(client, {
		url,
		timeoutMs: 12_000,
		mutationSource: "chatgpt-skills:navigate",
	});
	if (!settled.ok) throw new Error(`ChatGPT Skill navigation did not settle: ${settled.reason}.`);
}

async function captureSkillInventory(client: ChromeClient): Promise<ChatgptSkillInventoryProbe> {
	await client.Network.enable();
	const payloadPromise = new Promise<{ installed: unknown; created: unknown }>((resolve) => {
		const requestScopes = new Map<string, "installed" | "created">();
		const payloads: { installed: unknown; created: unknown } = {
			installed: null,
			created: null,
		};
		let settled = false;
		const finish = () => {
			if (settled || payloads.installed === null || payloads.created === null) return;
			settled = true;
			clearTimeout(timer);
			resolve(payloads);
		};
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			resolve(payloads);
		}, 12_000);
		client.Network.responseReceived((params) => {
			if (
				settled ||
				params.response.status < 200 ||
				params.response.status >= 300 ||
				!params.response.url.includes("/backend-api/hazelnuts")
			) {
				return;
			}
			const scope = new URL(params.response.url).searchParams.get("scope");
			if (scope === "installed" || scope === "created") {
				requestScopes.set(params.requestId, scope);
			}
		});
		client.Network.loadingFinished(async (params) => {
			if (settled) return;
			const scope = requestScopes.get(params.requestId);
			if (!scope) return;
			const response = await client.Network.getResponseBody({ requestId: params.requestId }).catch(
				() => null,
			);
			if (!response?.body) return;
			try {
				const body = response.base64Encoded
					? Buffer.from(response.body, "base64").toString("utf8")
					: response.body;
				payloads[scope] = JSON.parse(body) as unknown;
				finish();
			} catch {
				// Keep waiting for another successful response for this exact scope.
			}
		});
	});
	const currentUrl = await readCurrentUrl(client);
	const parsedCurrentUrl = currentUrl ? new URL(currentUrl) : null;
	if (
		parsedCurrentUrl?.origin === "https://chatgpt.com" &&
		parsedCurrentUrl.pathname === "/skills" &&
		!parsedCurrentUrl.searchParams.has("skill_id")
	) {
		const reloaded = await reloadAndSettle(client, {
			ignoreCache: true,
			timeoutMs: 10_000,
			mutationSource: "chatgpt-skills:inventory-reload",
		});
		if (!reloaded.ok) {
			throw new Error(`ChatGPT Skill inventory reload did not settle: ${reloaded.reason}.`);
		}
	} else {
		await navigateSkills(client, "https://chatgpt.com/skills");
	}
	return normalizeChatgptSkillInventoryPayloads(await payloadPromise);
}

async function readEditorProbe(
	client: ChromeClient,
	id: string,
): Promise<ChatgptSkillDetailProbe | null> {
	const result = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const route = location.pathname.match(/^\\/skills\\/editor\\/([a-f0-9]{32})$/i);
      const routeId = route?.[1]?.toLowerCase() || '';
      if (routeId !== ${JSON.stringify(id)}) return null;
      const name = document.querySelector('input[id$="-name"]')?.value || '';
      const description = document.querySelector('textarea[id$="-description"]')?.value || '';
      const editor = document.querySelector('.cm-content');
	  const editorLines = editor ? Array.from(editor.querySelectorAll('.cm-line')).map((line) => line.textContent || '') : [];
	  const instructions = editor ? editorLines.join('\n') : null;
      return { id: routeId, name: normalize(name), owner: null, description: normalize(description) || null, filePaths: ['SKILL.md'], instructions };
    })()`,
		returnByValue: true,
	});
	const value = isRecord(result.result?.value) ? result.result.value : null;
	if (!value) return null;
	return {
		id: readString(value.id) ?? "",
		name: readString(value.name) ?? "",
		owner: readString(value.owner),
		description: readString(value.description),
		filePaths: readStringArray(value.filePaths),
		instructions: readNonEmptyText(value.instructions),
	};
}

async function markCreatedSkillCardAction(client: ChromeClient, name: string): Promise<string> {
	const marker = `chatgpt-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const marked = await waitForPredicate(
		client.Runtime,
		`(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const sections = Array.from(document.querySelectorAll('section')).filter((section) =>
        Array.from(section.querySelectorAll('h1,h2,h3,[role="heading"]')).some((heading) => normalize(heading.textContent).toLowerCase() === 'created by me')
      );
      if (sections.length !== 1) return false;
      const cards = Array.from(sections[0].querySelectorAll('article[role="button"]')).filter((card) =>
        String(card.innerText || '').split('\\n')[0].trim() === ${JSON.stringify(name)}
      );
      if (cards.length !== 1) return false;
      const trigger = cards[0].querySelector('button[aria-label="More actions"]');
      if (!(trigger instanceof HTMLElement)) return false;
      trigger.setAttribute('data-auracall-skill-action', ${JSON.stringify(marker)});
      return true;
    })()`,
		{ timeoutMs: 12_000, description: `Created by me card for ${name}` },
	);
	if (!marked.ok) {
		throw new Error(`ChatGPT skill ${name} did not expose one exact Created by me card.`);
	}
	return `button[data-auracall-skill-action="${marker}"]`;
}

async function waitForEditor(client: ChromeClient, id: string | null): Promise<void> {
	const ready = await waitForPredicate(
		client.Runtime,
		`location.origin === 'https://chatgpt.com' && (location.pathname === '/skills/editor' || /^\\/skills\\/editor\\/[a-f0-9]{32}$/.test(location.pathname)) && Boolean(document.querySelector('.cm-content[contenteditable="true"]')) && ${
			id
				? `(new URL(location.href).searchParams.get('skill_id') === ${JSON.stringify(id)} || location.pathname === ${JSON.stringify(`/skills/editor/${id}`)})`
				: "true"
		}`,
		{ timeoutMs: 10_000, description: "ChatGPT Skill editor" },
	);
	if (!ready.ok) throw new Error("ChatGPT Skill editor did not become ready.");
}

async function setEditorSource(client: ChromeClient, source: ChatgptSkillSource): Promise<void> {
	const writes = [
		await setInputValue(client.Runtime, {
			selector: 'input[id$="-name"]',
			value: source.name,
			requireVisible: true,
			timeoutMs: 5_000,
		}),
		await setInputValue(client.Runtime, {
			selector: 'textarea[id$="-description"]',
			value: source.description ?? "",
			requireVisible: true,
			timeoutMs: 5_000,
		}),
		await setCodeMirrorValue(client, normalizeInstructions(source.instructions)),
	];
	if (writes.some((written) => !written)) {
		throw new Error("Unable to populate the complete ChatGPT Skill editor source.");
	}
	const enabled = await waitForPredicate(
		client.Runtime,
		`Array.from(document.querySelectorAll('button')).some((b) => ['Create','Save','Update'].includes(String(b.textContent || '').trim()) && !b.disabled)`,
		{ timeoutMs: 8_000, description: "enabled ChatGPT Skill submit control" },
	);
	if (!enabled.ok) throw new Error("ChatGPT Skill editor did not accept the source fields.");
}

async function setCodeMirrorValue(client: ChromeClient, value: string): Promise<boolean> {
	const focused = await client.Runtime.evaluate({
		expression: `(() => {
      const editor = document.querySelector('.cm-content[contenteditable="true"]');
      if (!(editor instanceof HTMLElement)) return false;
      const rect = editor.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      editor.focus();
      return document.activeElement === editor;
    })()`,
		returnByValue: true,
	});
	if (focused.result?.value !== true) return false;
	await client.Input.dispatchKeyEvent({
		type: "rawKeyDown",
		key: "a",
		code: "KeyA",
		modifiers: 2,
		windowsVirtualKeyCode: 65,
		nativeVirtualKeyCode: 65,
	});
	await client.Input.dispatchKeyEvent({
		type: "keyUp",
		key: "a",
		code: "KeyA",
		modifiers: 2,
		windowsVirtualKeyCode: 65,
		nativeVirtualKeyCode: 65,
	});
	await client.Input.insertText({ text: value });
	const ready = await waitForPredicate(
		client.Runtime,
		`Array.from(document.querySelectorAll('.cm-content .cm-line')).map((line) => line.textContent || '').join('\\n').replace(/\\r\\n?/g, '\\n').trimEnd() === ${JSON.stringify(
			value.trimEnd(),
		)}`,
		{ timeoutMs: 5_000, description: "exact ChatGPT Skill editor content" },
	);
	return ready.ok;
}

async function submitEditor(
	client: ChromeClient,
	source: ChatgptSkillSource,
	action: "create" | "update",
	expectedId?: string,
): Promise<ChatgptSkillMutationOutcome> {
	await assertNoBlockingSurface(client, `${action} skill`);
	const submitted = await pressButtonWithTrustedPointer(client, {
		match: { exact: action === "create" ? ["create"] : ["save", "update"] },
		requireVisible: true,
		timeoutMs: 8_000,
	});
	if (!submitted.ok && !submitted.matchedLabel) {
		throw new Error(`Unable to submit ChatGPT Skill ${action}: ${submitted.reason}.`);
	}
	const settled = await waitForPredicate(
		client.Runtime,
		`(location.pathname === '/skills' && /^[a-f0-9]{32}$/.test(new URL(location.href).searchParams.get('skill_id') || '')) || /^\\/skills\\/editor\\/[a-f0-9]{32}$/.test(location.pathname)`,
		{ timeoutMs: 20_000, description: `ChatGPT Skill ${action} detail redirect` },
	);
	if (!settled.ok) {
		return {
			status: "outcome-unknown",
			message: `${source.name} ${action} was dispatched but no exact detail redirect was observed; do not retry.`,
		};
	}
	const currentUrl = await readCurrentUrl(client);
	const skillId = currentUrl ? readChatgptSkillIdFromUrl(currentUrl) : null;
	if (!skillId || (expectedId && skillId !== expectedId)) {
		return {
			status: "outcome-unknown",
			message: `${source.name} ${action} redirected without the expected exact skill identity; do not retry.`,
			currentUrl,
		};
	}
	return {
		status: "completed",
		message: `${source.name} ${action} redirected to exact skill ${skillId}.`,
		skillId,
		currentUrl,
	};
}

async function assertNoBlockingSurface(client: ChromeClient, action: string): Promise<void> {
	const result = await client.Runtime.evaluate({
		expression: `(() => {
      const visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
      return {
        text: String(document.body?.innerText || '').slice(0, 12000),
        ariaLabel: '',
        buttonLabels: Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible).map((n) => String(n.textContent || n.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80),
      };
    })()`,
		returnByValue: true,
	});
	const probe = isRecord(result.result?.value) ? result.result.value : {};
	const match = classifyChatgptBlockingSurfaceProbe({
		text: readString(probe.text),
		ariaLabel: readString(probe.ariaLabel),
		buttonLabels: readStringArray(probe.buttonLabels),
	});
	if (match) throw new Error(`Cannot ${action}: ${match.summary}`);
}

async function readCurrentUrl(client: ChromeClient): Promise<string | null> {
	const result = await client.Runtime.evaluate({ expression: "location.href", returnByValue: true });
	return readString(result.result?.value);
}

function readHazelnuts(value: unknown): unknown[] | null {
	return isRecord(value) && Array.isArray(value.hazelnuts) ? value.hazelnuts : null;
}

function normalizeCollection(value: string | null | undefined): ChatgptSkill["collection"] {
	const normalized = String(value ?? "").trim().toLowerCase();
	return normalized === "installed" || normalized === "created-by-me" ? normalized : "unknown";
}

function normalizeReviewStatus(value: string | null | undefined): ChatgptSkill["reviewStatus"] {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (normalized === "needs review" || normalized === "needs-review") return "needs-review";
	if (normalized === "ready") return "ready";
	return "unknown";
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNonEmptyText(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value : null;
}

function readStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.map(readString).filter((entry): entry is string => entry !== null)
		: [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
