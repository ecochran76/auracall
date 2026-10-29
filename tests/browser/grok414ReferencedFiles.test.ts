// biome-ignore-all lint/style/useNamingConvention: Native React, DOM and CDP boundary names.

import { webcrypto } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";

const wire = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("chrome-remote-interface", () => ({ default: { Close: async () => undefined } }));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: async () => wire.client,
}));

import type { FileRef } from "../../src/browser/providers/domain.js";
import { createGrokAdapter } from "../../src/browser/providers/grokAdapter.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import { BrowserAutomationError } from "../../src/oracle/errors.js";

const conversationId = "fixture-conversation",
	responseId = "22222222-2222-4222-8222-222222222222";
const fileId = "11111111-1111-4111-8111-111111111111";
interface Fiber {
	tag?: number;
	stateNode?: unknown;
	return: Fiber | null;
	child?: Fiber;
	sibling?: Fiber;
	memoizedProps?: Record<string, unknown>;
	updateQueue?: unknown;
	type?: unknown;
}
function required<T>(value: T | null | undefined): T {
	if (value == null) throw Error("Required fixture value missing");
	return value;
}
class Element {
	disabled = false;
	parentElement: Element | null = null;
	constructor(
		public attributes: Record<string, string> = {},
		public innerText = "",
	) {}
	get id() {
		return this.attributes.id ?? "";
	}
	getAttribute(key: string) {
		return this.attributes[key] ?? null;
	}
	getBoundingClientRect() {
		return { width: 100, height: 30 };
	}
	closest(selector: string): Element | null {
		if (selector.includes('id^="response-"') && this.id.startsWith("response-")) return this;
		if (selector.includes("data-plane-row") && "data-plane-row" in this.attributes) return this;
		if (selector.includes("inert") && "inert" in this.attributes) return this;
		if (selector.includes("aria-hidden") && this.attributes["aria-hidden"] === "true") return this;
		return this.parentElement?.closest(selector) ?? null;
	}
	onClick = () => {};
	click() {
		this.onClick();
	}
	querySelector() {
		return new Element();
	}
}
function fixture() {
	const row = new Element({
		id: `response-${responseId}`,
		"data-plane-row": "gateway:separate-domain",
		class: "items-end",
	});
	const assistantRow = new Element({
		id: "response-33333333-3333-4333-8333-333333333333",
		class: "items-start",
	});
	const card = new Element(
		{ "aria-label": "Open attachment", "data-state": "closed" },
		"reference-414.txt",
	);
	card.parentElement = row;
	const metadata = {
		fileMetadataId: fileId,
		fileName: "reference-414.txt",
		fileMimeType: "text/plain",
		fileUri: `users/fixture-user/${fileId}/content`,
		fileSource: "SELF_UPLOAD_FILE_SOURCE",
	};
	const response = { responseId, conversationId, sender: "human", fileAttachments: [fileId] };
	const owner: { current: unknown } = { current: null };
	const root: Fiber = { tag: 3, stateNode: owner, return: null };
	const message: Fiber = { return: root, memoizedProps: { response, isUser: true } };
	const rowFiber: Fiber = { return: message, stateNode: row };
	const props: Fiber = {
		return: rowFiber,
		memoizedProps: { metadata, fileName: metadata.fileName },
	};
	const host: Fiber = { return: props, stateNode: card };
	root.child = message;
	message.child = rowFiber;
	rowFiber.child = props;
	props.child = host;
	owner.current = root;
	Object.assign(card, { __reactFiber$fixture: host });
	Object.assign(row, { __reactFiber$fixture: rowFiber });
	const transfer = {
		fetchCalls: 0,
		downloadClicks: 0,
		previewClicks: 0,
		previewOpen: false,
		failReset: false,
		failClose: false,
		downloadDirectory: null as string | null,
		policies: [] as string[],
	};
	card.onClick = () => {
		transfer.previewOpen = true;
		transfer.previewClicks++;
	};
	const base = "https://assets.grok.com",
		url = `${base}/${metadata.fileUri}`;
	function NativeSidePanel() {
		const ASSET_SERVER_URL = "native";
		return `${ASSET_SERVER_URL}SidePanel:assetDownload`;
	}
	const download = new Element({ "aria-label": "Download" }, "Download");
	const active = { type: "asset", data: metadata },
		cache = [base, active, url];
	const preview: Fiber = {
		return: root,
		type: NativeSidePanel,
		updateQueue: { memoCache: { data: [cache] } },
	};
	const downloadHost: Fiber = { return: preview, stateNode: download };
	message.sibling = preview;
	preview.child = downloadHost;
	Object.assign(download, { __reactFiber$fixture: downloadHost });
	download.onClick = () => {
		transfer.downloadClicks++;
		if (!transfer.downloadDirectory) throw Error("Missing scoped download policy");
		void fs.writeFile(path.join(transfer.downloadDirectory, metadata.fileName), content);
	};
	const content = new TextEncoder().encode(
		"AuraCall ticket 414 referenced-file acceptance.\nSynthetic test data only.\nNo personal data or credentials.\n",
	);
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => {
			if (expression === "location.href")
				return { result: { value: `https://grok.com/c/${conversationId}` } };
			if (expression.includes("collectAccordionLinks"))
				return {
					result: {
						value: {
							ok: true,
							messages: [
								{ role: "user", text: "Synthetic reference request" },
								{ role: "assistant", text: "reference-414.txt" },
							],
							sources: [],
							observation: { totalMessages: 2, fingerprint: "fixture-source-inventory" },
						},
					},
				};
			if (expression.includes("const identity = { id: null"))
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
			if (expression.includes("guestAuthCta"))
				return {
					result: {
						value: {
							href: `https://grok.com/c/${conversationId}`,
							title: "Grok",
							bodyText: "Chat",
							guestAuthCta: false,
						},
					},
				};
			if (
				expression.includes("grok_workspace_file_") ||
				expression.includes("grok_referenced_file_")
			)
				return {
					result: {
						value: await runInNewContext(expression, {
							document: {
								querySelectorAll: (selector: string) =>
									selector === 'main [id^="response-"]'
										? [row, assistantRow]
										: selector.includes("Open attachment")
											? [card]
											: selector.includes("Download") && transfer.previewOpen
												? [download]
												: [],
								getElementById: (id: string) => (id === row.id ? row : null),
							},
							HTMLElement: Element,
							location: { origin: "https://grok.com", pathname: `/c/${conversationId}` },
							getComputedStyle: () => ({ display: "block", visibility: "visible" }),
							crypto: webcrypto,
							TextEncoder,
							URL,
							AbortController,
							setTimeout,
							clearTimeout,
							btoa: (s: string) => Buffer.from(s, "binary").toString("base64"),
							fetch: async () => {
								transfer.fetchCalls++;
								throw Error("Direct GET is not the qualified native reference transport");
							},
						}),
					},
				};
			return { result: { value: true } };
		},
	};
	wire.client = {
		close: async () => {
			if (transfer.failClose) throw Error("fixture transport close failed");
		},
		Page: {
			enable: async () => undefined,
			setDownloadBehavior: async (input: { behavior: string; downloadPath?: string }) => {
				transfer.policies.push(input.behavior);
				if (input.behavior === "default" && transfer.failReset)
					throw Error("fixture policy reset failed");
				transfer.downloadDirectory = input.downloadPath ?? null;
			},
		},
		Runtime: { ...runtime, enable: async () => undefined },
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
		grokReferenceDownload: { acknowledgeTargetDefaultReset: true as const },
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
	return { options, metadata, response, owner, root, transfer, cache };
}

