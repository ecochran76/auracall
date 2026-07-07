import type {
	AccountMirrorCompletionOperation,
	AccountMirrorCompletionService,
	AccountMirrorCompletionStartRequest,
} from "./completionService.js";
import type { AccountMirrorStatusEntry, AccountMirrorStatusRegistry } from "./statusRegistry.js";

export interface AccountMirrorLiveFollowReconcileResult {
	object: "account_mirror_live_follow_reconcile";
	started: AccountMirrorCompletionOperation[];
	existing: AccountMirrorCompletionOperation[];
	upgraded: AccountMirrorCompletionOperation[];
	replaced: Array<{
		previous: AccountMirrorCompletionOperation;
		replacement: AccountMirrorCompletionOperation;
	}>;
	targetClassifications: AccountMirrorLiveFollowTargetClassification[];
	skipped: Array<{
		provider: AccountMirrorStatusEntry["provider"];
		runtimeProfileId: string;
		reason: string;
	}>;
	metrics: {
		enabledTargets: number;
		started: number;
		existing: number;
		upgraded: number;
		replaced: number;
		skipped: number;
	};
}

export type AccountMirrorLiveFollowTargetClassificationKind =
	| "safe_steady_follow"
	| "safe_bounded_resume"
	| "existing_active"
	| "operator_paused"
	| "provider_blocked"
	| "identity_blocked"
	| "disabled";

export interface AccountMirrorLiveFollowTargetClassification {
	provider: AccountMirrorStatusEntry["provider"];
	runtimeProfileId: string;
	classification: AccountMirrorLiveFollowTargetClassificationKind;
	action: "start" | "keep_existing" | "skip";
	reason: string;
	activeCompletionId: string | null;
}

export async function reconcileConfiguredAccountMirrorLiveFollow(input: {
	registry: AccountMirrorStatusRegistry;
	completionService: AccountMirrorCompletionService;
}): Promise<AccountMirrorLiveFollowReconcileResult> {
	await input.registry.refreshPersistentState?.();
	const entries = input.registry.readStatus({ explicitRefresh: false }).entries;
	const enabledEntries = entries.filter(
		(entry) => entry.liveFollow.state === "enabled" && entry.status !== "blocked",
	);
	const started: AccountMirrorCompletionOperation[] = [];
	const existing: AccountMirrorCompletionOperation[] = [];
	const upgraded: AccountMirrorCompletionOperation[] = [];
	const replaced: AccountMirrorLiveFollowReconcileResult["replaced"] = [];
	const targetClassifications: AccountMirrorLiveFollowTargetClassification[] = [];
	const skipped: AccountMirrorLiveFollowReconcileResult["skipped"] = [];

	for (const entry of entries) {
		const active =
			input.completionService.list({
				provider: entry.provider,
				runtimeProfileId: entry.runtimeProfileId,
				status: "active",
				limit: null,
			})[0] ?? null;
		const classification = classifyLiveFollowTarget(entry, active);
		targetClassifications.push(classification);

		if (entry.liveFollow.state !== "enabled") {
			skipped.push({
				provider: entry.provider,
				runtimeProfileId: entry.runtimeProfileId,
				reason: entry.liveFollow.reason,
			});
			continue;
		}
		if (entry.status === "blocked") {
			skipped.push({
				provider: entry.provider,
				runtimeProfileId: entry.runtimeProfileId,
				reason: entry.reason,
			});
			continue;
		}
		if (active) {
			if (classification.classification === "operator_paused") {
				existing.push(active);
				continue;
			}
			const policy = buildLiveFollowCompletionPolicy(entry);
			if (classification.classification === "provider_blocked") {
				const replacementPolicy = buildLegacyGeminiReplacementPolicy(entry, active);
				if (!replacementPolicy) {
					existing.push(active);
					continue;
				}
				const cancelled = input.completionService.control({
					id: active.id,
					action: "cancel",
				});
				const replacement = input.completionService.start({
					provider: entry.provider,
					runtimeProfileId: entry.runtimeProfileId,
					maxPasses: null,
					...replacementPolicy,
				});
				started.push(replacement);
				replaced.push({
					previous: cancelled ?? active,
					replacement,
				});
				continue;
			}
			const upgradedOperation = maybeUpgradeActiveCompletion(
				input.completionService,
				active,
				policy,
			);
			if (upgradedOperation && upgradedOperation.id === active.id) {
				existing.push(upgradedOperation);
				upgraded.push(upgradedOperation);
			} else {
				existing.push(active);
			}
			continue;
		}
		started.push(
			input.completionService.start({
				provider: entry.provider,
				runtimeProfileId: entry.runtimeProfileId,
				maxPasses: null,
				...buildLiveFollowCompletionPolicy(entry),
			}),
		);
	}

	return {
		object: "account_mirror_live_follow_reconcile",
		started,
		existing,
		upgraded,
		replaced,
		targetClassifications,
		skipped,
		metrics: {
			enabledTargets: enabledEntries.length,
			started: started.length,
			existing: existing.length,
			upgraded: upgraded.length,
			replaced: replaced.length,
			skipped: skipped.length,
		},
	};
}

