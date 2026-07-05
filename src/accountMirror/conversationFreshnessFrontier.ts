import type { Conversation } from "../browser/providers/domain.js";
import type { AccountMirrorCompletionSweepMode } from "./completionService.js";
import type {
	AccountMirrorConversationFreshness,
	AccountMirrorConversationFreshnessState,
	AccountMirrorConversationMaterializationPolicy,
} from "./conversationFreshness.js";
import { readAccountMirrorConversationFreshness } from "./conversationFreshness.js";
import type { AccountMirrorProvider } from "./politePolicy.js";

export type ConversationFreshnessFrontierFallbackReason =
	| "full_sweep_override"
	| "missing_remote_mtime"
	| "missing_cached_summary"
	| "cached_state_not_fresh"
	| "routeability_not_current"
	| "missing_local_assets"
	| "incomplete_detail_chunk";

export type ConversationFreshnessFrontierRowDecision = "selected" | "fresh-frontier" | "stopped";

export interface ConversationFreshnessFrontierCachedSummary {
	conversationId: string;
	detailObservedAt: string | null;
	manifestObservedAt: string | null;
	freshnessState: AccountMirrorConversationFreshnessState | "unknown";
	routeabilityState: AccountMirrorConversationFreshness["routeabilityState"];
	assetCompleteness: AccountMirrorConversationFreshness["assetCompleteness"];
	missingLocalCount: number;
	incompleteDetailChunk: boolean;
}

export interface ConversationFreshnessFrontierRowEvidence {
	conversationId: string;
	index: number;
	remoteMtime: string | null;
	decision: ConversationFreshnessFrontierRowDecision;
	reasons: ConversationFreshnessFrontierFallbackReason[];
	cachedFresh: boolean;
	freshRunLength: number;
}

export interface ConversationFreshnessFrontierEvidence {
	object: "account_mirror_conversation_freshness_frontier";
	provider: AccountMirrorProvider;
	sweepMode: AccountMirrorCompletionSweepMode;
	threshold: number;
	rowsExamined: number;
	rowsSelectedForDetail: number;
	frontierReached: boolean;
	firstStoppedRow: {
		conversationId: string;
		index: number;
		remoteMtime: string | null;
	} | null;
	fallbackReason: ConversationFreshnessFrontierFallbackReason | null;
	selectedConversationIds: string[];
	rowEvidence: ConversationFreshnessFrontierRowEvidence[];
}

export interface ConversationFreshnessFrontierResult {
	conversations: Conversation[];
	evidence: ConversationFreshnessFrontierEvidence;
}

export function buildConversationFreshnessSummaryMap(
	conversations: readonly Conversation[],
): Map<string, ConversationFreshnessFrontierCachedSummary> {
	const summaries = new Map<string, ConversationFreshnessFrontierCachedSummary>();
	for (const conversation of conversations) {
		const conversationId = normalizeId(conversation.id);
		if (!conversationId) continue;
		const freshness = readAccountMirrorConversationFreshness(conversation);
		if (!freshness) continue;
		summaries.set(conversationId, {
			conversationId,
			detailObservedAt: freshness.detailObservedAt,
			manifestObservedAt: freshness.manifestObservedAt,
			freshnessState: freshness.state,
			routeabilityState: freshness.routeabilityState,
			assetCompleteness: freshness.assetCompleteness,
			missingLocalCount: Math.max(0, Math.floor(freshness.assetCounts.missingLocal)),
			incompleteDetailChunk: false,
		});
	}
	return summaries;
}

