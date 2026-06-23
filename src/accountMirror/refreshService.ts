import path from "node:path";
import { randomUUID } from "node:crypto";
import { getAuracallHomeDir } from "../auracallHome.js";
import type { ResolvedUserConfig } from "../config.js";
import { readChatgptRateLimitGuardState } from "../browser/chatgptRateLimitGuard.js";
import type { ConversationArtifact, FileRef } from "../browser/providers/domain.js";
import { resolveManagedBrowserLaunchContextFromResolvedConfig } from "../browser/service/profileResolution.js";
import { listChromeTargets } from "../../packages/browser-service/src/chromeLifecycle.js";
import { findChromePidUsingUserDataDir } from "../../packages/browser-service/src/processCheck.js";
import {
	createFileBackedBrowserOperationDispatcher,
	formatBrowserOperationBusyResult,
	type BrowserOperationAcquiredResult,
	type BrowserOperationDispatcher,
	type BrowserOperationRecord,
} from "../../packages/browser-service/src/service/operationDispatcher.js";
import { listInstancesWithLiveness } from "../../packages/browser-service/src/service/stateRegistry.js";
import {
	recordBrowserOperationQueueObservation,
	type BrowserOperationQueueObservation,
	summarizeBrowserOperationQueueObservationsByKey,
} from "../browser/operationQueueObservations.js";
import { recordDomDriftObservation } from "../browser/domDriftObservations.js";
import type { AccountMirrorProvider } from "./politePolicy.js";
import type {
	AccountMirrorProviderGuardKind,
	AccountMirrorProviderGuardState,
} from "./politePolicy.js";
import type {
	AccountMirrorMetadataEvidence,
	AccountMirrorMetadataCounts,
	AccountMirrorStatusEntry,
	AccountMirrorStatusRegistry,
	AccountMirrorStatusSummary,
	AccountMirrorStatusState,
} from "./statusRegistry.js";
import { createAccountMirrorStatusRegistry } from "./statusRegistry.js";
import {
	AccountMirrorIdentityMismatchError,
	createChatgptAccountMirrorMetadataCollector,
	type AccountMirrorMetadataCollector,
	type AccountMirrorMetadataCollectorResult,
	type AccountMirrorVerifiedIdentityEvidence,
} from "./chatgptMetadataCollector.js";
import {
	createAccountMirrorPersistence,
	type AccountMirrorPersistence,
} from "./cachePersistence.js";

export interface AccountMirrorRefreshRequest {
	provider?: AccountMirrorProvider | null;
	runtimeProfileId?: string | null;
	sweepMode?: "steady_follow" | "full_sweep" | null;
	explicitRefresh?: boolean;
	ignoreMinimumInterval?: boolean;
	ignoreFailureBackoff?: boolean;
	queueTimeoutMs?: number;
	queuePollMs?: number;
	collectorTimeoutMs?: number;
	cleanupManagedBrowserAfterRefresh?: boolean;
}

export interface AccountMirrorRefreshBrowserLifecycle {
	cleanupRequested: boolean;
	status: "not_requested" | "not_running" | "terminated" | "failed";
	managedProfileDir: string | null;
	pid: number | null;
	message: string | null;
}

export interface AccountMirrorRefreshResult {
	object: "account_mirror_refresh";
	requestId: string;
	status: "completed" | "blocked" | "busy";
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	startedAt: string;
	completedAt: string | null;
	dispatcher: {
		key: string | null;
		operationId: string | null;
		blockedBy: Record<string, unknown> | null;
	};
	metadataCounts: AccountMirrorMetadataCounts;
	metadataEvidence: AccountMirrorMetadataEvidence | null;
	mirrorCompleteness: AccountMirrorStatusEntry["mirrorCompleteness"];
	detectedIdentityKey: string | null;
	detectedAccountLevel: string | null;
	mirrorStatus: AccountMirrorStatusSummary;
	browserLifecycle?: AccountMirrorRefreshBrowserLifecycle | null;
}

export class AccountMirrorRefreshError extends Error {
	constructor(
		readonly statusCode: 400 | 404 | 409 | 503,
		readonly code: string,
		message: string,
		readonly details: Record<string, unknown> = {},
	) {
		super(message);
		this.name = "AccountMirrorRefreshError";
	}
}

export interface AccountMirrorRefreshService {
	requestRefresh(request?: AccountMirrorRefreshRequest): Promise<AccountMirrorRefreshResult>;
}

function createEmptyMetadataEvidence(): AccountMirrorMetadataEvidence {
	return {
		identitySource: null,
		projectSampleIds: [],
		conversationSampleIds: [],
		truncated: {
			projects: false,
			conversations: false,
			artifacts: false,
		},
	};
}

export type AccountMirrorProviderGuardCensusInput = {
	config: Record<string, unknown> | null | undefined;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	detectedAtMs: number;
};

export type AccountMirrorProviderGuardCensus = (
	input: AccountMirrorProviderGuardCensusInput,
) => Promise<AccountMirrorProviderGuardState | null>;

type AccountMirrorYieldCause = NonNullable<
	NonNullable<AccountMirrorMetadataEvidence["attachmentInventory"]>["yieldCause"]
>;

type AccountMirrorProviderCooldown = {
	providerCooldownUntilMs: number;
	providerGuard: AccountMirrorProviderGuardState;
};

