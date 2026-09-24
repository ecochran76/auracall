import {
	closeRemoteChromeTarget,
	listChromeTargets,
} from "../../packages/browser-service/src/chromeLifecycle.js";
import {
	type BrowserTabLeaseRegistry,
	getCurrentTabLeaseOwnerIdentity,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { reconcileStaleActiveTabLeases } from "../../packages/browser-service/src/service/tabLeaseRestartReconciliation.js";
import { getCurrentRuntimeProfiles } from "../config/model.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import type { ResolvedUserConfig } from "../config.js";
import {
	chatgptTargetMatchesLease,
	retireExpiredChatgptTabLeases,
} from "./chatgptTabRetirement.js";
import { BrowserService } from "./service/browserService.js";
import { resolveRuntimeProfileUserConfig } from "./service/profileConfig.js";
import { createBrowserTabConcurrencyRuntime } from "./tabConcurrencyRuntime.js";

export interface ConfiguredChatgptTabMaintenanceSummary {
	configuredScopeCount: number;
	visitedScopeCount: number;
	deferredScopeCount: number;
	closedCount: number;
	alreadyMissingCount: number;
	preservedCount: number;
	restartLostCount: number;
	restartMissingReleasedCount: number;
	restartPreservedCount: number;
	restartIdentityMismatchCount: number;
	liveChatgptTargetCount: number;
	fencedLiveTargetCount: number;
	unleasedLiveTargetCount: number;
	targetCensusErrorCount: number;
	errors: Array<{ runtimeProfileId: string; message: string }>;
}

interface MaintenanceBrowserService {
	resolveServiceTarget(input: {
		serviceId: "chatgpt";
		configuredUrl: string;
		ensurePort: false;
		abortSignal?: AbortSignal;
	}): Promise<{
		host?: string;
		port?: number;
		managedBrowserProfile?: string | null;
	}>;
}

export interface ConfiguredChatgptTabMaintenanceDeps {
	createRuntime?: (config: ResolvedUserConfig) => {
		registry: BrowserTabLeaseRegistry | null;
	};
	createBrowserService?: (config: ResolvedUserConfig) => MaintenanceBrowserService;
	listTargets?: typeof listChromeTargets;
	closeTarget?: typeof closeRemoteChromeTarget;
	currentOwner?: { processId: number; instanceId: string };
	isOwnerAlive?: (processId: number) => boolean;
}

export async function runConfiguredChatgptTabMaintenance(input: {
	userConfig: ResolvedUserConfig;
	now?: () => Date;
	abortSignal?: AbortSignal;
	deps?: ConfiguredChatgptTabMaintenanceDeps;
}): Promise<ConfiguredChatgptTabMaintenanceSummary> {
	const summary: ConfiguredChatgptTabMaintenanceSummary = {
		configuredScopeCount: 0,
		visitedScopeCount: 0,
		deferredScopeCount: 0,
		closedCount: 0,
		alreadyMissingCount: 0,
		preservedCount: 0,
		restartLostCount: 0,
		restartMissingReleasedCount: 0,
		restartPreservedCount: 0,
		restartIdentityMismatchCount: 0,
		liveChatgptTargetCount: 0,
		fencedLiveTargetCount: 0,
		unleasedLiveTargetCount: 0,
		targetCensusErrorCount: 0,
		errors: [],
	};
	const deps = input.deps ?? {};
	const configuredRuntimeProfileIds = Object.keys(
		getCurrentRuntimeProfiles(input.userConfig as Record<string, unknown>),
	).sort();
	const fallbackRuntimeProfileId =
		typeof input.userConfig.auracallProfile === "string" && input.userConfig.auracallProfile.trim()
			? input.userConfig.auracallProfile.trim()
			: typeof input.userConfig.defaultRuntimeProfile === "string" &&
					input.userConfig.defaultRuntimeProfile.trim()
				? input.userConfig.defaultRuntimeProfile.trim()
				: "default";
	const runtimeProfileIds =
		configuredRuntimeProfileIds.length > 0
			? configuredRuntimeProfileIds
			: [fallbackRuntimeProfileId];
	const seenScopes = new Set<string>();

	for (const runtimeProfileId of runtimeProfileIds) {
		if (input.abortSignal?.aborted) break;
		try {
			const config = resolveRuntimeProfileUserConfig(input.userConfig, {
				runtimeProfileId,
				provider: "chatgpt",
			}) as ResolvedUserConfig;
			if (config.browser?.tabConcurrencyMode !== "tab-affinity") continue;
			summary.configuredScopeCount += 1;
			const tenantKey = resolveConfiguredServiceAccountId(config as Record<string, unknown>, {
				serviceId: "chatgpt",
				runtimeProfileId,
			});
			if (!tenantKey) throw new Error("configured ChatGPT tenant identity is missing");

			const runtime = (deps.createRuntime ?? createBrowserTabConcurrencyRuntime)(config);
			if (!runtime.registry) throw new Error("tab-affinity registry is unavailable");
			const browserService =
				deps.createBrowserService?.(config) ?? BrowserService.fromConfig(config, "chatgpt");
			const configuredUrl =
				config.browser?.chatgptUrl ?? config.browser?.url ?? "https://chatgpt.com/";
			const target = await browserService.resolveServiceTarget({
				serviceId: "chatgpt",
				configuredUrl,
				ensurePort: false,
				abortSignal: input.abortSignal,
			});
			const managedBrowserProfile = target.managedBrowserProfile?.trim();
			if (!managedBrowserProfile) throw new Error("managed browser profile is unresolved");
			const scopeKey = [runtimeProfileId, managedBrowserProfile, tenantKey].join("\u0000");
			if (seenScopes.has(scopeKey)) continue;
			seenScopes.add(scopeKey);
			summary.visitedScopeCount += 1;
			const endpoint =
				target.host && target.port
					? { host: target.host, port: target.port, managedBrowserProfile }
					: null;
			const listTargets = deps.listTargets ?? listChromeTargets;
			const closeTarget = deps.closeTarget ?? closeRemoteChromeTarget;
			const scope = {
				runtimeProfileId,
				managedBrowserProfile,
				service: "chatgpt",
				tenantKey,
			};
			const staleActive = await reconcileStaleActiveTabLeases({
				registry: runtime.registry,
				scope,
				now: input.now,
				currentOwner: deps.currentOwner ?? getCurrentTabLeaseOwnerIdentity(),
				isOwnerAlive: deps.isOwnerAlive,
			});
			for (const stale of staleActive) {
				if (stale.disposition !== "lost" || stale.lostRevision === undefined) continue;
				summary.restartLostCount += 1;
				if (!endpoint) {
					summary.deferredScopeCount += 1;
					continue;
				}
				const targetMatch = await listTargets(endpoint.port, endpoint.host);
				const target = targetMatch.find((candidate) => {
					const record = candidate as { id?: string; targetId?: string };
					return (record.targetId ?? record.id) === stale.targetId;
				}) as { url?: string } | undefined;
				if (!target) {
					const released = await runtime.registry.releaseLost({
						leaseId: stale.leaseId,
						expectedRevision: stale.lostRevision,
						now: (input.now ?? (() => new Date()))().toISOString(),
						disposition: "already-missing",
					});
					if (released.ok) summary.restartMissingReleasedCount += 1;
					else summary.deferredScopeCount += 1;
					continue;
				}
				const lostLease = (await runtime.registry.list({ states: ["lost"] })).find(
					(lease) => lease.leaseId === stale.leaseId,
				);
				if (!lostLease || !chatgptTargetMatchesLease(lostLease, { url: target.url ?? "" })) {
					summary.restartIdentityMismatchCount += 1;
					continue;
				}
				summary.restartPreservedCount += 1;
			}
			const outcomes = await retireExpiredChatgptTabLeases({
				registry: runtime.registry,
				scope,
				endpoint,
				now: input.now,
				inspectTarget: async (resolvedEndpoint, targetId) => {
					const targets = await listTargets(resolvedEndpoint.port, resolvedEndpoint.host);
					const match = targets.find((candidate) => {
						const record = candidate as { id?: string; targetId?: string };
						return (record.targetId ?? record.id) === targetId;
					}) as { url?: string } | undefined;
					return typeof match?.url === "string" ? { url: match.url } : null;
				},
				closeTarget: (resolvedEndpoint, targetId) =>
					closeTarget(resolvedEndpoint.host, resolvedEndpoint.port, targetId, () => undefined),
			});
			for (const outcome of outcomes) {
				if (outcome.disposition === "deferred") summary.deferredScopeCount += 1;
				if (outcome.disposition === "closed") summary.closedCount += 1;
				if (outcome.disposition === "already-missing") summary.alreadyMissingCount += 1;
				if (outcome.disposition === "preserved") summary.preservedCount += 1;
			}
			if (endpoint) {
				try {
					const [targets, fencedTargetIds] = await Promise.all([
						listTargets(endpoint.port, endpoint.host),
						runtime.registry.listFencedTargetIds(scope),
					]);
					const fenced = new Set(fencedTargetIds);
					const chatgptTargets = targets.filter((candidate) => {
						const record = candidate as { type?: string; url?: string };
						if (record.type && record.type !== "page") return false;
						try {
							return new URL(record.url ?? "").hostname === "chatgpt.com";
						} catch {
							return false;
						}
					});
					const fencedLiveCount = chatgptTargets.filter((candidate) => {
						const record = candidate as { id?: string; targetId?: string };
						const targetId = record.targetId ?? record.id;
						return Boolean(targetId && fenced.has(targetId));
					}).length;
					summary.liveChatgptTargetCount += chatgptTargets.length;
					summary.fencedLiveTargetCount += fencedLiveCount;
					summary.unleasedLiveTargetCount += chatgptTargets.length - fencedLiveCount;
				} catch {
					summary.targetCensusErrorCount += 1;
				}
			}
		} catch (error) {
			summary.errors.push({
				runtimeProfileId,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return summary;
}
