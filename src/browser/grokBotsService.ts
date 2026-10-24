// biome-ignore-all lint/style/useNamingConvention: CDP protocol and provider identity wire names are case-sensitive.
import { createHash } from "node:crypto";
import {
	createGrokBotClient,
	type GrokBotIdentity,
	type GrokBotInventory,
	type GrokBotSelector,
	type GrokBotSource,
} from "./providers/grokBots.js";
import type { GrokConnectorConnection } from "./grokConnectorsService.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { ChromeClient } from "./types.js";
import { resolveProviderTrafficGovernor } from "./providers/mutationAudit.js";
import { runGrokUiOperation } from "./grokUiOperation.js";
import {
	readGrokAssistantSnapshotForRuntime,
	setGrokPrompt,
	submitGrokPrompt,
	waitForGrokAssistantResult,
} from "./actions/grok.js";

export interface GrokBotConversationResult {
	targetId: string | null;
	status: "supported" | "blocked" | "unknown";
	code: string;
	providerAccountRef: string | null;
	bot: GrokBotIdentity | null;
	conversationId: string | null;
	conversationUrl: string | null;
	responseId: string | null;
	text: string | null;
	markdown: string | null;
	artifacts: {
		status: "observed" | "unknown";
		code: string;
		complete?: false;
		references?: {
			id: string;
			name: string;
			url: string;
			botId: string;
			providerAccountRef: string;
			conversationId: string;
			responseId: string;
		}[];
	};
	effectState: "none" | "completed" | "unknown";
}
export interface GrokBotsService {
	list(source?: GrokBotSource): Promise<GrokBotInventory>;
	invoke(selector: GrokBotSelector, prompt: string): Promise<GrokBotConversationResult>;
}
export interface GrokBotServiceDependencies {
	connect?: (options: BrowserProviderListOptions) => Promise<
		GrokConnectorConnection & {
			client: GrokConnectorConnection["client"] & { Input?: ChromeClient["Input"] };
		}
	>;
	closeTarget?: (connection: GrokConnectorConnection) => Promise<void>;
	/** Same-transport identity proof; production delegates to configured account preflight. */
	verifyAccount?: (
		runtime: ChromeClient["Runtime"],
		options: BrowserProviderListOptions,
	) => Promise<string | null>;
}
export function grokBotUnknown(code = "grok_bot_operation_unknown"): GrokBotConversationResult {
	return {
		status: "unknown",
		targetId: null,
		code,
		providerAccountRef: null,
		bot: null,
		conversationId: null,
		conversationUrl: null,
		responseId: null,
		text: null,
		markdown: null,
		artifacts: { status: "unknown", code: "grok_bot_artifact_inventory_not_observed" },
		effectState: "none",
	};
}
export function createGrokBotsService(
	options: BrowserProviderListOptions,
	dependencies: GrokBotServiceDependencies = {},
): GrokBotsService {
	async function run<T extends GrokBotInventory | GrokBotConversationResult>(
		invoke: boolean,
		body: (context: {
			client: ChromeClient;
			botClient: ReturnType<typeof createGrokBotClient>;
			account: string;
			effect: <V>(
				kind: "input" | "in-page-click",
				source: string,
				fn: () => Promise<V>,
			) => Promise<V>;
		}) => Promise<T>,
	): Promise<T> {
		options.abortSignal?.throwIfAborted();
		const connect =
			dependencies.connect ??
			(async (input: BrowserProviderListOptions) => {
				const { connectToGrokTab } = await import("./providers/grokAdapter.js");
				return connectToGrokTab(input);
			});
		const connection = await connect({
			...options,
			providerTrafficRequired: true,
			tabLifecycle: invoke ? "retain-new" : options.tabLifecycle,
		});
		const client = connection.client as ChromeClient;
		try {
			const governor = resolveProviderTrafficGovernor(client);
			if (!governor || governor.attribution.provider !== "grok" || !governor.admitBackendRequest)
				throw new Error("grok_bot_governor_required");
			if (!connection.targetId || governor.attribution.targetId !== connection.targetId)
				throw new Error("grok_bot_target_not_verified");
			const verify =
				dependencies.verifyAccount ??
				(async (runtime: ChromeClient["Runtime"], input: BrowserProviderListOptions) => {
					const { checkGrokBrowserAuthPreflight } = await import("./providers/grokAdapter.js");
					const result = await checkGrokBrowserAuthPreflight(runtime, input);
					const identity = result.actualIdentity;
					const key = identity?.id || identity?.accountId || identity?.email || identity?.handle;
					return result.ok && key ? createHash("sha256").update(`grok:${key}`).digest("hex") : null;
				});
			await governor.checkWarning?.(client.Runtime);
			const action = await governor.begin({
				kind: "provider-read",
				interactionClass: "generic",
				source: "provider:grok:bots",
				targetId: connection.targetId,
				abortSignal: options.abortSignal,
			});
			try {
				const account = await verify(client.Runtime, options);
				if (!account) throw new Error("grok_bot_account_not_verified");
				const result = await body({
					client,
					account,
					botClient: createGrokBotClient(client.Runtime, { abortSignal: options.abortSignal }),
					effect: (kind, source, fn) =>
						runGrokUiOperation({
							governor,
							runtime: client.Runtime,
							kind,
							source: `provider:grok:bot-${source}`,
							effect: fn,
							abortSignal: options.abortSignal,
						}),
				});
				const after = await verify(client.Runtime, options);
				if (after !== account) throw new Error("grok_bot_account_not_verified");
				result.providerAccountRef = account;
				if ("effectState" in result) result.targetId = connection.targetId;
				await action.settle({ outcome: "succeeded", probeContext: client.Runtime });
				return result;
			} catch (error) {
				await action.settle({
					outcome: "failed",
					effectState: invoke ? "outcome-unknown" : "none",
					error: "grok_bot_operation_failed",
					probeContext: client.Runtime,
				});
				throw error;
			}
		} finally {
			await connection.client.close();
			// Invocation keeps its exact target for result/unknown-effect custody.
			if (!invoke && connection.shouldClose && connection.targetId) {
				if (dependencies.closeTarget) await dependencies.closeTarget(connection);
				else {
					const { default: CDP } = await import("./cdp.js");
					await CDP.Close({
						host: connection.host,
						port: connection.port,
						id: connection.targetId,
					});
				}
			}
		}
	}
	return {
		list: (source = "owned") =>
			run(false, async ({ client, botClient, effect }) => {
				if (source === "catalog") {
					await effect("in-page-click", "catalog-open", () => botClient.openCatalog());
					// Plugins may open before its Bots tab exists; bounded second stage only.
					await effect("in-page-click", "catalog-tab", () => botClient.openCatalog());
				} else {
					if (
						!client.Input ||
						!(await effect("input", "picker-focus", () => botClient.focusEmptyComposer()))
					)
						return {
							status: "unknown",
							code: "grok_bot_empty_root_composer_required",
							providerAccountRef: null,
							bots: [],
							coverage: { scope: "visible", complete: false },
						};
					await effect("input", "picker-open", () => client.Input.insertText({ text: "@" }));
				}
				return botClient.list(source);
			}),
		invoke: (selector, prompt) =>
			run(true, async ({ client, botClient, effect, account }) => {
				if (!prompt.trim() || prompt.length > 100000)
					return { ...grokBotUnknown("grok_bot_prompt_invalid"), status: "blocked" };
				if (selector.source === "catalog")
					return { ...grokBotUnknown("grok_bot_catalog_installation_deferred"), status: "blocked" };
				if (
					!client.Input ||
					!(await effect("input", "picker-focus", () => botClient.focusEmptyComposer()))
				)
					return grokBotUnknown("grok_bot_empty_root_composer_required");
				await effect("input", "picker-open", () => client.Input.insertText({ text: "@" }));
				const selection = await effect("in-page-click", "select", () => botClient.select(selector));
				if (selection.status !== "supported" || !selection.bot)
					return { ...grokBotUnknown(selection.code), status: selection.status };
				const bot = selection.bot;
				const base = { ...grokBotUnknown(), bot };
				// The existing text pipeline preserves and rechecks selected composer tokens.
				const baseline = await readGrokAssistantSnapshotForRuntime(client.Runtime);
				await effect("input", "prompt", () => setGrokPrompt(client.Input, client.Runtime, prompt));
				try {
					await effect("in-page-click", "submit", () =>
						submitGrokPrompt(client.Input, client.Runtime),
					);
					const governor = resolveProviderTrafficGovernor(client);
					const answer = await waitForGrokAssistantResult(client.Runtime, 120000, () => {}, {
						baseline,
						abortSignal: options.abortSignal,
						checkWarning: () => governor?.checkWarning?.(client.Runtime) ?? Promise.resolve(),
					});
					const snapshot = await readGrokAssistantSnapshotForRuntime(client.Runtime);
					const route = await client.Runtime.evaluate({
						expression: "location.href",
						returnByValue: true,
					});
					const url = new URL(String(route.result.value));
					const conversationId =
						url.origin === "https://grok.com"
							? /^\/(?:c|chat)\/([^/?#]+)\/?$/.exec(url.pathname)?.[1]
							: null;
					if (
						!conversationId ||
						!snapshot.responseId ||
						!snapshot.terminal ||
						(snapshot.lastMarkdown || snapshot.lastText) !== (answer.markdown || answer.text) ||
						snapshot.streaming
					)
						return { ...base, code: "grok_bot_result_attribution_unknown", effectState: "unknown" };
					const observedArtifacts = await botClient.readArtifactReferences(snapshot.responseId);
					const artifacts = {
						status: observedArtifacts.status,
						code:
							observedArtifacts.status === "observed"
								? "grok_bot_response_artifact_references"
								: "grok_bot_artifact_inventory_not_observed",
						complete: false as const,
						references: observedArtifacts.references.map((reference) => ({
							...reference,
							botId: bot.id,
							providerAccountRef: account,
							conversationId,
							responseId: snapshot.responseId,
						})),
					};
					return {
						...base,
						artifacts,
						status: "supported",
						code: "grok_bot_conversation_completed",
						conversationId,
						conversationUrl: `https://grok.com${url.pathname}`,
						responseId: snapshot.responseId,
						text: answer.text,
						markdown: answer.markdown,
						effectState: "completed",
					};
				} catch {
					return { ...base, code: "grok_bot_submission_outcome_unknown", effectState: "unknown" };
				}
			}),
	};
}
