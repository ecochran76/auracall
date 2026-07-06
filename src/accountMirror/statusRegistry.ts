import { getCurrentRuntimeProfiles, getRuntimeProfileBrowserProfileId } from "../config/model.js";
import {
	type AccountMirrorBackfillLedger,
	normalizeAccountMirrorBackfillLedger,
} from "./backfillLedger.js";
import type {
	AccountMirrorCompletionMaterializationAssetKind,
	AccountMirrorCompletionMaterializationPolicy,
	AccountMirrorCompletionSweepMode,
} from "./completionService.js";
import type { ConversationFreshnessFrontierEvidence } from "./conversationFreshnessFrontier.js";
import type {
	AccountMirrorIdentityEvidenceConfidence,
	AccountMirrorIdentityEvidenceSource,
	AccountMirrorPolitenessDecision,
	AccountMirrorProvider,
	AccountMirrorProviderGuardKind,
	AccountMirrorProviderGuardState,
	AccountMirrorProviderPolitenessPolicy,
} from "./politePolicy.js";
import { evaluateAccountMirrorPoliteness } from "./politePolicy.js";
import { createAccountMirrorBindingKey, createAccountMirrorTenantKey } from "./tenantBinding.js";

type MutableRecord = Record<string, unknown>;

export type AccountMirrorStatusState = {
	detectedIdentityKey?: string | null;
	detectedIdentitySource?: AccountMirrorIdentityEvidenceSource | string | null;
	detectedIdentityObservedAtMs?: number | null;
	detectedIdentityConfidence?: AccountMirrorIdentityEvidenceConfidence | string | null;
	identityMismatchLastCheckedAtMs?: number | null;
	identityMismatchRepair?: AccountMirrorIdentityMismatchRepair | null;
	lastAttemptAtMs?: number | null;
	lastSuccessAtMs?: number | null;
	lastFailureAtMs?: number | null;
	lastQueuedAtMs?: number | null;
	lastStartedAtMs?: number | null;
	lastCompletedAtMs?: number | null;
	consecutiveFailureCount?: number | null;
	providerCooldownUntilMs?: number | null;
	providerHardStopAtMs?: number | null;
	providerGuard?: AccountMirrorProviderGuardState | null;
	queued?: boolean;
	running?: boolean;
	lastRefreshRequestId?: string | null;
	lastDispatcherKey?: string | null;
	lastDispatcherOperationId?: string | null;
	lastDispatcherBlockedBy?: Record<string, unknown> | null;
	metadataCounts?: AccountMirrorMetadataCounts | null;
	metadataEvidence?: AccountMirrorMetadataEvidence | null;
	backfillLedger?: AccountMirrorBackfillLedger | null;
};

export type AccountMirrorIdentityMismatchRepair = {
	status: "none" | "stale_mismatch_repaired" | "current_mismatch_confirmed";
	previousDetectedIdentityKey: string | null;
	currentDetectedIdentityKey: string | null;
	repairedAtMs: number | null;
	checkedAtMs: number | null;
	source: AccountMirrorIdentityEvidenceSource | string | null;
	requestId: string | null;
};

export type AccountMirrorMetadataCounts = {
	projects: number;
	conversations: number;
	artifacts: number;
	files: number;
	media: number;
};

export type AccountMirrorMetadataCountEvidence = {
	observedThisPass: AccountMirrorMetadataCounts;
	retainedFromCache: AccountMirrorMetadataCounts;
	mergedTotal: AccountMirrorMetadataCounts;
};

export type AccountMirrorDetailScannedEvidence = {
	projects: number;
	conversations: number;
	total: number;
};

export type AccountMirrorAssetInventoryState =
	| "observed"
	| "complete"
	| "in_progress"
	| "deferred"
	| "unknown";

export type AccountMirrorAssetInventoryEvidence = {
	state: AccountMirrorAssetInventoryState;
	summary: string;
	detailScannedThisPass: AccountMirrorDetailScannedEvidence;
	localMaterialized: Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media">;
	remoteKnownMissingLocal: Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media">;
	unknownOrDeferred: Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media">;
};

export type AccountMirrorRouteProgressEvidence = {
	provider: AccountMirrorProvider;
	strategy: "gemini-left-rail" | "unknown";
	routeSequence: string[];
	appShellVisits: number;
	gemsViewVisits: number;
	repeatedRouteVisits: number;
	conversationCandidates: number;
	selectedConversationIds: string[];
	artifactBearingConversationIds: string[];
	fileBearingConversationIds: string[];
	materializationAttempts: number;
	churnDetected: boolean;
	yieldCause: string | null;
};

export type AccountMirrorCollectorPhase =
	| "identity"
	| "projects"
	| "root-conversations"
	| "project-conversations"
	| "chatgpt-library"
	| "detail-inventory"
	| "merge-persisted-catalog"
	| "complete";

export type AccountMirrorCollectorPhaseProgressEvidence = {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	sweepMode: AccountMirrorCompletionSweepMode | "unknown";
	phase: AccountMirrorCollectorPhase;
	event: "started" | "completed" | "failed";
	observedAt: string;
	projectsObserved?: number | null;
	conversationsObserved?: number | null;
	artifactsObserved?: number | null;
	filesObserved?: number | null;
	attachmentCursor?: {
		nextProjectIndex: number;
		nextConversationIndex: number;
		detailReadLimit: number;
		scannedProjects: number;
		scannedConversations: number;
		conversationDetail?: {
			conversationId: string;
			nextMessageIndex: number;
			messageLimit: number;
			totalMessages?: number | null;
		} | null;
		yielded?: boolean;
	} | null;
};

export type AccountMirrorMetadataEvidence = {
	identitySource: string | null;
	projectSampleIds: string[];
	conversationSampleIds: string[];
	countEvidence?: AccountMirrorMetadataCountEvidence | null;
	detailScannedThisPass?: AccountMirrorDetailScannedEvidence | null;
	assetInventory?: AccountMirrorAssetInventoryEvidence | null;
	conversationFreshnessFrontier?: ConversationFreshnessFrontierEvidence | null;
	routeProgress?: AccountMirrorRouteProgressEvidence | null;
	collectorProgress?: AccountMirrorCollectorPhaseProgressEvidence | null;
	attachmentInventory?: {
		nextProjectIndex: number;
		nextConversationIndex: number;
		detailReadLimit: number;
		scannedProjects: number;
		scannedConversations: number;
		conversationDetail?: {
			conversationId: string;
			nextMessageIndex: number;
			messageLimit: number;
			totalMessages?: number | null;
		} | null;
		yielded?: boolean;
		yieldCause?: {
			observedAt: string | null;
			ownerCommand: string | null;
			kind: string | null;
			operationClass: string | null;
		} | null;
	} | null;
	projectConversations?: {
		nextProjectIndex: number;
		readLimit: number;
		scannedProjects: number;
		yielded?: boolean;
	} | null;
	truncated: {
		projects: boolean;
		conversations: boolean;
		artifacts: boolean;
	};
};

