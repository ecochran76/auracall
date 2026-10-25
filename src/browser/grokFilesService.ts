// biome-ignore-all lint/style/useNamingConvention: CDP and provider identity wire names are case-sensitive.

import { BrowserAutomationError } from "../oracle/errors.js";
import { projectGrokAccountReference } from "./grokAccountReference.js";
import {
	createGrokFileClient,
	type GrokFileDom,
	type GrokFileRuntime,
	type GrokFilesResult,
} from "./providers/grokFiles.js";
import { resolveProviderTrafficGovernor } from "./providers/mutationAudit.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { ChromeClient } from "./types.js";

export interface GrokFileConnection {
	client: { Runtime: GrokFileRuntime; DOM: GrokFileDom; close(): Promise<void> };
	targetId?: string;
	shouldClose: boolean;
	host: string;
	port: number;
}
export interface GrokFilesService {
	context(): Promise<GrokFilesResult>;
	recent(): Promise<GrokFilesResult>;
	select(id: string): Promise<GrokFilesResult>;
	upload(paths: string[]): Promise<GrokFilesResult>;
}
export interface GrokFilesServiceDependencies {
	connect?: (options: BrowserProviderListOptions) => Promise<GrokFileConnection>;
	closeTarget?: (connection: GrokFileConnection) => Promise<void>;
}

/** Options must come from configured provider authority. Bootstrap remains owned
 * by the existing adapter; this module never creates its own browser transport. */
export function createGrokFilesService(
	options: BrowserProviderListOptions,
	dependencies: GrokFilesServiceDependencies = {},
): GrokFilesService {
	async function run(
		kind: "provider-read" | "input" | "in-page-click",
		read: (
			client: ReturnType<typeof createGrokFileClient>,
			dom: GrokFileDom,
		) => Promise<GrokFilesResult>,
	): Promise<GrokFilesResult> {
		options.abortSignal?.throwIfAborted();
		const connect =
			dependencies.connect ??
			(async (input: BrowserProviderListOptions) => {
				const { connectToGrokTab } = await import("./providers/grokAdapter.js");
				return connectToGrokTab(input);
			});
		const connection = await connect({ ...options, providerTrafficRequired: true });
		let retainTarget = false;
		let operationStarted = false;
		try {
			const governor = resolveProviderTrafficGovernor(connection.client);
			if (!governor || governor.attribution.provider !== "grok" || !governor.admitBackendRequest) {
				throw new Error("grok_file_governor_required");
			}
			if (!connection.targetId || governor.attribution.targetId !== connection.targetId)
				throw new Error("grok_file_target_not_verified");
			await governor.checkWarning?.(connection.client.Runtime);
			const action = await governor.begin({
				kind,
				interactionClass: kind === "input" ? "upload-submit" : "generic",
				source: "provider:grok:files",
				targetId: connection.targetId,
				abortSignal: options.abortSignal,
			});
			let result: GrokFilesResult;
			try {
				const { checkGrokBrowserAuthPreflight } = await import("./providers/grokAdapter.js");
				const identity = await checkGrokBrowserAuthPreflight(
					connection.client.Runtime as ChromeClient["Runtime"],
					options,
				);
				if (!identity.ok) throw new Error("grok_file_account_not_verified");
				operationStarted = true;
				result = await read(
					createGrokFileClient(connection.client.Runtime, {
						abortSignal: options.abortSignal,
					}),
					connection.client.DOM,
				);
				const finalIdentity = await checkGrokBrowserAuthPreflight(
					connection.client.Runtime as ChromeClient["Runtime"],
					options,
				);
				if (
					!finalIdentity.ok ||
					JSON.stringify(finalIdentity.actualIdentity) !== JSON.stringify(identity.actualIdentity)
				)
					throw new Error("grok_file_account_not_verified");
				result.providerAccountRef = projectGrokAccountReference(
					identity.actualIdentity,
					"typed-v1",
				);
			} catch (caught) {
				let error = caught;
				if (operationStarted && kind !== "provider-read") {
					retainTarget = true;
					if (!(error instanceof BrowserAutomationError))
						error = new BrowserAutomationError(
							"Grok file operation unconfirmed; reconcile the retained target before retrying.",
							{ stage: "grok-files", effectState: "unknown" },
							error,
						);
				}
				await action.settle({
					effectState:
						error instanceof BrowserAutomationError && error.details?.effectState === "unknown"
							? "outcome-unknown"
							: "settled",
					outcome: "failed",
					error: "grok_file_read_failed",
					probeContext: connection.client.Runtime,
				});
				if (error instanceof BrowserAutomationError && error.details?.effectState === "unknown") {
					throw new BrowserAutomationError(
						"Grok file operation unconfirmed; reconcile the retained target before retrying.",
						{ stage: "grok-files", effectState: "unknown", targetId: connection.targetId },
						error,
					);
				}
				throw error;
			}
			result.provenance.targetId = connection.targetId;
			retainTarget = result.status === "unconfirmed";
			await action.settle({
				outcome:
					result.status === "failed" || result.status === "unconfirmed" ? "failed" : "succeeded",
				effectState: result.status === "unconfirmed" ? "outcome-unknown" : "settled",
				probeContext: connection.client.Runtime,
			});
			return result;
		} finally {
			await closeConnection();
		}
		async function closeConnection() {
			// Unknown owned-request cleanup must retain its target for reconciliation.
			try {
				await connection.client.close();
			} catch (error) {
				if (retainTarget || (operationStarted && kind !== "provider-read")) {
					throw new BrowserAutomationError(
						"Grok file cleanup unconfirmed; reconcile the retained target before retrying.",
						{ stage: "grok-files-cleanup", effectState: "unknown", targetId: connection.targetId },
						error,
					);
				}
				throw error;
			}
			if (connection.shouldClose && connection.targetId && !retainTarget) {
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
		context: () => run("provider-read", (client) => client.context()),
		recent: () => run("in-page-click", (client) => client.recent()),
		select: (id) => run("in-page-click", (client) => client.select(id)),
		upload: (paths) => run("input", (client, dom) => client.upload(dom, paths)),
	};
}
