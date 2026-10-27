import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { createConfiguredGrokBuildService } from "../../src/browser/configuredGrokBuild.js";
import { type GrokBuildResult, grokBuildUnknown } from "../../src/browser/grokBuildService.js";
import { readGrokEcosystemProgress } from "../../src/browser/grokEcosystemProgress.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";
import { createRunArchiveIndexStore } from "../../src/runtime/archiveIndexStore.js";

const seam = vi.hoisted(() => ({ export: vi.fn(), options: vi.fn(async () => ({ port: 45040 })) }));
vi.mock("../../src/browser/grokBuildService.js", async (original) => ({
	...(await original<object>()),
	createGrokBuildService: () => ({ export: seam.export }),
}));
vi.mock("../../src/browser/llmService/providers/grokService.js", () => ({
	GrokService: { create: () => ({ buildListOptions: seam.options }) },
}));
let home: string | undefined;
afterEach(async () => {
	setAuracallHomeDirOverrideForTest(null);
	if (home) await fs.rm(home, { recursive: true, force: true });
	vi.clearAllMocks();
});
test("configured public export indexes exact verified bytes and exposes bounded incomplete Ops coverage", async () => {
	home = await fs.mkdtemp(path.join(os.tmpdir(), "grok414-configured-"));
	setAuracallHomeDirOverrideForTest(home);
	const localPath = path.join(home, "workspace.zip"),
		bytes = Buffer.from("native export fixture");
	await fs.writeFile(localPath, bytes);
	const result: GrokBuildResult = {
		...grokBuildUnknown(),
		operation: "export",
		status: "partial",
		code: "grok_build_export_retrieved_app_identity_unobserved",
		effectState: "completed",
		cleanupState: "completed",
		targetId: "target",
		providerAccountRef: "account-ref",
		conversationId: "conversation",
		generation: {
			status: "response_completed",
			responseId: "assistant",
			gatewayRowId: "gateway:current",
			uiState: "completed",
			text: null,
			markdown: null,
		},
		exportCapture: { setup: "acknowledged", reset: "default_acknowledged" },
		artifacts: {
			status: "retrieved",
			code: "grok_build_workspace_archive_retrieved",
			entries: [
				{
					kind: "workspace-archive",
					localPath,
					sizeBytes: bytes.length,
					sha256: createHash("sha256").update(bytes).digest("hex"),
					mediaType: "application/zip",
					provenance: {
						source: "native-download-menu",
						targetId: "target",
						conversationId: "conversation",
						responseId: "assistant",
					},
				},
			],
		},
	};
	seam.export.mockResolvedValue(result);
	const service = await createConfiguredGrokBuildService({ auracallProfile: "default" } as never);
	const r = await service.export({
		targetId: "target",
		conversationId: "conversation",
		responseId: "assistant",
		outputDir: home,
		acknowledgeTargetDefaultReset: true,
	});
	expect(r).toMatchObject({
		status: "partial",
		app: { id: null, version: null },
		materialization: {
			status: "indexed",
			verifiedBytes: bytes.length,
			coverage: { complete: false, referencedFiles: "not_qualified", appIdentity: "unobserved" },
		},
	});
	expect(await createRunArchiveIndexStore().listItems()).toHaveLength(1);
	const progress = await readGrokEcosystemProgress("build", "default");
	expect(progress).toMatchObject({
		status: "partial",
		complete: false,
		count: 1,
		ready: 1,
		materialization: {
			status: "indexed",
			indexedAssets: 1,
			verifiedBytes: bytes.length,
			complete: false,
			referencedFiles: "not_qualified",
			appIdentity: "unobserved",
		},
	});
	const ops = await createBrowserTabConcurrencyRuntime({} as never).readStatus();
	expect(ops.providerControls?.grok.build?.materialization).toMatchObject({
		indexedAssets: 1,
		verifiedBytes: bytes.length,
		complete: false,
		referencedFiles: "not_qualified",
	});
	expect(JSON.stringify(ops.providerControls)).not.toContain(localPath);
	expect(JSON.stringify(progress)).not.toContain(localPath);
	expect(JSON.stringify(progress)).not.toContain("account-ref");
	expect(seam.options).toHaveBeenCalledWith(
		expect.objectContaining({
			tabTargetId: "target",
			requireExistingTarget: true,
			allowNavigation: false,
		}),
		{ ensurePort: false },
	);
});