export type AccountMirrorCompleteness = {
	state: "none" | "complete" | "in_progress" | "unknown";
	summary: string;
	assetInventory?: AccountMirrorAssetInventoryEvidence | null;
	remainingDetailSurfaces: {
		projects: number;
		conversations: number;
		total: number;
	} | null;
	signals: {
		projectsTruncated: boolean;
		conversationsTruncated: boolean;
		attachmentInventoryTruncated: boolean;
		attachmentCursorPresent: boolean;
	};
};

export type AccountMirrorStatusEntry = {
	provider: AccountMirrorProvider;
	tenantKey: string | null;
	bindingKey: string;
	runtimeProfileId: string;
	browserProfileId: string | null;
	expectedIdentityKey: string | null;
	detectedIdentityKey: string | null;
	accountLevel: string | null;
	identityEvidence: {
		source: AccountMirrorIdentityEvidenceSource;
		confidence: AccountMirrorIdentityEvidenceConfidence;
		observedAt: string | null;
		recheckable: boolean;
		repairStatus:
			| AccountMirrorPolitenessDecision["identityEvidence"]["repairStatus"]
			| AccountMirrorIdentityMismatchRepair["status"];
		previousDetectedIdentityKey: string | null;
		currentDetectedIdentityKey: string | null;
		lastCheckedAt: string | null;
		repair: {
			status: AccountMirrorIdentityMismatchRepair["status"];
			previousDetectedIdentityKey: string | null;
			currentDetectedIdentityKey: string | null;
			repairedAt: string | null;
			checkedAt: string | null;
			source: string | null;
			requestId: string | null;
		} | null;
	};
	status: "eligible" | "delayed" | "blocked";
	reason: AccountMirrorPolitenessDecision["reason"];
	eligibleAt: string | null;
	delayMs: number;
	lastAttemptAt: string | null;
	lastSuccessAt: string | null;
	lastFailureAt: string | null;
	lastQueuedAt: string | null;
	lastStartedAt: string | null;
	lastCompletedAt: string | null;
	consecutiveFailureCount: number;
	mirrorState: {
		queued: boolean;
		running: boolean;
		lastRefreshRequestId: string | null;
		lastDispatcherKey: string | null;
		lastDispatcherOperationId: string | null;
		lastDispatcherBlockedBy: Record<string, unknown> | null;
	};
	providerGuard: {
		state: "clear" | "manual_clear_required" | "cooldown";
		kind: AccountMirrorProviderGuardKind | null;
		summary: string | null;
		detectedAt: string | null;
		clearedAt: string | null;
		cooldownUntil: string | null;
		url: string | null;
		action: string | null;
	};
	metadataCounts: AccountMirrorMetadataCounts;
	metadataEvidence: AccountMirrorMetadataEvidence | null;
	mirrorCompleteness: AccountMirrorCompleteness;
	backfillLedger: AccountMirrorBackfillLedger | null;
	liveFollow: AccountMirrorLiveFollowDesiredState;
	limits: AccountMirrorPolitenessDecision["limits"];
};

export type AccountMirrorLiveFollowDesiredState = {
	configured: boolean;
	enabled: boolean;
	state: "enabled" | "disabled" | "unconfigured" | "missing_identity" | "unsupported";
	reason: string;
	mode: string | null;
	priority: string | null;
	sweepMode: AccountMirrorCompletionSweepMode | null;
	materializationPolicy: AccountMirrorCompletionMaterializationPolicy | null;
	materializationAssetKinds: AccountMirrorCompletionMaterializationAssetKind[] | null;
	materializationMaxItems: number | null;
	materializationRefreshSnapshot: boolean | null;
	materializationForce: boolean | null;
	accountLibrary: AccountMirrorLiveFollowAccountLibraryDesiredState;
};

export type AccountMirrorLiveFollowAccountLibraryMode = "disabled" | "preview_only" | "eligible";

export type AccountMirrorLiveFollowAccountLibraryDesiredState = {
	configured: boolean;
	mode: AccountMirrorLiveFollowAccountLibraryMode;
	enabled: boolean;
	reason: string;
	maxItems: number | null;
	minIntervalMs: number | null;
	failureCooldownMs: number | null;
	maxActiveJobs: number | null;
	providerWorkTimeoutMs: number | null;
};

export type AccountMirrorStatusSummary = {
	object: "account_mirror_status";
	generatedAt: string;
	entries: AccountMirrorStatusEntry[];
	metrics: {
		total: number;
		eligible: number;
		delayed: number;
		blocked: number;
	};
};

export type AccountMirrorStatusRegistrySnapshot = {
	entries: AccountMirrorStatusState[];
};

export interface AccountMirrorStatusRegistry {
	refreshPersistentState?(input?: {
		provider?: AccountMirrorProvider | null;
		runtimeProfileId?: string | null;
	}): Promise<void>;
	writePersistentState?(
		key: {
			provider: AccountMirrorProvider;
			runtimeProfileId: string;
		},
		state?: AccountMirrorStatusState,
	): Promise<void>;
	readStatus(input?: {
		provider?: AccountMirrorProvider | null;
		runtimeProfileId?: string | null;
		explicitRefresh?: boolean;
		ignoreMinimumInterval?: boolean;
		ignoreFailureBackoff?: boolean;
	}): AccountMirrorStatusSummary;
	updateState(
		key: {
			provider: AccountMirrorProvider;
			runtimeProfileId: string;
		},
		state: AccountMirrorStatusState,
	): void;
	mergeState(
		key: {
			provider: AccountMirrorProvider;
			runtimeProfileId: string;
		},
		state: AccountMirrorStatusState,
	): AccountMirrorStatusState;
}

