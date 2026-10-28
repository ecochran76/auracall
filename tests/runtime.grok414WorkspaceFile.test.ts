// biome-ignore-all lint/style/useNamingConvention: Native React, DOM and CDP boundary names.
import { createHash, webcrypto } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, expect, test, vi } from "vitest";
const wire = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("chrome-remote-interface", () => ({ default: { Close: async () => undefined } }));
vi.mock("../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: async () => wire.client,
}));
import { createGrokAdapter } from "../src/browser/providers/grokAdapter.js";
import { createProviderSessionAuthority } from "../src/browser/providers/providerSessionAuthority.js";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import {
	materializeGrokWorkspaceFile,
	readGrokWorkspaceFile,
} from "../src/browser/providers/grokWorkspaceFile.js";
import { createRunArchiveIndexStore } from "../src/runtime/archiveIndexStore.js";
import { createArchiveMaterializationService } from "../src/runtime/archiveMaterializationService.js";
import { createRunArchiveService, type RunArchiveItem } from "../src/runtime/archiveService.js";

const roots: string[] = [];
afterEach(async () => {
	setAuracallHomeDirOverrideForTest(null);
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

function nativeFile(afterHash?: () => void) {
	class Element {
		getBoundingClientRect() {
			return { width: 10, height: 10 };
		}
		closest() {
			return null;
		}
		getAttribute(name: string) {
			return name === "aria-label" ? "File tree" : null;
		}
	}
	const button = new Element();
	const content = {
		assetUrl: "data:text/typescript;base64,ZXhwb3J0IGNvbnN0IHRpbWVyID0gMTsK",
		fileName: "timer.tsx",
		mimeType: "text/typescript",
		isLoading: false,
		isError: false,
		isWorkspaceInactive: false,
	};
	const query = { dataUrl: content.assetUrl, mimeType: "text/typescript" };
	const viewer = {
		memoizedProps: { filePath: "/src/components/timer.tsx" },
		updateQueue: { memoCache: { data: [[content], [query]] } },
		child: null,
		sibling: null,
	};
	const scope = {
		memoizedProps: {
			fs: { fsKey: "conversation:owned" },
			tree: [{ path: "/src/components/timer.tsx", isDir: false }],
			status: "ready",
		},
		child: { stateNode: button, sibling: viewer, child: null },
		sibling: null,
	};
	const owner: { current: unknown } = { current: null };
	const current = { tag: 3, stateNode: owner, return: null, child: scope };
	owner.current = current;
	Object.assign(scope, { return: current });
	Object.assign(scope.child, { return: scope });
	Object.assign(viewer, { return: scope });
	Object.assign(button, { __reactFiber$fixture: scope.child });
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: {
				value: await runInNewContext(expression, {
					document: { querySelectorAll: () => [button] },
					HTMLElement: Element,
					location: { origin: "https://grok.com", pathname: "/c/owned" },
					getComputedStyle: () => ({ display: "block", visibility: "visible" }),
					crypto: {
						subtle: {
							digest: async (...args: Parameters<typeof webcrypto.subtle.digest>) => {
								const result = await webcrypto.subtle.digest(...args);
								afterHash?.();
								return result;
							},
						},
					},
					TextEncoder,
					URL,
					atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
					btoa: (s: string) => Buffer.from(s, "binary").toString("base64"),
				}),
			},
		}),
	};
	return { runtime, content, query, viewer, owner, current };
}

function item(fingerprint: string): RunArchiveItem {
	return {
		id: "selected-workspace-file",
		object: "run_archive_item",
		kind: "generated_artifact",
		source: "account_mirror",
		createdAt: "2026-10-28T00:00:00Z",
		updatedAt: "2026-10-28T00:00:00Z",
		title: "timer.tsx",
		status: "metadata-only",
		provider: "grok",
		runtimeProfile: "default",
		browserProfile: "default",
		projectId: null,
		boundIdentityKey: null,
		agentId: null,
		teamId: null,
		responseId: null,
		batchId: null,
		batchIndex: null,
		mediaGenerationId: null,
		providerConversationId: "owned",
		providerConversationUrl: "https://grok.com/c/owned",
		artifactId: "/src/components/timer.tsx",
		fileName: "timer.tsx",
		mimeType: "text/typescript",
		localPath: null,
		uri: null,
		cacheKey: null,
		checksumSha256: null,
		fileAvailable: false,
		metadata: {
			grokWorkspaceFile: {
				version: 1,
				conversationId: "owned",
				filePath: "/src/components/timer.tsx",
				dataUrlSha256: fingerprint,
			},
		},
		links: {},
	};
}

