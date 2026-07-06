import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createBrowserOperationDispatcher } from "../../packages/browser-service/src/service/operationDispatcher.js";
import type { AccountMirrorPersistence } from "../../src/accountMirror/cachePersistence.js";
import {
	AccountMirrorIdentityMismatchError,
	type AccountMirrorMetadataCollectorInput,
	type AccountMirrorMetadataCollectorResult,
} from "../../src/accountMirror/chatgptMetadataCollector.js";
import {
	type AccountMirrorRefreshError,
	classifyChatgptRateLimitCensusProbeForTest,
	createAccountMirrorRefreshService,
} from "../../src/accountMirror/refreshService.js";
import { createAccountMirrorStatusRegistry } from "../../src/accountMirror/statusRegistry.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { writeChatgptRateLimitGuardState } from "../../src/browser/chatgptRateLimitGuard.js";
import { listDomDriftObservations } from "../../src/browser/domDriftObservations.js";
import {
	clearBrowserOperationQueueObservationsForTest,
	recordBrowserOperationQueueObservation,
} from "../../src/browser/operationQueueObservations.js";

const config = {
	model: "gpt-5.2",
	browser: {},
	runtimeProfiles: {
		default: {
			browserProfile: "default",
			defaultService: "chatgpt",
			services: {
				chatgpt: {
					identity: {
						email: "ecochran76@gmail.com",
						accountLevel: "Business",
					},
					projects: [{ id: "project_1" }],
					conversations: [{ id: "conv_1" }, { id: "conv_2" }],
					artifacts: [{ id: "artifact_1" }],
				},
			},
		},
		"wsl-chrome-2": {
			browserProfile: "wsl-chrome-2",
			defaultService: "chatgpt",
			services: {
				chatgpt: {
					identity: {
						email: "consult@polymerconsultinggroup.com",
						accountLevel: "Pro",
					},
				},
			},
		},
	},
};

function createNoopPersistence(): AccountMirrorPersistence {
	return {
		writeSnapshot: vi.fn(async () => {}),
		writeState: vi.fn(async () => {}),
		readCatalog: vi.fn(async () => null),
		readState: vi.fn(async () => null),
		readConversationContext: vi.fn(async () => null),
	};
}