export function createAccountMirrorStatusRegistry(input: {
	config: Record<string, unknown> | null | undefined;
	now?: () => Date;
	initialState?: Record<string, AccountMirrorStatusState>;
	readPersistentState?: (target: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		browserProfileId: string | null;
		boundIdentityKey: string | null;
	}) => Promise<AccountMirrorStatusState | null>;
	writePersistentState?: (record: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		browserProfileId: string | null;
		boundIdentityKey: string | null;
		updatedAt: string;
		state: AccountMirrorStatusState;
	}) => Promise<void>;
}): AccountMirrorStatusRegistry {
	const states = new Map<string, AccountMirrorStatusState>(
		Object.entries(input.initialState ?? {}),
	);
	const now = input.now ?? (() => new Date());
	const readStatus: AccountMirrorStatusRegistry["readStatus"] = (query = {}) =>
		createAccountMirrorStatusSummary({
			config: input.config,
			now: now(),
			states,
			provider: query.provider ?? null,
			runtimeProfileId: query.runtimeProfileId ?? null,
			explicitRefresh: query.explicitRefresh ?? false,
			ignoreMinimumInterval: query.ignoreMinimumInterval ?? false,
			ignoreFailureBackoff: query.ignoreFailureBackoff ?? false,
		});

	return {
		async refreshPersistentState(query = {}) {
			if (!input.readPersistentState) return;
			const targets = discoverConfiguredAccountMirrorTargets(input.config).filter((target) => {
				if (query.provider && target.provider !== query.provider) return false;
				if (query.runtimeProfileId && target.runtimeProfileId !== query.runtimeProfileId) {
					return false;
				}
				return true;
			});
			for (const target of targets) {
				const state = await input.readPersistentState({
					provider: target.provider,
					runtimeProfileId: target.runtimeProfileId,
					browserProfileId: target.browserProfileId,
					boundIdentityKey: target.expectedIdentityKey,
				});
				if (state) {
					const stateKey = createMirrorStateKey(target);
					states.set(stateKey, {
						...state,
						...(states.get(stateKey) ?? {}),
					});
				}
			}
		},
		async writePersistentState(key, state) {
			if (!input.writePersistentState) return;
			const target = discoverConfiguredAccountMirrorTargets(input.config).find(
				(candidate) =>
					candidate.provider === key.provider &&
					candidate.runtimeProfileId === key.runtimeProfileId,
			);
			if (!target) return;
			const stateKey = createMirrorStateKey(key);
			const next = state ?? states.get(stateKey);
			if (!next) return;
			await input.writePersistentState({
				provider: target.provider,
				runtimeProfileId: target.runtimeProfileId,
				browserProfileId: target.browserProfileId,
				boundIdentityKey: target.expectedIdentityKey,
				updatedAt: now().toISOString(),
				state: next,
			});
		},
		readStatus,
		updateState(key, state) {
			states.set(createMirrorStateKey(key), { ...state });
		},
		mergeState(key, state) {
			const stateKey = createMirrorStateKey(key);
			const next = {
				...(states.get(stateKey) ?? {}),
				...state,
			};
			states.set(stateKey, next);
			return { ...next };
		},
	};
}

export function createAccountMirrorStatusSummary(input: {
	config: Record<string, unknown> | null | undefined;
	now: Date;
	states?: Map<string, AccountMirrorStatusState> | Record<string, AccountMirrorStatusState>;
	provider?: AccountMirrorProvider | null;
	runtimeProfileId?: string | null;
	explicitRefresh?: boolean;
	ignoreMinimumInterval?: boolean;
	ignoreFailureBackoff?: boolean;
}): AccountMirrorStatusSummary {
	const states =
		input.states instanceof Map ? input.states : new Map(Object.entries(input.states ?? {}));
	const entries = discoverConfiguredAccountMirrorTargets(input.config)
		.filter((entry) => !input.provider || entry.provider === input.provider)
		.filter((entry) => !input.runtimeProfileId || entry.runtimeProfileId === input.runtimeProfileId)
		.map((target) => {
			const state = states.get(createMirrorStateKey(target)) ?? {};
			const decision = evaluateAccountMirrorPoliteness({
				provider: target.provider,
				runtimeProfileId: target.runtimeProfileId,
				browserProfileId: target.browserProfileId,
				expectedIdentityKey: target.expectedIdentityKey,
				detectedIdentityKey: state.detectedIdentityKey,
				detectedIdentitySource: state.detectedIdentitySource,
				detectedIdentityObservedAtMs: state.detectedIdentityObservedAtMs,
				detectedIdentityConfidence: state.detectedIdentityConfidence,
				lastAttemptAtMs: state.lastAttemptAtMs,
				lastSuccessAtMs: state.lastSuccessAtMs,
				lastFailureAtMs: state.lastFailureAtMs,
				consecutiveFailureCount: state.consecutiveFailureCount,
				providerCooldownUntilMs: state.providerCooldownUntilMs,
				providerHardStopAtMs: state.providerHardStopAtMs,
				providerGuard: state.providerGuard,
				queued: state.queued,
				running: state.running,
				explicitRefresh: input.explicitRefresh,
				ignoreMinimumInterval: input.ignoreMinimumInterval,
				ignoreFailureBackoff: input.ignoreFailureBackoff,
				nowMs: input.now.getTime(),
				policy: target.policy ?? undefined,
			});
			return createStatusEntry(target, state, decision);
		});
	const metrics = entries.reduce<AccountMirrorStatusSummary["metrics"]>(
		(acc, entry) => {
			acc.total += 1;
			acc[entry.status] += 1;
			return acc;
		},
		{ total: 0, eligible: 0, delayed: 0, blocked: 0 },
	);
	return {
		object: "account_mirror_status",
		generatedAt: input.now.toISOString(),
		entries,
		metrics,
	};
}

export function discoverConfiguredAccountMirrorTargets(
	config: Record<string, unknown> | null | undefined,
): Array<{
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	expectedIdentityKey: string | null;
	accountLevel: string | null;
	policy: Partial<AccountMirrorProviderPolitenessPolicy> | null;
	liveFollow: AccountMirrorLiveFollowDesiredState;
}> {
	if (!config) return [];
	const runtimeProfiles = getCurrentRuntimeProfiles(config);
	return Object.entries(runtimeProfiles).flatMap(([runtimeProfileId, runtimeProfile]) => {
		const browserProfileId = getRuntimeProfileBrowserProfileId(runtimeProfile);
		const services = isRecord(runtimeProfile.services) ? runtimeProfile.services : {};
		return (["chatgpt", "gemini", "grok"] as const).flatMap((provider) => {
			const service = isRecord(services[provider]) ? services[provider] : null;
			if (!service) return [];
			return [
				{
					provider,
					runtimeProfileId,
					browserProfileId,
					expectedIdentityKey: readIdentityKey(service),
					accountLevel: readAccountLevel(service),
					policy: readLiveFollowPolitenessPolicy(provider, service),
					liveFollow: readLiveFollowDesiredState(provider, service),
				},
			];
		});
	});
}

