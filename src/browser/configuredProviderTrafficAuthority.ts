import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { withCdpCommandAbortSignal } from "../../packages/browser-service/src/guardedCdp.js";
import { createBrowserInteractionGovernor } from "../../packages/browser-service/src/service/interactionGovernor.js";
import { createLedgerBackedBrowserInteractionGovernor } from "../../packages/browser-service/src/service/ledgerInteractionGovernor.js";
import type { BrowserMutationAuditSink } from "../../packages/browser-service/src/service/mutationDispatcher.js";
import {
	createProviderTrafficGovernor,
	type ProviderTrafficAuthorityFactory,
} from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
import type {
	BrowserTabLease,
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
import type {
	GrokUnknownConnectorObservation,
	GrokUnknownObservationRequest,
} from "./grokUnknownConnectorObservation.js";
import {
	createOwnedBackendRequestAuthority,
	validateBackendRequestLimit,
} from "./ownedBackendRequestAuthority.js";
import type { ProviderId } from "./providers/domain.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import { createBrowserTabConcurrencyRuntime } from "./tabConcurrencyRuntime.js";

const PROVIDER_TRAFFIC_IDLE_TTL_MS = 5 * 60_000;
const PROVIDER_TRAFFIC_ABSOLUTE_TTL_MS = 60 * 60_000;

interface ConfiguredProviderTrafficInput {
	userConfig: ResolvedUserConfig;
	mutationAudit: BrowserMutationAuditSink;
	provider: ProviderId;
	managedBrowserProfile: string;
	baseOptions: BrowserProviderListOptions;
	now?: () => Date;
	backendRequestLimit?: number;
}
export function createConfiguredProviderTrafficAuthorityFactory(
	input: ConfiguredProviderTrafficInput,
): ProviderTrafficAuthorityFactory {
	return buildConfiguredProviderTrafficAuthorityFactory(input);
}
function buildConfiguredProviderTrafficAuthorityFactory(
	input: ConfiguredProviderTrafficInput,
	observation: { lease: BrowserTabLease; assertCurrent: () => Promise<void> } | null = null,
): ProviderTrafficAuthorityFactory {
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
			if (observation) {
				if (
					borrowedLease ||
					targetId !== observation.lease.targetId ||
					input.provider !== "grok" ||
					Object.entries(scope).some(
						([key, value]) => observation.lease.scope[key as keyof TabLeaseScope] !== value,
					)
				)
					throw Error("grok_unknown_observation_scope_mismatch");
				await observation.assertCurrent();
			}
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
			const reserved = observation
				? undefined
				: borrowed && borrowedLease
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
			if (reserved && !reserved.ok) {
				throw new Error(`Provider traffic lease reservation failed: ${reserved.conflict.kind}.`);
			}
			const pinnedLease = observation?.lease ?? (reserved?.ok ? reserved.value.lease : undefined);
			if (!pinnedLease) throw Error("Provider traffic lease unavailable.");
			let claim: TabLeaseClaim | undefined = reserved?.ok ? reserved.value.claim : undefined;
			const assertOwnedLease = async () => {
				if (observation) {
					await observation.assertCurrent();
					return;
				}
				const lease = (await registry.list({ scope, states: ["active"] })).find(
					(candidate) => candidate.leaseId === pinnedLease.leaseId,
				);
				if (
					!lease ||
					lease.ownerOperationId !== operationId ||
					lease.targetId !== targetId ||
					lease.revision !== claim?.revision
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
							tabLeaseId: pinnedLease.leaseId,
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
				tabLeaseId: pinnedLease.leaseId,
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
					tabLeaseId: pinnedLease.leaseId,
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
				governor: observation
					? {
							...governor,
							begin: async (action) => {
								if (action.kind !== "provider-read")
									throw Error("grok_unknown_observation_read_only");
								return governor.begin(action);
							},
						}
					: governor,
				async close(settlement = {}) {
					if (closed) return;
					closed = true;
					const effectState =
						(await backendRequests?.reconcileEffectState(settlement.effectState ?? "settled")) ??
						settlement.effectState ??
						"settled";
					await interactionGovernor.close({ ...settlement, effectState });
					if (observation) {
						await observation.assertCurrent();
						if (effectState === "outcome-unknown")
							throw Error("grok_unknown_observation_cleanup_unknown");
						return;
					}
					if (borrowedLease) {
						if (effectState === "outcome-unknown")
							throw new Error("Borrowed provider traffic request cleanup remains uncertain.");
						return;
					}
					if (!claim) throw Error("Provider traffic lease claim unavailable.");
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

/** Fixed read-only outcome observation. Never returns browser or mutation authority. */
export async function observeConfiguredGrokUnknownConnectorOutcome(
	config: ResolvedUserConfig,
	rawRequest: unknown,
	signal?: AbortSignal,
) {
	return withCdpCommandAbortSignal(signal, () =>
		observeGrokUnknownOutcome(config, rawRequest, signal),
	);
}
async function observeGrokUnknownOutcome(
	config: ResolvedUserConfig,
	rawRequest: unknown,
	signal?: AbortSignal,
) {
	const { grokUnknownObservationRequestSchema, readGrokUnknownConnectorObservation } = await import(
		"./grokUnknownConnectorObservation.js"
	);
	const request = grokUnknownObservationRequestSchema.parse(rawRequest);
	signal?.throwIfAborted();
	const { resolveGrokReadSessionOptions } = await import("./configuredGrokDiscovery.js");
	const options = await resolveGrokReadSessionOptions(
		config,
		request.scope.runtimeProfileId,
		signal,
		{ ensurePort: false, tabTargetId: request.targetId },
	);
	const context = options.providerSessionAuthorization?.context;
	if (
		!context ||
		context.providerId !== "grok" ||
		context.auracallRuntimeProfile !== request.scope.runtimeProfileId ||
		context.managedBrowserProfile !== request.scope.managedBrowserProfile ||
		context.browserProcessId !== request.browserProcessId ||
		!["127.0.0.1", "localhost"].includes(options.host ?? "") ||
		!options.port ||
		!options.mutationAudit
	)
		throw Error("grok_unknown_observation_browser_mismatch");
	const { resolveRuntimeProfileUserConfig } = await import("./service/profileConfig.js");
	const selected = {
		...resolveRuntimeProfileUserConfig(config, {
			runtimeProfileId: request.scope.runtimeProfileId,
			provider: "grok",
		}),
		auracallProfile: request.scope.runtimeProfileId,
	} as ResolvedUserConfig;
	const registry = createBrowserTabConcurrencyRuntime(selected).registry;
	if (!registry) throw Error("grok_unknown_observation_registry_missing");
	const lease = (await registry.list()).find((item) => item.leaseId === request.leaseId);
	assertObservationLease(lease, request);
	const original = JSON.stringify(lease);
	const assertCurrent = async () => {
		signal?.throwIfAborted();
		const stat = await readFile(`/proc/${request.browserProcessId}/stat`, "utf8");
		const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
		if (fields[0] === "Z" || fields[19] !== request.browserStartTime)
			throw Error("grok_unknown_observation_browser_mismatch");
		const current = (await registry.list()).find((item) => item.leaseId === request.leaseId);
		assertObservationLease(current, request);
		if (JSON.stringify(current) !== original) throw Error("grok_unknown_observation_lease_changed");
	};
	await assertCurrent();
	const factory = buildConfiguredProviderTrafficAuthorityFactory(
		{
			userConfig: selected,
			provider: "grok",
			managedBrowserProfile: request.scope.managedBrowserProfile,
			mutationAudit: options.mutationAudit,
			baseOptions: options,
		},
		{ lease, assertCurrent },
	);
	const { connectToGrokTab, checkGrokBrowserAuthPreflight } = await import(
		"./providers/grokAdapter.js"
	);
	const connection = await connectToGrokTab({
		...options,
		tabTargetId: request.targetId,
		tabUrl: undefined,
		allowNavigation: false,
		tabLifecycle: "retain",
		providerTrafficRequired: true,
		providerTrafficGovernor: undefined,
		historyOwnedLease: undefined,
		providerTrafficAuthorityFactory: factory,
	});
	const { resolveProviderTrafficGovernor } = await import("./providers/mutationAudit.js");
	let failed: { error: unknown } | undefined;
	let observationResult: GrokUnknownConnectorObservation | undefined;
	try {
		if (
			connection.targetId !== request.targetId ||
			connection.host !== options.host ||
			connection.port !== options.port
		)
			throw Error("grok_unknown_observation_browser_mismatch");
		const governor = resolveProviderTrafficGovernor(connection.client);
		if (!governor || !governor.admitBackendRequest)
			throw Error("grok_unknown_observation_governor_missing");
		const runtime = {
			evaluate: async (args: Parameters<typeof connection.client.Runtime.evaluate>[0]) => {
				await assertCurrent();
				const result = await connection.client.Runtime.evaluate(args);
				await assertCurrent();
				return result;
			},
		};
		const action = await governor.begin({
			kind: "provider-read",
			interactionClass: "generic",
			source: "provider:grok:unknown-connector-observation",
			targetId: request.targetId,
			abortSignal: signal,
		});
		const verify = async () => {
			const proof = await checkGrokBrowserAuthPreflight(
				runtime as typeof connection.client.Runtime,
				options,
			);
			const { projectGrokAccountReference } = await import("./grokAccountReference.js");
			if (
				!proof.ok ||
				projectGrokAccountReference(proof.actualIdentity, "typed-v1") !==
					request.expectedProviderAccountRef
			)
				throw Error("grok_unknown_observation_account_mismatch");
		};
		let settlementStarted = false;
		try {
			await governor.checkWarning?.(runtime);
			await verify();
			const result = await readGrokUnknownConnectorObservation(runtime, request);
			await verify();
			await assertCurrent();
			settlementStarted = true;
			await action.settle({ outcome: "succeeded", effectState: "none", probeContext: runtime });
			observationResult = result;
		} catch (error) {
			if (!settlementStarted) {
				settlementStarted = true;
				try {
					await action.settle({
						outcome: "failed",
						effectState: "none",
						error: "grok_unknown_observation_failed",
					});
				} catch (settlementError) {
					throw new AggregateError(
						[error, settlementError],
						error instanceof Error ? error.message : "grok_unknown_observation_failed",
					);
				}
			}
			throw error;
		}
	} catch (error) {
		failed = { error };
	}
	try {
		await connection.client.close();
		await assertCurrent();
	} catch (cleanupError) {
		if (failed)
			throw new AggregateError(
				[failed.error, cleanupError],
				failed.error instanceof Error ? failed.error.message : "grok_unknown_observation_failed",
			);
		throw cleanupError;
	}
	if (failed) throw failed.error;
	if (!observationResult) throw Error("grok_unknown_observation_result_missing");
	return observationResult;
}

function assertObservationLease(
	lease: BrowserTabLease | undefined,
	request: GrokUnknownObservationRequest,
): asserts lease is BrowserTabLease {
	if (
		!lease ||
		lease.revision !== request.expectedRevision ||
		lease.targetId !== request.targetId ||
		!["idle", "lost"].includes(lease.state) ||
		lease.effectState !== "outcome-unknown" ||
		lease.ownerOperationId ||
		lease.ownerProcessId ||
		lease.ownerInstanceId ||
		lease.processBinding ||
		Object.entries(request.scope).some(
			([key, value]) => lease.scope[key as keyof TabLeaseScope] !== value,
		)
	)
		throw Error("grok_unknown_observation_lease_mismatch");
}
