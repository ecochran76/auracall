import { createHash } from "node:crypto";

import type { DevToolsConnectionOptions } from "../../../packages/browser-service/src/types.js";
import type {
	ChatgptSkill,
	ChatgptSkillMutationOutcome,
	ChatgptSkillSource,
	ChatgptSkillState,
} from "../../cli/chatgptSkillsCommand.js";
import type { ResolvedUserConfig } from "../../config.js";
import { waitForAssistantResponse } from "../actions/assistantResponse.js";
import { ensureChatgptComposerMode } from "../actions/chatgptComposerMode.js";
import { submitPrompt } from "../actions/promptComposer.js";
import {
	navigateAndSettle,
	pressButtonWithTrustedPointer,
	reloadAndSettle,
	setInputValue,
	waitForPredicate,
} from "../service/ui.js";
import type { BrowserLogger, ChromeClient } from "../types.js";
import { classifyChatgptBlockingSurfaceProbe, readChatgptUserIdentity } from "./chatgptAdapter.js";

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
	getUserIdentity(options?: {
		abortSignal?: AbortSignal;
		configuredUrl?: string;
		preserveActiveTab?: boolean;
		requirePromptWorkbenchTarget?: boolean;
		tabLifecycle?: "dispose-new" | "retain-new";
	}): Promise<SkillIdentity | null>;
	connectDevTools(
		options?: DevToolsConnectionOptions,
	): Promise<{ client: ChromeClient; port: number }>;
	connectChatgptPromptWorkbench(
		options?: DevToolsConnectionOptions,
	): Promise<{ client: ChromeClient; port: number }>;
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

export function buildChatgptSkillEditorProbeExpression(id: string): string {
	return `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const route = location.pathname.match(/^\\/skills\\/editor\\/([a-f0-9]{32})$/i);
      const routeId = route?.[1]?.toLowerCase() || '';
      if (routeId !== ${JSON.stringify(id)}) return null;
      const name = document.querySelector('input[id$="-name"]')?.value || '';
      const description = document.querySelector('textarea[id$="-description"]')?.value || '';
      const editor = document.querySelector('.cm-content');
	  const editorLines = editor ? Array.from(editor.querySelectorAll('.cm-line')).map((line) => line.textContent || '') : [];
	  const instructions = editor ? editorLines.join('\\n') : null;
      return { id: routeId, name: normalize(name), owner: null, description: normalize(description) || null, filePaths: ['SKILL.md'], instructions };
    })()`;
}

function buildChatgptSkillComposerLookup(): string {
	return `const editors = Array.from(document.querySelectorAll('#prompt-textarea, textarea[name="prompt-textarea"]'))
      .filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const editor = editors.length === 1 ? editors[0] : null;`;
}

export function buildChatgptSkillComposerPristineProbeExpression(): string {
	return `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      ${buildChatgptSkillComposerLookup()}
      if (!(editor instanceof HTMLElement)) return false;
      const rect = editor.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const composer = editor.closest('form') || document.querySelector('form[data-type="unified-composer"]');
      if (!(composer instanceof HTMLElement)) return false;
      const content = editor.cloneNode(true);
      content.querySelectorAll('[data-inline-selection-pill-cursor-target]').forEach((node) => node.remove());
      return normalize(content.textContent || '') === ''
        && composer.querySelectorAll('[data-inline-selection-pill]').length === 0;
    })()`;
}

export function buildChatgptSkillSelectionProbeExpression(skill: {
	id: string;
	name: string;
}): string {
	return `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      if (location.origin !== 'https://chatgpt.com') return null;
      ${buildChatgptSkillComposerLookup()}
      if (!visible(editor)) return null;
      const composer = editor.closest('form') || document.querySelector('form[data-type="unified-composer"]');
      if (!(composer instanceof HTMLElement)) return null;
      const expectedId = ${JSON.stringify(skill.id)};
      const expectedName = ${JSON.stringify(skill.name.trim())};
      const markers = Array.from(composer.querySelectorAll(
        '[data-skill-id], [data-hazelnut-id], [data-inline-selection-pill], [data-testid*="skill" i], button, [role="button"], [aria-label]'
      )).filter(visible);
      const routeValues = Array.from(new URL(location.href).searchParams.values()).map(normalize);
      const routeMatches = routeValues.some((value) => value === expectedId || value.includes(expectedId));
      const marker = markers.find((node) => {
        const ids = [
          node.getAttribute('data-skill-id'),
          node.getAttribute('data-hazelnut-id'),
          node.getAttribute('data-id'),
          node.getAttribute('data-system-hint-type'),
        ].map(normalize);
        const names = [
          node.getAttribute('data-skill-name'),
          node.getAttribute('data-keyword'),
          node.textContent,
        ].map(normalize);
        return ids.some((value) => value === expectedId || value.endsWith(':' + expectedId))
          || names.some((value) => value === expectedName);
      });
	  const content = editor.cloneNode(true);
	  content.querySelectorAll('[data-inline-selection-pill], [data-inline-selection-pill-cursor-target]')
	    .forEach((node) => node.remove());
	  const composerText = normalize(content.textContent || '');
	  const providerPrompt = normalize(new URL(location.href).searchParams.get('prompt'));
      return {
        selected: Boolean(marker) || routeMatches,
        markerObserved: Boolean(marker),
        skillId: marker || routeMatches ? expectedId : null,
        skillName: marker ? expectedName : null,
		composerEmpty: composerText === '',
		providerPrefillOnly: providerPrompt !== '' && composerText === providerPrompt,
      };
    })()`;
}

