export const LIVE_FOLLOW_SEVERITIES = [
	"healthy",
	"backpressured",
	"paused",
	"attention-needed",
] as const;

export type LiveFollowSeverity = (typeof LIVE_FOLLOW_SEVERITIES)[number];

export interface LiveFollowLatestYieldSummary {
	completedAt: string | null;
	provider: string | null;
	runtimeProfileId: string | null;
	queuedOwnerCommand: string | null;
	remainingDetailSurfaces: number | null;
}

export interface LiveFollowHealthInput {
	schedulerPosture: string | null;
	schedulerState: string | null;
	backpressureReason: string | null;
	activeCompletions: number | null;
	pausedCompletions: number | null;
	failedCompletions: number | null;
	cancelledCompletions: number | null;
	latestYield?: LiveFollowLatestYieldSummary | null;
	targets?: LiveFollowTargetRollup | null;
}

export interface LiveFollowHealthSummary {
	line: string;
	severity: LiveFollowSeverity;
	schedulerPosture: string;
	schedulerState: string | null;
	backpressureReason: string;
	activeCompletions: number | null;
	pausedCompletions: number | null;
	failedCompletions: number | null;
	cancelledCompletions: number | null;
	latestYield: LiveFollowLatestYieldSummary | null;
	targets: LiveFollowTargetRollup | null;
}

export interface LiveFollowTargetRollup {
	total: number;
	enabled: number;
	disabled: number;
	unconfigured: number;
	missingIdentity: number;
	unsupported: number;
	active: number;
	queued: number;
	running: number;
	paused: number;
	attentionNeeded: number;
	complete: number;
	inProgress: number;
	none: number;
	unknown: number;
	desired: LiveFollowDesiredTargetRollup;
	actual: LiveFollowActualTargetRollup;
	accounts: LiveFollowTargetAccountSummary[];
}

export interface LiveFollowDesiredTargetRollup {
	total: number;
	enabled: number;
	disabled: number;
	unconfigured: number;
	missingIdentity: number;
	unsupported: number;
}

export interface LiveFollowActualTargetRollup {
	active: number;
	queued: number;
	running: number;
	paused: number;
	attentionNeeded: number;
	complete: number;
	inProgress: number;
	none: number;
	unknown: number;
}

