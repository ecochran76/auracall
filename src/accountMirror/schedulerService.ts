import {
	type AccountMirrorLiveFollowCyclePhase,
	type AccountMirrorLiveFollowCyclePhaseStatus,
	chooseLiveFollowCyclePhase,
} from "./liveFollowCycleDecision.js";
import type { AccountMirrorProvider } from "./politePolicy.js";
import {
	AccountMirrorRefreshError,
	type AccountMirrorRefreshResult,
	type AccountMirrorRefreshService,
} from "./refreshService.js";
import type { AccountMirrorSchedulerPassHistory } from "./schedulerLedger.js";
import type {
	AccountMirrorCollectorPhase,
	AccountMirrorStatusEntry,
	AccountMirrorStatusRegistry,
} from "./statusRegistry.js";

export interface AccountMirrorSchedulerPassRequest {
	dryRun?: boolean | null;
}

export interface AccountMirrorSchedulerSelectedTarget {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	status: AccountMirrorStatusEntry["status"];
	reason: AccountMirrorStatusEntry["reason"];
	eligibleAt: string | null;
	mirrorCompleteness: AccountMirrorStatusEntry["mirrorCompleteness"];
	requestedPhase?: AccountMirrorCollectorPhase | null;
	phaseDecision?: {
		phase: AccountMirrorLiveFollowCyclePhase | null;
		status: AccountMirrorLiveFollowCyclePhaseStatus | null;
		reason: string;
	};
}

export type AccountMirrorSchedulerBackpressureReason =
	| "none"
	| "routine-delayed"
	| "provider-guard"
	| "blocked-by-browser-work"
	| "yielded-to-queued-work"
	| "foreground-work";

export interface AccountMirrorSchedulerBackpressure {
	reason: AccountMirrorSchedulerBackpressureReason;
	message: string | null;
}

export interface AccountMirrorSchedulerPassResult {
	object: "account_mirror_scheduler_pass";
	mode: "dry-run" | "execute";
	action: "skipped" | "dry-run" | "refresh-completed" | "refresh-blocked";
	startedAt: string;
	completedAt: string;
	selectedTarget: AccountMirrorSchedulerSelectedTarget | null;
	backpressure: AccountMirrorSchedulerBackpressure;
	metrics: {
		totalTargets: number;
		eligibleTargets: number;
		delayedTargets: number;
		blockedTargets: number;
		liveFollowEnabledTargets?: number;
		liveFollowEligibleTargets?: number;
		liveFollowDelayedTargets?: number;
		/**
		 * @deprecated Use liveFollowEligibleTargets. Kept for existing status consumers.
		 */
		defaultChatgptEligibleTargets: number;
		/**
		 * @deprecated Use liveFollowDelayedTargets. Kept for existing status consumers.
		 */
		defaultChatgptDelayedTargets: number;
		inProgressEligibleTargets: number;
	};
	refresh: AccountMirrorRefreshResult | null;
	error: {
		code: string;
		statusCode: number;
		message: string;
		details: Record<string, unknown>;
	} | null;
}

export interface AccountMirrorSchedulerPassService {
	runOnce(request?: AccountMirrorSchedulerPassRequest): Promise<AccountMirrorSchedulerPassResult>;
}

