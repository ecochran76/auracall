import { randomUUID } from "node:crypto";

import { createBrowserInteractionGovernor } from "../../packages/browser-service/src/service/interactionGovernor.js";
import { createLedgerBackedBrowserInteractionGovernor } from "../../packages/browser-service/src/service/ledgerInteractionGovernor.js";
import type { BrowserMutationAuditSink } from "../../packages/browser-service/src/service/mutationDispatcher.js";
import {
	createProviderTrafficGovernor,
	type ProviderTrafficAuthorityFactory,
} from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
import type {
	TabLeaseClaim,
	TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { getCurrentTabLeaseOwnerIdentity } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import type { ResolvedUserConfig } from "../config.js";
import {
	resolveGrokBackendRequestBudgetWaitMs,
	resolveGrokBackendRequestsPerMinute,
	resolveGrokOperationBudgetWaitMs,
	resolveGrokOperationsPerMinute,
} from "../runtime/grokTrafficLimits.js";
import {
	resolveChatgptBackendRequestBudgetWaitMs,
	resolveChatgptBackendRequestsPerMinute,
	resolveChatgptInteractionsPerMinute,
} from "../runtime/tenantExecutionLimits.js";
import { probeChatgptRateLimitWarning } from "./chatgptProviderTraffic.js";
import { recordChatgptRateLimitDetection } from "./chatgptRateLimitGuard.js";
import { probeGrokRateLimitWarning } from "./grokProviderTraffic.js";
import {
	createOwnedBackendRequestAuthority,
	validateBackendRequestLimit,
} from "./ownedBackendRequestAuthority.js";
import type { ProviderId } from "./providers/domain.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import { createBrowserTabConcurrencyRuntime } from "./tabConcurrencyRuntime.js";

const PROVIDER_TRAFFIC_IDLE_TTL_MS = 5 * 60_000;
const PROVIDER_TRAFFIC_ABSOLUTE_TTL_MS = 60 * 60_000;

export function createConfiguredProviderTrafficAuthorityFactory(input: {
	userConfig: ResolvedUserConfig;
	mutationAudit: BrowserMutationAuditSink;
	provider: ProviderId;
	managedBrowserProfile: string;
	baseOptions: BrowserProviderListOptions;
	now?: () => Date;
	backendRequestLimit?: number;
}): ProviderTrafficAuthorityFactory {
	let backendRequestLimit =
		input.backendRequestLimit ??
		(input.provider === "chatgpt"
			? resolveChatgptBackendRequestsPerMinute(
					input.userConfig as Record<string, unknown>,
					input.userConfig.auracallProfile?.trim() || "default",
				)
			: input.provider === "grok"
				? resolveGrokBackendRequestsPerMinute(
						input.userConfig as Record<string, unknown>,
						input.userConfig.auracallProfile?.trim() || "default",
					)
				: undefined);
	if (input.provider === "grok") {
		const configuredLimit = resolveGrokBackendRequestsPerMinute(
			input.userConfig as Record<string, unknown>,
			input.userConfig.auracallProfile?.trim() || "default",
		);
		if (configuredLimit !== undefined)
			backendRequestLimit = Math.min(backendRequestLimit ?? configuredLimit, configuredLimit);
	}
	const budgetWaitTimeoutMs =
		input.provider === "grok"
			? resolveGrokBackendRequestBudgetWaitMs(
					input.userConfig as Record<string, unknown>,
					input.userConfig.auracallProfile?.trim() || "default",
				)
			: resolveChatgptBackendRequestBudgetWaitMs(
					input.userConfig as Record<string, unknown>,
					input.userConfig.auracallProfile?.trim() || "default",
				);
	validateBackendRequestLimit(backendRequestLimit);
	const grokOperationLimit =
		input.provider === "grok"
			? resolveGrokOperationsPerMinute(
					input.userConfig as Record<string, unknown>,
					input.userConfig.auracallProfile?.trim() || "default",
				)
			: null;
	const grokOperationWaitMs =
		input.provider === "grok"
			? resolveGrokOperationBudgetWaitMs(
					input.userConfig as Record<string, unknown>,
					input.userConfig.auracallProfile?.trim() || "default",
				)
			: 0;
	const now = input.now ?? (() => new Date());
	const runtime = createBrowserTabConcurrencyRuntime(input.userConfig);
	if (!runtime.registry || !runtime.ledger) {
		throw new Error("Provider traffic authority requires durable coordination stores.");
	}
	const registry = runtime.registry;
	const ledger = runtime.ledger;
	const runtimeProfileId = input.userConfig.auracallProfile?.trim() || "default";
	const managedBrowserProfile = requireValue(
		input.managedBrowserProfile,
		"managed browser profile",
	);
	const tenantKey =
		resolveConfiguredServiceAccountId(input.userConfig as Record<string, unknown>, {
			serviceId: input.provider,
			runtimeProfileId,
		}) ?? `managed-browser:${managedBrowserProfile}`;
	const scope: TabLeaseScope = {
		runtimeProfileId,
		managedBrowserProfile,
		service: input.provider,
		tenantKey,
	};

	return {
		backendRequestAdmissionEnabled:
			input.provider === "grok" ||
			(input.provider === "chatgpt" && backendRequestLimit !== undefined),
		async acquire({ targetId, borrowedLease }) {
			const operationId = borrowedLease?.claim.operationId ?? `provider-traffic-${randomUUID()}`;
			const workloadId = `provider-client:${operationId}`;
			if (input.provider === "grok") {
				const legacy = (await registry.list({ scope })).find(
					(lease) =>
						lease.state !== "released" &&
						!lease.exclusiveGroup &&
						lease.workload.kind === "ephemeral" &&
						lease.workload.operationId === "grok-serialized-utility",
				);
				if (legacy)
					throw new Error("Legacy Grok utility custody must settle before new utility admission.");
			}
			const borrowed = borrowedLease
				? (await registry.list({ scope, states: ["active"] })).find(
						(lease) => lease.leaseId === borrowedLease.claim.leaseId,
					)
				: undefined;
			if (
				borrowedLease &&
				(!borrowed ||
					input.provider !== "grok" ||
					borrowed.exclusiveGroup !== "grok-serialized-utility" ||
					borrowed.targetId !== targetId ||
					borrowed.ownerProcessId !== getCurrentTabLeaseOwnerIdentity().processId ||
					borrowed.ownerInstanceId !== getCurrentTabLeaseOwnerIdentity().instanceId ||
					borrowed.revision !== borrowedLease.claim.revision ||
					borrowed.ownerOperationId !== borrowedLease.claim.operationId ||
					Object.entries(scope).some(
						([key, value]) => borrowedLease.scope[key as keyof TabLeaseScope] !== value,
					))
			)
				throw new Error("Borrowed provider traffic lease does not match active target custody.");
			const reserved =
				borrowed && borrowedLease
					? { ok: true as const, value: { lease: borrowed, claim: borrowedLease.claim } }
					: await registry.reserve({
							scope,
							targetId: requireValue(targetId, "target ID"),
							workload: {
								kind: "ephemeral",
								operationId: input.provider === "grok" ? "grok-serialized-utility" : operationId,
							},
							operationId,
							now: now().toISOString(),
							idleTtlMs: PROVIDER_TRAFFIC_IDLE_TTL_MS,
							absoluteTtlMs: PROVIDER_TRAFFIC_ABSOLUTE_TTL_MS,
							...(input.provider === "grok" ? { exclusiveGroup: "grok-serialized-utility" } : {}),
						});
			if (!reserved.ok) {
				throw new Error(`Provider traffic lease reservation failed: ${reserved.conflict.kind}.`);
			}
			let claim: TabLeaseClaim = reserved.value.claim;
			const assertOwnedLease = async () => {
				const lease = (await registry.list({ scope, states: ["active"] })).find(
					(candidate) => candidate.leaseId === reserved.value.lease.leaseId,
				);
				if (
					!lease ||
					lease.ownerOperationId !== operationId ||
					lease.targetId !== targetId ||
					lease.revision !== claim.revision
				) {
					throw new Error("Provider traffic lease ownership changed before physical action.");
				}
			};
			const backendRequests =
				input.provider === "grok" ||
				(input.provider === "chatgpt" && backendRequestLimit !== undefined)
					? createOwnedBackendRequestAuthority({
							ledger,
							scope: {
								provider: input.provider,
								tenantKey,
								runtimeProfileId,
								managedBrowserProfile,
							},
							workloadId,
							operationId,
							tabLeaseId: reserved.value.lease.leaseId,
							backendRequestLimit,
							observeWithoutLocalCeiling: input.provider === "grok",
							budgetWaitTimeoutMs,
							abortSignal: input.baseOptions.abortSignal,
							assertOwnedLease,
							now,
						})
					: undefined;
			const interactionGovernor = createLedgerBackedBrowserInteractionGovernor({
				admissionWaitTimeoutMs: grokOperationWaitMs,
				assertAdmission: assertOwnedLease,
				ledger,
				scope: { provider: input.provider, tenantKey, runtimeProfileId, managedBrowserProfile },
				workloadId,
				operationId,
				tabLeaseId: reserved.value.lease.leaseId,
				policy: {
					maxConcurrentChats: null,
					maxConversationStartsPerHour: null,
					maxConversationStartsPerDay: null,
					maxInteractionsPerMinute:
						input.provider === "chatgpt"
							? resolveChatgptInteractionsPerMinute(
									input.userConfig as Record<string, unknown>,
									runtimeProfileId,
								)
							: input.provider === "grok"
								? grokOperationLimit
								: null,
				},
				baseGovernor:
					input.baseOptions.interactionGovernor ??
					createBrowserInteractionGovernor({ abortSignal: input.baseOptions.abortSignal }),
				now,
			});
			const governor = createProviderTrafficGovernor({
				attribution: {
					provider: input.provider,
					runtimeProfileId,
					managedBrowserProfile,
					workloadId,
					operationId,
					tabLeaseId: reserved.value.lease.leaseId,
					targetId,
				},
				interactionGovernor,
				mutationAudit: input.baseOptions.mutationAudit ?? input.mutationAudit,
				settleInteraction: (settlement) => interactionGovernor.finish(settlement),
				assertLease: assertOwnedLease,
				admitBackendRequest:
					input.provider === "grok" ||
					(input.provider === "chatgpt" && backendRequestLimit !== undefined)
						? backendRequests?.admit
						: undefined,
				probeWarning:
					input.provider === "chatgpt"
						? probeChatgptRateLimitWarning
						: input.provider === "grok"
							? probeGrokRateLimitWarning
							: undefined,
				persistWarning:
					input.provider === "chatgpt" || input.provider === "grok"
						? async (warning) => {
								const observedAt = now();
								await ledger.recordProviderWarning({
									scope: {
										provider: input.provider,
										tenantKey,
										runtimeProfileId,
										managedBrowserProfile,
									},
									classification: warning.classification,
									reason: warning.reason,
									observedAt: observedAt.toISOString(),
									cooldownUntil: warning.cooldownUntil,
								});
								if (input.provider === "chatgpt")
									await recordChatgptRateLimitDetection({
										profileName: runtimeProfileId,
										managedProfileDir: managedBrowserProfile,
										action: `provider-traffic:${operationId}`,
										reason: warning.reason,
										now: observedAt.getTime(),
									});
							}
						: undefined,
			});
			let closed = false;
			return {
				governor,
				async close(settlement = {}) {
					if (closed) return;
					closed = true;
					const effectState =
						(await backendRequests?.reconcileEffectState(settlement.effectState ?? "settled")) ??
						settlement.effectState ??
						"settled";
					await interactionGovernor.close({ ...settlement, effectState });
					if (borrowedLease) {
						if (effectState === "outcome-unknown")
							throw new Error("Borrowed provider traffic request cleanup remains uncertain.");
						return;
					}
					const used = await registry.recordMeaningfulUse({
						claim,
						now: now().toISOString(),
						idleTtlMs: PROVIDER_TRAFFIC_IDLE_TTL_MS,
						effectState,
					});
					if (!used.ok) {
						throw new Error(`Provider traffic lease settlement failed: ${used.conflict.kind}.`);
					}
					claim = used.value.claim;
					const idled = await registry.idle({
						claim,
						now: now().toISOString(),
						effectState,
					});
					if (!idled.ok) {
						throw new Error(`Provider traffic lease idle failed: ${idled.conflict.kind}.`);
					}
					const released = await registry.releasePreserved({
						leaseId: idled.value.leaseId,
						expectedRevision: idled.value.revision,
						now: now().toISOString(),
					});
					if (!released.ok) {
						throw new Error(`Provider traffic lease release failed: ${released.conflict.kind}.`);
					}
				},
			};
		},
	};
}

function requireValue(value: string, name: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`Provider traffic authority requires ${name}.`);
	return normalized;
}
