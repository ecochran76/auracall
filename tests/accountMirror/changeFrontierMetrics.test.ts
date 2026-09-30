import { describe, expect, it } from "vitest";
import { deriveAccountMirrorChangeFrontierMetrics } from "../../src/accountMirror/changeFrontierMetrics.js";
import type { AccountMirrorConversationWorkState } from "../../src/accountMirror/changeFrontierState.js";
import type { Conversation } from "../../src/browser/providers/domain.js";

function conversation(
	id: string,
	state?: Partial<AccountMirrorConversationWorkState>,
): Conversation {
	const base: AccountMirrorConversationWorkState = {
		object: "account_mirror_conversation_work_state",
		version: 1,
		conversationKey: `hash-${id}`,
		epochId: "epoch-1",
		indexFingerprint: `index-${id}`,
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
	};
	return {
		id,
		title: id,
		provider: "chatgpt",
		metadata: { changeFrontierState: { ...base, ...state } },
	};
}

describe("deriveAccountMirrorChangeFrontierMetrics", () => {
	it("aggregates current-epoch physical work without identifiers", () => {
		const metrics = deriveAccountMirrorChangeFrontierMetrics([
			conversation("changed", {
				action: "visit_once",
				outcome: "complete",
				physicalActivity: {
					targetsCreated: 1,
					navigations: 1,
					reloads: 0,
					snapshotRefreshes: 0,
					artifactResolutions: 2,
					downloads: 1,
					duplicates: 1,
				},
			}),
			conversation("retained", {
				action: "materialize_retained",
				outcome: "deferred",
				physicalActivity: {
					targetsCreated: 0,
					navigations: 0,
					reloads: 0,
					snapshotRefreshes: 0,
					artifactResolutions: 1,
					downloads: 0,
					duplicates: 0,
				},
			}),
			conversation("unchanged", { action: "skip", outcome: "complete" }),
			{ id: "legacy", title: "legacy", provider: "chatgpt" },
		]);

		expect(metrics).toEqual({
			version: 1,
			indexRows: 4,
			actions: { skip: 1, visit_once: 1, materialize_retained: 1, defer: 0, unplanned: 1 },
			physical: {
				visits: 1,
				navigations: 1,
				reloads: 0,
				snapshotRefreshes: 0,
				artifactResolutions: 3,
				downloads: 1,
				duplicates: 1,
			},
			deferredRows: 1,
			amplification: { physicalActions: 5, perActionableRow: 2.5 },
		});
		expect(JSON.stringify(metrics)).not.toContain("changed");
	});
});
