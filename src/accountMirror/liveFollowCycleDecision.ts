import type { AccountMirrorCompletionOperation } from "./completionService.js";
import type {
	AccountMirrorCollectorPhase,
	AccountMirrorMetadataEvidence,
	AccountMirrorStatusEntry,
} from "./statusRegistry.js";

export type AccountMirrorLiveFollowCyclePhase =
	| AccountMirrorCollectorPhase
	| "materialization"
	| "account-library";

export type AccountMirrorLiveFollowCyclePhaseStatus =
	| "pending"
	| "running"
	| "yielded"
	| "complete"
	| "skipped"
	| "blocked";

export interface AccountMirrorLiveFollowCyclePhaseEntry {
	phase: AccountMirrorLiveFollowCyclePhase;
	status: AccountMirrorLiveFollowCyclePhaseStatus;
	reason: string;
	updatedAt: string;
	passCount: number;
}

export interface AccountMirrorLiveFollowCycleLedger {
	cycleId: string;
	startedAt: string;
	updatedAt: string;
	currentPhase: AccountMirrorLiveFollowCyclePhase;
	nextPhase: AccountMirrorLiveFollowCyclePhase;
	decisionReason: string;
	passCount: number;
	phases: AccountMirrorLiveFollowCyclePhaseEntry[];
}

export function deriveLiveFollowCycleLedger(input: {
	operation: AccountMirrorCompletionOperation;
	statusEntry?: AccountMirrorStatusEntry | null;
	now: string;
}): AccountMirrorLiveFollowCycleLedger | null {
	const operation = input.operation;
	if (operation.mode !== "live_follow") return operation.liveFollowCycle ?? null;
	const previous = operation.liveFollowCycle ?? null;
	const evidence = operation.lastRefresh?.metadataEvidence ?? null;
	const completeness =
		operation.lastRefresh?.mirrorCompleteness ??
		operation.mirrorCompleteness ??
		input.statusEntry?.mirrorCompleteness ??
		null;
	const decision = chooseLiveFollowCyclePhase({
		operation,
		evidence,
		remainingDetailSurfaces: completeness?.remainingDetailSurfaces?.total ?? null,
	});
	const cycleId =
		previous?.cycleId ?? `lfc_${operation.id}_${Date.parse(operation.startedAt) || 0}`;
	return {
		cycleId,
		startedAt: previous?.startedAt ?? operation.startedAt,
		updatedAt: input.now,
		currentPhase: decision.phase,
		nextPhase: decision.phase,
		decisionReason: decision.reason,
		passCount: operation.passCount,
		phases: updatePhaseEntries({
			previous: previous?.phases ?? [],
			phase: decision.phase,
			status: decision.status,
			reason: decision.reason,
			updatedAt: input.now,
			passCount: operation.passCount,
		}),
	};
}

export function chooseLiveFollowCyclePhase(input: {
	operation: Pick<AccountMirrorCompletionOperation, "passCount" | "lastRefresh">;
	evidence: AccountMirrorMetadataEvidence | null;
	remainingDetailSurfaces: number | null;
}): {
	phase: AccountMirrorLiveFollowCyclePhase;
	status: AccountMirrorLiveFollowCyclePhaseStatus;
	reason: string;
} {
	const evidence = input.evidence;
	const collectorProgress = evidence?.collectorProgress ?? null;
	const attachmentCursor = evidence?.attachmentInventory ?? null;
	const projectConversationCursor = evidence?.projectConversations ?? null;
	const frontier = evidence?.conversationFreshnessFrontier ?? null;
	const assetInventoryState = evidence?.assetInventory?.state ?? null;
	const remainingDetailSurfaces = Math.max(0, Math.floor(input.remainingDetailSurfaces ?? 0));

	if (!input.operation.lastRefresh && input.operation.passCount === 0) {
		return {
			phase: "identity",
			status: "pending",
			reason: "no completed refresh exists for this live-follow cycle",
		};
	}
	if (attachmentCursor?.conversationDetail) {
		return {
			phase: "detail-inventory",
			status: "pending",
			reason: `conversation detail cursor is pending for ${attachmentCursor.conversationDetail.conversationId}`,
		};
	}
	if (attachmentCursor?.yielded === true) {
		return {
			phase: "detail-inventory",
			status: "yielded",
			reason: "detail inventory yielded before completion",
		};
	}
	if (assetInventoryState === "in_progress" || assetInventoryState === "deferred") {
		return {
			phase: "detail-inventory",
			status: assetInventoryState === "in_progress" ? "running" : "pending",
			reason: `asset inventory is ${assetInventoryState}`,
		};
	}
	if (remainingDetailSurfaces > 0) {
		return {
			phase: "detail-inventory",
			status: "pending",
			reason: `${remainingDetailSurfaces} detail surface(s) remain incomplete`,
		};
	}
	if (frontier && frontier.rowsSelectedForDetail > 0) {
		return {
			phase: "detail-inventory",
			status: "pending",
			reason: `freshness frontier selected ${frontier.rowsSelectedForDetail} conversation row(s) for detail`,
		};
	}
	if (projectConversationCursor) {
		return {
			phase: "project-conversations",
			status: projectConversationCursor.yielded === true ? "yielded" : "pending",
			reason: "project conversation cursor is pending",
		};
	}
	if (collectorProgress && collectorProgress.phase !== "complete") {
		return {
			phase: collectorProgress.phase,
			status: collectorProgress.event === "failed" ? "blocked" : "pending",
			reason: `collector last reported ${collectorProgress.phase}:${collectorProgress.event}`,
		};
	}
	return {
		phase: "complete",
		status: "complete",
		reason: "all required live-follow phases are complete for the current evidence window",
	};
}

function updatePhaseEntries(input: {
	previous: AccountMirrorLiveFollowCyclePhaseEntry[];
	phase: AccountMirrorLiveFollowCyclePhase;
	status: AccountMirrorLiveFollowCyclePhaseStatus;
	reason: string;
	updatedAt: string;
	passCount: number;
}): AccountMirrorLiveFollowCyclePhaseEntry[] {
	const next = input.previous.filter((entry) => entry.phase !== input.phase);
	next.push({
		phase: input.phase,
		status: input.status,
		reason: input.reason,
		updatedAt: input.updatedAt,
		passCount: input.passCount,
	});
	return next.slice(-12);
}