export interface LiveFollowTargetAccountSummary {
	provider: string;
	tenantKey: string | null;
	bindingKey: string;
	runtimeProfileId: string;
	browserProfileId: string | null;
	desiredState: string;
	desiredEnabled: boolean;
	actualStatus: string | null;
	statusReason: string | null;
	identityEvidence?: {
		source: string;
		confidence: string;
		observedAt: string | null;
		recheckable: boolean;
		repairStatus: string;
		previousDetectedIdentityKey: string | null;
		currentDetectedIdentityKey: string | null;
		lastCheckedAt: string | null;
		repair: {
			status: string;
			previousDetectedIdentityKey: string | null;
			currentDetectedIdentityKey: string | null;
			repairedAt: string | null;
			checkedAt: string | null;
			source: string | null;
			requestId: string | null;
		} | null;
	};
	attentionNeeded: boolean;
	activeCompletionId: string | null;
	latestCompletionStatus: string | null;
	latestCompletionError: string | null;
	phase: string | null;
	passCount: number | null;
	routineEligibleAt: string | null;
	lastFailureAt: string | null;
	consecutiveFailureCount: number;
	activeCompletionNextAttemptAt: string | null;
	nextAttemptAt: string | null;
	providerGuard: {
		state: string;
		kind: string | null;
		summary: string | null;
		cooldownUntil: string | null;
		url: string | null;
		action: string | null;
	} | null;
	mirrorCompleteness: string | null;
	routineDecision: LiveFollowTargetRoutineDecisionSummary;
	assetInventory: {
		state: string;
		summary: string | null;
		detailScannedThisPass: {
			projects: number;
			conversations: number;
			total: number;
		} | null;
	} | null;
	materializationBacklog: LiveFollowMaterializationBacklogSummary | null;
	latestLifecycleEvent: {
		at: string | null;
		type: string | null;
		message: string | null;
	} | null;
	materializationOutcome: {
		jobStatus: string | null;
		conversationsAttempted: number;
		materialized: number;
		checksumCount: number;
	} | null;
	scrapeBudget: {
		classification: string;
		summary: string;
		passive: {
			domParses: number;
			appStateReads: number;
			downloadLinkEnumerations: number;
			cachedFileCarries: number;
			total: number;
		};
		active: {
			identityReads: number;
			projectIndexReads: number;
			rootRailReads: number;
			projectConversationReads: number;
			chatLoads: number;
			accountLibraryReads: number;
			downloads: number;
			total: number;
		};
		providerInteractions: {
			budget: number | null;
			used: number;
			remaining: number | null;
			yielded: boolean;
			yieldReason: string | null;
		};
		providerGuardCorrelation: {
			state: string;
			kind: string | null;
			summary: string | null;
			detectedAt: string | null;
			cooldownUntil: string | null;
			action: string | null;
			correlatedWithYield: boolean;
			yieldReason: string | null;
		};
		llmServiceRequests: number;
		cdpMethodCalls: number | null;
		cdpMethods: Record<string, number>;
		providerActions: Record<string, number>;
	} | null;
	accountLibraryCatchup: {
		mode: string;
		enabled: boolean;
		status: string;
		reason: string | null;
		activeJobId: string | null;
		activeJobStatus: string | null;
		activeJobScheduler: {
			object: string;
			generatedAt: string;
			state: string;
			dispatchState: string;
			queuedAgeMs: number | null;
			runAgeMs: number | null;
			queuedToStartLatencyMs: number | null;
			stale: boolean;
			staleReason: string | null;
		} | null;
		activeJobCount: number;
		maxItems: number | null;
		minIntervalMs: number | null;
		failureCooldownMs: number | null;
		cooldownUntil: string | null;
		maxActiveJobs: number | null;
		providerWorkTimeoutMs: number | null;
		nextAttemptAt: string | null;
		browserHealth: {
			status: string;
			reason: string | null;
			processAlive: boolean;
			devToolsResponsive: boolean;
			launchCommandHasBlankArg: boolean;
			openBlankPageCount: number;
			pageTargetCount: number;
			pid: number | null;
			port: number | null;
			error: string | null;
		} | null;
		preview: {
			generatedAt: string | null;
			catalogFiles: number;
			eligibleCandidates: number;
			selectedCandidates: number;
			archivedFamilies: number;
			unresolvedStale: number;
			unsupportedOrTerminal: number;
			duplicateFamilies: number;
		} | null;
	} | null;
	metadataCounts: {
		projects: number;
		conversations: number;
		artifacts: number;
		files: number;
		media: number;
	} | null;
	metadataCountEvidence: {
		observedThisPass: {
			projects: number;
			conversations: number;
			artifacts: number;
			files: number;
			media: number;
		};
		retainedFromCache: {
			projects: number;
			conversations: number;
			artifacts: number;
			files: number;
			media: number;
		};
		mergedTotal: {
			projects: number;
			conversations: number;
			artifacts: number;
			files: number;
			media: number;
		};
	} | null;
}

export interface LiveFollowTargetRoutineDecisionSummary {
	state:
		| "disabled"
		| "unsupported"
		| "missing_identity"
		| "provider_guarded"
		| "operator_preempted"
		| "running"
		| "queued"
		| "paused"
		| "attention_needed"
		| "backfilling"
		| "steady_follow"
		| "materialization_pending"
		| "account_library_catchup"
		| "caught_up"
		| "eligible"
		| "delayed";
	nextPhase: string | null;
	why: string;
	eligibleAt: string | null;
	lastProgressAt: string | null;
	remainingWork: {
		detailSurfaces: number | null;
		materializationAssets: number;
		accountLibraryStatus: string | null;
	};
	guard: {
		state: string;
		kind: string | null;
		summary: string | null;
		cooldownUntil: string | null;
		url: string | null;
		action: string | null;
	} | null;
	preemption: {
		state: string;
		reason: string | null;
		retryAt: string | null;
	} | null;
	cycle: {
		id: string;
		currentPhase: string;
		nextPhase: string;
		status: string | null;
		updatedAt: string;
		passCount: number;
		reason: string;
	} | null;
}