export function createAccountMirrorRefreshService(input: {
	config: Record<string, unknown> | null | undefined;
	registry?: AccountMirrorStatusRegistry;
	dispatcher?: BrowserOperationDispatcher;
	metadataCollector?: AccountMirrorMetadataCollector;
	persistence?: AccountMirrorPersistence;
	providerGuardCensus?: AccountMirrorProviderGuardCensus;
	findManagedBrowserPid?: (managedProfileDir: string) => Promise<number | null>;
	terminateManagedBrowserProcess?: (input: {
		pid: number;
		managedProfileDir: string;
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
	}) => Promise<void>;
	now?: () => Date;
	generateRequestId?: () => string;
}): AccountMirrorRefreshService {
	const now = input.now ?? (() => new Date());
	const registry =
		input.registry ??
		createAccountMirrorStatusRegistry({
			config: input.config,
			now,
		});
	const dispatcher =
		input.dispatcher ??
		createFileBackedBrowserOperationDispatcher({
			lockRoot: path.join(getAuracallHomeDir(), "browser-operations"),
		});
	const metadataCollector =
		input.metadataCollector ??
		(isResolvedUserConfig(input.config)
			? createChatgptAccountMirrorMetadataCollector(input.config)
			: createConfigBackedAccountMirrorMetadataCollector(input.config));
	const persistence =
		input.persistence ??
		createAccountMirrorPersistence({
			config: input.config,
		});
	const providerGuardCensus = input.providerGuardCensus ?? detectProviderGuardWithTargetCensus;
	const findManagedBrowserPid = input.findManagedBrowserPid ?? findChromePidUsingUserDataDir;
	const terminateManagedBrowserProcess =
		input.terminateManagedBrowserProcess ?? terminateManagedBrowserProcessByPid;
	const generateRequestId = input.generateRequestId ?? (() => `acctmirror_${randomUUID()}`);

	return {
		async requestRefresh(request = {}) {
			const provider = request.provider ?? "chatgpt";
			const runtimeProfileId = request.runtimeProfileId ?? "default";
			const requestId = generateRequestId();

			await registry.refreshPersistentState?.();
			const target = readSingleMirrorTarget({
				registry,
				provider,
				runtimeProfileId,
				explicitRefresh: request.explicitRefresh ?? true,
				ignoreMinimumInterval: request.ignoreMinimumInterval === true,
				ignoreFailureBackoff:
					request.explicitRefresh === true && request.ignoreFailureBackoff === true,
			});
			if (!target) {
				throw new AccountMirrorRefreshError(
					404,
					"account_mirror_target_not_found",
					`No configured account mirror target exists for ${provider}/${runtimeProfileId}.`,
					{ provider, runtimeProfileId },
				);
			}
			if (target.status !== "eligible") {
				throw new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					`Account mirror ${provider}/${runtimeProfileId} is ${target.status}: ${target.reason}.`,
					{
						provider,
						runtimeProfileId,
						reason: target.reason,
						eligibleAt: target.eligibleAt,
					},
				);
			}

			const queuedAt = now();
			const managedProfileDir = resolveMirrorManagedProfileDir({
				config: input.config,
				provider,
				runtimeProfileId,
				browserProfileId: target.browserProfileId,
			});
			registry.mergeState(
				{ provider, runtimeProfileId },
				{
					queued: true,
					running: false,
					lastRefreshRequestId: requestId,
					lastQueuedAtMs: queuedAt.getTime(),
					lastAttemptAtMs: queuedAt.getTime(),
					lastDispatcherBlockedBy: null,
				},
			);

			const operationInput = {
				managedProfileDir,
				serviceTarget: provider,
				kind: "browser-execution",
				operationClass: "exclusive-probe",
				ownerCommand: `account-mirror-refresh:${provider}:${runtimeProfileId}`,
			} as const;
			const acquired = await dispatcher.acquireQueued(operationInput, {
				timeoutMs: normalizeNonNegativeInteger(request.queueTimeoutMs, 30_000),
				pollMs: normalizePositiveInteger(request.queuePollMs, 1_000),
				onBlocked: (result) => {
					recordBrowserOperationQueueObservation({
						event: "queued",
						key: result.key,
						requested: operationInput,
						blockedBy: result.blockedBy,
					});
					registry.mergeState(
						{ provider, runtimeProfileId },
						{
							queued: true,
							running: false,
							lastDispatcherKey: result.key,
							lastDispatcherBlockedBy: summarizeBrowserOperation(result.blockedBy),
						},
					);
				},
			});

			if (!acquired.acquired) {
				const completedAt = now();
				const failureCount = resolveNextConsecutiveFailureCount(target);
				registry.mergeState(
					{ provider, runtimeProfileId },
					{
						queued: false,
						running: false,
						lastFailureAtMs: completedAt.getTime(),
						consecutiveFailureCount: failureCount,
						lastDispatcherKey: acquired.key,
						lastDispatcherBlockedBy: summarizeBrowserOperation(acquired.blockedBy),
					},
				);
				await persistRefreshState(persistence, {
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					boundIdentityKey: target.expectedIdentityKey,
					updatedAt: completedAt,
					state: {
						detectedIdentityKey: target.detectedIdentityKey,
						lastAttemptAtMs: queuedAt.getTime(),
						lastFailureAtMs: completedAt.getTime(),
						lastCompletedAtMs: completedAt.getTime(),
						consecutiveFailureCount: failureCount,
						lastRefreshRequestId: requestId,
						lastDispatcherKey: acquired.key,
						lastDispatcherBlockedBy: summarizeBrowserOperation(acquired.blockedBy),
						metadataCounts: target.metadataCounts,
						metadataEvidence: target.metadataEvidence,
					},
				});
				throw new AccountMirrorRefreshError(
					503,
					"account_mirror_browser_operation_busy",
					formatBrowserOperationBusyResult(acquired),
					{
						provider,
						runtimeProfileId,
						dispatcherKey: acquired.key,
						blockedBy: summarizeBrowserOperation(acquired.blockedBy),
					},
				);
			}

			const startedAt = now();
			registry.mergeState(
				{ provider, runtimeProfileId },
				{
					queued: false,
					running: true,
					lastStartedAtMs: startedAt.getTime(),
					lastDispatcherKey: acquired.operation.key,
					lastDispatcherOperationId: acquired.operation.id,
					lastDispatcherBlockedBy: null,
				},
			);

			let collection: AccountMirrorMetadataCollectorResult;
			const verifiedIdentityRef: { current: AccountMirrorVerifiedIdentityEvidence | null } = {
				current: null,
			};
			const latestCollectorProgressRef: {
				current: AccountMirrorMetadataEvidence["collectorProgress"] | null;
			} = {
				current: null,
			};
			let latestYieldCause: AccountMirrorYieldCause | null = null;
			const collectorAbort = new AbortController();
			try {
				const providerGuard = await providerGuardCensus({
					config: input.config,
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					detectedAtMs: startedAt.getTime(),
				}).catch(() => null);
				if (providerGuard) {
					throw createProviderGuardError(providerGuard);
				}
				collection = await withTimeout(
					metadataCollector.collect({
						provider,
						runtimeProfileId,
						expectedIdentityKey: target.expectedIdentityKey ?? "",
						sweepMode: normalizeSweepMode(request.sweepMode),
						limits: {
							maxPageReadsPerCycle: target.limits.maxPageReadsPerCycle,
							maxConversationRowsPerCycle: target.limits.maxConversationRowsPerCycle,
							maxArtifactRowsPerCycle: target.limits.maxArtifactRowsPerCycle,
							maxBrowserInteractionsPerMinute: target.limits.maxBrowserInteractionsPerMinute,
							conversationReadCooldownMs: target.limits.conversationReadCooldownMs,
							pageRefreshCooldownMs: target.limits.pageRefreshCooldownMs,
							renavigationCooldownMs: target.limits.renavigationCooldownMs,
						},
						previousEvidence: target.metadataEvidence,
						onIdentityVerified: (evidence) => {
							verifiedIdentityRef.current = evidence;
						},
						onProgress: (progress) => {
							latestCollectorProgressRef.current = progress;
						},
						abortSignal: collectorAbort.signal,
						shouldYield: () => {
							const cause = getAccountMirrorYieldCause(acquired);
							if (cause) {
								latestYieldCause = cause;
								return true;
							}
							return false;
						},
					}),
					normalizePositiveInteger(request.collectorTimeoutMs, 120_000),
					`Account mirror metadata collector timed out for ${provider}/${runtimeProfileId}.`,
					collectorAbort,
				);
				collection = withYieldCause(collection, latestYieldCause);
				const collectionWithPriorManifests = await mergeCollectionWithPersistedCatalog({
					persistence,
					provider,
					boundIdentityKey: target.expectedIdentityKey ?? collection.detectedIdentityKey,
					collection,
				});
				const completedAt = now();
				const providerCooldown = await readAccountMirrorProviderCooldown({
					provider,
					runtimeProfileId,
					action: "account-mirror-refresh",
					nowMs: completedAt.getTime(),
				});
				registry.mergeState(
					{ provider, runtimeProfileId },
					{
						queued: false,
						running: false,
						detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
						detectedIdentitySource: collection.detectedIdentitySource ?? "provider-app",
						detectedIdentityObservedAtMs:
							collection.detectedIdentityObservedAtMs ?? completedAt.getTime(),
						detectedIdentityConfidence: collection.detectedIdentityConfidence ?? "authoritative",
						identityMismatchLastCheckedAtMs: target.identityEvidence.recheckable
							? completedAt.getTime()
							: undefined,
						identityMismatchRepair: createIdentityMismatchRepairState({
							target,
							currentDetectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
							requestId,
							checkedAtMs: completedAt.getTime(),
							source: collection.detectedIdentitySource ?? "provider-app",
						}),
						lastSuccessAtMs: completedAt.getTime(),
						lastFailureAtMs: null,
						lastCompletedAtMs: completedAt.getTime(),
						consecutiveFailureCount: 0,
						providerCooldownUntilMs: providerCooldown?.providerCooldownUntilMs ?? null,
						providerHardStopAtMs: null,
						providerGuard: providerCooldown?.providerGuard ?? null,
						metadataCounts: collectionWithPriorManifests.metadataCounts,
						metadataEvidence: collectionWithPriorManifests.evidence,
					},
				);
				await persistence.writeSnapshot({
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					boundIdentityKey:
						target.expectedIdentityKey ?? collectionWithPriorManifests.detectedIdentityKey ?? "",
					detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
					detectedAccountLevel: collectionWithPriorManifests.detectedAccountLevel,
					requestId,
					startedAt: startedAt.toISOString(),
					completedAt: completedAt.toISOString(),
					dispatcherKey: acquired.operation.key,
					dispatcherOperationId: acquired.operation.id,
					metadataCounts: collectionWithPriorManifests.metadataCounts,
					metadataEvidence: collectionWithPriorManifests.evidence,
					manifests: collectionWithPriorManifests.manifests,
				});
				await persistRefreshState(persistence, {
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					boundIdentityKey:
						target.expectedIdentityKey ?? collectionWithPriorManifests.detectedIdentityKey ?? "",
					updatedAt: completedAt,
					state: {
						detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
						detectedIdentitySource: collection.detectedIdentitySource ?? "provider-app",
						detectedIdentityObservedAtMs:
							collection.detectedIdentityObservedAtMs ?? completedAt.getTime(),
						detectedIdentityConfidence: collection.detectedIdentityConfidence ?? "authoritative",
						identityMismatchLastCheckedAtMs: target.identityEvidence.recheckable
							? completedAt.getTime()
							: undefined,
						identityMismatchRepair: createIdentityMismatchRepairState({
							target,
							currentDetectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
							requestId,
							checkedAtMs: completedAt.getTime(),
							source: collection.detectedIdentitySource ?? "provider-app",
						}),
						lastAttemptAtMs: queuedAt.getTime(),
						lastSuccessAtMs: completedAt.getTime(),
						lastFailureAtMs: null,
						lastCompletedAtMs: completedAt.getTime(),
						lastRefreshRequestId: requestId,
						lastStartedAtMs: startedAt.getTime(),
						lastDispatcherKey: acquired.operation.key,
						lastDispatcherOperationId: acquired.operation.id,
						consecutiveFailureCount: 0,
						providerCooldownUntilMs: providerCooldown?.providerCooldownUntilMs ?? null,
						providerGuard: providerCooldown?.providerGuard ?? null,
						providerHardStopAtMs: null,
						metadataCounts: collectionWithPriorManifests.metadataCounts,
						metadataEvidence: collectionWithPriorManifests.evidence,
					},
				});
				const mirrorStatus = registry.readStatus({
					provider,
					runtimeProfileId,
					explicitRefresh: true,
				});
				const browserLifecycle = await cleanupManagedBrowserAfterRefresh({
					request,
					config: input.config,
					provider,
					runtimeProfileId,
					managedProfileDir,
					findManagedBrowserPid,
					terminateManagedBrowserProcess,
				});
				return {
					object: "account_mirror_refresh",
					requestId,
					status: "completed",
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					startedAt: startedAt.toISOString(),
					completedAt: completedAt.toISOString(),
					dispatcher: {
						key: acquired.operation.key,
						operationId: acquired.operation.id,
						blockedBy: null,
					},
					metadataCounts: collectionWithPriorManifests.metadataCounts,
					metadataEvidence: collectionWithPriorManifests.evidence,
					mirrorCompleteness: mirrorStatus.entries[0]?.mirrorCompleteness ?? {
						state: "unknown",
						summary: "Mirror completeness could not be derived from the refreshed status.",
						remainingDetailSurfaces: null,
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
					detectedAccountLevel: collectionWithPriorManifests.detectedAccountLevel,
					mirrorStatus,
					browserLifecycle,
				};
			} catch (error) {
				const completedAt = now();
				const isIdentityMismatch = error instanceof AccountMirrorIdentityMismatchError;
				const verifiedIdentity = verifiedIdentityRef.current;
				const verifiedIdentityRepair =
					!isIdentityMismatch && verifiedIdentity
						? createVerifiedIdentityRepairState({
								target,
								verifiedIdentity,
								requestId,
								checkedAtMs: completedAt.getTime(),
							})
						: null;
				const providerGuard = isIdentityMismatch
					? null
					: extractProviderGuard(error, completedAt.getTime());
				const providerCooldown = !providerGuard
					? await readAccountMirrorProviderCooldown({
							provider,
							runtimeProfileId,
							action: "account-mirror-refresh",
							error,
							nowMs: completedAt.getTime(),
						})
					: null;
				const failureMetadataEvidence = latestCollectorProgressRef.current
					? {
							...(target.metadataEvidence ?? createEmptyMetadataEvidence()),
							collectorProgress: {
								...latestCollectorProgressRef.current,
								event: "failed" as const,
								observedAt: completedAt.toISOString(),
							},
						}
					: target.metadataEvidence;
				const failureCount = resolveNextConsecutiveFailureCount(target);
				if (!isIdentityMismatch && !providerGuard && !providerCooldown) {
					await recordAccountMirrorRefreshDomDriftObservation({
						provider,
						runtimeProfileId,
						requestId,
						error,
						dispatcherKey: acquired.operation.key,
						dispatcherOperationId: acquired.operation.id,
					});
				}
				registry.mergeState(
					{ provider, runtimeProfileId },
					{
						queued: false,
						running: false,
						detectedIdentityKey: isIdentityMismatch
							? error.detectedIdentityKey
							: verifiedIdentity?.detectedIdentityKey,
						detectedIdentitySource: isIdentityMismatch
							? "provider-app"
							: verifiedIdentity?.detectedIdentitySource,
						detectedIdentityObservedAtMs: isIdentityMismatch
							? completedAt.getTime()
							: verifiedIdentity?.detectedIdentityObservedAtMs,
						detectedIdentityConfidence: isIdentityMismatch
							? "authoritative"
							: verifiedIdentity?.detectedIdentityConfidence,
						identityMismatchLastCheckedAtMs:
							isIdentityMismatch || verifiedIdentityRepair ? completedAt.getTime() : undefined,
						identityMismatchRepair: isIdentityMismatch
							? {
									status: "current_mismatch_confirmed",
									previousDetectedIdentityKey: target.detectedIdentityKey,
									currentDetectedIdentityKey: error.detectedIdentityKey,
									repairedAtMs: null,
									checkedAtMs: completedAt.getTime(),
									source: "provider-app",
									requestId,
								}
							: verifiedIdentityRepair,
						lastFailureAtMs: completedAt.getTime(),
						lastCompletedAtMs: completedAt.getTime(),
						consecutiveFailureCount: failureCount,
						providerCooldownUntilMs: providerCooldown?.providerCooldownUntilMs,
						providerHardStopAtMs: providerGuard ? completedAt.getTime() : undefined,
						providerGuard: providerGuard ?? providerCooldown?.providerGuard,
						metadataEvidence: failureMetadataEvidence,
					},
				);
				await persistRefreshState(persistence, {
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					boundIdentityKey: target.expectedIdentityKey,
					updatedAt: completedAt,
					state: {
						detectedIdentityKey: isIdentityMismatch
							? error.detectedIdentityKey
							: (verifiedIdentity?.detectedIdentityKey ?? target.detectedIdentityKey),
						detectedIdentitySource: isIdentityMismatch
							? "provider-app"
							: (verifiedIdentity?.detectedIdentitySource ?? target.identityEvidence.source),
						detectedIdentityObservedAtMs: isIdentityMismatch
							? completedAt.getTime()
							: (verifiedIdentity?.detectedIdentityObservedAtMs ??
								parseIsoTimestampMs(target.identityEvidence.observedAt)),
						detectedIdentityConfidence: isIdentityMismatch
							? "authoritative"
							: (verifiedIdentity?.detectedIdentityConfidence ??
								target.identityEvidence.confidence),
						identityMismatchLastCheckedAtMs:
							isIdentityMismatch || verifiedIdentityRepair ? completedAt.getTime() : undefined,
						identityMismatchRepair: isIdentityMismatch
							? {
									status: "current_mismatch_confirmed",
									previousDetectedIdentityKey: target.detectedIdentityKey,
									currentDetectedIdentityKey: error.detectedIdentityKey,
									repairedAtMs: null,
									checkedAtMs: completedAt.getTime(),
									source: "provider-app",
									requestId,
								}
							: (verifiedIdentityRepair ??
								createIdentityMismatchRepairStateFromStatus(target.identityEvidence.repair)),
						lastAttemptAtMs: queuedAt.getTime(),
						lastFailureAtMs: completedAt.getTime(),
						lastCompletedAtMs: completedAt.getTime(),
						lastRefreshRequestId: requestId,
						lastStartedAtMs: startedAt.getTime(),
						lastDispatcherKey: acquired.operation.key,
						lastDispatcherOperationId: acquired.operation.id,
						consecutiveFailureCount: failureCount,
						providerCooldownUntilMs: providerCooldown?.providerCooldownUntilMs,
						providerHardStopAtMs: providerGuard ? completedAt.getTime() : undefined,
						providerGuard: providerGuard ?? providerCooldown?.providerGuard,
						metadataCounts: target.metadataCounts,
						metadataEvidence: failureMetadataEvidence,
					},
				});
				if (isIdentityMismatch) {
					throw new AccountMirrorRefreshError(
						409,
						"account_mirror_identity_mismatch",
						error.message,
						{
							provider,
							runtimeProfileId,
							detectedProvider: error.provider,
							expectedIdentityKey: error.expectedIdentityKey,
							detectedIdentityKey: error.detectedIdentityKey,
						},
					);
				}
				if (providerGuard) {
					throw new AccountMirrorRefreshError(
						409,
						"account_mirror_provider_guard",
						`${providerGuard.summary} Manual clearance is required before ${provider}/${runtimeProfileId} live follow can continue.`,
						{
							provider,
							runtimeProfileId,
							providerGuard,
						},
					);
				}
				if (providerCooldown) {
					throw new AccountMirrorRefreshError(
						409,
						"account_mirror_provider_cooldown",
						`${providerCooldown.providerGuard.summary} Automation is delayed until ${new Date(
							providerCooldown.providerCooldownUntilMs,
						).toISOString()} before ${provider}/${runtimeProfileId} live follow can continue.`,
						{
							provider,
							runtimeProfileId,
							providerCooldownUntilMs: providerCooldown.providerCooldownUntilMs,
							providerGuard: providerCooldown.providerGuard,
						},
					);
				}
				throw error;
			} finally {
				await acquired.release();
			}
		},
	};
}

