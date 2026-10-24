// biome-ignore-all lint/style/useNamingConvention: CDP wire names are case-sensitive.
import type { Conversation } from "./providers/domain.js";
import type { GrokHistoryCoverage } from "./providers/grokHistoryInventory.js";
import { resolveProviderTrafficGovernor } from "./providers/mutationAudit.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { ChromeClient } from "./types.js";

export interface GrokConversationReadRequest {
	projectId?: string;
	query?: string;
	cursor?: string;
	limit?: number;
	since?: string;
	maxPages?: number;
	timeoutMs?: number;
}
export interface GrokConversationInventory {
	object: "grok_conversation_inventory";
	items: Conversation[];
	coverage: GrokHistoryCoverage;
}
export interface GrokConversationsService {
	list(request?: GrokConversationReadRequest): Promise<GrokConversationInventory>;
}
export interface GrokConversationConnection {
	client: { Runtime: Pick<ChromeClient["Runtime"], "evaluate">; close(): Promise<void> };
	targetId?: string;
	shouldClose: boolean;
	host: string;
	port: number;
}
export interface GrokConversationsServiceDependencies {
	connect?: (options: BrowserProviderListOptions) => Promise<GrokConversationConnection>;
	closeTarget?: (connection: GrokConversationConnection) => Promise<void>;
}
export function grokConversationsFailureResult(
	projectId?: string,
	reason = "history-read-failed",
): GrokConversationInventory {
	return {
		object: "grok_conversation_inventory",
		items: [],
		coverage: {
			state: "failed",
			source: "visible-chats",
			scope: projectId ? "project" : "root",
			reason: [
				"history-read-failed",
				"history-invalid-request",
				"history-authority-unavailable",
				"history-account-not-verified",
				"history-coverage-not-observed",
				"history-cleanup-unconfirmed",
				"history-progress-failed",
				"cancelled",
			].includes(reason)
				? reason
				: "history-read-failed",
			loadedCount: 0,
			pages: 0,
			nextCursor: null,
			observedAt: new Date().toISOString(),
		},
	};
}

/** Uses the existing annotated browser bootstrap and history reader; no retries/cache. */
export function createGrokConversationsService(
	options: BrowserProviderListOptions,
	dependencies: GrokConversationsServiceDependencies = {},
): GrokConversationsService {
	return {
		async list(request = {}) {
			const projectId = request.projectId ?? options.projectId ?? undefined;
			let connection: GrokConversationConnection | undefined;
			let result = grokConversationsFailureResult(projectId);
			let reason = "history-read-failed";
			try {
				options.abortSignal?.throwIfAborted();
				const connect =
					dependencies.connect ??
					(async (input) => {
						const { connectToGrokTab } = await import("./providers/grokAdapter.js");
						return connectToGrokTab(input);
					});
				connection = await connect({ ...options, providerTrafficRequired: true });
				const governor = resolveProviderTrafficGovernor(connection.client);
				reason = "history-authority-unavailable";
				if (
					!governor ||
					governor.attribution.provider !== "grok" ||
					!governor.admitBackendRequest ||
					!connection.targetId ||
					governor.attribution.targetId !== connection.targetId
				)
					throw new Error(reason);
				await governor.checkWarning?.(connection.client.Runtime);
				const action = await governor.begin({
					kind: "provider-read",
					interactionClass: "generic",
					source: "provider:grok:conversation-inventory",
					targetId: connection.targetId,
					abortSignal: options.abortSignal,
				});
				try {
					const { checkGrokBrowserAuthPreflight, listHistoryConversations } = await import(
						"./providers/grokAdapter.js"
					);
					reason = "history-account-not-verified";
					const initial = await checkGrokBrowserAuthPreflight(
						connection.client.Runtime as ChromeClient["Runtime"],
						options,
					);
					if (!initial.ok) throw new Error(reason);
					let coverage: GrokHistoryCoverage | undefined;
					reason = "history-read-failed";
					const items = await listHistoryConversations(
						connection.client as ChromeClient,
						projectId,
						{
							...options,
							historySearch: request.query ?? options.historySearch,
							historyCursor: request.cursor ?? options.historyCursor,
							historyLimit: request.limit ?? options.historyLimit,
							historySince: request.since ?? options.historySince,
							historyMaxPages: request.maxPages ?? options.historyMaxPages,
							historyTimeoutMs: request.timeoutMs ?? options.historyTimeoutMs,
							onHistoryInventory: (value) => {
								coverage = value;
							},
						},
					);
					reason = "history-account-not-verified";
					const final = await checkGrokBrowserAuthPreflight(
						connection.client.Runtime as ChromeClient["Runtime"],
						options,
					);
					if (!final.ok || final.actualIdentity?.id !== initial.actualIdentity?.id)
						throw new Error(reason);
					reason = "history-coverage-not-observed";
					if (!coverage) throw new Error(reason);
					reason = "history-read-failed";
					result = { object: "grok_conversation_inventory", items, coverage };
					await action.settle({
						outcome: result.coverage.state === "failed" ? "failed" : "succeeded",
						probeContext: connection.client.Runtime,
					});
				} catch (error) {
					await action.settle({
						outcome: "failed",
						error: "history-inventory-failed",
						probeContext: connection.client.Runtime,
					});
					throw error;
				}
			} catch {
				result = grokConversationsFailureResult(
					projectId,
					options.abortSignal?.aborted ? "cancelled" : reason,
				);
			} finally {
				if (connection) {
					try {
						// Retain the owned target if socket/request-authority cleanup is unknown.
						await connection.client.close();
						if (connection.shouldClose && connection.targetId) {
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
					} catch {
						result = grokConversationsFailureResult(projectId, "history-cleanup-unconfirmed");
					}
				}
			}
			try {
				await options.onHistoryInventory?.(result.coverage);
			} catch {
				result = grokConversationsFailureResult(projectId, "history-progress-failed");
			}
			return result;
		},
	};
}