test("public archive materialization retains actual selected native workspace bytes with conversation and path provenance", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok414-native-file-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const native = nativeFile();
	const observed = await readGrokWorkspaceFile(native.runtime, "owned");
	const selected = item(observed.dataUrlSha256);
	await createRunArchiveIndexStore().upsertItems([selected], { updatedAt: selected.updatedAt });
	const service = createArchiveMaterializationService({
		config: {},
		materializeConversationArtifact: async (input) =>
			materializeGrokWorkspaceFile(native.runtime, {
				conversationId: input.conversationId,
				artifact: input.artifact,
				destDir: input.destDir,
				targetId: "owned-target",
				providerAccountRef: "qualified-account",
				providerAccountRefFormat: "legacy-untagged",
				verifyPrincipal: async () => true,
			}),
	});
	expect(
		(await createRunArchiveService().readItem(selected.id))?.item.metadata.materialization,
	).toMatchObject({ status: "not_materialized" });
	const result = await service.materializeItem({ archiveItemId: selected.id });
	expect(result.status).toBe("materialized");
	const localPath = result.item.localPath;
	if (!localPath) throw new Error("Expected retained local file");
	expect(await fs.readFile(localPath, "utf8")).toBe("export const timer = 1;\n");
	expect(result.item).toMatchObject({
		checksumSha256: createHash("sha256").update("export const timer = 1;\n").digest("hex"),
		metadata: {
			grokWorkspaceFile: {
				conversationId: "owned",
				filePath: "/src/components/timer.tsx",
				contentRevision: null,
				appId: null,
				appVersion: null,
				sizeBytes: 24,
				targetId: "owned-target",
				providerAccountRef: "qualified-account",
				providerAccountRefFormat: "legacy-untagged",
			},
		},
	});
	expect(JSON.stringify(result)).not.toContain("data:text");
	expect((await createRunArchiveService().readItem(selected.id))?.item.fileAvailable).toBe(true);
	const reused = await service.materializeItem({ archiveItemId: selected.id });
	expect(reused.status).toBe("already_materialized");
	await fs.writeFile(localPath, Buffer.alloc(24, 120));
	expect(await createRunArchiveService().readAsset(selected.id)).toBeNull();
	expect((await createRunArchiveService().readItem(selected.id))?.item.checksumSha256).toBe(
		result.item.checksumSha256,
	);
	expect((await service.materializeItem({ archiveItemId: selected.id, force: true })).status).toBe(
		"skipped",
	);
});

test("existing Grok artifact discovery and materialization expose the actual selected native path without inventing a URI", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok414-adapter-"));
	roots.push(root);
	const native = nativeFile();
	const evaluate = native.runtime.evaluate;
	wire.client = {
		close: async () => undefined,
		Page: { enable: async () => undefined },
		Runtime: {
			enable: async () => undefined,
			evaluate: async (input: { expression: string }) => {
				if (input.expression.includes("grok_workspace_file_")) return evaluate(input);
				if (input.expression.includes("const identity = { id: null"))
					return {
						result: {
							value: {
								id: "fixture-user",
								email: "operator@example.test",
								guestAuthCta: false,
								source: "app",
							},
						},
					};
				if (input.expression.includes("guestAuthCta"))
					return {
						result: {
							value: {
								href: "https://grok.com/c/owned",
								title: "Grok",
								bodyText: "Chat",
								guestAuthCta: false,
							},
						},
					};
				return { result: { value: true } };
			},
		},
	};
	const authority = createProviderSessionAuthority({
		services: { grok: { identity: { email: "operator@example.test" } } },
	});
	const context = {
		providerId: "grok" as const,
		auracallRuntimeProfile: "default",
		browserProfile: "default",
		sourceBrowserProfile: "Default",
		managedBrowserProfile: "/fixture/grok",
		browserProcessId: 1234,
		browserTargetId: "fixture",
		devtoolsHost: "127.0.0.1",
		devtoolsPort: 9222,
	};
	const options = {
		host: "127.0.0.1",
		port: 9222,
		tabTargetId: "fixture",
		allowNavigation: false,
		providerSessionAuthorization: {
			authority,
			context,
			expectation: authority.resolveExpectation(context),
		},
		providerTrafficGovernor: {
			attribution: { provider: "grok", targetId: "fixture" },
			begin: async () => ({ settle: async () => undefined }),
		},
	};
	const adapter = createGrokAdapter();
	const read = adapter.readActiveConversationArtifacts,
		materialize = adapter.materializeConversationArtifact;
	if (!read || !materialize) throw new Error("Expected public Grok artifact operations");
	const artifacts = await read("owned", options as never);
	expect(artifacts).toMatchObject([
		{
			id: "/src/components/timer.tsx",
			title: "timer.tsx",
			kind: "generated",
			metadata: {
				grokWorkspaceFile: {
					conversationId: "owned",
					filePath: "/src/components/timer.tsx",
					targetId: "fixture",
					contentRevision: null,
				},
			},
		},
	]);
	expect(artifacts[0].uri).toBeUndefined();
	const retained = await materialize("owned", artifacts[0], root, undefined, options as never);
	if (!retained?.localPath) throw new Error("Expected retained native file");
	expect(await fs.readFile(retained.localPath, "utf8")).toBe("export const timer = 1;\n");
	expect(JSON.stringify(retained)).not.toContain("data:text");
});

test("selected native file becomes uncertain when its content error changes during asynchronous hashing", async () => {
	const native = nativeFile(() => {
		native.content.isError = true;
	});
	await expect(readGrokWorkspaceFile(native.runtime, "owned")).rejects.toThrow(/commit_changed/);
});

test.each([
	"duplicate-basename",
	"account-changed",
] as const)("selected native bytes fail closed before local retention (%s)", async (reason) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok414-refusal-"));
	roots.push(root);
	const native = nativeFile();
	const observed = await readGrokWorkspaceFile(native.runtime, "owned");
	const filePath = reason === "duplicate-basename" ? "/other/timer.tsx" : observed.filePath;
	const artifact = {
		id: filePath,
		title: "timer.tsx",
		metadata: {
			grokWorkspaceFile: {
				version: 1,
				conversationId: "owned",
				filePath,
				dataUrlSha256: observed.dataUrlSha256,
			},
		},
	};
	await expect(
		materializeGrokWorkspaceFile(native.runtime, {
			conversationId: "owned",
			artifact,
			destDir: root,
			targetId: "owned-target",
			providerAccountRef: "qualified-account",
			providerAccountRefFormat: "legacy-untagged",
			verifyPrincipal: async () => reason !== "account-changed",
		}),
	).rejects.toThrow(/workspace/);
	expect(await fs.readdir(root)).toEqual([]);
});