function createIdentityMismatchRepairState(input: {
	target: AccountMirrorStatusEntry;
	currentDetectedIdentityKey: string | null;
	requestId: string;
	checkedAtMs: number;
	source: string | null | undefined;
}): AccountMirrorStatusState["identityMismatchRepair"] {
	if (!input.target.identityEvidence.recheckable) {
		return createIdentityMismatchRepairStateFromStatus(input.target.identityEvidence.repair);
	}
	return {
		status: "stale_mismatch_repaired",
		previousDetectedIdentityKey: input.target.detectedIdentityKey,
		currentDetectedIdentityKey: input.currentDetectedIdentityKey,
		repairedAtMs: input.checkedAtMs,
		checkedAtMs: input.checkedAtMs,
		source: input.source ?? "provider-app",
		requestId: input.requestId,
	};
}

function createVerifiedIdentityRepairState(input: {
	target: AccountMirrorStatusEntry;
	verifiedIdentity: AccountMirrorVerifiedIdentityEvidence;
	requestId: string;
	checkedAtMs: number;
}): AccountMirrorStatusState["identityMismatchRepair"] {
	if (!input.target.identityEvidence.recheckable) {
		return createIdentityMismatchRepairStateFromStatus(input.target.identityEvidence.repair);
	}
	return {
		status: "stale_mismatch_repaired",
		previousDetectedIdentityKey: input.target.detectedIdentityKey,
		currentDetectedIdentityKey: input.verifiedIdentity.detectedIdentityKey,
		repairedAtMs: input.checkedAtMs,
		checkedAtMs: input.checkedAtMs,
		source: input.verifiedIdentity.detectedIdentitySource,
		requestId: input.requestId,
	};
}