function createStatusEntry(
	target: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		browserProfileId: string | null;
		expectedIdentityKey: string | null;
		accountLevel: string | null;
		policy: Partial<AccountMirrorProviderPolitenessPolicy> | null;
		liveFollow: AccountMirrorLiveFollowDesiredState;
	},
	state: AccountMirrorStatusState,
	decision: AccountMirrorPolitenessDecision,
): AccountMirrorStatusEntry {
	const metadataCounts = normalizeMetadataCounts(state.metadataCounts);
	const metadataEvidence = normalizeMetadataEvidence(state.metadataEvidence);
	const backfillLedger = normalizeAccountMirrorBackfillLedger(state.backfillLedger);
	return {
		provider: target.provider,
		tenantKey: createAccountMirrorTenantKey({
			provider: target.provider,
			boundIdentityKey: target.expectedIdentityKey,
		}),
		bindingKey: createAccountMirrorBindingKey({
			provider: target.provider,
			runtimeProfileId: target.runtimeProfileId,
			browserProfileId: target.browserProfileId,
		}),
		runtimeProfileId: target.runtimeProfileId,
		browserProfileId: target.browserProfileId,
		expectedIdentityKey: target.expectedIdentityKey,
		detectedIdentityKey: decision.detectedIdentityKey,
		accountLevel: target.accountLevel,
		identityEvidence: createIdentityEvidenceStatus(state, decision),
		status: decision.posture === "delay" ? "delayed" : decision.posture,
		reason: decision.reason,
		eligibleAt: timestampToIso(decision.eligibleAtMs),
		delayMs: decision.delayMs,
		lastAttemptAt: timestampToIso(state.lastAttemptAtMs),
		lastSuccessAt: timestampToIso(state.lastSuccessAtMs),
		lastFailureAt: timestampToIso(state.lastFailureAtMs),
		lastQueuedAt: timestampToIso(state.lastQueuedAtMs),
		lastStartedAt: timestampToIso(state.lastStartedAtMs),
		lastCompletedAt: timestampToIso(state.lastCompletedAtMs),
		consecutiveFailureCount: Math.max(0, Math.floor(state.consecutiveFailureCount ?? 0)),
		mirrorState: {
			queued: state.queued === true,
			running: state.running === true,
			lastRefreshRequestId: readString(state.lastRefreshRequestId),
			lastDispatcherKey: readString(state.lastDispatcherKey),
			lastDispatcherOperationId: readString(state.lastDispatcherOperationId),
			lastDispatcherBlockedBy: isRecord(state.lastDispatcherBlockedBy)
				? state.lastDispatcherBlockedBy
				: null,
		},
		providerGuard: normalizeProviderGuardForStatus(state.providerGuard),
		metadataCounts,
		metadataEvidence,
		mirrorCompleteness: deriveMirrorCompleteness(target.provider, metadataCounts, metadataEvidence),
		backfillLedger,
		liveFollow: {
			...target.liveFollow,
			...(target.liveFollow.state === "enabled" && !target.expectedIdentityKey
				? {
						enabled: false,
						state: "missing_identity" as const,
						reason: "liveFollow.enabled is true but the service has no bound identity",
					}
				: {}),
		},
		limits: decision.limits,
	};
}

function createIdentityEvidenceStatus(
	state: AccountMirrorStatusState,
	decision: AccountMirrorPolitenessDecision,
): AccountMirrorStatusEntry["identityEvidence"] {
	const repair = normalizeIdentityMismatchRepair(state.identityMismatchRepair);
	return {
		source: decision.identityEvidence.source,
		confidence: decision.identityEvidence.confidence,
		observedAt: timestampToIso(decision.identityEvidence.observedAtMs),
		recheckable: decision.identityEvidence.recheckable,
		repairStatus: repair?.status ?? decision.identityEvidence.repairStatus,
		previousDetectedIdentityKey:
			repair?.previousDetectedIdentityKey ?? decision.identityEvidence.previousDetectedIdentityKey,
		currentDetectedIdentityKey:
			repair?.currentDetectedIdentityKey ?? decision.identityEvidence.currentDetectedIdentityKey,
		lastCheckedAt: timestampToIso(state.identityMismatchLastCheckedAtMs),
		repair: repair
			? {
					status: repair.status,
					previousDetectedIdentityKey: repair.previousDetectedIdentityKey,
					currentDetectedIdentityKey: repair.currentDetectedIdentityKey,
					repairedAt: timestampToIso(repair.repairedAtMs),
					checkedAt: timestampToIso(repair.checkedAtMs),
					source: readString(repair.source),
					requestId: readString(repair.requestId),
				}
			: null,
	};
}

function normalizeIdentityMismatchRepair(
	value: AccountMirrorStatusState["identityMismatchRepair"],
): AccountMirrorIdentityMismatchRepair | null {
	if (!value || !isRecord(value)) return null;
	const status =
		value.status === "current_mismatch_confirmed"
			? "current_mismatch_confirmed"
			: value.status === "stale_mismatch_repaired"
				? "stale_mismatch_repaired"
				: "none";
	if (status === "none") return null;
	return {
		status,
		previousDetectedIdentityKey: readString(value.previousDetectedIdentityKey),
		currentDetectedIdentityKey: readString(value.currentDetectedIdentityKey),
		repairedAtMs: typeof value.repairedAtMs === "number" ? value.repairedAtMs : null,
		checkedAtMs: typeof value.checkedAtMs === "number" ? value.checkedAtMs : null,
		source: readString(value.source),
		requestId: readString(value.requestId),
	};
}

function createMirrorStateKey(input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
}): string {
	return `${input.provider}:${input.runtimeProfileId}`;
}

function readIdentityKey(service: MutableRecord): string | null {
	const identity = isRecord(service.identity) ? service.identity : {};
	return (
		readString(identity.email) ??
		readString(identity.handle) ??
		readString(identity.accountId) ??
		readString(identity.name)
	);
}

function readAccountLevel(service: MutableRecord): string | null {
	const identity = isRecord(service.identity) ? service.identity : {};
	return (
		readString(identity.accountLevel) ??
		readString(identity.accountPlanType) ??
		readString(identity.capabilityProfile) ??
		readString(identity.proAccess)
	);
}

