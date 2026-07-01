import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	allocateConversationReadBudgets,
	buildGeminiRouteProgressEvidence,
	createChatgptAccountMirrorMetadataCollector,
	mapChatgptLibraryFilesToArtifacts,
	mapGeminiConversationArtifactsToMediaManifest,
	mapGrokAccountFilesToMediaManifest,
	readAccountMirrorProviderIdentityKeyForTest,
	readBoundedAttachmentInventory,
	readBoundedChatgptDetailInventory,
	readBoundedChatgptLibraryInventory,
	readBoundedConversations,
	readBoundedGeminiDetailInventory,
	readBoundedGrokAccountFileInventory,
	readBoundedGrokDetailInventory,
	readBoundedProjectConversations,
	readBoundedProjects,
	selectAttachmentInventoryCursorForProviderSweep,
	selectAttachmentInventoryCursorForSweep,
	selectConversationDetailCandidates,
	selectDetailAttachmentCursorForFreshnessFrontier,
	selectProjectConversationCursorForRequestedPhase,
	selectProjectConversationCursorForSweep,
	shouldReadProjectConversationsForAccountMirror,
	shouldResumeChatgptAttachmentInventoryCursor,
} from "../../src/accountMirror/chatgptMetadataCollector.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { listDomDriftObservations } from "../../src/browser/domDriftObservations.js";