function createIdentityMismatchRepairStateFromStatus(
	repair: AccountMirrorStatusEntry["identityEvidence"]["repair"],
): AccountMirrorStatusState["identityMismatchRepair"] {
	if (!repair) return null;
	return {
		status: repair.status,
		previousDetectedIdentityKey: repair.previousDetectedIdentityKey,
		currentDetectedIdentityKey: repair.currentDetectedIdentityKey,
		repairedAtMs: parseIsoTimestampMs(repair.repairedAt),
		checkedAtMs: parseIsoTimestampMs(repair.checkedAt),
		source: repair.source,
		requestId: repair.requestId,
	};
}

function parseIsoTimestampMs(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

async function readAccountMirrorProviderCooldown(input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	action: string;
	nowMs: number;
	error?: unknown;
}): Promise<AccountMirrorProviderCooldown | null> {
	if (input.provider !== "chatgpt") {
		return null;
	}
	try {
		const state = await readChatgptRateLimitGuardState({
			profileName: input.runtimeProfileId,
		});
		const cooldownUntilMs =
			typeof state?.cooldownUntil === "number" && Number.isFinite(state.cooldownUntil)
				? state.cooldownUntil
				: null;
		if (!cooldownUntilMs || cooldownUntilMs <= input.nowMs) {
			return null;
		}
		const detectedAtMs =
			typeof state?.cooldownDetectedAt === "number" && Number.isFinite(state.cooldownDetectedAt)
				? state.cooldownDetectedAt
				: input.nowMs;
		const cooldownReason = state?.cooldownReason?.trim();
		const summary = cooldownReason
			? `ChatGPT rate limit detected: ${cooldownReason}`
			: "ChatGPT rate limit cooldown is active.";
		return {
			providerCooldownUntilMs: cooldownUntilMs,
			providerGuard: {
				state: "cooldown",
				kind: "unknown",
				summary,
				detectedAtMs,
				cooldownUntilMs,
				action: state?.cooldownAction?.trim() || input.action,
			},
		};
	} catch {
		return null;
	}
}