export function createAccountMirrorSchedulerPassService(input: {
	registry: AccountMirrorStatusRegistry;
	refreshService: AccountMirrorRefreshService;
	now?: () => Date;
	shouldYieldToForegroundWork?: () => AccountMirrorSchedulerBackpressure | null;
	readHistory?: () => Promise<AccountMirrorSchedulerPassHistory>;
}): AccountMirrorSchedulerPassService {
	const now = input.now ?? (() => new Date());
	return {
		async runOnce(request = {}) {
			const dryRun = request.dryRun ?? true;
			const startedAt = now();
			await input.registry.refreshPersistentState?.();
			const status = input.registry.readStatus({
				explicitRefresh: false,
			});
			const eligibleTargets = status.entries.filter((entry) => entry.status === "eligible");
			const delayedTargets = status.entries.filter((entry) => entry.status === "delayed");
			const blockedTargets = status.entries.filter((entry) => entry.status === "blocked");
			const liveFollowTargets = status.entries.filter(
				(entry) => entry.liveFollow.state === "enabled",
			);
			const liveFollowEligibleTargets = eligibleTargets.filter(
				(entry) => entry.liveFollow.state === "enabled",
			);
			const liveFollowDelayedTargets = delayedTargets.filter(
				(entry) => entry.liveFollow.state === "enabled",
			);
			const history = (await input.readHistory?.().catch(() => null)) ?? null;
			const selected = chooseSchedulerTarget(liveFollowEligibleTargets, history);
			const metrics = {
				totalTargets: status.metrics.total,
				eligibleTargets: eligibleTargets.length,
				delayedTargets: delayedTargets.length,
				blockedTargets: blockedTargets.length,
				liveFollowEnabledTargets: liveFollowTargets.length,
				liveFollowEligibleTargets: liveFollowEligibleTargets.length,
				liveFollowDelayedTargets: liveFollowDelayedTargets.length,
				defaultChatgptEligibleTargets: liveFollowEligibleTargets.length,
				defaultChatgptDelayedTargets: liveFollowDelayedTargets.length,
				inProgressEligibleTargets: liveFollowEligibleTargets.filter(
					(entry) => entry.mirrorCompleteness.state === "in_progress",
				).length,
			};
			if (!selected) {
				return {
					object: "account_mirror_scheduler_pass",
					mode: dryRun ? "dry-run" : "execute",
					action: "skipped",
					startedAt: startedAt.toISOString(),
					completedAt: now().toISOString(),
					selectedTarget: null,
					backpressure: deriveSkippedBackpressure(liveFollowTargets),
					metrics,
					refresh: null,
					error: null,
				};
			}
			const selectedTarget = summarizeTarget(selected);
			const foregroundBackpressure = dryRun
				? null
				: (input.shouldYieldToForegroundWork?.() ?? null);
			if (foregroundBackpressure) {
				return {
					object: "account_mirror_scheduler_pass",
					mode: "execute",
					action: "skipped",
					startedAt: startedAt.toISOString(),
					completedAt: now().toISOString(),
					selectedTarget,
					backpressure: foregroundBackpressure,
					metrics,
					refresh: null,
					error: null,
				};
			}
			if (dryRun) {
				return {
					object: "account_mirror_scheduler_pass",
					mode: "dry-run",
					action: "dry-run",
					startedAt: startedAt.toISOString(),
					completedAt: now().toISOString(),
					selectedTarget,
					backpressure: {
						reason: "none",
						message: null,
					},
					metrics,
					refresh: null,
					error: null,
				};
			}
			try {
				const phaseDecision = chooseSchedulerPhase(selected);
				const refresh = await input.refreshService.requestRefresh({
					provider: selected.provider,
					runtimeProfileId: selected.runtimeProfileId,
					sweepMode: selected.liveFollow.sweepMode ?? "steady_follow",
					materializationPolicy: selected.liveFollow.materializationPolicy ?? null,
					requestedPhase: phaseDecision.requestedPhase,
					explicitRefresh: false,
					queueTimeoutMs: 0,
				});
				return {
					object: "account_mirror_scheduler_pass",
					mode: "execute",
					action: "refresh-completed",
					startedAt: startedAt.toISOString(),
					completedAt: now().toISOString(),
					selectedTarget,
					backpressure: deriveRefreshBackpressure(refresh),
					metrics,
					refresh,
					error: null,
				};
			} catch (error) {
				if (error instanceof AccountMirrorRefreshError) {
					return {
						object: "account_mirror_scheduler_pass",
						mode: "execute",
						action: "refresh-blocked",
						startedAt: startedAt.toISOString(),
						completedAt: now().toISOString(),
						selectedTarget,
						backpressure: deriveErrorBackpressure(error),
						metrics,
						refresh: null,
						error: {
							code: error.code,
							statusCode: error.statusCode,
							message: error.message,
							details: error.details,
						},
					};
				}
				throw error;
			}
		},
	};
}

function deriveSkippedBackpressure(
	entries: AccountMirrorStatusEntry[],
): AccountMirrorSchedulerBackpressure {
	const guarded = entries.find(
		(entry) =>
			entry.reason === "provider-manual-clear-required" ||
			entry.reason === "provider-guard-cooldown",
	);
	if (guarded) {
		return {
			reason: "provider-guard",
			message: guarded.providerGuard.summary ?? guarded.reason,
		};
	}
	const delayed = entries.find((entry) => entry.status === "delayed");
	if (delayed) {
		return {
			reason: "routine-delayed",
			message: delayed.reason,
		};
	}
	return {
		reason: "none",
		message: null,
	};
}

function deriveRefreshBackpressure(
	refresh: AccountMirrorRefreshResult,
): AccountMirrorSchedulerBackpressure {
	if (refresh.metadataEvidence?.attachmentInventory?.yielded === true) {
		return {
			reason: "yielded-to-queued-work",
			message: "Mirror refresh yielded between detail reads because browser work queued behind it.",
		};
	}
	return {
		reason: "none",
		message: null,
	};
}

function deriveErrorBackpressure(
	error: AccountMirrorRefreshError,
): AccountMirrorSchedulerBackpressure {
	if (error.code === "account_mirror_browser_operation_busy") {
		return {
			reason: "blocked-by-browser-work",
			message: error.message,
		};
	}
	return {
		reason: "none",
		message: null,
	};
}

