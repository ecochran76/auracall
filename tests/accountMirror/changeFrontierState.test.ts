import { describe, expect, it } from "vitest";
import {
	createAccountMirrorProviderIndexEpoch,
	normalizeAccountMirrorConversationWorkState,
	normalizeAccountMirrorProviderIndexEpoch,
	rollAccountMirrorConversationWorkState,
} from "../../src/accountMirror/changeFrontierState.js";

const conversation = {
	id: "conv_fixture",
	title: "Fixture conversation",
	provider: "chatgpt" as const,
	projectId: "project_fixture",
	updatedAt: "2026-09-30T16:00:00.000Z",
	metadata: {
		conversationFingerprint: "sha256:index-row-fixture",
	},
};

function epoch(observedAt = "2026-09-30T16:01:00.000Z") {
	return createAccountMirrorProviderIndexEpoch({
		provider: "chatgpt",
		runtimeProfileId: "wsl-chrome-3",
		browserProfileId: "wsl-chrome-3",
		boundIdentityKey: "User@Example.com",
		observedAt,
		projectCount: 1,
		conversations: [conversation],
	});
}

describe("account-mirror change-frontier state", () => {
	it("creates a deterministic sanitized provider-index epoch", () => {
		const first = epoch();
		const second = epoch();

		expect(second).toEqual(first);
		expect(first).toMatchObject({
			object: "account_mirror_provider_index_epoch",
			version: 1,
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-3",
			browserProfileId: "wsl-chrome-3",
			coverage: { conversations: 1, projects: 1 },
		});
		expect(first.epochId).toMatch(/^sha256:[a-f0-9]{32}$/);
		expect(first.identityScopeHash).toMatch(/^sha256:[a-f0-9]{32}$/);
		expect(JSON.stringify(first)).not.toContain("User@Example.com");
		expect(JSON.stringify(first)).not.toContain("user@example.com");
		expect(epoch("2026-09-30T16:02:00.000Z").epochId).not.toBe(first.epochId);
	});

	it("migrates missing or invalid legacy state to a safe pending row", () => {
		const currentEpoch = epoch();
		const state = rollAccountMirrorConversationWorkState({
			conversation,
			epoch: currentEpoch,
			previous: { object: "legacy_frontier_state", version: 0, navigations: 99 },
		});

		expect(state).toMatchObject({
			object: "account_mirror_conversation_work_state",
			version: 1,
			epochId: currentEpoch.epochId,
			action: null,
			outcome: "pending",
			assetAvailability: "unknown",
			physicalActivity: {
				targetsCreated: 0,
				navigations: 0,
				reloads: 0,
				snapshotRefreshes: 0,
				artifactResolutions: 0,
				downloads: 0,
			},
		});
		expect(state.conversationKey).toMatch(/^sha256:[a-f0-9]{32}$/);
		expect(normalizeAccountMirrorConversationWorkState(state)).toEqual(state);
	});

	it("preserves same-epoch checkpoints and rolls physical counts into lifetime totals", () => {
		const firstEpoch = epoch();
		const previous = {
			...rollAccountMirrorConversationWorkState({ conversation, epoch: firstEpoch }),
			action: "visit_once" as const,
			outcome: "complete" as const,
			assetAvailability: "available" as const,
			checkpointedAt: "2026-09-30T16:01:30.000Z",
			physicalActivity: {
				targetsCreated: 1,
				navigations: 1,
				reloads: 0,
				snapshotRefreshes: 1,
				artifactResolutions: 2,
				downloads: 1,
			},
		};

		const sameEpoch = rollAccountMirrorConversationWorkState({
			conversation,
			epoch: firstEpoch,
			previous,
		});
		expect(sameEpoch).toMatchObject({
			action: "visit_once",
			outcome: "complete",
			assetAvailability: "available",
			physicalActivity: previous.physicalActivity,
		});

		const nextEpoch = epoch("2026-09-30T17:01:00.000Z");
		const rolled = rollAccountMirrorConversationWorkState({
			conversation,
			epoch: nextEpoch,
			previous,
		});
		expect(rolled).toMatchObject({
			epochId: nextEpoch.epochId,
			action: null,
			outcome: "pending",
			assetAvailability: "available",
			physicalActivity: {
				targetsCreated: 0,
				navigations: 0,
				reloads: 0,
				snapshotRefreshes: 0,
				artifactResolutions: 0,
				downloads: 0,
			},
			lifetimePhysicalActivity: previous.physicalActivity,
		});
	});

	it("rejects malformed epoch records instead of trusting partial cache state", () => {
		expect(normalizeAccountMirrorProviderIndexEpoch(null)).toBeNull();
		expect(
			normalizeAccountMirrorProviderIndexEpoch({
				object: "account_mirror_provider_index_epoch",
				version: 1,
				provider: "chatgpt",
				epochId: "",
			}),
		).toBeNull();
	});
});