async function cleanupManagedBrowserAfterRefresh(input: {
	request: AccountMirrorRefreshRequest;
	config: Record<string, unknown> | null | undefined;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	managedProfileDir: string;
	findManagedBrowserPid: (managedProfileDir: string) => Promise<number | null>;
	terminateManagedBrowserProcess: (input: {
		pid: number;
		managedProfileDir: string;
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
	}) => Promise<void>;
}): Promise<AccountMirrorRefreshBrowserLifecycle | null> {
	if (input.request.cleanupManagedBrowserAfterRefresh !== true) {
		return null;
	}
	const pid = await input.findManagedBrowserPid(input.managedProfileDir);
	if (!pid) {
		return {
			cleanupRequested: true,
			status: "not_running",
			managedProfileDir: input.managedProfileDir,
			pid: null,
			message: "No managed browser process was found after account-mirror refresh.",
		};
	}
	try {
		await input.terminateManagedBrowserProcess({
			pid,
			managedProfileDir: input.managedProfileDir,
			provider: input.provider,
			runtimeProfileId: input.runtimeProfileId,
		});
		return {
			cleanupRequested: true,
			status: "terminated",
			managedProfileDir: input.managedProfileDir,
			pid,
			message: "Terminated managed browser process after bounded account-mirror refresh.",
		};
	} catch (error) {
		return {
			cleanupRequested: true,
			status: "failed",
			managedProfileDir: input.managedProfileDir,
			pid,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

async function terminateManagedBrowserProcessByPid(input: { pid: number }): Promise<void> {
	process.kill(input.pid, "SIGTERM");
	await new Promise((resolve) => setTimeout(resolve, 1500));
	try {
		process.kill(input.pid, 0);
		process.kill(input.pid, "SIGKILL");
	} catch {
		// already stopped
	}
}

async function recordAccountMirrorRefreshDomDriftObservation(input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	requestId: string;
	error: unknown;
	dispatcherKey: string | null;
	dispatcherOperationId: string | null;
}): Promise<void> {
	try {
		await recordDomDriftObservation({
			service: input.provider,
			surface: "account-mirror-refresh",
			action: "collect-metadata",
			expectedLabels: [],
			observedLabel: null,
			fallbackKind: classifyRefreshFailureFallback(input.error),
			metadata: {
				source: "accountMirror.refreshService",
				runtimeProfileId: input.runtimeProfileId,
				requestId: input.requestId,
				dispatcherKey: input.dispatcherKey,
				dispatcherOperationId: input.dispatcherOperationId,
				errorMessage: errorMessage(input.error),
			},
		});
	} catch {
		// Drift observations are diagnostic only; refresh failure semantics should
		// remain governed by the original collector error.
	}
}

async function persistRefreshState(
	persistence: AccountMirrorPersistence,
	input: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		browserProfileId: string | null;
		boundIdentityKey: string | null;
		updatedAt: Date;
		state: AccountMirrorStatusState;
	},
): Promise<void> {
	await persistence.writeState?.({
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId,
		browserProfileId: input.browserProfileId,
		boundIdentityKey: input.boundIdentityKey,
		updatedAt: input.updatedAt.toISOString(),
		state: input.state,
	});
}

function resolveNextConsecutiveFailureCount(target: AccountMirrorStatusEntry): number {
	return Math.max(1, Math.floor(target.consecutiveFailureCount ?? 0) + 1);
}

function classifyRefreshFailureFallback(error: unknown): string {
	const message = errorMessage(error);
	if (/timed out/i.test(message)) return "collector-timeout";
	return "collector-failure";
}

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
	abortController?: AbortController,
): Promise<T> {
	let timeout: NodeJS.Timeout | null = null;
	return new Promise<T>((resolve, reject) => {
		timeout = setTimeout(() => {
			const error = new Error(message);
			abortController?.abort(error);
			reject(error);
		}, timeoutMs);
		promise.then(
			(value) => {
				if (timeout) clearTimeout(timeout);
				resolve(value);
			},
			(error) => {
				if (timeout) clearTimeout(timeout);
				reject(error);
			},
		);
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? "unknown error");
}

function getAccountMirrorYieldCause(
	acquired: BrowserOperationAcquiredResult,
): AccountMirrorYieldCause | null {
	const observations = summarizeBrowserOperationQueueObservationsByKey(acquired.operation.key, 10);
	const observation = [...observations.items]
		.reverse()
		.find((item) => isYieldTriggerObservation(item, acquired));
	if (!observation) {
		return null;
	}
	return {
		observedAt: observation.at,
		ownerCommand: observation.requested?.ownerCommand ?? null,
		kind: observation.requested?.kind ?? null,
		operationClass: observation.requested?.operationClass ?? null,
	};
}

function isYieldTriggerObservation(
	observation: BrowserOperationQueueObservation,
	acquired: BrowserOperationAcquiredResult,
): boolean {
	return (
		observation.event === "queued" &&
		observation.blockedBy?.id === acquired.operation.id &&
		observation.blockedBy.ownerCommand === acquired.operation.ownerCommand &&
		isRealWorkQueuedBehindMirror(observation.requested?.ownerCommand ?? null) &&
		isHigherPriorityQueuedOperation(observation.at, acquired.operation.startedAt)
	);
}

function isRealWorkQueuedBehindMirror(ownerCommand: string | null): boolean {
	return ownerCommand === null || !ownerCommand.startsWith("account-mirror-refresh:");
}

function isHigherPriorityQueuedOperation(
	observationAt: string,
	operationStartedAt: string,
): boolean {
	const observationMs = Date.parse(observationAt);
	const operationStartedMs = Date.parse(operationStartedAt);
	return (
		Number.isFinite(observationMs) &&
		Number.isFinite(operationStartedMs) &&
		observationMs >= operationStartedMs
	);
}

function withYieldCause(
	collection: AccountMirrorMetadataCollectorResult,
	yieldCause: AccountMirrorYieldCause | null,
): AccountMirrorMetadataCollectorResult {
	const inventory = collection.evidence.attachmentInventory;
	if (!yieldCause || inventory?.yielded !== true) {
		return collection;
	}
	return {
		...collection,
		evidence: {
			...collection.evidence,
			attachmentInventory: {
				...inventory,
				yieldCause,
			},
		},
	};
}

export async function detectProviderGuardWithTargetCensus(
	input: AccountMirrorProviderGuardCensusInput,
): Promise<AccountMirrorProviderGuardState | null> {
	if (input.provider !== "gemini" || !isResolvedUserConfig(input.config)) {
		return null;
	}
	const context = resolveManagedBrowserLaunchContextFromResolvedConfig({
		auracallProfile: input.runtimeProfileId,
		browserProfileName: input.browserProfileId,
		browser: {
			...input.config.browser,
			target: input.provider,
		},
		target: input.provider,
	});
	const registryPath = path.join(getAuracallHomeDir(), "browser-state.json");
	const instances = await listInstancesWithLiveness({ registryPath });
	const matchingInstances = instances.filter(
		({ alive, instance }) =>
			alive &&
			matchesManagedProfileForGuardCensus(
				instance,
				context.managedProfileDir,
				context.managedChromeProfile,
			),
	);
	for (const { instance } of matchingInstances) {
		const targets = await listChromeTargets(instance.port, instance.host || "127.0.0.1").catch(
			() => [],
		);
		for (const target of targets as Array<{ type?: string; url?: string; title?: string }>) {
			if (target.type && target.type !== "page") continue;
			const guard = classifyProviderGuardCensusTarget({
				url: target.url ?? "",
				title: target.title ?? "",
			});
			if (guard) {
				return {
					state: "manual_clear_required",
					kind: guard.kind,
					summary: guard.summary,
					detectedAtMs: input.detectedAtMs,
					url: target.url ?? null,
					action: "account-mirror-refresh:target-census",
				};
			}
		}
	}
	return null;
}

function matchesManagedProfileForGuardCensus(
	instance: { profilePath?: string; profileName?: string },
	expectedProfilePath: string,
	expectedProfileName: string,
): boolean {
	if (!instance.profilePath) return false;
	const instanceProfileName = (instance.profileName ?? "Default").trim().toLowerCase();
	return (
		path.resolve(instance.profilePath) === path.resolve(expectedProfilePath) &&
		instanceProfileName === expectedProfileName.trim().toLowerCase()
	);
}

function classifyProviderGuardCensusTarget(input: {
	url: string;
	title: string;
}): { kind: AccountMirrorProviderGuardKind; summary: string } | null {
	const url = input.url.trim().toLowerCase();
	const title = input.title.replace(/\s+/g, " ").trim().toLowerCase();
	const corpus = `${url} ${title}`.trim();
	if (url.includes("google.com/sorry") || /unusual traffic|not a robot/.test(corpus)) {
		return {
			kind: "google-sorry",
			summary: "Google unusual-traffic interstitial detected (google.com/sorry).",
		};
	}
	if (
		url.includes("accounts.google.com") ||
		url.includes("/signin/") ||
		/\bchoose an account\b|\buse your google account\b|\bsign in\b.*\bgoogle\b|\bgoogle accounts\b/.test(
			corpus,
		)
	) {
		return {
			kind: "account-auth",
			summary: "Google account chooser or sign-in gate detected.",
		};
	}
	if (/recaptcha|g-recaptcha|hcaptcha|captcha/.test(corpus)) {
		return {
			kind: "captcha",
			summary: "CAPTCHA or reCAPTCHA challenge detected.",
		};
	}
	if (
		/human verification|verify you are human|prove you are human|confirm you are human|anti-bot/.test(
			corpus,
		)
	) {
		return {
			kind: "human-verification",
			summary: "Provider human-verification gate detected.",
		};
	}
	return null;
}

function createProviderGuardError(providerGuard: AccountMirrorProviderGuardState): Error {
	return Object.assign(new Error(providerGuard.summary), {
		details: {
			providerGuard,
			url: providerGuard.url ?? null,
			action: providerGuard.action ?? null,
			blockingState: {
				kind: providerGuard.kind,
				summary: providerGuard.summary,
				requiresHuman: true,
			},
		},
	});
}

function extractProviderGuard(
	error: unknown,
	detectedAtMs: number,
): AccountMirrorProviderGuardState | null {
	const detailsGuard = findProviderGuardInError(error, new Set());
	if (detailsGuard) {
		return {
			state: "manual_clear_required",
			kind: detailsGuard.kind,
			summary: detailsGuard.summary,
			detectedAtMs,
			url: detailsGuard.url,
			action: detailsGuard.action ?? "account-mirror-refresh",
		};
	}
	const message = error instanceof Error ? error.message : String(error ?? "");
	if (/google\.com\/sorry|unusual traffic|not a robot/i.test(message)) {
		return {
			state: "manual_clear_required",
			kind: "google-sorry",
			summary: "Google unusual-traffic interstitial detected (google.com/sorry).",
			detectedAtMs,
			action: "account-mirror-refresh",
		};
	}
	if (
		/account chooser|sign-in gate|accounts\.google\.com|choose an account|use your google account/i.test(
			message,
		)
	) {
		return {
			state: "manual_clear_required",
			kind: "account-auth",
			summary: "Google account chooser or sign-in gate detected.",
			detectedAtMs,
			action: "account-mirror-refresh",
		};
	}
	if (/captcha|recaptcha|human verification|anti-bot/i.test(message)) {
		return {
			state: "manual_clear_required",
			kind: "human-verification",
			summary: "Provider human-verification gate detected.",
			detectedAtMs,
			action: "account-mirror-refresh",
		};
	}
	return null;
}

function findProviderGuardInError(
	value: unknown,
	seen: Set<unknown>,
): {
	kind: AccountMirrorProviderGuardKind;
	summary: string;
	url: string | null;
	action?: string | null;
} | null {
	if (!value || typeof value !== "object" || seen.has(value)) return null;
	seen.add(value);
	const record = value as Record<string, unknown>;
	const details = isRecord(record.details) ? record.details : null;
	const providerGuard = details && isRecord(details.providerGuard) ? details.providerGuard : null;
	if (providerGuard) {
		const rawKind = String(providerGuard.kind ?? "").trim();
		const kind = normalizeProviderGuardKind(rawKind);
		const summary =
			String(providerGuard.summary ?? "").trim() || "Provider human-verification gate detected.";
		const url =
			typeof providerGuard.url === "string" && providerGuard.url.trim().length > 0
				? providerGuard.url.trim()
				: null;
		const action =
			typeof providerGuard.action === "string" && providerGuard.action.trim().length > 0
				? providerGuard.action.trim()
				: null;
		return { kind, summary, url, action };
	}
	const blockingState = details && isRecord(details.blockingState) ? details.blockingState : null;
	if (blockingState) {
		const rawKind = String(blockingState.kind ?? "").trim();
		const kind = normalizeProviderGuardKind(rawKind);
		const summary =
			String(blockingState.summary ?? "").trim() || "Provider human-verification gate detected.";
		const url =
			typeof details?.url === "string" && details.url.trim().length > 0 ? details.url.trim() : null;
		const action =
			typeof details?.action === "string" && details.action.trim().length > 0
				? details.action.trim()
				: null;
		return { kind, summary, url, action };
	}
	const cause = record.cause;
	const causeGuard = findProviderGuardInError(cause, seen);
	if (causeGuard) return causeGuard;
	const originalError = record.originalError;
	return findProviderGuardInError(originalError, seen);
}

function normalizeProviderGuardKind(value: string): AccountMirrorProviderGuardKind {
	switch (value) {
		case "google-sorry":
		case "captcha":
		case "cloudflare":
		case "account-auth":
		case "human-verification":
			return value;
		default:
			return "unknown";
	}
}

async function mergeCollectionWithPersistedCatalog(input: {
	persistence: AccountMirrorPersistence;
	provider: AccountMirrorProvider;
	boundIdentityKey: string | null;
	collection: AccountMirrorMetadataCollectorResult;
}): Promise<AccountMirrorMetadataCollectorResult> {
	const existing = await input.persistence.readCatalog({
		provider: input.provider,
		boundIdentityKey: input.boundIdentityKey,
		limit: 10_000,
	});
	if (!existing) {
		return withRefreshEvidenceModel({
			provider: input.provider,
			collection: input.collection,
			mergedManifests: input.collection.manifests,
			retainedCounts: zeroMetadataCounts(),
		});
	}
	const projects =
		input.collection.evidence.truncated.projects === true
			? mergeById(existing.projects, input.collection.manifests.projects)
			: [...input.collection.manifests.projects];
	const manifests = {
		projects,
		conversations: mergeConversationsByObservedOrder(
			existing.conversations,
			input.collection.manifests.conversations,
		),
		artifacts: mergeArtifacts(existing.artifacts, input.collection.manifests.artifacts),
		files: mergeFiles(existing.files, input.collection.manifests.files),
		media: mergeById(existing.media, input.collection.manifests.media),
	};
	const mergedCounts = countsFromManifests(manifests);
	const retainedCounts = subtractMetadataCounts(mergedCounts, input.collection.metadataCounts);
	return {
		...withRefreshEvidenceModel({
			provider: input.provider,
			collection: input.collection,
			mergedManifests: manifests,
			retainedCounts,
		}),
		manifests,
		metadataCounts: mergedCounts,
	};
}

function withRefreshEvidenceModel(input: {
	provider: AccountMirrorProvider;
	collection: AccountMirrorMetadataCollectorResult;
	mergedManifests: AccountMirrorMetadataCollectorResult["manifests"];
	retainedCounts: AccountMirrorMetadataCounts;
}): AccountMirrorMetadataCollectorResult {
	const mergedTotal = countsFromManifests(input.mergedManifests);
	const detailScannedThisPass = detailScannedFromEvidence(input.collection.evidence);
	const localMaterialized = countLocalMaterializedAssets(input.mergedManifests);
	const remoteKnownMissingLocal = subtractAssetCounts(mergedTotal, localMaterialized);
	const conversationDetailDeferred =
		input.provider === "gemini" &&
		mergedTotal.conversations > 0 &&
		detailScannedThisPass.conversations <= 0 &&
		input.collection.evidence.attachmentInventory !== null &&
		input.collection.evidence.attachmentInventory !== undefined;
	return {
		...input.collection,
		metadataCounts: mergedTotal,
		evidence: {
			...input.collection.evidence,
			countEvidence: {
				observedThisPass: input.collection.metadataCounts,
				retainedFromCache: input.retainedCounts,
				mergedTotal,
			},
			detailScannedThisPass,
			assetInventory: {
				state: conversationDetailDeferred
					? "deferred"
					: input.collection.evidence.truncated.artifacts === true
						? "in_progress"
						: remoteKnownMissingLocal.artifacts +
									remoteKnownMissingLocal.files +
									remoteKnownMissingLocal.media >
								0
							? "observed"
							: "complete",
				summary: conversationDetailDeferred
					? "Conversation asset inventory is deferred because no conversation detail surface was scanned in this pass."
					: input.collection.evidence.truncated.artifacts === true
						? "Asset inventory is still in progress because detail inventory was truncated."
						: "Asset inventory was observed for the scanned provider surfaces.",
				detailScannedThisPass,
				localMaterialized,
				remoteKnownMissingLocal: conversationDetailDeferred
					? zeroAssetCounts()
					: remoteKnownMissingLocal,
				unknownOrDeferred: conversationDetailDeferred
					? {
							artifacts: Math.max(mergedTotal.artifacts, 1),
							files: Math.max(mergedTotal.files, 1),
							media: Math.max(mergedTotal.media, 1),
						}
					: zeroAssetCounts(),
			},
		},
	};
}

function countsFromManifests(
	manifests: AccountMirrorMetadataCollectorResult["manifests"],
): AccountMirrorMetadataCounts {
	return {
		projects: manifests.projects.length,
		conversations: manifests.conversations.length,
		artifacts: manifests.artifacts.length,
		files: manifests.files.length,
		media: manifests.media.length,
	};
}

function detailScannedFromEvidence(evidence: AccountMirrorMetadataCollectorResult["evidence"]): {
	projects: number;
	conversations: number;
	total: number;
} {
	const projects = Math.max(0, Math.floor(evidence.attachmentInventory?.scannedProjects ?? 0));
	const conversations = Math.max(
		0,
		Math.floor(evidence.attachmentInventory?.scannedConversations ?? 0),
	);
	return {
		projects,
		conversations,
		total: projects + conversations,
	};
}

function countLocalMaterializedAssets(
	manifests: AccountMirrorMetadataCollectorResult["manifests"],
): Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media"> {
	return {
		artifacts: manifests.artifacts.filter((item) => hasLocalAssetEvidence(item)).length,
		files: manifests.files.filter((item) => hasLocalAssetEvidence(item)).length,
		media: manifests.media.filter((item) => hasLocalAssetEvidence(item)).length,
	};
}