function readLiveFollowDesiredState(
	_provider: AccountMirrorProvider,
	service: MutableRecord,
): AccountMirrorLiveFollowDesiredState {
	const liveFollow = isRecord(service.liveFollow) ? service.liveFollow : null;
	const enabled = liveFollow?.enabled;
	const mode = liveFollow ? readString(liveFollow.mode) : null;
	const priority = liveFollow ? readString(liveFollow.priority) : null;
	const sweepMode = liveFollow ? readSweepMode(liveFollow.sweepMode) : null;
	const materializationPolicy = liveFollow
		? readMaterializationPolicy(liveFollow.materializationPolicy)
		: null;
	const materializationAssetKinds = liveFollow
		? readMaterializationAssetKinds(liveFollow.materializationAssetKinds)
		: null;
	const materializationMaxItems = liveFollow
		? readPositiveInteger(liveFollow.materializationMaxItems)
		: null;
	const materializationRefreshSnapshot = liveFollow
		? readBoolean(liveFollow.materializationRefreshSnapshot)
		: null;
	const materializationForce = liveFollow ? readBoolean(liveFollow.materializationForce) : null;
	const accountLibrary = readLiveFollowAccountLibraryDesiredState(liveFollow);
	const common = {
		mode,
		priority,
		sweepMode,
		materializationPolicy,
		materializationAssetKinds,
		materializationMaxItems,
		materializationRefreshSnapshot,
		materializationForce,
		accountLibrary,
	};
	if (enabled === false) {
		return {
			configured: true,
			enabled: false,
			state: "disabled",
			reason: "liveFollow.enabled is false",
			...common,
		};
	}
	if (enabled !== true) {
		return {
			configured: liveFollow !== null,
			enabled: false,
			state: "unconfigured",
			reason: "liveFollow.enabled is not configured",
			...common,
		};
	}
	return {
		configured: true,
		enabled: true,
		state: "enabled",
		reason: "liveFollow.enabled is true",
		...common,
	};
}

function readLiveFollowAccountLibraryDesiredState(
	liveFollow: MutableRecord | null,
): AccountMirrorLiveFollowAccountLibraryDesiredState {
	const accountLibrary =
		liveFollow && isRecord(liveFollow.accountLibrary) ? liveFollow.accountLibrary : null;
	const mode = readLiveFollowAccountLibraryMode(accountLibrary?.mode);
	const maxItems = readPositiveInteger(accountLibrary?.maxItems);
	const minIntervalMs = readNonNegativeInteger(accountLibrary?.minIntervalMs);
	const failureCooldownMs = readNonNegativeInteger(accountLibrary?.failureCooldownMs);
	const maxActiveJobs = readPositiveInteger(accountLibrary?.maxActiveJobs);
	const providerWorkTimeoutMs = readPositiveInteger(accountLibrary?.providerWorkTimeoutMs);
	if (!accountLibrary || mode === "disabled") {
		return {
			configured: accountLibrary !== null,
			mode: "disabled",
			enabled: false,
			reason: accountLibrary
				? "liveFollow.accountLibrary.mode is disabled"
				: "liveFollow.accountLibrary.mode is not configured",
			maxItems,
			minIntervalMs,
			failureCooldownMs,
			maxActiveJobs,
			providerWorkTimeoutMs,
		};
	}
	if (mode === "preview_only") {
		return {
			configured: true,
			mode,
			enabled: false,
			reason: "liveFollow.accountLibrary.mode is preview_only",
			maxItems,
			minIntervalMs,
			failureCooldownMs,
			maxActiveJobs,
			providerWorkTimeoutMs,
		};
	}
	return {
		configured: true,
		mode,
		enabled: true,
		reason: "liveFollow.accountLibrary.mode is eligible",
		maxItems,
		minIntervalMs,
		failureCooldownMs,
		maxActiveJobs,
		providerWorkTimeoutMs,
	};
}

function readLiveFollowAccountLibraryMode(
	value: unknown,
): AccountMirrorLiveFollowAccountLibraryMode {
	if (value === "preview_only" || value === "eligible") return value;
	return "disabled";
}

function readSweepMode(value: unknown): AccountMirrorCompletionSweepMode | null {
	return value === "full_sweep" || value === "steady_follow" ? value : null;
}

function readMaterializationPolicy(
	value: unknown,
): AccountMirrorCompletionMaterializationPolicy | null {
	if (
		value === "metadata_only" ||
		value === "recent_missing_assets" ||
		value === "full_missing_assets"
	)
		return value;
	return null;
}

function readMaterializationAssetKinds(
	value: unknown,
): AccountMirrorCompletionMaterializationAssetKind[] | null {
	if (!Array.isArray(value)) return null;
	const normalized = value.filter(
		(entry): entry is AccountMirrorCompletionMaterializationAssetKind =>
			entry === "artifacts" || entry === "files" || entry === "media" || entry === "all",
	);
	if (normalized.length === 0) return null;
	if (normalized.includes("all")) return ["all"];
	return Array.from(new Set(normalized));
}

function readPositiveInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: null;
}

function readNonNegativeInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.floor(value)
		: null;
}

function readBoolean(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

function readLiveFollowPolitenessPolicy(
	provider: AccountMirrorProvider,
	service: MutableRecord,
): Partial<AccountMirrorProviderPolitenessPolicy> | null {
	const liveFollow = isRecord(service.liveFollow) ? service.liveFollow : null;
	if (!liveFollow) return null;
	const policy: Partial<AccountMirrorProviderPolitenessPolicy> = { provider };
	copyNonNegativeInteger(liveFollow, policy, "minIntervalMs");
	copyNonNegativeInteger(liveFollow, policy, "explicitRefreshMinIntervalMs");
	copyNonNegativeInteger(liveFollow, policy, "jitterMaxMs");
	copyNonNegativeInteger(liveFollow, policy, "failureBaseCooldownMs");
	copyNonNegativeInteger(liveFollow, policy, "failureMaxCooldownMs");
	copyNonNegativeInteger(liveFollow, policy, "hardStopCooldownMs");
	copyPositiveInteger(liveFollow, policy, "maxBrowserInteractionsPerMinute");
	copyNonNegativeInteger(liveFollow, policy, "maxPageReadsPerCycle");
	copyNonNegativeInteger(liveFollow, policy, "maxConversationRowsPerCycle");
	copyNonNegativeInteger(liveFollow, policy, "maxArtifactRowsPerCycle");
	copyPositiveInteger(liveFollow, policy, "freshFrontierThreshold");
	copyNonNegativeInteger(liveFollow, policy, "conversationReadCooldownMs");
	copyNonNegativeInteger(liveFollow, policy, "pageRefreshCooldownMs");
	copyNonNegativeInteger(liveFollow, policy, "renavigationCooldownMs");
	return Object.keys(policy).length > 1 ? policy : null;
}

function copyNonNegativeInteger<K extends keyof AccountMirrorProviderPolitenessPolicy>(
	source: MutableRecord,
	target: Partial<AccountMirrorProviderPolitenessPolicy>,
	key: K,
): void {
	const value = source[key];
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
		target[key] = Math.trunc(value) as AccountMirrorProviderPolitenessPolicy[K];
	}
}

