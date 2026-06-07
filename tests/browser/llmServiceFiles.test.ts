import * as fs from "node:fs/promises";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { CHATGPT_URL, GEMINI_URL } from "../../src/browser/constants.js";
import type { CacheStore } from "../../src/browser/llmService/cache/store.js";
import { JsonCacheStore } from "../../src/browser/llmService/cache/store.js";
import { LlmService } from "../../src/browser/llmService/llmService.js";
import type {
	LlmServiceAdapter,
	PromptInput,
	PromptResult,
} from "../../src/browser/llmService/types.js";
import {
	type ProviderCacheContext,
	resolveProviderCachePath,
} from "../../src/browser/providers/cache.js";
import type { ConversationArtifact, FileRef } from "../../src/browser/providers/domain.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";
import type { ResolvedUserConfig } from "../../src/config.js";

class TestLlmService extends LlmService {
	constructor(
		provider: LlmServiceAdapter,
		cacheStore: CacheStore,
		private readonly fixedCacheContext: ProviderCacheContext,
	) {
		super({ browser: { cache: {} } } as ResolvedUserConfig, provider, {} as never, { cacheStore });
	}

	override async buildListOptions(
		overrides: BrowserProviderListOptions = {},
	): Promise<BrowserProviderListOptions> {
		return { ...overrides };
	}

	override async resolveCacheContext(): Promise<ProviderCacheContext> {
		return this.fixedCacheContext;
	}

	protected override getProviderGuardSettings() {
		return null;
	}

	async listProjects(options?: BrowserProviderListOptions): Promise<[]> {
		if (this.provider.listProjects) {
			return (await this.provider.listProjects(options)) as [];
		}
		return [];
	}

	async listConversations(_projectId?: string, options?: BrowserProviderListOptions): Promise<[]> {
		if (this.provider.listConversations) {
			return (await this.provider.listConversations(_projectId, options)) as [];
		}
		return [];
	}

	async runPrompt(_input: PromptInput): Promise<PromptResult> {
		throw new Error("not implemented");
	}

	async renameConversation(): Promise<void> {}

	async deleteConversation(): Promise<void> {}

	async getUserIdentity() {
		return null;
	}
}

class BuildListOptionsLlmService extends LlmService {
	constructor(
		userConfig: ResolvedUserConfig,
		provider: LlmServiceAdapter,
		browserService: unknown,
	) {
		super(userConfig, provider, browserService as never, {});
	}

	async listProjects(): Promise<[]> {
		return [];
	}

	async listConversations(): Promise<[]> {
		return [];
	}

	async runPrompt(_input: PromptInput): Promise<PromptResult> {
		throw new Error("not implemented");
	}

	async renameConversation(): Promise<void> {}

	async deleteConversation(): Promise<void> {}

	async getUserIdentity() {
		return null;
	}

	readDefaultLaunchUrl(): string {
		return this.getDefaultLaunchUrl();
	}
}