export function classifyLiveFollowTarget(
	entry: AccountMirrorStatusEntry,
	active: AccountMirrorCompletionOperation | null,
): AccountMirrorLiveFollowTargetClassification {
	const base = {
		provider: entry.provider,
		runtimeProfileId: entry.runtimeProfileId,
		activeCompletionId: active?.id ?? null,
	};
	if (entry.liveFollow.state !== "enabled") {
		return {
			...base,
			classification:
				entry.liveFollow.state === "missing_identity" || entry.liveFollow.state === "unsupported"
					? "identity_blocked"
					: "disabled",
			action: "skip",
			reason: entry.liveFollow.reason,
		};
	}
	if (isLegacyProviderBlockedCompletion(active)) {
		return {
			...base,
			classification: "provider_blocked",
			action: hasSafeLegacyGeminiReplacementPolicy(entry, active) ? "start" : "skip",
			reason: hasSafeLegacyGeminiReplacementPolicy(entry, active)
				? "replace legacy Gemini blocker with bounded full-missing-assets live follow"
				: (active?.error?.message ??
					"provider-specific live-follow policy blocks automatic resume"),
		};
	}
	if (entry.status === "blocked") {
		return {
			...base,
			classification:
				entry.reason === "identity-mismatch" ? "identity_blocked" : "provider_blocked",
			action: "skip",
			reason: entry.reason,
		};
	}
	if (entry.providerGuard.state !== "clear") {
		return {
			...base,
			classification: "provider_blocked",
			action: "skip",
			reason: entry.providerGuard.summary ?? entry.providerGuard.state,
		};
	}
	if (active?.status === "paused") {
		return {
			...base,
			classification: "operator_paused",
			action: "keep_existing",
			reason: "active live-follow completion is operator-paused",
		};
	}
	if (active) {
		return {
			...base,
			classification:
				isCompleteSteadyFollowTarget(entry) && active.status === "idle_waiting"
					? "safe_steady_follow"
					: "existing_active",
			action: "keep_existing",
			reason:
				isCompleteSteadyFollowTarget(entry) && active.status === "idle_waiting"
					? "metadata is current and the active live-follow completion is waiting on cadence"
					: `active live-follow completion is ${active.status}`,
		};
	}
	if (isCompleteSteadyFollowTarget(entry)) {
		return {
			...base,
			classification: "safe_steady_follow",
			action: "start",
			reason:
				"metadata is current with zero remaining detail surfaces; start cadence-only steady follow",
		};
	}
	return {
		...base,
		classification: "safe_bounded_resume",
		action: "start",
		reason:
			"target has unfinished account evidence and should resume from the persisted next phase",
	};
}

function isCompleteSteadyFollowTarget(entry: AccountMirrorStatusEntry): boolean {
	return (
		entry.mirrorCompleteness.state === "complete" &&
		(entry.mirrorCompleteness.remainingDetailSurfaces?.total ?? 0) === 0
	);
}

function isLegacyProviderBlockedCompletion(
	active: AccountMirrorCompletionOperation | null,
): boolean {
	if (!active) return false;
	if (active.error?.code === "gemini_live_follow_resume_blocked") return true;
	return (
		active.provider === "gemini" &&
		active.mode === "live_follow" &&
		active.status === "paused" &&
		active.passCount > 0
	);
}

function hasSafeLegacyGeminiReplacementPolicy(
	entry: AccountMirrorStatusEntry,
	active: AccountMirrorCompletionOperation | null,
): boolean {
	return buildLegacyGeminiReplacementPolicy(entry, active) !== null;
}

function buildLegacyGeminiReplacementPolicy(
	entry: AccountMirrorStatusEntry,
	active: AccountMirrorCompletionOperation | null,
): Pick<
	AccountMirrorCompletionStartRequest,
	| "sweepMode"
	| "materializationPolicy"
	| "materializationAssetKinds"
	| "materializationMaxItems"
	| "materializationRefreshSnapshot"
	| "materializationForce"