function hasLocalAssetEvidence(value: unknown): boolean {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	const metadata =
		record.metadata && typeof record.metadata === "object"
			? (record.metadata as Record<string, unknown>)
			: {};
	return Boolean(
		readNonEmptyString(record.localPath) ||
			readNonEmptyString(record.path) ||
			readNonEmptyString(record.checksumSha256) ||
			readNonEmptyString(record.cacheKey) ||
			readNonEmptyString(record.assetRoute) ||
			readNonEmptyString(metadata.localPath) ||
			readNonEmptyString(metadata.path) ||
			readNonEmptyString(metadata.checksumSha256) ||
			readNonEmptyString(metadata.cacheKey) ||
			readNonEmptyString(metadata.assetRoute) ||
			readNonEmptyString(metadata.materializedAt),
	);
}

function readNonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function subtractMetadataCounts(
	left: AccountMirrorMetadataCounts,
	right: AccountMirrorMetadataCounts,
): AccountMirrorMetadataCounts {
	return {
		projects: Math.max(0, left.projects - right.projects),
		conversations: Math.max(0, left.conversations - right.conversations),
		artifacts: Math.max(0, left.artifacts - right.artifacts),
		files: Math.max(0, left.files - right.files),
		media: Math.max(0, left.media - right.media),
	};
}