export interface LiveFollowMaterializationBacklogSummary {
	state: "none" | "metadata_current_backlog" | "materialization_required" | "inventory_unknown";
	policy: string | null;
	metadataCurrent: boolean;
	localRequired: boolean;
	remoteKnownMissingLocal: LiveFollowMaterializationAssetCounts;
	localMaterialized: LiveFollowMaterializationAssetCounts;
	unknownOrDeferred: LiveFollowMaterializationAssetCounts;
	summary: string;
}

export interface LiveFollowMaterializationAssetCounts {
	artifacts: number;
	files: number;
	media: number;
	total: number;
}

export interface LiveFollowMaterializationBacklogInput {
	materializationPolicy?: string | null;
	mirrorCompleteness?: string | null;
	assetInventory?: {
		state?: string | null;
		localMaterialized?: Partial<Record<"artifacts" | "files" | "media", number>> | null;
		remoteKnownMissingLocal?: Partial<Record<"artifacts" | "files" | "media", number>> | null;
		unknownOrDeferred?: Partial<Record<"artifacts" | "files" | "media", number>> | null;
	} | null;
}

export function summarizeLiveFollowMaterializationBacklog(
	input: LiveFollowMaterializationBacklogInput,
): LiveFollowMaterializationBacklogSummary | null {
	const inventory = input.assetInventory ?? null;
	if (!inventory) return null;
	const policy = normalizeOptionalLabel(input.materializationPolicy);
	const remoteKnownMissingLocal = normalizeAssetCounts(inventory.remoteKnownMissingLocal);
	const localMaterialized = normalizeAssetCounts(inventory.localMaterialized);
	const unknownOrDeferred = normalizeAssetCounts(inventory.unknownOrDeferred);
	const metadataCurrent = input.mirrorCompleteness === "complete";
	const remoteMissingTotal = remoteKnownMissingLocal.total;
	const unknownTotal = unknownOrDeferred.total;
	const localRequired = policy !== "metadata_only" && remoteMissingTotal > 0;
	if (remoteMissingTotal <= 0 && unknownTotal <= 0) {
		return {
			state: "none",
			policy,
			metadataCurrent,
			localRequired: false,
			remoteKnownMissingLocal,
			localMaterialized,
			unknownOrDeferred,
			summary: "No known remote assets are missing from local materialization.",
		};
	}
	if (unknownTotal > 0 && remoteMissingTotal <= 0) {
		return {
			state: "inventory_unknown",
			policy,
			metadataCurrent,
			localRequired: false,
			remoteKnownMissingLocal,
			localMaterialized,
			unknownOrDeferred,
			summary: `${unknownTotal} remote asset${unknownTotal === 1 ? "" : "s"} still need inventory confirmation before local materialization can be judged.`,
		};
	}
	if (localRequired) {
		return {
			state: "materialization_required",
			policy,
			metadataCurrent,
			localRequired: true,
			remoteKnownMissingLocal,
			localMaterialized,
			unknownOrDeferred,
			summary: `${remoteMissingTotal} known remote asset${remoteMissingTotal === 1 ? "" : "s"} still need local materialization.`,
		};
	}
	return {
		state: "metadata_current_backlog",
		policy,
		metadataCurrent,
		localRequired: false,
		remoteKnownMissingLocal,
		localMaterialized,
		unknownOrDeferred,
		summary: metadataCurrent
			? `${remoteMissingTotal} known remote asset${remoteMissingTotal === 1 ? "" : "s"} remain in the local materialization backlog; metadata is current under the active policy.`
			: `${remoteMissingTotal} known remote asset${remoteMissingTotal === 1 ? "" : "s"} remain in the local materialization backlog.`,
	};
}