export function buildChatgptSkillCleanupExpression(skill: { id: string; name: string }): string {
	return `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      ${buildChatgptSkillComposerLookup()}
      if (!(editor instanceof HTMLElement)) return { cleared: false, reason: 'composer-missing' };
      const expectedId = ${JSON.stringify(skill.id)};
      const expectedName = ${JSON.stringify(skill.name.trim())};
      const pills = Array.from(editor.querySelectorAll('[data-inline-selection-pill]'));
      const matches = pills.filter((node) => {
        const ids = [
          node.getAttribute('data-skill-id'),
          node.getAttribute('data-hazelnut-id'),
          node.getAttribute('data-id'),
          node.getAttribute('data-system-hint-type'),
        ].map(normalize);
        const names = [node.getAttribute('data-skill-name'), node.getAttribute('data-keyword'), node.textContent]
          .map(normalize);
        return ids.some((value) => value === expectedId || value.endsWith(':' + expectedId))
          || names.some((value) => value === expectedName);
      });
      const content = editor.cloneNode(true);
      content.querySelectorAll('[data-inline-selection-pill], [data-inline-selection-pill-cursor-target]')
        .forEach((node) => node.remove());
      if (pills.length !== 1 || matches.length !== 1 || normalize(content.textContent || '') !== '') {
        return { cleared: false, reason: 'composer-not-exact-single-skill' };
      }
      editor.textContent = '';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
      return { cleared: true, reason: null };
    })()`;
}

