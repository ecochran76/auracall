import { describe, expect, it } from "vitest";
import {
	type AccountMirrorChangeFrontierPlannerRow,
	planAccountMirrorChangeFrontier,
} from "../../src/accountMirror/changeFrontierPlanner.js";
import type { AccountMirrorConversationWorkState } from "../../src/accountMirror/changeFrontierState.js";
import type { AccountMirrorConversationFreshness } from "../../src/accountMirror/conversationFreshness.js";

const epochId = "sha256:epoch";
const now = "2026-09-30T18:00:00.000Z";

function freshness(
	override: Partial<AccountMirrorConversationFreshness> = {},
): AccountMirrorConversationFreshness {
	return {
		object: "account_mirror_conversation_freshness",
		state: "fresh",
		reasons: ["detail_current"],
		indexObservedAt: now,
		indexSource: "provider-index",
		indexRank: 0,
		detailObservedAt: now,
		manifestObservedAt: now,
		materializedAt: now,
		routeabilityObservedAt: now,
		routeabilityState: "routeable",
		conversationFingerprint: "sha256:fresh",
		detailCompleteness: "complete",
		assetCompleteness: "complete",
		assetCounts: { known: 0, local: 0, missingLocal: 0 },
		...override,
	};
}

function work(
	conversationKey: string,
	override: Partial<AccountMirrorConversationWorkState> = {},
): AccountMirrorConversationWorkState {
	return {
		object: "account_mirror_conversation_work_state",
		version: 1,
		conversationKey,
		epochId,
		indexFingerprint: "sha256:fresh",
		detailFingerprint: null,
		action: null,
		outcome: "pending",
		assetAvailability: "unknown",
		retryNotBefore: null,
		checkpointedAt: null,
		physicalActivity: {
			targetsCreated: 0,
			navigations: 0,
			reloads: 0,
			snapshotRefreshes: 0,
			artifactResolutions: 0,
			downloads: 0,
			duplicates: 0,
		},
		lifetimePhysicalActivity: {
			targetsCreated: 0,
			navigations: 0,
			reloads: 0,
			snapshotRefreshes: 0,
			artifactResolutions: 0,
			downloads: 0,
			duplicates: 0,
		},
		...override,
	};
}

function row(
	key: string,
	workOverride: Partial<AccountMirrorConversationWorkState> = {},
	freshnessOverride: Partial<AccountMirrorConversationFreshness> = {},
): AccountMirrorChangeFrontierPlannerRow {
	return { workState: work(key, workOverride), freshness: freshness(freshnessOverride) };
}

describe("account-mirror changed-frontier planner", () => {
	it.each([
		[
			"retry horizon",
			row("retry", { retryNotBefore: "2026-09-30T18:01:00.000Z" }),
			"defer",
			"retry_not_before",
		],
		[
			"same-epoch complete",
			row("complete", { outcome: "complete" }),
			"skip",
			"same_epoch_complete",
		],
		[
			"same-epoch terminal",
			row("terminal", { outcome: "terminal" }),
			"skip",
			"same_epoch_terminal",
		],
		[
			"guard",
			row("guard", {}, { state: "guarded", routeabilityState: "guarded" }),
			"defer",
			"provider_guarded",
		],
		[
			"identity mismatch",
			row(
				"identity",
				{},
				{ state: "terminal_unavailable", routeabilityState: "identity_mismatch" },
			),
			"defer",
			"identity_mismatch",
		],
		[
			"provider unavailable",
			row(
				"gone",
				{},
				{ state: "terminal_unavailable", routeabilityState: "not_found_or_unavailable" },
			),
			"skip",
			"provider_unavailable",
		],
		[
			"volatile unavailable",
			row("volatile", { assetAvailability: "unavailable" }),
			"skip",
			"provider_unavailable",
		],
		["unchanged complete", row("fresh"), "skip", "unchanged_complete"],
		[
			"same-epoch detail complete with missing assets",
			row(
				"partial",
				{ outcome: "complete", detailFingerprint: "sha256:detail" },
				{ assetCompleteness: "partial", assetCounts: { known: 5, local: 1, missingLocal: 4 } },
			),
			"materialize_retained",
			"retained_assets_actionable",
		],
		[
			"changed detail",
			row("changed", {}, { state: "stale" }),
			"visit_once",
			"detail_or_index_changed",
		],
		[
			"changed index before retained assets",
			row(
				"changed-index",
				{ detailFingerprint: "sha256:detail", indexFingerprint: "sha256:old-index" },
				{
					state: "missing_assets",
					assetCounts: { known: 1, local: 0, missingLocal: 1 },
					assetCompleteness: "partial",
				},
			),
			"visit_once",
			"detail_or_index_changed",
		],
		[
			"missing retained evidence",
			row(
				"missing",
				{},
				{
					state: "missing_assets",
					assetCounts: { known: 1, local: 0, missingLocal: 1 },
					assetCompleteness: "partial",
					manifestObservedAt: null,
				},
			),
			"visit_once",
			"retained_assets_incomplete",
		],
		[
			"actionable retained evidence",
			row(
				"retained",
				{ detailFingerprint: "sha256:detail" },
				{
					state: "missing_assets",
					assetCounts: { known: 1, local: 0, missingLocal: 1 },
					assetCompleteness: "partial",
				},
			),
			"materialize_retained",
			"retained_assets_actionable",
		],
	] as const)("selects the deterministic action for %s", (_label, item, action, reason) => {
		const plan = planAccountMirrorChangeFrontier({ epochId, now, rows: [item] });
		expect(plan.decisions).toEqual([
			expect.objectContaining({ action, reason, checkpointKey: item.workState.conversationKey }),
		]);
		expect(plan.counts[action]).toBe(1);
	});

	it("deduplicates stable keys without turning a duplicate into provider work", () => {
		const plan = planAccountMirrorChangeFrontier({
			epochId,
			now,
			rows: [row("same", {}, { state: "stale" }), row("same", {}, { state: "stale" })],
		});

		expect(plan.decisions.map(({ action, reason }) => ({ action, reason }))).toEqual([
			{ action: "visit_once", reason: "detail_or_index_changed" },
			{ action: "skip", reason: "duplicate_conversation_key" },
		]);
	});

	it("resumes after an exact keyset checkpoint", () => {
		const plan = planAccountMirrorChangeFrontier({
			epochId,
			now,
			rows: [row("first"), row("checkpoint"), row("remaining", {}, { state: "stale" })],
			resumeAfterConversationKey: "checkpoint",
		});

		expect(plan.checkpointFound).toBe(true);
		expect(plan.decisions.map((item) => item.conversationKey)).toEqual(["remaining"]);
	});

	it("restarts safely when a checkpoint key is absent", () => {
		const plan = planAccountMirrorChangeFrontier({
			epochId,
			now,
			rows: [row("first"), row("second")],
			resumeAfterConversationKey: "missing",
		});

		expect(plan.checkpointFound).toBe(false);
		expect(plan.decisions.map((item) => item.conversationKey)).toEqual(["first", "second"]);
	});
});
