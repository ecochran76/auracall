import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createAccountMirrorPersistence } from "../../src/accountMirror/cachePersistence.js";
import { createAccountMirrorStatusRegistry } from "../../src/accountMirror/statusRegistry.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { createCacheStore } from "../../src/browser/llmService/cache/store.js";
import type { ProviderCacheContext } from "../../src/browser/providers/cache.js";

const baseRecord = {
	provider: "chatgpt" as const,
	runtimeProfileId: "default",
	browserProfileId: "default",
	boundIdentityKey: "Ecochran76@Gmail.com",
	detectedIdentityKey: "ecochran76@gmail.com",
	detectedAccountLevel: "Business",
	requestId: "acctmirror_test",
	startedAt: "2026-04-29T12:00:00.000Z",
	completedAt: "2026-04-29T12:00:10.000Z",
	dispatcherKey: "managed-profile:/tmp/default/chatgpt::service:chatgpt",
	dispatcherOperationId: "op_123",
	metadataCounts: {
		projects: 2,
		conversations: 5,
		artifacts: 1,
		files: 1,
		media: 0,
	},
	metadataEvidence: {
		identitySource: "profile-menu",
		projectSampleIds: ["project_1"],
		conversationSampleIds: ["conv_1"],
		truncated: {
			projects: false,
			conversations: false,
			artifacts: false,
		},
	},
	manifests: {
		projects: [
			{
				id: "project_1",
				name: "Default Project",
				provider: "chatgpt" as const,
			},
		],
		conversations: [
			{
				id: "conv_1",
				title: "Mirror conversation",
				provider: "chatgpt" as const,
				projectId: "project_1",
			},
		],
		artifacts: [
			{
				id: "artifact_1",
				title: "Generated report",
				kind: "document" as const,
			},
		],
		files: [
			{
				id: "file_1",
				name: "Project source.pdf",
				provider: "chatgpt" as const,
				source: "project" as const,
				metadata: {
					projectId: "project_1",
				},
			},
		],
		media: [
			{
				id: "media_1",
				title: "Generated image",
				mediaType: "image" as const,
				provider: "chatgpt",
			},
		],
	},
};

