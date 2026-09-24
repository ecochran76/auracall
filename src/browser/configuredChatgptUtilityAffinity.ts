import {
	closeRemoteChromeTarget,
	listChromeTargets,
	openChromeTarget,
} from "../../packages/browser-service/src/chromeLifecycle.js";
import { createBrowserInteractionGovernor } from "../../packages/browser-service/src/service/interactionGovernor.js";
import { createLedgerBackedBrowserInteractionGovernor } from "../../packages/browser-service/src/service/ledgerInteractionGovernor.js";
import { acquireEphemeralBrowserTab } from "../accountMirror/liveFollowTabCoordinator.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import type { ResolvedUserConfig } from "../config.js";
import {
	resolveChatgptInteractionsPerMinute,
	resolveChatgptTenantLimits,
} from "../runtime/tenantExecutionLimits.js";
import { classifyStructuredProviderWarning } from "./chatgptAffinityRuntime.js";
import { retireExpiredChatgptTabLeases } from "./chatgptTabRetirement.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { BrowserService } from "./service/browserService.js";
import { createBrowserTabConcurrencyRuntime } from "./tabConcurrencyRuntime.js";

export interface ConfiguredChatgptUtilityAffinityDeps {
	createRuntime?: typeof createBrowserTabConcurrencyRuntime;
	listTargets?: typeof listChromeTargets;
	openTarget?: typeof openChromeTarget;
	closeTarget?: typeof closeRemoteChromeTarget;
}