function copyPositiveInteger<K extends keyof AccountMirrorProviderPolitenessPolicy>(
	source: MutableRecord,
	target: Partial<AccountMirrorProviderPolitenessPolicy>,
	key: K,
): void {
	const value = source[key];
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		target[key] = Math.trunc(value) as AccountMirrorProviderPolitenessPolicy[K];
	}
}

function normalizeMetadataCounts(
	value: AccountMirrorMetadataCounts | null | undefined,
): AccountMirrorMetadataCounts {
	return {
		projects: normalizeCount(value?.projects),
		conversations: normalizeCount(value?.conversations),
		artifacts: normalizeCount(value?.artifacts),
		files: normalizeCount(value?.files),
		media: normalizeCount(value?.media),
	};
}

function normalizeMetadataEvidence(
	value: AccountMirrorMetadataEvidence | null | undefined,
): AccountMirrorMetadataEvidence | null {
	if (!value) return null;
	return {
		identitySource: readString(value.identitySource),
		projectSampleIds: normalizeStringArray(value.projectSampleIds),
		conversationSampleIds: normalizeStringArray(value.conversationSampleIds),
		countEvidence: normalizeCountEvidence(value.countEvidence),
		detailScannedThisPass: normalizeDetailScannedEvidence(value.detailScannedThisPass),
		assetInventory: normalizeAssetInventoryEvidence(value.assetInventory),
		conversationFreshnessFrontier: normalizeConversationFreshnessFrontierEvidence(
			value.conversationFreshnessFrontier,
		),
		routeProgress: normalizeRouteProgressEvidence(value.routeProgress),
		attachmentInventory: normalizeAttachmentInventoryEvidence(value.attachmentInventory),
		collectorProgress: normalizeCollectorProgressEvidence(value.collectorProgress),
		projectConversations: normalizeProjectConversationEvidence(value.projectConversations),
		truncated: {
			projects: value.truncated?.projects === true,
			conversations: value.truncated?.conversations === true,
			artifacts: value.truncated?.artifacts === true,
		},
	};
}

function normalizeConversationFreshnessFrontierEvidence(
	value: AccountMirrorMetadataEvidence["conversationFreshnessFrontier"] | null | undefined,
): AccountMirrorMetadataEvidence["conversationFreshnessFrontier"] | null {
	if (!value || value.object !== "account_mirror_conversation_freshness_frontier") return null;
	return {
		...value,
		threshold: normalizeCount(value.threshold),
		rowsExamined: normalizeCount(value.rowsExamined),
		rowsSelectedForDetail: normalizeCount(value.rowsSelectedForDetail),
		selectedConversationIds: normalizeStringArray(value.selectedConversationIds),
		rowEvidence: Array.isArray(value.rowEvidence) ? value.rowEvidence.slice(0, 25) : [],
	};
}

function normalizeRouteProgressEvidence(
	value: AccountMirrorMetadataEvidence["routeProgress"] | null | undefined,
): AccountMirrorMetadataEvidence["routeProgress"] | null {
	if (!value) return null;
	return {
		...value,
		routeSequence: normalizeStringArray(value.routeSequence),
		selectedConversationIds: normalizeStringArray(value.selectedConversationIds),
		artifactBearingConversationIds: normalizeStringArray(value.artifactBearingConversationIds),
		fileBearingConversationIds: normalizeStringArray(value.fileBearingConversationIds),
	};
}

function deriveMirrorCompleteness(
	provider: AccountMirrorProvider,
	counts: AccountMirrorMetadataCounts,
	evidence: AccountMirrorMetadataEvidence | null,
): AccountMirrorCompleteness {
	if (!evidence) {
		return {
			state: "none",
			summary: "No mirror snapshot has been collected.",
			assetInventory: null,
			remainingDetailSurfaces: null,
			signals: {
				projectsTruncated: false,
				conversationsTruncated: false,
				attachmentInventoryTruncated: false,
				attachmentCursorPresent: false,
			},
		};
	}
	const projectsTruncated = evidence.truncated.projects === true;
	const conversationsTruncated = evidence.truncated.conversations === true;
	const attachmentInventoryTruncated = evidence.truncated.artifacts === true;
	const cursor = evidence.attachmentInventory ?? null;
	const attachmentCursorPresent = cursor !== null;
	const signals = {
		projectsTruncated,
		conversationsTruncated,
		attachmentInventoryTruncated,
		attachmentCursorPresent,
	};
	const assetInventory = deriveAssetInventoryEvidence(provider, counts, evidence);
	if (assetInventory.state === "deferred" || assetInventory.state === "unknown") {
		return {
			state: "unknown",
			summary: assetInventory.summary,
			assetInventory,
			remainingDetailSurfaces: deriveRemainingDetailSurfaces(counts, cursor),
			signals,
		};
	}
	if (!projectsTruncated && !conversationsTruncated && !attachmentInventoryTruncated) {
		return {
			state: "complete",
			summary: "Mirrored metadata indexes are complete within current provider surfaces.",
			assetInventory,
			remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
			signals,
		};
	}
	if (!cursor && attachmentInventoryTruncated) {
		return {
			state: "unknown",
			summary: "Attachment inventory is truncated and no continuation cursor is available yet.",
			assetInventory,
			remainingDetailSurfaces: null,
			signals,
		};
	}
	if (!cursor) {
		return {
			state: "in_progress",
			summary: "Mirror metadata is still truncated.",
			assetInventory,
			remainingDetailSurfaces: null,
			signals,
		};
	}
	return {
		state: "in_progress",
		summary:
			(deriveRemainingDetailSurfaces(counts, cursor)?.total ?? 0) > 0
				? `Attachment inventory has ${deriveRemainingDetailSurfaces(counts, cursor)?.total ?? 0} detail surfaces remaining.`
				: "Mirror metadata is still marked truncated; another refresh should verify completion.",
		assetInventory,
		remainingDetailSurfaces: deriveRemainingDetailSurfaces(counts, cursor),
		signals,
	};
}