function chooseSchedulerTarget(
	entries: AccountMirrorStatusEntry[],
	history: AccountMirrorSchedulerPassHistory | null,
): AccountMirrorStatusEntry | null {
	const recentSelections = createRecentSelectionMap(history);
	return [...entries].sort((a, b) => compareSchedulerTargets(a, b, recentSelections))[0] ?? null;
}

function compareSchedulerTargets(
	a: AccountMirrorStatusEntry,
	b: AccountMirrorStatusEntry,
	recentSelections: Map<string, number>,
): number {
	const priorityDelta = completenessPriority(a) - completenessPriority(b);
	if (priorityDelta !== 0) return priorityDelta;
	const recentSelectionDelta =
		recentSelectionPriority(a, recentSelections) - recentSelectionPriority(b, recentSelections);
	if (recentSelectionDelta !== 0) return recentSelectionDelta;
	const remainingDelta = remainingDetailSurfaces(b) - remainingDetailSurfaces(a);
	if (remainingDelta !== 0) return remainingDelta;
	return a.runtimeProfileId.localeCompare(b.runtimeProfileId);
}

function createRecentSelectionMap(
	history: AccountMirrorSchedulerPassHistory | null,
): Map<string, number> {
	const selections = new Map<string, number>();
	for (const pass of history?.entries ?? []) {
		const selected = pass.selectedTarget ?? pass.refresh ?? null;
		if (!selected) continue;
		const completedAtMs = Date.parse(pass.completedAt);
		if (!Number.isFinite(completedAtMs)) continue;
		const key = schedulerTargetKey(selected.provider, selected.runtimeProfileId);
		if (!selections.has(key)) {
			selections.set(key, completedAtMs);
		}
	}
	return selections;
}

function recentSelectionPriority(
	entry: AccountMirrorStatusEntry,
	recentSelections: Map<string, number>,
): number {
	return recentSelections.get(schedulerTargetKey(entry.provider, entry.runtimeProfileId)) ?? 0;
}

function schedulerTargetKey(provider: AccountMirrorProvider, runtimeProfileId: string): string {
	return `${provider}:${runtimeProfileId}`;
}

function completenessPriority(entry: AccountMirrorStatusEntry): number {
	switch (entry.mirrorCompleteness.state) {
		case "in_progress":
			return 0;
		case "unknown":
			return 1;
		case "none":
			return 2;
		case "complete":
			return 3;
	}
}

function remainingDetailSurfaces(entry: AccountMirrorStatusEntry): number {
	return entry.mirrorCompleteness.remainingDetailSurfaces?.total ?? 0;
}

function summarizeTarget(entry: AccountMirrorStatusEntry): AccountMirrorSchedulerSelectedTarget {
	const phaseDecision = chooseSchedulerPhase(entry);
	return {
		provider: entry.provider,
		runtimeProfileId: entry.runtimeProfileId,
		browserProfileId: entry.browserProfileId,
		status: entry.status,
		reason: entry.reason,
		eligibleAt: entry.eligibleAt,
		mirrorCompleteness: entry.mirrorCompleteness,
		requestedPhase: phaseDecision.requestedPhase,
		phaseDecision: {
			phase: phaseDecision.phase,
			status: phaseDecision.status,
			reason: phaseDecision.reason,
		},
	};
}

function chooseSchedulerPhase(entry: AccountMirrorStatusEntry): {
	phase: AccountMirrorLiveFollowCyclePhase;
	status: AccountMirrorLiveFollowCyclePhaseStatus;
	reason: string;
	requestedPhase: AccountMirrorCollectorPhase | null;
} {
	const decision = chooseLiveFollowCyclePhase({
		operation: {
			passCount: entry.metadataEvidence || entry.lastCompletedAt ? 1 : 0,
			lastRefresh: entry.metadataEvidence || entry.lastCompletedAt ? {} : null,
		},
		evidence: entry.metadataEvidence,
		remainingDetailSurfaces: entry.mirrorCompleteness.remainingDetailSurfaces?.total ?? null,
		backfillLedger: entry.backfillLedger,
	});
	return {
		...decision,
		requestedPhase: liveFollowPhaseToCollectorPhase(decision.phase),
	};
}

function liveFollowPhaseToCollectorPhase(
	phase: AccountMirrorLiveFollowCyclePhase,
): AccountMirrorCollectorPhase | null {
	if (
		phase === "identity" ||
		phase === "projects" ||
		phase === "root-conversations" ||
		phase === "project-conversations" ||
		phase === "chatgpt-library" ||
		phase === "detail-inventory" ||
		phase === "merge-persisted-catalog"
	) {
		return phase;
	}
	return null;
}