> | null {
	if (!isLegacyProviderBlockedCompletion(active)) return null;
	if (entry.provider !== "gemini") return null;
	const configured = buildLiveFollowCompletionPolicy(entry);
	const policy = configured.materializationPolicy ?? "full_missing_assets";
	if (policy === "metadata_only") return null;
	return {
		sweepMode: configured.sweepMode ?? "full_sweep",
		materializationPolicy: policy,
		materializationAssetKinds: configured.materializationAssetKinds ?? ["all"],
		materializationMaxItems: configured.materializationMaxItems ?? 3,
		materializationRefreshSnapshot: configured.materializationRefreshSnapshot ?? true,
		materializationForce: configured.materializationForce ?? false,
	};
}

function buildLiveFollowCompletionPolicy(
	entry: AccountMirrorStatusEntry,
): Pick<
	AccountMirrorCompletionStartRequest,
	| "sweepMode"
	| "materializationPolicy"
	| "materializationAssetKinds"
	| "materializationMaxItems"
	| "materializationRefreshSnapshot"
	| "materializationForce"
> {
	const request: Pick<
		AccountMirrorCompletionStartRequest,
		| "sweepMode"
		| "materializationPolicy"
		| "materializationAssetKinds"
		| "materializationMaxItems"
		| "materializationRefreshSnapshot"
		| "materializationForce"
	> = {};
	if (entry.liveFollow.sweepMode) request.sweepMode = entry.liveFollow.sweepMode;
	if (entry.liveFollow.materializationPolicy)
		request.materializationPolicy = entry.liveFollow.materializationPolicy;
	if (entry.liveFollow.materializationAssetKinds)
		request.materializationAssetKinds = entry.liveFollow.materializationAssetKinds;
	if (entry.liveFollow.materializationMaxItems !== null)
		request.materializationMaxItems = entry.liveFollow.materializationMaxItems;
	if (entry.liveFollow.materializationRefreshSnapshot !== null)
		request.materializationRefreshSnapshot = entry.liveFollow.materializationRefreshSnapshot;
	if (entry.liveFollow.materializationForce !== null)
		request.materializationForce = entry.liveFollow.materializationForce;
	return request;
}

function maybeUpgradeActiveCompletion(
	completionService: AccountMirrorCompletionService,
	active: AccountMirrorCompletionOperation,
	policy: Pick<
		AccountMirrorCompletionStartRequest,
		| "sweepMode"
		| "materializationPolicy"
		| "materializationAssetKinds"
		| "materializationMaxItems"
		| "materializationRefreshSnapshot"
		| "materializationForce"
	>,
): AccountMirrorCompletionOperation | null {
	if (!completionService.upgradePolicy) return null;
	if (Object.keys(policy).length === 0) return null;
	if (activeCompletionMatchesPolicy(active, policy)) return null;
	return completionService.upgradePolicy({
		id: active.id,
		maxPasses: null,
		...policy,
	});
}

function activeCompletionMatchesPolicy(
	active: AccountMirrorCompletionOperation,
	policy: Pick<
		AccountMirrorCompletionStartRequest,
		| "sweepMode"
		| "materializationPolicy"
		| "materializationAssetKinds"
		| "materializationMaxItems"
		| "materializationRefreshSnapshot"
		| "materializationForce"
	>,
): boolean {
	if (policy.sweepMode && active.sweepMode !== policy.sweepMode) return false;
	if (policy.materializationPolicy && active.materializationPolicy !== policy.materializationPolicy)
		return false;
	if (
		policy.materializationAssetKinds &&
		!assetKindsEqual(active.materializationAssetKinds ?? ["all"], policy.materializationAssetKinds)
	) {
		return false;
	}
	if (
		typeof policy.materializationMaxItems === "number" &&
		(active.materializationMaxItems ?? null) !== policy.materializationMaxItems
	) {
		return false;
	}
	if (
		typeof policy.materializationRefreshSnapshot === "boolean" &&
		active.materializationRefreshSnapshot !== policy.materializationRefreshSnapshot
	) {
		return false;
	}
	if (
		typeof policy.materializationForce === "boolean" &&
		active.materializationForce !== policy.materializationForce
	)
		return false;
	return true;
}

function assetKindsEqual(
	left: NonNullable<AccountMirrorCompletionOperation["materializationAssetKinds"]>,
	right: NonNullable<AccountMirrorCompletionStartRequest["materializationAssetKinds"]>,
): boolean {
	const normalizedLeft = normalizeAssetKinds(left);
	const normalizedRight = normalizeAssetKinds(right);
	if (normalizedLeft.length !== normalizedRight.length) return false;
	return normalizedLeft.every((entry, index) => entry === normalizedRight[index]);
}

function normalizeAssetKinds(
	values: NonNullable<AccountMirrorCompletionStartRequest["materializationAssetKinds"]>,
): string[] {
	const normalized = Array.from(new Set(values)).sort();
	return normalized.includes("all") ? ["all"] : normalized;
}