describe("ChatGPT account mirror metadata collector", () => {
	const cleanup: string[] = [];
	const accountMirrorTabLifecycle = { tabLifecycle: "dispose-new" } as const;
	const accountMirrorConversationOptions = {
		projectId: undefined,
		listOptions: accountMirrorTabLifecycle,
	};
	const accountMirrorContextOptions = (startMessageIndex = 0) => ({
		projectId: undefined,
		refresh: true,
		listOptions: {
			...accountMirrorTabLifecycle,
			accountMirrorContextChunk: {
				startMessageIndex,
				maxMessages: 24,
			},
		},
	});

	afterEach(async () => {
		setAuracallHomeDirOverrideForTest(null);
		await Promise.all(
			cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })),
		);
	});

	async function useTempAuracallHome() {
		const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-mirror-collector-"));
		cleanup.push(homeDir);
		setAuracallHomeDirOverrideForTest(homeDir);
		return homeDir;
	}

	test("fans out project conversations for provider project-history surfaces", () => {
		expect(shouldReadProjectConversationsForAccountMirror("chatgpt")).toBe(true);
		expect(shouldReadProjectConversationsForAccountMirror("gemini")).toBe(true);
		expect(shouldReadProjectConversationsForAccountMirror("grok")).toBe(false);
	});

	test("resumes project conversation cursor when that phase is requested", () => {
		const cursor = {
			nextProjectIndex: 4,
			readLimit: 2,
			scannedProjects: 4,
			yielded: true,
		};

		expect(
			selectProjectConversationCursorForRequestedPhase("steady_follow", "project-conversations", {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: false,
				},
				projectConversations: cursor,
			}),
		).toEqual(cursor);
		expect(
			selectProjectConversationCursorForRequestedPhase("steady_follow", null, {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: false,
				},
				projectConversations: cursor,
			}),
		).toBeNull();
	});

	test("uses provider auth-session email instead of display name or plan labels for ChatGPT", () => {
		expect(
			readAccountMirrorProviderIdentityKeyForTest("chatgpt", {
				email: "Consult@PolymerConsultingGroup.com",
				name: "Consulting PCG Pro",
				accountLevel: "Pro",
				source: "auth-session",
			}),
		).toBe("consult@polymerconsultinggroup.com");
	});

	test("selects only changed conversation rows for steady-follow detail inventory after fresh frontier", () => {
		const conversations = [
			{
				id: "changed",
				title: "Changed",
				provider: "chatgpt" as const,
				updatedAt: "2026-06-27T12:05:00.000Z",
			},
			{
				id: "fresh_1",
				title: "Fresh 1",
				provider: "chatgpt" as const,
				updatedAt: "2026-06-27T11:55:00.000Z",
			},
			{
				id: "fresh_2",
				title: "Fresh 2",
				provider: "chatgpt" as const,
				updatedAt: "2026-06-27T11:54:00.000Z",
			},
			{
				id: "old",
				title: "Old",
				provider: "chatgpt" as const,
				updatedAt: "2026-06-27T11:00:00.000Z",
			},
		];
		const previousConversationFreshness = new Map(
			conversations.map((conversation) => [
				conversation.id,
				{
					conversationId: conversation.id,
					detailObservedAt:
						conversation.id === "changed" ? "2026-06-27T12:00:00.000Z" : "2026-06-27T12:10:00.000Z",
					manifestObservedAt:
						conversation.id === "changed" ? "2026-06-27T12:00:00.000Z" : "2026-06-27T12:10:00.000Z",
					freshnessState: "fresh" as const,
					routeabilityState: "unknown" as const,
					assetCompleteness: "complete" as const,
					missingLocalCount: 0,
					incompleteDetailChunk: false,
				},
			]),
		);

		const selection = selectConversationDetailCandidates({
			provider: "chatgpt",
			sweepMode: "steady_follow",
			conversations,
			previousConversationFreshness,
			attachmentCursor: null,
			freshFrontierThreshold: 2,
		});

		expect(selection.detailConversations.map((conversation) => conversation.id)).toEqual([
			"changed",
		]);
		expect(selection.evidence).toMatchObject({
			provider: "chatgpt",
			sweepMode: "steady_follow",
			frontierReached: true,
			rowsSelectedForDetail: 1,
			firstStoppedRow: {
				conversationId: "fresh_2",
			},
		});
	});

	test("resets steady-follow detail cursor to newest selected rows after frontier filtering", () => {
		const selection = selectConversationDetailCandidates({
			provider: "chatgpt",
			sweepMode: "steady_follow",
			conversations: [
				{
					id: "stale_1",
					title: "Stale 1",
					provider: "chatgpt",
					updatedAt: "2026-06-27T12:00:00.000Z",
				},
				{
					id: "stale_2",
					title: "Stale 2",
					provider: "chatgpt",
					updatedAt: "2026-06-27T11:00:00.000Z",
				},
				{
					id: "fresh_1",
					title: "Fresh 1",
					provider: "chatgpt",
					updatedAt: "2026-06-27T10:00:00.000Z",
				},
			],
			previousConversationFreshness: new Map([
				[
					"stale_1",
					{
						conversationId: "stale_1",
						detailObservedAt: "2026-06-27T11:00:00.000Z",
						manifestObservedAt: "2026-06-27T11:00:00.000Z",
						freshnessState: "stale",
						routeabilityState: "unknown",
						assetCompleteness: "complete",
						missingLocalCount: 0,
						incompleteDetailChunk: false,
					},
				],
				[
					"stale_2",
					{
						conversationId: "stale_2",
						detailObservedAt: "2026-06-27T10:00:00.000Z",
						manifestObservedAt: "2026-06-27T10:00:00.000Z",
						freshnessState: "stale",
						routeabilityState: "unknown",
						assetCompleteness: "complete",
						missingLocalCount: 0,
						incompleteDetailChunk: false,
					},
				],
				[
					"fresh_1",
					{
						conversationId: "fresh_1",
						detailObservedAt: "2026-06-27T10:30:00.000Z",
						manifestObservedAt: "2026-06-27T10:30:00.000Z",
						freshnessState: "fresh",
						routeabilityState: "unknown",
						assetCompleteness: "complete",
						missingLocalCount: 0,
						incompleteDetailChunk: false,
					},
				],
			]),
			attachmentCursor: {
				nextProjectIndex: 8,
				nextConversationIndex: 12,
				detailReadLimit: 4,
				scannedProjects: 0,
				scannedConversations: 4,
				conversationDetail: null,
				yielded: false,
			},
			freshFrontierThreshold: 3,
		});

		expect(selection.evidence).toMatchObject({
			rowsExamined: 3,
			rowsSelectedForDetail: 2,
			frontierReached: false,
		});
		expect(
			selectDetailAttachmentCursorForFreshnessFrontier({
				provider: "chatgpt",
				sweepMode: "steady_follow",
				attachmentCursor: {
					nextProjectIndex: 8,
					nextConversationIndex: 12,
					detailReadLimit: 4,
					scannedProjects: 0,
					scannedConversations: 4,
					conversationDetail: null,
					yielded: false,
				},
				frontierEvidence: selection.evidence,
				detailConversations: selection.detailConversations,
				projectsLength: 8,
			}),
		).toMatchObject({
			nextProjectIndex: 8,
			nextConversationIndex: 0,
		});
	});

	test("preserves incomplete detail cursor even when frontier filtering occurred", () => {
		const cursor = {
			nextProjectIndex: 8,
			nextConversationIndex: 12,
			detailReadLimit: 4,
			scannedProjects: 0,
			scannedConversations: 4,
			conversationDetail: {
				conversationId: "chunked",
				nextMessageIndex: 24,
				messageLimit: 24,
				totalMessages: 60,
			},
			yielded: false,
		};
		const selected = [
			{ id: "before", title: "Before", provider: "chatgpt" as const },
			{ id: "chunked", title: "Chunked", provider: "chatgpt" as const },
		];

		expect(
			selectDetailAttachmentCursorForFreshnessFrontier({
				provider: "chatgpt",
				sweepMode: "steady_follow",
				attachmentCursor: cursor,
				frontierEvidence: {
					object: "account_mirror_conversation_freshness_frontier",
					provider: "chatgpt",
					sweepMode: "steady_follow",
					threshold: 3,
					rowsExamined: 3,
					rowsSelectedForDetail: 2,
					frontierReached: false,
					firstStoppedRow: null,
					fallbackReason: "cached_state_not_fresh",
					selectedConversationIds: ["before", "chunked"],
					rowEvidence: [],
				},
				detailConversations: selected,
				projectsLength: 8,
			}),
		).toMatchObject({
			nextConversationIndex: 1,
			conversationDetail: {
				conversationId: "chunked",
				nextMessageIndex: 24,
			},
		});
	});

	test("does not derive ChatGPT account identity from display name when email is absent", () => {
		expect(
			readAccountMirrorProviderIdentityKeyForTest("chatgpt", {
				name: "Consulting PCG Pro",
				accountLevel: "Pro",
				source: "auth-session",
			}),
		).toBeNull();
	});

	test("reserves bounded conversation budget for project histories", () => {
		expect(allocateConversationReadBudgets("gemini", 80, 12)).toEqual({
			rootRows: 68,
			projectRows: 12,
		});
		expect(allocateConversationReadBudgets("chatgpt", 250, 6)).toEqual({
			rootRows: 244,
			projectRows: 6,
		});
		expect(allocateConversationReadBudgets("grok", 160, 6)).toEqual({
			rootRows: 160,
			projectRows: 0,
		});
	});

	test("uses prior attachment cursor for full-sweep and incomplete ChatGPT steady-follow", () => {
		const previousEvidence = {
			identitySource: "profile-menu",
			projectSampleIds: [],
			conversationSampleIds: ["conv_recent"],
			truncated: {
				projects: false,
				conversations: false,
				artifacts: true,
			},
			attachmentInventory: {
				nextProjectIndex: 4,
				nextConversationIndex: 9,
				detailReadLimit: 2,
				scannedProjects: 1,
				scannedConversations: 2,
				yielded: false,
				yieldCause: null,
			},
			assetInventory: {
				state: "in_progress" as const,
				summary: "Asset inventory is still in progress because detail inventory was truncated.",
				detailScannedThisPass: {
					projects: 0,
					conversations: 1,
					total: 1,
				},
				localMaterialized: {
					artifacts: 0,
					files: 0,
					media: 0,
				},
				remoteKnownMissingLocal: {
					artifacts: 64,
					files: 73,
					media: 0,
				},
				unknownOrDeferred: {
					artifacts: 0,
					files: 0,
					media: 0,
				},
			},
			projectConversations: {
				nextProjectIndex: 3,
				readLimit: 4,
				scannedProjects: 4,
				yielded: false,
			},
		};

		expect(selectAttachmentInventoryCursorForSweep("steady_follow", previousEvidence)).toBeNull();
		expect(selectAttachmentInventoryCursorForSweep(undefined, previousEvidence)).toBeNull();
		expect(
			selectAttachmentInventoryCursorForProviderSweep("chatgpt", "steady_follow", previousEvidence),
		).toBe(previousEvidence.attachmentInventory);
		expect(shouldResumeChatgptAttachmentInventoryCursor(previousEvidence)).toBe(true);
		expect(selectAttachmentInventoryCursorForSweep("full_sweep", previousEvidence)).toBe(
			previousEvidence.attachmentInventory,
		);
		expect(selectProjectConversationCursorForSweep("steady_follow", previousEvidence)).toBeNull();
		expect(selectProjectConversationCursorForSweep(undefined, previousEvidence)).toBeNull();
		expect(selectProjectConversationCursorForSweep("full_sweep", previousEvidence)).toBe(
			previousEvidence.projectConversations,
		);
	});

	test("starts fresh for ChatGPT steady-follow when prior detail inventory is complete", () => {
		const previousEvidence = {
			identitySource: "profile-menu",
			projectSampleIds: [],
			conversationSampleIds: ["conv_recent"],
			attachmentInventory: {
				nextProjectIndex: 0,
				nextConversationIndex: 0,
				detailReadLimit: 4,
				scannedProjects: 0,
				scannedConversations: 4,
				yielded: false,
				yieldCause: null,
			},
			assetInventory: {
				state: "complete" as const,
				summary: "Asset inventory is complete.",
				detailScannedThisPass: {
					projects: 0,
					conversations: 4,
					total: 4,
				},
				localMaterialized: {
					artifacts: 0,
					files: 0,
					media: 0,
				},
				remoteKnownMissingLocal: {
					artifacts: 0,
					files: 0,
					media: 0,
				},
				unknownOrDeferred: {
					artifacts: 0,
					files: 0,
					media: 0,
				},
			},
			truncated: {
				projects: false,
				conversations: false,
				artifacts: false,
			},
		};

		expect(
			selectAttachmentInventoryCursorForProviderSweep("chatgpt", "steady_follow", previousEvidence),
		).toBeNull();
		expect(shouldResumeChatgptAttachmentInventoryCursor(previousEvidence)).toBe(false);
	});

	test("can tolerate transient provider project route failures for Gemini live follow", async () => {
		const client = {
			listProjects: vi.fn(async () => {
				throw new Error("Gemini Gem manager route did not settle");
			}),
		};

		await expect(readBoundedProjects(client, 6, { tolerateReadFailure: true })).resolves.toEqual({
			items: [],
			truncated: false,
		});
		await expect(readBoundedProjects(client, 6)).rejects.toThrow(
			"Gemini Gem manager route did not settle",
		);
	});

	test("passes project click fallback suppression into provider project reads", async () => {
		const client = {
			listProjects: vi.fn(async () => []),
		};

		await expect(
			readBoundedProjects(client, 6, {
				listOptions: { disableProjectClickFallback: true },
			}),
		).resolves.toEqual({
			items: [],
			truncated: false,
		});

		expect(client.listProjects).toHaveBeenCalledWith(
			expect.objectContaining({ disableProjectClickFallback: true }),
		);
	});

	test("can tolerate transient Gemini project conversation route failures", async () => {
		const client = {
			listConversations: vi.fn(async () => {
				throw new Error("Gemini Gem conversation route did not settle");
			}),
		} as unknown as Parameters<typeof readBoundedConversations>[0];

		await expect(
			readBoundedConversations(client, "gem_1", 6, { tolerateReadFailure: true }),
		).resolves.toEqual({
			items: [],
			truncated: false,
		});
		await expect(readBoundedConversations(client, "gem_1", 6)).rejects.toThrow(
			"Gemini Gem conversation route did not settle",
		);
	});

	test("walks bounded project histories across projects before deepening one project", async () => {
		const projects = [
			{ id: "gem_1", name: "Gem 1", provider: "gemini" as const },
			{ id: "gem_2", name: "Gem 2", provider: "gemini" as const },
			{ id: "gem_3", name: "Gem 3", provider: "gemini" as const },
		];
		const client = {
			listConversations: vi.fn(
				async (projectId: string | undefined, options?: { historyLimit?: number }) => {
					const limit = options?.historyLimit ?? 0;
					return Array.from({ length: limit + (projectId === "gem_1" ? 1 : 0) }, (_, index) => ({
						id: `${projectId}_conversation_${index + 1}`,
						title: `${projectId} conversation ${index + 1}`,
						provider: "gemini" as const,
						projectId,
					}));
				},
			),
		} as unknown as Parameters<typeof readBoundedProjectConversations>[0];

		const result = await readBoundedProjectConversations(client, projects, 4);

		expect(client.listConversations).toHaveBeenNthCalledWith(1, "gem_1", {
			historyLimit: 2,
			includeHistory: true,
		});
		expect(client.listConversations).toHaveBeenNthCalledWith(2, "gem_2", {
			historyLimit: 1,
			includeHistory: true,
		});
		expect(client.listConversations).toHaveBeenNthCalledWith(3, "gem_3", {
			historyLimit: 1,
			includeHistory: true,
		});
		expect(result.items.map((item) => item.id)).toEqual([
			"gem_1_conversation_1",
			"gem_1_conversation_2",
			"gem_2_conversation_1",
			"gem_3_conversation_1",
		]);
		expect(result.truncated).toBe(true);
	});

	test("resumes bounded project histories from the prior full-sweep cursor", async () => {
		const projects = [
			{ id: "gem_1", name: "Gem 1", provider: "gemini" as const },
			{ id: "gem_2", name: "Gem 2", provider: "gemini" as const },
			{ id: "gem_3", name: "Gem 3", provider: "gemini" as const },
			{ id: "gem_4", name: "Gem 4", provider: "gemini" as const },
		];
		const client = {
			listConversations: vi.fn(
				async (projectId: string | undefined, options?: { historyLimit?: number }) => {
					const limit = options?.historyLimit ?? 0;
					return Array.from({ length: limit }, (_, index) => ({
						id: `${projectId}_conversation_${index + 1}`,
						title: `${projectId} conversation ${index + 1}`,
						provider: "gemini" as const,
						projectId,
					}));
				},
			),
		} as unknown as Parameters<typeof readBoundedProjectConversations>[0];

		const first = await readBoundedProjectConversations(client, projects, 8, {
			maxProjectReads: 2,
		});

		expect(client.listConversations).toHaveBeenNthCalledWith(1, "gem_1", {
			historyLimit: 2,
			includeHistory: true,
		});
		expect(client.listConversations).toHaveBeenNthCalledWith(2, "gem_2", {
			historyLimit: 2,
			includeHistory: true,
		});
		expect(first.cursor).toMatchObject({
			nextProjectIndex: 2,
			readLimit: 2,
			scannedProjects: 2,
			yielded: false,
		});
		expect(first.truncated).toBe(true);

		const second = await readBoundedProjectConversations(client, projects, 8, {
			cursor: first.cursor,
			maxProjectReads: 2,
		});

		expect(client.listConversations).toHaveBeenNthCalledWith(3, "gem_3", {
			historyLimit: 4,
			includeHistory: true,
		});
		expect(client.listConversations).toHaveBeenNthCalledWith(4, "gem_4", {
			historyLimit: 4,
			includeHistory: true,
		});
		expect(second.cursor.nextProjectIndex).toBe(0);
		expect(second.truncated).toBe(false);
	});

	test("reads ChatGPT library files as account files and artifacts", async () => {
		const client = {
			listAccountFiles: vi.fn(async () => [
				{
					id: "123e4567-e89b-12d3-a456-426614174000",
					name: "Library report.pdf",
					provider: "chatgpt" as const,
					source: "account" as const,
					remoteUrl: "https://chatgpt.com/library/files/123e4567-e89b-12d3-a456-426614174000",
					metadata: {
						source: "chatgpt-library",
						artifactId: "chatgpt-library:123e4567-e89b-12d3-a456-426614174000",
						artifactKind: "download",
					},
				},
			]),
		};

		const inventory = await readBoundedChatgptLibraryInventory(client, 8);

		expect(client.listAccountFiles).toHaveBeenCalledWith(accountMirrorTabLifecycle);
		expect(inventory).toMatchObject({
			truncated: false,
			files: [
				{
					id: "123e4567-e89b-12d3-a456-426614174000",
					source: "account",
				},
			],
			artifacts: [
				{
					id: "chatgpt-library:123e4567-e89b-12d3-a456-426614174000",
					title: "Library report.pdf",
					kind: "download",
					metadata: {
						fileId: "123e4567-e89b-12d3-a456-426614174000",
						fileSource: "account",
					},
				},
			],
		});
	});

	test("combines ChatGPT library inventory with bounded conversation detail inventory", async () => {
		const client = {
			listAccountFiles: vi.fn(async () => [
				{
					id: "223e4567-e89b-12d3-a456-426614174111",
					name: "Library sheet.xlsx",
					provider: "chatgpt" as const,
					source: "account" as const,
					metadata: {
						source: "chatgpt-library",
						artifactKind: "spreadsheet",
					},
				},
			]),
			listProjectFiles: vi.fn(async () => []),
			listConversationFiles: vi.fn(async (conversationId: string) => [
				{
					id: `conversation-file-${conversationId}`,
					name: "User upload.png",
					provider: "chatgpt" as const,
					source: "conversation" as const,
				},
			]),
			getConversationContext: vi.fn(async () => ({
				provider: "chatgpt" as const,
				conversationId: "conv_1",
				messages: [],
				artifacts: [],
			})),
		};

		const inventory = await readBoundedChatgptDetailInventory(
			client,
			[],
			[{ id: "conv_1", title: "Conversation 1", provider: "chatgpt" }],
			4,
			2,
		);

		expect(inventory.files.map((file) => file.id)).toEqual([
			"223e4567-e89b-12d3-a456-426614174111",
			"conversation-file-conv_1",
		]);
		expect(inventory.artifacts.map((artifact) => artifact.id)).toEqual([
			"chatgpt-library:223e4567-e89b-12d3-a456-426614174111",
		]);
		expect(inventory.truncated).toBe(false);
		expect(client.listConversationFiles).toHaveBeenCalledWith(
			"conv_1",
			accountMirrorConversationOptions,
		);
		expect(client.getConversationContext).toHaveBeenCalledWith(
			"conv_1",
			accountMirrorContextOptions(),
		);
		expect(inventory.cursor).toMatchObject({
			nextConversationIndex: 0,
			scannedConversations: 1,
		});
		expect(inventory.progress).toMatchObject({
			scannedConversationIds: ["conv_1"],
			detailObservedConversationIds: ["conv_1"],
			contextObservedConversationIds: ["conv_1"],
		});
	});

	test("prioritizes selected ChatGPT conversations without account-library reads in targeted steady-follow mode", async () => {
		const calls: string[] = [];
		const client = {
			listAccountFiles: vi.fn(async () => {
				calls.push("listAccountFiles");
				return [
					{
						id: "library-file-1",
						name: "Library file.pdf",
						provider: "chatgpt" as const,
						source: "account" as const,
					},
				];
			}),
			listProjectFiles: vi.fn(async (projectId: string) => {
				calls.push(`listProjectFiles:${projectId}`);
				return [
					{
						id: `project-file-${projectId}`,
						name: "Project file.pdf",
						provider: "chatgpt" as const,
						source: "project" as const,
					},
				];
			}),
			listConversationFiles: vi.fn(async (conversationId: string) => {
				calls.push(`listConversationFiles:${conversationId}`);
				return [
					{
						id: `conversation-file-${conversationId}`,
						name: "Conversation file.csv",
						provider: "chatgpt" as const,
						source: "conversation" as const,
					},
				];
			}),
			getConversationContext: vi.fn(async (conversationId: string) => {
				calls.push(`getConversationContext:${conversationId}`);
				return {
					provider: "chatgpt" as const,
					conversationId,
					messages: [],
					artifacts: [
						{
							id: `artifact-${conversationId}`,
							title: "Generated table",
							kind: "spreadsheet" as const,
						},
					],
				};
			}),
		};

		const inventory = await readBoundedChatgptDetailInventory(
			client,
			[{ id: "project_1", name: "Project 1", provider: "chatgpt" }],
			[{ id: "conv_artifact", title: "Artifact chat", provider: "chatgpt" }],
			8,
			{
				maxDetailReads: 1,
				prioritizeConversations: true,
				skipAccountLibraryInventory: true,
			},
		);

		expect(calls).toEqual([
			"listConversationFiles:conv_artifact",
			"getConversationContext:conv_artifact",
		]);
		expect(client.listAccountFiles).not.toHaveBeenCalled();
		expect(client.listProjectFiles).not.toHaveBeenCalled();
		expect(inventory.files.map((file) => file.id)).toEqual(["conversation-file-conv_artifact"]);
		expect(inventory.artifacts.map((artifact) => artifact.id)).toEqual(["artifact-conv_artifact"]);
		expect(inventory.progress).toMatchObject({
			scannedProjectIds: [],
			scannedConversationIds: ["conv_artifact"],
			detailObservedConversationIds: ["conv_artifact"],
			artifactBearingConversationIds: ["conv_artifact"],
			fileBearingConversationIds: ["conv_artifact"],
		});
	});

	test("honors requested detail-inventory phase without root or project rail reads", async () => {
		const calls: string[] = [];
		const client = {
			getUserIdentity: vi.fn(async () => ({
				email: "ecochran76@gmail.com",
				accountLevel: "Business",
				source: "auth-session",
			})),
			listProjects: vi.fn(async () => {
				calls.push("listProjects");
				throw new Error("projects should not be read");
			}),
			listConversations: vi.fn(async () => {
				calls.push("listConversations");
				throw new Error("conversations should not be read");
			}),
			listAccountFiles: vi.fn(async () => {
				calls.push("listAccountFiles");
				return [];
			}),
			listProjectFiles: vi.fn(async () => {
				calls.push("listProjectFiles");
				return [];
			}),
			listConversationFiles: vi.fn(async (conversationId: string) => {
				calls.push(`listConversationFiles:${conversationId}`);
				return [
					{
						id: `conversation-file-${conversationId}`,
						name: "Conversation file.csv",
						provider: "chatgpt" as const,
						source: "conversation" as const,
					},
				];
			}),
			getConversationContext: vi.fn(async (conversationId: string) => {
				calls.push(`getConversationContext:${conversationId}`);
				return {
					provider: "chatgpt" as const,
					conversationId,
					messages: [],
					artifacts: [
						{
							id: `artifact-${conversationId}`,
							title: "Generated table",
							kind: "spreadsheet" as const,
						},
					],
				};
			}),
		};
		const collector = createChatgptAccountMirrorMetadataCollector(
			{
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
								},
							},
						},
					},
				},
			} as never,
			{
				createClient: async () => client as never,
			},
		);

		const result = await collector.collect({
			provider: "chatgpt",
			runtimeProfileId: "default",
			expectedIdentityKey: "ecochran76@gmail.com",
			sweepMode: "steady_follow",
			requestedPhase: "detail-inventory",
			previousEvidence: {
				identitySource: "auth-session",
				projectSampleIds: [],
				conversationSampleIds: ["conv_target"],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: true,
				},
				conversationFreshnessFrontier: {
					object: "account_mirror_conversation_freshness_frontier",
					provider: "chatgpt",
					sweepMode: "steady_follow",
					threshold: 3,
					rowsExamined: 4,
					rowsSelectedForDetail: 1,
					frontierReached: true,
					firstStoppedRow: null,
					fallbackReason: null,
					selectedConversationIds: ["conv_target"],
					rowEvidence: [],
				},
			},
			limits: {
				maxPageReadsPerCycle: 1,
				maxConversationRowsPerCycle: 10,
				maxArtifactRowsPerCycle: 10,
				maxBrowserInteractionsPerMinute: 0,
			},
		});

		expect(calls).toEqual([
			"listConversationFiles:conv_target",
			"getConversationContext:conv_target",
		]);
		expect(client.listProjects).not.toHaveBeenCalled();
		expect(client.listConversations).not.toHaveBeenCalled();
		expect(client.listProjectFiles).not.toHaveBeenCalled();
		expect(client.listAccountFiles).not.toHaveBeenCalled();
		expect(result.evidence.collectorProgress).toMatchObject({
			phase: "complete",
			attachmentCursor: expect.objectContaining({
				scannedConversations: 1,
			}),
		});
		expect(result.manifests.conversations.map((conversation) => conversation.id)).toEqual([
			"conv_target",
		]);
		expect(result.manifests.files.map((file) => file.id)).toEqual([
			"conversation-file-conv_target",
		]);
		expect(result.manifests.artifacts.map((artifact) => artifact.id)).toEqual([
			"artifact-conv_target",
		]);
	});

	test("honors requested project-conversations phase without root rail reads", async () => {
		const calls: string[] = [];
		const client = {
			getUserIdentity: vi.fn(async () => ({
				email: "ecochran76@gmail.com",
				accountLevel: "Business",
				source: "auth-session",
			})),
			listProjects: vi.fn(async () => {
				calls.push("listProjects");
				return [
					{
						id: "project_1",
						name: "Project 1",
						provider: "chatgpt" as const,
					},
				];
			}),
			listConversations: vi.fn(async (projectId?: string) => {
				calls.push(`listConversations:${projectId ?? "root"}`);
				if (!projectId) throw new Error("root rail should not be read");
				return [
					{
						id: "project_conv_1",
						title: "Project conversation",
						provider: "chatgpt" as const,
						projectId,
					},
				];
			}),
			listAccountFiles: vi.fn(async () => []),
			listProjectFiles: vi.fn(async () => []),
			listConversationFiles: vi.fn(async () => []),
			getConversationContext: vi.fn(async () => ({
				provider: "chatgpt" as const,
				conversationId: "project_conv_1",
				messages: [],
				artifacts: [],
			})),
		};
		const collector = createChatgptAccountMirrorMetadataCollector(
			{
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
								},
							},
						},
					},
				},
			} as never,
			{
				createClient: async () => client as never,
			},
		);

		const result = await collector.collect({
			provider: "chatgpt",
			runtimeProfileId: "default",
			expectedIdentityKey: "ecochran76@gmail.com",
			sweepMode: "steady_follow",
			requestedPhase: "project-conversations",
			previousEvidence: {
				identitySource: "auth-session",
				projectSampleIds: ["project_1"],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: true,
					artifacts: false,
				},
				projectConversations: {
					nextProjectIndex: 0,
					readLimit: 1,
					scannedProjects: 0,
					yielded: true,
				},
			},
			limits: {
				maxPageReadsPerCycle: 1,
				maxConversationRowsPerCycle: 10,
				maxArtifactRowsPerCycle: 0,
				maxBrowserInteractionsPerMinute: 0,
			},
		});

		expect(calls).toEqual(["listProjects", "listConversations:project_1"]);
		expect(result.manifests.conversations.map((conversation) => conversation.id)).toEqual([
			"project_conv_1",
		]);
		expect(result.evidence.projectConversations).toMatchObject({
			scannedProjects: 1,
		});
	});

	test("does not mark conversation detail complete when context read fails", async () => {
		const client = {
			listAccountFiles: vi.fn(async () => []),
			listProjectFiles: vi.fn(async () => []),
			listConversationFiles: vi.fn(async () => []),
			getConversationContext: vi.fn(async () => null as never),
		};

		const inventory = await readBoundedChatgptDetailInventory(
			client,
			[],
			[{ id: "conv_context_failed", title: "Context failed", provider: "chatgpt" }],
			4,
			{ maxDetailReads: 1 },
		);

		expect(inventory.cursor).toMatchObject({
			nextConversationIndex: 0,
			scannedConversations: 1,
		});
		expect(inventory.progress).toMatchObject({
			scannedConversationIds: ["conv_context_failed"],
			detailObservedConversationIds: [],
			contextObservedConversationIds: [],
		});
	});

	test("paces ChatGPT detail inventory reads through the browser interaction governor", async () => {
		const calls: string[] = [];
		const pacer = {
			beforeInteraction: vi.fn(async (kind?: string) => {
				calls.push(`pacer:${kind ?? "generic"}`);
			}),
		};
		const client = {
			listAccountFiles: vi.fn(async () => {
				calls.push("provider:listAccountFiles");
				return [
					{
						id: "library-file-1",
						name: "Library one.pdf",
						provider: "chatgpt" as const,
						source: "account" as const,
						metadata: {
							source: "chatgpt-library",
							artifactKind: "download",
						},
					},
				];
			}),
			listProjectFiles: vi.fn(async () => []),
			listConversationFiles: vi.fn(async () => {
				calls.push("provider:listConversationFiles");
				return [];
			}),
			getConversationContext: vi.fn(async () => {
				calls.push("provider:getConversationContext");
				return {
					provider: "chatgpt" as const,
					conversationId: "conv_1",
					messages: [],
					artifacts: [],
				};
			}),
		};

		await readBoundedChatgptDetailInventory(
			client,
			[],
			[{ id: "conv_1", title: "Conversation 1", provider: "chatgpt" }],
			4,
			{ maxDetailReads: 1, pacer },
		);

		expect(calls).toEqual([
			"pacer:page-refresh",
			"provider:listAccountFiles",
			"pacer:conversation-read",
			"provider:listConversationFiles",
			"pacer:conversation-read",
			"provider:getConversationContext",
		]);
		expect(pacer.beforeInteraction).toHaveBeenCalledTimes(3);
	});

	test("reserves one ChatGPT conversation detail row when library inventory fills the row budget", async () => {
		const client = {
			listAccountFiles: vi.fn(async () => [
				{
					id: "library-file-1",
					name: "Library one.pdf",
					provider: "chatgpt" as const,
					source: "account" as const,
					metadata: {
						source: "chatgpt-library",
						artifactKind: "download",
					},
				},
				{
					id: "library-file-2",
					name: "Library two.pdf",
					provider: "chatgpt" as const,
					source: "account" as const,
					metadata: {
						source: "chatgpt-library",
						artifactKind: "download",
					},
				},
			]),
			listProjectFiles: vi.fn(async () => []),
			listConversationFiles: vi.fn(async (conversationId: string) => [
				{
					id: `conversation-file-${conversationId}`,
					name: "Generated export.csv",
					provider: "chatgpt" as const,
					source: "conversation" as const,
				},
			]),
			getConversationContext: vi.fn(async () => ({
				provider: "chatgpt" as const,
				conversationId: "conv_1",
				messages: [],
				artifacts: [],
			})),
		};

		const inventory = await readBoundedChatgptDetailInventory(
			client,
			[],
			[{ id: "conv_1", title: "Conversation 1", provider: "chatgpt" }],
			2,
			2,
		);

		expect(inventory.files.map((file) => file.id)).toEqual([
			"library-file-1",
			"library-file-2",
			"conversation-file-conv_1",
		]);
		expect(client.listConversationFiles).toHaveBeenCalledWith(
			"conv_1",
			accountMirrorConversationOptions,
		);
		expect(inventory.cursor).toMatchObject({
			nextConversationIndex: 0,
			scannedConversations: 1,
		});
	});

	test("bounds hung ChatGPT library inventory and still scans conversation detail", async () => {
		vi.useFakeTimers();
		try {
			const client = {
				listAccountFiles: vi.fn(() => new Promise<never>(() => {})),
				listProjectFiles: vi.fn(async () => []),
				listConversationFiles: vi.fn(async (conversationId: string) => [
					{
						id: `conversation-file-${conversationId}`,
						name: "Conversation source.pdf",
						provider: "chatgpt" as const,
						source: "conversation" as const,
					},
				]),
				getConversationContext: vi.fn(async (conversationId: string) => ({
					provider: "chatgpt" as const,
					conversationId,
					messages: [],
					artifacts: [],
				})),
			};

			const inventoryPromise = readBoundedChatgptDetailInventory(
				client,
				[],
				[{ id: "conv_1", title: "Conversation 1", provider: "chatgpt" }],
				4,
				{
					maxDetailReads: 2,
					providerCallTimeoutMs: 1,
				},
			);
			await vi.advanceTimersByTimeAsync(1);
			const inventory = await inventoryPromise;

			expect(inventory.files.map((file) => file.id)).toEqual(["conversation-file-conv_1"]);
			expect(inventory.cursor).toMatchObject({
				nextConversationIndex: 0,
				scannedConversations: 1,
			});
			expect(inventory.truncated).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	test("bounds hung ChatGPT conversation detail reads and advances the cursor", async () => {
		vi.useFakeTimers();
		try {
			const client = {
				listAccountFiles: vi.fn(async () => []),
				listProjectFiles: vi.fn(async () => []),
				listConversationFiles: vi.fn(() => new Promise<never>(() => {})),
				getConversationContext: vi.fn(() => new Promise<never>(() => {})),
			};

			const inventoryPromise = readBoundedChatgptDetailInventory(
				client,
				[],
				[
					{ id: "conv_1", title: "Conversation 1", provider: "chatgpt" },
					{ id: "conv_2", title: "Conversation 2", provider: "chatgpt" },
				],
				4,
				{
					maxDetailReads: 1,
					cursor: {
						nextProjectIndex: 0,
						nextConversationIndex: 1,
						detailReadLimit: 1,
						scannedProjects: 0,
						scannedConversations: 1,
					},
					providerCallTimeoutMs: 1,
				},
			);
			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(1);
			const inventory = await inventoryPromise;

			expect(inventory.files).toEqual([]);
			expect(inventory.artifacts).toEqual([]);
			expect(inventory.cursor).toMatchObject({
				nextConversationIndex: 0,
				scannedConversations: 1,
			});
			expect(inventory.truncated).toBe(false);
			expect(client.listConversationFiles).toHaveBeenCalledWith("conv_2", {
				projectId: undefined,
				listOptions: accountMirrorTabLifecycle,
			});
			expect(client.getConversationContext).toHaveBeenCalledWith(
				"conv_2",
				accountMirrorContextOptions(),
			);
		} finally {
			vi.useRealTimers();
		}
	});

	test("keeps the outer ChatGPT conversation cursor pinned while a large chat has more chunks", async () => {
		const client = {
			listAccountFiles: vi.fn(async () => []),
			listProjectFiles: vi.fn(async () => []),
			listConversationFiles: vi.fn(async () => []),
			getConversationContext: vi.fn(async (conversationId: string) => ({
				provider: "chatgpt" as const,
				conversationId,
				messages: Array.from({ length: 24 }, (_, index) => ({
					role: "assistant" as const,
					text: `chunk message ${index}`,
				})),
				artifacts: [
					{
						id: "artifact-in-first-chunk",
						title: "Chunk artifact",
						kind: "document" as const,
						messageIndex: 4,
					},
				],
				metadata: {
					accountMirrorContextChunk: {
						startMessageIndex: 0,
						endMessageIndex: 24,
						nextMessageIndex: 24,
						maxMessages: 24,
						totalMessages: 40,
						complete: false,
					},
				},
			})),
		};

		const inventory = await readBoundedChatgptDetailInventory(
			client,
			[],
			[{ id: "conv_large", title: "Large conversation", provider: "chatgpt" }],
			20,
			{ maxDetailReads: 1 },
		);

		expect(inventory.artifacts.map((artifact) => artifact.id)).toEqual(["artifact-in-first-chunk"]);
		expect(inventory.truncated).toBe(true);
		expect(inventory.cursor).toMatchObject({
			nextConversationIndex: 0,
			scannedConversations: 1,
			conversationDetail: {
				conversationId: "conv_large",
				nextMessageIndex: 24,
				messageLimit: 24,
				totalMessages: 40,
			},
		});
		expect(client.getConversationContext).toHaveBeenCalledWith(
			"conv_large",
			accountMirrorContextOptions(),
		);
	});

	test("resumes a large ChatGPT conversation chunk and advances after it completes", async () => {
		const client = {
			listAccountFiles: vi.fn(async () => []),
			listProjectFiles: vi.fn(async () => []),
			listConversationFiles: vi.fn(async () => []),
			getConversationContext: vi.fn(async (conversationId: string) => ({
				provider: "chatgpt" as const,
				conversationId,
				messages: Array.from({ length: 16 }, (_, index) => ({
					role: "assistant" as const,
					text: `resumed message ${index + 24}`,
				})),
				artifacts: [
					{
						id: "artifact-in-final-chunk",
						title: "Final chunk artifact",
						kind: "document" as const,
						messageIndex: 28,
					},
				],
				metadata: {
					accountMirrorContextChunk: {
						startMessageIndex: 24,
						endMessageIndex: 40,
						nextMessageIndex: null,
						maxMessages: 24,
						totalMessages: 40,
						complete: true,
					},
				},
			})),
		};

		const inventory = await readBoundedChatgptDetailInventory(
			client,
			[],
			[
				{ id: "conv_large", title: "Large conversation", provider: "chatgpt" },
				{ id: "conv_next", title: "Next conversation", provider: "chatgpt" },
			],
			20,
			{
				maxDetailReads: 1,
				cursor: {
					nextProjectIndex: 0,
					nextConversationIndex: 0,
					detailReadLimit: 1,
					scannedProjects: 0,
					scannedConversations: 1,
					conversationDetail: {
						conversationId: "conv_large",
						nextMessageIndex: 24,
						messageLimit: 24,
						totalMessages: 40,
					},
				},
			},
		);

		expect(inventory.artifacts.map((artifact) => artifact.id)).toEqual(["artifact-in-final-chunk"]);
		expect(inventory.truncated).toBe(true);
		expect(inventory.cursor).toMatchObject({
			nextConversationIndex: 1,
			scannedConversations: 1,
			conversationDetail: null,
		});
		expect(client.getConversationContext).toHaveBeenCalledWith(
			"conv_large",
			accountMirrorContextOptions(24),
		);
	});

	test("maps only ChatGPT library files into account artifacts", () => {
		const artifacts = mapChatgptLibraryFilesToArtifacts([
			{
				id: "library-file",
				name: "Library canvas",
				provider: "chatgpt",
				source: "account",
				metadata: {
					source: "chatgpt-library",
					artifactKind: "canvas",
				},
			},
			{
				id: "conversation-file",
				name: "Conversation upload",
				provider: "chatgpt",
				source: "conversation",
			},
		]);

		expect(artifacts).toEqual([
			{
				id: "chatgpt-library:library-file",
				title: "Library canvas",
				kind: "canvas",
				uri: undefined,
				metadata: {
					source: "chatgpt-library",
					artifactKind: "canvas",
					fileId: "library-file",
					fileSource: "account",
				},
			},
		]);
	});

	test("builds a bounded file and artifact inventory from project and conversation indexes", async () => {
		const client = {
			listProjectFiles: vi.fn(async (projectId: string) => [
				{
					id: `project-file-${projectId}`,
					name: "Project source.pdf",
					provider: "chatgpt" as const,
					source: "project" as const,
				},
			]),
			listConversationFiles: vi.fn(async (conversationId: string) => [
				{
					id: `conversation-file-${conversationId}`,
					name: "User upload.png",
					provider: "chatgpt" as const,
					source: "conversation" as const,
				},
			]),
			getConversationContext: vi.fn(async (conversationId: string) => ({
				provider: "chatgpt" as const,
				conversationId,
				messages: [],
				artifacts: [
					{
						id: `artifact-${conversationId}`,
						title: "Generated report",
						kind: "document" as const,
					},
				],
			})),
		};

		const inventory = await readBoundedAttachmentInventory(
			client,
			[{ id: "project_1", name: "Project 1", provider: "chatgpt" }],
			[{ id: "conv_1", title: "Conversation 1", provider: "chatgpt", projectId: "project_1" }],
			3,
		);

		expect(inventory).toMatchObject({
			truncated: false,
			cursor: {
				nextProjectIndex: 0,
				nextConversationIndex: 0,
				scannedProjects: 1,
				scannedConversations: 1,
			},
			files: [
				{
					id: "project-file-project_1",
					name: "Project source.pdf",
					source: "project",
					metadata: {
						projectId: "project_1",
					},
				},
				{
					id: "conversation-file-conv_1",
					name: "User upload.png",
					source: "conversation",
					metadata: {
						conversationId: "conv_1",
						projectId: "project_1",
					},
				},
			],
			artifacts: [
				{
					id: "artifact-conv_1",
					title: "Generated report",
					metadata: {
						conversationId: "conv_1",
						projectId: "project_1",
					},
				},
			],
		});
	});

	test("marks attachment inventory truncated when the artifact budget is exhausted", async () => {
		const client = {
			listProjectFiles: vi.fn(async () => [
				{
					id: "project-file-1",
					name: "Project source.pdf",
					provider: "chatgpt" as const,
					source: "project" as const,
				},
			]),
			listConversationFiles: vi.fn(async () => []),
			getConversationContext: vi.fn(async (conversationId: string) => ({
				provider: "chatgpt" as const,
				conversationId,
				messages: [],
				artifacts: [],
			})),
		};

		const inventory = await readBoundedAttachmentInventory(
			client,
			[
				{ id: "project_1", name: "Project 1", provider: "chatgpt" },
				{ id: "project_2", name: "Project 2", provider: "chatgpt" },
			],
			[],
			1,
		);

		expect(inventory.files).toHaveLength(1);
		expect(inventory.truncated).toBe(true);
		expect(client.listProjectFiles).toHaveBeenCalledTimes(1);
	});

	test("uses a small detail-read budget separate from the artifact row budget", async () => {
		const client = {
			listProjectFiles: vi.fn(async (projectId: string) => [
				{
					id: `project-file-${projectId}`,
					name: "Project source.pdf",
					provider: "chatgpt" as const,
					source: "project" as const,
				},
			]),
			listConversationFiles: vi.fn(async () => []),
			getConversationContext: vi.fn(async (conversationId: string) => ({
				provider: "chatgpt" as const,
				conversationId,
				messages: [],
				artifacts: [],
			})),
		};

		const inventory = await readBoundedAttachmentInventory(
			client,
			[
				{ id: "project_1", name: "Project 1", provider: "chatgpt" },
				{ id: "project_2", name: "Project 2", provider: "chatgpt" },
			],
			[{ id: "conv_1", title: "Conversation 1", provider: "chatgpt" }],
			80,
			2,
		);

		expect(inventory.files).toHaveLength(2);
		expect(inventory.truncated).toBe(true);
		expect(client.listProjectFiles).toHaveBeenCalledTimes(2);
		expect(client.listConversationFiles).not.toHaveBeenCalled();
		expect(client.getConversationContext).not.toHaveBeenCalled();
	});

	test("continues attachment inventory from the prior cursor", async () => {
		const client = {
			listProjectFiles: vi.fn(async (projectId: string) => [
				{
					id: `project-file-${projectId}`,
					name: "Project source.pdf",
					provider: "chatgpt" as const,
					source: "project" as const,
				},
			]),
			listConversationFiles: vi.fn(async (conversationId: string) => [
				{
					id: `conversation-file-${conversationId}`,
					name: "User upload.png",
					provider: "chatgpt" as const,
					source: "conversation" as const,
				},
			]),
			getConversationContext: vi.fn(async (conversationId: string) => ({
				provider: "chatgpt" as const,
				conversationId,
				messages: [],
				artifacts: [],
			})),
		};

		const inventory = await readBoundedAttachmentInventory(
			client,
			[
				{ id: "project_1", name: "Project 1", provider: "chatgpt" },
				{ id: "project_2", name: "Project 2", provider: "chatgpt" },
			],
			[
				{ id: "conv_1", title: "Conversation 1", provider: "chatgpt" },
				{ id: "conv_2", title: "Conversation 2", provider: "chatgpt" },
			],
			80,
			{
				maxDetailReads: 2,
				cursor: {
					nextProjectIndex: 1,
					nextConversationIndex: 0,
					detailReadLimit: 2,
					scannedProjects: 1,
					scannedConversations: 0,
				},
			},
		);

		expect(inventory.files.map((file) => file.id)).toEqual([
			"project-file-project_2",
			"conversation-file-conv_1",
		]);
		expect(inventory.cursor).toMatchObject({
			nextProjectIndex: 2,
			nextConversationIndex: 1,
			detailReadLimit: 2,
			scannedProjects: 1,
			scannedConversations: 1,
		});
		expect(inventory.truncated).toBe(true);
		expect(client.listProjectFiles).toHaveBeenCalledWith("project_2", accountMirrorTabLifecycle);
		expect(client.listConversationFiles).toHaveBeenCalledWith(
			"conv_1",
			accountMirrorConversationOptions,
		);
	});

	test("yields between detail reads when higher-priority work is waiting", async () => {
		const shouldYield = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		const client = {
			listProjectFiles: vi.fn(async (projectId: string) => [
				{
					id: `project-file-${projectId}`,
					name: "Project source.pdf",
					provider: "chatgpt" as const,
					source: "project" as const,
				},
			]),
			listConversationFiles: vi.fn(async () => []),
			getConversationContext: vi.fn(async () => ({
				provider: "chatgpt" as const,
				conversationId: "conv_1",
				messages: [],
				artifacts: [],
			})),
		};

		const inventory = await readBoundedAttachmentInventory(
			client,
			[
				{ id: "project_1", name: "Project 1", provider: "chatgpt" },
				{ id: "project_2", name: "Project 2", provider: "chatgpt" },
			],
			[{ id: "conv_1", title: "Conversation 1", provider: "chatgpt" }],
			80,
			{
				maxDetailReads: 6,
				shouldYield,
			},
		);

		expect(inventory.truncated).toBe(true);
		expect(inventory.files.map((file) => file.id)).toEqual(["project-file-project_1"]);
		expect(inventory.cursor).toMatchObject({
			nextProjectIndex: 1,
			nextConversationIndex: 0,
			scannedProjects: 1,
			scannedConversations: 0,
			yielded: true,
		});
		expect(client.listProjectFiles).toHaveBeenCalledTimes(1);
		expect(client.listConversationFiles).not.toHaveBeenCalled();
		expect(client.getConversationContext).not.toHaveBeenCalled();
	});

	test("builds a bounded Grok account-file inventory with media manifests", async () => {
		const client = {
			listAccountFiles: vi.fn(async () => [
				{
					id: "grok_image_1",
					name: "asphalt-agent.jpg",
					provider: "grok" as const,
					source: "account" as const,
					remoteUrl: "https://assets.grok.com/generated/asphalt-agent/image.jpg?cache=1",
				},
				{
					id: "grok_video_1",
					name: "handoff.mp4",
					provider: "grok" as const,
					source: "account" as const,
					remoteUrl: "https://assets.grok.com/generated/handoff/video.mp4?cache=1",
				},
				{
					id: "grok_doc_1",
					name: "notes.txt",
					provider: "grok" as const,
					source: "account" as const,
				},
			]),
		};

		const inventory = await readBoundedGrokAccountFileInventory(client, 2);

		expect(client.listAccountFiles).toHaveBeenCalledTimes(1);
		expect(inventory).toMatchObject({
			artifacts: [],
			truncated: true,
			cursor: null,
			files: [
				{ id: "grok_image_1", name: "asphalt-agent.jpg", source: "account" },
				{ id: "grok_video_1", name: "handoff.mp4", source: "account" },
			],
			media: [
				{
					id: "grok-account-file:grok_image_1",
					title: "asphalt-agent.jpg",
					mediaType: "image",
					uri: "https://assets.grok.com/generated/asphalt-agent/image.jpg?cache=1",
					provider: "grok",
					metadata: {
						source: "grok-account-files",
						fileId: "grok_image_1",
						fileSource: "account",
					},
				},
				{
					id: "grok-account-file:grok_video_1",
					title: "handoff.mp4",
					mediaType: "video",
					provider: "grok",
				},
			],
		});
	});

	test("reads Grok account files separately from frontier-selected chat detail", async () => {
		const calls: string[] = [];
		const client = {
			listAccountFiles: vi.fn(async () => {
				calls.push("account-files");
				return [
					{
						id: "grok_image_1",
						name: "image.png",
						provider: "grok" as const,
						source: "account" as const,
						remoteUrl: "https://assets.grok.com/image.png",
					},
				];
			}),
			listProjectFiles: vi.fn(async () => {
				throw new Error("Grok chat-detail inventory should not read project files");
			}),
			listConversationFiles: vi.fn(async (conversationId: string) => {
				calls.push(`conversation-files:${conversationId}`);
				return [];
			}),
			getConversationContext: vi.fn(async (conversationId: string) => {
				calls.push(`conversation-context:${conversationId}`);
				return {
					provider: "grok" as const,
					conversationId,
					messages: [],
					artifacts:
						conversationId === "grok_changed"
							? [
									{
										id: "artifact_1",
										title: "Generated image",
										kind: "image" as const,
										uri: "https://assets.grok.com/generated.png",
									},
								]
							: [],
				};
			}),
		};

		const inventory = await readBoundedGrokDetailInventory(
			client,
			[{ id: "grok_changed", title: "Changed", provider: "grok" }],
			8,
			{ maxDetailReads: 1 },
		);

		expect(calls).toEqual([
			"account-files",
			"conversation-files:grok_changed",
			"conversation-context:grok_changed",
		]);
		expect(inventory.media).toMatchObject([
			{ id: "grok-account-file:grok_image_1", mediaType: "image" },
		]);
		expect(inventory.artifacts).toMatchObject([
			{
				id: "artifact_1",
				metadata: {
					conversationId: "grok_changed",
				},
			},
		]);
		expect(inventory.cursor.scannedConversations).toBe(1);
	});

	test("builds Gemini conversation detail inventory with media manifests", async () => {
		const client = {
			listProjectFiles: vi.fn(async () => []),
			listConversationFiles: vi.fn(async () => []),
			getConversationContext: vi.fn(async (conversationId: string) => ({
				provider: "gemini" as const,
				conversationId,
				messages: [],
				artifacts: [
					{
						id: "gemini-image-artifact",
						title: "Asphalt secret agent",
						kind: "image" as const,
						uri: "https://gemini.google.com/app/gemini_conv_1#image",
						metadata: {
							conversationId,
							projectId: "gemini_project_1",
							mediaType: "image",
							fileName: "asphalt-agent.png",
						},
					},
					{
						id: "gemini-video-artifact",
						title: "Harbor short",
						kind: "generated" as const,
						metadata: {
							conversationId,
							mediaType: "video",
							fileName: "harbor.mp4",
						},
					},
					{
						id: "gemini-notes",
						title: "Notes",
						kind: "document" as const,
					},
				],
			})),
		};

		const inventory = await readBoundedGeminiDetailInventory(
			client,
			[],
			[
				{
					id: "gemini_conv_1",
					title: "Generate media",
					provider: "gemini",
					projectId: "gemini_project_1",
				},
			],
			4,
			{ maxDetailReads: 2 },
		);

		expect(client.getConversationContext).toHaveBeenCalledWith("gemini_conv_1", {
			projectId: "gemini_project_1",
			refresh: true,
		});
		expect(inventory.artifacts.map((artifact) => artifact.id)).toEqual([
			"gemini-image-artifact",
			"gemini-video-artifact",
			"gemini-notes",
		]);
		expect(inventory.media).toMatchObject([
			{
				id: "gemini-conversation-artifact:gemini_conv_1:gemini-image-artifact",
				title: "Asphalt secret agent",
				mediaType: "image",
				conversationId: "gemini_conv_1",
				projectId: "gemini_project_1",
				provider: "gemini",
			},
			{
				id: "gemini-conversation-artifact:gemini_conv_1:gemini-video-artifact",
				title: "Harbor short",
				mediaType: "video",
				conversationId: "gemini_conv_1",
				provider: "gemini",
			},
		]);
		expect(mapGeminiConversationArtifactsToMediaManifest(inventory.artifacts)).toHaveLength(2);
	});

	test("prioritizes Gemini conversation detail reads before project files", async () => {
		const client = {
			listProjectFiles: vi.fn(async () => []),
			listConversationFiles: vi.fn(async () => []),
			getConversationContext: vi.fn(async (conversationId: string) => ({
				provider: "gemini" as const,
				conversationId,
				messages: [],
				artifacts: [
					{
						id: "gemini-image-artifact",
						title: "Generated image 1",
						kind: "image" as const,
						uri: "https://gemini.google.com/app/gemini_conv_1#image",
						metadata: {
							mediaType: "image",
						},
					},
				],
			})),
		};

		const inventory = await readBoundedGeminiDetailInventory(
			client,
			[
				{ id: "gemini_project_1", name: "Project 1", provider: "gemini" },
				{ id: "gemini_project_2", name: "Project 2", provider: "gemini" },
			],
			[{ id: "gemini_conv_1", title: "Generate media", provider: "gemini" }],
			2,
			{ maxDetailReads: 1 },
		);

		expect(client.listProjectFiles).not.toHaveBeenCalled();
		expect(client.getConversationContext).toHaveBeenCalledWith("gemini_conv_1", {
			projectId: undefined,
			refresh: true,
		});
		expect(inventory.media).toMatchObject([
			{
				id: "gemini-conversation-artifact:gemini_conv_1:gemini-image-artifact",
				mediaType: "image",
				conversationId: "gemini_conv_1",
			},
		]);
		expect(inventory.truncated).toBe(true);
	});

	test("resumes Gemini conversation-first detail reads before project files across passes", async () => {
		const projects = [
			{ id: "gemini_project_1", name: "Project 1", provider: "gemini" as const },
			{ id: "gemini_project_2", name: "Project 2", provider: "gemini" as const },
		];
		const conversations = [
			{ id: "gemini_conv_1", title: "Generate media 1", provider: "gemini" as const },
			{ id: "gemini_conv_2", title: "Generate media 2", provider: "gemini" as const },
		];
		const client = {
			listProjectFiles: vi.fn(async (projectId: string) => [
				{
					id: `project-file-${projectId}`,
					name: "Project source.pdf",
					provider: "gemini" as const,
					source: "project" as const,
				},
			]),
			listConversationFiles: vi.fn(async () => []),
			getConversationContext: vi.fn(async (conversationId: string) => ({
				provider: "gemini" as const,
				conversationId,
				messages: [],
				artifacts: [
					{
						id: `artifact-${conversationId}`,
						title: `Generated media ${conversationId}`,
						kind: "image" as const,
						metadata: {
							mediaType: "image",
						},
					},
				],
			})),
		};

		const first = await readBoundedGeminiDetailInventory(client, projects, conversations, 20, {
			maxDetailReads: 1,
		});
		const second = await readBoundedGeminiDetailInventory(client, projects, conversations, 20, {
			maxDetailReads: 1,
			cursor: first.cursor,
		});
		const third = await readBoundedGeminiDetailInventory(client, projects, conversations, 20, {
			maxDetailReads: 1,
			cursor: second.cursor,
		});
		const fourth = await readBoundedGeminiDetailInventory(client, projects, conversations, 20, {
			maxDetailReads: 1,
			cursor: third.cursor,
		});

		expect(first.cursor).toMatchObject({
			nextProjectIndex: 0,
			nextConversationIndex: 1,
			scannedProjects: 0,
			scannedConversations: 1,
		});
		expect(second.cursor).toMatchObject({
			nextProjectIndex: 0,
			nextConversationIndex: 2,
			scannedProjects: 0,
			scannedConversations: 1,
		});
		expect(third.cursor).toMatchObject({
			nextProjectIndex: 1,
			nextConversationIndex: 2,
			scannedProjects: 1,
			scannedConversations: 0,
		});
		expect(fourth.cursor).toMatchObject({
			nextProjectIndex: 0,
			nextConversationIndex: 0,
			scannedProjects: 1,
			scannedConversations: 0,
		});
		expect(client.getConversationContext).toHaveBeenNthCalledWith(1, "gemini_conv_1", {
			projectId: undefined,
			refresh: true,
		});
		expect(client.getConversationContext).toHaveBeenNthCalledWith(2, "gemini_conv_2", {
			projectId: undefined,
			refresh: true,
		});
		expect(client.listProjectFiles).toHaveBeenNthCalledWith(1, "gemini_project_1");
		expect(client.listProjectFiles).toHaveBeenNthCalledWith(2, "gemini_project_2");
		expect(first.media.map((entry) => entry.conversationId)).toEqual(["gemini_conv_1"]);
		expect(second.media.map((entry) => entry.conversationId)).toEqual(["gemini_conv_2"]);
		expect(third.files.map((file) => file.id)).toEqual(["project-file-gemini_project_1"]);
		expect(fourth.truncated).toBe(false);
	});

	test("keeps Gemini steady-follow on the rail cursor instead of restarting at the shell", () => {
		const previousEvidence = {
			identitySource: "google-account-label",
			projectSampleIds: [],
			conversationSampleIds: ["gemini_conv_1", "gemini_conv_2"],
			attachmentInventory: {
				nextProjectIndex: 0,
				nextConversationIndex: 2,
				detailReadLimit: 2,
				scannedProjects: 0,
				scannedConversations: 1,
			},
			truncated: {
				projects: false,
				conversations: false,
				artifacts: true,
			},
		};

		expect(
			selectAttachmentInventoryCursorForProviderSweep("gemini", "steady_follow", previousEvidence),
		).toBe(previousEvidence.attachmentInventory);
		expect(
			selectAttachmentInventoryCursorForProviderSweep("chatgpt", "steady_follow", previousEvidence),
		).toBe(previousEvidence.attachmentInventory);
		expect(
			selectAttachmentInventoryCursorForProviderSweep("gemini", "full_sweep", previousEvidence),
		).toBe(previousEvidence.attachmentInventory);
	});

	test("classifies Gemini shell-only reads as churn and rail conversation reads as progress", () => {
		const shellOnly = buildGeminiRouteProgressEvidence({
			projects: [],
			conversations: [{ id: "gemini_conv_1", title: "Historical artifact", provider: "gemini" }],
			inventoryProgress: {
				scannedProjectIds: [],
				scannedConversationIds: [],
				detailObservedConversationIds: [],
				contextObservedConversationIds: [],
				artifactBearingConversationIds: [],
				fileBearingConversationIds: [],
			},
		});

		expect(shellOnly).toMatchObject({
			strategy: "gemini-left-rail",
			routeSequence: ["/app"],
			appShellVisits: 1,
			conversationCandidates: 1,
			selectedConversationIds: [],
			churnDetected: true,
			yieldCause: "shell_without_conversation_selection",
		});

		const productive = buildGeminiRouteProgressEvidence({
			projects: [],
			conversations: [
				{ id: "gemini_conv_1", title: "Historical artifact", provider: "gemini" },
				{ id: "gemini_conv_2", title: "Second artifact", provider: "gemini" },
			],
			inventoryProgress: {
				scannedProjectIds: [],
				scannedConversationIds: ["gemini_conv_1"],
				detailObservedConversationIds: ["gemini_conv_1"],
				contextObservedConversationIds: ["gemini_conv_1"],
				artifactBearingConversationIds: ["gemini_conv_1"],
				fileBearingConversationIds: [],
			},
		});

		expect(productive).toMatchObject({
			routeSequence: ["/app", "/app/gemini_conv_1"],
			selectedConversationIds: ["gemini_conv_1"],
			artifactBearingConversationIds: ["gemini_conv_1"],
			materializationAttempts: 1,
			churnDetected: false,
			yieldCause: null,
		});
	});

	test("tolerates Grok account-files drift without failing metadata collection", async () => {
		await useTempAuracallHome();
		const client = {
			listAccountFiles: vi.fn(async () => {
				throw new Error("files page changed");
			}),
		};

		const inventory = await readBoundedGrokAccountFileInventory(client, 8, {
			observation: {
				provider: "grok",
				runtimeProfileId: "default",
			},
		});

		expect(inventory).toEqual({
			artifacts: [],
			files: [],
			media: [],
			truncated: false,
			cursor: null,
		});
		await expect(
			listDomDriftObservations({ service: "grok", surface: "account-mirror-account-files" }),
		).resolves.toMatchObject({
			count: 1,
			data: [
				expect.objectContaining({
					service: "grok",
					surface: "account-mirror-account-files",
					action: "list-account-files",
					fallbackKind: "read-failure-tolerated",
					metadata: expect.objectContaining({
						runtimeProfileId: "default",
						errorMessage: "files page changed",
					}),
				}),
			],
		});
	});

	test("adds bounded page evidence to lazy-follow drift observations when DevTools is available", async () => {
		await useTempAuracallHome();
		const runtimeKey = "Runtime";
		const pageKey = "Page";
		const cdpClient = Object.assign(
			{
				close: vi.fn(async () => undefined),
			},
			{
				[runtimeKey]: {
					enable: vi.fn(async () => undefined),
					evaluate: vi.fn(async () => ({
						result: {
							value: {
								url: "https://grok.com/files",
								title: "Files - Grok",
								readyState: "complete",
								visibleCounts: { buttons: 2, links: 3 },
								visibleLabels: { buttons: ["Download", "Share"] },
							},
						},
					})),
				},
			},
			{
				[pageKey]: {
					enable: vi.fn(async () => undefined),
					captureScreenshot: vi.fn(async () => ({
						data: Buffer.from("not-a-real-png").toString("base64"),
					})),
				},
			},
		);
		const client = {
			listAccountFiles: vi.fn(async () => {
				throw new Error("files page changed");
			}),
			connectDevTools: vi.fn(async () => ({
				port: 45011,
				client: cdpClient,
			})),
		};

		await readBoundedGrokAccountFileInventory(client, 8, {
			observation: {
				provider: "grok",
				runtimeProfileId: "default",
				client,
			},
		});

		const observations = await listDomDriftObservations({
			service: "grok",
			surface: "account-mirror-account-files",
		});
		expect(observations.data[0]?.metadata).toMatchObject({
			pageEvidence: {
				url: "https://grok.com/files",
				title: "Files - Grok",
				readyState: "complete",
				visibleCounts: { buttons: 2, links: 3 },
				visibleLabels: { buttons: ["Download", "Share"] },
				screenshot: {
					mimeType: "image/png",
					bytes: expect.any(Number),
				},
			},
		});
		expect(client.connectDevTools).toHaveBeenCalledTimes(1);
	});

	test("infers Grok media type from URL and MIME type", () => {
		const media = mapGrokAccountFilesToMediaManifest([
			{
				id: "asset_png",
				name: "asset",
				provider: "grok",
				source: "account",
				remoteUrl: "https://assets.grok.com/generated/asset/image.png?cache=1",
			},
			{
				id: "asset_audio",
				name: "track",
				provider: "grok",
				source: "account",
				mimeType: "audio/mpeg",
			},
			{
				id: "asset_unknown",
				name: "prompt.json",
				provider: "grok",
				source: "account",
			},
		]);

		expect(media.map((entry) => [entry.id, entry.mediaType])).toEqual([
			["grok-account-file:asset_png", "image"],
			["grok-account-file:asset_audio", "audio"],
		]);
	});
});
