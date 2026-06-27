import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { createCacheStore } from "../src/browser/llmService/cache/store.js";
import type { ProviderCacheContext } from "../src/browser/providers/cache.js";
import type { RunArchiveItem, RunArchiveService } from "../src/runtime/archiveService.js";
import {
	createHistoryMaterializationService,
	formatHistoryMaterializationFailureReason,
	type HistoryAccountLibraryListInput,
	type HistoryAccountLibraryMaterializeInput,
	type HistoryMaterializationJob,
	type HistoryMaterializationJobStore,
	type HistoryMaterializationResult,
	type HistoryMaterializationSnapshotRefresh,
	type HistoryMediaGenerationMaterializeInput,
	type HistoryProjectSourcesMaterializeInput,
	resolveHistoryMaterializationProviderListOptions,
} from "../src/runtime/historyMaterializationService.js";

describe("history materialization service", () => {
	afterEach(() => {
		setAuracallHomeDirOverrideForTest(null);
	});

	it("classifies Gemini bare app fallback as a non-routeable conversation id", () => {
		const reason = formatHistoryMaterializationFailureReason({
			target: {
				provider: "gemini",
				runtimeProfile: "auracall-gemini-pro",
				browserProfile: null,
				boundIdentityKey: "ecochran76@gmail.com",
				conversationId: "deleted_conv",
				providerConversationUrl: "https://gemini.google.com/app/deleted_conv",
				projectId: null,
			},
			error: new Error(
				"Gemini conversation content not found for deleted_conv. " +
					'activeState={"href":"https://gemini.google.com/app","title":"Google Gemini","pathname":"/app","conversationId":null,"bodyTextLength":395}',
			),
		});

		expect(reason).toContain("conversation-not-found-or-unavailable");
		expect(reason).toContain("conversation=deleted_conv");
		expect(reason).toContain("runtimeProfile=auracall-gemini-pro");
		expect(reason).toContain("identity=ecochran76@gmail.com");
		expect(reason).toContain("deleted/non-existent in the tenant");
		expect(reason).toContain("activeState=");
	});

	it("keeps non-root Gemini content failures as raw provider errors", () => {
		const message =
			"Gemini conversation content not found for slow_conv. " +
			'activeState={"href":"https://gemini.google.com/app/slow_conv","title":"Google Gemini","pathname":"/app/slow_conv","conversationId":"slow_conv","bodyTextLength":12}';
		const reason = formatHistoryMaterializationFailureReason({
			target: {
				provider: "gemini",
				runtimeProfile: "auracall-gemini-pro",
				browserProfile: null,
				boundIdentityKey: null,
				conversationId: "slow_conv",
				providerConversationUrl: "https://gemini.google.com/app/slow_conv",
				projectId: null,
			},
			error: new Error(message),
		});

		expect(reason).toBe(message);
	});

	it("uses the Gemini rail surface for history materialization browser targeting", () => {
		expect(
			resolveHistoryMaterializationProviderListOptions({
				provider: "gemini",
				runtimeProfile: "default",
				browserProfile: "default",
				boundIdentityKey: "user@example.com",
				conversationId: "10b7e2a15e2dd77c",
				providerConversationUrl: "https://gemini.google.com/app/10b7e2a15e2dd77c",
				projectId: null,
			}),
		).toEqual({
			configuredUrl: "https://gemini.google.com/app",
			tabUrl: "https://gemini.google.com/app/10b7e2a15e2dd77c",
			projectId: undefined,
			allowNavigation: true,
			expectedUserIdentity: { email: "user@example.com" },
			skipFeatureSignature: true,
		});

		expect(
			resolveHistoryMaterializationProviderListOptions({
				provider: "gemini",
				runtimeProfile: "default",
				browserProfile: "default",
				boundIdentityKey: "user@example.com",
				conversationId: "project_conv",
				providerConversationUrl: "https://gemini.google.com/app/project_conv",
				projectId: "project-one",
			}),
		).toEqual({
			configuredUrl: "https://gemini.google.com/gem/project-one",
			tabUrl: "https://gemini.google.com/app/project_conv",
			projectId: "project-one",
			allowNavigation: true,
			expectedUserIdentity: { email: "user@example.com" },
			skipFeatureSignature: true,
		});

		const chatgptOptions = resolveHistoryMaterializationProviderListOptions({
			provider: "chatgpt",
			runtimeProfile: "default",
			browserProfile: "default",
			boundIdentityKey: "user@example.com",
			conversationId: "conv_direct_1",
			providerConversationUrl: "https://chatgpt.com/c/conv_direct_1",
			projectId: null,
		});
		expect(chatgptOptions.configuredUrl).toBe("https://chatgpt.com/c/conv_direct_1");
		expect(chatgptOptions.skipFeatureSignature).toBe(true);
	});

	it("persists and runs a direct conversation materialization job", async () => {
		const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-history-materialize-job-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const materializeConversation = vi.fn(
			async (target, _request, jobId): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-22T18:01:00.000Z",
				status: "materialized",
				target,
				source: { type: "conversation", provider: "chatgpt", conversationId: "conv_1" },
				manifestPaths: ["/tmp/artifact-fetch-manifest.json"],
				entries: [
					{
						kind: "artifact",
						providerId: "artifact_1",
						title: "readout.json",
						status: "materialized",
						localPath: "/tmp/readout.json",
						remoteUrl: null,
						cacheKey: null,
						checksumSha256: null,
						mimeType: "application/json",
						size: 12,
						materializationMethod: "download-button",
						reason: "eligible" as const,
						archiveItemId: "history-generated-artifact:chatgpt:default:conv_1:artifact_1",
						assetRoute: "/v1/archive/items/b64/a/asset",
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: `History materialization job ${jobId} materialized one asset.`,
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			generateId: () => "hmj_test_1",
			now: sequenceNow([
				"2026-05-22T18:00:00.000Z",
				"2026-05-22T18:00:01.000Z",
				"2026-05-22T18:00:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		const created = await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			conversationId: "conv_1",
			assetKinds: ["artifacts"],
		});
		const duplicate = await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			conversationId: "conv_1",
			assetKinds: ["artifacts"],
		});

		expect(created).toMatchObject({
			object: "history_materialization_job_create_result",
			reused: false,
			job: {
				id: "hmj_test_1",
				status: "queued",
				source: {
					type: "conversation",
					provider: "chatgpt",
					conversationId: "conv_1",
				},
			},
		});
		expect(duplicate.reused).toBe(true);
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		const completed = await service.readJob("hmj_test_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			attemptCount: 1,
			result: {
				status: "materialized",
				metrics: {
					materialized: 1,
				},
			},
		});
		expect(materializeConversation).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfile: "default",
				conversationId: "conv_1",
			}),
			expect.objectContaining({
				assetKinds: ["artifacts"],
			}),
			"hmj_test_1",
		);
	});

	it("persists and runs a ChatGPT project source materialization job", async () => {
		const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-project-source-job-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const proofPath = path.join(homeDir, "project-proof.md");
		await fs.writeFile(proofPath, "project source proof", "utf8");
		const manifestPath = path.join(homeDir, "project-file-fetch-manifest.json");
		await fs.writeFile(
			manifestPath,
			JSON.stringify({
				provider: "chatgpt",
				projectId: "g-p-source",
				generatedAt: "2026-06-07T10:00:01.000Z",
				fileCount: 2,
				materializedCount: 1,
				entries: [
					{
						fileId: "file_project_1",
						fileName: "project-proof.md",
						status: "materialized",
						localPath: proofPath,
						remoteUrl: "chatgpt://file/file_project_1",
						mimeType: "text/markdown",
						size: 20,
						materializationMethod: "chatgpt-project-source-provider-file",
					},
					{
						fileId: "visible-row.pdf",
						fileName: "visible-row.pdf",
						status: "error",
						error: "project_source_download_unsupported",
						materializationMethod: "chatgpt-project-source-row",
					},
				],
			}),
			"utf8",
		);
		let scheduled: (() => Promise<void>) | undefined;
		const archiveItem = {
			id: "history-file:chatgpt:user_example.com:project:g-p-source:file_project_1",
			object: "run_archive_item",
			kind: "upload",
			source: "account_mirror",
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			browserProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			providerConversationId: "project:g-p-source",
			providerConversationUrl: "https://chatgpt.com/g/g-p-source/project",
			projectId: "g-p-source",
			artifactId: "file_project_1",
			title: "project-proof.md",
			fileName: "project-proof.md",
			mimeType: "text/markdown",
			localPath: proofPath,
			uri: "chatgpt://file/file_project_1",
			checksumSha256: "project-checksum",
			cacheKey: "sha256:project-checksum",
			fileAvailable: true,
			metadata: {
				providerFileId: "file_project_1",
				materialization: {
					status: "materialized",
					source: "history-materialization",
					method: "chatgpt-project-source-provider-file",
				},
			},
			links: {
				asset: "/v1/archive/items/b64/project-source/asset",
			},
		} as unknown as RunArchiveItem;
		const upsertHistoryMaterializationItems = vi.fn(async () => ({
			object: "run_archive_history_materialization_upsert" as const,
			generatedAt: "2026-06-07T10:00:02.000Z",
			index: { updatedAt: "2026-06-07T10:00:02.000Z", itemCount: 1 },
			metrics: {
				byKind: {
					response: 0,
					response_batch: 0,
					team_run: 0,
					media_generation: 0,
					upload: 1,
					generated_artifact: 0,
					provider_conversation: 0,
					evidence: 0,
				},
			},
			items: [archiveItem],
		}));
		const materializeProjectSources = vi.fn(
			async (input: HistoryProjectSourcesMaterializeInput) => ({
				projectFiles: [
					{
						id: "file_project_1",
						name: "project-proof.md",
						provider: "chatgpt" as const,
						source: "project" as const,
						remoteUrl: "chatgpt://file/file_project_1",
					},
					{
						id: "visible-row.pdf",
						name: "visible-row.pdf",
						provider: "chatgpt" as const,
						source: "project" as const,
					},
				],
				files: [
					{
						id: "file_project_1",
						name: "project-proof.md",
						provider: "chatgpt" as const,
						source: "project" as const,
						localPath: proofPath,
						remoteUrl: "chatgpt://file/file_project_1",
						mimeType: "text/markdown",
						size: 20,
						checksumSha256: "project-checksum",
					},
				],
				manifestPath,
				jobId: input.jobId,
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			runArchiveService: {
				listItems: vi.fn(async () => ({ items: [archiveItem] })),
				upsertHistoryMaterializationItems,
			} as unknown as RunArchiveService,
			generateId: () => "hmj_project_sources_1",
			now: sequenceNow([
				"2026-06-07T10:00:00.000Z",
				"2026-06-07T10:00:01.000Z",
				"2026-06-07T10:00:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeProjectSources,
		});

		const created = await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			browserProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			projectId: "g-p-source",
			assetKinds: ["files"],
			maxItems: 2,
		});
		expect(created).toMatchObject({
			reused: false,
			job: {
				id: "hmj_project_sources_1",
				source: {
					type: "project_sources",
					provider: "chatgpt",
					projectId: "g-p-source",
				},
			},
		});
		if (!scheduled) throw new Error("Expected project source job to be scheduled.");
		await scheduled();

		expect(materializeProjectSources).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfile: "wsl-chrome-3",
				browserProfile: "wsl-chrome-3",
				boundIdentityKey: "user@example.com",
				projectId: "g-p-source",
				jobId: "hmj_project_sources_1",
				maxItems: 2,
			}),
		);
		expect(upsertHistoryMaterializationItems).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				projectId: "g-p-source",
				providerConversationId: "project:g-p-source",
				providerConversationUrl: "https://chatgpt.com/g/g-p-source/project",
				assets: [
					expect.objectContaining({
						kind: "file",
						artifactId: "file_project_1",
						materializationMethod: "chatgpt-project-source-provider-file",
					}),
				],
			}),
		);
		await expect(service.readJob("hmj_project_sources_1")).resolves.toMatchObject({
			status: "succeeded",
			source: {
				type: "project_sources",
				provider: "chatgpt",
				projectId: "g-p-source",
			},
			result: {
				status: "materialized",
				target: {
					provider: "chatgpt",
					conversationId: "project:g-p-source",
					providerConversationUrl: "https://chatgpt.com/g/g-p-source/project",
					projectId: "g-p-source",
				},
				metrics: {
					conversations: 1,
					materialized: 1,
					failed: 1,
				},
				entries: [
					{
						kind: "file",
						providerId: "file_project_1",
						status: "materialized",
						archiveItemId:
							"history-file:chatgpt:user_example.com:project:g-p-source:file_project_1",
						assetRoute: "/v1/archive/items/b64/project-source/asset",
					},
					{
						kind: "file",
						providerId: "visible-row.pdf",
						status: "failed",
						reason: "project_source_download_unsupported",
					},
				],
			},
		});
	});

	it("materializes a selected ChatGPT account-library file catalog item with archive links", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-account-library-materialize-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		const proofPath = path.join(homeDir, "library-proof.pdf");
		await fs.writeFile(proofPath, "%PDF-1.7 selected account-library proof", "utf8");
		const manifestPath = path.join(homeDir, "account-file-fetch-manifest.json");
		await fs.writeFile(
			manifestPath,
			JSON.stringify({
				provider: "chatgpt",
				generatedAt: "2026-06-01T18:00:01.000Z",
				fileCount: 1,
				materializedCount: 1,
				entries: [
					{
						fileId: "library-file-1",
						fileName: "library-proof.pdf",
						status: "materialized",
						localPath: proofPath,
						remoteUrl: "chatgpt://file/file_library_1",
						mimeType: "application/pdf",
						size: 37,
						materializationMethod: "chatgpt-library-file-row-click",
					},
				],
			}),
			"utf8",
		);
		let scheduled: (() => Promise<void>) | undefined;
		const catalogItem = {
			id: "library-file-1",
			name: "library-proof.pdf",
			provider: "chatgpt",
			source: "account",
			remoteUrl: "chatgpt://file/file_library_1",
			mimeType: "application/pdf",
			metadata: {
				source: "chatgpt-library",
				providerFileId: "file_library_1",
				materializationSurface: "chatgpt-library-file-row-click",
			},
		};
		const materializeAccountLibraryFiles = vi.fn(
			async (input: HistoryAccountLibraryMaterializeInput) => ({
				accountFiles: [input.file],
				files: [
					{
						...input.file,
						localPath: proofPath,
						size: 37,
						checksumSha256: "account-library-checksum",
					},
				],
				manifestPath,
			}),
		);
		const archiveItem = {
			id: "history-file:chatgpt:user_example.com:account-library:library-file-1",
			object: "run_archive_item",
			kind: "upload",
			source: "account_mirror",
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			browserProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			providerConversationId: "account-library",
			providerConversationUrl: "https://chatgpt.com/library",
			artifactId: "library-file-1",
			title: "library-proof.pdf",
			fileName: "library-proof.pdf",
			mimeType: "application/pdf",
			localPath: proofPath,
			uri: "chatgpt://file/file_library_1",
			checksumSha256: "account-library-checksum",
			cacheKey: "sha256:account-library-checksum",
			fileAvailable: true,
			metadata: {
				source: "chatgpt-library",
				providerFileId: "file_library_1",
				materialization: {
					status: "materialized",
					source: "history-materialization",
					method: "chatgpt-library-file-row-click",
				},
			},
			links: {
				asset: "/v1/archive/items/b64/account-library/asset",
			},
		} as unknown as RunArchiveItem;
		const upsertHistoryMaterializationItems = vi.fn(async () => ({
			object: "run_archive_history_materialization_upsert" as const,
			generatedAt: "2026-06-01T18:00:02.000Z",
			index: { updatedAt: "2026-06-01T18:00:02.000Z", itemCount: 1 },
			metrics: {
				byKind: {
					response: 0,
					response_batch: 0,
					team_run: 0,
					media_generation: 0,
					upload: 1,
					generated_artifact: 0,
					provider_conversation: 0,
					evidence: 0,
				},
			},
			items: [archiveItem],
		}));
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(async () => ({
					object: "account_mirror_catalog" as const,
					generatedAt: "2026-06-01T18:00:00.000Z",
					kind: "files" as const,
					limit: 50,
					entries: [
						{
							provider: "chatgpt" as const,
							runtimeProfileId: "wsl-chrome-3",
							browserProfileId: "wsl-chrome-3",
							boundIdentityKey: "user@example.com",
							status: "eligible" as const,
							reason: "eligible" as const,
							mirrorCompleteness: {
								state: "complete" as const,
								summary: "Cached account-library metadata is complete.",
								remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
								signals: {
									projectsTruncated: false,
									conversationsTruncated: false,
									attachmentInventoryTruncated: false,
									attachmentCursorPresent: false,
								},
							},
							manifests: {
								projects: [],
								conversations: [],
								artifacts: [],
								files: [catalogItem],
								media: [],
							},
							counts: {
								projects: 0,
								conversations: 0,
								artifacts: 0,
								files: 1,
								media: 0,
							},
						},
					],
					metrics: {
						targets: 1,
						projects: 0,
						conversations: 0,
						artifacts: 0,
						files: 1,
						media: 0,
					},
				})),
				readItem: vi.fn(async () => ({
					object: "account_mirror_catalog_item" as const,
					generatedAt: "2026-06-01T18:00:00.000Z",
					provider: "chatgpt" as const,
					runtimeProfileId: "wsl-chrome-3",
					browserProfileId: "wsl-chrome-3",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					kind: "files" as const,
					itemId: "library-file-1",
					item: catalogItem,
				})),
			},
			runArchiveService: {
				listItems: vi.fn(async () => ({ items: [archiveItem] })),
				upsertHistoryMaterializationItems,
			} as unknown as RunArchiveService,
			generateId: () => "hmj_account_library_1",
			now: sequenceNow([
				"2026-06-01T18:00:00.000Z",
				"2026-06-01T18:00:01.000Z",
				"2026-06-01T18:00:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeAccountLibraryFiles,
		});

		await expect(
			service.previewAccountLibraryReconciliation?.({
				provider: "chatgpt",
				runtimeProfile: "wsl-chrome-3",
				reconcile: true,
				assetSource: "account-library",
				assetKinds: ["files"],
				maxItems: 1,
			}),
		).resolves.toMatchObject({
			object: "history_account_library_reconciliation_preview",
			metrics: {
				catalogFiles: 1,
				eligibleCandidates: 0,
				selectedCandidates: 0,
				archivedFamilies: 1,
				unresolvedStale: 0,
				unsupportedOrTerminal: 0,
			},
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			catalogItemId: "library-file-1",
			catalogKind: "files",
			assetKinds: ["files"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected account-library job to be scheduled.");
		await scheduled();

		expect(materializeAccountLibraryFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfile: "wsl-chrome-3",
				catalogItemId: "library-file-1",
				file: expect.objectContaining({
					id: "library-file-1",
					remoteUrl: "chatgpt://file/file_library_1",
				}),
			}),
		);
		expect(upsertHistoryMaterializationItems).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				providerConversationId: "account-library",
				providerConversationUrl: "https://chatgpt.com/library",
				assets: [
					expect.objectContaining({
						kind: "file",
						artifactId: "library-file-1",
						materializationMethod: "chatgpt-library-file-row-click",
					}),
				],
			}),
		);
		await expect(service.readJob("hmj_account_library_1")).resolves.toMatchObject({
			status: "succeeded",
			source: {
				type: "catalog_item",
				catalogItemId: "library-file-1",
				catalogKind: "files",
			},
			result: {
				target: null,
				metrics: {
					conversations: 0,
					materialized: 1,
				},
				entries: [
					{
						kind: "file",
						providerId: "library-file-1",
						status: "materialized",
						archiveItemId: "history-file:chatgpt:user_example.com:account-library:library-file-1",
						assetRoute: "/v1/archive/items/b64/account-library/asset",
					},
				],
			},
		});
	});

	it("accepts stale ChatGPT account-library file catalog items without provider file ids for selected resolution", async () => {
		let scheduled: (() => Promise<void>) | undefined;
		const materializeAccountLibraryFiles = vi.fn(
			async (_input: HistoryAccountLibraryMaterializeInput) => ({
				accountFiles: [],
				files: [],
				manifestPath: null,
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(async () => ({
					object: "account_mirror_catalog" as const,
					generatedAt: "2026-06-01T18:05:00.000Z",
					kind: "files" as const,
					limit: 50,
					entries: [
						{
							provider: "chatgpt" as const,
							runtimeProfileId: "wsl-chrome-3",
							browserProfileId: "wsl-chrome-3",
							boundIdentityKey: "user@example.com",
							status: "eligible" as const,
							reason: "eligible" as const,
							mirrorCompleteness: {
								state: "complete" as const,
								summary: "Cached account-library metadata is complete.",
								remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
								signals: {
									projectsTruncated: false,
									conversationsTruncated: false,
									attachmentInventoryTruncated: false,
									attachmentCursorPresent: false,
								},
							},
							manifests: {
								projects: [],
								conversations: [],
								artifacts: [],
								files: [
									{
										id: "stale-library-file-1",
										name: "GreenKey report.pdfGreenKey report.pdf",
										provider: "chatgpt",
										source: "account",
										metadata: {
											source: "chatgpt-library",
											artifactId: "chatgpt-library:stale-library-file-1",
											artifactKind: "download",
										},
									},
								],
								media: [],
							},
							counts: {
								projects: 0,
								conversations: 0,
								artifacts: 0,
								files: 1,
								media: 0,
							},
						},
					],
					metrics: {
						targets: 1,
						projects: 0,
						conversations: 0,
						artifacts: 0,
						files: 1,
						media: 0,
					},
				})),
				readItem: vi.fn(async () => ({
					object: "account_mirror_catalog_item" as const,
					generatedAt: "2026-06-01T18:05:00.000Z",
					provider: "chatgpt" as const,
					runtimeProfileId: "wsl-chrome-3",
					browserProfileId: "wsl-chrome-3",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					kind: "files" as const,
					itemId: "stale-library-file-1",
					item: {
						id: "stale-library-file-1",
						name: "GreenKey report.pdfGreenKey report.pdf",
						provider: "chatgpt",
						source: "account",
						metadata: {
							source: "chatgpt-library",
							libraryIdentity: "greenkey report.pdfgreenkey report.pdf",
							artifactId: "chatgpt-library:stale-library-file-1",
							artifactKind: "download",
						},
					},
				})),
			},
			runArchiveService: {
				listItems: vi.fn(async () => ({ items: [] })),
				upsertHistoryMaterializationItems: vi.fn(),
			} as unknown as RunArchiveService,
			generateId: () => "hmj_account_library_stale_1",
			now: sequenceNow(["2026-06-01T18:05:00.000Z", "2026-06-01T18:05:01.000Z"]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeAccountLibraryFiles,
			listAccountLibraryFiles: vi.fn(async () => []),
		});

		await expect(
			service.previewAccountLibraryReconciliation?.({
				provider: "chatgpt",
				runtimeProfile: "wsl-chrome-3",
				reconcile: true,
				assetSource: "account-library",
				assetKinds: ["files"],
				maxItems: 1,
			}),
		).resolves.toMatchObject({
			object: "history_account_library_reconciliation_preview",
			metrics: {
				catalogFiles: 1,
				eligibleCandidates: 0,
				selectedCandidates: 0,
				archivedFamilies: 0,
				unresolvedStale: 1,
				unsupportedOrTerminal: 0,
			},
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			catalogItemId: "stale-library-file-1",
			catalogKind: "files",
			assetKinds: ["files"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected stale account-library job to be scheduled.");
		await scheduled();

		expect(materializeAccountLibraryFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				catalogItemId: "stale-library-file-1",
				file: expect.objectContaining({
					id: "stale-library-file-1",
					name: "GreenKey report.pdfGreenKey report.pdf",
					metadata: expect.objectContaining({
						source: "chatgpt-library",
						accountLibraryCatalogItemId: "stale-library-file-1",
					}),
				}),
			}),
		);
	});

	it("previews routeable ChatGPT account-library files from delayed cached catalog targets", async () => {
		const routeableFile = {
			id: "routeable-library-file-1",
			name: "routeable-library.pdf",
			provider: "chatgpt",
			source: "account",
			remoteUrl: "chatgpt://file/file_routeable_library_1",
			mimeType: "application/pdf",
			metadata: {
				source: "chatgpt-library",
				providerFileId: "file_routeable_library_1",
				materializationSurface: "chatgpt-library-file-row-click",
			},
		};
		const listAccountLibraryFiles = vi.fn();
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(async () => ({
					object: "account_mirror_catalog" as const,
					generatedAt: "2026-06-02T02:10:00.000Z",
					kind: "files" as const,
					limit: 50,
					entries: [
						{
							provider: "chatgpt" as const,
							runtimeProfileId: "wsl-chrome-3",
							browserProfileId: "wsl-chrome-3",
							boundIdentityKey: "user@example.com",
							status: "delayed" as const,
							reason: "minimum-interval" as const,
							mirrorCompleteness: {
								state: "complete" as const,
								summary: "Cached account-library metadata is complete.",
								remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
								signals: {
									projectsTruncated: false,
									conversationsTruncated: false,
									attachmentInventoryTruncated: false,
									attachmentCursorPresent: false,
								},
							},
							manifests: {
								projects: [],
								conversations: [],
								artifacts: [],
								files: [routeableFile],
								media: [],
							},
							counts: {
								projects: 0,
								conversations: 0,
								artifacts: 0,
								files: 1,
								media: 0,
							},
						},
					],
					metrics: {
						targets: 1,
						projects: 0,
						conversations: 0,
						artifacts: 0,
						files: 1,
						media: 0,
					},
				})),
				readItem: vi.fn(),
			},
			runArchiveService: {
				listItems: vi.fn(async () => ({
					object: "run_archive_list" as const,
					generatedAt: "2026-06-02T02:10:00.000Z",
					items: [],
					metrics: { total: 0, returned: 0 },
				})),
				upsertHistoryMaterializationItems: vi.fn(),
			} as unknown as RunArchiveService,
			generateId: () => "hmj_account_library_delayed_preview",
			now: () => new Date("2026-06-02T02:10:00.000Z"),
			materializeAccountLibraryFiles: vi.fn(),
			listAccountLibraryFiles,
		});

		await expect(
			service.previewAccountLibraryReconciliation?.({
				provider: "chatgpt",
				runtimeProfile: "wsl-chrome-3",
				reconcile: true,
				assetSource: "account-library",
				assetKinds: ["files"],
				maxItems: 1,
			}),
		).resolves.toMatchObject({
			object: "history_account_library_reconciliation_preview",
			metrics: {
				catalogFiles: 1,
				eligibleCandidates: 1,
				selectedCandidates: 1,
				archivedFamilies: 0,
				unresolvedStale: 0,
				unsupportedOrTerminal: 0,
			},
		});
		expect(listAccountLibraryFiles).not.toHaveBeenCalled();
	});

	it("reconciles capped ChatGPT account-library file rows with archive links", async () => {
		const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-account-library-reconcile-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const proofPath = path.join(homeDir, "library-proof.pdf");
		const manifestPath = path.join(homeDir, "account-files-manifest.json");
		await fs.writeFile(proofPath, "%PDF-1.7 account-library reconcile proof", "utf8");
		await fs.writeFile(
			manifestPath,
			JSON.stringify({
				entries: [
					{
						fileId: "file_reconcile_1",
						fileName: "library-reconcile.pdf",
						status: "materialized",
						localPath: proofPath,
						remoteUrl: "chatgpt://file/file_reconcile_1",
						mimeType: "application/pdf",
						size: 42,
						materializationMethod: "chatgpt-library-file-row-click",
					},
				],
			}),
			"utf8",
		);
		let scheduled: (() => Promise<void>) | undefined;
		const catalogFile = {
			id: "file_reconcile_1",
			name: "library-reconcile.pdf",
			provider: "chatgpt",
			source: "account",
			remoteUrl: "chatgpt://file/file_reconcile_1",
			mimeType: "application/pdf",
			size: 42,
			metadata: {
				source: "chatgpt-library",
				providerFileId: "file_reconcile_1",
				materializationSurface: "chatgpt-library-file-row-click",
			},
		};
		const completeMirror = {
			state: "complete" as const,
			summary: "Mirrored metadata indexes are complete within current provider surfaces.",
			remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
			signals: {
				projectsTruncated: false,
				conversationsTruncated: false,
				attachmentInventoryTruncated: false,
				attachmentCursorPresent: false,
			},
		};
		const materializeAccountLibraryFiles = vi.fn(
			async (input: HistoryAccountLibraryMaterializeInput) => ({
				accountFiles: [input.file],
				files: [
					{
						...input.file,
						id: "file_reconcile_1",
						localPath: proofPath,
						size: 42,
						checksumSha256: "account-library-reconcile-checksum",
					},
				],
				manifestPath,
			}),
		);
		const archiveItem = {
			id: "history-file:chatgpt:user_example.com:account-library:file_reconcile_1",
			object: "run_archive_item",
			kind: "upload",
			source: "account_mirror",
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			browserProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			providerConversationId: "account-library",
			providerConversationUrl: "https://chatgpt.com/library",
			artifactId: "file_reconcile_1",
			title: "library-reconcile.pdf",
			fileName: "library-reconcile.pdf",
			mimeType: "application/pdf",
			localPath: proofPath,
			uri: "chatgpt://file/file_reconcile_1",
			checksumSha256: "account-library-reconcile-checksum",
			cacheKey: "sha256:account-library-reconcile-checksum",
			fileAvailable: true,
			metadata: {
				source: "chatgpt-library",
				providerFileId: "file_reconcile_1",
			},
			links: {
				asset: "/v1/archive/items/b64/account-library-reconcile/asset",
			},
		} as unknown as RunArchiveItem;
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(async () => ({
					object: "account_mirror_catalog" as const,
					generatedAt: "2026-06-01T19:00:00.000Z",
					kind: "files" as const,
					limit: 50,
					entries: [
						{
							provider: "chatgpt" as const,
							runtimeProfileId: "wsl-chrome-3",
							browserProfileId: "wsl-chrome-3",
							boundIdentityKey: "user@example.com",
							status: "eligible" as const,
							reason: "eligible" as const,
							mirrorCompleteness: completeMirror,
							manifests: {
								projects: [],
								conversations: [],
								artifacts: [],
								files: [catalogFile],
								media: [],
							},
							counts: {
								projects: 0,
								conversations: 0,
								artifacts: 0,
								files: 1,
								media: 0,
							},
						},
					],
					metrics: {
						targets: 1,
						projects: 0,
						conversations: 0,
						artifacts: 0,
						files: 1,
						media: 0,
					},
				})),
				readItem: vi.fn(),
			},
			runArchiveService: {
				listItems: vi.fn(async () => ({
					object: "run_archive_list" as const,
					generatedAt: "2026-06-01T19:00:00.000Z",
					items: [],
					metrics: { total: 0, returned: 0 },
				})),
				upsertHistoryMaterializationItems: vi.fn(async () => ({
					object: "run_archive_history_materialization_upsert" as const,
					generatedAt: "2026-06-01T19:00:02.000Z",
					index: { updatedAt: "2026-06-01T19:00:02.000Z", itemCount: 1 },
					metrics: {
						byKind: {
							response: 0,
							response_batch: 0,
							team_run: 0,
							media_generation: 0,
							upload: 1,
							generated_artifact: 0,
							provider_conversation: 0,
							evidence: 0,
						},
					},
					items: [archiveItem],
				})),
			} as unknown as RunArchiveService,
			generateId: () => "hmj_account_library_reconcile_1",
			now: sequenceNow([
				"2026-06-01T19:00:00.000Z",
				"2026-06-01T19:00:01.000Z",
				"2026-06-01T19:00:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeAccountLibraryFiles,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			reconcile: true,
			assetSource: "account-library",
			assetKinds: ["files"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected account-library reconciliation job to be scheduled.");
		await scheduled();

		expect(materializeAccountLibraryFiles).toHaveBeenCalledTimes(1);
		await expect(service.readJob("hmj_account_library_reconcile_1")).resolves.toMatchObject({
			status: "succeeded",
			source: {
				type: "account_library_reconciliation",
				provider: "chatgpt",
			},
			result: {
				metrics: {
					conversations: 0,
					materialized: 1,
				},
				entries: [
					{
						kind: "file",
						providerId: "file_reconcile_1",
						status: "materialized",
						archiveItemId: "history-file:chatgpt:user_example.com:account-library:file_reconcile_1",
						assetRoute: "/v1/archive/items/b64/account-library-reconcile/asset",
					},
				],
			},
		});
	});

	it("skips archived ChatGPT account-library file families before spending reconciliation budget", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-account-library-reconcile-skip-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const materializeAccountLibraryFiles = vi.fn(
			async (_input: HistoryAccountLibraryMaterializeInput) => ({
				accountFiles: [],
				files: [],
				manifestPath: null,
			}),
		);
		const completeMirror = {
			state: "complete" as const,
			summary: "Mirrored metadata indexes are complete within current provider surfaces.",
			remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
			signals: {
				projectsTruncated: false,
				conversationsTruncated: false,
				attachmentInventoryTruncated: false,
				attachmentCursorPresent: false,
			},
		};
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(async () => ({
					object: "account_mirror_catalog" as const,
					generatedAt: "2026-06-01T19:05:00.000Z",
					kind: "files" as const,
					limit: 50,
					entries: [
						{
							provider: "chatgpt" as const,
							runtimeProfileId: "wsl-chrome-3",
							browserProfileId: "wsl-chrome-3",
							boundIdentityKey: "user@example.com",
							status: "eligible" as const,
							reason: "eligible" as const,
							mirrorCompleteness: completeMirror,
							manifests: {
								projects: [],
								conversations: [],
								artifacts: [],
								files: [
									{
										id: "file_archived_1",
										name: "already-archived.pdf",
										provider: "chatgpt",
										source: "account",
										remoteUrl: "chatgpt://file/file_archived_1",
										metadata: {
											source: "chatgpt-library",
											providerFileId: "file_archived_1",
										},
									},
								],
								media: [],
							},
							counts: {
								projects: 0,
								conversations: 0,
								artifacts: 0,
								files: 1,
								media: 0,
							},
						},
					],
					metrics: {
						targets: 1,
						projects: 0,
						conversations: 0,
						artifacts: 0,
						files: 1,
						media: 0,
					},
				})),
				readItem: vi.fn(),
			},
			runArchiveService: {
				listItems: vi.fn(async () => ({
					object: "run_archive_list" as const,
					generatedAt: "2026-06-01T19:05:00.000Z",
					items: [
						{
							id: "history-file:chatgpt:user_example.com:account-library:file_archived_1",
							object: "run_archive_item",
							kind: "upload",
							source: "account_mirror",
							provider: "chatgpt",
							runtimeProfile: "wsl-chrome-3",
							boundIdentityKey: "user@example.com",
							providerConversationId: "account-library",
							artifactId: "file_archived_1",
							title: "already-archived.pdf",
							fileName: "already-archived.pdf",
							fileAvailable: true,
							metadata: {
								source: "chatgpt-library",
								providerFileId: "file_archived_1",
							},
							links: {
								asset: "/v1/archive/items/b64/already-archived/asset",
							},
						},
					] as unknown as RunArchiveItem[],
					metrics: { total: 1, returned: 1 },
				})),
				upsertHistoryMaterializationItems: vi.fn(),
			} as unknown as RunArchiveService,
			generateId: () => "hmj_account_library_reconcile_skip_1",
			now: sequenceNow(["2026-06-01T19:05:00.000Z", "2026-06-01T19:05:01.000Z"]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeAccountLibraryFiles,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			reconcile: true,
			assetSource: "account-library",
			assetKinds: ["files"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected account-library reconciliation job to be scheduled.");
		await scheduled();

		expect(materializeAccountLibraryFiles).not.toHaveBeenCalled();
		await expect(service.readJob("hmj_account_library_reconcile_skip_1")).resolves.toMatchObject({
			status: "skipped",
			source: {
				type: "account_library_reconciliation",
				provider: "chatgpt",
			},
			result: {
				metrics: {
					materialized: 0,
					skipped: 0,
					failed: 0,
				},
				message: "Account-library reconciliation did not find downloadable files to materialize.",
			},
		});
	});

	it("resolves stale ChatGPT account-library file rows from current inventory during broad reconciliation", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-account-library-reconcile-stale-resolve-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		const manifestPath = path.join(homeDir, "account-library-files-manifest.json");
		const proofPath = path.join(homeDir, "resolved-library-file.pdf");
		await fs.writeFile(proofPath, "%PDF-1.7 resolved account-library proof", "utf8");
		await fs.writeFile(
			manifestPath,
			JSON.stringify(
				{
					entries: [
						{
							fileId: "file_resolved_1",
							fileName: "stale-library-file.pdf",
							status: "materialized",
							localPath: proofPath,
							remoteUrl: "chatgpt://file/file_resolved_1",
							checksumSha256: "resolved-account-library-checksum",
							mimeType: "application/pdf",
							size: 43,
							materializationMethod: "chatgpt-library-file-row-click",
						},
					],
				},
				null,
				2,
			),
		);
		let scheduled: (() => Promise<void>) | undefined;
		const listAccountLibraryFiles = vi.fn(async (_input: HistoryAccountLibraryListInput) => [
			{
				id: "file_resolved_1",
				name: "stale-library-file.pdf",
				provider: "chatgpt" as const,
				source: "account" as const,
				remoteUrl: "chatgpt://file/file_resolved_1",
				metadata: {
					source: "chatgpt-library",
					providerFileId: "file_resolved_1",
					libraryIdentity: "stale-library-file.pdf",
				},
			},
		]);
		const materializeAccountLibraryFiles = vi.fn(
			async (input: HistoryAccountLibraryMaterializeInput) => ({
				accountFiles: [input.file],
				files: [
					{
						...input.file,
						localPath: proofPath,
						size: 43,
						checksumSha256: "resolved-account-library-checksum",
					},
				],
				manifestPath,
			}),
		);
		const archiveItem = {
			id: "history-file:chatgpt:user_example.com:account-library:file_resolved_1",
			object: "run_archive_item",
			kind: "upload",
			source: "account_mirror",
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			browserProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			providerConversationId: "account-library",
			providerConversationUrl: "https://chatgpt.com/library",
			artifactId: "file_resolved_1",
			title: "stale-library-file.pdf",
			fileName: "stale-library-file.pdf",
			mimeType: "application/pdf",
			localPath: proofPath,
			uri: "chatgpt://file/file_resolved_1",
			checksumSha256: "resolved-account-library-checksum",
			cacheKey: "sha256:resolved-account-library-checksum",
			fileAvailable: true,
			metadata: {
				source: "chatgpt-library",
				providerFileId: "file_resolved_1",
			},
			links: {
				asset: "/v1/archive/items/b64/account-library-resolved/asset",
			},
		} as unknown as RunArchiveItem;
		const completeMirror = {
			state: "complete" as const,
			summary: "Mirrored metadata indexes are complete within current provider surfaces.",
			remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
			signals: {
				projectsTruncated: false,
				conversationsTruncated: false,
				attachmentInventoryTruncated: false,
				attachmentCursorPresent: false,
			},
		};
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(async () => ({
					object: "account_mirror_catalog" as const,
					generatedAt: "2026-06-01T19:07:00.000Z",
					kind: "files" as const,
					limit: 50,
					entries: [
						{
							provider: "chatgpt" as const,
							runtimeProfileId: "wsl-chrome-3",
							browserProfileId: "wsl-chrome-3",
							boundIdentityKey: "user@example.com",
							status: "eligible" as const,
							reason: "eligible" as const,
							mirrorCompleteness: completeMirror,
							manifests: {
								projects: [],
								conversations: [],
								artifacts: [],
								files: [
									{
										id: "stale-library-file-1",
										name: "stale-library-file.pdf",
										provider: "chatgpt",
										source: "account",
										metadata: {
											source: "chatgpt-library",
											libraryIdentity: "stale-library-file.pdf",
										},
									},
								],
								media: [],
							},
							counts: {
								projects: 0,
								conversations: 0,
								artifacts: 0,
								files: 1,
								media: 0,
							},
						},
					],
					metrics: {
						targets: 1,
						projects: 0,
						conversations: 0,
						artifacts: 0,
						files: 1,
						media: 0,
					},
				})),
				readItem: vi.fn(),
			},
			runArchiveService: {
				listItems: vi.fn(async () => ({
					object: "run_archive_list" as const,
					generatedAt: "2026-06-01T19:07:00.000Z",
					items: [],
					metrics: { total: 0, returned: 0 },
				})),
				upsertHistoryMaterializationItems: vi.fn(async () => ({
					object: "run_archive_history_materialization_upsert" as const,
					generatedAt: "2026-06-01T19:07:02.000Z",
					index: { updatedAt: "2026-06-01T19:07:02.000Z", itemCount: 1 },
					metrics: {
						byKind: {
							response: 0,
							response_batch: 0,
							team_run: 0,
							media_generation: 0,
							upload: 1,
							generated_artifact: 0,
							provider_conversation: 0,
							evidence: 0,
						},
					},
					items: [archiveItem],
				})),
			} as unknown as RunArchiveService,
			generateId: () => "hmj_account_library_reconcile_stale_resolve_1",
			now: sequenceNow([
				"2026-06-01T19:07:00.000Z",
				"2026-06-01T19:07:01.000Z",
				"2026-06-01T19:07:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			listAccountLibraryFiles,
			materializeAccountLibraryFiles,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			reconcile: true,
			assetSource: "account-library",
			assetKinds: ["files"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected account-library reconciliation job to be scheduled.");
		await scheduled();

		expect(listAccountLibraryFiles).toHaveBeenCalledTimes(1);
		expect(materializeAccountLibraryFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				catalogItemId: "stale-library-file-1",
				file: expect.objectContaining({
					id: "file_resolved_1",
					remoteUrl: "chatgpt://file/file_resolved_1",
					metadata: expect.objectContaining({
						accountLibraryCatalogFileId: "stale-library-file-1",
					}),
				}),
			}),
		);
		await expect(
			service.readJob("hmj_account_library_reconcile_stale_resolve_1"),
		).resolves.toMatchObject({
			status: "succeeded",
			result: {
				metrics: {
					materialized: 1,
				},
				entries: [
					{
						kind: "file",
						providerId: "file_resolved_1",
						status: "materialized",
					},
				],
			},
		});
	});

	it("skips stale unresolved ChatGPT account-library file rows during broad reconciliation", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-account-library-reconcile-stale-skip-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const materializeAccountLibraryFiles = vi.fn();
		const listAccountLibraryFiles = vi.fn(async (_input: HistoryAccountLibraryListInput) => []);
		const completeMirror = {
			state: "complete" as const,
			summary: "Mirrored metadata indexes are complete within current provider surfaces.",
			remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
			signals: {
				projectsTruncated: false,
				conversationsTruncated: false,
				attachmentInventoryTruncated: false,
				attachmentCursorPresent: false,
			},
		};
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(async () => ({
					object: "account_mirror_catalog" as const,
					generatedAt: "2026-06-01T19:08:00.000Z",
					kind: "files" as const,
					limit: 50,
					entries: [
						{
							provider: "chatgpt" as const,
							runtimeProfileId: "wsl-chrome-3",
							browserProfileId: "wsl-chrome-3",
							boundIdentityKey: "user@example.com",
							status: "eligible" as const,
							reason: "eligible" as const,
							mirrorCompleteness: completeMirror,
							manifests: {
								projects: [],
								conversations: [],
								artifacts: [],
								files: [
									{
										id: "stale-library-file-1",
										name: "stale-library-file.pdf",
										provider: "chatgpt",
										source: "account",
										metadata: {
											source: "chatgpt-library",
											libraryIdentity: "stale-library-file.pdf",
										},
									},
								],
								media: [],
							},
							counts: {
								projects: 0,
								conversations: 0,
								artifacts: 0,
								files: 1,
								media: 0,
							},
						},
					],
					metrics: {
						targets: 1,
						projects: 0,
						conversations: 0,
						artifacts: 0,
						files: 1,
						media: 0,
					},
				})),
				readItem: vi.fn(),
			},
			runArchiveService: {
				listItems: vi.fn(async () => ({
					object: "run_archive_list" as const,
					generatedAt: "2026-06-01T19:08:00.000Z",
					items: [],
					metrics: { total: 0, returned: 0 },
				})),
				upsertHistoryMaterializationItems: vi.fn(),
			} as unknown as RunArchiveService,
			generateId: () => "hmj_account_library_reconcile_stale_skip_1",
			now: sequenceNow(["2026-06-01T19:08:00.000Z", "2026-06-01T19:08:01.000Z"]),
			schedule: (work) => {
				scheduled = work;
			},
			listAccountLibraryFiles,
			materializeAccountLibraryFiles,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			reconcile: true,
			assetSource: "account-library",
			assetKinds: ["files"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected account-library reconciliation job to be scheduled.");
		await scheduled();

		expect(listAccountLibraryFiles).toHaveBeenCalledTimes(1);
		expect(materializeAccountLibraryFiles).not.toHaveBeenCalled();
		await expect(
			service.readJob("hmj_account_library_reconcile_stale_skip_1"),
		).resolves.toMatchObject({
			status: "skipped",
			result: {
				metrics: {
					materialized: 0,
				},
				message: "Account-library reconciliation did not find downloadable files to materialize.",
			},
		});
	});

	it("rejects account-library source without an explicit ChatGPT reconciliation request", async () => {
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			runArchiveService: {
				listItems: vi.fn(),
				upsertHistoryMaterializationItems: vi.fn(),
			} as unknown as RunArchiveService,
			schedule: () => undefined,
		});

		await expect(
			service.createJob({
				provider: "gemini",
				reconcile: true,
				assetSource: "account-library",
				assetKinds: ["files"],
				maxItems: 1,
			}),
		).rejects.toThrow("Account-library reconciliation requires provider=chatgpt.");
		await expect(
			service.createJob({
				provider: "chatgpt",
				assetSource: "account-library",
				assetKinds: ["files"],
				maxItems: 1,
			}),
		).rejects.toThrow("Account-library source is only supported with reconcile=true.");
	});

	it("re-dispatches a persisted queued duplicate instead of leaving it stuck queued", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-redispatch-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		const store = createInMemoryHistoryMaterializationJobStore([]);
		const request = {
			provider: "chatgpt" as const,
			runtimeProfile: "default",
			conversationId: "conv_redispatch_1",
			assetKinds: ["artifacts" as const],
		};
		const firstService = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			store,
			generateId: () => "hmj_redispatch_1",
			now: sequenceNow(["2026-05-22T18:01:00.000Z"]),
			schedule: () => undefined,
			materializeConversation: vi.fn(),
		});

		const first = await firstService.createJob(request);
		expect(first.reused).toBe(false);
		await expect(firstService.readJob("hmj_redispatch_1")).resolves.toMatchObject({
			status: "queued",
			attemptCount: 0,
		});

		let scheduled: (() => Promise<void>) | undefined;
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-22T18:01:03.000Z",
				status: "materialized",
				target,
				source: { type: "conversation", provider: "chatgpt", conversationId: "conv_redispatch_1" },
				manifestPaths: ["/tmp/redispatch-manifest.json"],
				entries: [
					{
						kind: "artifact",
						providerId: "artifact_redispatch_1",
						title: "redispatch.json",
						status: "materialized",
						localPath: "/tmp/redispatch.json",
						remoteUrl: null,
						cacheKey: null,
						checksumSha256: null,
						mimeType: "application/json",
						size: 2,
						materializationMethod: "download-button",
						reason: null,
						archiveItemId:
							"history-generated-artifact:chatgpt:default:conv_redispatch_1:artifact_redispatch_1",
						assetRoute: "/v1/archive/items/b64/redispatch/asset",
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "History materialization redispatched one queued asset.",
			}),
		);
		const secondService = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			store,
			now: sequenceNow([
				"2026-05-22T18:01:01.000Z",
				"2026-05-22T18:01:02.000Z",
				"2026-05-22T18:01:04.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		const duplicate = await secondService.createJob(request);
		expect(duplicate.reused).toBe(true);
		expect(duplicate.reuseReason).toBe("active sourceKey is already queued");
		expect(duplicate.job.status).toBe("queued");
		expect(duplicate.job.scheduler).toMatchObject({
			state: "queued",
			dispatchState: "scheduled",
			queuedAgeMs: 2_000,
			stale: false,
		});
		if (!scheduled) throw new Error("Expected persisted queued job to be re-dispatched.");
		await scheduled();

		await expect(secondService.readJob("hmj_redispatch_1")).resolves.toMatchObject({
			status: "succeeded",
			attemptCount: 1,
			result: {
				metrics: {
					materialized: 1,
				},
			},
		});
		expect(materializeConversation).toHaveBeenCalledTimes(1);
	});

	it("refreshes a provider conversation snapshot before direct materialization when requested", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-refresh-snapshot-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const snapshotRefresh: HistoryMaterializationSnapshotRefresh = {
			object: "history_materialization_snapshot_refresh",
			generatedAt: "2026-05-22T18:02:00.000Z",
			status: "refreshed",
			target: {
				provider: "chatgpt",
				runtimeProfile: "default",
				browserProfile: null,
				boundIdentityKey: null,
				conversationId: "conv_refresh_1",
				providerConversationUrl: "https://chatgpt.com/c/conv_refresh_1",
				projectId: null,
			},
			routeabilityState: "routeable",
			messageCount: 4,
			fileCount: 0,
			sourceCount: 0,
			artifactCount: 1,
			error: null,
			message: "Conversation snapshot refreshed.",
		};
		const refreshConversationSnapshot = vi.fn(async () => snapshotRefresh);
		const recordConversationEvidence = vi.fn(async () => undefined);
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-22T18:02:01.000Z",
				status: "materialized",
				target,
				source: { type: "conversation", provider: "chatgpt", conversationId: "conv_refresh_1" },
				manifestPaths: ["/tmp/conv_refresh_1/artifact-fetch-manifest.json"],
				entries: [
					{
						kind: "artifact",
						providerId: "artifact_refresh_1",
						title: "fresh-export.json",
						status: "materialized",
						localPath: "/tmp/fresh-export.json",
						remoteUrl: null,
						cacheKey: null,
						checksumSha256: null,
						mimeType: "application/json",
						size: 22,
						materializationMethod: "download-button",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Downloaded one fresh asset.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			generateId: () => "hmj_refresh_snapshot_1",
			now: sequenceNow([
				"2026-05-22T18:02:00.000Z",
				"2026-05-22T18:02:01.000Z",
				"2026-05-22T18:02:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			refreshConversationSnapshot,
			recordConversationEvidence,
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			conversationId: "conv_refresh_1",
			refreshSnapshot: true,
			assetKinds: ["artifacts"],
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(refreshConversationSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ conversationId: "conv_refresh_1" }),
			expect.objectContaining({ refreshSnapshot: true }),
			"hmj_refresh_snapshot_1",
		);
		expect(materializeConversation).toHaveBeenCalledWith(
			expect.objectContaining({ conversationId: "conv_refresh_1" }),
			expect.objectContaining({ refreshSnapshot: true }),
			"hmj_refresh_snapshot_1",
		);
		expect(refreshConversationSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
			materializeConversation.mock.invocationCallOrder[0],
		);
		expect(recordConversationEvidence).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ conversationId: "conv_refresh_1" }),
			expect.objectContaining({
				detailObservedAt: "2026-05-22T18:02:00.000Z",
				manifestObservedAt: "2026-05-22T18:02:00.000Z",
				routeabilityObservedAt: "2026-05-22T18:02:00.000Z",
				routeabilityState: "routeable",
				artifactCount: 1,
			}),
		);
		expect(recordConversationEvidence).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ conversationId: "conv_refresh_1" }),
			expect.objectContaining({
				manifestObservedAt: "2026-05-22T18:02:01.000Z",
				materializedAt: "2026-05-22T18:02:01.000Z",
				assetCompleteness: "complete",
			}),
		);
		const completed = await service.readJob("hmj_refresh_snapshot_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			result: {
				phases: {
					snapshotRefresh: {
						status: "refreshed",
						routeabilityState: "routeable",
						artifactCount: 1,
					},
					materialization: {
						status: "materialized",
						entries: 1,
					},
				},
				snapshotRefreshes: [
					{
						status: "refreshed",
						messageCount: 4,
					},
				],
			},
		});
	});

	it("records terminal snapshot refresh evidence without running materialization", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-refresh-terminal-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const refreshConversationSnapshot = vi.fn(async () => {
			throw new Error(
				"Gemini conversation content not found for deleted_conv. " +
					'activeState={"href":"https://gemini.google.com/app","title":"Google Gemini","pathname":"/app","conversationId":null,"bodyTextLength":395}',
			);
		});
		const recordConversationEvidence = vi.fn(async () => undefined);
		const materializeConversation = vi.fn();
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			generateId: () => "hmj_refresh_snapshot_terminal_1",
			now: sequenceNow([
				"2026-05-22T18:03:00.000Z",
				"2026-05-22T18:03:01.000Z",
				"2026-05-22T18:03:02.000Z",
				"2026-05-22T18:03:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			refreshConversationSnapshot,
			recordConversationEvidence,
			materializeConversation,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "auracall-gemini-pro",
			boundIdentityKey: "ecochran76@gmail.com",
			conversationId: "deleted_conv",
			refreshSnapshot: true,
			assetKinds: ["media"],
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation).not.toHaveBeenCalled();
		expect(recordConversationEvidence).toHaveBeenCalledWith(
			expect.objectContaining({ conversationId: "deleted_conv" }),
			expect.objectContaining({
				routeabilityObservedAt: "2026-05-22T18:03:03.000Z",
				routeabilityState: "not_found_or_unavailable",
				routeabilityReason: expect.stringContaining("conversation-not-found-or-unavailable"),
			}),
		);
		const completed = await service.readJob("hmj_refresh_snapshot_terminal_1");
		expect(completed).toMatchObject({
			status: "skipped",
			result: {
				status: "skipped",
				phases: {
					snapshotRefresh: {
						status: "failed",
						routeabilityState: "not_found_or_unavailable",
					},
					materialization: null,
				},
				entries: [
					{
						kind: "media",
						status: "failed",
						reason: expect.stringContaining("conversation-not-found-or-unavailable"),
					},
				],
				metrics: {
					materialized: 0,
					failed: 1,
				},
			},
		});
	});

	it("upserts direct provider conversation evidence when the mirror row is missing", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-direct-upsert-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const refreshConversationSnapshot = vi.fn(
			async (target): Promise<HistoryMaterializationSnapshotRefresh> => ({
				object: "history_materialization_snapshot_refresh",
				generatedAt: "2026-05-23T17:00:00.000Z",
				status: "refreshed",
				target,
				routeabilityState: "routeable",
				messageCount: 3,
				fileCount: 0,
				sourceCount: 0,
				artifactCount: 1,
				error: null,
				message: "Conversation snapshot refreshed.",
			}),
		);
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-23T17:00:01.000Z",
				status: "skipped",
				target,
				source: { type: "conversation", provider: "chatgpt", conversationId: "conv_direct_1" },
				manifestPaths: [],
				entries: [],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 0, skipped: 1, failed: 0 },
				message: "No downloadable assets.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {
				browser: {
					cache: {
						store: "dual",
					},
				},
			},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			generateId: () => "hmj_direct_upsert_1",
			now: sequenceNow([
				"2026-05-23T17:00:00.000Z",
				"2026-05-23T17:00:01.000Z",
				"2026-05-23T17:00:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			refreshConversationSnapshot,
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			boundIdentityKey: "user@example.com",
			conversationId: "conv_direct_1",
			providerConversationUrl: "https://chatgpt.com/c/conv_direct_1",
			refreshSnapshot: true,
			assetKinds: ["artifacts"],
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		const context: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "user@example.com",
		};
		await expect(createCacheStore("dual").readConversations(context)).resolves.toMatchObject({
			items: [
				{
					id: "conv_direct_1",
					title: "conv_direct_1",
					provider: "chatgpt",
					url: "https://chatgpt.com/c/conv_direct_1",
					metadata: {
						detailObservedAt: "2026-05-23T17:00:00.000Z",
						manifestObservedAt: "2026-05-23T17:00:01.000Z",
						routeabilityObservedAt: "2026-05-23T17:00:00.000Z",
						routeabilityState: "routeable",
						messageCount: 3,
						artifactCount: 1,
					},
				},
			],
		});
	});

	it("classifies provider human-verification guards as retry-clearance failures", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-provider-guard-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const refreshConversationSnapshot = vi.fn(async () => {
			throw new Error("Gemini provider human-verification challenge requires manual clearance.");
		});
		const materializeConversation = vi.fn();
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			generateId: () => "hmj_provider_guard_1",
			now: sequenceNow([
				"2026-05-23T17:10:00.000Z",
				"2026-05-23T17:10:01.000Z",
				"2026-05-23T17:10:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			refreshConversationSnapshot,
			materializeConversation,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "auracall-gemini-pro",
			boundIdentityKey: "user@example.com",
			conversationId: "conv_guarded",
			refreshSnapshot: true,
			assetKinds: ["media"],
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation).not.toHaveBeenCalled();
		const completed = await service.readJob("hmj_provider_guard_1");
		expect(completed).toMatchObject({
			status: "failed",
			result: null,
			error: {
				type: "provider_guard_required",
				statusCode: 409,
				message: expect.stringContaining("human-verification"),
			},
		});
	});

	it("does not reuse active jobs across different browser profiles or conversation URLs", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-dedupe-selectors-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			generateId: sequenceId(["hmj_selector_1", "hmj_selector_2", "hmj_selector_3"]),
			now: sequenceNow([
				"2026-05-22T18:01:00.000Z",
				"2026-05-22T18:01:01.000Z",
				"2026-05-22T18:01:02.000Z",
				"2026-05-22T18:01:03.000Z",
			]),
			schedule: () => undefined,
			materializeConversation: vi.fn(),
		});

		const base = await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			browserProfile: "wsl-chrome-1",
			conversationId: "conv_selector_1",
			providerConversationUrl: "https://chatgpt.com/c/conv_selector_1",
			assetKinds: ["artifacts"],
		});
		const sameSelector = await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			browserProfile: "wsl-chrome-1",
			conversationId: "conv_selector_1",
			providerConversationUrl: "https://chatgpt.com/c/conv_selector_1",
			assetKinds: ["artifacts"],
		});
		const differentBrowserProfile = await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			browserProfile: "wsl-chrome-2",
			conversationId: "conv_selector_1",
			providerConversationUrl: "https://chatgpt.com/c/conv_selector_1",
			assetKinds: ["artifacts"],
		});
		const differentConversationUrl = await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			browserProfile: "wsl-chrome-1",
			conversationId: "conv_selector_1",
			providerConversationUrl: "https://chatgpt.com/g/g-project/c/conv_selector_1",
			assetKinds: ["artifacts"],
		});

		expect(base.reused).toBe(false);
		expect(sameSelector).toMatchObject({
			reused: true,
			job: {
				id: "hmj_selector_1",
			},
		});
		expect(differentBrowserProfile).toMatchObject({
			reused: false,
			job: {
				id: "hmj_selector_2",
				request: {
					browserProfile: "wsl-chrome-2",
				},
			},
		});
		expect(differentConversationUrl).toMatchObject({
			reused: false,
			job: {
				id: "hmj_selector_3",
				request: {
					providerConversationUrl: "https://chatgpt.com/g/g-project/c/conv_selector_1",
				},
			},
		});
		const active = await service.listJobs({ status: "active" });
		expect(active.metrics.total).toBe(3);
	});

	it("cancels queued jobs before provider work starts", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-cancel-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const materializeConversation = vi.fn();
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			generateId: () => "hmj_cancel_1",
			now: sequenceNow(["2026-05-22T18:02:00.000Z", "2026-05-22T18:02:01.000Z"]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			conversationId: "conv_cancel_1",
			assetKinds: ["artifacts"],
		});
		const cancelled = await service.cancelJob("hmj_cancel_1");
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();
		const rerun = await service.runJob("hmj_cancel_1");
		const listed = await service.listJobs({ status: "cancelled" });

		expect(cancelled).toMatchObject({
			status: "cancelled",
			startedAt: null,
			completedAt: "2026-05-22T18:02:01.000Z",
			attemptCount: 0,
			message: "History materialization job cancelled before provider work started.",
		});
		expect(rerun.status).toBe("cancelled");
		expect(materializeConversation).not.toHaveBeenCalled();
		expect(listed).toMatchObject({
			status: "cancelled",
			metrics: {
				total: 1,
				byStatus: {
					cancelled: 1,
				},
				active: 0,
				terminal: 1,
			},
		});
	});

	it("rejects cancellation after provider work starts", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-cancel-running-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let releaseMaterializer: (() => void) | undefined;
		const materializerStarted = new Promise<void>((resolveStarted) => {
			releaseMaterializer = resolveStarted;
		});
		let finishMaterializer: (() => void) | undefined;
		const materializerFinished = new Promise<void>((resolveFinished) => {
			finishMaterializer = resolveFinished;
		});
		const materializeConversation = vi.fn(
			async (target, _request, jobId): Promise<HistoryMaterializationResult> => {
				releaseMaterializer?.();
				await materializerFinished;
				return {
					object: "history_materialization_result",
					generatedAt: "2026-05-22T18:04:03.000Z",
					status: "materialized",
					target,
					source: { type: "conversation", provider: "chatgpt", conversationId: "conv_running_1" },
					manifestPaths: [],
					entries: [],
					archiveItems: [],
					metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 0 },
					message: `History materialization job ${jobId} materialized zero assets.`,
				};
			},
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			generateId: () => "hmj_running_1",
			now: sequenceNow([
				"2026-05-22T18:04:00.000Z",
				"2026-05-22T18:04:01.000Z",
				"2026-05-22T18:04:02.000Z",
				"2026-05-22T18:04:03.000Z",
			]),
			schedule: () => undefined,
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			conversationId: "conv_running_1",
			assetKinds: ["artifacts"],
		});
		const run = service.runJob("hmj_running_1");
		await materializerStarted;

		await expect(service.cancelJob("hmj_running_1")).rejects.toThrow(
			"only queued jobs can be cancelled before provider work starts",
		);
		finishMaterializer?.();
		const completed = await run;

		expect(completed).toMatchObject({
			status: "succeeded",
			attemptCount: 1,
		});
		expect(materializeConversation).toHaveBeenCalledTimes(1);
	});

	it("keeps provider work running until it resolves instead of timing out into zombie materialization", async () => {
		const store = createInMemoryHistoryMaterializationJobStore([
			buildHistoryMaterializationJob({ id: "hmj_no_zombie_1", status: "queued" }),
		]);
		let finishMaterializer: (() => void) | undefined;
		const materializerFinished = new Promise<void>((resolveFinished) => {
			finishMaterializer = resolveFinished;
		});
		const materializeConversation = vi.fn(
			async (target, _request, jobId): Promise<HistoryMaterializationResult> => {
				await materializerFinished;
				return {
					object: "history_materialization_result",
					generatedAt: "2026-05-22T18:05:02.000Z",
					status: "materialized",
					target,
					source: { type: "conversation", provider: "chatgpt", conversationId: "conv_no_zombie_1" },
					manifestPaths: ["/tmp/no-zombie-manifest.json"],
					entries: [
						{
							kind: "artifact",
							providerId: "artifact_no_zombie_1",
							title: "no-zombie.md",
							status: "materialized",
							localPath: "/tmp/no-zombie.md",
							remoteUrl: null,
							cacheKey: null,
							checksumSha256: "abc123",
							mimeType: "text/markdown",
							size: 12,
							materializationMethod: "download-button",
							reason: null,
							archiveItemId:
								"history-generated-artifact:chatgpt:default:conv_no_zombie_1:artifact_no_zombie_1",
							assetRoute: "/v1/archive/items/b64/no-zombie/asset",
						},
					],
					archiveItems: [],
					metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
					message: `History materialization job ${jobId} completed after provider work settled.`,
				};
			},
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			store,
			now: sequenceNow([
				"2026-05-22T18:05:00.000Z",
				"2026-05-22T18:05:01.000Z",
				"2026-05-22T18:05:02.000Z",
			]),
			schedule: () => undefined,
			materializeConversation,
		});

		const run = service.runJob("hmj_no_zombie_1");
		await Promise.resolve();
		await Promise.resolve();
		expect(materializeConversation).toHaveBeenCalledTimes(1);
		await expect(service.readJob("hmj_no_zombie_1")).resolves.toMatchObject({
			status: "running",
			result: null,
			error: null,
		});

		finishMaterializer?.();
		const completed = await run;

		expect(completed).toMatchObject({
			status: "succeeded",
			completedAt: "2026-05-22T18:05:02.000Z",
			result: {
				metrics: {
					conversations: 1,
					materialized: 1,
				},
			},
			error: null,
		});
	});

	it("re-dispatches queued jobs and marks running jobs failed during startup recovery", async () => {
		const store = createInMemoryHistoryMaterializationJobStore([
			buildHistoryMaterializationJob({ id: "hmj_recover_queued", status: "queued" }),
			buildHistoryMaterializationJob({ id: "hmj_recover_running", status: "running" }),
			buildHistoryMaterializationJob({ id: "hmj_recover_succeeded", status: "succeeded" }),
			buildHistoryMaterializationJob({ id: "hmj_recover_cancelled", status: "cancelled" }),
		]);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			store,
			now: sequenceNow(["2026-05-22T18:06:00.000Z", "2026-05-22T18:06:01.000Z"]),
			schedule: () => undefined,
			materializeConversation: vi.fn(),
		});

		const recovered = await service.recoverInterruptedJobs();
		const queued = await service.readJob("hmj_recover_queued");
		const running = await service.readJob("hmj_recover_running");
		const succeeded = await service.readJob("hmj_recover_succeeded");
		const cancelled = await service.readJob("hmj_recover_cancelled");
		const active = await service.listJobs({ status: "active" });
		const terminal = await service.listJobs({ status: "terminal" });

		expect(recovered).toBe(2);
		expect(queued).toMatchObject({
			status: "queued",
			updatedAt: "2026-05-22T18:06:00.000Z",
			completedAt: null,
			error: null,
			message:
				"History materialization job was recovered and re-queued after AuraCall API startup.",
		});
		expect(running).toMatchObject({
			status: "failed",
			completedAt: "2026-05-22T18:06:01.000Z",
			error: {
				message:
					"History materialization job was interrupted before this AuraCall API process started.",
				type: "internal_error",
				statusCode: 500,
			},
		});
		expect(succeeded?.status).toBe("succeeded");
		expect(cancelled?.status).toBe("cancelled");
		expect(active.metrics).toMatchObject({
			total: 1,
			byStatus: {
				queued: 1,
			},
			active: 1,
			terminal: 0,
		});
		expect(terminal.metrics).toMatchObject({
			total: 3,
			byStatus: {
				failed: 1,
				succeeded: 1,
				cancelled: 1,
			},
			active: 0,
			terminal: 3,
		});
	});

	it("marks stale running account-library reconciliation jobs failed on readback", async () => {
		const store = createInMemoryHistoryMaterializationJobStore([
			buildHistoryMaterializationJob({
				id: "hmj_account_library_timeout",
				status: "running",
				source: {
					type: "account_library_reconciliation",
					provider: "chatgpt",
				},
				request: {
					provider: "chatgpt",
					runtimeProfile: "default",
					reconcile: true,
					assetSource: "account-library",
					assetKinds: ["files"],
					maxItems: 1,
					providerWorkTimeoutMs: 1_000,
				},
				startedAt: "2026-06-02T12:00:00.000Z",
				updatedAt: "2026-06-02T12:00:00.000Z",
				completedAt: null,
			}),
		]);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			store,
			now: sequenceNow(["2026-06-02T12:00:02.000Z"]),
			schedule: () => undefined,
			materializeConversation: vi.fn(),
		});

		await expect(service.readJob("hmj_account_library_timeout")).resolves.toMatchObject({
			status: "failed",
			completedAt: "2026-06-02T12:00:02.000Z",
			error: {
				message: "Account-library materialization job exceeded provider-work timeout (1000ms).",
				type: "internal_error",
				statusCode: 500,
			},
		});
		await expect(service.listJobs({ status: "active" })).resolves.toMatchObject({
			metrics: {
				active: 0,
			},
		});
	});

	it("marks stale running ordinary reconciliation jobs failed on readback", async () => {
		const store = createInMemoryHistoryMaterializationJobStore([
			buildHistoryMaterializationJob({
				id: "hmj_reconciliation_timeout",
				status: "running",
				source: {
					type: "reconciliation",
					provider: "chatgpt",
				},
				request: {
					provider: "chatgpt",
					runtimeProfile: "wsl-chrome-3",
					reconcile: true,
					assetKinds: ["artifacts", "files", "media"],
					maxItems: 3,
					refreshSnapshot: true,
				},
				startedAt: "2026-06-02T12:00:00.000Z",
				updatedAt: "2026-06-02T12:00:00.000Z",
				completedAt: null,
			}),
		]);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			store,
			now: sequenceNow(["2026-06-02T12:31:00.000Z"]),
			schedule: () => undefined,
			materializeConversation: vi.fn(),
		});

		await expect(service.readJob("hmj_reconciliation_timeout")).resolves.toMatchObject({
			status: "failed",
			completedAt: "2026-06-02T12:31:00.000Z",
			error: {
				message: "History materialization job exceeded running stale threshold (1800000ms).",
				type: "internal_error",
				statusCode: 500,
			},
			scheduler: {
				state: "failed",
				dispatchState: "terminal",
				stale: false,
			},
		});
		await expect(service.listJobs({ status: "active" })).resolves.toMatchObject({
			metrics: {
				active: 0,
			},
		});
	});

	it("detaches stale in-process provider work so later queued jobs can run", async () => {
		const store = createInMemoryHistoryMaterializationJobStore([]);
		const scheduled: Array<() => Promise<void>> = [];
		let finishFirstProviderWork: (() => void) | undefined;
		const firstProviderWorkFinished = new Promise<void>((resolve) => {
			finishFirstProviderWork = resolve;
		});
		const materializeConversation = vi.fn(
			async (target, _request, jobId): Promise<HistoryMaterializationResult> => {
				if (jobId === "hmj_stale_queue_1") {
					await firstProviderWorkFinished;
					return {
						object: "history_materialization_result",
						generatedAt: "2026-06-02T12:00:04.000Z",
						status: "materialized",
						target,
						source: {
							type: "conversation",
							provider: "chatgpt",
							conversationId: "conv_stale_queue_1",
						},
						manifestPaths: [],
						entries: [],
						archiveItems: [],
						metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 0 },
						message: "Late provider work completed after stale recovery.",
					};
				}
				return {
					object: "history_materialization_result",
					generatedAt: "2026-06-02T12:00:03.000Z",
					status: "materialized",
					target,
					source: {
						type: "conversation",
						provider: "chatgpt",
						conversationId: "conv_stale_queue_2",
					},
					manifestPaths: ["/tmp/stale-queue-2.json"],
					entries: [
						{
							kind: "artifact",
							providerId: "artifact_stale_queue_2",
							title: "stale-queue-2.json",
							status: "materialized",
							localPath: "/tmp/stale-queue-2.json",
							remoteUrl: null,
							cacheKey: null,
							checksumSha256: null,
							mimeType: "application/json",
							size: 2,
							materializationMethod: "download-button",
							reason: null,
							archiveItemId: null,
							assetRoute: null,
						},
					],
					archiveItems: [],
					metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
					message: "Second provider job ran after stale queue recovery.",
				};
			},
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			store,
			generateId: sequenceId(["hmj_stale_queue_1", "hmj_stale_queue_2"]),
			now: sequenceNow([
				"2026-06-02T12:00:00.000Z",
				"2026-06-02T12:00:00.000Z",
				"2026-06-02T12:00:00.000Z",
				"2026-06-02T12:00:02.000Z",
				"2026-06-02T12:00:02.000Z",
				"2026-06-02T12:00:03.000Z",
				"2026-06-02T12:00:03.000Z",
				"2026-06-02T12:00:04.000Z",
			]),
			schedule: (work) => {
				scheduled.push(work);
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			conversationId: "conv_stale_queue_1",
			assetKinds: ["artifacts"],
			providerWorkTimeoutMs: 1_000,
		});
		const firstRun = scheduled[0]?.();
		await vi.waitFor(() => {
			expect(materializeConversation).toHaveBeenCalledTimes(1);
		});

		await expect(service.readJob("hmj_stale_queue_1")).resolves.toMatchObject({
			status: "failed",
			message: "History materialization job exceeded running stale threshold (1000ms).",
			scheduler: {
				dispatchState: "terminal",
			},
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			conversationId: "conv_stale_queue_2",
			assetKinds: ["artifacts"],
		});
		await scheduled[1]?.();

		expect(materializeConversation).toHaveBeenCalledTimes(2);
		await expect(service.readJob("hmj_stale_queue_2")).resolves.toMatchObject({
			status: "succeeded",
			result: {
				message: "Second provider job ran after stale queue recovery.",
			},
		});

		finishFirstProviderWork?.();
		await firstRun;
		await expect(service.readJob("hmj_stale_queue_1")).resolves.toMatchObject({
			status: "failed",
			message: "History materialization job exceeded running stale threshold (1000ms).",
			result: null,
		});
	});

	it("classifies stale queued account-library jobs without marking them terminal", async () => {
		const store = createInMemoryHistoryMaterializationJobStore([
			buildHistoryMaterializationJob({
				id: "hmj_account_library_stale_queued",
				status: "queued",
				source: {
					type: "account_library_reconciliation",
					provider: "chatgpt",
				},
				request: {
					provider: "chatgpt",
					runtimeProfile: "default",
					reconcile: true,
					assetSource: "account-library",
					assetKinds: ["files"],
					maxItems: 1,
					providerWorkTimeoutMs: 1_000,
				},
				createdAt: "2026-06-02T12:00:00.000Z",
				updatedAt: "2026-06-02T12:00:00.000Z",
				startedAt: null,
				completedAt: null,
			}),
		]);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			store,
			now: sequenceNow(["2026-06-02T12:00:02.000Z", "2026-06-02T12:00:03.000Z"]),
			schedule: () => undefined,
			materializeConversation: vi.fn(),
		});

		await expect(service.readJob("hmj_account_library_stale_queued")).resolves.toMatchObject({
			status: "queued",
			completedAt: null,
			scheduler: {
				state: "stale_queued",
				dispatchState: "unscheduled",
				queuedAgeMs: 2_000,
				stale: true,
				staleReason:
					"queued account-library materialization job has not been scheduled by this API process for 2000ms (threshold 1000ms)",
			},
		});
		await expect(service.listJobs({ status: "active" })).resolves.toMatchObject({
			metrics: {
				active: 1,
			},
			jobs: [
				expect.objectContaining({
					id: "hmj_account_library_stale_queued",
					scheduler: expect.objectContaining({
						state: "stale_queued",
						stale: true,
					}),
				}),
			],
		});
	});

	it("resolves account mirror catalog items without mutating catalog reads", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-catalog-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readItem = vi.fn(async () => ({
			object: "account_mirror_catalog_item" as const,
			generatedAt: "2026-05-22T18:10:00.000Z",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			browserProfileId: "default",
			boundIdentityKey: "user@example.com",
			status: "eligible" as const,
			reason: "eligible" as const,
			kind: "conversations" as const,
			itemId: "conv_catalog_1",
			item: {
				id: "conv_catalog_1",
				projectId: "project_1",
				url: "https://chatgpt.com/c/conv_catalog_1",
			},
		}));
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-22T18:11:00.000Z",
				status: "skipped",
				target,
				source: {
					type: "catalog_item",
					catalogItemId: "conv_catalog_1",
					catalogKind: "conversations",
				},
				manifestPaths: [],
				entries: [],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 0, skipped: 1, failed: 0 },
				message: "No downloadable assets.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem,
			},
			generateId: () => "hmj_catalog_1",
			now: sequenceNow([
				"2026-05-22T18:10:00.000Z",
				"2026-05-22T18:10:01.000Z",
				"2026-05-22T18:10:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			catalogItemId: "conv_catalog_1",
			provider: "chatgpt",
			runtimeProfile: "default",
			catalogKind: "conversations",
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(readItem).toHaveBeenCalledWith({
			itemId: "conv_catalog_1",
			provider: "chatgpt",
			runtimeProfileId: "default",
			kind: "conversations",
			limit: 500,
		});
		expect(materializeConversation).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfile: "default",
				browserProfile: "default",
				boundIdentityKey: "user@example.com",
				conversationId: "conv_catalog_1",
				projectId: "project_1",
			}),
			expect.objectContaining({
				assetKinds: ["artifacts", "files"],
			}),
			"hmj_catalog_1",
		);
	});

	it("resolves account mirror artifact catalog items from nested conversation metadata", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-artifact-item-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readItem = vi.fn(async () => ({
			object: "account_mirror_catalog_item" as const,
			generatedAt: "2026-05-22T18:15:00.000Z",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			browserProfileId: "default",
			boundIdentityKey: "user@example.com",
			status: "eligible" as const,
			reason: "eligible" as const,
			kind: "artifacts" as const,
			itemId: "artifact_catalog_1",
			item: {
				id: "artifact_catalog_1",
				title: "Legacy readout",
				kind: "download",
				metadata: {
					conversationId: "conv_from_artifact",
					projectId: "project_from_artifact",
					providerConversationUrl: "https://chatgpt.com/c/conv_from_artifact",
				},
			},
		}));
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-22T18:16:00.000Z",
				status: "skipped",
				target,
				source: {
					type: "catalog_item",
					catalogItemId: "artifact_catalog_1",
					catalogKind: "artifacts",
				},
				manifestPaths: [],
				entries: [],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 0, skipped: 1, failed: 0 },
				message: "No downloadable assets.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem,
			},
			generateId: () => "hmj_artifact_item_1",
			now: sequenceNow([
				"2026-05-22T18:15:00.000Z",
				"2026-05-22T18:15:01.000Z",
				"2026-05-22T18:15:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			catalogItemId: "artifact_catalog_1",
			provider: "chatgpt",
			runtimeProfile: "default",
			catalogKind: "artifacts",
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				conversationId: "conv_from_artifact",
				providerConversationUrl: "https://chatgpt.com/c/conv_from_artifact",
				projectId: "project_from_artifact",
			}),
			expect.objectContaining({
				assetKinds: ["artifacts"],
			}),
			"hmj_artifact_item_1",
		);
	});

	it("runs bounded reconciliation from materializable account mirror conversation rows", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-reconcile-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-22T18:20:00.000Z",
			kind: "conversations" as const,
			limit: 10,
			entries: [
				{
					provider: "chatgpt" as const,
					runtimeProfileId: "default",
					browserProfileId: "default",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 3,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "conv_reconcile_1",
								title: "Has artifact",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
							},
							{
								id: "conv_reconcile_2",
								title: "No cached assets",
								provider: "chatgpt" as const,
								cachedArtifactCount: 0,
								cachedFileCount: 0,
							},
							{
								id: "conv_reconcile_3",
								title: "Has file",
								provider: "chatgpt" as const,
								projectId: "project_1",
								cachedArtifactCount: 0,
								cachedFileCount: 1,
							},
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 3,
				artifacts: 0,
				files: 0,
				media: 0,
			},
		}));
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-22T18:21:00.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "chatgpt" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [
					{
						kind: "artifact",
						providerId: `artifact_${target.conversationId}`,
						title: "Recovered export",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/export.json`,
						remoteUrl: null,
						cacheKey: null,
						checksumSha256: null,
						mimeType: "application/json",
						size: 12,
						materializationMethod: "download-button",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered one asset.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_reconcile_1",
			now: sequenceNow([
				"2026-05-22T18:20:00.000Z",
				"2026-05-22T18:20:01.000Z",
				"2026-05-22T18:20:02.000Z",
				"2026-05-22T18:20:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			reconcile: true,
			maxItems: 2,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(readCatalog).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfileId: "default",
			kind: "all",
			limit: 500,
		});
		expect(materializeConversation).toHaveBeenCalledTimes(2);
		expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
			"conv_reconcile_1",
			"conv_reconcile_3",
		]);
		const completed = await service.readJob("hmj_reconcile_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			source: { type: "reconciliation", provider: "chatgpt" },
			result: {
				status: "materialized",
				metrics: {
					conversations: 2,
					materialized: 2,
				},
			},
		});
	});

	it("deduplicates repeated reconciliation asset families and carries a remaining asset budget", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-reconcile-dedupe-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-31T21:20:00.000Z",
			kind: "conversations" as const,
			limit: 20,
			entries: [
				{
					provider: "chatgpt" as const,
					runtimeProfileId: "wsl-chrome-3",
					browserProfileId: "wsl-chrome-3",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "in_progress" as const,
						summary: "In progress.",
						remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: true,
							attachmentInventoryTruncated: true,
							attachmentCursorPresent: true,
						},
					},
					counts: {
						projects: 0,
						conversations: 3,
						artifacts: 3,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "conv_deep_research_1",
								title: "First row",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 3, missingLocal: 3 },
									},
								},
							},
							{
								id: "conv_deep_research_2",
								title: "Duplicate row",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 3, missingLocal: 3 },
									},
								},
							},
							{
								id: "conv_unique_1",
								title: "Unique row",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 1, missingLocal: 1 },
									},
								},
							},
						],
						artifacts: [
							{
								id: "deep-research:conv_deep_research_1:0:markdown",
								title: "SoyFuze Chemical Composition Dossier",
								provider: "chatgpt" as const,
								conversationId: "conv_deep_research_1",
								metadata: { source: "deep-research" },
							},
							{
								id: "deep-research:conv_deep_research_2:0:pdf",
								title: "SoyFuze Chemical Composition Dossier (PDF)",
								provider: "chatgpt" as const,
								conversationId: "conv_deep_research_2",
								metadata: { source: "deep-research" },
							},
							{
								id: "deep-research:conv_unique_1:0:markdown",
								title: "Different Export",
								provider: "chatgpt" as const,
								conversationId: "conv_unique_1",
								metadata: { source: "deep-research" },
							},
						],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 3,
				artifacts: 3,
				files: 0,
				media: 0,
			},
		}));
		const materializeConversation = vi.fn(
			async (target, request): Promise<HistoryMaterializationResult> => {
				const entryCount = target.conversationId === "conv_deep_research_1" ? 3 : 1;
				return {
					object: "history_materialization_result",
					generatedAt: "2026-05-31T21:21:00.000Z",
					status: "materialized",
					target,
					source: { type: "reconciliation", provider: "chatgpt" },
					manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
					entries: Array.from({ length: entryCount }, (_, index) => ({
						kind: "artifact" as const,
						providerId: `artifact_${target.conversationId}_${index}`,
						title:
							target.conversationId === "conv_deep_research_1"
								? `SoyFuze Chemical Composition Dossier ${index}`
								: "Different Export",
						status: "materialized" as const,
						localPath: `/tmp/${target.conversationId}/export-${index}.json`,
						remoteUrl: null,
						cacheKey: null,
						checksumSha256: null,
						mimeType: "application/json",
						size: 12,
						materializationMethod: "download-button",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					})),
					archiveItems: [],
					metrics: { conversations: 1, materialized: entryCount, skipped: 0, failed: 0 },
					message: `Recovered ${entryCount} assets with maxItems=${request.maxItems}.`,
				};
			},
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_reconcile_dedupe_1",
			now: sequenceNow([
				"2026-05-31T21:20:00.000Z",
				"2026-05-31T21:20:01.000Z",
				"2026-05-31T21:20:02.000Z",
				"2026-05-31T21:20:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			reconcile: true,
			assetKinds: ["artifacts"],
			maxItems: 4,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
			"conv_deep_research_1",
			"conv_unique_1",
		]);
		expect(materializeConversation.mock.calls.map(([, request]) => request.maxItems)).toEqual([
			4, 1,
		]);
		const completed = await service.readJob("hmj_reconcile_dedupe_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			result: {
				metrics: {
					conversations: 2,
					materialized: 4,
				},
			},
		});
	});

	it("skips stale ChatGPT Deep Research duplicate families already complete in catalog evidence", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-complete-family-skip-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-06-01T02:10:00.000Z",
			kind: "all" as const,
			limit: 500,
			entries: [
				{
					provider: "chatgpt" as const,
					runtimeProfileId: "wsl-chrome-3",
					browserProfileId: "wsl-chrome-3",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "in_progress" as const,
						summary: "In progress.",
						remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: true,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: true,
						},
					},
					counts: {
						projects: 0,
						conversations: 3,
						artifacts: 3,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "conv_duplicate_missing",
								title: "Duplicate stale row",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 1, local: 0, missingLocal: 1 },
									},
								},
							},
							{
								id: "conv_unique_missing",
								title: "Unique stale row",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 1, local: 0, missingLocal: 1 },
									},
								},
							},
							{
								id: "conv_complete_family",
								title: "Already recovered row",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "fresh",
										assetCompleteness: "complete",
										assetCounts: { known: 1, local: 1, missingLocal: 0 },
									},
								},
							},
						],
						artifacts: [
							{
								id: "deep-research:conv_duplicate_missing:0:markdown",
								title: "SoyFuze Chemical Composition Dossier",
								provider: "chatgpt" as const,
								conversationId: "conv_duplicate_missing",
								metadata: { source: "deep-research" },
							},
							{
								id: "deep-research:conv_unique_missing:0:markdown",
								title: "Different Export",
								provider: "chatgpt" as const,
								conversationId: "conv_unique_missing",
								metadata: { source: "deep-research" },
							},
							{
								id: "deep-research:conv_complete_family:0:pdf",
								title: "SoyFuze Chemical Composition Dossier (PDF)",
								provider: "chatgpt" as const,
								conversationId: "conv_complete_family",
								metadata: { source: "deep-research" },
							},
						],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 3,
				artifacts: 3,
				files: 0,
				media: 0,
			},
		}));
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-06-01T02:10:01.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "chatgpt" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [
					{
						kind: "artifact",
						providerId: `artifact_${target.conversationId}`,
						title: "Different Export",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/export.json`,
						remoteUrl: null,
						cacheKey: null,
						checksumSha256: null,
						mimeType: "application/json",
						size: 12,
						materializationMethod: "download-button",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered 1 asset.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_reconcile_complete_family_skip_1",
			now: sequenceNow([
				"2026-06-01T02:10:00.000Z",
				"2026-06-01T02:10:01.000Z",
				"2026-06-01T02:10:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			reconcile: true,
			assetKinds: ["artifacts"],
			maxItems: 2,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
			"conv_unique_missing",
		]);
		const completed = await service.readJob("hmj_reconcile_complete_family_skip_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			result: {
				metrics: {
					conversations: 1,
					materialized: 1,
				},
			},
		});
	});

	it("skips stale ChatGPT reconciliation families already materialized in the archive", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-archive-family-skip-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-06-01T17:10:00.000Z",
			kind: "all" as const,
			limit: 500,
			entries: [
				{
					provider: "chatgpt" as const,
					runtimeProfileId: "wsl-chrome-3",
					browserProfileId: "wsl-chrome-3",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "in_progress" as const,
						summary: "In progress.",
						remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: true,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: true,
						},
					},
					counts: {
						projects: 0,
						conversations: 3,
						artifacts: 2,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "conv_refresh_only_empty",
								title: "Refresh only empty stale row",
								provider: "chatgpt" as const,
								cachedArtifactCount: 0,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "stale",
										assetCounts: { known: 0, local: 0, missingLocal: 0 },
									},
								},
							},
							{
								id: "conv_archive_backed",
								title: "Archive backed stale row",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 1, local: 0, missingLocal: 1 },
									},
								},
							},
							{
								id: "conv_new_missing",
								title: "New stale row",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 1, local: 0, missingLocal: 1 },
									},
								},
							},
						],
						artifacts: [
							{
								id: "artifact_1:download:sandbox:/mnt/data/recovered_guide.zip",
								title: "Recovered Guide",
								provider: "chatgpt" as const,
								conversationId: "conv_archive_backed",
								metadata: {},
							},
							{
								id: "artifact_2:download:sandbox:/mnt/data/new_guide.zip",
								title: "New Guide",
								provider: "chatgpt" as const,
								conversationId: "conv_new_missing",
								metadata: {},
							},
						],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 3,
				artifacts: 2,
				files: 0,
				media: 0,
			},
		}));
		const runArchiveService = {
			listItems: vi.fn(async () => ({
				object: "run_archive" as const,
				generatedAt: "2026-06-01T17:10:01.000Z",
				kind: "all" as const,
				limit: 500,
				items: [
					{
						id: "history-generated-artifact:chatgpt:user_example.com:conv_archive_backed:guide",
						object: "run_archive_item" as const,
						kind: "generated_artifact" as const,
						source: "account_mirror" as const,
						createdAt: "2026-06-01T17:00:00.000Z",
						updatedAt: "2026-06-01T17:00:00.000Z",
						title: "Recovered Guide",
						status: "materialized",
						provider: "chatgpt",
						runtimeProfile: "wsl-chrome-3",
						browserProfile: "wsl-chrome-3",
						projectId: null,
						boundIdentityKey: "user@example.com",
						agentId: null,
						teamId: null,
						responseId: null,
						batchId: null,
						batchIndex: null,
						mediaGenerationId: null,
						providerConversationId: "conv_archive_backed",
						providerConversationUrl: "https://chatgpt.com/c/conv_archive_backed",
						artifactId: "artifact_1:download:sandbox:/mnt/data/recovered_guide.zip",
						fileName: "Recovered Guide.zip",
						mimeType: "application/zip",
						localPath: "/tmp/recovered-guide.zip",
						uri: null,
						cacheKey: "sha256:recovered",
						checksumSha256: "recovered",
						fileAvailable: true,
						metadata: { artifactKind: "download" },
						links: { asset: "/v1/archive/items/recovered/asset" },
					},
				],
				metrics: {
					total: 1,
					byKind: {
						response: 0,
						response_batch: 0,
						team_run: 0,
						media_generation: 0,
						upload: 0,
						generated_artifact: 1,
						provider_conversation: 0,
						evidence: 0,
					},
				},
			})),
		} as unknown as RunArchiveService;
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-06-01T17:10:02.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "chatgpt" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [
					{
						kind: "artifact",
						providerId: `artifact:${target.conversationId}:guide`,
						title: "New Guide",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/new-guide.zip`,
						remoteUrl: null,
						cacheKey: null,
						checksumSha256: null,
						mimeType: "application/zip",
						size: 12,
						materializationMethod: "captured-anchor-fetch",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered 1 asset.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			runArchiveService,
			generateId: () => "hmj_reconcile_archive_family_skip_1",
			now: sequenceNow([
				"2026-06-01T17:10:00.000Z",
				"2026-06-01T17:10:01.000Z",
				"2026-06-01T17:10:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			reconcile: true,
			assetKinds: ["artifacts"],
			maxItems: 2,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(runArchiveService.listItems).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			assetAvailability: "available",
			limit: 500,
		});
		expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
			"conv_new_missing",
		]);
	});

	it("skips ChatGPT static image false positives during reconciliation candidate selection", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-static-image-skip-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-06-01T00:40:00.000Z",
			kind: "conversations" as const,
			limit: 10,
			entries: [
				{
					provider: "chatgpt" as const,
					runtimeProfileId: "wsl-chrome-3",
					browserProfileId: "wsl-chrome-3",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "in_progress" as const,
						summary: "In progress.",
						remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: true,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 3,
						artifacts: 2,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "conv_favicon_only",
								title: "Only source favicon",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 1, missingLocal: 1 },
									},
								},
							},
							{
								id: "conv_generated_image",
								title: "Real generated image",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 1, missingLocal: 1 },
									},
								},
							},
						],
						artifacts: [
							{
								artifactId: "image-dom:turn_favicon:0",
								title: "Generated image 1",
								provider: "chatgpt" as const,
								conversationId: "conv_favicon_only",
								uri: "https://www.google.com/s2/favicons?domain=https://www.imagemappro.com&sz=32",
								metadata: {
									extraction: "dom-imagegen-image",
									conversationId: "conv_favicon_only",
								},
							},
							{
								id: "image-dom:turn_real:0",
								title: "Generated image 1",
								provider: "chatgpt" as const,
								conversationId: "conv_generated_image",
								uri: "blob:https://chatgpt.com/generated-image-1",
								metadata: {
									extraction: "dom-imagegen-image",
									conversationId: "conv_generated_image",
								},
							},
						],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 2,
				artifacts: 2,
				files: 0,
				media: 0,
			},
		}));
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-06-01T00:41:00.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "chatgpt" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [
					{
						kind: "artifact",
						providerId: "image-dom:turn_real:0",
						title: "Generated image 1",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/generated-image.png`,
						remoteUrl: null,
						cacheKey: null,
						checksumSha256: null,
						mimeType: "image/png",
						size: 12,
						materializationMethod: "generated-image",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered generated image.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_static_image_skip_1",
			now: sequenceNow([
				"2026-06-01T00:40:00.000Z",
				"2026-06-01T00:40:01.000Z",
				"2026-06-01T00:40:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			reconcile: true,
			assetKinds: ["artifacts"],
			maxItems: 2,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation).toHaveBeenCalledTimes(1);
		expect(materializeConversation.mock.calls[0]?.[0].conversationId).toBe("conv_generated_image");
	});

	it("does not treat unsupported ChatGPT conversation files as reconciliation targets", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-unsupported-file-skip-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-06-01T00:45:00.000Z",
			kind: "conversations" as const,
			limit: 10,
			entries: [
				{
					provider: "chatgpt" as const,
					runtimeProfileId: "wsl-chrome-3",
					browserProfileId: "wsl-chrome-3",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "in_progress" as const,
						summary: "In progress.",
						remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: true,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 1,
						artifacts: 0,
						files: 1,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "conv_unsupported_file",
								title: "Conversation upload only",
								provider: "chatgpt" as const,
								cachedArtifactCount: 0,
								cachedFileCount: 1,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 1, missingLocal: 1 },
									},
								},
							},
						],
						artifacts: [],
						files: [
							{
								id: "conv_unsupported_file:turn_1:0:input.pdf",
								name: "input.pdf",
								provider: "chatgpt" as const,
								conversationId: "conv_unsupported_file",
								metadata: {
									label: "PDF",
									conversationId: "conv_unsupported_file",
								},
							},
						],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 1,
				artifacts: 0,
				files: 1,
				media: 0,
			},
		}));
		const materializeConversation = vi.fn();
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_unsupported_file_skip_1",
			now: sequenceNow([
				"2026-06-01T00:45:00.000Z",
				"2026-06-01T00:45:01.000Z",
				"2026-06-01T00:45:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			reconcile: true,
			assetKinds: ["files"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation).not.toHaveBeenCalled();
		await expect(service.readJob("hmj_unsupported_file_skip_1")).resolves.toMatchObject({
			status: "skipped",
			result: {
				status: "skipped",
				metrics: {
					materialized: 0,
				},
			},
		});
	});

	it("keeps ChatGPT conversation files with provider file ids as reconciliation targets", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-provider-file-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-06-01T00:50:00.000Z",
			kind: "conversations" as const,
			limit: 10,
			entries: [
				{
					provider: "chatgpt" as const,
					runtimeProfileId: "wsl-chrome-3",
					browserProfileId: "wsl-chrome-3",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 1,
						artifacts: 0,
						files: 1,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "conv_provider_file",
								title: "Conversation retrievable upload",
								provider: "chatgpt" as const,
								cachedArtifactCount: 0,
								cachedFileCount: 1,
								metadata: {
									conversationFreshness: {
										state: "missing_assets",
										assetCounts: { known: 1, missingLocal: 1 },
									},
								},
							},
						],
						artifacts: [],
						files: [
							{
								id: "conv_provider_file:turn_1:0:input.pdf",
								name: "input.pdf",
								provider: "chatgpt" as const,
								conversationId: "conv_provider_file",
								remoteUrl: "chatgpt://file/file_retrievable",
								metadata: {
									label: "PDF",
									conversationId: "conv_provider_file",
									providerFileId: "file_retrievable",
								},
							},
						],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 1,
				artifacts: 0,
				files: 1,
				media: 0,
			},
		}));
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-06-01T00:50:02.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "chatgpt" },
				manifestPaths: [`/tmp/${target.conversationId}/file-fetch-manifest.json`],
				entries: [
					{
						kind: "file",
						providerId: "conv_provider_file:turn_1:0:input.pdf",
						title: "input.pdf",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/input.pdf`,
						remoteUrl: "chatgpt://file/file_retrievable",
						cacheKey: null,
						checksumSha256: null,
						mimeType: "application/pdf",
						size: 42,
						materializationMethod: "chatgpt-file-tile-default-action",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered one file.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_provider_file_1",
			now: sequenceNow([
				"2026-06-01T00:50:00.000Z",
				"2026-06-01T00:50:01.000Z",
				"2026-06-01T00:50:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			boundIdentityKey: "user@example.com",
			reconcile: true,
			assetKinds: ["files"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation).toHaveBeenCalledTimes(1);
		await expect(service.readJob("hmj_provider_file_1")).resolves.toMatchObject({
			status: "succeeded",
			result: {
				status: "materialized",
				metrics: {
					materialized: 1,
				},
			},
		});
	});

	it("runs selected conversation id batches even when cached rows have no asset counts", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-selected-batch-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-22T18:22:00.000Z",
			kind: "conversations" as const,
			limit: 10,
			entries: [
				{
					provider: "chatgpt" as const,
					runtimeProfileId: "default",
					browserProfileId: "default",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 2,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "conv_selected_1",
								title: "Selected cached row with stale counts",
								provider: "chatgpt" as const,
								cachedArtifactCount: 0,
								cachedFileCount: 0,
							},
							{
								id: "conv_other",
								title: "Unselected cached row",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
							},
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 2,
				artifacts: 0,
				files: 0,
				media: 0,
			},
		}));
		const refreshConversationSnapshot = vi.fn(
			async (target): Promise<HistoryMaterializationSnapshotRefresh> => ({
				object: "history_materialization_snapshot_refresh",
				generatedAt: "2026-05-22T18:22:01.000Z",
				status: "refreshed",
				target,
				routeabilityState: "routeable",
				messageCount: 2,
				fileCount: 0,
				sourceCount: 0,
				artifactCount: 1,
				error: null,
				message: "Conversation snapshot refreshed.",
			}),
		);
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-22T18:22:02.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "chatgpt" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [
					{
						kind: "artifact",
						providerId: `artifact_${target.conversationId}`,
						title: "Recovered export",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/export.json`,
						remoteUrl: null,
						cacheKey: null,
						checksumSha256: null,
						mimeType: "application/json",
						size: 12,
						materializationMethod: "download-button",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered one asset.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_selected_batch_1",
			now: sequenceNow([
				"2026-05-22T18:22:00.000Z",
				"2026-05-22T18:22:01.000Z",
				"2026-05-22T18:22:02.000Z",
				"2026-05-22T18:22:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			refreshConversationSnapshot,
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "default",
			conversationIds: ["conv_selected_1", "conv_selected_2"],
			refreshSnapshot: true,
			maxItems: 2,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(readCatalog).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfileId: "default",
			kind: "all",
			limit: 500,
		});
		expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
			"conv_selected_1",
			"conv_selected_2",
		]);
		expect(materializeConversation.mock.calls[1]?.[0]).toMatchObject({
			provider: "chatgpt",
			runtimeProfile: "default",
			conversationId: "conv_selected_2",
			providerConversationUrl: "https://chatgpt.com/c/conv_selected_2",
		});
		const completed = await service.readJob("hmj_selected_batch_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			source: { type: "reconciliation", provider: "chatgpt" },
			result: {
				snapshotRefreshes: [
					{ target: { conversationId: "conv_selected_1" } },
					{ target: { conversationId: "conv_selected_2" } },
				],
				metrics: {
					conversations: 2,
					materialized: 2,
				},
			},
		});
	});

	it("tries ChatGPT reconciliation materialization before live snapshot refresh", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-chatgpt-cache-first-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-24T02:10:00.000Z",
			kind: "all" as const,
			limit: 500,
			entries: [
				{
					provider: "chatgpt" as const,
					runtimeProfileId: "wsl-chrome-3",
					browserProfileId: "wsl-chrome-3",
					boundIdentityKey: "eric.cochran@soylei.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "in_progress" as const,
						summary: "Progressive backfill.",
						remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: true,
							attachmentInventoryTruncated: true,
							attachmentCursorPresent: true,
						},
					},
					counts: {
						projects: 0,
						conversations: 1,
						artifacts: 1,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "chatgpt_missing_assets",
								title: "Missing local ChatGPT asset",
								provider: "chatgpt" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								conversationFreshness: {
									object: "account_mirror_conversation_freshness",
									state: "missing_assets",
									assetCompleteness: "partial",
									assetCounts: { known: 1, local: 0, missingLocal: 1 },
								},
							},
						],
						artifacts: [
							{
								id: "artifact_chatgpt_missing",
								title: "Cached download button artifact",
								provider: "chatgpt" as const,
								conversationId: "chatgpt_missing_assets",
							},
						],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 1,
				artifacts: 1,
				files: 0,
				media: 0,
			},
		}));
		const refreshConversationSnapshot = vi.fn(async () => {
			throw new Error(
				"ChatGPT rate limit detected while readConversationContext; cooling down until 2026-05-24T02:25:00.000Z. Too many requests.",
			);
		});
		const recordConversationEvidence = vi.fn(async () => undefined);
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-24T02:10:01.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "chatgpt" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [
					{
						kind: "artifact",
						providerId: "artifact_chatgpt_missing",
						title: "Cached download button artifact",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/artifact.md`,
						remoteUrl: null,
						cacheKey: `chatgpt:${target.conversationId}`,
						checksumSha256: "cachefirst123",
						mimeType: "text/markdown",
						size: 12,
						materializationMethod: "download-button",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered one cached ChatGPT asset.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_chatgpt_cache_first_1",
			now: sequenceNow([
				"2026-05-24T02:10:00.000Z",
				"2026-05-24T02:10:01.000Z",
				"2026-05-24T02:10:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			refreshConversationSnapshot,
			recordConversationEvidence,
			materializeConversation,
		});

		await service.createJob({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-3",
			reconcile: true,
			refreshSnapshot: true,
			assetKinds: ["all"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation).toHaveBeenCalledWith(
			expect.objectContaining({ conversationId: "chatgpt_missing_assets" }),
			expect.objectContaining({ refreshSnapshot: true }),
			"hmj_chatgpt_cache_first_1",
		);
		expect(refreshConversationSnapshot).not.toHaveBeenCalled();
		expect(recordConversationEvidence).toHaveBeenCalledWith(
			expect.objectContaining({ conversationId: "chatgpt_missing_assets" }),
			expect.objectContaining({
				manifestObservedAt: "2026-05-24T02:10:01.000Z",
				materializedAt: "2026-05-24T02:10:01.000Z",
				assetCompleteness: "complete",
			}),
		);
		await expect(service.readJob("hmj_chatgpt_cache_first_1")).resolves.toMatchObject({
			status: "succeeded",
			result: {
				metrics: {
					conversations: 1,
					materialized: 1,
				},
				snapshotRefreshes: [],
			},
		});
	});

	it("honors selected conversation id order so terminal misses do not hide behind cached matches", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-selected-order-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const routeMissReason =
			"conversation-not-found-or-unavailable: Gemini routeability check for conversation=gemini_deleted " +
			"landed on bare /app; treat the cached conversation id as deleted/non-existent in the tenant.";
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-24T02:40:00.000Z",
			kind: "all" as const,
			limit: 50,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "auracall-gemini-pro",
					browserProfileId: "gemini-stealthcdp",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 1,
						artifacts: 1,
						files: 0,
						media: 1,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "gemini_routeable",
								title: "Routeable image conversation",
								provider: "gemini" as const,
								url: "https://gemini.google.com/app/gemini_routeable",
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								cachedMediaCount: 1,
							},
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 1,
				artifacts: 1,
				files: 0,
				media: 1,
			},
		}));
		const refreshConversationSnapshot = vi.fn(
			async (target): Promise<HistoryMaterializationSnapshotRefresh> => {
				if (target.conversationId === "gemini_deleted") {
					return {
						object: "history_materialization_snapshot_refresh",
						generatedAt: "2026-05-24T02:40:01.000Z",
						status: "failed",
						target,
						routeabilityState: "not_found_or_unavailable",
						messageCount: null,
						fileCount: null,
						sourceCount: null,
						artifactCount: null,
						error: routeMissReason,
						message: `Conversation snapshot refresh failed for gemini conversation gemini_deleted: ${routeMissReason}`,
					};
				}
				return {
					object: "history_materialization_snapshot_refresh",
					generatedAt: "2026-05-24T02:40:02.000Z",
					status: "refreshed",
					target,
					routeabilityState: "routeable",
					messageCount: 1,
					fileCount: 0,
					sourceCount: 0,
					artifactCount: 1,
					error: null,
					message: "Conversation snapshot refreshed.",
				};
			},
		);
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-24T02:40:03.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "gemini" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [
					{
						kind: "artifact",
						providerId: `artifact_${target.conversationId}`,
						title: "Generated image 1",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/image.png`,
						remoteUrl: null,
						cacheKey: null,
						checksumSha256: "selected-order",
						mimeType: "image/png",
						size: 12,
						materializationMethod: "provider-download",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered one asset.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_selected_order_1",
			now: sequenceNow([
				"2026-05-24T02:40:00.000Z",
				"2026-05-24T02:40:01.000Z",
				"2026-05-24T02:40:02.000Z",
				"2026-05-24T02:40:03.000Z",
				"2026-05-24T02:40:04.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			refreshConversationSnapshot,
			materializeConversation,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "auracall-gemini-pro",
			boundIdentityKey: "user@example.com",
			conversationIds: ["gemini_deleted", "gemini_routeable"],
			refreshSnapshot: true,
			assetKinds: ["media"],
			maxItems: 1,
			force: true,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(refreshConversationSnapshot.mock.calls.map(([target]) => target.conversationId)).toEqual(
			["gemini_deleted", "gemini_routeable"],
		);
		expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
			"gemini_routeable",
		]);
		await expect(service.readJob("hmj_selected_order_1")).resolves.toMatchObject({
			status: "succeeded",
			result: {
				snapshotRefreshes: [
					{
						target: { conversationId: "gemini_deleted" },
						status: "failed",
						routeabilityState: "not_found_or_unavailable",
					},
					{
						target: { conversationId: "gemini_routeable" },
						status: "refreshed",
						routeabilityState: "routeable",
					},
				],
				metrics: {
					conversations: 2,
					materialized: 1,
					failed: 1,
				},
			},
		});
	});

	it("selects reconciliation targets from manifest asset evidence when row counts are stale", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-manifest-candidates-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-23T20:30:00.000Z",
			kind: "conversations" as const,
			limit: 5,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "auracall-gemini-pro",
					browserProfileId: "default",
					boundIdentityKey: "ecochran76@gmail.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "in_progress" as const,
						summary: "Progressive backfill.",
						remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: true,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 2,
						artifacts: 1,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "gemini_manifest_candidate",
								title: "Recently moved conversation",
								provider: "gemini" as const,
								cachedArtifactCount: 0,
								cachedFileCount: 0,
							},
							{
								id: "gemini_without_assets",
								title: "No manifest assets",
								provider: "gemini" as const,
								cachedArtifactCount: 0,
								cachedFileCount: 0,
							},
						],
						artifacts: [
							{
								id: "gemini_image_1",
								title: "Generated image",
								kind: "image" as const,
								uri: "https://gemini.googleusercontent.com/image.png",
								metadata: {
									conversationId: "gemini_manifest_candidate",
								},
							},
						],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 2,
				artifacts: 1,
				files: 0,
				media: 0,
			},
		}));
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-23T20:30:02.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "gemini" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [
					{
						kind: "artifact",
						providerId: "gemini_image_1",
						title: "Generated image",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/image.png`,
						remoteUrl: null,
						cacheKey: `gemini:${target.conversationId}:gemini_image_1`,
						checksumSha256: "abc123",
						mimeType: "image/png",
						size: 12,
						materializationMethod: "provider-download",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered one Gemini image.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_manifest_candidate_1",
			now: sequenceNow([
				"2026-05-23T20:30:00.000Z",
				"2026-05-23T20:30:01.000Z",
				"2026-05-23T20:30:02.000Z",
				"2026-05-23T20:30:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "auracall-gemini-pro",
			reconcile: true,
			assetKinds: ["artifacts"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
			"gemini_manifest_candidate",
		]);
		expect(materializeConversation).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfile: "auracall-gemini-pro",
				boundIdentityKey: "ecochran76@gmail.com",
				conversationId: "gemini_manifest_candidate",
				providerConversationUrl: "https://gemini.google.com/app/gemini_manifest_candidate",
			}),
			expect.objectContaining({
				reconcile: true,
				assetKinds: ["artifacts"],
			}),
			"hmj_manifest_candidate_1",
		);
		await expect(service.readJob("hmj_manifest_candidate_1")).resolves.toMatchObject({
			status: "succeeded",
			result: {
				metrics: {
					conversations: 1,
					materialized: 1,
				},
			},
		});
	});

	it("uses freshness evidence to skip complete rows and refresh changed rows without asset counts", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-freshness-candidates-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-24T02:20:00.000Z",
			kind: "conversations" as const,
			limit: 5,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "auracall-gemini-pro",
					browserProfileId: "default",
					boundIdentityKey: "ecochran76@gmail.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "in_progress" as const,
						summary: "Progressive backfill.",
						remainingDetailSurfaces: { projects: 0, conversations: 2, total: 2 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: true,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 3,
						artifacts: 1,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "gemini_fresh_complete",
								title: "Already materialized image",
								provider: "gemini" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								conversationFreshness: {
									object: "account_mirror_conversation_freshness",
									state: "fresh",
									assetCompleteness: "complete",
									assetCounts: { known: 1, local: 1, missingLocal: 0 },
								},
							},
							{
								id: "gemini_changed_without_counts",
								title: "Changed conversation without cached asset counts",
								provider: "gemini" as const,
								cachedArtifactCount: 0,
								cachedFileCount: 0,
								conversationFreshness: {
									object: "account_mirror_conversation_freshness",
									state: "stale",
									reasons: ["index_newer_than_detail"],
									assetCompleteness: "none",
									assetCounts: { known: 0, local: 0, missingLocal: 0 },
								},
							},
							{
								id: "gemini_missing_assets",
								title: "Missing local asset",
								provider: "gemini" as const,
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								conversationFreshness: {
									object: "account_mirror_conversation_freshness",
									state: "missing_assets",
									assetCompleteness: "partial",
									assetCounts: { known: 1, local: 0, missingLocal: 1 },
								},
							},
						],
						artifacts: [
							{
								id: "fresh_image",
								title: "Already local",
								kind: "image" as const,
								metadata: {
									conversationId: "gemini_fresh_complete",
								},
							},
						],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 3,
				artifacts: 1,
				files: 0,
				media: 0,
			},
		}));
		const refreshConversationSnapshot = vi.fn(
			async (target): Promise<HistoryMaterializationSnapshotRefresh> => ({
				object: "history_materialization_snapshot_refresh",
				generatedAt: "2026-05-24T02:20:01.000Z",
				status: "refreshed",
				target,
				routeabilityState: "routeable",
				messageCount: 3,
				fileCount: 0,
				sourceCount: 0,
				artifactCount: 1,
				error: null,
				message: "Conversation snapshot refreshed.",
			}),
		);
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-24T02:20:02.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "gemini" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [
					{
						kind: "artifact",
						providerId: `artifact_${target.conversationId}`,
						title: "Generated image 1",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/image.png`,
						remoteUrl: null,
						cacheKey: `gemini:${target.conversationId}`,
						checksumSha256: "freshness123",
						mimeType: "image/png",
						size: 12,
						materializationMethod: "provider-download",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered one Gemini image.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_freshness_candidate_1",
			now: sequenceNow([
				"2026-05-24T02:20:00.000Z",
				"2026-05-24T02:20:01.000Z",
				"2026-05-24T02:20:02.000Z",
				"2026-05-24T02:20:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			refreshConversationSnapshot,
			materializeConversation,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "auracall-gemini-pro",
			reconcile: true,
			refreshSnapshot: true,
			assetKinds: ["all"],
			maxItems: 2,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
			"gemini_missing_assets",
			"gemini_changed_without_counts",
		]);
		expect(refreshConversationSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ conversationId: "gemini_changed_without_counts" }),
			expect.objectContaining({ refreshSnapshot: true }),
			"hmj_freshness_candidate_1",
		);
		await expect(service.readJob("hmj_freshness_candidate_1")).resolves.toMatchObject({
			status: "succeeded",
			result: {
				snapshotRefreshes: [
					{
						target: { conversationId: "gemini_missing_assets" },
						status: "refreshed",
					},
					{
						target: { conversationId: "gemini_changed_without_counts" },
						status: "refreshed",
					},
				],
				metrics: {
					conversations: 2,
					materialized: 2,
				},
			},
		});
	});

	it("prioritizes Gemini rows with missing assets over refresh-only app routes", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-candidate-priority-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-24T14:00:00.000Z",
			kind: "conversations" as const,
			limit: 5,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "default",
					browserProfileId: "default",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "in_progress" as const,
						summary: "Progressive backfill.",
						remainingDetailSurfaces: { projects: 0, conversations: 2, total: 2 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: true,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 2,
						artifacts: 1,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "download",
								title: "Gemini App Opens in a new window",
								provider: "gemini" as const,
								url: "https://gemini.google.com/app/download",
								cachedArtifactCount: 0,
								cachedFileCount: 0,
								cachedMediaCount: 0,
								conversationFreshness: {
									object: "account_mirror_conversation_freshness",
									state: "partial",
									assetCompleteness: "unknown",
									assetCounts: { known: 0, local: 0, missingLocal: 0 },
								},
							},
							{
								id: "gemini_missing_assets",
								title: "Generated image needing local materialization",
								provider: "gemini" as const,
								url: "https://gemini.google.com/app/gemini_missing_assets",
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								cachedMediaCount: 0,
								conversationFreshness: {
									object: "account_mirror_conversation_freshness",
									state: "missing_assets",
									assetCompleteness: "partial",
									assetCounts: { known: 1, local: 0, missingLocal: 1 },
								},
							},
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 2,
				artifacts: 1,
				files: 0,
				media: 0,
			},
		}));
		const refreshConversationSnapshot = vi.fn(
			async (target): Promise<HistoryMaterializationSnapshotRefresh> => ({
				object: "history_materialization_snapshot_refresh",
				generatedAt: "2026-05-24T14:00:01.000Z",
				status: "refreshed",
				target,
				routeabilityState: "routeable",
				messageCount: 2,
				fileCount: 0,
				sourceCount: 0,
				artifactCount: 1,
				error: null,
				message: "Conversation snapshot refreshed.",
			}),
		);
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-24T14:00:02.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "gemini" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [
					{
						kind: "artifact",
						providerId: `artifact_${target.conversationId}`,
						title: "Generated image",
						status: "materialized",
						localPath: `/tmp/${target.conversationId}/image.png`,
						remoteUrl: null,
						cacheKey: `gemini:${target.conversationId}`,
						checksumSha256: "missing-assets-first",
						mimeType: "image/png",
						size: 12,
						materializationMethod: "provider-download",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered one Gemini image.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_gemini_priority_1",
			now: sequenceNow([
				"2026-05-24T14:00:00.000Z",
				"2026-05-24T14:00:01.000Z",
				"2026-05-24T14:00:02.000Z",
				"2026-05-24T14:00:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			refreshConversationSnapshot,
			materializeConversation,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "default",
			reconcile: true,
			refreshSnapshot: true,
			assetKinds: ["artifacts"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
			"gemini_missing_assets",
		]);
		expect(refreshConversationSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				conversationId: "gemini_missing_assets",
				providerConversationUrl: "https://gemini.google.com/app/gemini_missing_assets",
			}),
			expect.objectContaining({ refreshSnapshot: true }),
			"hmj_gemini_priority_1",
		);
	});

	it("rejects Gemini sign-in redirect rows before reconciliation route checks", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-redirect-url-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-25T16:40:00.000Z",
			kind: "conversations" as const,
			limit: 5,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "default",
					browserProfileId: "default",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: true,
						},
					},
					counts: {
						projects: 0,
						conversations: 1,
						artifacts: 1,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "23340d1698de29b8&followup=https:",
								title: "Redirect-polluted Gemini row",
								provider: "gemini" as const,
								url: "https://accounts.google.com/ServiceLogin?passive=1209600&continue=https://gemini.google.com/app/23340d1698de29b8&followup=https://gemini.google.com/app/23340d1698de29b8&ec=GAZAkgU",
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								cachedMediaCount: 0,
								conversationFreshness: {
									object: "account_mirror_conversation_freshness",
									state: "missing_assets",
									assetCompleteness: "partial",
									assetCounts: { known: 1, local: 0, missingLocal: 1 },
								},
							},
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 1,
				artifacts: 1,
				files: 0,
				media: 0,
			},
		}));
		const refreshConversationSnapshot = vi.fn(
			async (target): Promise<HistoryMaterializationSnapshotRefresh> => ({
				object: "history_materialization_snapshot_refresh",
				generatedAt: "2026-05-25T16:40:01.000Z",
				status: "refreshed",
				target,
				routeabilityState: "routeable",
				messageCount: 2,
				fileCount: 0,
				sourceCount: 0,
				artifactCount: 1,
				error: null,
				message: "Conversation snapshot refreshed.",
			}),
		);
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-25T16:40:02.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "gemini" },
				manifestPaths: [`/tmp/${target.conversationId}/artifact-fetch-manifest.json`],
				entries: [],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered one Gemini image.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_gemini_redirect_1",
			now: sequenceNow([
				"2026-05-25T16:40:00.000Z",
				"2026-05-25T16:40:01.000Z",
				"2026-05-25T16:40:02.000Z",
				"2026-05-25T16:40:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			refreshConversationSnapshot,
			materializeConversation,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "default",
			reconcile: true,
			refreshSnapshot: true,
			assetKinds: ["artifacts"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(refreshConversationSnapshot).not.toHaveBeenCalled();
		expect(materializeConversation).not.toHaveBeenCalled();
		await expect(service.readJob("hmj_gemini_redirect_1")).resolves.toMatchObject({
			status: "skipped",
			result: {
				metrics: {
					conversations: 0,
					materialized: 0,
				},
			},
		});
	});

	it("rejects malformed direct Gemini conversation targets before provider work starts", async () => {
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog: vi.fn(),
				readItem: vi.fn(),
			},
			schedule: () => undefined,
			materializeConversation: vi.fn(),
		});

		await expect(
			service.createJob({
				provider: "gemini",
				runtimeProfile: "default",
				conversationId: "23340d1698de29b8&followup=https:",
				providerConversationUrl:
					"https://accounts.google.com/ServiceLogin?continue=https://gemini.google.com/app/23340d1698de29b8",
				assetKinds: ["artifacts"],
			}),
		).rejects.toThrow(
			"Gemini conversation materialization requires a canonical gemini.google.com/app/<conversation-id> target.",
		);

		await expect(
			service.createJob({
				provider: "gemini",
				runtimeProfile: "default",
				conversationId: "download",
				providerConversationUrl: "https://gemini.google.com/app/download",
				assetKinds: ["artifacts"],
			}),
		).rejects.toThrow(
			"Gemini conversation materialization requires a canonical gemini.google.com/app/<conversation-id> target.",
		);
	});

	it("does not spend reconciliation budget on Gemini static app routes", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-static-route-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-24T14:10:00.000Z",
			kind: "conversations" as const,
			limit: 5,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "default",
					browserProfileId: "default",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
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
								id: "download",
								title: "Gemini App Opens in a new window",
								provider: "gemini" as const,
								url: "https://gemini.google.com/app/download",
								cachedArtifactCount: 0,
								cachedFileCount: 0,
								cachedMediaCount: 0,
								conversationFreshness: {
									object: "account_mirror_conversation_freshness",
									state: "partial",
									assetCompleteness: "unknown",
									assetCounts: { known: 0, local: 0, missingLocal: 0 },
								},
							},
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 1,
				artifacts: 0,
				files: 0,
				media: 0,
			},
		}));
		const materializeConversation = vi.fn(
			async (target): Promise<HistoryMaterializationResult> => ({
				object: "history_materialization_result",
				generatedAt: "2026-05-24T14:10:02.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "gemini" },
				manifestPaths: [],
				entries: [],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 0 },
				message: "Unexpected materialization.",
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_gemini_static_route_1",
			now: sequenceNow([
				"2026-05-24T14:10:00.000Z",
				"2026-05-24T14:10:01.000Z",
				"2026-05-24T14:10:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "default",
			reconcile: true,
			refreshSnapshot: true,
			assetKinds: ["all"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeConversation).not.toHaveBeenCalled();
		await expect(service.readJob("hmj_gemini_static_route_1")).resolves.toMatchObject({
			status: "skipped",
			result: {
				metrics: {
					conversations: 0,
					materialized: 0,
				},
			},
		});
	});

	it("records terminal Gemini route misses without spending the next reconciliation target", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-route-miss-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const routeMissReason =
			"conversation-not-found-or-unavailable: Gemini routeability check for conversation=gemini_deleted " +
			"landed on bare /app; treat the cached conversation id as deleted/non-existent in the tenant.";
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-23T16:00:00.000Z",
			kind: "all" as const,
			limit: 50,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "auracall-gemini-pro",
					browserProfileId: "wsl-chrome-2",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 2,
						artifacts: 2,
						files: 0,
						media: 2,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "gemini_deleted",
								title: "Deleted image conversation",
								provider: "gemini" as const,
								url: "https://gemini.google.com/app/gemini_deleted",
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								cachedMediaCount: 1,
							},
							{
								id: "gemini_routeable",
								title: "Rail discovered image conversation",
								provider: "gemini" as const,
								url: "https://gemini.google.com/app/gemini_routeable",
								cachedArtifactCount: 1,
								cachedFileCount: 0,
								cachedMediaCount: 1,
							},
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 2,
				artifacts: 2,
				files: 0,
				media: 2,
			},
		}));
		const materializeConversation = vi.fn(async (target): Promise<HistoryMaterializationResult> => {
			if (target.conversationId === "gemini_deleted") {
				return {
					object: "history_materialization_result",
					generatedAt: "2026-05-23T16:01:00.000Z",
					status: "skipped",
					target,
					source: { type: "reconciliation", provider: "gemini" },
					manifestPaths: [],
					entries: [
						{
							kind: "media",
							providerId: null,
							title: null,
							status: "failed",
							localPath: null,
							remoteUrl: null,
							cacheKey: null,
							checksumSha256: null,
							mimeType: null,
							size: null,
							materializationMethod: null,
							reason: routeMissReason,
							archiveItemId: null,
							assetRoute: null,
						},
					],
					archiveItems: [],
					metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 1 },
					message: routeMissReason,
				};
			}
			return {
				object: "history_materialization_result",
				generatedAt: "2026-05-23T16:02:00.000Z",
				status: "materialized",
				target,
				source: { type: "reconciliation", provider: "gemini" },
				manifestPaths: ["/tmp/gemini_routeable/artifact-fetch-manifest.json"],
				entries: [
					{
						kind: "media",
						providerId: "gemini-artifact:gemini_routeable:1:0",
						title: "Generated image 1.png",
						status: "materialized",
						localPath: "/tmp/gemini_routeable/Generated image 1.png",
						remoteUrl: null,
						cacheKey: "sha256:routeable",
						checksumSha256: "routeable",
						mimeType: "image/png",
						size: 123,
						materializationMethod: "download-button",
						reason: null,
						archiveItemId: null,
						assetRoute: null,
					},
				],
				archiveItems: [],
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				message: "Recovered one Gemini image.",
			};
		});
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			generateId: () => "hmj_gemini_route_miss_1",
			now: sequenceNow([
				"2026-05-23T16:00:00.000Z",
				"2026-05-23T16:00:01.000Z",
				"2026-05-23T16:00:02.000Z",
				"2026-05-23T16:00:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeConversation,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "auracall-gemini-pro",
			reconcile: true,
			assetKinds: ["media"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(readCatalog).toHaveBeenCalledWith({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			kind: "all",
			limit: 50,
		});
		expect(materializeConversation.mock.calls.map(([target]) => target.conversationId)).toEqual([
			"gemini_deleted",
			"gemini_routeable",
		]);
		const completed = await service.readJob("hmj_gemini_route_miss_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			source: { type: "reconciliation", provider: "gemini" },
			result: {
				status: "materialized",
				metrics: {
					conversations: 2,
					materialized: 1,
					failed: 1,
				},
				entries: [
					{
						kind: "media",
						status: "failed",
						reason: expect.stringContaining("conversation-not-found-or-unavailable"),
					},
					{
						kind: "media",
						status: "materialized",
						providerId: "gemini-artifact:gemini_routeable:1:0",
					},
				],
			},
		});
	});

	it("reconciles unavailable Gemini media-generation rows through matched account-mirror conversations", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-media-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		const mediaPath = path.join(homeDir, "gemini.png");
		await fs.writeFile(mediaPath, "png");
		let scheduled: (() => Promise<void>) | undefined;
		const prompt = "Generate an image of an asphalt secret agent";
		const generatedArchiveItem = buildArchiveItem({
			id: "generated-artifact:medgen_1:artifact_followup_1",
			kind: "generated_artifact",
			source: "media_generation",
			title: "artifact_followup_1",
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_1",
			artifactId: "artifact_followup_1",
			fileName: "artifact_followup_1.png",
			mimeType: "image/png",
			fileAvailable: false,
			metadata: {
				mediaType: "image",
			},
		});
		const baseArchiveItem = buildArchiveItem({
			id: "media-generation:medgen_1",
			kind: "media_generation",
			source: "media_generation",
			title: prompt,
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_1",
			metadata: {
				mediaType: "image",
			},
		});
		const materializedArchiveItem = {
			...generatedArchiveItem,
			localPath: mediaPath,
			uri: `file://${mediaPath}`,
			fileAvailable: true,
			links: {
				asset: "/v1/archive/items/b64/gemini/asset",
			},
		};
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-22T18:30:00.000Z",
			kind: "all" as const,
			limit: 5,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "default",
					browserProfileId: "wsl-chrome-2",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 2,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "gemini_stale_conv",
								title: prompt,
								provider: "gemini" as const,
								updatedAt: "2026-05-22T18:00:00.000Z",
								cachedArtifactCount: 0,
								cachedFileCount: 0,
							},
							{
								id: "gemini_conv_1",
								title: prompt,
								provider: "gemini" as const,
								updatedAt: "2026-05-17T22:09:47.000Z",
								cachedArtifactCount: 0,
								cachedFileCount: 0,
							},
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 2,
				artifacts: 0,
				files: 0,
				media: 0,
			},
		}));
		const runArchiveService = {
			listItems: vi.fn(async () => ({
				object: "run_archive" as const,
				generatedAt: "2026-05-22T18:30:01.000Z",
				kind: "generated_artifact" as const,
				limit: 10,
				items: [generatedArchiveItem],
				metrics: {
					total: 1,
					byKind: {
						response: 0,
						response_batch: 0,
						team_run: 0,
						media_generation: 0,
						upload: 0,
						generated_artifact: 1,
						provider_conversation: 0,
						evidence: 0,
					},
				},
			})),
			readItem: vi.fn(async (id: string) => {
				if (id === "media-generation:medgen_1") {
					return {
						object: "run_archive_item_detail" as const,
						generatedAt: "2026-05-22T18:30:02.000Z",
						item: baseArchiveItem,
					};
				}
				if (id === "generated-artifact:medgen_1:artifact_followup_1") {
					return {
						object: "run_archive_item_detail" as const,
						generatedAt: "2026-05-22T18:30:03.000Z",
						item: materializedArchiveItem,
					};
				}
				return null;
			}),
			upsertMediaGenerationItems: vi.fn(async () => ({
				object: "run_archive_backfill" as const,
				generatedAt: "2026-05-22T18:30:04.000Z",
				index: {
					updatedAt: "2026-05-22T18:30:04.000Z",
					itemCount: 2,
				},
				metrics: {
					byKind: {
						response: 0,
						response_batch: 0,
						team_run: 0,
						media_generation: 1,
						upload: 0,
						generated_artifact: 1,
						provider_conversation: 0,
						evidence: 0,
					},
				},
			})),
		} as unknown as RunArchiveService;
		const materializeMediaGeneration = vi.fn(
			async (_request: HistoryMediaGenerationMaterializeInput) => ({
				id: "medgen_1",
				object: "media_generation" as const,
				status: "succeeded" as const,
				provider: "gemini" as const,
				mediaType: "image" as const,
				prompt,
				createdAt: "2026-05-17T22:09:45.957Z",
				updatedAt: "2026-05-22T18:31:00.000Z",
				completedAt: "2026-05-22T18:31:00.000Z",
				artifacts: [
					{
						id: "artifact_followup_1",
						type: "image" as const,
						mimeType: "image/png",
						fileName: "gemini.png",
						path: mediaPath,
						uri: `file://${mediaPath}`,
						metadata: {
							materialization: "download-button-anchor-fetch",
							size: 3,
						},
					},
				],
				metadata: {
					conversationId: "gemini_conv_1",
				},
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			runArchiveService,
			generateId: () => "hmj_gemini_media_1",
			now: sequenceNow([
				"2026-05-22T18:30:00.000Z",
				"2026-05-22T18:30:01.000Z",
				"2026-05-22T18:30:02.000Z",
				"2026-05-22T18:30:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeMediaGeneration,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "default",
			reconcile: true,
			assetKinds: ["media"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(readCatalog).toHaveBeenCalledWith({
			provider: "gemini",
			runtimeProfileId: "default",
			kind: "all",
			limit: 50,
		});
		expect(runArchiveService.listItems).toHaveBeenCalledWith({
			kind: "generated_artifact",
			provider: "gemini",
			runtimeProfile: null,
			assetAvailability: "unavailable",
			limit: 10,
		});
		expect(materializeMediaGeneration).toHaveBeenCalledWith(
			expect.objectContaining({
				mediaGenerationId: "medgen_1",
				provider: "gemini",
				mediaType: "image",
				runtimeProfile: "default",
				browserProfile: "wsl-chrome-2",
				boundIdentityKey: "user@example.com",
				conversationId: "gemini_conv_1",
				providerConversationUrl: "https://gemini.google.com/app/gemini_conv_1",
				jobId: "hmj_gemini_media_1",
				matchBasis: "exact-title-nearest-time",
				count: 1,
			}),
		);
		expect(runArchiveService.upsertMediaGenerationItems).toHaveBeenCalledWith("medgen_1");
		const completed = await service.readJob("hmj_gemini_media_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			source: { type: "reconciliation", provider: "gemini" },
			result: {
				status: "materialized",
				metrics: {
					conversations: 1,
					materialized: 1,
				},
				entries: [
					{
						kind: "media",
						providerId: "artifact_followup_1",
						status: "materialized",
						localPath: mediaPath,
						mimeType: "image/png",
						materializationMethod: "download-button-anchor-fetch",
						archiveItemId: "generated-artifact:medgen_1:artifact_followup_1",
						assetRoute: "/v1/archive/items/b64/gemini/asset",
					},
				],
			},
		});
	});

	it("uses cached Gemini media evidence to disambiguate duplicate title matches", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-cached-media-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		const mediaPath = path.join(homeDir, "gemini-cached-media.png");
		await fs.writeFile(mediaPath, "png");
		let scheduled: (() => Promise<void>) | undefined;
		const prompt = "Generate an image of an asphalt secret agent";
		const generatedArchiveItem = buildArchiveItem({
			id: "generated-artifact:medgen_cached_media:artifact_followup_1",
			kind: "generated_artifact",
			source: "media_generation",
			title: "artifact_followup_1",
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_cached_media",
			artifactId: "artifact_followup_1",
			fileName: "artifact_followup_1.png",
			mimeType: "image/png",
			fileAvailable: false,
			metadata: {
				mediaType: "image",
			},
		});
		const baseArchiveItem = buildArchiveItem({
			id: "media-generation:medgen_cached_media",
			kind: "media_generation",
			source: "media_generation",
			title: prompt,
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_cached_media",
			metadata: {
				mediaType: "image",
			},
		});
		const materializedArchiveItem = {
			...generatedArchiveItem,
			localPath: mediaPath,
			uri: `file://${mediaPath}`,
			fileAvailable: true,
			links: {
				asset: "/v1/archive/items/b64/gemini-cached-media/asset",
			},
		};
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-22T18:32:00.000Z",
			kind: "all" as const,
			limit: 5,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "default",
					browserProfileId: "wsl-chrome-2",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 2,
						artifacts: 0,
						files: 0,
						media: 1,
					},
					manifests: {
						projects: [],
						conversations: [
							{ id: "gemini_duplicate_1", title: prompt, provider: "gemini" as const },
							{ id: "gemini_duplicate_2", title: prompt, provider: "gemini" as const },
						],
						artifacts: [],
						files: [],
						media: [
							{
								id: "gemini-conversation-artifact:gemini_duplicate_2:artifact_followup_1",
								title: prompt,
								provider: "gemini" as const,
								mediaType: "image" as const,
								conversationId: "gemini_duplicate_2",
							},
						],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 2,
				artifacts: 0,
				files: 0,
				media: 1,
			},
		}));
		const runArchiveService = {
			listItems: vi.fn(async () => ({
				object: "run_archive" as const,
				generatedAt: "2026-05-22T18:32:01.000Z",
				kind: "generated_artifact" as const,
				limit: 10,
				items: [generatedArchiveItem],
				metrics: {
					total: 1,
					byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
				},
			})),
			readItem: vi.fn(async (id: string) => {
				if (id === "media-generation:medgen_cached_media") {
					return {
						object: "run_archive_item_detail" as const,
						generatedAt: "2026-05-22T18:32:02.000Z",
						item: baseArchiveItem,
					};
				}
				if (id === "generated-artifact:medgen_cached_media:artifact_followup_1") {
					return {
						object: "run_archive_item_detail" as const,
						generatedAt: "2026-05-22T18:32:03.000Z",
						item: materializedArchiveItem,
					};
				}
				return null;
			}),
			upsertMediaGenerationItems: vi.fn(async () => ({
				object: "run_archive_backfill" as const,
				generatedAt: "2026-05-22T18:32:04.000Z",
				index: {
					updatedAt: "2026-05-22T18:32:04.000Z",
					itemCount: 2,
				},
				metrics: {
					byKind: emptyArchiveKindCounts({ media_generation: 1, generated_artifact: 1 }),
				},
			})),
		} as unknown as RunArchiveService;
		const materializeMediaGeneration = vi.fn(
			async (_request: HistoryMediaGenerationMaterializeInput) => ({
				id: "medgen_cached_media",
				object: "media_generation" as const,
				status: "succeeded" as const,
				provider: "gemini" as const,
				mediaType: "image" as const,
				prompt,
				createdAt: "2026-05-17T22:09:45.957Z",
				updatedAt: "2026-05-22T18:33:00.000Z",
				completedAt: "2026-05-22T18:33:00.000Z",
				artifacts: [
					{
						id: "artifact_followup_1",
						type: "image" as const,
						mimeType: "image/png",
						fileName: "gemini-cached-media.png",
						path: mediaPath,
						uri: `file://${mediaPath}`,
						metadata: {
							materialization: "download-button-anchor-fetch",
							size: 3,
						},
					},
				],
				metadata: {
					conversationId: "gemini_duplicate_2",
				},
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			runArchiveService,
			generateId: () => "hmj_gemini_cached_media_1",
			now: sequenceNow([
				"2026-05-22T18:32:00.000Z",
				"2026-05-22T18:32:01.000Z",
				"2026-05-22T18:32:02.000Z",
				"2026-05-22T18:32:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeMediaGeneration,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "default",
			reconcile: true,
			assetKinds: ["media"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeMediaGeneration).toHaveBeenCalledWith(
			expect.objectContaining({
				mediaGenerationId: "medgen_cached_media",
				provider: "gemini",
				mediaType: "image",
				runtimeProfile: "default",
				browserProfile: "wsl-chrome-2",
				boundIdentityKey: "user@example.com",
				conversationId: "gemini_duplicate_2",
				providerConversationUrl: "https://gemini.google.com/app/gemini_duplicate_2",
				jobId: "hmj_gemini_cached_media_1",
				matchBasis: "exact-title-cached-media",
				count: 1,
			}),
		);
		expect(runArchiveService.upsertMediaGenerationItems).toHaveBeenCalledWith(
			"medgen_cached_media",
		);
		const completed = await service.readJob("hmj_gemini_cached_media_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			source: { type: "reconciliation", provider: "gemini" },
			result: {
				status: "materialized",
				metrics: {
					conversations: 1,
					materialized: 1,
				},
				entries: [
					{
						kind: "media",
						providerId: "artifact_followup_1",
						status: "materialized",
						localPath: mediaPath,
						mimeType: "image/png",
						materializationMethod: "download-button-anchor-fetch",
						archiveItemId: "generated-artifact:medgen_cached_media:artifact_followup_1",
						assetRoute: "/v1/archive/items/b64/gemini-cached-media/asset",
					},
				],
			},
		});
	});

	it("uses direct media provider-conversation evidence without requiring a catalog match", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-direct-media-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		const mediaPath = path.join(homeDir, "gemini-direct.png");
		await fs.writeFile(mediaPath, "png");
		let scheduled: (() => Promise<void>) | undefined;
		const prompt = "Generate an image of an asphalt secret agent";
		const generatedArchiveItem = buildArchiveItem({
			id: "generated-artifact:medgen_direct:artifact_followup_1",
			kind: "generated_artifact",
			source: "media_generation",
			title: "artifact_followup_1",
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_direct",
			providerConversationId: "gemini_direct_conv",
			providerConversationUrl: "https://gemini.google.com/app/gemini_direct_conv",
			artifactId: "artifact_followup_1",
			fileName: "artifact_followup_1.png",
			mimeType: "image/png",
			fileAvailable: false,
			metadata: {
				mediaType: "image",
			},
		});
		const baseArchiveItem = buildArchiveItem({
			id: "media-generation:medgen_direct",
			kind: "media_generation",
			source: "media_generation",
			title: prompt,
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_direct",
			metadata: {
				mediaType: "image",
			},
		});
		const materializedArchiveItem = {
			...generatedArchiveItem,
			localPath: mediaPath,
			uri: `file://${mediaPath}`,
			fileAvailable: true,
			links: {
				asset: "/v1/archive/items/b64/gemini-direct/asset",
			},
		};
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-22T18:35:00.000Z",
			kind: "all" as const,
			limit: 50,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "default",
					browserProfileId: "wsl-chrome-2",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
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
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 0,
				artifacts: 0,
				files: 0,
				media: 0,
			},
		}));
		const runArchiveService = {
			listItems: vi.fn(async () => ({
				object: "run_archive" as const,
				generatedAt: "2026-05-22T18:35:01.000Z",
				kind: "generated_artifact" as const,
				limit: 10,
				items: [generatedArchiveItem],
				metrics: {
					total: 1,
					byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
				},
			})),
			readItem: vi.fn(async (id: string) => {
				if (id === "media-generation:medgen_direct") {
					return {
						object: "run_archive_item_detail" as const,
						generatedAt: "2026-05-22T18:35:02.000Z",
						item: baseArchiveItem,
					};
				}
				if (id === "generated-artifact:medgen_direct:artifact_followup_1") {
					return {
						object: "run_archive_item_detail" as const,
						generatedAt: "2026-05-22T18:35:03.000Z",
						item: materializedArchiveItem,
					};
				}
				return null;
			}),
			upsertMediaGenerationItems: vi.fn(async () => ({
				object: "run_archive_backfill" as const,
				generatedAt: "2026-05-22T18:35:04.000Z",
				index: {
					updatedAt: "2026-05-22T18:35:04.000Z",
					itemCount: 2,
				},
				metrics: {
					byKind: emptyArchiveKindCounts({ media_generation: 1, generated_artifact: 1 }),
				},
			})),
		} as unknown as RunArchiveService;
		const materializeMediaGeneration = vi.fn(
			async (_request: HistoryMediaGenerationMaterializeInput) => ({
				id: "medgen_direct",
				object: "media_generation" as const,
				status: "succeeded" as const,
				provider: "gemini" as const,
				mediaType: "image" as const,
				prompt,
				createdAt: "2026-05-17T22:09:45.957Z",
				updatedAt: "2026-05-22T18:36:00.000Z",
				completedAt: "2026-05-22T18:36:00.000Z",
				artifacts: [
					{
						id: "artifact_followup_1",
						type: "image" as const,
						mimeType: "image/png",
						fileName: "gemini-direct.png",
						path: mediaPath,
						uri: `file://${mediaPath}`,
						metadata: {
							materialization: "download-button-anchor-fetch",
						},
					},
				],
				metadata: {
					conversationId: "gemini_direct_conv",
				},
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			runArchiveService,
			generateId: () => "hmj_gemini_direct_media_1",
			now: sequenceNow([
				"2026-05-22T18:35:00.000Z",
				"2026-05-22T18:35:01.000Z",
				"2026-05-22T18:35:02.000Z",
				"2026-05-22T18:35:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeMediaGeneration,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "default",
			browserProfile: "wsl-chrome-2",
			boundIdentityKey: "user@example.com",
			reconcile: true,
			assetKinds: ["media"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(readCatalog).toHaveBeenCalledWith({
			provider: "gemini",
			runtimeProfileId: "default",
			kind: "all",
			limit: 50,
		});
		expect(materializeMediaGeneration).toHaveBeenCalledWith(
			expect.objectContaining({
				mediaGenerationId: "medgen_direct",
				provider: "gemini",
				runtimeProfile: "default",
				browserProfile: "wsl-chrome-2",
				boundIdentityKey: "user@example.com",
				conversationId: "gemini_direct_conv",
				providerConversationUrl: "https://gemini.google.com/app/gemini_direct_conv",
				matchBasis: "provider-conversation-id",
				jobId: "hmj_gemini_direct_media_1",
			}),
		);
		const completed = await service.readJob("hmj_gemini_direct_media_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			result: {
				status: "materialized",
				entries: [
					{
						kind: "media",
						status: "materialized",
						localPath: mediaPath,
						archiveItemId: "generated-artifact:medgen_direct:artifact_followup_1",
						assetRoute: "/v1/archive/items/b64/gemini-direct/asset",
					},
				],
			},
		});
	});

	it("resolves a generated-artifact archive item through Gemini media history matching", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-archive-media-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		const mediaPath = path.join(homeDir, "gemini-archive.png");
		await fs.writeFile(mediaPath, "png");
		let scheduled: (() => Promise<void>) | undefined;
		const prompt = "Generate an image of an asphalt secret agent";
		const generatedArchiveItem = buildArchiveItem({
			id: "generated-artifact:medgen_archive:artifact_followup_1",
			kind: "generated_artifact",
			source: "media_generation",
			title: "artifact_followup_1",
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_archive",
			artifactId: "artifact_followup_1",
			fileName: "artifact_followup_1.png",
			mimeType: "image/png",
			fileAvailable: false,
			metadata: {
				mediaType: "image",
			},
		});
		const baseArchiveItem = buildArchiveItem({
			id: "media-generation:medgen_archive",
			kind: "media_generation",
			source: "media_generation",
			title: prompt,
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_archive",
			metadata: {
				mediaType: "image",
			},
		});
		const materializedArchiveItem = {
			...generatedArchiveItem,
			localPath: mediaPath,
			uri: `file://${mediaPath}`,
			fileAvailable: true,
			links: {
				asset: "/v1/archive/items/b64/gemini-archive/asset",
			},
		};
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-22T19:00:00.000Z",
			kind: "all" as const,
			limit: 50,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "default",
					browserProfileId: "wsl-chrome-2",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
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
								id: "gemini_archive_conv",
								title: prompt,
								provider: "gemini" as const,
								updatedAt: "2026-05-17T22:09:46.000Z",
								cachedArtifactCount: 0,
								cachedFileCount: 0,
							},
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 1,
				artifacts: 0,
				files: 0,
				media: 0,
			},
		}));
		let archiveRefreshed = false;
		const runArchiveService = {
			listItems: vi.fn(),
			readItem: vi.fn(async (id: string) => {
				if (id === "generated-artifact:medgen_archive:artifact_followup_1") {
					return {
						object: "run_archive_item_detail" as const,
						generatedAt: "2026-05-22T19:00:01.000Z",
						item: archiveRefreshed ? materializedArchiveItem : generatedArchiveItem,
					};
				}
				if (id === "media-generation:medgen_archive") {
					return {
						object: "run_archive_item_detail" as const,
						generatedAt: "2026-05-22T19:00:02.000Z",
						item: baseArchiveItem,
					};
				}
				return null;
			}),
			upsertMediaGenerationItems: vi.fn(async () => {
				archiveRefreshed = true;
				return {
					object: "run_archive_backfill" as const,
					generatedAt: "2026-05-22T19:00:03.000Z",
					index: {
						updatedAt: "2026-05-22T19:00:03.000Z",
						itemCount: 2,
					},
					metrics: {
						byKind: emptyArchiveKindCounts({ media_generation: 1, generated_artifact: 1 }),
					},
				};
			}),
		} as unknown as RunArchiveService;
		const materializeMediaGeneration = vi.fn(
			async (_request: HistoryMediaGenerationMaterializeInput) => ({
				id: "medgen_archive",
				object: "media_generation" as const,
				status: "succeeded" as const,
				provider: "gemini" as const,
				mediaType: "image" as const,
				prompt,
				createdAt: "2026-05-17T22:09:45.957Z",
				updatedAt: "2026-05-22T19:01:00.000Z",
				completedAt: "2026-05-22T19:01:00.000Z",
				artifacts: [
					{
						id: "artifact_followup_1",
						type: "image" as const,
						mimeType: "image/png",
						fileName: "gemini-archive.png",
						path: mediaPath,
						uri: `file://${mediaPath}`,
						metadata: {
							materialization: "download-button-anchor-fetch",
							size: 3,
						},
					},
				],
				metadata: {
					conversationId: "gemini_archive_conv",
				},
			}),
		);
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			runArchiveService,
			generateId: () => "hmj_gemini_archive_media_1",
			now: sequenceNow([
				"2026-05-22T19:00:00.000Z",
				"2026-05-22T19:00:01.000Z",
				"2026-05-22T19:00:02.000Z",
				"2026-05-22T19:00:03.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeMediaGeneration,
		});

		await service.createJob({
			runtimeProfile: "default",
			archiveItemId: "generated-artifact:medgen_archive:artifact_followup_1",
			assetKinds: ["media"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(readCatalog).toHaveBeenCalledWith({
			provider: "gemini",
			runtimeProfileId: "default",
			kind: "all",
			limit: 50,
		});
		expect(runArchiveService.listItems).not.toHaveBeenCalled();
		expect(materializeMediaGeneration).toHaveBeenCalledWith(
			expect.objectContaining({
				mediaGenerationId: "medgen_archive",
				conversationId: "gemini_archive_conv",
				matchBasis: "exact-title",
				jobId: "hmj_gemini_archive_media_1",
			}),
		);
		const completed = await service.readJob("hmj_gemini_archive_media_1");
		expect(completed).toMatchObject({
			status: "succeeded",
			source: {
				type: "archive_item",
				archiveItemId: "generated-artifact:medgen_archive:artifact_followup_1",
			},
			result: {
				status: "materialized",
				entries: [
					{
						kind: "media",
						status: "materialized",
						localPath: mediaPath,
						archiveItemId: "generated-artifact:medgen_archive:artifact_followup_1",
						assetRoute: "/v1/archive/items/b64/gemini-archive/asset",
					},
				],
			},
		});
	});

	it("skips ambiguous Gemini media title matches instead of opening an arbitrary conversation", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-ambiguous-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const prompt = "Generate an image of an asphalt secret agent";
		const generatedArchiveItem = buildArchiveItem({
			id: "generated-artifact:medgen_ambiguous:artifact_followup_1",
			kind: "generated_artifact",
			source: "media_generation",
			title: "artifact_followup_1",
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_ambiguous",
			artifactId: "artifact_followup_1",
			fileName: "artifact_followup_1.png",
			mimeType: "image/png",
			fileAvailable: false,
			metadata: {
				mediaType: "image",
			},
		});
		const baseArchiveItem = buildArchiveItem({
			id: "media-generation:medgen_ambiguous",
			kind: "media_generation",
			source: "media_generation",
			title: prompt,
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_ambiguous",
			metadata: {
				mediaType: "image",
			},
		});
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-22T18:40:00.000Z",
			kind: "all" as const,
			limit: 5,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "default",
					browserProfileId: "wsl-chrome-2",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 2,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{ id: "gemini_duplicate_1", title: prompt, provider: "gemini" as const },
							{ id: "gemini_duplicate_2", title: prompt, provider: "gemini" as const },
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 2,
				artifacts: 0,
				files: 0,
				media: 0,
			},
		}));
		const runArchiveService = {
			listItems: vi.fn(async () => ({
				object: "run_archive" as const,
				generatedAt: "2026-05-22T18:40:01.000Z",
				kind: "generated_artifact" as const,
				limit: 10,
				items: [generatedArchiveItem],
				metrics: {
					total: 1,
					byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
				},
			})),
			readItem: vi.fn(async (id: string) =>
				id === "media-generation:medgen_ambiguous"
					? {
							object: "run_archive_item_detail" as const,
							generatedAt: "2026-05-22T18:40:02.000Z",
							item: baseArchiveItem,
						}
					: null,
			),
			upsertMediaGenerationItems: vi.fn(),
		} as unknown as RunArchiveService;
		const materializeMediaGeneration = vi.fn();
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			runArchiveService,
			generateId: () => "hmj_gemini_ambiguous_1",
			now: sequenceNow([
				"2026-05-22T18:40:00.000Z",
				"2026-05-22T18:40:01.000Z",
				"2026-05-22T18:40:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeMediaGeneration,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "default",
			reconcile: true,
			assetKinds: ["media"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeMediaGeneration).not.toHaveBeenCalled();
		const completed = await service.readJob("hmj_gemini_ambiguous_1");
		if (!completed) throw new Error("Expected completed Gemini ambiguity job.");
		expect(completed).toMatchObject({
			status: "skipped",
			result: {
				entries: [
					{
						kind: "media",
						status: "skipped",
						reason: expect.stringContaining(
							"Ambiguous account-mirror conversations for media generation medgen_ambiguous",
						),
					},
				],
				metrics: {
					materialized: 0,
					skipped: 1,
				},
			},
		});
		expect(completed.result?.entries[0]?.reason).toContain(
			"no unique media recovery evidence is available (0 with cached media, 0 with usable timestamps, 0 with cached artifacts/files)",
		);
	});

	it("keeps Gemini media title matches ambiguous when multiple cached media matches exist", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-multi-media-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const prompt = "Generate an image of an asphalt secret agent";
		const generatedArchiveItem = buildArchiveItem({
			id: "generated-artifact:medgen_multi_media:artifact_followup_1",
			kind: "generated_artifact",
			source: "media_generation",
			title: "artifact_followup_1",
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_multi_media",
			artifactId: "artifact_followup_1",
			fileName: "artifact_followup_1.png",
			mimeType: "image/png",
			fileAvailable: false,
			metadata: {
				mediaType: "image",
			},
		});
		const baseArchiveItem = buildArchiveItem({
			id: "media-generation:medgen_multi_media",
			kind: "media_generation",
			source: "media_generation",
			title: prompt,
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_multi_media",
			metadata: {
				mediaType: "image",
			},
		});
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-22T18:44:00.000Z",
			kind: "all" as const,
			limit: 5,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "default",
					browserProfileId: "wsl-chrome-2",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 2,
						artifacts: 0,
						files: 0,
						media: 2,
					},
					manifests: {
						projects: [],
						conversations: [
							{ id: "gemini_duplicate_media_1", title: prompt, provider: "gemini" as const },
							{ id: "gemini_duplicate_media_2", title: prompt, provider: "gemini" as const },
						],
						artifacts: [],
						files: [],
						media: [
							{
								id: "gemini-conversation-artifact:gemini_duplicate_media_1:artifact_followup_1",
								title: prompt,
								provider: "gemini" as const,
								mediaType: "image" as const,
								conversationId: "gemini_duplicate_media_1",
							},
							{
								id: "gemini-conversation-artifact:gemini_duplicate_media_2:artifact_followup_1",
								title: prompt,
								provider: "gemini" as const,
								mediaType: "image" as const,
								conversationId: "gemini_duplicate_media_2",
							},
						],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 2,
				artifacts: 0,
				files: 0,
				media: 2,
			},
		}));
		const runArchiveService = {
			listItems: vi.fn(async () => ({
				object: "run_archive" as const,
				generatedAt: "2026-05-22T18:44:01.000Z",
				kind: "generated_artifact" as const,
				limit: 10,
				items: [generatedArchiveItem],
				metrics: {
					total: 1,
					byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
				},
			})),
			readItem: vi.fn(async (id: string) =>
				id === "media-generation:medgen_multi_media"
					? {
							object: "run_archive_item_detail" as const,
							generatedAt: "2026-05-22T18:44:02.000Z",
							item: baseArchiveItem,
						}
					: null,
			),
			upsertMediaGenerationItems: vi.fn(),
		} as unknown as RunArchiveService;
		const materializeMediaGeneration = vi.fn();
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			runArchiveService,
			generateId: () => "hmj_gemini_multi_media_1",
			now: sequenceNow([
				"2026-05-22T18:44:00.000Z",
				"2026-05-22T18:44:01.000Z",
				"2026-05-22T18:44:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeMediaGeneration,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "default",
			reconcile: true,
			assetKinds: ["media"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeMediaGeneration).not.toHaveBeenCalled();
		expect(runArchiveService.upsertMediaGenerationItems).not.toHaveBeenCalled();
		const completed = await service.readJob("hmj_gemini_multi_media_1");
		if (!completed) throw new Error("Expected completed Gemini ambiguity job.");
		expect(completed).toMatchObject({
			status: "skipped",
			result: {
				entries: [
					{
						kind: "media",
						status: "skipped",
						reason: expect.stringContaining(
							"Ambiguous account-mirror conversations for media generation medgen_multi_media",
						),
					},
				],
				metrics: {
					materialized: 0,
					skipped: 1,
				},
			},
		});
		expect(completed.result?.entries[0]?.reason).toContain(
			"no unique media recovery evidence is available (2 with cached media, 0 with usable timestamps, 0 with cached artifacts/files)",
		);
	});

	it("keeps Gemini media title matches ambiguous when nearest timestamp evidence ties", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-gemini-time-tie-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const prompt = "Generate an image of an asphalt secret agent";
		const generatedArchiveItem = buildArchiveItem({
			id: "generated-artifact:medgen_time_tie:artifact_followup_1",
			kind: "generated_artifact",
			source: "media_generation",
			title: "artifact_followup_1",
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_time_tie",
			artifactId: "artifact_followup_1",
			fileName: "artifact_followup_1.png",
			mimeType: "image/png",
			fileAvailable: false,
			metadata: {
				mediaType: "image",
			},
		});
		const baseArchiveItem = buildArchiveItem({
			id: "media-generation:medgen_time_tie",
			kind: "media_generation",
			source: "media_generation",
			title: prompt,
			provider: "gemini",
			runtimeProfile: null,
			mediaGenerationId: "medgen_time_tie",
			metadata: {
				mediaType: "image",
			},
		});
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-22T18:46:00.000Z",
			kind: "all" as const,
			limit: 5,
			entries: [
				{
					provider: "gemini" as const,
					runtimeProfileId: "default",
					browserProfileId: "wsl-chrome-2",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 2,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [
							{
								id: "gemini_duplicate_time_1",
								title: prompt,
								provider: "gemini" as const,
								updatedAt: "2026-05-17T22:09:44.957Z",
								cachedArtifactCount: 0,
								cachedFileCount: 0,
							},
							{
								id: "gemini_duplicate_time_2",
								title: prompt,
								provider: "gemini" as const,
								updatedAt: "2026-05-17T22:09:46.957Z",
								cachedArtifactCount: 0,
								cachedFileCount: 0,
							},
						],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 2,
				artifacts: 0,
				files: 0,
				media: 0,
			},
		}));
		const runArchiveService = {
			listItems: vi.fn(async () => ({
				object: "run_archive" as const,
				generatedAt: "2026-05-22T18:46:01.000Z",
				kind: "generated_artifact" as const,
				limit: 10,
				items: [generatedArchiveItem],
				metrics: {
					total: 1,
					byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
				},
			})),
			readItem: vi.fn(async (id: string) =>
				id === "media-generation:medgen_time_tie"
					? {
							object: "run_archive_item_detail" as const,
							generatedAt: "2026-05-22T18:46:02.000Z",
							item: baseArchiveItem,
						}
					: null,
			),
			upsertMediaGenerationItems: vi.fn(),
		} as unknown as RunArchiveService;
		const materializeMediaGeneration = vi.fn();
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			runArchiveService,
			generateId: () => "hmj_gemini_time_tie_1",
			now: sequenceNow([
				"2026-05-22T18:46:00.000Z",
				"2026-05-22T18:46:01.000Z",
				"2026-05-22T18:46:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeMediaGeneration,
		});

		await service.createJob({
			provider: "gemini",
			runtimeProfile: "default",
			reconcile: true,
			assetKinds: ["media"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeMediaGeneration).not.toHaveBeenCalled();
		expect(runArchiveService.upsertMediaGenerationItems).not.toHaveBeenCalled();
		const completed = await service.readJob("hmj_gemini_time_tie_1");
		if (!completed) throw new Error("Expected completed Gemini timestamp-tie job.");
		expect(completed).toMatchObject({
			status: "skipped",
			result: {
				entries: [
					{
						kind: "media",
						status: "skipped",
						reason: expect.stringContaining(
							"Ambiguous account-mirror conversations for media generation medgen_time_tie",
						),
					},
				],
				metrics: {
					materialized: 0,
					skipped: 1,
				},
			},
		});
		expect(completed.result?.entries[0]?.reason).toContain(
			"no unique media recovery evidence is available (0 with cached media, 2 with usable timestamps, 0 with cached artifacts/files)",
		);
	});

	it("skips Grok media reconciliation before active-surface materialization", async () => {
		const homeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-history-materialize-grok-unsupported-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		let scheduled: (() => Promise<void>) | undefined;
		const prompt = "Generate an image of a chrome robot in a neon control room";
		const generatedArchiveItem = buildArchiveItem({
			id: "generated-artifact:medgen_grok_unsupported:grok_imagine_visible_1",
			kind: "generated_artifact",
			source: "media_generation",
			title: "grok-imagine-visible-1.png",
			provider: "grok",
			runtimeProfile: "default",
			mediaGenerationId: "medgen_grok_unsupported",
			artifactId: "grok_imagine_visible_1",
			fileName: "grok-imagine-visible-1.png",
			mimeType: "image/png",
			fileAvailable: false,
			metadata: {
				mediaType: "image",
			},
		});
		const baseArchiveItem = buildArchiveItem({
			id: "media-generation:medgen_grok_unsupported",
			kind: "media_generation",
			source: "media_generation",
			title: prompt,
			provider: "grok",
			runtimeProfile: "default",
			mediaGenerationId: "medgen_grok_unsupported",
			metadata: {
				mediaType: "image",
			},
		});
		const readCatalog = vi.fn(async () => ({
			object: "account_mirror_catalog" as const,
			generatedAt: "2026-05-22T18:50:00.000Z",
			kind: "all" as const,
			limit: 50,
			entries: [
				{
					provider: "grok" as const,
					runtimeProfileId: "default",
					browserProfileId: "wsl-chrome-2",
					boundIdentityKey: "user@example.com",
					status: "eligible" as const,
					reason: "eligible" as const,
					mirrorCompleteness: {
						state: "complete" as const,
						summary: "Complete.",
						remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					counts: {
						projects: 0,
						conversations: 1,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					manifests: {
						projects: [],
						conversations: [{ id: "grok_conv_1", title: prompt, provider: "grok" as const }],
						artifacts: [],
						files: [],
						media: [],
					},
				},
			],
			metrics: {
				targets: 1,
				projects: 0,
				conversations: 1,
				artifacts: 0,
				files: 0,
				media: 0,
			},
		}));
		const runArchiveService = {
			listItems: vi.fn(async () => ({
				object: "run_archive" as const,
				generatedAt: "2026-05-22T18:50:01.000Z",
				kind: "generated_artifact" as const,
				limit: 10,
				items: [generatedArchiveItem],
				metrics: {
					total: 1,
					byKind: emptyArchiveKindCounts({ generated_artifact: 1 }),
				},
			})),
			readItem: vi.fn(async (id: string) =>
				id === "media-generation:medgen_grok_unsupported"
					? {
							object: "run_archive_item_detail" as const,
							generatedAt: "2026-05-22T18:50:02.000Z",
							item: baseArchiveItem,
						}
					: null,
			),
			upsertMediaGenerationItems: vi.fn(),
		} as unknown as RunArchiveService;
		const materializeMediaGeneration = vi.fn();
		const service = createHistoryMaterializationService({
			config: {},
			catalogService: {
				readCatalog,
				readItem: vi.fn(),
			},
			runArchiveService,
			generateId: () => "hmj_grok_unsupported_1",
			now: sequenceNow([
				"2026-05-22T18:50:00.000Z",
				"2026-05-22T18:50:01.000Z",
				"2026-05-22T18:50:02.000Z",
			]),
			schedule: (work) => {
				scheduled = work;
			},
			materializeMediaGeneration,
		});

		await service.createJob({
			provider: "grok",
			runtimeProfile: "default",
			reconcile: true,
			assetKinds: ["media"],
			maxItems: 1,
		});
		if (!scheduled) throw new Error("Expected job to be scheduled.");
		await scheduled();

		expect(materializeMediaGeneration).not.toHaveBeenCalled();
		expect(runArchiveService.upsertMediaGenerationItems).not.toHaveBeenCalled();
		const completed = await service.readJob("hmj_grok_unsupported_1");
		expect(completed).toMatchObject({
			status: "skipped",
			source: { type: "reconciliation", provider: "grok" },
			result: {
				entries: [
					{
						kind: "media",
						status: "skipped",
						reason: expect.stringContaining("Grok history media materialization is not supported"),
					},
				],
				metrics: {
					materialized: 0,
					skipped: 1,
				},
			},
		});
	});
});

