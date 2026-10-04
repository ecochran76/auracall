import type { BrowserMutationAuditSink } from "../../../packages/browser-service/src/service/mutationDispatcher.js";
import type {
	ProviderTrafficAuthority,
	ProviderTrafficGovernor,
} from "../../../packages/browser-service/src/service/providerTrafficGovernor.js";
import type { ChromeClient } from "../types.js";
import type { BrowserProviderListOptions } from "./types.js";

type MutationContextCarrier = {
	__auracallMutationAudit?: BrowserMutationAuditSink;
	__auracallMutationSourcePrefix?: string;
	__auracallProviderTrafficGovernor?: ProviderTrafficGovernor;
	__auracallProviderTrafficRequired?: boolean;
	__auracallProviderTrafficAuthority?: ProviderTrafficAuthority;
};

function asMutationContextCarrier(value: unknown): MutationContextCarrier | null {
	return typeof value === "object" && value !== null ? (value as MutationContextCarrier) : null;
}

function isBrowserProviderListOptions(value: unknown): value is BrowserProviderListOptions {
	return (
		typeof value === "object" &&
		value !== null &&
		("mutationAudit" in value ||
			"mutationSourcePrefix" in value ||
			"providerTrafficGovernor" in value)
	);
}

function normalizeMutationSourcePrefix(value: string | null | undefined): string | null {
	const normalized = String(value ?? "").trim();
	return normalized.length > 0 ? normalized : null;
}

export async function annotateClientMutationContext(
	client: ChromeClient,
	options: BrowserProviderListOptions | undefined,
	defaultSourcePrefix: string,
	resolvedTargetId?: string,
): Promise<void> {
	const extendedClient = client as ChromeClient & MutationContextCarrier;
	const targetId = resolvedTargetId?.trim() || options?.tabTargetId?.trim();
	const authority =
		!options?.providerTrafficGovernor && options?.providerTrafficAuthorityFactory && targetId
			? await options.providerTrafficAuthorityFactory.acquire({ targetId })
			: undefined;
	if (options?.providerTrafficRequired && !options.providerTrafficGovernor && !authority) {
		throw new Error(
			`Provider traffic authority is unavailable for target ${targetId || "unknown"}.`,
		);
	}
	extendedClient.__auracallMutationAudit = options?.mutationAudit;
	extendedClient.__auracallProviderTrafficGovernor =
		options?.providerTrafficGovernor ?? authority?.governor;
	extendedClient.__auracallProviderTrafficRequired =
		options?.providerTrafficRequired === true ||
		options?.providerTrafficGovernor !== undefined ||
		options?.providerTrafficAuthorityFactory !== undefined;
	extendedClient.__auracallProviderTrafficAuthority = authority;
	extendedClient.__auracallMutationSourcePrefix =
		normalizeMutationSourcePrefix(options?.mutationSourcePrefix) ?? defaultSourcePrefix;
	if (authority) {
		const close = client.close.bind(client);
		let closed = false;
		client.close = async () => {
			if (closed) return;
			closed = true;
			let closeError: unknown = null;
			try {
				await close();
			} catch (error) {
				closeError = error;
			}
			await authority.close({
				outcome: closeError ? "failed" : "succeeded",
				effectState: closeError ? "outcome-unknown" : "settled",
				reason: closeError instanceof Error ? closeError.message : null,
			});
			if (closeError) throw closeError;
		};
	}
}

export function resolveProviderTrafficGovernor(
	clientOrOptions: unknown,
): ProviderTrafficGovernor | undefined {
	if (!clientOrOptions) return undefined;
	if (isBrowserProviderListOptions(clientOrOptions)) return clientOrOptions.providerTrafficGovernor;
	return asMutationContextCarrier(clientOrOptions)?.__auracallProviderTrafficGovernor;
}

export function resolveMutationAudit(
	clientOrOptions: unknown,
): BrowserMutationAuditSink | undefined {
	if (!clientOrOptions) {
		return undefined;
	}
	if (isBrowserProviderListOptions(clientOrOptions)) {
		return clientOrOptions.mutationAudit;
	}
	return asMutationContextCarrier(clientOrOptions)?.__auracallMutationAudit;
}

export function resolveMutationSource(
	clientOrOptions: unknown,
	defaultSourcePrefix: string,
	action: string,
): string {
	const explicitPrefix = isBrowserProviderListOptions(clientOrOptions)
		? normalizeMutationSourcePrefix(clientOrOptions.mutationSourcePrefix)
		: normalizeMutationSourcePrefix(
				asMutationContextCarrier(clientOrOptions)?.__auracallMutationSourcePrefix,
			);
	const prefix = explicitPrefix ?? defaultSourcePrefix;
	return `${prefix}:${action}`;
}