function subtractAssetCounts(
	left: Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media">,
	right: Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media">,
): Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media"> {
	return {
		artifacts: Math.max(0, left.artifacts - right.artifacts),
		files: Math.max(0, left.files - right.files),
		media: Math.max(0, left.media - right.media),
	};
}

function zeroMetadataCounts(): AccountMirrorMetadataCounts {
	return { projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 };
}

function zeroAssetCounts(): Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media"> {
	return { artifacts: 0, files: 0, media: 0 };
}

function mergeById<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
	const merged = new Map<string, T>();
	for (const item of existing) {
		if (item?.id) merged.set(item.id, item);
	}
	for (const item of incoming) {
		if (item?.id) merged.set(item.id, { ...(merged.get(item.id) ?? {}), ...item });
	}
	return [...merged.values()];
}

function mergeConversationsByObservedOrder<T extends { id: string }>(
	existing: readonly T[],
	incoming: readonly T[],
): T[] {
	const existingById = new Map(existing.filter((item) => item?.id).map((item) => [item.id, item]));
	const incomingIds = new Set<string>();
	const observed = incoming
		.filter((item) => item?.id)
		.map((item) => {
			incomingIds.add(item.id);
			return { ...(existingById.get(item.id) ?? {}), ...item };
		});
	const retained = existing.filter((item) => item?.id && !incomingIds.has(item.id));
	return [...observed, ...retained];
}