function sequenceNow(values: string[]): () => Date {
	let index = 0;
	return () =>
		new Date(
			values[Math.min(index++, values.length - 1)] ?? values.at(-1) ?? new Date().toISOString(),
		);
}

function sequenceId(values: string[]): () => string {
	let index = 0;
	return () =>
		values[Math.min(index++, values.length - 1)] ?? values.at(-1) ?? "hmj_sequence_fallback";
}

function createInMemoryHistoryMaterializationJobStore(
	initialJobs: HistoryMaterializationJob[],
): HistoryMaterializationJobStore {
	let jobs = [...initialJobs];
	return {
		async listJobs() {
			return [...jobs];
		},
		async readJob(id: string) {
			return jobs.find((job) => job.id === id) ?? null;
		},
		async upsertJob(job: HistoryMaterializationJob) {
			jobs = [job, ...jobs.filter((candidate) => candidate.id !== job.id)];
		},
	};
}

function buildHistoryMaterializationJob(
	overrides: Partial<HistoryMaterializationJob> & {
		id: string;
		status: HistoryMaterializationJob["status"];
	},
): HistoryMaterializationJob {
	const { id, status, ...rest } = overrides;
	const active = status === "queued" || status === "running";
	const started = status === "running" || (!active && status !== "cancelled");
	return {
		object: "history_materialization_job",
		id,
		source: {
			type: "conversation",
			provider: "chatgpt",
			conversationId: `${id}_conversation`,
		},
		request: {
			provider: "chatgpt",
			runtimeProfile: "default",
			conversationId: `${id}_conversation`,
			assetKinds: ["artifacts"],
		},
		sourceKey: id,
		status,
		createdAt: "2026-05-22T18:05:00.000Z",
		updatedAt: "2026-05-22T18:05:00.000Z",
		startedAt: started ? "2026-05-22T18:05:01.000Z" : null,
		completedAt: active ? null : "2026-05-22T18:05:02.000Z",
		attemptCount: status === "queued" ? 0 : 1,
		result: null,
		error: null,
		message: "History materialization job fixture.",
		...rest,
	};
}