export function summarizeLiveFollowHealth(input: LiveFollowHealthInput): LiveFollowHealthSummary {
	const schedulerPosture = normalizeLabel(input.schedulerPosture);
	const backpressureReason = normalizeLabel(input.backpressureReason);
	const summary: Omit<LiveFollowHealthSummary, "line"> = {
		severity: deriveLiveFollowSeverity({
			schedulerPosture,
			backpressureReason,
			activeCompletions: input.activeCompletions,
			pausedCompletions: input.pausedCompletions,
			failedCompletions: input.failedCompletions,
			cancelledCompletions: input.cancelledCompletions,
			targets: input.targets ?? null,
		}),
		schedulerPosture,
		schedulerState: input.schedulerState,
		backpressureReason,
		activeCompletions: input.activeCompletions,
		pausedCompletions: input.pausedCompletions,
		failedCompletions: input.failedCompletions,
		cancelledCompletions: input.cancelledCompletions,
		latestYield: input.latestYield ?? null,
		targets: input.targets ?? null,
	};
	const yieldText = summary.latestYield
		? `${summary.latestYield.provider ?? "unknown"}/${summary.latestYield.runtimeProfileId ?? "unknown"} remaining=${summary.latestYield.remainingDetailSurfaces ?? "unknown"} queued=${summary.latestYield.queuedOwnerCommand ?? "unknown"}`
		: "none";
	const activityFields = summary.targets
		? [
				`enabled=${summary.targets.enabled}`,
				`active=${summary.targets.active}`,
				`paused=${summary.targets.paused}`,
				`attention=${summary.targets.attentionNeeded}`,
			]
		: [
				`active=${formatNullableNumber(summary.activeCompletions)}`,
				`paused=${formatNullableNumber(summary.pausedCompletions)}`,
				`failed=${formatNullableNumber(summary.failedCompletions)}`,
				`cancelled=${formatNullableNumber(summary.cancelledCompletions)}`,
			];
	return {
		...summary,
		line: [
			"Live follow health:",
			`severity=${summary.severity}`,
			`posture=${summary.schedulerPosture}`,
			`state=${summary.schedulerState ?? "unknown"}`,
			...activityFields,
			`backpressure=${summary.backpressureReason}`,
			`latestYield=${yieldText}`,
		].join(" "),
	};
}

export function deriveLiveFollowSeverity(input: {
	schedulerPosture: string | null;
	backpressureReason: string | null;
	activeCompletions?: number | null;
	pausedCompletions: number | null;
	failedCompletions: number | null;
	cancelledCompletions: number | null;
	targets?: LiveFollowTargetRollup | null;
}): LiveFollowSeverity {
	const failedCompletions = input.failedCompletions ?? 0;
	const cancelledCompletions = input.cancelledCompletions ?? 0;
	const pausedCompletions = input.pausedCompletions ?? 0;
	const activeCompletions = input.activeCompletions ?? 0;
	const schedulerPosture = normalizeLabel(input.schedulerPosture);
	const backpressureReason = normalizeLabel(input.backpressureReason);
	if (input.targets && input.targets.enabled > 0) {
		if (input.targets.attentionNeeded > 0 || input.targets.missingIdentity > 0) {
			return "attention-needed";
		}
		if (input.targets.paused > 0 || schedulerPosture === "paused") {
			return "paused";
		}
		if (
			input.targets.active > 0 ||
			input.targets.complete + input.targets.inProgress >= input.targets.enabled
		) {
			return "healthy";
		}
	}
	if (failedCompletions > 0 || cancelledCompletions > 0) {
		return "attention-needed";
	}
	if (pausedCompletions > 0 || schedulerPosture === "paused") {
		return "paused";
	}
	if (
		activeCompletions > 0 &&
		schedulerPosture === "scheduled" &&
		backpressureReason === "unknown"
	) {
		return "healthy";
	}
	if (activeCompletions > 0 && backpressureReason === "routine-delayed") {
		return "healthy";
	}
	if (schedulerPosture === "waiting" && backpressureReason === "foreground-work") {
		return "healthy";
	}
	if (schedulerPosture === "unknown" || backpressureReason === "unknown") {
		return "attention-needed";
	}
	if (schedulerPosture === "backpressured" || backpressureReason !== "none") {
		return "backpressured";
	}
	return "healthy";
}

function normalizeLabel(value: string | null | undefined): string {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : "unknown";
}

function normalizeOptionalLabel(value: string | null | undefined): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAssetCounts(
	counts: Partial<Record<"artifacts" | "files" | "media", number>> | null | undefined,
): LiveFollowMaterializationAssetCounts {
	const artifacts = normalizeCount(counts?.artifacts);
	const files = normalizeCount(counts?.files);
	const media = normalizeCount(counts?.media);
	return {
		artifacts,
		files,
		media,
		total: artifacts + files + media,
	};
}

function normalizeCount(value: number | null | undefined): number {
	return Number.isFinite(value) && value ? Math.max(0, Math.floor(value)) : 0;
}

function formatNullableNumber(value: number | null): string {
	return value === null ? "unknown" : String(value);
}
