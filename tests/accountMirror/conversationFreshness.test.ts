import { describe, expect, test } from "vitest";
import { deriveAccountMirrorConversationFreshness } from "../../src/accountMirror/conversationFreshness.js";

const completeMirror = {
	state: "complete" as const,
	summary: "complete",
	remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
	signals: {
		projectsTruncated: false,
		conversationsTruncated: false,
		attachmentInventoryTruncated: false,
		attachmentCursorPresent: false,
	},
};

describe("account mirror conversation freshness", () => {
	test("uses metadata detail completeness when hydrating cached frontier rows", () => {
		const freshness = deriveAccountMirrorConversationFreshness({
			conversationId: "conv_cached",
			item: {
				id: "conv_cached",
				title: "Cached thread",
				provider: "chatgpt",
				updatedAt: "2026-06-26T17:09:57.827Z",
				metadata: {
					indexObservedAt: "2026-06-26T17:09:57.827Z",
					detailObservedAt: "2026-06-27T19:16:35.693Z",
					manifestObservedAt: "2026-06-27T19:16:35.693Z",
					detailCompleteness: "complete",
				},
			},
			target: {
				lastCompletedAt: null,
				mirrorCompleteness: null,
			},
			detail: {
				exists: false,
				observedAt: null,
				messageCount: null,
				fileCount: null,
				artifactCount: null,
				sourceCount: null,
			},
			assets: [],
		});

		expect(freshness).toMatchObject({
			state: "fresh",
			detailCompleteness: "complete",
			reasons: ["detail_current"],
		});
	});

	test("marks conversations with remote-only assets as missing_assets", () => {
		const freshness = deriveAccountMirrorConversationFreshness({
			conversationId: "conv_1",
			item: {
				id: "conv_1",
				title: "Image thread",
				provider: "gemini",
				updatedAt: "2026-05-23T12:00:00.000Z",
			},
			target: {
				lastCompletedAt: "2026-05-23T12:01:00.000Z",
				mirrorCompleteness: completeMirror,
			},
			detail: {
				exists: true,
				observedAt: "2026-05-23T12:01:00.000Z",
				messageCount: 4,
				fileCount: 0,
				artifactCount: 1,
				sourceCount: 0,
			},
			assets: [
				{
					id: "artifact_1",
					title: "Generated image",
					uri: "https://gemini.google.com/app/asset/1",
					metadata: { conversationId: "conv_1" },
				},
			],
		});

		expect(freshness).toMatchObject({
			state: "missing_assets",
			detailCompleteness: "complete",
			assetCompleteness: "partial",
			assetCounts: {
				known: 1,
				local: 0,
				missingLocal: 1,
			},
			reasons: ["missing_local_assets"],
		});
	});

	test("treats remote-only assets as local materialization backlog under metadata-only policy", () => {
		const freshness = deriveAccountMirrorConversationFreshness({
			conversationId: "conv_metadata_only",
			item: {
				id: "conv_metadata_only",
				title: "Artifact-rich thread",
				provider: "chatgpt",
				updatedAt: "2026-05-23T12:00:00.000Z",
			},
			target: {
				lastCompletedAt: "2026-05-23T12:01:00.000Z",
				mirrorCompleteness: completeMirror,
			},
			detail: {
				exists: true,
				observedAt: "2026-05-23T12:01:00.000Z",
				messageCount: 4,
				fileCount: 0,
				artifactCount: 1,
				sourceCount: 0,
			},
			assets: [
				{
					id: "artifact_remote",
					title: "Remote artifact",
					remoteUrl: "chatgpt://artifact/artifact_remote",
					metadata: { conversationId: "conv_metadata_only" },
				},
			],
			materializationPolicy: "metadata_only",
		});

		expect(freshness).toMatchObject({
			state: "fresh",
			detailCompleteness: "complete",
			assetCompleteness: "partial",
			assetCounts: {
				known: 1,
				local: 0,
				missingLocal: 1,
			},
			reasons: ["local_materialization_pending", "detail_current"],
		});
	});

	test("honors row-level materialization completeness over remote-only manifest evidence", () => {
		const freshness = deriveAccountMirrorConversationFreshness({
			conversationId: "conv_materialized",
			item: {
				id: "conv_materialized",
				title: "Materialized image thread",
				provider: "gemini",
				metadata: {
					assetCompleteness: "complete",
					materializedAt: "2026-05-24T01:54:30.448Z",
				},
			},
			target: {
				lastCompletedAt: "2026-05-24T01:53:05.197Z",
				mirrorCompleteness: completeMirror,
			},
			detail: {
				exists: true,
				observedAt: "2026-05-24T01:53:59.004Z",
				messageCount: 2,
				fileCount: 0,
				artifactCount: 1,
				sourceCount: 0,
			},
			assets: [
				{
					id: "gemini-artifact:conv_materialized:2:0",
					title: "Generated image 1",
					kind: "image",
					uri: "blob:https://gemini.google.com/example",
					metadata: { conversationId: "conv_materialized" },
				},
			],
		});

		expect(freshness).toMatchObject({
			state: "fresh",
			reasons: ["detail_current"],
			materializedAt: "2026-05-24T01:54:30.448Z",
			assetCompleteness: "complete",
			assetCounts: {
				known: 1,
				local: 1,
				missingLocal: 0,
			},
		});
	});

	test("uses terminal routeability evidence before stale or partial signals", () => {
		const freshness = deriveAccountMirrorConversationFreshness({
			conversationId: "gemini_deleted",
			item: {
				id: "gemini_deleted",
				title: "Deleted Gemini thread",
				provider: "gemini",
				metadata: {
					routeabilityReason:
						"conversation-not-found-or-unavailable: Gemini routeability check landed on bare /app",
				},
			},
			target: {
				lastCompletedAt: "2026-05-23T12:01:00.000Z",
				mirrorCompleteness: {
					...completeMirror,
					state: "in_progress",
					summary: "partial",
					remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
				},
			},
			detail: { exists: false },
		});

		expect(freshness).toMatchObject({
			state: "terminal_unavailable",
			routeabilityState: "not_found_or_unavailable",
			reasons: ["routeability_not_found_or_unavailable"],
		});
	});

	test("projects provider guard state as guarded freshness", () => {
		const freshness = deriveAccountMirrorConversationFreshness({
			conversationId: "conv_guarded",
			item: { id: "conv_guarded", title: "Guarded", provider: "gemini" },
			target: {
				lastCompletedAt: "2026-05-23T12:01:00.000Z",
				providerGuard: {
					state: "manual_clear_required",
					kind: "google-sorry",
					summary: "Google unusual-traffic interstitial detected (google.com/sorry).",
					detectedAt: "2026-05-23T12:02:00.000Z",
					clearedAt: null,
					cooldownUntil: null,
					url: "https://www.google.com/sorry/index",
					action: "account-mirror-refresh",
				},
				mirrorCompleteness: completeMirror,
			},
			detail: { exists: true, observedAt: "2026-05-23T12:01:00.000Z" },
		});

		expect(freshness).toMatchObject({
			state: "guarded",
			routeabilityState: "guarded",
			routeabilityObservedAt: "2026-05-23T12:02:00.000Z",
			reasons: ["provider_guard_active"],
		});
	});

	test("marks rows stale when index evidence is newer than detail evidence", () => {
		const freshness = deriveAccountMirrorConversationFreshness({
			conversationId: "conv_stale",
			item: { id: "conv_stale", title: "Updated elsewhere", provider: "chatgpt" },
			target: {
				lastCompletedAt: "2026-05-23T12:10:00.000Z",
				mirrorCompleteness: completeMirror,
			},
			detail: {
				exists: true,
				observedAt: "2026-05-23T12:00:00.000Z",
				messageCount: 2,
				fileCount: 0,
				artifactCount: 0,
				sourceCount: 0,
			},
			assets: [],
		});

		expect(freshness).toMatchObject({
			state: "stale",
			reasons: ["index_newer_than_detail"],
			detailCompleteness: "complete",
			assetCompleteness: "none",
		});
	});
});