describe("llmService project file cache writes", () => {
	afterEach(() => {
		setAuracallHomeDirOverrideForTest(null);
	});

	test("listProjectFiles writes Grok project files into project-knowledge cache", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "grok",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const files: FileRef[] = [
			{ id: "notes.txt", name: "notes.txt", provider: "grok", source: "project", size: 12 },
		];
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			listProjectFiles: vi.fn(async () => files),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.listProjectFiles("project-123", { listOptions: {} });
			expect(result).toEqual(files);
			const cached = await store.readProjectKnowledge(cacheContext, "project-123");
			expect(cached.items).toEqual(files);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeProjectFiles downloads provider project files and writes a fetch manifest", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-project-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const files: FileRef[] = [
			{
				id: "file_project_123",
				name: "spec.md",
				provider: "chatgpt",
				source: "project",
				remoteUrl: "chatgpt://file/file_project_123",
				metadata: { materializationSurface: "chatgpt-project-source-provider-file" },
			},
		];
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			listProjectFiles: vi.fn(async () => files),
			downloadProjectFile: vi.fn(async (_projectId: string, _fileId: string, destPath: string) => {
				await fs.writeFile(destPath, "project source body", "utf8");
			}),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeProjectFiles("project-123", { listOptions: {} });
			expect(provider.downloadProjectFile).toHaveBeenCalledWith(
				"project-123",
				"file_project_123",
				expect.stringContaining("spec.md"),
				{},
			);
			expect(result.files).toHaveLength(1);
			expect(result.files[0]?.localPath).toEqual(expect.stringContaining("spec.md"));
			expect(result.files[0]?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
			expect(result.manifestPath).toEqual(expect.stringContaining("file-fetch-manifest.json"));
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8")) as {
				materializedCount: number;
				entries: Array<Record<string, unknown>>;
			};
			expect(manifest.materializedCount).toBe(1);
			expect(manifest.entries[0]).toMatchObject({
				fileId: "file_project_123",
				fileName: "spec.md",
				status: "materialized",
				materializationMethod: "chatgpt-project-source-provider-file",
			});
			const cached = await store.readProjectKnowledge(cacheContext, "project-123");
			expect(cached.items[0]?.localPath).toEqual(result.files[0]?.localPath);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeProjectFiles records unsupported project rows as manifest errors", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-project-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const files: FileRef[] = [
			{
				id: "policy.pdf",
				name: "policy.pdf",
				provider: "chatgpt",
				source: "project",
				metadata: { materializationSurface: "chatgpt-project-source-row" },
			},
		];
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			listProjectFiles: vi.fn(async () => files),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeProjectFiles("project-123", { listOptions: {} });
			expect(result.files).toEqual([]);
			expect(result.manifestPath).toEqual(expect.stringContaining("file-fetch-manifest.json"));
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8")) as {
				materializedCount: number;
				entries: Array<Record<string, unknown>>;
			};
			expect(manifest.materializedCount).toBe(0);
			expect(manifest.entries[0]).toMatchObject({
				fileId: "policy.pdf",
				fileName: "policy.pdf",
				status: "error",
				error: "project_source_download_unsupported",
			});
			const cached = await store.readProjectKnowledge(cacheContext, "project-123");
			expect(cached.items).toEqual(files);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("createProject upserts the created project into the shared projects cache", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-projects-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "gemini",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const created = {
			id: "gem-123",
			name: "Fresh Gem",
			provider: "gemini" as const,
			url: "https://gemini.google.com/gem/gem-123",
		};
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			createProject: vi.fn(async () => created),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			await service.createProject({ name: "Fresh Gem" }, { listOptions: {} });
			const cached = await store.readProjects(cacheContext);
			expect(cached.items).toEqual([created]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("createProject refuses an exact-name duplicate before provider creation", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-projects-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "grok",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			listProjects: vi.fn(async () => [
				{
					id: "project-123",
					name: "AuraCall",
					provider: "grok" as const,
					url: "https://grok.com/project/project-123",
				},
			]),
			createProject: vi.fn(async () => ({
				id: "project-999",
				name: "AuraCall",
				provider: "grok" as const,
				url: "https://grok.com/project/project-999",
			})),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			await expect(
				service.createProject({ name: "AuraCall" }, { listOptions: {} }),
			).rejects.toThrow(
				'Project "AuraCall" already exists for grok (project-123). Reuse that project instead of creating a duplicate.',
			);
			expect(provider.createProject).not.toHaveBeenCalled();
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("renameProject updates the shared projects cache", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-projects-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "gemini",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		await store.writeProjects(cacheContext, [
			{
				id: "gem-123",
				name: "Old Gem",
				provider: "gemini",
				url: "https://gemini.google.com/gem/gem-123",
			},
		]);
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			renameProject: vi.fn(async () => undefined),
			resolveProjectUrl: vi.fn((projectId: string) => `https://gemini.google.com/gem/${projectId}`),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			await service.renameProject("gem-123", "Renamed Gem", { listOptions: {} });
			const cached = await store.readProjects(cacheContext);
			expect(cached.items).toEqual([
				{
					id: "gem-123",
					name: "Renamed Gem",
					provider: "gemini",
					url: "https://gemini.google.com/gem/gem-123",
				},
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("pushProjectRemoveConfirmation prunes the project from the shared projects cache", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-projects-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "gemini",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		await store.writeProjects(cacheContext, [
			{
				id: "gem-123",
				name: "Disposable Gem",
				provider: "gemini",
				url: "https://gemini.google.com/gem/gem-123",
			},
			{
				id: "gem-999",
				name: "Keep Gem",
				provider: "gemini",
				url: "https://gemini.google.com/gem/gem-999",
			},
		]);
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			pushProjectRemoveConfirmation: vi.fn(async () => undefined),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			await service.pushProjectRemoveConfirmation("gem-123", { listOptions: {} });
			const cached = await store.readProjects(cacheContext);
			expect(cached.items).toEqual([
				{
					id: "gem-999",
					name: "Keep Gem",
					provider: "gemini",
					url: "https://gemini.google.com/gem/gem-999",
				},
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("listAccountFiles writes Grok account files into account-files cache", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "grok",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const files: FileRef[] = [
			{ id: "file-123", name: "notes.txt", provider: "grok", source: "account" },
		];
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			listAccountFiles: vi.fn(async () => files),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.listAccountFiles({ listOptions: {} });
			expect(result).toEqual(files);
			const cached = await store.readAccountFiles(cacheContext);
			expect(cached.items).toEqual(files);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("listConversationFiles writes conversation-files cache from provider listConversationFiles", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "grok",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const files: FileRef[] = [
			{ id: "file-1", name: "conversation-note.txt", provider: "grok", source: "conversation" },
		];
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			listConversationFiles: vi.fn(async () => files),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.listConversationFiles("conversation-123", { listOptions: {} });
			expect(result).toEqual(files);
			expect(provider.listConversationFiles).toHaveBeenCalledWith("conversation-123", {});
			const cached = await store.readConversationFiles(cacheContext, "conversation-123");
			expect(cached.items).toEqual(files);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("listConversationFiles falls back to context files when provider lacks listConversationFiles", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "grok",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const files: FileRef[] = [
			{ id: "file-ctx-1", name: "context-note.txt", provider: "grok", source: "conversation" },
		];
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			readConversationContext: vi.fn(async () => ({
				provider: "grok",
				conversationId: "conversation-ctx",
				messages: [{ role: "user", text: "ping" }],
				files,
			})),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.listConversationFiles("conversation-ctx", { listOptions: {} });
			expect(result).toEqual(files);
			expect(provider.readConversationContext).toHaveBeenCalled();
			const cached = await store.readConversationFiles(cacheContext, "conversation-ctx");
			expect(cached.items).toEqual(files);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeConversationArtifacts writes a sidecar fetch manifest without changing the attachment manifest shape", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const artifacts: ConversationArtifact[] = [
			{
				id: "artifact-1",
				title: "Artifact One",
				kind: "download",
				uri: "sandbox:/mnt/data/artifact-one.zip",
			},
			{
				id: "artifact-2",
				title: "Artifact Two",
				kind: "spreadsheet",
				uri: "sandbox:/mnt/data/artifact-two.xlsx",
			},
		];
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(async () => ({
				provider: "chatgpt",
				conversationId: "conversation-123",
				messages: [{ role: "assistant", text: "done" }],
				artifacts,
			})),
			materializeConversationArtifact: vi.fn(
				async (_conversationId: string, artifact: ConversationArtifact) => {
					if (artifact.id === "artifact-1") {
						return {
							id: "file-1",
							name: "artifact-one.zip",
							provider: "chatgpt",
							source: "conversation",
							size: 42,
							localPath: "/tmp/artifact-one.zip",
							remoteUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_1",
							mimeType: "application/zip",
						} satisfies FileRef;
					}
					throw new Error("artifact fetch failed");
				},
			),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeConversationArtifacts("conversation-123", {
				listOptions: {},
				refresh: true,
			});
			expect(result.files).toHaveLength(1);
			expect(result.manifestPath).toBeTruthy();
			const cached = await store.readConversationAttachments(cacheContext, "conversation-123");
			expect(cached.items).toEqual([
				{
					id: "file-1",
					name: "artifact-one.zip",
					provider: "chatgpt",
					source: "conversation",
					size: 42,
					localPath: "/tmp/artifact-one.zip",
					remoteUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_1",
					mimeType: "application/zip",
				},
			]);
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8")) as {
				artifactCount: number;
				materializedCount: number;
				entries: Array<{ artifactId: string; status: string; error?: string; fileName?: string }>;
			};
			expect(manifest.artifactCount).toBe(2);
			expect(manifest.materializedCount).toBe(1);
			expect(manifest.entries).toEqual([
				expect.objectContaining({
					artifactId: "artifact-1",
					status: "materialized",
					fileName: "artifact-one.zip",
				}),
				expect.objectContaining({
					artifactId: "artifact-2",
					status: "error",
					error: "artifact fetch failed",
				}),
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeConversationArtifacts skips ChatGPT static image false positives before fetching", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-static-skip-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const artifacts: ConversationArtifact[] = [
			{
				id: "image-dom:turn-favicon:0",
				title: "Generated image 1",
				kind: "image",
				uri: "https://www.google.com/s2/favicons?domain=https://developers.openai.com&sz=32",
				metadata: { extraction: "dom-imagegen-image" },
			},
			{
				id: "image-dom:turn-real:0",
				title: "Generated image 2",
				kind: "image",
				uri: "blob:https://chatgpt.com/generated-image-2",
				metadata: { extraction: "dom-imagegen-image" },
			},
		];
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(async () => ({
				provider: "chatgpt",
				conversationId: "conversation-123",
				messages: [{ role: "assistant", text: "done" }],
				artifacts,
			})),
			materializeConversationArtifact: vi.fn(
				async (_conversationId: string, artifact: ConversationArtifact) =>
					({
						id: `file-${artifact.id}`,
						name: "generated-image.png",
						provider: "chatgpt",
						source: "conversation",
						size: 42,
						localPath: "/tmp/generated-image.png",
						remoteUrl: artifact.uri,
						mimeType: "image/png",
					}) satisfies FileRef,
			),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeConversationArtifacts("conversation-123", {
				listOptions: {},
				refresh: true,
			});
			expect(result.files).toHaveLength(1);
			expect(provider.materializeConversationArtifact).toHaveBeenCalledTimes(1);
			expect(provider.materializeConversationArtifact).toHaveBeenCalledWith(
				"conversation-123",
				expect.objectContaining({ id: "image-dom:turn-real:0" }),
				expect.any(String),
				undefined,
				{},
			);
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8")) as {
				artifactCount: number;
				entries: Array<{ artifactId: string; status: string }>;
			};
			expect(manifest.artifactCount).toBe(1);
			expect(manifest.entries).toEqual([
				expect.objectContaining({
					artifactId: "image-dom:turn-real:0",
					status: "materialized",
				}),
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeConversationArtifacts prefers ChatGPT download-button artifacts over same-title sandbox duplicates", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-download-button-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const artifacts: ConversationArtifact[] = [
			{
				id: "turn-1:download:sandbox:/mnt/data/report.docx",
				title: "Download the revised DOCX",
				kind: "download",
				uri: "sandbox:/mnt/data/report.docx",
			},
			{
				id: "download-dom:turn-1:0",
				title: "Download the revised DOCX",
				kind: "download",
				uri: "chatgpt://download-button/turn-1/0",
				metadata: { extraction: "dom-behavior-button", turnId: "turn-1", buttonIndex: 0 },
			},
		];
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(async () => ({
				provider: "chatgpt",
				conversationId: "conversation-123",
				messages: [{ role: "assistant", text: "done" }],
				artifacts,
			})),
			materializeConversationArtifact: vi.fn(
				async (_conversationId: string, artifact: ConversationArtifact) =>
					({
						id: `file-${artifact.id}`,
						name: "report.docx",
						provider: "chatgpt",
						source: "conversation",
						size: 42,
						localPath: "/tmp/report.docx",
						remoteUrl: artifact.uri,
						mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
					}) satisfies FileRef,
			),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeConversationArtifacts("conversation-123", {
				listOptions: {},
				refresh: true,
				maxItems: 1,
			});
			expect(result.files).toHaveLength(1);
			expect(provider.materializeConversationArtifact).toHaveBeenCalledTimes(1);
			expect(provider.materializeConversationArtifact).toHaveBeenCalledWith(
				"conversation-123",
				expect.objectContaining({ id: "download-dom:turn-1:0" }),
				expect.any(String),
				undefined,
				{},
			);
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8")) as {
				artifactCount: number;
				entries: Array<{ artifactId: string; status: string }>;
			};
			expect(manifest.artifactCount).toBe(1);
			expect(manifest.entries).toEqual([
				expect.objectContaining({
					artifactId: "download-dom:turn-1:0",
					status: "materialized",
				}),
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeConversationArtifacts deduplicates ChatGPT same-source sandbox aliases before spending budget", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-same-source-alias-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const artifacts: ConversationArtifact[] = [
			{
				id: "bd8a65b0-4d5c-41b5-a49b-ab8fe39629b6:download:sandbox:/mnt/data/Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut.pdf",
				title: "Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut.pdf",
				kind: "download",
				uri: "sandbox:/mnt/data/Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut.pdf",
			},
			{
				id: "bd8a65b0-4d5c-41b5-a49b-ab8fe39629b6:download:sandbox:/mnt/data/Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf",
				title: "Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf",
				kind: "download",
				uri: "sandbox:/mnt/data/Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf",
			},
			{
				id: "1e21c0ad-f520-4037-bc13-55ebef81154a:download:sandbox:/mnt/data/Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_revised_MYAP.pdf",
				title: "Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_revised_MYAP.pdf",
				kind: "download",
				uri: "sandbox:/mnt/data/Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_revised_MYAP.pdf",
			},
		];
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(async () => ({
				provider: "chatgpt",
				conversationId: "6a0fa901-77d0-83ea-80e0-fbaaa4eca529",
				messages: [{ role: "assistant", text: "done" }],
				artifacts,
			})),
			materializeConversationArtifact: vi.fn(
				async (_conversationId: string, artifact: ConversationArtifact) =>
					({
						id: `file-${artifact.id}`,
						name: artifact.title,
						provider: "chatgpt",
						source: "conversation",
						size: 42,
						localPath: `/tmp/${artifact.title}`,
						remoteUrl: artifact.uri,
						mimeType: "application/pdf",
					}) satisfies FileRef,
			),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeConversationArtifacts(
				"6a0fa901-77d0-83ea-80e0-fbaaa4eca529",
				{
					listOptions: {},
					refresh: true,
					maxItems: 5,
				},
			);
			expect(result.files.map((file) => file.name)).toEqual([
				"Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf",
				"Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_revised_MYAP.pdf",
			]);
			expect(provider.materializeConversationArtifact).toHaveBeenCalledTimes(2);
			expect(
				provider.materializeConversationArtifact.mock.calls.map(([, artifact]) => artifact.title),
			).toEqual([
				"Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf",
				"Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_revised_MYAP.pdf",
			]);
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8")) as {
				artifactCount: number;
				entries: Array<{ artifactId: string; status: string }>;
			};
			expect(manifest.artifactCount).toBe(2);
			expect(manifest.entries.map((entry) => entry.artifactId)).toEqual([
				"bd8a65b0-4d5c-41b5-a49b-ab8fe39629b6:download:sandbox:/mnt/data/Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf",
				"1e21c0ad-f520-4037-bc13-55ebef81154a:download:sandbox:/mnt/data/Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_revised_MYAP.pdf",
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeConversationFiles writes a sidecar fetch manifest without changing the attachment manifest shape", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "gemini",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const conversationFiles: FileRef[] = [
			{
				id: "conv-file-1",
				name: "notes.txt",
				provider: "gemini",
				source: "conversation",
				mimeType: "text/plain",
				metadata: { materializationSurface: "gemini-file-preview-download" },
			},
			{
				id: "conv-file-2",
				name: "image.png",
				provider: "gemini",
				source: "conversation",
				mimeType: "image/png",
			},
		];
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			listConversationFiles: vi.fn(async () => conversationFiles),
			downloadConversationFile: vi.fn(
				async (_conversationId: string, fileId: string, destPath: string) => {
					if (fileId === "conv-file-1") {
						await fs.writeFile(destPath, "hello from gemini chat upload", "utf8");
						return;
					}
					throw new Error("conversation file fetch failed");
				},
			),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeConversationFiles("conversation-123", {
				listOptions: {},
			});
			expect(result.conversationFiles).toHaveLength(2);
			expect(result.files).toHaveLength(1);
			expect(result.manifestPath).toBeTruthy();
			const cached = await store.readConversationAttachments(cacheContext, "conversation-123");
			expect(cached.items).toEqual([
				expect.objectContaining({
					id: "conv-file-1",
					name: "notes.txt",
					provider: "gemini",
					source: "conversation",
					mimeType: "text/plain",
				}),
			]);
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8")) as {
				fileCount: number;
				materializedCount: number;
				entries: Array<{
					fileId: string;
					status: string;
					error?: string;
					fileName?: string;
					materializationMethod?: string;
				}>;
			};
			expect(manifest.fileCount).toBe(2);
			expect(manifest.materializedCount).toBe(1);
			expect(manifest.entries).toEqual([
				expect.objectContaining({
					fileId: "conv-file-1",
					fileName: "notes.txt",
					status: "materialized",
					materializationMethod: "gemini-file-preview-download",
				}),
				expect.objectContaining({
					fileId: "conv-file-2",
					fileName: "image.png",
					status: "error",
					error: "conversation file fetch failed",
				}),
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeConversationFiles salvages matching cached uploaded files without another provider download", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const conversationId = "conversation-123";
		const fileId = `gemini-conversation-file:${conversationId}:0:AGENTS.md`;
		const cacheContext: ProviderCacheContext = {
			provider: "gemini",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const { cacheDir } = resolveProviderCachePath(
			cacheContext,
			`conversation-attachments/${conversationId}/manifest.json`,
		);
		const attachmentsDir = path.join(cacheDir, "conversation-attachments", conversationId, "files");
		const cachedPath = path.join(attachmentsDir, "cached-agents", "AGENTS.md");
		await fs.mkdir(path.dirname(cachedPath), { recursive: true });
		await fs.writeFile(cachedPath, "cached uploaded file body", "utf8");
		const cachedStat = await fs.stat(cachedPath);

		const store = new JsonCacheStore();
		await store.writeConversationAttachments(cacheContext, conversationId, [
			{
				id: fileId,
				name: "AGENTS.md",
				provider: "gemini",
				source: "conversation",
				mimeType: "text/markdown",
				size: cachedStat.size,
				localPath: cachedPath,
				metadata: { kind: "uploaded-file", conversationId },
			},
		]);
		const conversationFiles: FileRef[] = [
			{
				id: fileId,
				name: "AGENTS.md",
				provider: "gemini",
				source: "conversation",
				mimeType: "text/markdown",
				size: cachedStat.size,
				metadata: { kind: "uploaded-file", conversationId },
			},
		];
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			listConversationFiles: vi.fn(async () => conversationFiles),
			downloadConversationFile: vi.fn(async () => {
				throw new Error("no preview surface");
			}),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeConversationFiles(conversationId, {
				listOptions: {},
			});
			expect(result.files).toHaveLength(1);
			expect(provider.downloadConversationFile).not.toHaveBeenCalled();
			expect(result.files[0]).toEqual(
				expect.objectContaining({
					id: fileId,
					name: "AGENTS.md",
					localPath: cachedPath,
					size: cachedStat.size,
					checksumSha256: "738f3d34fd0d7c9ca4bda787b1edc85949bd8a086da8365ba46908722e55b2ef",
					metadata: expect.objectContaining({
						materializationSource: "cached-provider-file",
						cachedProviderFile: true,
					}),
				}),
			);
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8")) as {
				materializedCount: number;
				entries: Array<{
					fileId: string;
					status: string;
					localPath?: string;
					size?: number;
					materializationMethod?: string;
				}>;
			};
			expect(manifest.materializedCount).toBe(1);
			expect(manifest.entries).toEqual([
				expect.objectContaining({
					fileId,
					status: "materialized",
					localPath: cachedPath,
					size: cachedStat.size,
					materializationMethod: "cached-provider-file",
				}),
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeConversationFiles does not salvage cache-only files without current provider evidence", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const conversationId = "conversation-123";
		const cacheContext: ProviderCacheContext = {
			provider: "gemini",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		await store.writeConversationAttachments(cacheContext, conversationId, [
			{
				id: `gemini-conversation-file:${conversationId}:0:AGENTS.md`,
				name: "AGENTS.md",
				provider: "gemini",
				source: "conversation",
				localPath: path.join(homeDir, "AGENTS.md"),
				metadata: { kind: "uploaded-file", conversationId },
			},
		]);
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			listConversationFiles: vi.fn(async () => [] as FileRef[]),
			downloadConversationFile: vi.fn(async () => undefined),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeConversationFiles(conversationId, {
				listOptions: {},
			});
			expect(result.files).toEqual([]);
			expect(result.manifestPath).toBeNull();
			expect(provider.downloadConversationFile).not.toHaveBeenCalled();
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test.each([
		{
			name: "mismatched size",
			currentFileId: "conv-file-1",
			cachedFileId: "conv-file-1",
			cachedPath: "inside",
			currentSize: 999,
		},
		{
			name: "missing file",
			currentFileId: "conv-file-1",
			cachedFileId: "conv-file-1",
			cachedPath: "missing",
			currentSize: 23,
		},
		{
			name: "mismatched provider file id",
			currentFileId: "conv-file-2",
			cachedFileId: "conv-file-1",
			cachedPath: "inside",
			currentSize: 23,
		},
	])("materializeConversationFiles preserves terminal failure for $name", async (scenario) => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const conversationId = "conversation-123";
		const cacheContext: ProviderCacheContext = {
			provider: "gemini",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const { cacheDir } = resolveProviderCachePath(
			cacheContext,
			`conversation-attachments/${conversationId}/manifest.json`,
		);
		const attachmentsDir = path.join(cacheDir, "conversation-attachments", conversationId, "files");
		const cachedPath =
			scenario.cachedPath === "inside"
				? path.join(attachmentsDir, "cached-file", "AGENTS.md")
				: path.join(attachmentsDir, "missing-file", "AGENTS.md");
		if (scenario.cachedPath === "inside") {
			await fs.mkdir(path.dirname(cachedPath), { recursive: true });
			await fs.writeFile(cachedPath, "cached uploaded file body", "utf8");
		}
		const store = new JsonCacheStore();
		await store.writeConversationAttachments(cacheContext, conversationId, [
			{
				id: scenario.cachedFileId,
				name: "AGENTS.md",
				provider: "gemini",
				source: "conversation",
				mimeType: "text/markdown",
				size: 23,
				localPath: cachedPath,
				metadata: { kind: "uploaded-file", conversationId },
			},
		]);
		const conversationFiles: FileRef[] = [
			{
				id: scenario.currentFileId,
				name: "AGENTS.md",
				provider: "gemini",
				source: "conversation",
				mimeType: "text/markdown",
				size: scenario.currentSize,
				metadata: { kind: "uploaded-file", conversationId },
			},
		];
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			listConversationFiles: vi.fn(async () => conversationFiles),
			downloadConversationFile: vi.fn(async () => {
				throw new Error("no preview surface");
			}),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeConversationFiles(conversationId, {
				listOptions: {},
			});
			expect(result.files).toEqual([]);
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8")) as {
				materializedCount: number;
				entries: Array<{ fileId: string; status: string; error?: string; localPath?: string }>;
			};
			expect(manifest.materializedCount).toBe(0);
			expect(manifest.entries).toEqual([
				expect.objectContaining({
					fileId: scenario.currentFileId,
					status: "error",
					error: "no preview surface",
				}),
			]);
			expect(manifest.entries[0].localPath).toBeUndefined();
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("buildListOptions honors explicit host/port without rediscovering the browser target", async () => {
		const browserService = {
			resolveServiceTarget: vi.fn(async () => ({
				host: "127.0.0.1",
				port: 45011,
				tab: { targetId: "should-not-be-used" },
			})),
		};
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
		};
		const service = new BuildListOptionsLlmService(
			{ browser: { cache: {} } } as ResolvedUserConfig,
			provider as never,
			browserService,
		);

		const result = await service.buildListOptions({
			host: "127.0.0.1",
			port: 9222,
			configuredUrl: "https://grok.com/c/conversation-123",
		});

		expect(browserService.resolveServiceTarget).not.toHaveBeenCalled();
		expect(result.host).toBe("127.0.0.1");
		expect(result.port).toBe(9222);
		expect(result.configuredUrl).toBe("https://grok.com/c/conversation-123");
	});

	test("buildListOptions uses Gemini service URLs instead of inheriting ChatGPT defaults", async () => {
		const browserService = {
			resolveServiceTarget: vi.fn(async ({ configuredUrl }: { configuredUrl?: string | null }) => ({
				host: "127.0.0.1",
				port: 45011,
				tab: {
					targetId: "gemini-target",
					url: configuredUrl,
				},
			})),
		};
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
		};
		const service = new BuildListOptionsLlmService(
			{
				browser: {
					cache: {},
					url: CHATGPT_URL,
					chatgptUrl: CHATGPT_URL,
					geminiUrl: "https://gemini.google.com/gem/test-gem",
				},
			} as ResolvedUserConfig,
			provider as never,
			browserService,
		);

		const result = await service.buildListOptions();

		expect(browserService.resolveServiceTarget).toHaveBeenCalledWith({
			serviceId: "gemini",
			configuredUrl: "https://gemini.google.com/gem/test-gem",
			ensurePort: undefined,
		});
		expect(result.configuredUrl).toBe("https://gemini.google.com/gem/test-gem");
		expect(result.tabUrl).toBe("https://gemini.google.com/gem/test-gem");
	});

	test("buildListOptions falls back to the Gemini app URL when no Gemini URL is configured", async () => {
		const browserService = {
			resolveServiceTarget: vi.fn(async (_input: { configuredUrl?: string | null }) => ({
				host: "127.0.0.1",
				port: undefined,
				tab: null,
			})),
		};
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
		};
		const service = new BuildListOptionsLlmService(
			{ browser: { cache: {} } } as ResolvedUserConfig,
			provider as never,
			browserService,
		);

		const result = await service.buildListOptions();

		expect(browserService.resolveServiceTarget).toHaveBeenCalledWith({
			serviceId: "gemini",
			configuredUrl: null,
			ensurePort: undefined,
		});
		expect(result.configuredUrl).toBeNull();
		expect(result.port).toBeUndefined();
		expect(service.readDefaultLaunchUrl()).toBe(GEMINI_URL);
	});

	test("uploadProjectFiles refreshes project-knowledge cache from the live list", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "grok",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const files: FileRef[] = [
			{ id: "spec.md", name: "spec.md", provider: "grok", source: "project", size: 21 },
		];
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			uploadProjectFiles: vi.fn(async () => undefined),
			listProjectFiles: vi.fn(async () => files),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			await service.uploadProjectFiles("project-123", ["/tmp/spec.md"], { listOptions: {} });
			expect(provider.uploadProjectFiles).toHaveBeenCalledWith("project-123", ["/tmp/spec.md"], {});
			expect(provider.listProjectFiles).toHaveBeenCalledWith("project-123", {});
			const cached = await store.readProjectKnowledge(cacheContext, "project-123");
			expect(cached.items).toEqual(files);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("uploadAccountFiles refreshes account-files cache from the live list", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "grok",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const files: FileRef[] = [
			{ id: "file-abc", name: "spec.md", provider: "grok", source: "account" },
		];
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			uploadAccountFiles: vi.fn(async () => undefined),
			listAccountFiles: vi.fn(async () => files),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			await service.uploadAccountFiles(["/tmp/spec.md"], { listOptions: {} });
			expect(provider.uploadAccountFiles).toHaveBeenCalledWith(["/tmp/spec.md"], {});
			expect(provider.listAccountFiles).toHaveBeenCalledWith({});
			const cached = await store.readAccountFiles(cacheContext);
			expect(cached.items).toEqual(files);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeAccountFiles writes account file assets, manifest, and cache rows", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-account-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const accountFiles: FileRef[] = [
			{
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
			},
			{
				id: "library-file-2",
				name: "unavailable.pdf",
				provider: "chatgpt",
				source: "account",
				remoteUrl: "chatgpt://file/file_library_2",
			},
		];
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			listAccountFiles: vi.fn(async () => accountFiles),
			downloadAccountFile: vi.fn(async (fileId: string, destPath: string) => {
				if (fileId === "library-file-1") {
					await fs.writeFile(destPath, "%PDF-1.7 account library proof", "utf8");
					return;
				}
				throw new Error("account library download failed");
			}),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeAccountFiles({ listOptions: {} });
			expect(result.accountFiles).toHaveLength(2);
			expect(result.files).toHaveLength(1);
			expect(result.files[0]).toMatchObject({
				id: "library-file-1",
				localPath: expect.stringContaining("library-proof.pdf"),
				checksumSha256: expect.any(String),
				metadata: {
					accountFileMaterialization: "account-file-download",
					providerFileId: "file_library_1",
				},
			});
			expect(provider.downloadAccountFile).toHaveBeenCalledWith(
				"library-file-1",
				expect.stringContaining("library-proof.pdf"),
				{},
				accountFiles[0],
			);
			const cached = await store.readAccountFiles(cacheContext);
			expect(cached.items).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "library-file-1",
						localPath: expect.stringContaining("library-proof.pdf"),
						checksumSha256: expect.any(String),
					}),
				]),
			);
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8")) as {
				fileCount: number;
				materializedCount: number;
				entries: Array<{
					fileId: string;
					status: string;
					fileName?: string;
					materializationMethod?: string;
					error?: string;
				}>;
			};
			expect(manifest.fileCount).toBe(2);
			expect(manifest.materializedCount).toBe(1);
			expect(manifest.entries).toEqual([
				expect.objectContaining({
					fileId: "library-file-1",
					fileName: "library-proof.pdf",
					status: "materialized",
					materializationMethod: "chatgpt-library-file-row-click",
				}),
				expect.objectContaining({
					fileId: "library-file-2",
					fileName: "unavailable.pdf",
					status: "error",
					error: "account library download failed",
				}),
			]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("materializeAccountFiles can use preselected account files without refreshing the live list", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-account-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const selected: FileRef[] = [
			{
				id: "selected-library-file",
				name: "selected.pdf",
				provider: "chatgpt",
				source: "account",
				remoteUrl: "chatgpt://file/file_selected",
			},
		];
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			listAccountFiles: vi.fn(async () => {
				throw new Error("list should not be called for preselected files");
			}),
			downloadAccountFile: vi.fn(async (_fileId: string, destPath: string) => {
				await fs.writeFile(destPath, "%PDF-1.7 selected account library proof", "utf8");
			}),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			const result = await service.materializeAccountFiles({ listOptions: {}, files: selected });
			expect(provider.listAccountFiles).not.toHaveBeenCalled();
			expect(result.accountFiles).toEqual(selected);
			expect(result.files).toHaveLength(1);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("deleteProjectFile refreshes project-knowledge cache after removal", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "grok",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			deleteProjectFile: vi.fn(async () => undefined),
			listProjectFiles: vi.fn(async () => [] as FileRef[]),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			await service.deleteProjectFile("project-123", "notes.txt", { listOptions: {} });
			expect(provider.deleteProjectFile).toHaveBeenCalledWith("project-123", "notes.txt", {});
			expect(provider.listProjectFiles).toHaveBeenCalledWith("project-123", {});
			const cached = await store.readProjectKnowledge(cacheContext, "project-123");
			expect(cached.items).toEqual([]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("deleteAccountFile refreshes account-files cache after removal", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-files-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "grok",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			deleteAccountFile: vi.fn(async () => undefined),
			listAccountFiles: vi.fn(async () => [] as FileRef[]),
		};
		const service = new TestLlmService(provider as never, store, cacheContext);

		try {
			await service.deleteAccountFile("file-123", { listOptions: {} });
			expect(provider.deleteAccountFile).toHaveBeenCalledWith("file-123", {});
			expect(provider.listAccountFiles).toHaveBeenCalledWith({});
			const cached = await store.readAccountFiles(cacheContext);
			expect(cached.items).toEqual([]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});
});
