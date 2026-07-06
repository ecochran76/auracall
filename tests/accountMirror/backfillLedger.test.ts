import { describe, expect, test } from "vitest";
import { deriveAccountMirrorBackfillLedger } from "../../src/accountMirror/backfillLedger.js";

describe("account mirror backfill ledger", () => {
	test("derives the next eligible phase from persisted refresh cursor evidence", () => {
		const ledger = deriveAccountMirrorBackfillLedger({
			provider: "chatgpt",
			runtimeProfileId: "default",
			browserProfileId: "default",
			boundIdentityKey: "operator@example.com",
			updatedAt: "2026-07-05T19:50:00.000Z",
			evidence: {
				identitySource: "profile-menu",
				projectSampleIds: ["project_1", "project_2"],
				conversationSampleIds: ["conv_1", "conv_2"],
				projectConversations: {
					nextProjectIndex: 4,
					readLimit: 4,
					scannedProjects: 4,
					yielded: false,
				},
				attachmentInventory: {
					nextProjectIndex: 2,
					nextConversationIndex: 1,
					detailReadLimit: 6,
					scannedProjects: 2,
					scannedConversations: 1,
					conversationDetail: {
						conversationId: "conv_large",
						nextMessageIndex: 24,
						messageLimit: 24,
						totalMessages: 80,
					},
				},
				truncated: {
					projects: false,
					conversations: false,
					artifacts: true,
				},
			},
			mirrorCompleteness: {
				state: "in_progress",
				summary: "4 detail surfaces remain incomplete.",
				remainingDetailSurfaces: {
					projects: 0,
					conversations: 4,
					total: 4,
				},
				signals: {
					projectsTruncated: false,
					conversationsTruncated: false,
					attachmentInventoryTruncated: true,
					attachmentCursorPresent: true,
				},
			},
		});

		expect(ledger).toMatchObject({
			object: "account_mirror_backfill_ledger",
			state: "in_progress",
			lastCompletedPhase: "project-conversations",
			nextEligiblePhase: "detail-inventory",
			cursors: {
				projects: {
					status: "complete",
					scanned: 2,
				},
				rootRail: {
					status: "complete",
					scanned: 2,
				},
				projectConversations: {
					status: "complete",
					nextIndex: 4,
					readLimit: 4,
				},
				newestFirstDetail: {
					status: "pending",
					nextIndex: 1,
					readLimit: 6,
					conversationDetail: {
						conversationId: "conv_large",
						nextMessageIndex: 24,
					},
				},
			},
		});
	});

	test("carries forward account-library and materialization cursors not emitted by refresh", () => {
		const previous = deriveAccountMirrorBackfillLedger({
			provider: "chatgpt",
			runtimeProfileId: "default",
			browserProfileId: "default",
			boundIdentityKey: "operator@example.com",
			updatedAt: "2026-07-05T19:00:00.000Z",
			evidence: null,
			mirrorCompleteness: null,
		});
		previous.cursors.accountLibrary = {
			status: "pending",
			reason: "account-library job is queued",
			updatedAt: "2026-07-05T19:01:00.000Z",
			nextIndex: null,
			readLimit: 25,
			scanned: null,
			yielded: false,
		};
		previous.cursors.materialization = {
			status: "pending",
			reason: "materialization job is queued",
			updatedAt: "2026-07-05T19:02:00.000Z",
			nextIndex: null,
			readLimit: 10,
			scanned: null,
			yielded: false,
		};

		const ledger = deriveAccountMirrorBackfillLedger({
			provider: "chatgpt",
			runtimeProfileId: "default",
			browserProfileId: "default",
			boundIdentityKey: "operator@example.com",
			updatedAt: "2026-07-05T19:50:00.000Z",
			previous,
			evidence: {
				identitySource: "profile-menu",
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: false,
				},
			},
			mirrorCompleteness: {
				state: "complete",
				summary: "Complete.",
				remainingDetailSurfaces: {
					projects: 0,
					conversations: 0,
					total: 0,
				},
				signals: {
					projectsTruncated: false,
					conversationsTruncated: false,
					attachmentInventoryTruncated: false,
					attachmentCursorPresent: false,
				},
			},
		});

		expect(ledger).toMatchObject({
			state: "in_progress",
			nextEligiblePhase: "account-library",
			cursors: {
				accountLibrary: {
					status: "pending",
					reason: "account-library job is queued",
				},
				materialization: {
					status: "pending",
					reason: "materialization job is queued",
				},
			},
		});
	});
});