function deriveRemainingDetailSurfaces(
	counts: AccountMirrorMetadataCounts,
	cursor: AccountMirrorMetadataEvidence["attachmentInventory"] | null,
): AccountMirrorCompleteness["remainingDetailSurfaces"] {
	if (!cursor) return null;
	const remainingProjects = Math.max(0, counts.projects - cursor.nextProjectIndex);
	const remainingConversations = Math.max(0, counts.conversations - cursor.nextConversationIndex);
	return {
		projects: remainingProjects,
		conversations: remainingConversations,
		total: remainingProjects + remainingConversations,
	};
}

function deriveAssetInventoryEvidence(
	provider: AccountMirrorProvider,
	counts: AccountMirrorMetadataCounts,
	evidence: AccountMirrorMetadataEvidence,
): AccountMirrorAssetInventoryEvidence {
	const detailScanned =
		evidence.detailScannedThisPass ??
		detailScannedFromAttachmentInventory(evidence.attachmentInventory);
	const mergedTotal = evidence.countEvidence?.mergedTotal ?? counts;
	const localMaterialized = evidence.assetInventory?.localMaterialized ?? zeroAssetCounts();
	const remoteKnownMissingLocal =
		evidence.assetInventory?.remoteKnownMissingLocal ??
		subtractAssetCounts(mergedTotal, localMaterialized);
	const hasAssets = mergedTotal.artifacts + mergedTotal.files + mergedTotal.media > 0;
	const hasConversationSurface = mergedTotal.conversations > 0;
	const conversationDetailUnscanned =
		provider === "gemini" && hasConversationSurface && detailScanned.conversations <= 0;
	if (conversationDetailUnscanned) {
		return {
			state: "deferred",
			summary:
				"Conversation asset inventory is deferred because no conversation detail surface was scanned in this pass.",
			detailScannedThisPass: detailScanned,
			localMaterialized,
			remoteKnownMissingLocal: zeroAssetCounts(),
			unknownOrDeferred: {
				artifacts: Math.max(mergedTotal.artifacts, hasAssets ? 0 : 1),
				files: Math.max(mergedTotal.files, hasAssets ? 0 : 1),
				media: Math.max(mergedTotal.media, hasAssets ? 0 : 1),
			},
		};
	}
	if (evidence.truncated.artifacts === true) {
		return {
			state: "in_progress",
			summary: "Asset inventory is still in progress because detail inventory was truncated.",
			detailScannedThisPass: detailScanned,
			localMaterialized,
			remoteKnownMissingLocal,
			unknownOrDeferred: zeroAssetCounts(),
		};
	}
	return {
		state:
			remoteKnownMissingLocal.artifacts +
				remoteKnownMissingLocal.files +
				remoteKnownMissingLocal.media >
			0
				? "observed"
				: "complete",
		summary: "Asset inventory was observed for the scanned provider surfaces.",
		detailScannedThisPass: detailScanned,
		localMaterialized,
		remoteKnownMissingLocal,
		unknownOrDeferred: zeroAssetCounts(),
	};
}

function normalizeCountEvidence(
	value: AccountMirrorMetadataEvidence["countEvidence"] | null | undefined,
): AccountMirrorMetadataEvidence["countEvidence"] | null {
	if (!value || !isRecord(value)) return null;
	return {
		observedThisPass: normalizeMetadataCounts(value.observedThisPass),
		retainedFromCache: normalizeMetadataCounts(value.retainedFromCache),
		mergedTotal: normalizeMetadataCounts(value.mergedTotal),
	};
}

function normalizeDetailScannedEvidence(
	value: AccountMirrorMetadataEvidence["detailScannedThisPass"] | null | undefined,
): AccountMirrorMetadataEvidence["detailScannedThisPass"] | null {
	if (!value || !isRecord(value)) return null;
	const projects = normalizeCount(value.projects);
	const conversations = normalizeCount(value.conversations);
	return {
		projects,
		conversations,
		total: normalizeCount(value.total) || projects + conversations,
	};
}

function normalizeAssetInventoryEvidence(
	value: AccountMirrorMetadataEvidence["assetInventory"] | null | undefined,
): AccountMirrorMetadataEvidence["assetInventory"] | null {
	if (!value || !isRecord(value)) return null;
	const detailScannedThisPass = normalizeDetailScannedEvidence(value.detailScannedThisPass) ?? {
		projects: 0,
		conversations: 0,
		total: 0,
	};
	return {
		state: normalizeAssetInventoryState(value.state),
		summary: readString(value.summary) ?? "Asset inventory state is unknown.",
		detailScannedThisPass,
		localMaterialized: normalizeAssetCounts(value.localMaterialized),
		remoteKnownMissingLocal: normalizeAssetCounts(value.remoteKnownMissingLocal),
		unknownOrDeferred: normalizeAssetCounts(value.unknownOrDeferred),
	};
}

function normalizeAssetInventoryState(value: unknown): AccountMirrorAssetInventoryState {
	if (
		value === "observed" ||
		value === "complete" ||
		value === "in_progress" ||
		value === "deferred" ||
		value === "unknown"
	) {
		return value;
	}
	return "unknown";
}

function normalizeAssetCounts(
	value: unknown,
): Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media"> {
	const record = isRecord(value) ? value : {};
	return {
		artifacts: normalizeCount(readNumber(record.artifacts)),
		files: normalizeCount(readNumber(record.files)),
		media: normalizeCount(readNumber(record.media)),
	};
}

function detailScannedFromAttachmentInventory(
	value: AccountMirrorMetadataEvidence["attachmentInventory"] | null | undefined,
): AccountMirrorDetailScannedEvidence {
	const projects = normalizeCount(value?.scannedProjects);
	const conversations = normalizeCount(value?.scannedConversations);
	return {
		projects,
		conversations,
		total: projects + conversations,
	};
}

function subtractAssetCounts(
	left: Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media">,
	right: Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media">,
): Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media"> {
	return {
		artifacts: Math.max(0, normalizeCount(left.artifacts) - normalizeCount(right.artifacts)),
		files: Math.max(0, normalizeCount(left.files) - normalizeCount(right.files)),
		media: Math.max(0, normalizeCount(left.media) - normalizeCount(right.media)),
	};
}

function zeroAssetCounts(): Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media"> {
	return {
		artifacts: 0,
		files: 0,
		media: 0,
	};
}

function normalizeProjectConversationEvidence(
	value: AccountMirrorMetadataEvidence["projectConversations"] | null | undefined,
): AccountMirrorMetadataEvidence["projectConversations"] | null {
	if (!value || !isRecord(value)) return null;
	return {
		nextProjectIndex: normalizeCount(value.nextProjectIndex),
		readLimit: normalizeCount(value.readLimit),
		scannedProjects: normalizeCount(value.scannedProjects),
		yielded: value.yielded === true,
	};
}