function buildArchiveItem(overrides: Partial<RunArchiveItem>): RunArchiveItem {
	return {
		id: "archive-item",
		object: "run_archive_item",
		kind: "generated_artifact",
		source: "media_generation",
		createdAt: "2026-05-17T22:09:45.957Z",
		updatedAt: "2026-05-17T22:09:45.957Z",
		title: null,
		status: "succeeded",
		runtimeState: null,
		provider: null,
		runtimeProfile: null,
		browserProfile: null,
		projectId: null,
		boundIdentityKey: null,
		agentId: null,
		teamId: null,
		responseId: null,
		batchId: null,
		batchIndex: null,
		mediaGenerationId: null,
		providerConversationId: null,
		providerConversationUrl: null,
		artifactId: null,
		fileName: null,
		mimeType: null,
		localPath: null,
		uri: null,
		cacheKey: null,
		checksumSha256: null,
		fileAvailable: null,
		metadata: {},
		links: {},
		...overrides,
	};
}

function emptyArchiveKindCounts(
	overrides: Partial<Record<RunArchiveItem["kind"], number>> = {},
): Record<RunArchiveItem["kind"], number> {
	return {
		response: 0,
		response_batch: 0,
		team_run: 0,
		media_generation: 0,
		upload: 0,
		generated_artifact: 0,
		provider_conversation: 0,
		evidence: 0,
		...overrides,
	};
}