describe("account mirror refresh service", () => {
	beforeEach(async () => {
		clearBrowserOperationQueueObservationsForTest();
		await useTempAuracallHome();
	});

	afterEach(() => {
		setAuracallHomeDirOverrideForTest(null);
	});

	async function useTempAuracallHome() {
		const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-refresh-test-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		return homeDir;
	}

	test("runs an explicit default ChatGPT refresh through the browser operation dispatcher", async () => {
		const metadataCollector = {
			collect: vi.fn(async () => ({
				detectedIdentityKey: "ecochran76@gmail.com",
				detectedAccountLevel: "Business",
				metadataCounts: {
					projects: 1,
					conversations: 2,
					artifacts: 1,
					files: 0,
					media: 0,
				},
				manifests: {
					projects: [{ id: "project_1", name: "Project 1", provider: "chatgpt" as const }],
					conversations: [
						{ id: "conv_1", title: "One", provider: "chatgpt" as const },
						{ id: "conv_2", title: "Two", provider: "chatgpt" as const },
					],
					artifacts: [{ id: "artifact_1", title: "Artifact 1" }],
					files: [],
					media: [],
				},
				evidence: {
					identitySource: "profile-menu",
					projectSampleIds: ["project_1"],
					conversationSampleIds: ["conv_1", "conv_2"],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
			})),
		};
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});
		const persistence = createNoopPersistence();
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			metadataCollector,
			persistence,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
			generateRequestId: () => "acctmirror_test",
		});

		const result = await service.requestRefresh({
			provider: "chatgpt",
			runtimeProfileId: "default",
			explicitRefresh: true,
		});

		expect(result).toMatchObject({
			object: "account_mirror_refresh",
			requestId: "acctmirror_test",
			status: "completed",
			provider: "chatgpt",
			runtimeProfileId: "default",
			browserProfileId: "default",
			metadataCounts: {
				projects: 1,
				conversations: 2,
				artifacts: 1,
				files: 0,
				media: 0,
			},
			metadataEvidence: {
				identitySource: "profile-menu",
				projectSampleIds: ["project_1"],
				conversationSampleIds: ["conv_1", "conv_2"],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: false,
				},
			},
			mirrorCompleteness: {
				state: "complete",
				remainingDetailSurfaces: {
					projects: 0,
					conversations: 0,
					total: 0,
				},
			},
			detectedIdentityKey: "ecochran76@gmail.com",
			detectedAccountLevel: "Business",
			dispatcher: {
				key: expect.stringContaining("service:chatgpt"),
				operationId: expect.any(String),
				blockedBy: null,
			},
		});
		expect(persistence.writeState).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				state: expect.objectContaining({
					backfillLedger: expect.objectContaining({
						object: "account_mirror_backfill_ledger",
						state: "complete",
						lastCompletedPhase: "detail-inventory",
						nextEligiblePhase: "complete",
						cursors: expect.objectContaining({
							projects: expect.objectContaining({ status: "complete" }),
							rootRail: expect.objectContaining({ status: "complete" }),
							newestFirstDetail: expect.objectContaining({ status: "complete" }),
						}),
					}),
				}),
			}),
		);
		expect(metadataCollector.collect).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfileId: "default",
			expectedIdentityKey: "ecochran76@gmail.com",
			sweepMode: "steady_follow",
			materializationPolicy: null,
			requestedPhase: null,
			shouldYield: expect.any(Function),
			onIdentityVerified: expect.any(Function),
			onProgress: expect.any(Function),
			limits: {
				maxPageReadsPerCycle: 4,
				maxConversationRowsPerCycle: 30,
				maxArtifactRowsPerCycle: 24,
				freshFrontierThreshold: 3,
				maxBrowserInteractionsPerMinute: 30,
				conversationReadCooldownMs: 0,
				pageRefreshCooldownMs: 0,
				renavigationCooldownMs: 0,
			},
			previousEvidence: null,
			previousFiles: [],
			previousConversationFreshness: new Map(),
			abortSignal: expect.any(AbortSignal),
		});
		const collectCalls = metadataCollector.collect.mock.calls as unknown as [
			AccountMirrorMetadataCollectorInput,
		][];
		const collectInput = collectCalls[0]?.[0];
		expect(await Promise.resolve(collectInput?.shouldYield?.())).toBe(false);
		const dispatcherKey = result.dispatcher.key ?? "missing-dispatcher-key";
		const dispatcherOperationId = result.dispatcher.operationId ?? "missing-operation-id";
		recordBrowserOperationQueueObservation({
			event: "queued",
			key: dispatcherKey,
			requested: {
				managedProfileDir: "/tmp/auracall-default-chatgpt",
				serviceTarget: "chatgpt",
				kind: "browser-execution",
				operationClass: "exclusive-probe",
				ownerCommand: "account-mirror-refresh:chatgpt:default",
			},
			blockedBy: {
				id: dispatcherOperationId,
				key: dispatcherKey,
				managedProfileDir: "/tmp/auracall-default-chatgpt",
				serviceTarget: "chatgpt",
				kind: "browser-execution",
				operationClass: "exclusive-mutating",
				ownerPid: process.pid,
				ownerCommand: "account-mirror-refresh:chatgpt:default",
				startedAt: "2026-04-29T12:00:00.000Z",
				updatedAt: "2026-04-29T12:00:00.001Z",
			},
			at: "2026-04-29T12:00:00.001Z",
		});
		expect(await Promise.resolve(collectInput?.shouldYield?.())).toBe(false);
		recordBrowserOperationQueueObservation({
			event: "queued",
			key: dispatcherKey,
			requested: {
				managedProfileDir: "/tmp/auracall-default-chatgpt",
				serviceTarget: "chatgpt",
				kind: "browser-execution",
				operationClass: "exclusive-mutating",
				ownerCommand: "browser-execution",
			},
			blockedBy: {
				id: dispatcherOperationId,
				key: dispatcherKey,
				managedProfileDir: "/tmp/auracall-default-chatgpt",
				serviceTarget: "chatgpt",
				kind: "browser-execution",
				operationClass: "exclusive-mutating",
				ownerPid: process.pid,
				ownerCommand: "account-mirror-refresh:chatgpt:default",
				startedAt: "2026-04-29T12:00:00.000Z",
				updatedAt: "2026-04-29T12:00:00.002Z",
			},
			at: "2026-04-29T12:00:00.002Z",
		});
		expect(await Promise.resolve(collectInput?.shouldYield?.())).toBe(true);
		expect(persistence.writeSnapshot).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfileId: "default",
			browserProfileId: "default",
			boundIdentityKey: "ecochran76@gmail.com",
			detectedIdentityKey: "ecochran76@gmail.com",
			detectedAccountLevel: "Business",
			requestId: "acctmirror_test",
			startedAt: "2026-04-29T12:00:00.000Z",
			completedAt: "2026-04-29T12:00:00.000Z",
			dispatcherKey: expect.stringContaining("service:chatgpt"),
			dispatcherOperationId: expect.any(String),
			metadataCounts: {
				projects: 1,
				conversations: 2,
				artifacts: 1,
				files: 0,
				media: 0,
			},
			metadataEvidence: expect.objectContaining({
				identitySource: "profile-menu",
			}),
			manifests: {
				projects: [{ id: "project_1", name: "Project 1", provider: "chatgpt" }],
				conversations: [
					{ id: "conv_1", title: "One", provider: "chatgpt" },
					{ id: "conv_2", title: "Two", provider: "chatgpt" },
				],
				artifacts: [{ id: "artifact_1", title: "Artifact 1" }],
				files: [],
				media: [],
			},
		});
		expect(result.mirrorStatus.entries[0]).toMatchObject({
			detectedIdentityKey: "ecochran76@gmail.com",
			lastSuccessAt: "2026-04-29T12:00:00.000Z",
			metadataEvidence: expect.objectContaining({
				identitySource: "profile-menu",
				projectSampleIds: ["project_1"],
			}),
			mirrorState: {
				queued: false,
				running: false,
				lastRefreshRequestId: "acctmirror_test",
				lastDispatcherKey: expect.stringContaining("service:chatgpt"),
				lastDispatcherOperationId: expect.any(String),
				lastDispatcherBlockedBy: null,
			},
		});
	});

	test("threads requested collector phase into metadata collection", async () => {
		const metadataCollector = {
			collect: vi.fn(async (input: AccountMirrorMetadataCollectorInput) => ({
				detectedIdentityKey: "ecochran76@gmail.com",
				detectedAccountLevel: "Business",
				metadataCounts: {
					projects: 0,
					conversations: 1,
					artifacts: 0,
					files: 0,
					media: 0,
				},
				manifests: {
					projects: [],
					conversations: [{ id: "conv_1", title: "One", provider: "chatgpt" as const }],
					artifacts: [],
					files: [],
					media: [],
				},
				evidence: {
					identitySource: "profile-menu",
					projectSampleIds: [],
					conversationSampleIds: ["conv_1"],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
					collectorProgress: {
						provider: "chatgpt" as const,
						runtimeProfileId: "default",
						sweepMode: input.sweepMode ?? "steady_follow",
						phase: "detail-inventory" as const,
						event: "completed" as const,
						observedAt: "2026-04-29T12:00:01.000Z",
						conversationsObserved: 1,
					},
				},
			})),
		};
		const service = createAccountMirrorRefreshService({
			config,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			metadataCollector,
			persistence: createNoopPersistence(),
			now: () => new Date("2026-04-29T12:00:00.000Z"),
			generateRequestId: () => "acctmirror_requested_phase",
		});

		await service.requestRefresh({
			provider: "chatgpt",
			runtimeProfileId: "default",
			explicitRefresh: true,
			ignoreMinimumInterval: true,
			requestedPhase: "detail-inventory",
		});

		expect(metadataCollector.collect).toHaveBeenCalledWith(
			expect.objectContaining({
				requestedPhase: "detail-inventory",
			}),
		);
	});

	test("hydrates cached conversation freshness against provider row mtime instead of index scrape time", async () => {
		const metadataCollector = {
			collect: vi.fn(
				async (_input: AccountMirrorMetadataCollectorInput) =>
					({
						detectedIdentityKey: "ecochran76@gmail.com",
						detectedAccountLevel: "Business",
						metadataCounts: {
							projects: 0,
							conversations: 1,
							artifacts: 0,
							files: 0,
							media: 0,
						},
						manifests: {
							projects: [],
							conversations: [
								{
									id: "conv_cached",
									title: "Cached",
									provider: "chatgpt" as const,
									updatedAt: "2026-04-29T10:00:00.000Z",
								},
							],
							artifacts: [],
							files: [],
							media: [],
						},
						evidence: {
							identitySource: "profile-menu",
							projectSampleIds: [],
							conversationSampleIds: ["conv_cached"],
							truncated: {
								projects: false,
								conversations: false,
								artifacts: false,
							},
						},
					}) satisfies AccountMirrorMetadataCollectorResult,
			),
		};
		const persistence: AccountMirrorPersistence = {
			...createNoopPersistence(),
			readCatalog: vi.fn(async () => ({
				projects: [],
				conversations: [
					{
						id: "conv_cached",
						title: "Cached",
						provider: "chatgpt" as const,
						updatedAt: "2026-04-29T10:00:00.000Z",
						metadata: {
							indexObservedAt: "2026-04-29T12:00:00.000Z",
						},
					},
				],
				artifacts: [],
				files: [],
				media: [],
			})),
			readConversationFiles: vi.fn(async () => [
				{
					id: "conv_cached:turn_1:0:handoff-attachments.zip",
					name: "handoff-attachments.zip",
					provider: "chatgpt" as const,
					source: "conversation" as const,
					remoteUrl: "chatgpt://file/file_cached",
				},
			]),
			readConversationAttachments: vi.fn(async () => [
				{
					id: "conv_cached:turn_1:0:handoff-attachments.zip",
					name: "handoff-attachments.zip",
					provider: "chatgpt" as const,
					source: "conversation" as const,
					remoteUrl: "chatgpt://file/file_cached",
					localPath: "/tmp/auracall-test/handoff-attachments.zip",
					checksumSha256: "4f".repeat(32),
				},
			]),
			readConversationContextEntry: vi.fn(async () => ({
				fetchedAt: "2026-04-29T11:00:00.000Z",
				stale: false,
				context: {
					provider: "chatgpt" as const,
					conversationId: "conv_cached",
					messages: [{ role: "user" as const, text: "cached prompt" }],
					files: [],
					artifacts: [],
					sources: [],
				},
			})),
		};
		const service = createAccountMirrorRefreshService({
			config,
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			metadataCollector,
			persistence,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
			generateRequestId: () => "acctmirror_cached_freshness",
		});

		await service.requestRefresh({
			provider: "chatgpt",
			runtimeProfileId: "default",
			explicitRefresh: true,
		});

		const collectInput = metadataCollector.collect.mock.calls[0]?.[0] as
			| AccountMirrorMetadataCollectorInput
			| undefined;
		expect(collectInput?.previousConversationFreshness).toBeInstanceOf(Map);
		expect(collectInput?.previousConversationFreshness?.get("conv_cached")).toMatchObject({
			conversationId: "conv_cached",
			detailObservedAt: "2026-04-29T11:00:00.000Z",
			manifestObservedAt: "2026-04-29T11:00:00.000Z",
			freshnessState: "fresh",
			missingLocalCount: 0,
		});
		expect(collectInput?.previousFiles).toEqual([
			expect.objectContaining({
				id: "conv_cached:turn_1:0:handoff-attachments.zip",
				name: "handoff-attachments.zip",
				source: "conversation",
			}),
		]);
	});

	test("hydrates metadata-only cached freshness for remote-only context assets", async () => {
		const metadataCollector = {
			collect: vi.fn(
				async (_input: AccountMirrorMetadataCollectorInput) =>
					({
						detectedIdentityKey: "ecochran76@gmail.com",
						detectedAccountLevel: "Business",
						metadataCounts: {
							projects: 0,
							conversations: 1,
							artifacts: 0,
							files: 0,
							media: 0,
						},
						manifests: {
							projects: [],
							conversations: [],
							artifacts: [],
							files: [],
							media: [],
						},
						evidence: {
							identitySource: "profile-menu",
							projectSampleIds: [],
							conversationSampleIds: ["conv_remote_assets"],
							truncated: {
								projects: false,
								conversations: false,
								artifacts: false,
							},
						},
					}) satisfies AccountMirrorMetadataCollectorResult,
			),
		};
		const persistence: AccountMirrorPersistence = {
			...createNoopPersistence(),
			readCatalog: vi.fn(async () => ({
				projects: [],
				conversations: [
					{
						id: "conv_remote_assets",
						title: "Remote Assets",
						provider: "chatgpt" as const,
						updatedAt: "2026-04-29T10:00:00.000Z",
					},
				],
				artifacts: [],
				files: [],
				media: [],
			})),
			readConversationContextEntry: vi.fn(async () => ({
				fetchedAt: "2026-04-29T11:00:00.000Z",
				stale: false,
				context: {
					provider: "chatgpt" as const,
					conversationId: "conv_remote_assets",
					messages: [{ role: "assistant" as const, text: "remote artifact" }],
					files: [],
					artifacts: [
						{
							id: "artifact_remote",
							title: "Remote artifact",
							provider: "chatgpt" as const,
							source: "conversation" as const,
							remoteUrl: "chatgpt://artifact/artifact_remote",
						},
					],
					sources: [],
				},
			})),
		};
		const service = createAccountMirrorRefreshService({
			config,
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			metadataCollector,
			persistence,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
			generateRequestId: () => "acctmirror_remote_context_assets",
		});

		await service.requestRefresh({
			provider: "chatgpt",
			runtimeProfileId: "default",
			explicitRefresh: true,
			materializationPolicy: "metadata_only",
		});

		const collectInput = metadataCollector.collect.mock.calls[0]?.[0] as
			| AccountMirrorMetadataCollectorInput
			| undefined;
		expect(collectInput?.previousConversationFreshness?.get("conv_remote_assets")).toMatchObject({
			conversationId: "conv_remote_assets",
			detailObservedAt: "2026-04-29T11:00:00.000Z",
			manifestObservedAt: "2026-04-29T11:00:00.000Z",
			freshnessState: "fresh",
			assetCompleteness: "partial",
			missingLocalCount: 1,
		});
	});

	test("preserves an active ChatGPT rate-limit guard after a successful refresh", async () => {
		await writeChatgptRateLimitGuardState(
			{
				provider: "chatgpt",
				profile: "default",
				updatedAt: Date.parse("2026-04-29T11:59:30.000Z"),
				cooldownDetectedAt: Date.parse("2026-04-29T11:59:30.000Z"),
				cooldownUntil: Date.parse("2026-04-29T12:05:00.000Z"),
				cooldownReason: "Too many requests. You're making requests too quickly.",
				cooldownAction: "readConversationContext",
			},
			{ profileName: "default" },
		);
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});
		const persistence = createNoopPersistence();
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			metadataCollector: {
				collect: vi.fn(async () => ({
					detectedIdentityKey: "ecochran76@gmail.com",
					detectedAccountLevel: "Business",
					metadataCounts: {
						projects: 1,
						conversations: 1,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [{ id: "project_1", name: "Project 1", provider: "chatgpt" as const }],
						conversations: [{ id: "conv_1", title: "One", provider: "chatgpt" as const }],
						artifacts: [],
						files: [],
						media: [],
					},
					evidence: {
						identitySource: "profile-menu",
						projectSampleIds: ["project_1"],
						conversationSampleIds: ["conv_1"],
						truncated: {
							projects: false,
							conversations: false,
							artifacts: false,
						},
						attachmentInventory: {
							nextProjectIndex: 0,
							nextConversationIndex: 1,
							detailReadLimit: 1,
							scannedProjects: 0,
							scannedConversations: 1,
							yielded: true,
							yieldCause: {
								observedAt: "2026-04-29T12:00:00.000Z",
								ownerCommand: "operator-request",
								kind: "foreground-work",
								operationClass: "interactive",
							},
						},
						scrapeBudget: {
							provider: "chatgpt" as const,
							runtimeProfileId: "default",
							sweepMode: "steady_follow" as const,
							observedAt: "2026-04-29T12:00:00.000Z",
							classification: "active_dominant" as const,
							summary:
								"Account mirror scrape used 1 passive parse/read signal(s) and 2 active provider interaction(s).",
							passive: {
								domParses: 1,
								appStateReads: 0,
								downloadLinkEnumerations: 0,
								cachedFileCarries: 0,
								total: 1,
							},
							active: {
								identityReads: 1,
								projectIndexReads: 0,
								rootRailReads: 0,
								projectConversationReads: 0,
								chatLoads: 1,
								accountLibraryReads: 0,
								downloads: 0,
								total: 2,
							},
							providerInteractions: {
								budget: 20,
								used: 2,
								remaining: 18,
								yielded: true,
								yieldReason: "foreground-work",
							},
							providerGuardCorrelation: {
								state: "none" as const,
								kind: null,
								summary: null,
								detectedAt: null,
								cooldownUntil: null,
								action: null,
								correlatedWithYield: false,
								yieldReason: null,
							},
							llmServiceRequests: 0,
							cdpMethodCalls: 2,
							cdpMethods: {
								"Runtime.evaluate": 2,
							},
							providerActions: {
								"chatgpt.listConversationFiles.start": 1,
							},
						},
					},
				})),
			},
			persistence,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		const result = await service.requestRefresh({
			provider: "chatgpt",
			runtimeProfileId: "default",
			explicitRefresh: true,
		});

		expect(result.status).toBe("completed");
		expect(result.mirrorStatus.entries[0]).toMatchObject({
			status: "delayed",
			reason: "provider-guard-cooldown",
			eligibleAt: "2026-04-29T12:05:00.000Z",
			providerGuard: expect.objectContaining({
				state: "cooldown",
				kind: "unknown",
				summary:
					"ChatGPT rate limit detected: Too many requests. You're making requests too quickly.",
				detectedAt: "2026-04-29T11:59:30.000Z",
				cooldownUntil: "2026-04-29T12:05:00.000Z",
				action: "readConversationContext",
			}),
			metadataEvidence: expect.objectContaining({
				scrapeBudget: expect.objectContaining({
					providerGuardCorrelation: {
						state: "cooldown",
						kind: "unknown",
						summary:
							"ChatGPT rate limit detected: Too many requests. You're making requests too quickly.",
						detectedAt: "2026-04-29T11:59:30.000Z",
						cooldownUntil: "2026-04-29T12:05:00.000Z",
						action: "readConversationContext",
						correlatedWithYield: true,
						yieldReason: "foreground-work",
					},
				}),
			}),
		});
		expect(persistence.writeState).toHaveBeenCalledWith(
			expect.objectContaining({
				state: expect.objectContaining({
					providerCooldownUntilMs: Date.parse("2026-04-29T12:05:00.000Z"),
					providerGuard: expect.objectContaining({
						state: "cooldown",
						cooldownUntilMs: Date.parse("2026-04-29T12:05:00.000Z"),
					}),
					metadataEvidence: expect.objectContaining({
						scrapeBudget: expect.objectContaining({
							providerGuardCorrelation: expect.objectContaining({
								state: "cooldown",
								correlatedWithYield: true,
							}),
						}),
					}),
				}),
			}),
		);
	});

	test("classifies visible ChatGPT requests-too-quickly warnings for target census", () => {
		expect(
			classifyChatgptRateLimitCensusProbeForTest({
				text: "Too many requests. You're making requests too quickly. Please try again later.",
				buttonLabels: ["OK"],
			}),
		).toEqual({
			reason: "Too many requests.",
		});
		expect(
			classifyChatgptRateLimitCensusProbeForTest({
				text: "ChatGPT can make mistakes. Check important info.",
			}),
		).toBeNull();
	});

	test("preserves a ChatGPT cooldown guard detected before the collector runs", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});
		const metadataCollector = {
			collect: vi.fn(async () => {
				throw new Error("collector should not run");
			}),
		};
		const persistence = createNoopPersistence();
		const providerGuardCensus = vi.fn(async () => ({
			state: "cooldown" as const,
			kind: "unknown" as const,
			summary: "ChatGPT rate limit detected: Too many requests.",
			detectedAtMs: Date.parse("2026-04-29T12:00:00.000Z"),
			cooldownUntilMs: Date.parse("2026-04-29T12:05:00.000Z"),
			url: "https://chatgpt.com/c/abc",
			action: "account-mirror-refresh:target-census-visible-warning",
		}));
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			metadataCollector,
			providerGuardCensus,
			persistence,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		await expect(
			service.requestRefresh({
				provider: "chatgpt",
				runtimeProfileId: "default",
				explicitRefresh: true,
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			code: "account_mirror_provider_guard",
			details: {
				providerCooldownUntilMs: Date.parse("2026-04-29T12:05:00.000Z"),
				providerGuard: expect.objectContaining({
					state: "cooldown",
					action: "account-mirror-refresh:target-census-visible-warning",
				}),
			},
		} satisfies Partial<AccountMirrorRefreshError>);
		expect(metadataCollector.collect).not.toHaveBeenCalled();
		expect(
			registry.readStatus({
				provider: "chatgpt",
				runtimeProfileId: "default",
				explicitRefresh: true,
			}).entries[0],
		).toMatchObject({
			status: "delayed",
			reason: "provider-guard-cooldown",
			eligibleAt: "2026-04-29T12:05:00.000Z",
			providerGuard: expect.objectContaining({
				state: "cooldown",
				cooldownUntil: "2026-04-29T12:05:00.000Z",
			}),
		});
		expect(persistence.writeState).toHaveBeenCalledWith(
			expect.objectContaining({
				state: expect.objectContaining({
					providerCooldownUntilMs: Date.parse("2026-04-29T12:05:00.000Z"),
					providerHardStopAtMs: undefined,
				}),
			}),
		);
	});

	test("keeps failure backoff by default for explicit refresh requests", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-06-07T15:55:18.700Z"),
			initialState: {
				"chatgpt:wsl-chrome-2": {
					detectedIdentityKey: "consult@polymerconsultinggroup.com",
					detectedIdentitySource: "provider-app",
					detectedIdentityObservedAtMs: Date.parse("2026-06-07T15:52:30.359Z"),
					detectedIdentityConfidence: "authoritative",
					lastFailureAtMs: Date.parse("2026-06-07T15:54:18.700Z"),
					consecutiveFailureCount: 189,
				},
			},
		});
		const metadataCollector = {
			collect: vi.fn(async () => ({
				detectedIdentityKey: "consult@polymerconsultinggroup.com",
				detectedAccountLevel: "Pro",
				metadataCounts: {
					projects: 0,
					conversations: 0,
					artifacts: 0,
					files: 0,
					media: 0,
				},
				manifests: {
					projects: [{ id: "project_1", name: "Project 1", provider: "chatgpt" as const }],
					conversations: [
						{ id: "conv_1", title: "One", provider: "chatgpt" as const },
						{ id: "conv_2", title: "Two", provider: "chatgpt" as const },
					],
					artifacts: [
						{ id: "artifact_1", title: "Artifact 1" },
						{ id: "artifact_2", title: "Artifact 2" },
						{ id: "artifact_3", title: "Artifact 3" },
					],
					files: [
						{
							id: "file_1",
							name: "One.pdf",
							provider: "chatgpt" as const,
							source: "conversation" as const,
						},
						{
							id: "file_2",
							name: "Two.pdf",
							provider: "chatgpt" as const,
							source: "conversation" as const,
						},
						{
							id: "file_3",
							name: "Three.pdf",
							provider: "chatgpt" as const,
							source: "conversation" as const,
						},
						{
							id: "file_4",
							name: "Four.pdf",
							provider: "chatgpt" as const,
							source: "conversation" as const,
						},
					],
					media: [],
				},
				evidence: {
					identitySource: "auth-session",
					projectSampleIds: [],
					conversationSampleIds: [],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
			})),
		};
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher(),
			metadataCollector,
			persistence: createNoopPersistence(),
			now: () => new Date("2026-06-07T15:55:18.700Z"),
		});

		await expect(
			service.requestRefresh({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-2",
				explicitRefresh: true,
				ignoreMinimumInterval: true,
				queueTimeoutMs: 0,
			}),
		).rejects.toMatchObject({
			code: "account_mirror_not_eligible",
			details: expect.objectContaining({
				reason: "failure-backoff",
			}),
		});
		expect(metadataCollector.collect).not.toHaveBeenCalled();
	});

	test("allows explicit recovery refresh to bypass failure backoff", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-06-07T15:55:18.700Z"),
			initialState: {
				"chatgpt:wsl-chrome-2": {
					detectedIdentityKey: "consult@polymerconsultinggroup.com",
					detectedIdentitySource: "provider-app",
					detectedIdentityObservedAtMs: Date.parse("2026-06-07T15:52:30.359Z"),
					detectedIdentityConfidence: "authoritative",
					lastFailureAtMs: Date.parse("2026-06-07T15:54:18.700Z"),
					consecutiveFailureCount: 189,
				},
			},
		});
		const metadataCollector = {
			collect: vi.fn(async () => ({
				detectedIdentityKey: "consult@polymerconsultinggroup.com",
				detectedAccountLevel: "Pro",
				metadataCounts: {
					projects: 1,
					conversations: 2,
					artifacts: 3,
					files: 4,
					media: 0,
				},
				manifests: {
					projects: [{ id: "project_1", name: "Project 1", provider: "chatgpt" as const }],
					conversations: [
						{ id: "conv_1", title: "One", provider: "chatgpt" as const },
						{ id: "conv_2", title: "Two", provider: "chatgpt" as const },
					],
					artifacts: [
						{ id: "artifact_1", title: "Artifact 1" },
						{ id: "artifact_2", title: "Artifact 2" },
						{ id: "artifact_3", title: "Artifact 3" },
					],
					files: [
						{
							id: "file_1",
							name: "One.pdf",
							provider: "chatgpt" as const,
							source: "conversation" as const,
						},
						{
							id: "file_2",
							name: "Two.pdf",
							provider: "chatgpt" as const,
							source: "conversation" as const,
						},
						{
							id: "file_3",
							name: "Three.pdf",
							provider: "chatgpt" as const,
							source: "conversation" as const,
						},
						{
							id: "file_4",
							name: "Four.pdf",
							provider: "chatgpt" as const,
							source: "conversation" as const,
						},
					],
					media: [],
				},
				evidence: {
					identitySource: "auth-session",
					projectSampleIds: [],
					conversationSampleIds: [],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
			})),
		};
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher(),
			metadataCollector,
			persistence: createNoopPersistence(),
			now: () => new Date("2026-06-07T15:55:18.700Z"),
		});

		const result = await service.requestRefresh({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			explicitRefresh: true,
			ignoreMinimumInterval: true,
			ignoreFailureBackoff: true,
			queueTimeoutMs: 0,
		});

		expect(result.status).toBe("completed");
		expect(metadataCollector.collect).toHaveBeenCalledTimes(1);
		expect(result.metadataCounts).toEqual({
			projects: 1,
			conversations: 2,
			artifacts: 3,
			files: 4,
			media: 0,
		});
	});

	test("passes the persisted attachment cursor and merges new manifest rows with the cached catalog", async () => {
		const previousEvidence = {
			identitySource: "profile-menu",
			projectSampleIds: ["project_1"],
			conversationSampleIds: ["conv_1"],
			attachmentInventory: {
				nextProjectIndex: 1,
				nextConversationIndex: 0,
				detailReadLimit: 2,
				scannedProjects: 1,
				scannedConversations: 0,
				yielded: false,
				yieldCause: null,
			},
			projectConversations: null,
			truncated: {
				projects: false,
				conversations: false,
				artifacts: true,
			},
		};
		const metadataCollector = {
			collect: vi.fn(async () => ({
				detectedIdentityKey: "ecochran76@gmail.com",
				detectedAccountLevel: "Business",
				metadataCounts: {
					projects: 1,
					conversations: 1,
					artifacts: 0,
					files: 1,
					media: 0,
				},
				manifests: {
					projects: [{ id: "project_1", name: "Project 1", provider: "chatgpt" as const }],
					conversations: [{ id: "conv_1", title: "One", provider: "chatgpt" as const }],
					artifacts: [],
					files: [
						{
							id: "file_2",
							name: "Second upload.pdf",
							provider: "chatgpt" as const,
							source: "conversation" as const,
						},
					],
					media: [],
				},
				evidence: previousEvidence,
			})),
		};
		const persistence: AccountMirrorPersistence = {
			writeSnapshot: vi.fn(async () => {}),
			readCatalog: vi.fn(async () => ({
				projects: [{ id: "project_1", name: "Project 1", provider: "chatgpt" as const }],
				conversations: [{ id: "conv_1", title: "One", provider: "chatgpt" as const }],
				artifacts: [],
				files: [
					{
						id: "file_1",
						name: "First upload.pdf",
						provider: "chatgpt" as const,
						source: "project" as const,
					},
				],
				media: [],
			})),
			readState: vi.fn(async () => ({
				detectedIdentityKey: "ecochran76@gmail.com",
				metadataCounts: {
					projects: 1,
					conversations: 1,
					artifacts: 0,
					files: 1,
					media: 0,
				},
				metadataEvidence: previousEvidence,
			})),
			readConversationContext: vi.fn(async () => null),
		};
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
			readPersistentState: persistence.readState,
		});
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			metadataCollector,
			persistence,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
			generateRequestId: () => "acctmirror_cursor",
		});

		const result = await service.requestRefresh({
			provider: "chatgpt",
			runtimeProfileId: "default",
			explicitRefresh: true,
		});

		expect(metadataCollector.collect).toHaveBeenCalledWith(
			expect.objectContaining({
				sweepMode: "steady_follow",
				previousEvidence: expect.objectContaining({
					attachmentInventory: expect.objectContaining(previousEvidence.attachmentInventory),
					projectConversations: null,
				}),
			}),
		);
		expect(result.metadataCounts.files).toBe(2);
		expect(result.mirrorCompleteness).toMatchObject({
			state: "in_progress",
			remainingDetailSurfaces: {
				projects: 0,
				conversations: 1,
				total: 1,
			},
		});
		expect(persistence.writeSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				metadataCounts: expect.objectContaining({ files: 2 }),
				metadataEvidence: expect.objectContaining({
					attachmentInventory: previousEvidence.attachmentInventory,
					countEvidence: expect.objectContaining({
						observedThisPass: expect.objectContaining({ files: 1 }),
						retainedFromCache: expect.objectContaining({ files: 1 }),
						mergedTotal: expect.objectContaining({ files: 2 }),
					}),
				}),
				manifests: expect.objectContaining({
					files: [
						{ id: "file_1", name: "First upload.pdf", provider: "chatgpt", source: "project" },
						{
							id: "file_2",
							name: "Second upload.pdf",
							provider: "chatgpt",
							source: "conversation",
						},
					],
				}),
			}),
		);
	});

	test("separates zero live-observed Gemini rows from retained cached conversations and defers asset inventory", async () => {
		const geminiConfig = {
			runtimeProfiles: {
				default: {
					browserProfile: "default",
					defaultService: "gemini",
					services: {
						gemini: {
							identity: { email: "ecochran76@gmail.com" },
						},
					},
				},
			},
		};
		const evidence = {
			identitySource: "profile-menu",
			projectSampleIds: ["gem_1"],
			conversationSampleIds: [],
			attachmentInventory: {
				nextProjectIndex: 0,
				nextConversationIndex: 0,
				detailReadLimit: 4,
				scannedProjects: 1,
				scannedConversations: 0,
				yielded: false,
				yieldCause: null,
			},
			projectConversations: null,
			truncated: {
				projects: false,
				conversations: false,
				artifacts: false,
			},
		};
		const metadataCollector = {
			collect: vi.fn(async () => ({
				detectedIdentityKey: "ecochran76@gmail.com",
				detectedAccountLevel: "Pro",
				metadataCounts: {
					projects: 1,
					conversations: 0,
					artifacts: 0,
					files: 0,
					media: 0,
				},
				manifests: {
					projects: [{ id: "gem_1", name: "Gem 1", provider: "gemini" as const }],
					conversations: [],
					artifacts: [],
					files: [],
					media: [],
				},
				evidence,
			})),
		};
		const persistence: AccountMirrorPersistence = {
			writeSnapshot: vi.fn(async () => {}),
			writeState: vi.fn(async () => {}),
			readCatalog: vi.fn(async () => ({
				projects: [{ id: "gem_1", name: "Gem 1", provider: "gemini" as const }],
				conversations: [
					{ id: "gem_conv_1", title: "Cached image chat", provider: "gemini" as const },
					{ id: "gem_conv_2", title: "Cached video chat", provider: "gemini" as const },
				],
				artifacts: [],
				files: [],
				media: [],
			})),
			readState: vi.fn(async () => null),
			readConversationContext: vi.fn(async () => null),
		};
		const service = createAccountMirrorRefreshService({
			config: geminiConfig,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-05-25T18:00:00.000Z"),
			}),
			metadataCollector,
			persistence,
			now: () => new Date("2026-05-25T18:00:00.000Z"),
			generateRequestId: () => "acctmirror_gemini_deferred",
		});

		const result = await service.requestRefresh({
			provider: "gemini",
			runtimeProfileId: "default",
			explicitRefresh: true,
		});

		expect(result.metadataCounts).toMatchObject({
			projects: 1,
			conversations: 2,
			artifacts: 0,
			files: 0,
			media: 0,
		});
		expect(result.metadataEvidence).toMatchObject({
			conversationSampleIds: [],
			countEvidence: {
				observedThisPass: expect.objectContaining({ conversations: 0, artifacts: 0 }),
				retainedFromCache: expect.objectContaining({ conversations: 2, artifacts: 0 }),
				mergedTotal: expect.objectContaining({ conversations: 2, artifacts: 0 }),
			},
			detailScannedThisPass: {
				projects: 1,
				conversations: 0,
				total: 1,
			},
			assetInventory: expect.objectContaining({
				state: "deferred",
			}),
		});
		expect(result.mirrorCompleteness).toMatchObject({
			state: "unknown",
			assetInventory: expect.objectContaining({
				state: "deferred",
			}),
		});
		expect(result.mirrorStatus.entries[0]).toMatchObject({
			metadataEvidence: expect.objectContaining({
				countEvidence: expect.objectContaining({
					retainedFromCache: expect.objectContaining({ conversations: 2 }),
				}),
			}),
			mirrorCompleteness: expect.objectContaining({
				state: "unknown",
				assetInventory: expect.objectContaining({
					state: "deferred",
				}),
			}),
		});
	});

	test("replaces stale project manifest rows after a complete project scan", async () => {
		const geminiConfig = {
			runtimeProfiles: {
				default: {
					browserProfile: "default",
					defaultService: "gemini",
					services: {
						gemini: {
							identity: { email: "ecochran76@gmail.com" },
						},
					},
				},
			},
		};
		const evidence = {
			identitySource: "google-account-label",
			projectSampleIds: [],
			conversationSampleIds: [],
			attachmentInventory: {
				nextProjectIndex: 0,
				nextConversationIndex: 0,
				detailReadLimit: 4,
				scannedProjects: 0,
				scannedConversations: 0,
				yielded: false,
				yieldCause: null,
			},
			projectConversations: {
				nextProjectIndex: 0,
				readLimit: 0,
				scannedProjects: 0,
				yielded: false,
			},
			truncated: {
				projects: false,
				conversations: false,
				artifacts: false,
			},
		};
		const metadataCollector = {
			collect: vi.fn(async () => ({
				detectedIdentityKey: "ecochran76@gmail.com",
				detectedAccountLevel: null,
				metadataCounts: {
					projects: 0,
					conversations: 0,
					artifacts: 0,
					files: 0,
					media: 0,
				},
				manifests: {
					projects: [],
					conversations: [],
					artifacts: [],
					files: [],
					media: [],
				},
				evidence,
			})),
		};
		const persistence: AccountMirrorPersistence = {
			writeSnapshot: vi.fn(async () => {}),
			writeState: vi.fn(async () => {}),
			readCatalog: vi.fn(async () => ({
				projects: [
					{
						id: "chess-champ",
						name: "Chess champ",
						provider: "gemini" as const,
						url: "https://gemini.google.com/gem/chess-champ",
					},
					{
						id: "brainstormer",
						name: "Brainstormer",
						provider: "gemini" as const,
						url: "https://gemini.google.com/gem/brainstormer",
					},
				],
				conversations: [
					{ id: "gem_conv_1", title: "Cached image chat", provider: "gemini" as const },
				],
				artifacts: [],
				files: [],
				media: [],
			})),
			readState: vi.fn(async () => null),
			readConversationContext: vi.fn(async () => null),
		};
		const service = createAccountMirrorRefreshService({
			config: geminiConfig,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-05-31T00:50:00.000Z"),
			}),
			metadataCollector,
			persistence,
			now: () => new Date("2026-05-31T00:50:00.000Z"),
			generateRequestId: () => "acctmirror_project_prune",
		});

		const result = await service.requestRefresh({
			provider: "gemini",
			runtimeProfileId: "default",
			explicitRefresh: true,
		});

		expect(result.metadataCounts).toMatchObject({
			projects: 0,
			conversations: 1,
		});
		expect(result.metadataEvidence).toMatchObject({
			countEvidence: {
				observedThisPass: expect.objectContaining({ projects: 0 }),
				retainedFromCache: expect.objectContaining({ projects: 0, conversations: 1 }),
				mergedTotal: expect.objectContaining({ projects: 0, conversations: 1 }),
			},
		});
		expect(persistence.writeSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				manifests: expect.objectContaining({
					projects: [],
					conversations: [{ id: "gem_conv_1", title: "Cached image chat", provider: "gemini" }],
				}),
			}),
		);
	});

	test("preserves newly observed conversation order when merging existing cached rows", async () => {
		const metadataCollector = {
			collect: vi.fn(async () => ({
				detectedIdentityKey: "ecochran76@gmail.com",
				detectedAccountLevel: "Business",
				metadataCounts: {
					projects: 0,
					conversations: 1,
					artifacts: 0,
					files: 0,
					media: 0,
				},
				manifests: {
					projects: [],
					conversations: [
						{
							id: "conv_moved_top",
							title: "Moved to top after operator edit",
							provider: "chatgpt" as const,
							updatedAt: "2026-05-23T17:45:00.000Z",
							metadata: {
								indexObservedAt: "2026-05-23T17:45:00.000Z",
							},
						},
					],
					artifacts: [],
					files: [],
					media: [],
				},
				evidence: {
					identitySource: "profile-menu",
					projectSampleIds: [],
					conversationSampleIds: ["conv_moved_top"],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
			})),
		};
		const persistence: AccountMirrorPersistence = {
			writeSnapshot: vi.fn(async () => {}),
			readCatalog: vi.fn(async () => ({
				projects: [],
				conversations: [
					{ id: "conv_old_top", title: "Previously top", provider: "chatgpt" as const },
					{
						id: "conv_moved_top",
						title: "Older cached title",
						provider: "chatgpt" as const,
						updatedAt: "2026-05-20T12:00:00.000Z",
						metadata: {
							detailObservedAt: "2026-05-23T17:40:00.000Z",
							manifestObservedAt: "2026-05-23T17:40:00.000Z",
							detailCompleteness: "complete",
							staleNestedValue: "preserved",
						},
					},
					{ id: "conv_old_bottom", title: "Previously bottom", provider: "chatgpt" as const },
				],
				artifacts: [],
				files: [],
				media: [],
			})),
			readState: vi.fn(async () => ({
				detectedIdentityKey: "ecochran76@gmail.com",
				metadataCounts: {
					projects: 0,
					conversations: 3,
					artifacts: 0,
					files: 0,
					media: 0,
				},
				metadataEvidence: null,
			})),
			readConversationContext: vi.fn(async () => null),
		};
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-05-23T17:45:00.000Z"),
			readPersistentState: persistence.readState,
		});
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-05-23T17:45:00.000Z"),
			}),
			metadataCollector,
			persistence,
			now: () => new Date("2026-05-23T17:45:00.000Z"),
			generateRequestId: () => "acctmirror_conversation_order",
		});

		await service.requestRefresh({
			provider: "chatgpt",
			runtimeProfileId: "default",
			sweepMode: "steady_follow",
			explicitRefresh: true,
		});

		expect(persistence.writeSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				manifests: expect.objectContaining({
					conversations: [
						{
							id: "conv_moved_top",
							title: "Moved to top after operator edit",
							provider: "chatgpt",
							updatedAt: "2026-05-23T17:45:00.000Z",
							metadata: {
								detailObservedAt: "2026-05-23T17:40:00.000Z",
								manifestObservedAt: "2026-05-23T17:40:00.000Z",
								detailCompleteness: "complete",
								indexObservedAt: "2026-05-23T17:45:00.000Z",
								staleNestedValue: "preserved",
							},
						},
						{ id: "conv_old_top", title: "Previously top", provider: "chatgpt" },
						{ id: "conv_old_bottom", title: "Previously bottom", provider: "chatgpt" },
					],
				}),
			}),
		);
	});

	test("runs a configured non-default ChatGPT runtime profile refresh", async () => {
		const metadataCollector = {
			collect: vi.fn(async () => ({
				detectedIdentityKey: "consult@polymerconsultinggroup.com",
				detectedAccountLevel: "Pro",
				metadataCounts: {
					projects: 0,
					conversations: 1,
					artifacts: 0,
					files: 0,
					media: 0,
				},
				manifests: {
					projects: [],
					conversations: [
						{ id: "consult_conv_1", title: "Consult conversation", provider: "chatgpt" as const },
					],
					artifacts: [],
					files: [],
					media: [],
				},
				evidence: {
					identitySource: "auth-session",
					projectSampleIds: [],
					conversationSampleIds: ["consult_conv_1"],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
			})),
		};
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-05-02T16:10:00.000Z"),
		});
		const persistence = createNoopPersistence();
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-05-02T16:10:00.000Z"),
			}),
			metadataCollector,
			persistence,
			now: () => new Date("2026-05-02T16:10:00.000Z"),
			generateRequestId: () => "acctmirror_consult",
		});

		const result = await service.requestRefresh({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			explicitRefresh: true,
		});

		expect(metadataCollector.collect).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-2",
				expectedIdentityKey: "consult@polymerconsultinggroup.com",
			}),
		);
		expect(result).toMatchObject({
			requestId: "acctmirror_consult",
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			browserProfileId: "wsl-chrome-2",
			detectedIdentityKey: "consult@polymerconsultinggroup.com",
			detectedAccountLevel: "Pro",
			metadataCounts: {
				conversations: 1,
			},
			dispatcher: {
				key: expect.stringContaining("wsl-chrome-2/chatgpt::service:chatgpt"),
			},
		});
		expect(persistence.writeSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-2",
				browserProfileId: "wsl-chrome-2",
				boundIdentityKey: "consult@polymerconsultinggroup.com",
			}),
		);
	});

	test("runs a read-only Gemini refresh through the browser operation dispatcher", async () => {
		const geminiConfig = {
			...config,
			runtimeProfiles: {
				...config.runtimeProfiles,
				default: {
					...config.runtimeProfiles.default,
					defaultService: "gemini",
					services: {
						...config.runtimeProfiles.default.services,
						gemini: {
							identity: {
								email: "ecochran76@gmail.com",
							},
						},
					},
				},
			},
		};
		const metadataCollector = {
			collect: vi.fn(async () => ({
				detectedIdentityKey: "ecochran76@gmail.com",
				detectedAccountLevel: null,
				metadataCounts: {
					projects: 0,
					conversations: 1,
					artifacts: 0,
					files: 0,
					media: 0,
				},
				manifests: {
					projects: [],
					conversations: [
						{ id: "gemini_conv_1", title: "Gemini conversation", provider: "gemini" as const },
					],
					artifacts: [],
					files: [],
					media: [],
				},
				evidence: {
					identitySource: "profile-menu",
					projectSampleIds: [],
					conversationSampleIds: ["gemini_conv_1"],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
			})),
		};
		const service = createAccountMirrorRefreshService({
			config: geminiConfig,
			dispatcher: createBrowserOperationDispatcher(),
			metadataCollector,
			persistence: createNoopPersistence(),
			generateRequestId: () => "acctmirror_gemini",
		});

		const result = await service.requestRefresh({
			provider: "gemini",
			runtimeProfileId: "default",
			explicitRefresh: true,
		});

		expect(result).toMatchObject({
			requestId: "acctmirror_gemini",
			provider: "gemini",
			runtimeProfileId: "default",
			detectedIdentityKey: "ecochran76@gmail.com",
			metadataCounts: {
				conversations: 1,
			},
			dispatcher: {
				key: expect.stringContaining("service:gemini"),
			},
		});
		expect(metadataCollector.collect).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "default",
				expectedIdentityKey: "ecochran76@gmail.com",
			}),
		);
	});

	test("terminates the managed Gemini browser when bounded refresh cleanup is requested", async () => {
		const geminiConfig = {
			...config,
			runtimeProfiles: {
				...config.runtimeProfiles,
				default: {
					...config.runtimeProfiles.default,
					keepBrowser: true,
					defaultService: "gemini",
					services: {
						...config.runtimeProfiles.default.services,
						gemini: {
							identity: {
								email: "ecochran76@gmail.com",
							},
						},
					},
				},
			},
		};
		const findManagedBrowserPid = vi.fn(async () => 4242);
		const terminateManagedBrowserProcess = vi.fn(async () => {});
		const service = createAccountMirrorRefreshService({
			config: geminiConfig,
			dispatcher: createBrowserOperationDispatcher(),
			metadataCollector: {
				collect: vi.fn(async () => ({
					detectedIdentityKey: "ecochran76@gmail.com",
					detectedAccountLevel: null,
					metadataCounts: {
						projects: 0,
						conversations: 0,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [],
						artifacts: [],
						files: [],
						media: [],
					},
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
				})),
			},
			persistence: createNoopPersistence(),
			findManagedBrowserPid,
			terminateManagedBrowserProcess,
			generateRequestId: () => "acctmirror_gemini_cleanup",
		});

		const result = await service.requestRefresh({
			provider: "gemini",
			runtimeProfileId: "default",
			explicitRefresh: true,
			cleanupManagedBrowserAfterRefresh: true,
		});

		expect(findManagedBrowserPid).toHaveBeenCalledWith(expect.stringContaining("gemini"));
		expect(terminateManagedBrowserProcess).toHaveBeenCalledWith(
			expect.objectContaining({
				pid: 4242,
				provider: "gemini",
				runtimeProfileId: "default",
				managedProfileDir: expect.stringContaining("gemini"),
			}),
		);
		expect(result.browserLifecycle).toMatchObject({
			cleanupRequested: true,
			status: "terminated",
			pid: 4242,
			managedProfileDir: expect.stringContaining("gemini"),
		});
	});

	test("reports dispatcher busy instead of bypassing the browser control plane", async () => {
		const dispatcher = createBrowserOperationDispatcher({
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});
		const active = await dispatcher.acquire({
			managedProfileDir: "/tmp/auracall-default-chatgpt",
			serviceTarget: "chatgpt",
			kind: "browser-execution",
			operationClass: "exclusive-mutating",
			ownerCommand: "test-active-browser-run",
		});
		if (!active.acquired) {
			throw new Error("test setup failed to acquire dispatcher lock");
		}
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});
		const service = createAccountMirrorRefreshService({
			config: {
				...config,
				browser: {
					manualLoginProfileDir: "/tmp/auracall-default-chatgpt",
				},
			},
			registry,
			dispatcher,
			persistence: createNoopPersistence(),
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		await expect(
			service.requestRefresh({
				provider: "chatgpt",
				runtimeProfileId: "default",
				queueTimeoutMs: 0,
			}),
		).rejects.toMatchObject({
			statusCode: 503,
			code: "account_mirror_browser_operation_busy",
		} satisfies Partial<AccountMirrorRefreshError>);
		expect(
			registry.readStatus({
				provider: "chatgpt",
				runtimeProfileId: "default",
				explicitRefresh: true,
			}).entries[0],
		).toMatchObject({
			mirrorState: expect.objectContaining({
				queued: false,
				running: false,
				lastDispatcherBlockedBy: expect.objectContaining({
					ownerCommand: "test-active-browser-run",
				}),
			}),
		});

		await active.release();
	});

	test("times out a stuck metadata collector and releases the browser operation", async () => {
		await useTempAuracallHome();
		let collectAbortSignal: AbortSignal | null = null;
		const dispatcher = createBrowserOperationDispatcher({
			now: () => new Date("2026-05-02T20:05:00.000Z"),
		});
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-05-02T20:05:00.000Z"),
		});
		const persistence = createNoopPersistence();
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher,
			metadataCollector: {
				collect: vi.fn((input: AccountMirrorMetadataCollectorInput) => {
					collectAbortSignal = input.abortSignal ?? null;
					return new Promise<AccountMirrorMetadataCollectorResult>(() => {});
				}),
			},
			persistence,
			now: () => new Date("2026-05-02T20:05:00.000Z"),
		});

		await expect(
			service.requestRefresh({
				provider: "chatgpt",
				runtimeProfileId: "default",
				explicitRefresh: true,
				collectorTimeoutMs: 5,
			}),
		).rejects.toThrow("Account mirror metadata collector timed out for chatgpt/default.");
		expect((collectAbortSignal as AbortSignal | null)?.aborted).toBe(true);
		expect(persistence.writeState).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				browserProfileId: "default",
				boundIdentityKey: "ecochran76@gmail.com",
				updatedAt: "2026-05-02T20:05:00.000Z",
				state: expect.objectContaining({
					lastAttemptAtMs: Date.parse("2026-05-02T20:05:00.000Z"),
					lastFailureAtMs: Date.parse("2026-05-02T20:05:00.000Z"),
					consecutiveFailureCount: 1,
					lastRefreshRequestId: expect.any(String),
				}),
			}),
		);

		const entry = registry.readStatus({
			provider: "chatgpt",
			runtimeProfileId: "default",
			explicitRefresh: true,
		}).entries[0];
		expect(entry).toMatchObject({
			mirrorState: expect.objectContaining({
				queued: false,
				running: false,
			}),
		});

		const dispatcherKey = entry?.mirrorState.lastDispatcherKey ?? "missing-dispatcher-key";
		await expect(dispatcher.getActive(dispatcherKey)).resolves.toBeNull();
		await expect(
			listDomDriftObservations({ service: "chatgpt", surface: "account-mirror-refresh" }),
		).resolves.toMatchObject({
			data: [
				{
					service: "chatgpt",
					surface: "account-mirror-refresh",
					action: "collect-metadata",
					fallbackKind: "collector-timeout",
					metadata: expect.objectContaining({
						source: "accountMirror.refreshService",
						runtimeProfileId: "default",
						requestId: expect.any(String),
						dispatcherKey: expect.stringContaining("service:chatgpt"),
						dispatcherOperationId: expect.any(String),
						errorMessage: "Account mirror metadata collector timed out for chatgpt/default.",
					}),
				},
			],
		});
	});

	test("repairs stale malformed identity mismatch after provider-app identity proof", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-06-07T13:04:07.494Z"),
			initialState: {
				"chatgpt:wsl-chrome-2": {
					detectedIdentityKey: "consulting pcg pro",
					lastFailureAtMs: Date.parse("2026-05-31T08:02:50.016Z"),
					consecutiveFailureCount: 179,
					metadataCounts: {
						projects: 6,
						conversations: 68,
						artifacts: 64,
						files: 73,
						media: 0,
					},
					metadataEvidence: {
						identitySource: "auth-session",
						projectSampleIds: [],
						conversationSampleIds: ["conv_old"],
						truncated: {
							projects: false,
							conversations: false,
							artifacts: true,
						},
					},
				},
			},
		});
		const persistence = createNoopPersistence();
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-06-07T13:04:07.494Z"),
			}),
			metadataCollector: {
				collect: vi.fn(async () => ({
					detectedIdentityKey: "consult@polymerconsultinggroup.com",
					detectedIdentitySource: "provider-app",
					detectedIdentityObservedAtMs: Date.parse("2026-06-07T13:04:07.494Z"),
					detectedIdentityConfidence: "authoritative",
					detectedAccountLevel: "Pro",
					metadataCounts: {
						projects: 0,
						conversations: 1,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [{ id: "conv_new", title: "Current", provider: "chatgpt" as const }],
						artifacts: [],
						files: [],
						media: [],
					},
					evidence: {
						identitySource: "auth-session",
						projectSampleIds: [],
						conversationSampleIds: ["conv_new"],
						truncated: {
							projects: false,
							conversations: false,
							artifacts: false,
						},
					},
				})),
			},
			persistence,
			now: () => new Date("2026-06-07T13:04:07.494Z"),
			generateRequestId: () => "acctmirror_identity_repair",
		});

		const result = await service.requestRefresh({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			explicitRefresh: true,
			ignoreMinimumInterval: true,
		});

		expect(result).toMatchObject({
			status: "completed",
			detectedIdentityKey: "consult@polymerconsultinggroup.com",
		});
		const entry = registry.readStatus({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			explicitRefresh: true,
			ignoreMinimumInterval: true,
		}).entries[0];
		expect(entry).toMatchObject({
			detectedIdentityKey: "consult@polymerconsultinggroup.com",
			status: "eligible",
			reason: "eligible",
			lastFailureAt: null,
			consecutiveFailureCount: 0,
			identityEvidence: expect.objectContaining({
				source: "provider-app",
				confidence: "authoritative",
				recheckable: false,
				repairStatus: "stale_mismatch_repaired",
				previousDetectedIdentityKey: "consulting pcg pro",
				currentDetectedIdentityKey: "consult@polymerconsultinggroup.com",
				repair: expect.objectContaining({
					status: "stale_mismatch_repaired",
					requestId: "acctmirror_identity_repair",
				}),
			}),
		});
		expect(persistence.writeState).toHaveBeenLastCalledWith(
			expect.objectContaining({
				state: expect.objectContaining({
					detectedIdentityKey: "consult@polymerconsultinggroup.com",
					detectedIdentitySource: "provider-app",
					detectedIdentityConfidence: "authoritative",
					lastFailureAtMs: null,
					consecutiveFailureCount: 0,
					identityMismatchRepair: expect.objectContaining({
						status: "stale_mismatch_repaired",
						previousDetectedIdentityKey: "consulting pcg pro",
					}),
				}),
			}),
		);
	});

	test("keeps verified provider-app identity repair when later metadata collection times out", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-06-07T13:04:07.494Z"),
			initialState: {
				"chatgpt:wsl-chrome-2": {
					detectedIdentityKey: "consulting pcg pro",
					lastFailureAtMs: Date.parse("2026-05-31T08:02:50.016Z"),
					consecutiveFailureCount: 179,
				},
			},
		});
		const persistence = createNoopPersistence();
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-06-07T13:04:07.494Z"),
			}),
			metadataCollector: {
				collect: vi.fn(async (input: AccountMirrorMetadataCollectorInput) => {
					await input.onIdentityVerified?.({
						detectedIdentityKey: "consult@polymerconsultinggroup.com",
						detectedIdentitySource: "provider-app",
						detectedIdentityObservedAtMs: Date.parse("2026-06-07T13:04:07.494Z"),
						detectedIdentityConfidence: "authoritative",
						detectedAccountLevel: "Pro",
					});
					await input.onProgress?.({
						provider: "chatgpt",
						runtimeProfileId: "wsl-chrome-2",
						sweepMode: "steady_follow",
						phase: "detail-inventory",
						event: "started",
						observedAt: "2026-06-07T13:04:08.000Z",
						conversationsObserved: 68,
						artifactsObserved: 64,
						filesObserved: 73,
						attachmentCursor: {
							nextProjectIndex: 0,
							nextConversationIndex: 1,
							detailReadLimit: 4,
							scannedProjects: 0,
							scannedConversations: 1,
							yielded: false,
						},
					});
					await new Promise(() => {});
					throw new Error("unreachable");
				}),
			},
			persistence,
			now: () => new Date("2026-06-07T13:04:07.494Z"),
			generateRequestId: () => "acctmirror_identity_timeout_repair",
		});

		await expect(
			service.requestRefresh({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-2",
				explicitRefresh: true,
				ignoreMinimumInterval: true,
				collectorTimeoutMs: 1,
			}),
		).rejects.toThrow("Account mirror metadata collector timed out for chatgpt/wsl-chrome-2.");

		expect(
			registry.readStatus({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-2",
				explicitRefresh: true,
				ignoreMinimumInterval: true,
			}).entries[0],
		).toMatchObject({
			detectedIdentityKey: "consult@polymerconsultinggroup.com",
			status: "delayed",
			reason: "failure-backoff",
			identityEvidence: expect.objectContaining({
				source: "provider-app",
				confidence: "authoritative",
				recheckable: false,
				repairStatus: "stale_mismatch_repaired",
				previousDetectedIdentityKey: "consulting pcg pro",
				currentDetectedIdentityKey: "consult@polymerconsultinggroup.com",
			}),
			metadataEvidence: expect.objectContaining({
				collectorProgress: expect.objectContaining({
					phase: "detail-inventory",
					event: "failed",
					conversationsObserved: 68,
					attachmentCursor: expect.objectContaining({
						nextConversationIndex: 1,
						scannedConversations: 1,
					}),
				}),
			}),
		});
		expect(persistence.writeState).toHaveBeenLastCalledWith(
			expect.objectContaining({
				state: expect.objectContaining({
					detectedIdentityKey: "consult@polymerconsultinggroup.com",
					detectedIdentitySource: "provider-app",
					identityMismatchRepair: expect.objectContaining({
						status: "stale_mismatch_repaired",
						requestId: "acctmirror_identity_timeout_repair",
					}),
					metadataEvidence: expect.objectContaining({
						collectorProgress: expect.objectContaining({
							phase: "detail-inventory",
							event: "failed",
							attachmentCursor: expect.objectContaining({
								nextConversationIndex: 1,
							}),
						}),
					}),
				}),
			}),
		);
	});

	test("fails fast when the collector detects the wrong ChatGPT identity", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			metadataCollector: {
				collect: vi.fn(async () => {
					throw new AccountMirrorIdentityMismatchError(
						"chatgpt",
						"ecochran76@gmail.com",
						"wrong@example.com",
					);
				}),
			},
			persistence: createNoopPersistence(),
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		await expect(
			service.requestRefresh({
				provider: "chatgpt",
				runtimeProfileId: "default",
				explicitRefresh: true,
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			code: "account_mirror_identity_mismatch",
		} satisfies Partial<AccountMirrorRefreshError>);
		expect(
			registry.readStatus({
				provider: "chatgpt",
				runtimeProfileId: "default",
				explicitRefresh: true,
			}).entries[0],
		).toMatchObject({
			detectedIdentityKey: "wrong@example.com",
			status: "blocked",
			reason: "identity-mismatch",
			identityEvidence: expect.objectContaining({
				source: "provider-app",
				confidence: "authoritative",
				recheckable: false,
				repairStatus: "current_mismatch_confirmed",
			}),
		});
	});

	test("records provider guard state when the collector hits a Google sorry gate", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});
		const gateError = Object.assign(new Error("Manual clearance required."), {
			details: {
				url: "https://www.google.com/sorry/index",
				blockingState: {
					kind: "google-sorry",
					summary: "Google unusual-traffic interstitial detected (google.com/sorry).",
					requiresHuman: true,
				},
			},
		});
		const service = createAccountMirrorRefreshService({
			config,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			metadataCollector: {
				collect: vi.fn(async () => {
					throw gateError;
				}),
			},
			persistence: createNoopPersistence(),
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		await expect(
			service.requestRefresh({
				provider: "chatgpt",
				runtimeProfileId: "default",
				explicitRefresh: true,
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			code: "account_mirror_provider_guard",
			details: {
				provider: "chatgpt",
				runtimeProfileId: "default",
				providerGuard: expect.objectContaining({
					state: "manual_clear_required",
					kind: "google-sorry",
				}),
			},
		} satisfies Partial<AccountMirrorRefreshError>);
		expect(
			registry.readStatus({
				provider: "chatgpt",
				runtimeProfileId: "default",
				explicitRefresh: true,
			}).entries[0],
		).toMatchObject({
			status: "blocked",
			reason: "provider-manual-clear-required",
			providerGuard: expect.objectContaining({
				state: "manual_clear_required",
				kind: "google-sorry",
				detectedAt: "2026-04-29T12:00:00.000Z",
				url: "https://www.google.com/sorry/index",
			}),
		});
	});

	test("stops Gemini refresh before the collector when target census finds an account gate", async () => {
		const geminiConfig = {
			...config,
			runtimeProfiles: {
				...config.runtimeProfiles,
				default: {
					...config.runtimeProfiles.default,
					defaultService: "gemini",
					services: {
						...config.runtimeProfiles.default.services,
						gemini: {
							identity: {
								email: "gemini-user@example.com",
								accountLevel: "Google",
							},
							conversations: [{ id: "gemini_conv_1" }],
						},
					},
				},
			},
		};
		const registry = createAccountMirrorStatusRegistry({
			config: geminiConfig,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});
		const metadataCollector = {
			collect: vi.fn(async () => {
				throw new Error("collector should not run");
			}),
		};
		const providerGuardCensus = vi.fn(async () => ({
			state: "manual_clear_required" as const,
			kind: "account-auth" as const,
			summary: "Google account chooser or sign-in gate detected.",
			detectedAtMs: Date.parse("2026-04-29T12:00:00.000Z"),
			url: "https://accounts.google.com/signin/v2/identifier",
			action: "account-mirror-refresh:target-census",
		}));
		const service = createAccountMirrorRefreshService({
			config: geminiConfig,
			registry,
			dispatcher: createBrowserOperationDispatcher({
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			metadataCollector,
			providerGuardCensus,
			persistence: createNoopPersistence(),
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		await expect(
			service.requestRefresh({
				provider: "gemini",
				runtimeProfileId: "default",
				explicitRefresh: true,
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			code: "account_mirror_provider_guard",
			details: {
				provider: "gemini",
				runtimeProfileId: "default",
				providerGuard: expect.objectContaining({
					state: "manual_clear_required",
					kind: "account-auth",
					url: "https://accounts.google.com/signin/v2/identifier",
					action: "account-mirror-refresh:target-census",
				}),
			},
		} satisfies Partial<AccountMirrorRefreshError>);
		expect(providerGuardCensus).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "default",
				browserProfileId: "default",
			}),
		);
		expect(metadataCollector.collect).not.toHaveBeenCalled();
		expect(
			registry.readStatus({
				provider: "gemini",
				runtimeProfileId: "default",
				explicitRefresh: true,
			}).entries[0],
		).toMatchObject({
			status: "blocked",
			reason: "provider-manual-clear-required",
			providerGuard: expect.objectContaining({
				state: "manual_clear_required",
				kind: "account-auth",
				action: "account-mirror-refresh:target-census",
			}),
		});
	});
});
