import type {
	AccountMirrorConversationWorkState,
	AccountMirrorFrontierAction,
} from "./changeFrontierState.js";
import type { AccountMirrorConversationFreshness } from "./conversationFreshness.js";

export type AccountMirrorFrontierDecisionReason =
	| "duplicate_conversation_key"
	| "retry_not_before"
	| "same_epoch_complete"
	| "same_epoch_terminal"
	| "provider_guarded"
	| "identity_mismatch"
	| "provider_unavailable"
	| "unchanged_complete"
	| "retained_assets_actionable"
	| "retained_assets_incomplete"
	| "detail_or_index_changed";

export interface AccountMirrorChangeFrontierPlannerRow {
	workState: AccountMirrorConversationWorkState;
	freshness: AccountMirrorConversationFreshness;
}

export interface AccountMirrorChangeFrontierDecision {
	conversationKey: string;
	action: AccountMirrorFrontierAction;
	reason: AccountMirrorFrontierDecisionReason;
	checkpointKey: string;
}

export interface AccountMirrorChangeFrontierPlan {
	object: "account_mirror_change_frontier_plan";
	version: 1;
	epochId: string;
	resumeAfterConversationKey: string | null;
	checkpointFound: boolean;
	decisions: AccountMirrorChangeFrontierDecision[];
	counts: Record<AccountMirrorFrontierAction, number>;
}

export function planAccountMirrorChangeFrontier(input: {
	epochId: string;
	now: string;
	rows: readonly AccountMirrorChangeFrontierPlannerRow[];
	resumeAfterConversationKey?: string | null;
}): AccountMirrorChangeFrontierPlan {
	const resumeAfterConversationKey = normalizeOptionalString(input.resumeAfterConversationKey);
	const checkpointIndex = resumeAfterConversationKey
		? input.rows.findIndex((row) => row.workState.conversationKey === resumeAfterConversationKey)
		: -1;
	const checkpointFound = resumeAfterConversationKey === null || checkpointIndex >= 0;
	const startIndex = checkpointFound && checkpointIndex >= 0 ? checkpointIndex + 1 : 0;
	const seen = new Set<string>();
	const decisions: AccountMirrorChangeFrontierDecision[] = [];

	for (const row of input.rows.slice(startIndex)) {
		const conversationKey = row.workState.conversationKey;
		if (seen.has(conversationKey)) {
			decisions.push(decision(conversationKey, "skip", "duplicate_conversation_key"));
			continue;
		}
		seen.add(conversationKey);
		decisions.push(decideRow({ ...input, row }));
	}

	return {
		object: "account_mirror_change_frontier_plan",
		version: 1,
		epochId: input.epochId,
		resumeAfterConversationKey,
		checkpointFound,
		decisions,
		counts: countActions(decisions),
	};
}

export function normalizeAccountMirrorChangeFrontierPlan(
	value: unknown,
): AccountMirrorChangeFrontierPlan | null {
	if (
		!isRecord(value) ||
		value.object !== "account_mirror_change_frontier_plan" ||
		value.version !== 1
	) {
		return null;
	}
	const epochId = normalizeOptionalString(value.epochId);
	if (!epochId || !Array.isArray(value.decisions)) return null;
	const decisions = value.decisions.flatMap((item) => {
		if (!isRecord(item)) return [];
		const conversationKey = normalizeOptionalString(item.conversationKey);
		const action = normalizeAction(item.action);
		const reason = normalizeReason(item.reason);
		if (!conversationKey || !action || !reason) return [];
		return [decision(conversationKey, action, reason)];
	});
	return {
		object: "account_mirror_change_frontier_plan",
		version: 1,
		epochId,
		resumeAfterConversationKey: normalizeOptionalString(value.resumeAfterConversationKey),
		checkpointFound: value.checkpointFound === true,
		decisions,
		counts: countActions(decisions),
	};
}