export function isChatgptSkillAbsentFromInventory(
	inventory: ChatgptSkillInventoryProbe,
	id: string,
): boolean {
	return inventory.complete && !inventory.entries.some((entry) => entry.id === id);
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
					safetyStatus === "unchecked" ? "Needs review" : safetyStatus === "ready" ? "Ready" : null,
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
	private originalComposerPristine: boolean | null = null;
	private restoreOriginalUrl = true;

	constructor(
		private readonly browser: ChatgptSkillBrowserClient,
		private readonly abortSignal?: AbortSignal,
	) {}

	async readState(): Promise<ChatgptSkillState> {
		this.throwIfAborted();
		const identity = await this.browser.getUserIdentity({
			abortSignal: this.abortSignal,
			configuredUrl: "https://chatgpt.com/",
			preserveActiveTab: true,
			requirePromptWorkbenchTarget: true,
			tabLifecycle: "retain-new",
		});
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
		const sourceReady = await waitForPredicate(
			client.Runtime,
			`(() => {
      const name = document.querySelector('input[id$="-name"]')?.value || '';
      const lines = Array.from(document.querySelectorAll('.cm-content .cm-line')).map((line) => line.textContent || '');
      return name.trim().length > 0 && lines.join('\\n').trim().length > 0;
    })()`,
			{ timeoutMs: 12_000, description: `persisted ChatGPT Skill source ${id}` },
		);
		if (!sourceReady.ok) {
			throw new Error(`ChatGPT skill ${id} editor did not expose persisted source.`);
		}
		const probe = await readEditorProbe(client, id);
		if (!probe) throw new Error(`ChatGPT skill ${id} editor source probe was unavailable.`);
		return deriveChatgptSkillDetail(probe);
	}

	async select(skill: ChatgptSkill): Promise<ChatgptSkillMutationOutcome> {
		return this.withSelectedSkill(skill);
	}

	async run(
		skill: ChatgptSkill,
		input: { prompt: string; expectedAccount: string; timeoutMs: number },
	): Promise<ChatgptSkillMutationOutcome> {
		let submissionAttempted = false;
		const logger: BrowserLogger = () => undefined;
		const outcome = await this.withSelectedSkill(skill, async (client) => {
			await ensureChatgptComposerMode(client.Runtime, "chat", logger);
			const boundary = await submitPrompt(
				{
					runtime: client.Runtime,
					input: client.Input,
					inputTimeoutMs: 10_000,
					beforeSend: async () => {
						this.throwIfAborted();
						const identity = await readChatgptUserIdentity(client);
						if (
							identity?.email?.trim().toLowerCase() !== input.expectedAccount.trim().toLowerCase()
						) {
							throw new Error(
								"ChatGPT Skill run account changed before Send; refusing submission.",
							);
						}
						await assertNoBlockingSurface(client, "run skill before Send");
						const proof = await client.Runtime.evaluate({
							expression: buildChatgptSkillSelectionProbeExpression(skill),
							returnByValue: true,
						});
						if (
							proof.result?.value?.markerObserved !== true ||
							proof.result?.value?.skillId !== skill.id
						) {
							throw new Error("ChatGPT Skill marker was lost before Send; refusing submission.");
						}
						// Set before any send attempt, including a lost CDP acknowledgement.
						submissionAttempted = true;
						this.restoreOriginalUrl = false;
					},
				},
				input.prompt,
				logger,
			);
			const response = await waitForAssistantResponse(
				client.Runtime,
				input.timeoutMs,
				logger,
				boundary,
			);
			return {
				status: "completed",
				skillId: skill.id,
				currentUrl: await readCurrentUrl(client),
				responseText: response.text,
				message:
					"Submitted once with the selected Skill and captured a response. Skill execution must be assessed from provider evidence.",
			};
		});
		return { ...outcome, submissionAttempted };
	}

	private async withSelectedSkill(
		skill: ChatgptSkill,
		onSelected?: (client: ChromeClient) => Promise<ChatgptSkillMutationOutcome>,
	): Promise<ChatgptSkillMutationOutcome> {
		const client = await this.ensureClient();
		if (this.originalComposerPristine !== true) {
			throw new Error(
				`ChatGPT skill ${skill.id} selection requires the original prompt workbench to have zero user text and zero selection pills.`,
			);
		}
		const returnUrl = this.originalUrl?.startsWith("https://chatgpt.com/")
			? this.originalUrl
			: "https://chatgpt.com/";
		let selectionObserved = false;
		let selectionUrl: string | null = null;
		let selectionFailure: string | null = null;
		let cleanupFailure: string | null = null;
		try {
			await navigateSkills(client, `https://chatgpt.com/skills?skill_id=${skill.id}`);
			await assertNoBlockingSurface(client, `select skill ${skill.id}`);
			const detailReady = await waitForPredicate(
				client.Runtime,
				`location.origin === 'https://chatgpt.com' && location.pathname === '/skills' && new URL(location.href).searchParams.get('skill_id') === ${JSON.stringify(skill.id)}`,
				{ timeoutMs: 10_000, description: `ChatGPT Skill detail ${skill.id}` },
			);
			if (!detailReady.ok) {
				throw new Error(`ChatGPT skill ${skill.id} detail did not become ready.`);
			}
			const selected = await pressButtonWithTrustedPointer(client, {
				match: { exact: ["try in chat"] },
				requireVisible: true,
				timeoutMs: 8_000,
			});
			if (!selected.ok && !selected.matchedLabel) {
				throw new Error(`ChatGPT skill ${skill.id} did not expose one exact Try in chat action.`);
			}
			const proofExpression = buildChatgptSkillSelectionProbeExpression(skill);
			const proofReady = await waitForPredicate(
				client.Runtime,
				`(() => { const proof = ${proofExpression}; return proof?.selected === true && (proof?.composerEmpty === true || proof?.providerPrefillOnly === true); })()`,
				{
					timeoutMs: 10_000,
					description: `non-submitting composer selected with ChatGPT Skill ${skill.id}`,
				},
			);
			if (!proofReady.ok) {
				selectionFailure = `ChatGPT skill ${skill.id} Try in chat was dispatched but exact non-submitting composer selection was not observed; do not retry.`;
			} else {
				selectionObserved = true;
				selectionUrl = await readCurrentUrl(client);
				if (onSelected) return await onSelected(client);
			}
		} catch (error) {
			selectionFailure = error instanceof Error ? error.message : String(error);
		} finally {
			if (this.restoreOriginalUrl) {
				try {
					await navigateSkills(client, returnUrl);
					const cleanupProbe = buildChatgptSkillSelectionProbeExpression(skill);
					const activeSelection = await client.Runtime.evaluate({
						expression: cleanupProbe,
						returnByValue: true,
					});
					const activeValue = isRecord(activeSelection.result?.value)
						? activeSelection.result.value
						: null;
					if (activeValue?.selected === true && activeValue.composerEmpty === true) {
						const cleared = await client.Runtime.evaluate({
							expression: buildChatgptSkillCleanupExpression(skill),
							returnByValue: true,
						});
						if (!isRecord(cleared.result?.value) || cleared.result.value.cleared !== true) {
							cleanupFailure = `Exact Skill ${skill.id} cleanup was refused.`;
						}
					}
					if (!cleanupFailure) {
						const cleanupReady = await waitForPredicate(
							client.Runtime,
							`(() => { const proof = ${cleanupProbe}; return proof?.selected === false && proof?.composerEmpty === true; })()`,
							{
								timeoutMs: 10_000,
								description: `empty composer cleared of ChatGPT Skill ${skill.id}`,
							},
						);
						if (!cleanupReady.ok) {
							cleanupFailure = `Original ChatGPT route was restored but exact Skill ${skill.id} cleanup was not observed.`;
						}
					}
				} catch (error) {
					cleanupFailure = error instanceof Error ? error.message : String(error);
				}
			}
		}
		if (!selectionObserved || selectionFailure || cleanupFailure) {
			return {
				status: "outcome-unknown",
				message:
					[selectionFailure, cleanupFailure ? `Cleanup failed: ${cleanupFailure}` : null]
						.filter(Boolean)
						.join(" ") || `ChatGPT skill ${skill.id} selection outcome is unknown; do not retry.`,
				skillId: skill.id,
				currentUrl: selectionUrl,
			};
		}
		return {
			status: "completed",
			message: `${skill.id} selected through Try in chat without submission, then the original ChatGPT route was restored with an empty composer.`,
			skillId: skill.id,
			currentUrl: selectionUrl,
		};
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

	async update(
		skill: ChatgptSkill,
		source: ChatgptSkillSource,
	): Promise<ChatgptSkillMutationOutcome> {
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
		this.restoreOriginalUrl = false;
		const freshInventory = await captureSkillInventory(client);
		const outcome: ChatgptSkillMutationOutcome = isChatgptSkillAbsentFromInventory(
			freshInventory,
			skill.id,
		)
			? {
					status: "completed",
					message: `${skill.id} delete completed with fresh inventory absence.`,
					skillId: skill.id,
				}
			: {
					status: "outcome-unknown",
					message: `${skill.id} delete was dispatched but fresh complete inventory absence was not observed; do not retry.`,
					skillId: skill.id,
				};
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
		const connected = await this.browser.connectChatgptPromptWorkbench({
			abortSignal: this.abortSignal,
			stageTimeoutMs: 10_000,
		});
		this.cdpClient = connected.client;
		await this.cdpClient.Runtime.enable();
		await this.cdpClient.Page.enable();
		this.originalUrl = await readCurrentUrl(this.cdpClient);
		if (this.originalUrl === "about:blank") {
			const ready = await waitForPredicate(
				this.cdpClient.Runtime,
				`(() => {
        if (location.origin !== 'https://chatgpt.com' || location.pathname !== '/') return false;
        ${buildChatgptSkillComposerLookup()}
        if (!(editor instanceof HTMLElement)) return false;
        const rect = editor.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && Boolean(editor.closest('form'));
      })()`,
				{ timeoutMs: 10_000, description: "original Skill prompt workbench" },
			);
			if (!ready.ok)
				throw new Error(
					"ChatGPT Skill prompt workbench did not finish opening; no selection was attempted.",
				);
			this.originalUrl = await readCurrentUrl(this.cdpClient);
		}
		const pristine = await this.cdpClient.Runtime.evaluate({
			expression: buildChatgptSkillComposerPristineProbeExpression(),
			returnByValue: true,
		});
		this.originalComposerPristine = pristine.result?.value === true;
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
		expression: buildChatgptSkillEditorProbeExpression(id),
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
	const result = await client.Runtime.evaluate({
		expression: "location.href",
		returnByValue: true,
	});
	return readString(result.result?.value);
}

function readHazelnuts(value: unknown): unknown[] | null {
	return isRecord(value) && Array.isArray(value.hazelnuts) ? value.hazelnuts : null;
}

function normalizeCollection(value: string | null | undefined): ChatgptSkill["collection"] {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	return normalized === "installed" || normalized === "created-by-me" ? normalized : "unknown";
}

function normalizeReviewStatus(value: string | null | undefined): ChatgptSkill["reviewStatus"] {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
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