function normalizeAttachmentInventoryEvidence(
	value: AccountMirrorMetadataEvidence["attachmentInventory"] | null | undefined,
): AccountMirrorMetadataEvidence["attachmentInventory"] | null {
	if (!value || !isRecord(value)) return null;
	return {
		nextProjectIndex: normalizeCount(value.nextProjectIndex),
		nextConversationIndex: normalizeCount(value.nextConversationIndex),
		detailReadLimit: normalizeCount(value.detailReadLimit),
		scannedProjects: normalizeCount(value.scannedProjects),
		scannedConversations: normalizeCount(value.scannedConversations),
		conversationDetail: normalizeConversationDetailCursorEvidence(value.conversationDetail),
		yielded: value.yielded === true,
		yieldCause: normalizeAttachmentInventoryYieldCause(value.yieldCause),
	};
}

function normalizeConversationDetailCursorEvidence(
	value: NonNullable<AccountMirrorMetadataEvidence["attachmentInventory"]>["conversationDetail"],
): NonNullable<AccountMirrorMetadataEvidence["attachmentInventory"]>["conversationDetail"] {
	if (!value || !isRecord(value)) return null;
	const conversationId = readString(value.conversationId);
	if (!conversationId) return null;
	return {
		conversationId,
		nextMessageIndex: normalizeCount(readNumber(value.nextMessageIndex)),
		messageLimit: normalizeCount(readNumber(value.messageLimit)),
		totalMessages:
			value.totalMessages === null || value.totalMessages === undefined
				? null
				: normalizeCount(readNumber(value.totalMessages)),
	};
}

function normalizeCollectorProgressEvidence(
	value: AccountMirrorMetadataEvidence["collectorProgress"] | null | undefined,
): AccountMirrorMetadataEvidence["collectorProgress"] | null {
	if (!value || !isRecord(value)) return null;
	const provider = readString(value.provider);
	const runtimeProfileId = readString(value.runtimeProfileId);
	const observedAt = readString(value.observedAt);
	if (!provider || !runtimeProfileId || !observedAt) return null;
	return {
		provider: normalizeCollectorProgressProvider(provider),
		runtimeProfileId,
		sweepMode: normalizeCollectorProgressSweepMode(value.sweepMode),
		phase: normalizeCollectorProgressPhase(value.phase),
		event: normalizeCollectorProgressEvent(value.event),
		observedAt,
		projectsObserved: nullableCount(value.projectsObserved),
		conversationsObserved: nullableCount(value.conversationsObserved),
		artifactsObserved: nullableCount(value.artifactsObserved),
		filesObserved: nullableCount(value.filesObserved),
		attachmentCursor: normalizeCollectorProgressAttachmentCursor(value.attachmentCursor),
	};
}

function normalizeCollectorProgressProvider(value: string): AccountMirrorProvider {
	if (value === "chatgpt" || value === "gemini" || value === "grok") return value;
	return "chatgpt";
}

function normalizeCollectorProgressAttachmentCursor(
	value: AccountMirrorCollectorPhaseProgressEvidence["attachmentCursor"] | null | undefined,
): AccountMirrorCollectorPhaseProgressEvidence["attachmentCursor"] | null {
	if (!value || !isRecord(value)) return null;
	return {
		nextProjectIndex: normalizeCount(value.nextProjectIndex),
		nextConversationIndex: normalizeCount(value.nextConversationIndex),
		detailReadLimit: normalizeCount(value.detailReadLimit),
		scannedProjects: normalizeCount(value.scannedProjects),
		scannedConversations: normalizeCount(value.scannedConversations),
		conversationDetail: normalizeConversationDetailCursorEvidence(value.conversationDetail),
		yielded: value.yielded === true,
	};
}

function normalizeCollectorProgressSweepMode(
	value: unknown,
): AccountMirrorCollectorPhaseProgressEvidence["sweepMode"] {
	return value === "steady_follow" || value === "full_sweep" ? value : "unknown";
}

function normalizeCollectorProgressPhase(value: unknown): AccountMirrorCollectorPhase {
	if (
		value === "identity" ||
		value === "projects" ||
		value === "root-conversations" ||
		value === "project-conversations" ||
		value === "chatgpt-library" ||
		value === "detail-inventory" ||
		value === "merge-persisted-catalog" ||
		value === "complete"
	) {
		return value;
	}
	return "identity";
}

function normalizeCollectorProgressEvent(
	value: unknown,
): AccountMirrorCollectorPhaseProgressEvidence["event"] {
	if (value === "started" || value === "completed" || value === "failed") return value;
	return "started";
}

function nullableCount(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	return normalizeCount(readNumber(value));
}

function normalizeProviderGuardForStatus(
	value: AccountMirrorProviderGuardState | null | undefined,
): AccountMirrorStatusEntry["providerGuard"] {
	if (!value) {
		return {
			state: "clear",
			kind: null,
			summary: null,
			detectedAt: null,
			clearedAt: null,
			cooldownUntil: null,
			url: null,
			action: null,
		};
	}
	return {
		state:
			value.state === "manual_clear_required" || value.state === "cooldown" ? value.state : "clear",
		kind: value.kind ?? "unknown",
		summary: readString(value.summary) ?? "Provider guard is active.",
		detectedAt: timestampToIso(value.detectedAtMs),
		clearedAt: timestampToIso(value.clearedAtMs),
		cooldownUntil: timestampToIso(value.cooldownUntilMs),
		url: readString(value.url),
		action: readString(value.action),
	};
}

function normalizeAttachmentInventoryYieldCause(
	value:
		| NonNullable<AccountMirrorMetadataEvidence["attachmentInventory"]>["yieldCause"]
		| undefined,
): NonNullable<AccountMirrorMetadataEvidence["attachmentInventory"]>["yieldCause"] {
	if (!value || !isRecord(value)) return null;
	return {
		observedAt: readString(value.observedAt),
		ownerCommand: readString(value.ownerCommand),
		kind: readString(value.kind),
		operationClass: readString(value.operationClass),
	};
}

function normalizeStringArray(value: string[] | null | undefined): string[] {
	return Array.isArray(value)
		? value.map((entry) => readString(entry)).filter((entry): entry is string => entry !== null)
		: [];
}

function normalizeCount(value: number | null | undefined): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function timestampToIso(value: number | null | undefined): string | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
	return new Date(value).toISOString();
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is MutableRecord {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