function mergeArtifacts(
	existing: readonly ConversationArtifact[],
	incoming: readonly ConversationArtifact[],
): ConversationArtifact[] {
	return mergeByKey(existing, incoming, artifactKey);
}

function mergeFiles(existing: readonly FileRef[], incoming: readonly FileRef[]): FileRef[] {
	return mergeByKey(existing, incoming, fileKey);
}

function mergeByKey<T extends object>(
	existing: readonly T[],
	incoming: readonly T[],
	createKey: (item: T) => string | null,
): T[] {
	const merged = new Map<string, T>();
	for (const item of existing) {
		const key = createKey(item);
		if (key) merged.set(key, item);
	}
	for (const item of incoming) {
		const key = createKey(item);
		if (key) merged.set(key, { ...(merged.get(key) ?? {}), ...item });
	}
	return [...merged.values()];
}

function artifactKey(artifact: ConversationArtifact): string | null {
	if (!artifact?.id) return null;
	const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
	const conversationId = typeof metadata.conversationId === "string" ? metadata.conversationId : "";
	return `${conversationId}:${artifact.id}`;
}

function fileKey(file: FileRef): string | null {
	if (!file?.id) return null;
	return `${file.provider ?? "unknown"}:${file.source ?? "unknown"}:${file.id}`;
}

function createConfigBackedAccountMirrorMetadataCollector(
	config: Record<string, unknown> | null | undefined,
): AccountMirrorMetadataCollector {
	return {
		async collect(input) {
			const metadataCounts = estimateMetadataCountsFromConfig(config, {
				provider: input.provider,
				runtimeProfileId: input.runtimeProfileId,
			});
			return {
				detectedIdentityKey: input.expectedIdentityKey,
				detectedIdentitySource: "configured",
				detectedIdentityObservedAtMs: Date.now(),
				detectedIdentityConfidence: "authoritative",
				detectedAccountLevel: null,
				metadataCounts,
				manifests: {
					projects: readConfiguredArray(config, {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						key: "projects",
					}),
					conversations: readConfiguredArray(config, {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						key: "conversations",
					}),
					artifacts: readConfiguredArray(config, {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						key: "artifacts",
					}),
					files: readConfiguredArray(config, {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						key: "files",
					}),
					media: readConfiguredArray(config, {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						key: "media",
					}),
				},
				evidence: {
					identitySource: "configured",
					projectSampleIds: [],
					conversationSampleIds: [],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
			};
		},
	};
}

function readConfiguredArray<T = never>(
	config: Record<string, unknown> | null | undefined,
	input: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		key: "projects" | "conversations" | "artifacts" | "files" | "media";
	},
): T[] {
	const service = readServiceConfig(config, input);
	const rawItems = service?.[input.key];
	return Array.isArray(rawItems) ? (rawItems as T[]) : [];
}

function readServiceConfig(
	config: Record<string, unknown> | null | undefined,
	target: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
	},
): Record<string, unknown> | null {
	const runtimeProfile = readRuntimeProfile(config, target.runtimeProfileId);
	return isRecord(runtimeProfile?.services) && isRecord(runtimeProfile.services[target.provider])
		? (runtimeProfile.services[target.provider] as Record<string, unknown>)
		: null;
}

function readSingleMirrorTarget(input: {
	registry: AccountMirrorStatusRegistry;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	explicitRefresh: boolean;
	ignoreMinimumInterval?: boolean;
	ignoreFailureBackoff?: boolean;
}): AccountMirrorStatusEntry | null {
	return (
		input.registry.readStatus({
			provider: input.provider,
			runtimeProfileId: input.runtimeProfileId,
			explicitRefresh: input.explicitRefresh,
			ignoreMinimumInterval: input.ignoreMinimumInterval === true,
			ignoreFailureBackoff: input.explicitRefresh === true && input.ignoreFailureBackoff === true,
		}).entries[0] ?? null
	);
}

function resolveMirrorManagedProfileDir(input: {
	config: Record<string, unknown> | null | undefined;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
}): string {
	const config = isRecord(input.config) ? input.config : {};
	const browser = isRecord(config.browser) ? config.browser : {};
	const context = resolveManagedBrowserLaunchContextFromResolvedConfig({
		auracallProfile: input.runtimeProfileId,
		browserProfileName: input.browserProfileId,
		browser: {
			...browser,
			target: input.provider,
		},
		target: input.provider,
	});
	return context.managedProfileDir;
}

function estimateMetadataCountsFromConfig(
	config: Record<string, unknown> | null | undefined,
	target: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
	},
): AccountMirrorMetadataCounts {
	const service = readServiceConfig(config, target) ?? {};
	return {
		projects: countArrayLike(service.projects) + countOptionalString(service.projectId),
		conversations:
			countArrayLike(service.conversations) + countOptionalString(service.conversationId),
		artifacts: countArrayLike(service.artifacts),
		files: countArrayLike(service.files),
		media: countArrayLike(service.media) + countArrayLike(service.saved),
	};
}

function readRuntimeProfile(
	config: Record<string, unknown> | null | undefined,
	runtimeProfileId: string,
): Record<string, unknown> | null {
	if (!isRecord(config)) return null;
	const targetProfiles = isRecord(config.runtimeProfiles) ? config.runtimeProfiles : {};
	const bridgeProfiles = isRecord(config.profiles) ? config.profiles : {};
	const runtimeProfile = isRecord(targetProfiles[runtimeProfileId])
		? targetProfiles[runtimeProfileId]
		: isRecord(bridgeProfiles[runtimeProfileId])
			? bridgeProfiles[runtimeProfileId]
			: null;
	return runtimeProfile;
}

function countArrayLike(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

function countOptionalString(value: unknown): number {
	return typeof value === "string" && value.trim().length > 0 ? 1 : 0;
}

function summarizeBrowserOperation(operation: BrowserOperationRecord): Record<string, unknown> {
	return {
		id: operation.id,
		key: operation.key,
		kind: operation.kind,
		operationClass: operation.operationClass,
		ownerPid: operation.ownerPid,
		ownerCommand: operation.ownerCommand ?? null,
		startedAt: operation.startedAt,
		updatedAt: operation.updatedAt,
		managedProfileDir: operation.managedProfileDir ?? null,
		serviceTarget: operation.serviceTarget ?? null,
		rawDevTools: operation.rawDevTools ?? null,
		devTools: operation.devTools ?? null,
	};
}

function normalizeSweepMode(
	value: AccountMirrorRefreshRequest["sweepMode"],
): "steady_follow" | "full_sweep" {
	return value === "full_sweep" ? "full_sweep" : "steady_follow";
}

function normalizePositiveInteger(value: number | null | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.trunc(value)
		: fallback;
}

function normalizeNonNegativeInteger(value: number | null | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.trunc(value)
		: fallback;
}

function isResolvedUserConfig(
	value: Record<string, unknown> | null | undefined,
): value is ResolvedUserConfig {
	return Boolean(
		value &&
			typeof value.auracallProfile === "string" &&
			typeof value.model === "string" &&
			isRecord(value.browser),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
