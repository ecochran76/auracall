import fs, { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
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

			await expect(cacheStore.readAccountMirrorSnapshot(context)).resolves.toMatchObject({
				items: {
					metadataEvidence: {
						providerIndexEpoch: {
							object: "account_mirror_provider_index_epoch",
							version: 1,
							provider: "chatgpt",
							runtimeProfileId: "default",
							browserProfileId: "default",
							observedAt: "2026-04-29T12:00:10.000Z",
							coverage: { conversations: 1, projects: 1 },
							epochId: expect.stringMatching(/^sha256:[a-f0-9]{32}$/),
							identityScopeHash: expect.stringMatching(/^sha256:[a-f0-9]{32}$/),
							indexFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{32}$/),
						},
					},
				},
			});

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
							changeFrontierState: {
								object: "account_mirror_conversation_work_state",
								version: 1,
								action: null,
								outcome: "pending",
								assetAvailability: "unknown",
								conversationKey: expect.stringMatching(/^sha256:[a-f0-9]{32}$/),
								epochId: expect.stringMatching(/^sha256:[a-f0-9]{32}$/),
								indexFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{32}$/),
								physicalActivity: {
									targetsCreated: 0,
									navigations: 0,
									reloads: 0,
									snapshotRefreshes: 0,
									artifactResolutions: 0,
									downloads: 0,
								},
							},
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

	test.each([
		"complete",
		"deferred",
	] as const)("round-trips %s work and retry horizon at the next epoch", async (outcome) => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-mirror-frontier-state-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheStore = createCacheStore("dual");
		const persistence = createAccountMirrorPersistence({ config: {}, cacheStore });
		const context: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "ecochran76@gmail.com",
		};
		try {
			await persistence.writeSnapshot(baseRecord);
			const firstRead = await cacheStore.readConversations(context);
			const first = firstRead.items[0];
			if (!first) throw new Error("Expected persisted conversation.");
			const metadata = first.metadata ?? {};
			const workState = metadata.changeFrontierState;
			if (!workState || typeof workState !== "object" || Array.isArray(workState)) {
				throw new Error("Expected versioned change-frontier state.");
			}
			await cacheStore.writeConversations(context, [
				{
					...first,
					metadata: {
						...metadata,
						changeFrontierState: {
							...workState,
							action: "visit_once",
							outcome,
							assetAvailability: outcome === "complete" ? "available" : "unknown",
							retryNotBefore: outcome === "deferred" ? "2026-04-29T14:00:00.000Z" : null,
							checkpointedAt: "2026-04-29T12:00:11.000Z",
							physicalActivity: {
								targetsCreated: 1,
								navigations: 1,
								reloads: 0,
								snapshotRefreshes: 1,
								artifactResolutions: 1,
								downloads: 1,
							},
						},
					},
				},
			]);

			await persistence.writeSnapshot(baseRecord);
			await expect(cacheStore.readConversations(context)).resolves.toMatchObject({
				items: [
					{
						metadata: {
							changeFrontierState: {
								action: "visit_once",
								outcome,
								assetAvailability: outcome === "complete" ? "available" : "unknown",
								retryNotBefore: outcome === "deferred" ? "2026-04-29T14:00:00.000Z" : null,
								physicalActivity: { navigations: 1, downloads: 1 },
							},
						},
					},
				],
			});

			await persistence.writeSnapshot({
				...baseRecord,
				requestId: "acctmirror_next_epoch",
				startedAt: "2026-04-29T13:00:00.000Z",
				completedAt: "2026-04-29T13:00:10.000Z",
			});
			await expect(cacheStore.readConversations(context)).resolves.toMatchObject({
				items: [
					{
						metadata: {
							changeFrontierState: {
								action: null,
								outcome: "pending",
								assetAvailability: outcome === "complete" ? "available" : "unknown",
								retryNotBefore: outcome === "deferred" ? "2026-04-29T14:00:00.000Z" : null,
								physicalActivity: { navigations: 0, downloads: 0 },
								lifetimePhysicalActivity: { navigations: 1, downloads: 1 },
							},
						},
					},
				],
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("checkpoints a matching visit bundle into durable physical work state", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-mirror-visit-bundle-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheStore = createCacheStore("dual");
		const persistence = createAccountMirrorPersistence({ config: {}, cacheStore });
		const context: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "ecochran76@gmail.com",
		};
		try {
			await persistence.writeSnapshot(baseRecord);
			const snapshot = await cacheStore.readAccountMirrorSnapshot(context);
			const epochId = snapshot.items?.metadataEvidence?.providerIndexEpoch?.epochId;
			if (!epochId) throw new Error("Expected persisted provider index epoch.");

			await persistence.writeSnapshot({
				...baseRecord,
				visitBundles: [
					{
						object: "account_mirror_conversation_visit_bundle",
						version: 1,
						conversationId: "conv_1",
						freshnessEpoch: epochId,
						detail: {
							observed: true,
							complete: true,
							messageCount: 3,
							fingerprint: "sha256:detail-visit",
						},
						artifacts: [],
						files: [],
						route: { state: "routeable" },
						physicalVisit: {
							object: "account_mirror_physical_visit_receipt",
							version: 1,
							targetsCreated: 1,
							navigations: 1,
							reloads: 0,
						},
					},
				],
			});

			await expect(cacheStore.readConversations(context)).resolves.toMatchObject({
				items: [
					{
						metadata: {
							changeFrontierState: {
								action: "visit_once",
								outcome: "complete",
								detailFingerprint: "sha256:detail-visit",
								physicalActivity: {
									targetsCreated: 1,
									navigations: 1,
									reloads: 0,
									snapshotRefreshes: 1,
								},
							},
						},
					},
				],
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("checkpoints non-visit planner decisions for resume without route work", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-mirror-frontier-plan-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheStore = createCacheStore("dual");
		const persistence = createAccountMirrorPersistence({ config: {}, cacheStore });
		const context: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "ecochran76@gmail.com",
		};
		try {
			await persistence.writeSnapshot(baseRecord);
			const first = await cacheStore.readConversations(context);
			const state = first.items[0]?.metadata?.changeFrontierState as
				| { epochId?: string; conversationKey?: string }
				| undefined;
			if (!state?.epochId || !state.conversationKey) throw new Error("Expected frontier state.");

			await persistence.writeSnapshot({
				...baseRecord,
				metadataEvidence: {
					...baseRecord.metadataEvidence,
					changeFrontierPlan: {
						object: "account_mirror_change_frontier_plan",
						version: 1,
						epochId: state.epochId,
						resumeAfterConversationKey: null,
						checkpointFound: true,
						decisions: [
							{
								conversationKey: state.conversationKey,
								action: "skip",
								reason: "unchanged_complete",
								checkpointKey: state.conversationKey,
							},
						],
						counts: { skip: 1, visit_once: 0, materialize_retained: 0, defer: 0 },
					},
				},
			});

			await expect(cacheStore.readConversations(context)).resolves.toMatchObject({
				items: [
					{
						metadata: {
							changeFrontierState: {
								action: "skip",
								outcome: "complete",
								checkpointedAt: baseRecord.completedAt,
								physicalActivity: { navigations: 0, snapshotRefreshes: 0 },
							},
						},
					},
				],
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("persists concurrent status writes in the same millisecond without rename failures", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-mirror-concurrent-status-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const config = { browser: { cache: { store: "json" } } };
		const writers = [0, 1].map(() => createAccountMirrorPersistence({ config }));
		const key = {
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			browserProfileId: "default",
			boundIdentityKey: "status-writer@example.test",
		};
		const fixedClock = vi.spyOn(Date, "now").mockReturnValue(1791162173994);
		const rename = fs.rename.bind(fs);
		let arrivals = 0;
		let release!: () => void;
		const bothWritesReady = new Promise<void>((resolve) => {
			release = resolve;
		});
		const renameBoundary = vi
			.spyOn(fs, "rename")
			.mockImplementation(async (source, destination) => {
				if (++arrivals === 2) release();
				await bothWritesReady;
				await rename(source, destination);
			});
		try {
			const outcomes = await Promise.allSettled(
				writers.map((writer, index) =>
					writer.writeState?.({
						...key,
						updatedAt: "2026-10-05T01:02:00.000Z",
						state: {
							consecutiveFailureCount: index + 1,
							lastRefreshRequestId: `refresh-${index + 1}`,
						},
					}),
				),
			);
			expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
			const state = await writers[0]?.readState(key);
			expect([1, 2]).toContain(state?.consecutiveFailureCount);
			expect(state?.lastRefreshRequestId).toBe(`refresh-${state?.consecutiveFailureCount}`);
			expect(
				await fs.readdir(path.join(homeDir, "cache", "account-mirror", "status")),
			).toHaveLength(1);
		} finally {
			renameBoundary.mockRestore();
			fixedClock.mockRestore();
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

	test("updates cached conversation freshness while preserving existing asset history", async () => {
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
					frontierState: {
						action: "materialize_retained",
						outcome: "complete",
						assetAvailability: "available",
						retryNotBefore: null,
						checkpointedAt: "2026-05-23T16:00:01.000Z",
						artifactResolutions: 2,
						downloads: 1,
						duplicates: 1,
					},
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
			const existingTerminal = await updateConversationEvidence?.({
				provider: "chatgpt",
				boundIdentityKey: "ecochran76@gmail.com",
				conversationId: "conv_1",
				evidence: {
					routeabilityState: "not_found_or_unavailable",
					routeabilityReason:
						"conversation-not-found-or-unavailable: exact fallback response returned status 404",
					routeabilityObservedAt: "2026-05-23T16:04:00.000Z",
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
			expect(existingTerminal).toBe(true);
			expect(insertedTerminal).toBe(true);
			await expect(cacheStore.readConversations(context)).resolves.toMatchObject({
				items: [
					{
						id: "conv_1",
						metadata: {
							indexObservedAt: "2026-04-29T12:00:10.000Z",
							detailObservedAt: "2026-05-23T16:00:00.000Z",
							manifestObservedAt: "2026-05-23T16:00:01.000Z",
							routeabilityObservedAt: "2026-05-23T16:04:00.000Z",
							routeabilityState: "not_found_or_unavailable",
							routeabilityReason:
								"conversation-not-found-or-unavailable: exact fallback response returned status 404",
							messageCount: 4,
							artifactCount: 1,
							changeFrontierState: {
								action: "materialize_retained",
								outcome: "complete",
								assetAvailability: "available",
								checkpointedAt: "2026-05-23T16:00:01.000Z",
								physicalActivity: {
									artifactResolutions: 2,
									downloads: 1,
								},
							},
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
			await expect(cacheStore.readAccountMirrorArtifacts(context)).resolves.toMatchObject({
				items: [{ id: "artifact_1", title: "Generated report" }],
			});
			await expect(cacheStore.readAccountMirrorFiles(context)).resolves.toMatchObject({
				items: [{ id: "file_1", name: "Project source.pdf" }],
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});
});