export function applyConversationFreshnessFrontier(input: {
	provider: AccountMirrorProvider;
	sweepMode: AccountMirrorCompletionSweepMode;
	conversations: readonly Conversation[];
	cachedSummaries?: ReadonlyMap<string, ConversationFreshnessFrontierCachedSummary> | null;
	incompleteDetailConversationId?: string | null;
	threshold?: number | null;
	materializationPolicy?: AccountMirrorConversationMaterializationPolicy | null;
}): ConversationFreshnessFrontierResult {
	const threshold = normalizeThreshold(input.threshold);
	if (input.sweepMode === "full_sweep") {
		return {
			conversations: [...input.conversations],
			evidence: createFrontierEvidence({
				provider: input.provider,
				sweepMode: input.sweepMode,
				threshold,
				rows: input.conversations.map((conversation, index) => ({
					conversationId: conversation.id,
					index,
					remoteMtime: readRemoteMtime(conversation),
					decision: "selected",
					reasons: ["full_sweep_override"],
					cachedFresh: false,
					freshRunLength: 0,
				})),
				selectedIds: input.conversations.map((conversation) => conversation.id).filter(Boolean),
				firstStoppedRow: null,
			}),
		};
	}

	const selected: Conversation[] = [];
	const rows: ConversationFreshnessFrontierRowEvidence[] = [];
	let freshRunLength = 0;
	let firstStoppedRow: ConversationFreshnessFrontierEvidence["firstStoppedRow"] = null;

	for (const [index, conversation] of input.conversations.entries()) {
		const conversationId = normalizeId(conversation.id);
		const remoteMtime = readRemoteMtime(conversation);
		const cached = conversationId ? input.cachedSummaries?.get(conversationId) : undefined;
		const reasons = evaluateSelectionReasons({
			remoteMtime,
			cached,
			materializationPolicy: input.materializationPolicy ?? null,
			incompleteDetail:
				!!conversationId && conversationId === normalizeId(input.incompleteDetailConversationId),
		});
		if (reasons.length === 0) {
			freshRunLength += 1;
			const row: ConversationFreshnessFrontierRowEvidence = {
				conversationId,
				index,
				remoteMtime,
				decision: "fresh-frontier",
				reasons: [],
				cachedFresh: true,
				freshRunLength,
			};
			rows.push(row);
			if (freshRunLength >= threshold) {
				firstStoppedRow = {
					conversationId,
					index,
					remoteMtime,
				};
				row.decision = "stopped";
				break;
			}
			continue;
		}
		freshRunLength = 0;
		selected.push(conversation);
		rows.push({
			conversationId,
			index,
			remoteMtime,
			decision: "selected",
			reasons,
			cachedFresh: false,
			freshRunLength,
		});
	}

	return {
		conversations: selected,
		evidence: createFrontierEvidence({
			provider: input.provider,
			sweepMode: input.sweepMode,
			threshold,
			rows,
			selectedIds: selected.map((conversation) => conversation.id).filter(Boolean),
			firstStoppedRow,
		}),
	};
}

function createFrontierEvidence(input: {
	provider: AccountMirrorProvider;
	sweepMode: AccountMirrorCompletionSweepMode;
	threshold: number;
	rows: ConversationFreshnessFrontierRowEvidence[];
	selectedIds: string[];
	firstStoppedRow: ConversationFreshnessFrontierEvidence["firstStoppedRow"];
}): ConversationFreshnessFrontierEvidence {
	const fallbackReason =
		input.rows.find((row) => row.decision === "selected" && row.reasons.length > 0)?.reasons[0] ??
		null;
	return {
		object: "account_mirror_conversation_freshness_frontier",
		provider: input.provider,
		sweepMode: input.sweepMode,
		threshold: input.threshold,
		rowsExamined: input.rows.length,
		rowsSelectedForDetail: input.selectedIds.length,
		frontierReached: input.firstStoppedRow !== null,
		firstStoppedRow: input.firstStoppedRow,
		fallbackReason,
		selectedConversationIds: input.selectedIds.slice(0, 25),
		rowEvidence: input.rows.slice(0, 25),
	};
}

function evaluateSelectionReasons(input: {
	remoteMtime: string | null;
	cached?: ConversationFreshnessFrontierCachedSummary | null;
	materializationPolicy: AccountMirrorConversationMaterializationPolicy | null;
	incompleteDetail: boolean;
}): ConversationFreshnessFrontierFallbackReason[] {
	const reasons: ConversationFreshnessFrontierFallbackReason[] = [];
	if (!input.remoteMtime) reasons.push("missing_remote_mtime");
	if (!input.cached) {
		reasons.push("missing_cached_summary");
		return reasons;
	}
	if (input.incompleteDetail || input.cached.incompleteDetailChunk) {
		reasons.push("incomplete_detail_chunk");
	}
	if (input.cached.freshnessState !== "fresh") {
		reasons.push("cached_state_not_fresh");
	}
	if (
		input.cached.routeabilityState !== "routeable" &&
		input.cached.routeabilityState !== "unknown"
	) {
		reasons.push("routeability_not_current");
	}
	if (
		input.materializationPolicy !== "metadata_only" &&
		(input.cached.missingLocalCount > 0 || input.cached.assetCompleteness === "partial")
	) {
		reasons.push("missing_local_assets");
	}
	if (input.remoteMtime && isObservedAfter(input.remoteMtime, input.cached.detailObservedAt)) {
		reasons.push("cached_state_not_fresh");
	}
	if (input.remoteMtime && isObservedAfter(input.remoteMtime, input.cached.manifestObservedAt)) {
		reasons.push("cached_state_not_fresh");
	}
	return [...new Set(reasons)];
}

function readRemoteMtime(conversation: Conversation): string | null {
	const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
	return (
		normalizeIsoString(conversation.updatedAt) ??
		normalizeIsoString(readString(metadata.updatedAt)) ??
		normalizeIsoString(readString(metadata.lastMessageAt)) ??
		normalizeIsoString(readString(metadata.lastActivityAt))
	);
}

function isObservedAfter(left: string, right: string | null): boolean {
	if (!right) return true;
	const leftMs = Date.parse(left);
	const rightMs = Date.parse(right);
	return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs > rightMs;
}

function normalizeThreshold(value: number | null | undefined): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 3;
}

function normalizeIsoString(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeId(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
