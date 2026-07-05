import { describe, expect, test } from "vitest";
import {
	applyConversationFreshnessFrontier,
	type ConversationFreshnessFrontierCachedSummary,
} from "../../src/accountMirror/conversationFreshnessFrontier.js";
import type { Conversation } from "../../src/browser/providers/domain.js";

function conversation(id: string, updatedAt: string | undefined): Conversation {
	return {
		id,
		title: id,
		provider: "chatgpt",
		...(updatedAt ? { updatedAt } : {}),
	};
}

function cachedFresh(
	conversationId: string,
	observedAt = "2026-06-27T12:00:00.000Z",
): ConversationFreshnessFrontierCachedSummary {
	return {
		conversationId,
		detailObservedAt: observedAt,
		manifestObservedAt: observedAt,
		freshnessState: "fresh",
		routeabilityState: "unknown",
		assetCompleteness: "complete",
		missingLocalCount: 0,
		incompleteDetailChunk: false,
	};
}

describe("conversation freshness frontier", () => {
	test("stops steady-follow detail selection after a contiguous cached-fresh frontier", () => {
		const rows = [
			conversation("changed", "2026-06-27T12:05:00.000Z"),
			conversation("fresh_1", "2026-06-27T11:55:00.000Z"),
			conversation("fresh_2", "2026-06-27T11:54:00.000Z"),
			conversation("old_unexamined", "2026-06-27T11:00:00.000Z"),
		];
		const cached = new Map([
			["changed", cachedFresh("changed", "2026-06-27T12:00:00.000Z")],
			["fresh_1", cachedFresh("fresh_1")],
			["fresh_2", cachedFresh("fresh_2")],
			["old_unexamined", cachedFresh("old_unexamined")],
		]);

		const result = applyConversationFreshnessFrontier({
			provider: "chatgpt",
			sweepMode: "steady_follow",
			conversations: rows,
			cachedSummaries: cached,
			threshold: 2,
		});

		expect(result.conversations.map((item) => item.id)).toEqual(["changed"]);
		expect(result.evidence).toMatchObject({
			frontierReached: true,
			rowsExamined: 3,
			rowsSelectedForDetail: 1,
			firstStoppedRow: {
				conversationId: "fresh_2",
				index: 2,
			},
		});
	});

	test("selects stale, missing-asset, incomplete-chunk, and missing-mtime rows", () => {
		const rows = [
			conversation("stale", "2026-06-27T12:05:00.000Z"),
			conversation("missing_assets", "2026-06-27T11:55:00.000Z"),
			conversation("chunked", "2026-06-27T11:50:00.000Z"),
			conversation("missing_mtime", undefined),
		];
		const cached = new Map<string, ConversationFreshnessFrontierCachedSummary>([
			["stale", { ...cachedFresh("stale"), freshnessState: "stale" }],
			["missing_assets", { ...cachedFresh("missing_assets"), missingLocalCount: 1 }],
			["chunked", cachedFresh("chunked")],
			["missing_mtime", cachedFresh("missing_mtime")],
		]);

		const result = applyConversationFreshnessFrontier({
			provider: "gemini",
			sweepMode: "steady_follow",
			conversations: rows,
			cachedSummaries: cached,
			incompleteDetailConversationId: "chunked",
			threshold: 2,
		});

		expect(result.conversations.map((item) => item.id)).toEqual([
			"stale",
			"missing_assets",
			"chunked",
			"missing_mtime",
		]);
		expect(result.evidence.rowEvidence.map((row) => row.reasons[0])).toEqual([
			"cached_state_not_fresh",
			"missing_local_assets",
			"incomplete_detail_chunk",
			"missing_remote_mtime",
		]);
		expect(result.evidence.frontierReached).toBe(false);
	});

	test("does not select metadata-only rows solely for local materialization backlog", () => {
		const rows = [
			conversation("remote_backlog", "2026-06-27T11:55:00.000Z"),
			conversation("fresh_1", "2026-06-27T11:54:00.000Z"),
		];
		const cached = new Map<string, ConversationFreshnessFrontierCachedSummary>([
			[
				"remote_backlog",
				{
					...cachedFresh("remote_backlog", "2026-06-27T12:00:00.000Z"),
					assetCompleteness: "partial",
					missingLocalCount: 3,
				},
			],
			["fresh_1", cachedFresh("fresh_1")],
		]);

		const result = applyConversationFreshnessFrontier({
			provider: "chatgpt",
			sweepMode: "steady_follow",
			conversations: rows,
			cachedSummaries: cached,
			materializationPolicy: "metadata_only",
			threshold: 2,
		});

		expect(result.conversations).toEqual([]);
		expect(result.evidence).toMatchObject({
			frontierReached: true,
			rowsSelectedForDetail: 0,
			firstStoppedRow: {
				conversationId: "fresh_1",
			},
		});
		expect(result.evidence.rowEvidence[0]).toMatchObject({
			conversationId: "remote_backlog",
			decision: "fresh-frontier",
			reasons: [],
			cachedFresh: true,
		});
	});

	test("selects local materialization backlog when policy requires missing assets", () => {
		const rows = [conversation("remote_backlog", "2026-06-27T11:55:00.000Z")];
		const cached = new Map<string, ConversationFreshnessFrontierCachedSummary>([
			[
				"remote_backlog",
				{
					...cachedFresh("remote_backlog", "2026-06-27T12:00:00.000Z"),
					assetCompleteness: "partial",
					missingLocalCount: 3,
				},
			],
		]);

		const result = applyConversationFreshnessFrontier({
			provider: "chatgpt",
			sweepMode: "steady_follow",
			conversations: rows,
			cachedSummaries: cached,
			materializationPolicy: "recent_missing_assets",
			threshold: 2,
		});

		expect(result.conversations.map((item) => item.id)).toEqual(["remote_backlog"]);
		expect(result.evidence.rowEvidence[0]).toMatchObject({
			conversationId: "remote_backlog",
			decision: "selected",
			reasons: ["missing_local_assets"],
			cachedFresh: false,
		});
	});

	test("full-sweep override keeps every row selected", () => {
		const rows = [
			conversation("fresh_1", "2026-06-27T11:55:00.000Z"),
			conversation("fresh_2", "2026-06-27T11:54:00.000Z"),
			conversation("fresh_3", "2026-06-27T11:53:00.000Z"),
		];

		const result = applyConversationFreshnessFrontier({
			provider: "grok",
			sweepMode: "full_sweep",
			conversations: rows,
			cachedSummaries: new Map(rows.map((row) => [row.id, cachedFresh(row.id)])),
			threshold: 1,
		});

		expect(result.conversations.map((item) => item.id)).toEqual(["fresh_1", "fresh_2", "fresh_3"]);
		expect(result.evidence).toMatchObject({
			frontierReached: false,
			rowsSelectedForDetail: 3,
			fallbackReason: "full_sweep_override",
		});
	});
});
