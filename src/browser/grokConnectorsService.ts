// biome-ignore-all lint/style/useNamingConvention: CDP and provider identity wire names are case-sensitive.
import type { GrokConnectorInvocationRequest, GrokConnectorInvocationResult } from './grokConnectorInvocationService.js';
import { projectGrokAccountReference } from "./grokAccountReference.js";
import type { GrokConnectorInstallationService } from "./grokConnectorInstallationService.js";
import {
	createGrokConnectorClient,
	type GrokConnectorDetail,
	type GrokConnectorInventory,
	type GrokConnectorRuntime,
	type GrokConnectorSelector,
} from "./providers/grokConnectors.js";
import { resolveProviderTrafficGovernor } from "./providers/mutationAudit.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { ChromeClient } from "./types.js";

export interface GrokConnectorConnection {
	client: {
		Runtime: GrokConnectorRuntime;
		Input?: Pick<ChromeClient["Input"], "dispatchKeyEvent">;
		close(): Promise<void>;
	};
	targetId?: string;
	shouldClose: boolean;
	host: string;
	port: number;
}
export interface GrokConnectorsService
	extends Partial<Pick<GrokConnectorInstallationService, "install" | "reconcile">> {
	invoke?(request:GrokConnectorInvocationRequest):Promise<GrokConnectorInvocationResult>;
	list(query?: string): Promise<GrokConnectorInventory>;
	inspect(selector: GrokConnectorSelector): Promise<GrokConnectorDetail>;
}
export interface GrokConnectorServiceDependencies {
	connect?: (options: BrowserProviderListOptions) => Promise<GrokConnectorConnection>;
	closeTarget?: (connection: GrokConnectorConnection) => Promise<void>;
}

/** Options must come from configured provider authority. Bootstrap remains owned
 * by the existing adapter; this module never creates its own browser transport. */
export function createGrokConnectorsService(
	options: BrowserProviderListOptions,
	dependencies: GrokConnectorServiceDependencies = {},
): GrokConnectorsService {
	async function run<T extends GrokConnectorInventory | GrokConnectorDetail>(
		read: (client: ReturnType<typeof createGrokConnectorClient>) => Promise<T>,
	): Promise<T> {
		options.abortSignal?.throwIfAborted();
		const connect =
			dependencies.connect ??
			(async (input: BrowserProviderListOptions) => {
				const { connectToGrokTab } = await import("./providers/grokAdapter.js");
				return connectToGrokTab(input);
			});
		const connection = await connect({ ...options, providerTrafficRequired: true });
		try {
			const governor = resolveProviderTrafficGovernor(connection.client);
			if (!governor || governor.attribution.provider !== "grok" || !governor.admitBackendRequest) {
				throw new Error("grok_connector_governor_required");
			}
			if (!connection.targetId || governor.attribution.targetId !== connection.targetId)
				throw new Error("grok_connector_target_not_verified");
			await governor.checkWarning?.(connection.client.Runtime);
			const action = await governor.begin({
				kind: "provider-read",
				interactionClass: "generic",
				source: "provider:grok:connectors-read",
				targetId: connection.targetId,
				abortSignal: options.abortSignal,
			});
			let result: T;
			try {
				const { checkGrokBrowserAuthPreflight } = await import("./providers/grokAdapter.js");
				const identity = await checkGrokBrowserAuthPreflight(
					connection.client.Runtime as ChromeClient["Runtime"],
					options,
				);
				if (!identity.ok) throw new Error("grok_connector_account_not_verified");
				result = await read(
					createGrokConnectorClient(connection.client.Runtime, {
						providerUserId: identity.actualIdentity?.id,
						abortSignal: options.abortSignal,
						pressEscape: connection.client.Input
							? async () => {
									await connection.client.Input?.dispatchKeyEvent({
										type: "keyDown",
										key: "Escape",
										code: "Escape",
										windowsVirtualKeyCode: 27,
									});
									await connection.client.Input?.dispatchKeyEvent({
										type: "keyUp",
										key: "Escape",
										code: "Escape",
										windowsVirtualKeyCode: 27,
									});
								}
							: undefined,
					}),
				);
				const finalIdentity = await checkGrokBrowserAuthPreflight(
					connection.client.Runtime as ChromeClient["Runtime"],
					options,
				);
				if (!finalIdentity.ok || finalIdentity.actualIdentity?.id !== identity.actualIdentity?.id)
					throw new Error("grok_connector_account_not_verified");
				result.providerAccountRef = projectGrokAccountReference(
					identity.actualIdentity,
					"typed-v1",
				);
			} catch (error) {
				await action.settle({
					outcome: "failed",
					error: "grok_connector_read_failed",
					probeContext: connection.client.Runtime,
				});
				throw error;
			}
			// A DOM failure is an observed failed read, never a successful empty list.
			await action.settle({
				outcome: result.status === "failed" ? "failed" : "succeeded",
				probeContext: connection.client.Runtime,
			});
			return result;
		} finally {
			// Unknown owned-request cleanup must retain its target for reconciliation.
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
		}
	}
	return {
		list: (query) => run((client) => client.list(query)),
		inspect: (selector) => run((client) => client.inspect(selector)),
	};
}

export const listGrokConnectors = (options: BrowserProviderListOptions, query?: string) =>
	createGrokConnectorsService(options).list(query);
export const inspectGrokConnector = (
	options: BrowserProviderListOptions,
	selector: GrokConnectorSelector,
) => createGrokConnectorsService(options).inspect(selector);