test("public Grok artifact discovery binds an uploaded reference to its actual native human response and file identity", async () => {
	const f = fixture(),
		adapter = createGrokAdapter();
	const artifacts = await required(adapter.readActiveConversationArtifacts)(
		conversationId,
		f.options as never,
	);
	expect(artifacts).toMatchObject([
		{
			id: fileId,
			title: "reference-414.txt",
			messageId: responseId,
			metadata: {
				grokReferencedFile: {
					conversationId,
					providerResponseId: responseId,
					messageDomId: `response-${responseId}`,
					gatewayRowId: "gateway:separate-domain",
					fileMetadataId: fileId,
					targetId: "fixture",
					providerAccountRefFormat: "legacy-untagged",
					appId: null,
					appVersion: null,
					coverage: { scope: "visible-conversation-references", complete: false },
				},
			},
		},
	]);
	expect(artifacts[0].uri).toBeUndefined();
	expect(JSON.stringify(artifacts)).not.toContain("users/fixture-user");
	expect(artifacts[0].metadata).not.toHaveProperty("grokWorkspaceFile");
});

test("public Grok reference materialization uses the native Download UI with acknowledged scoped capture and separate provenance", async () => {
	const f = fixture(),
		adapter = createGrokAdapter(),
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "grok414-reference-"));
	try {
		const artifacts = await required(adapter.readActiveConversationArtifacts)(
			conversationId,
			f.options as never,
		);
		const file = await required(adapter.materializeConversationArtifact)(
			conversationId,
			artifacts[0],
			dir,
			undefined,
			f.options as never,
		);
		expect(file).toMatchObject({
			id: fileId,
			name: "reference-414.txt",
			size: 107,
			checksumSha256: "5e34ff7e9d8997af149b7a875940dce6117c1f2b73fc23e7ae159ea197d38e78",
			metadata: {
				grokReferencedFile: {
					fileMetadataId: fileId,
					providerResponseId: responseId,
					conversationId,
					appId: null,
					appVersion: null,
					providerAccountRefFormat: "legacy-untagged",
				},
			},
		});
		expect(await fs.readFile(required(required(file).localPath), "utf8")).toBe(
			"AuraCall ticket 414 referenced-file acceptance.\nSynthetic test data only.\nNo personal data or credentials.\n",
		);
		expect(f.transfer).toMatchObject({
			previewClicks: 1,
			downloadClicks: 1,
			fetchCalls: 0,
			policies: ["allow", "default"],
		});
		expect(JSON.stringify(file)).not.toContain("https://assets.grok.com");
		expect(JSON.stringify(file)).not.toContain("users/fixture-user");
		const receipt = JSON.parse(
			await fs.readFile(
				required(required(file).metadata).materializationReceiptPath as string,
				"utf8",
			),
		);
		expect(receipt.proof).toEqual(required(required(file).metadata).grokReferencedFile);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

test("public archive reference retention reuses verified bytes and refuses same-size corruption without replacing the retained checksum", async () => {
	const { setAuracallHomeDirOverrideForTest } = await import("../../src/auracallHome.js");
	const { createRunArchiveIndexStore } = await import("../../src/runtime/archiveIndexStore.js");
	const { createRunArchiveService } = await import("../../src/runtime/archiveService.js");
	const { createArchiveMaterializationService } = await import(
		"../../src/runtime/archiveMaterializationService.js"
	);
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok414-reference-archive-"));
	setAuracallHomeDirOverrideForTest(root);
	try {
		const f = fixture(),
			adapter = createGrokAdapter(),
			artifact = (
				await required(adapter.readActiveConversationArtifacts)(conversationId, f.options as never)
			)[0];
		const now = "2026-10-29T00:00:00Z",
			id = "referenced-file";
		await createRunArchiveIndexStore().upsertItems([
			{
				id,
				object: "run_archive_item",
				kind: "upload",
				source: "account_mirror",
				createdAt: now,
				updatedAt: now,
				title: artifact.title,
				status: "metadata-only",
				provider: "grok",
				runtimeProfile: "default",
				browserProfile: "default",
				projectId: null,
				boundIdentityKey: null,
				agentId: null,
				teamId: null,
				responseId,
				batchId: null,
				batchIndex: null,
				mediaGenerationId: null,
				providerConversationId: conversationId,
				providerConversationUrl: `https://grok.com/c/${conversationId}`,
				artifactId: artifact.id,
				fileName: artifact.title,
				mimeType: "text/plain",
				localPath: null,
				uri: null,
				cacheKey: null,
				checksumSha256: null,
				fileAvailable: false,
				metadata: required(artifact.metadata),
				links: {},
			},
		]);
		const archive = createRunArchiveService();
		expect((await archive.readItem(id))?.item.metadata.materialization).toMatchObject({
			status: "not_materialized",
		});
		const service = createArchiveMaterializationService({
			config: {},
			materializeConversationArtifact: (input) =>
				required(adapter.materializeConversationArtifact)(
					input.conversationId,
					input.artifact,
					input.destDir,
					undefined,
					f.options as never,
				),
		});
		const retained = await service.materializeItem({
			archiveItemId: id,
			acknowledgeTargetDefaultReset: true,
		});
		expect(retained.status).toBe("materialized");
		expect(retained.item.metadata.grokReferencedFile).toMatchObject({
			fileMetadataId: fileId,
			providerResponseId: responseId,
			providerAccountRefFormat: "legacy-untagged",
		});
		expect((await service.materializeItem({ archiveItemId: id })).status).toBe(
			"already_materialized",
		);
		expect(f.transfer.downloadClicks).toBe(1);
		expect(f.transfer.fetchCalls).toBe(0);
		await fs.writeFile(required(retained.item.localPath), Buffer.alloc(107, 120));
		expect(await archive.readAsset(id)).toBeNull();
		expect((await archive.readItem(id))?.item.checksumSha256).toBe(
			"5e34ff7e9d8997af149b7a875940dce6117c1f2b73fc23e7ae159ea197d38e78",
		);
		const refused = await service.materializeItem({ archiveItemId: id, force: true });
		expect(refused.status).toBe("skipped");
		expect(refused.file).toBeNull();
		expect(f.transfer.downloadClicks).toBe(1);
		expect(f.transfer.fetchCalls).toBe(0);
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("fresh reference transfer refuses a missing download-policy acknowledgment before preview or policy mutation", async () => {
	const f = fixture(),
		adapter = createGrokAdapter(),
		artifacts = await required(adapter.readActiveConversationArtifacts)(
			conversationId,
			f.options as never,
		);
	const { grokReferenceDownload: _ack, ...options } = f.options;
	await expect(
		required(adapter.materializeConversationArtifact)(
			conversationId,
			artifacts[0],
			"/unused",
			undefined,
			options as never,
		),
	).rejects.toThrow(/acknowledg/i);
	expect(f.transfer).toMatchObject({
		previewClicks: 0,
		downloadClicks: 0,
		fetchCalls: 0,
		policies: [],
	});
});

test("public conversation context and file listing expose one canonical upload reference without duplicating artifacts", async () => {
	const f = fixture(),
		adapter = createGrokAdapter();
	const files = (await required(adapter.listConversationFiles)(
		conversationId,
		f.options as never,
	)) as Array<{ id: string; metadata?: Record<string, unknown> }>;
	expect(files).toMatchObject([
		{
			id: fileId,
			metadata: {
				grokReferencedFile: {
					conversationId,
					providerResponseId: responseId,
					coverage: { scope: "visible-conversation-references", complete: false },
				},
			},
		},
	]);
	const context = await required(adapter.readConversationContext)(
		conversationId,
		undefined,
		f.options as never,
	);
	expect((context as { files: unknown }).files).toMatchObject([
		{
			id: fileId,
			source: "conversation",
			metadata: { grokReferencedFile: { providerResponseId: responseId } },
		},
	]);
	expect((context as { artifacts?: unknown[] }).artifacts ?? []).toEqual([]);
});

test.each([
	"policy-reset",
	"transport-close",
] as const)("reference %s uncertainty preserves captured bytes and receipt without retry safety", async (kind) => {
	const f = fixture(),
		adapter = createGrokAdapter(),
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "grok414-reference-uncertain-"));
	try {
		const artifact = (
			await required(adapter.readActiveConversationArtifacts)(conversationId, f.options as never)
		)[0];
		if (kind === "policy-reset") f.transfer.failReset = true;
		else f.transfer.failClose = true;
		let failure: unknown;
		try {
			await required(adapter.materializeConversationArtifact)(
				conversationId,
				artifact,
				dir,
				undefined,
				f.options as never,
			);
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(BrowserAutomationError);
		if (!(failure instanceof BrowserAutomationError))
			throw Error("Expected explicit uncertain custody");
		expect(failure.details).toMatchObject({
			effectState: "unknown",
			retrySafe: false,
			retainedFile: {
				size: 107,
				checksumSha256: "5e34ff7e9d8997af149b7a875940dce6117c1f2b73fc23e7ae159ea197d38e78",
			},
		});
		const retained = required(failure.details).retainedFile as FileRef;
		expect((await fs.stat(required(retained.localPath))).size).toBe(107);
		const receipt = JSON.parse(
			await fs.readFile(required(retained.metadata).materializationReceiptPath as string, "utf8"),
		);
		expect(receipt.proof.sha256).toBe(retained.checksumSha256);
		expect(f.transfer.downloadClicks).toBe(1);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

test("public reference file download batch retains the full native receipt for the existing history file lane", async () => {
	const f = fixture(),
		adapter = createGrokAdapter(),
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "grok414-reference-batch-"));
	try {
		const files = (await required(adapter.listConversationFiles)(
			conversationId,
			f.options as never,
		)) as FileRef[];
		const destPath = path.join(dir, "reference-414.txt");
		const result = await required(adapter.downloadConversationFiles)(
			conversationId,
			[{ file: files[0], destPath }],
			f.options as never,
		);
		expect(result).toEqual([{ fileId, status: "materialized" }]);
		expect(files[0]).toMatchObject({
			localPath: destPath,
			checksumSha256: "5e34ff7e9d8997af149b7a875940dce6117c1f2b73fc23e7ae159ea197d38e78",
			metadata: {
				grokReferencedFile: {
					fileMetadataId: fileId,
					providerResponseId: responseId,
					sha256: "5e34ff7e9d8997af149b7a875940dce6117c1f2b73fc23e7ae159ea197d38e78",
					sizeBytes: 107,
				},
			},
		});
		expect((await fs.readFile(destPath)).length).toBe(107);
		expect(f.transfer.downloadClicks).toBe(1);
		expect(f.transfer.fetchCalls).toBe(0);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

test("canonical reference file listing respects the existing bounded message chunk before transfer selection", async () => {
	const f = fixture(),
		adapter = createGrokAdapter();
	const files = await required(adapter.listConversationFiles)(conversationId, {
		...f.options,
		accountMirrorContextChunk: { startMessageIndex: 1, maxMessages: 1 },
	} as never);
	expect(files).toEqual([]);
	expect(f.transfer.downloadClicks).toBe(0);
});