export async function runConfiguredChatgptUtilityOperation<TResult>(input: {
	userConfig: ResolvedUserConfig;
	browserService: BrowserService;
	utilityId: string;
	buildListOptions: (overrides: BrowserProviderListOptions) => Promise<BrowserProviderListOptions>;
	options?: BrowserProviderListOptions;
	mutability: "read-only" | "provider-mutating";
	run: (options: BrowserProviderListOptions) => Promise<TResult>;
	now?: () => Date;
	deps?: ConfiguredChatgptUtilityAffinityDeps;
}): Promise<TResult | null> {
	if (input.userConfig.browser?.tabConcurrencyMode !== "tab-affinity") return null;
	const now = input.now ?? (() => new Date());
	const runtimeProfileId = input.userConfig.auracallProfile?.trim() || "default";
	const runtime = (input.deps?.createRuntime ?? createBrowserTabConcurrencyRuntime)(
		input.userConfig,
	);
	if (!runtime.registry || !runtime.ledger) {
		throw new Error("ChatGPT utility affinity is missing its registry or interaction ledger.");
	}
	const tenantKey = resolveConfiguredServiceAccountId(input.userConfig as Record<string, unknown>, {
		serviceId: "chatgpt",
		runtimeProfileId,
	});
	if (!tenantKey)
		throw new Error("ChatGPT utility affinity requires a configured tenant identity.");
	const configuredUrl =
		input.userConfig.browser?.chatgptUrl ?? input.userConfig.browser?.url ?? "https://chatgpt.com/";
	const initialTarget = await input.browserService.resolveServiceTarget({
		serviceId: "chatgpt",
		configuredUrl,
		ensurePort: false,
		abortSignal: input.options?.abortSignal,
	});
	const managedBrowserProfile = initialTarget.managedBrowserProfile?.trim();
	if (!managedBrowserProfile) {
		throw new Error("ChatGPT utility affinity could not resolve the managed browser profile.");
	}
	const scope = {
		runtimeProfileId,
		managedBrowserProfile,
		service: "chatgpt",
		tenantKey,
	};
	const toEndpoint = (target: typeof initialTarget) => {
		if (!target.host || !target.port || target.managedBrowserProfile !== managedBrowserProfile) {
			return null;
		}
		return { host: target.host, port: target.port, managedBrowserProfile };
	};
	const inspectTarget = async (endpoint: { host: string; port: number }, targetId: string) => {
		const targets = await (input.deps?.listTargets ?? listChromeTargets)(
			endpoint.port,
			endpoint.host,
		);
		const target = targets.find((candidate) => {
			const record = candidate as { id?: string; targetId?: string };
			return (record.targetId ?? record.id) === targetId;
		}) as { url?: string } | undefined;
		return typeof target?.url === "string" ? { url: target.url } : null;
	};
	const closeTarget = (endpoint: { host: string; port: number }, targetId: string) =>
		(input.deps?.closeTarget ?? closeRemoteChromeTarget)(
			endpoint.host,
			endpoint.port,
			targetId,
			() => undefined,
		);
	await retireExpiredChatgptTabLeases({
		registry: runtime.registry,
		scope,
		endpoint: toEndpoint(initialTarget),
		now,
		inspectTarget,
		closeTarget,
	});
	const tab = await acquireEphemeralBrowserTab({
		registry: runtime.registry,
		scope,
		operationId: input.utilityId,
		targetUrl: configuredUrl,
		idleTtlMs: 5 * 60_000,
		absoluteTtlMs: 60 * 60_000,
		now,
		resolveExistingEndpoint: async () => toEndpoint(initialTarget),
		startBrowser: async () => {
			const target = await input.browserService.resolveServiceTarget({
				serviceId: "chatgpt",
				configuredUrl,
				ensurePort: true,
				abortSignal: input.options?.abortSignal,
			});
			const endpoint = toEndpoint(target);
			if (!endpoint) throw new Error("ChatGPT utility browser startup returned no exact endpoint.");
			return endpoint;
		},
		inspectTarget,
		openTarget: async ({ host, port, url }) => {
			const target = await (input.deps?.openTarget ?? openChromeTarget)(port, url, host);
			const targetId = typeof target === "string" ? target : target.id;
			if (!targetId) throw new Error("ChatGPT utility target creation returned no target ID.");
			return { targetId, url };
		},
		closeTarget: ({ host, port, targetId }) => closeTarget({ host, port }, targetId),
	});
	const options = await input.buildListOptions({
		...(input.options ?? {}),
		host: tab.endpoint.host,
		port: tab.endpoint.port,
		tabTargetId: tab.lease.targetId,
		tabUrl: tab.lease.targetFingerprint ?? configuredUrl,
		tabLifecycle: "retain",
		preserveActiveTab: true,
	});
	const baseGovernor =
		options.interactionGovernor ??
		createBrowserInteractionGovernor({ abortSignal: input.options?.abortSignal });
	const limits = resolveChatgptTenantLimits(
		input.userConfig as Record<string, unknown>,
		runtimeProfileId,
	);
	const governor = createLedgerBackedBrowserInteractionGovernor({
		ledger: runtime.ledger,
		scope: { provider: "chatgpt", tenantKey, runtimeProfileId, managedBrowserProfile },
		workloadId: `utility:${input.utilityId}`,
		operationId: input.utilityId,
		tabLeaseId: tab.lease.leaseId,
		policy: {
			maxConcurrentChats: limits.maxConcurrentChats,
			maxConversationStartsPerHour: limits.maxChatsPerHour,
			maxConversationStartsPerDay: limits.maxChatsPerDay,
			maxInteractionsPerMinute: resolveChatgptInteractionsPerMinute(
				input.userConfig as Record<string, unknown>,
				runtimeProfileId,
			),
		},
		baseGovernor,
		now,
	});
	let effectState: "settled" | "outcome-unknown" = "settled";
	let outcome: "succeeded" | "failed" = "succeeded";
	let warningRecordError: unknown = null;
	let execution: { ok: true; value: TResult } | { ok: false; error: unknown };
	try {
		execution = {
			ok: true,
			value: await input.run({
				...options,
				interactionGovernor: governor,
				preserveInteractionGovernorForProviderSession: true,
			}),
		};
	} catch (error) {
		outcome = "failed";
		effectState = input.mutability === "provider-mutating" ? "outcome-unknown" : "settled";
		const warning = classifyStructuredProviderWarning(error);
		if (warning) {
			try {
				await runtime.ledger.recordProviderWarning({
					scope: { provider: "chatgpt", tenantKey, runtimeProfileId, managedBrowserProfile },
					classification: warning.classification,
					reason: warning.reason,
					observedAt: now().toISOString(),
				});
			} catch (warningError) {
				warningRecordError = warningError;
			}
		}
		execution = { ok: false, error };
	}
	let settlementError: unknown = warningRecordError;
	try {
		await governor.finish({ outcome, effectState });
		const used = await runtime.registry.recordMeaningfulUse({
			claim: tab.claim,
			now: now().toISOString(),
			idleTtlMs: 5 * 60_000,
			effectState,
		});
		if (!used.ok) throw new Error(`ChatGPT utility heartbeat failed: ${used.conflict.kind}.`);
		const idled = await runtime.registry.idle({
			claim: used.value.claim,
			now: now().toISOString(),
			effectState,
		});
		if (!idled.ok)
			throw new Error(`ChatGPT utility idle transition failed: ${idled.conflict.kind}.`);
	} catch (error) {
		settlementError = error;
	}
	if (!execution.ok) throw execution.error;
	if (settlementError) throw settlementError;
	return execution.value;
}