describe("account mirror cache persistence", () => {
	afterEach(() => {
		setAuracallHomeDirOverrideForTest(null);
	});

	test("stores canonical mirror data by provider and bound identity in the existing cache store", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-mirror-cache-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheStore = createCacheStore("dual");
		const persistence = createAccountMirrorPersistence({
			config: {
				browser: {
					cache: {
						store: "dual",
					},
				},
			},
			cacheStore,
		});
		const context: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "ecochran76@gmail.com",
		};
		try {
			await cacheStore.writeConversations(
				{
					...context,
					listOptions: {
						projectId: "project_1",
					},
				},
				[
					{
						id: "conv_1",
						title: "Mirror conversation",
						provider: "chatgpt",
						projectId: "project_1",
						metadata: {
							indexObservedAt: "2026-04-28T12:00:10.000Z",
							indexSource: "project-conversations",
							indexRank: 9,
							conversationFingerprint: "sha256:stale",
						},
					},
				],
			);
			await persistence.writeSnapshot(baseRecord);

			const sameProfileState = await persistence.readState({
				provider: "chatgpt",
				runtimeProfileId: "default",
				browserProfileId: "default",
				boundIdentityKey: "ecochran76@gmail.com",
			});
			expect(sameProfileState).toMatchObject({
				detectedIdentityKey: "ecochran76@gmail.com",
				lastSuccessAtMs: Date.parse("2026-04-29T12:00:10.000Z"),
				lastRefreshRequestId: "acctmirror_test",
				lastDispatcherOperationId: "op_123",
				metadataCounts: {
					projects: 2,
					conversations: 5,
					artifacts: 1,
					files: 1,
					media: 0,
				},
			});

			const alternateProfileState = await persistence.readState({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-2",
				browserProfileId: "wsl-chrome-2",
				boundIdentityKey: "ecochran76@gmail.com",
			});
			expect(alternateProfileState).toMatchObject({
				detectedIdentityKey: "ecochran76@gmail.com",
				lastSuccessAtMs: Date.parse("2026-04-29T12:00:10.000Z"),
				metadataCounts: {
					projects: 2,
					conversations: 5,
					artifacts: 1,
					files: 1,
					media: 0,
				},
			});
			expect(alternateProfileState?.lastRefreshRequestId).toBeUndefined();

			await expect(cacheStore.readProjects(context)).resolves.toMatchObject({
				items: [{ id: "project_1", name: "Default Project", provider: "chatgpt" }],
			});
			await expect(cacheStore.readConversations(context)).resolves.toMatchObject({
				items: [
					{
						id: "conv_1",
						title: "Mirror conversation",
						provider: "chatgpt",
						metadata: {
							indexObservedAt: "2026-04-29T12:00:10.000Z",
							indexSource: "project-conversations",
							indexRank: 0,
							conversationFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{32}$/),
						},
					},
				],
			});
			await expect(cacheStore.readAccountMirrorArtifacts(context)).resolves.toMatchObject({
				items: [{ id: "artifact_1", title: "Generated report", kind: "document" }],
			});
			await expect(cacheStore.readAccountMirrorFiles(context)).resolves.toMatchObject({
				items: [{ id: "file_1", name: "Project source.pdf", source: "project" }],
			});
			await expect(cacheStore.readAccountMirrorMedia(context)).resolves.toMatchObject({
				items: [{ id: "media_1", title: "Generated image", mediaType: "image" }],
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("persists account-mirror target failure state across registry refreshes", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-mirror-status-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheStore = createCacheStore("dual");
		const persistence = createAccountMirrorPersistence({
			config: {
				browser: {
					cache: {
						store: "dual",
					},
				},
			},
			cacheStore,
		});
		try {
			await persistence.writeSnapshot(baseRecord);
			await persistence.writeState?.({
				provider: "chatgpt",
				runtimeProfileId: "default",
				browserProfileId: "default",
				boundIdentityKey: "ecochran76@gmail.com",
				updatedAt: "2026-04-29T12:05:00.000Z",
				state: {
					detectedIdentityKey: "ecochran76@gmail.com",
					lastAttemptAtMs: Date.parse("2026-04-29T12:04:00.000Z"),
					lastFailureAtMs: Date.parse("2026-04-29T12:05:00.000Z"),
					lastCompletedAtMs: Date.parse("2026-04-29T12:05:00.000Z"),
					consecutiveFailureCount: 2,
					lastRefreshRequestId: "acctmirror_failed",
					lastDispatcherKey: "managed-profile:/tmp/default/chatgpt::service:chatgpt",
					backfillLedger: {
						object: "account_mirror_backfill_ledger",
						version: 1,
						provider: "chatgpt",
						runtimeProfileId: "default",
						browserProfileId: "default",
						boundIdentityKey: "ecochran76@gmail.com",
						updatedAt: "2026-04-29T12:05:00.000Z",
						state: "in_progress",
						lastCompletedPhase: "project-conversations",
						nextEligiblePhase: "detail-inventory",
						cursors: {
							projects: {
								status: "complete",
								reason: "Project index complete.",
								updatedAt: "2026-04-29T12:05:00.000Z",
								nextIndex: null,
								readLimit: null,
								scanned: 2,
								yielded: false,
							},
							rootRail: {
								status: "complete",
								reason: "Root rail complete.",
								updatedAt: "2026-04-29T12:05:00.000Z",
								nextIndex: null,
								readLimit: null,
								scanned: 5,
								yielded: false,
							},
							projectConversations: {
								status: "complete",
								reason: "Project conversation cursor complete.",
								updatedAt: "2026-04-29T12:05:00.000Z",
								nextIndex: 2,
								readLimit: 4,
								scanned: 2,
								yielded: false,
							},
							newestFirstDetail: {
								status: "pending",
								reason: "Detail cursor pending.",
								updatedAt: "2026-04-29T12:05:00.000Z",
								nextIndex: 1,
								readLimit: 6,
								scanned: 1,
								yielded: false,
								conversationDetail: null,
							},
							accountLibrary: {
								status: "skipped",
								reason: "No account-library cursor recorded yet.",
								updatedAt: null,
								nextIndex: null,
								readLimit: null,
								scanned: null,
								yielded: false,
							},
							materialization: {
								status: "skipped",
								reason: "No materialization cursor recorded yet.",
								updatedAt: null,
								nextIndex: null,
								readLimit: null,
								scanned: null,
								yielded: false,
							},
						},
					},
				},
			});

			await expect(
				persistence.readState({
					provider: "chatgpt",
					runtimeProfileId: "default",
					browserProfileId: "default",
					boundIdentityKey: "ecochran76@gmail.com",
				}),
			).resolves.toMatchObject({
				detectedIdentityKey: "ecochran76@gmail.com",
				lastSuccessAtMs: Date.parse("2026-04-29T12:00:10.000Z"),
				lastFailureAtMs: Date.parse("2026-04-29T12:05:00.000Z"),
				lastCompletedAtMs: Date.parse("2026-04-29T12:05:00.000Z"),
				consecutiveFailureCount: 2,
				lastRefreshRequestId: "acctmirror_failed",
				metadataCounts: {
					projects: 2,
					conversations: 5,
				},
				backfillLedger: {
					state: "in_progress",
					nextEligiblePhase: "detail-inventory",
					cursors: {
						newestFirstDetail: {
							status: "pending",
							readLimit: 6,
						},
					},
				},
			});

			await persistence.writeSnapshot({
				...baseRecord,
				requestId: "acctmirror_success_2",
				startedAt: "2026-04-29T12:10:00.000Z",
				completedAt: "2026-04-29T12:10:10.000Z",
			});

			const recovered = await persistence.readState({
				provider: "chatgpt",
				runtimeProfileId: "default",
				browserProfileId: "default",
				boundIdentityKey: "ecochran76@gmail.com",
			});
			expect(recovered).toMatchObject({
				lastSuccessAtMs: Date.parse("2026-04-29T12:10:10.000Z"),
				lastCompletedAtMs: Date.parse("2026-04-29T12:10:10.000Z"),
				lastRefreshRequestId: "acctmirror_success_2",
			});
			expect(recovered?.consecutiveFailureCount).toBeUndefined();
			expect(recovered?.lastFailureAtMs).toBeUndefined();
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("hydrates persisted failure state into provider politeness backoff", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-mirror-backoff-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const config = {
			runtimeProfiles: {
				"auracall-gemini-pro": {
					browserProfile: "default",
					defaultService: "gemini",
					services: {
						gemini: {
							identity: {
								email: "ecochran76@gmail.com",
							},
						},
					},
				},
			},
		};
		const persistence = createAccountMirrorPersistence({
			config,
			cacheStore: createCacheStore("dual"),
		});
		try {
			await persistence.writeState?.({
				provider: "gemini",
				runtimeProfileId: "auracall-gemini-pro",
				browserProfileId: "default",
				boundIdentityKey: "ecochran76@gmail.com",
				updatedAt: "2026-05-23T22:25:49.738Z",
				state: {
					detectedIdentityKey: "ecochran76@gmail.com",
					lastAttemptAtMs: Date.parse("2026-05-23T22:23:50.107Z"),
					lastFailureAtMs: Date.parse("2026-05-23T22:25:49.738Z"),
					lastCompletedAtMs: Date.parse("2026-05-23T22:25:49.738Z"),
					consecutiveFailureCount: 1,
					lastRefreshRequestId: "acctmirror_timeout",
				},
			});
			const registry = createAccountMirrorStatusRegistry({
				config,
				readPersistentState: persistence.readState,
				now: () => new Date("2026-05-23T22:27:45.000Z"),
			});

			await registry.refreshPersistentState?.();

			expect(
				registry.readStatus({
					provider: "gemini",
					runtimeProfileId: "auracall-gemini-pro",
					explicitRefresh: true,
				}).entries[0],
			).toMatchObject({
				status: "delayed",
				reason: "failure-backoff",
				eligibleAt: "2026-05-23T22:27:49.738Z",
				lastFailureAt: "2026-05-23T22:25:49.738Z",
				consecutiveFailureCount: 1,
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("updates cached conversation rows with reconciliation freshness evidence", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-mirror-cache-evidence-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheStore = createCacheStore("dual");
		const persistence = createAccountMirrorPersistence({
			config: {
				browser: {
					cache: {
						store: "dual",
					},
				},
			},
			cacheStore,
		});
		const updateConversationEvidence = persistence.updateConversationEvidence;
		expect(updateConversationEvidence).toBeDefined();
		const context: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "ecochran76@gmail.com",
		};
		try {
			await persistence.writeSnapshot(baseRecord);

			const updated = await updateConversationEvidence?.({
				provider: "chatgpt",
				boundIdentityKey: "ecochran76@gmail.com",
				conversationId: "conv_1",
				evidence: {
					detailObservedAt: "2026-05-23T16:00:00.000Z",
					manifestObservedAt: "2026-05-23T16:00:01.000Z",
					routeabilityObservedAt: "2026-05-23T16:00:00.000Z",
					routeabilityState: "routeable",
					messageCount: 4,
					artifactCount: 1,
				},
			});
			const missingWithoutUpsert = await updateConversationEvidence?.({
				provider: "chatgpt",
				boundIdentityKey: "ecochran76@gmail.com",
				conversationId: "missing_conv",
				evidence: {
					routeabilityState: "not_found_or_unavailable",
					routeabilityObservedAt: "2026-05-23T16:05:00.000Z",
				},
			});
			const insertedTerminal = await updateConversationEvidence?.({
				provider: "chatgpt",
				boundIdentityKey: "ecochran76@gmail.com",
				conversationId: "missing_conv",
				evidence: {
					routeabilityState: "not_found_or_unavailable",
					routeabilityReason: "conversation-not-found-or-unavailable: direct provider route failed",
					routeabilityObservedAt: "2026-05-23T16:05:00.000Z",
				},
				upsert: {
					title: "missing_conv",
					url: "https://chatgpt.com/c/missing_conv",
				},
			});

			expect(updated).toBe(true);
			expect(missingWithoutUpsert).toBe(false);
			expect(insertedTerminal).toBe(true);
			await expect(cacheStore.readConversations(context)).resolves.toMatchObject({
				items: [
					{
						id: "conv_1",
						metadata: {
							indexObservedAt: "2026-04-29T12:00:10.000Z",
							detailObservedAt: "2026-05-23T16:00:00.000Z",
							manifestObservedAt: "2026-05-23T16:00:01.000Z",
							routeabilityObservedAt: "2026-05-23T16:00:00.000Z",
							routeabilityState: "routeable",
							messageCount: 4,
							artifactCount: 1,
						},
					},
					{
						id: "missing_conv",
						title: "missing_conv",
						provider: "chatgpt",
						url: "https://chatgpt.com/c/missing_conv",
						metadata: {
							routeabilityObservedAt: "2026-05-23T16:05:00.000Z",
							routeabilityState: "not_found_or_unavailable",
							routeabilityReason:
								"conversation-not-found-or-unavailable: direct provider route failed",
						},
					},
				],
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});
});