function decideRow(input: {
	epochId: string;
	now: string;
	row: AccountMirrorChangeFrontierPlannerRow;
}): AccountMirrorChangeFrontierDecision {
	const { workState, freshness } = input.row;
	if (isFuture(workState.retryNotBefore, input.now)) {
		return decision(workState.conversationKey, "defer", "retry_not_before");
	}
	if (
		workState.epochId === input.epochId &&
		workState.outcome === "complete" &&
		freshness.assetCounts.missingLocal === 0 &&
		freshness.state !== "missing_assets"
	) {
		return decision(workState.conversationKey, "skip", "same_epoch_complete");
	}
	if (workState.epochId === input.epochId && workState.outcome === "terminal") {
		return decision(workState.conversationKey, "skip", "same_epoch_terminal");
	}
	if (freshness.routeabilityState === "guarded" || freshness.state === "guarded") {
		return decision(workState.conversationKey, "defer", "provider_guarded");
	}
	if (freshness.routeabilityState === "identity_mismatch") {
		return decision(workState.conversationKey, "defer", "identity_mismatch");
	}
	if (
		freshness.routeabilityState === "not_found_or_unavailable" ||
		workState.assetAvailability === "unavailable"
	) {
		return decision(workState.conversationKey, "skip", "provider_unavailable");
	}
	if (freshness.conversationFingerprint !== workState.indexFingerprint) {
		return decision(workState.conversationKey, "visit_once", "detail_or_index_changed");
	}
	if (freshness.assetCounts.missingLocal > 0 || freshness.state === "missing_assets") {
		if (workState.detailFingerprint && freshness.manifestObservedAt) {
			return decision(
				workState.conversationKey,
				"materialize_retained",
				"retained_assets_actionable",
			);
		}
		return decision(workState.conversationKey, "visit_once", "retained_assets_incomplete");
	}
	if (
		freshness.state === "fresh" &&
		freshness.detailCompleteness === "complete" &&
		freshness.assetCounts.missingLocal === 0
	) {
		return decision(workState.conversationKey, "skip", "unchanged_complete");
	}
	return decision(workState.conversationKey, "visit_once", "detail_or_index_changed");
}

function decision(
	conversationKey: string,
	action: AccountMirrorFrontierAction,
	reason: AccountMirrorFrontierDecisionReason,
): AccountMirrorChangeFrontierDecision {
	return { conversationKey, action, reason, checkpointKey: conversationKey };
}

function countActions(
	decisions: readonly AccountMirrorChangeFrontierDecision[],
): Record<AccountMirrorFrontierAction, number> {
	const counts: Record<AccountMirrorFrontierAction, number> = {
		skip: 0,
		visit_once: 0,
		materialize_retained: 0,
		defer: 0,
	};
	for (const item of decisions) counts[item.action] += 1;
	return counts;
}

function isFuture(value: string | null, now: string): boolean {
	if (!value) return false;
	const timestamp = Date.parse(value);
	const nowTimestamp = Date.parse(now);
	return Number.isFinite(timestamp) && Number.isFinite(nowTimestamp) && timestamp > nowTimestamp;
}

function normalizeOptionalString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized || null;
}

function normalizeAction(value: unknown): AccountMirrorFrontierAction | null {
	return value === "skip" ||
		value === "visit_once" ||
		value === "materialize_retained" ||
		value === "defer"
		? value
		: null;
}

function normalizeReason(value: unknown): AccountMirrorFrontierDecisionReason | null {
	return value === "duplicate_conversation_key" ||
		value === "retry_not_before" ||
		value === "same_epoch_complete" ||
		value === "same_epoch_terminal" ||
		value === "provider_guarded" ||
		value === "identity_mismatch" ||
		value === "provider_unavailable" ||
		value === "unchanged_complete" ||
		value === "retained_assets_actionable" ||
		value === "retained_assets_incomplete" ||
		value === "detail_or_index_changed"
		? value
		: null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
