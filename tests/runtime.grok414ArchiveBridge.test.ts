import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { type GrokBuildResult, grokBuildUnknown } from "../src/browser/grokBuildService.js";
import { createRunArchiveIndexStore } from "../src/runtime/archiveIndexStore.js";
import { retainGrokBuildArchive } from "../src/runtime/grokBuildArchiveBridge.js";

const roots: string[] = [];
afterEach(async () => {
	setAuracallHomeDirOverrideForTest(null);
	for (const r of roots.splice(0)) await fs.rm(r, { recursive: true, force: true });
});
async function fixture() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok414-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const file = path.join(root, "workspace.zip"),
		bytes = Buffer.from("retained native archive test bytes");
	await fs.writeFile(file, bytes, { mode: 0o600 });
	const result: GrokBuildResult = {
		...grokBuildUnknown(),
		operation: "export",
		status: "partial",
		code: "grok_build_export_retrieved_app_identity_unobserved",
		targetId: "native-target",
		providerAccountRef: "observed-account-ref",
		conversationId: "native-conversation",
		generation: {
			status: "response_completed",
			responseId: "native-assistant",
			gatewayRowId: "gateway:observed",
			uiState: "completed",
			text: null,
			markdown: null,
		},
		effectState: "completed",
		cleanupState: "completed",
		retrySafe: false,
		exportCapture: { setup: "acknowledged", reset: "default_acknowledged" },
		artifacts: {
			status: "retrieved",
			code: "grok_build_workspace_archive_retrieved",
			entries: [
				{
					kind: "workspace-archive",
					localPath: file,
					sizeBytes: bytes.length,
					sha256: createHash("sha256").update(bytes).digest("hex"),
					mediaType: "application/zip",
					provenance: {
						targetId: "native-target",
						conversationId: "native-conversation",
						responseId: "native-assistant",
						source: "native-download-menu",
					},
				},
			],
		},
	};
	return { root, file, result };
}
test("verified native Build export becomes an attributable existing public archive item without inventing app identity", async () => {
	const f = await fixture();
	const retained = await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" });
	expect(retained.status).toBe("indexed");
	expect(retained.itemIds).toHaveLength(1);
	const item = await createRunArchiveIndexStore().readItem(retained.itemIds[0]);
	expect(item).toMatchObject({
		provider: "grok",
		providerConversationId: "native-conversation",
		responseId: "native-assistant",
		checksumSha256: f.result.artifacts.entries[0].sha256,
		fileAvailable: true,
		metadata: {
			grokBuildArchive: {
				providerAccountRef: "observed-account-ref",
				targetId: "native-target",
				gatewayRowId: "gateway:observed",
				app: { id: null, version: null },
			},
		},
	});
});

import { vi } from "vitest";
import { createArchiveMaterializationService } from "../src/runtime/archiveMaterializationService.js";
import { createRunArchiveService } from "../src/runtime/archiveService.js";

test("existing public archive materialization reuses only verified retained bytes without provider traffic", async () => {
	const f = await fixture(),
		retained = await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" }),
		provider = vi.fn();
	const service = createArchiveMaterializationService({
		config: {},
		materializeConversationArtifact: provider,
	});
	const reused = await service.materializeItem({ archiveItemId: retained.itemIds[0] });
	expect(reused.status).toBe("already_materialized");
	expect(provider).not.toHaveBeenCalled();
	await fs.writeFile(f.file, "changed native bytes");
	const damaged = await service.materializeItem({
		archiveItemId: retained.itemIds[0],
		force: true,
	});
	expect(damaged).toMatchObject({
		status: "skipped",
		file: null,
		item: { fileAvailable: false, checksumSha256: f.result.artifacts.entries[0].sha256 },
	});
	expect(provider).not.toHaveBeenCalled();
});
test("public archive refresh never blesses changed Grok bytes or serves them as a verified asset", async () => {
	const f = await fixture(),
		retained = await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" });
	await fs.writeFile(f.file, "changed native bytes");
	const service = createRunArchiveService();
	expect((await service.readItem(retained.itemIds[0]))?.item).toMatchObject({
		fileAvailable: false,
		checksumSha256: f.result.artifacts.entries[0].sha256,
	});
	expect(await service.readAsset(retained.itemIds[0])).toBeNull();
});
test.each([
	"account",
	"response",
	"target",
	"checksum",
	"cleanup",
] as const)("unqualified native receipt is not indexed (%s)", async (kind) => {
	const f = await fixture();
	if (kind === "account") f.result.providerAccountRef = null;
	if (kind === "response") f.result.artifacts.entries[0].provenance.responseId = "foreign";
	if (kind === "target") f.result.artifacts.entries[0].provenance.targetId = "foreign";
	if (kind === "checksum") f.result.artifacts.entries[0].sha256 = "a".repeat(64);
	if (kind === "cleanup") f.result.cleanupState = "unknown";
	expect(
		await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" }),
	).toMatchObject({ status: "failed", itemIds: [], verifiedBytes: 0 });
	expect(await createRunArchiveIndexStore().listItems()).toHaveLength(0);
});
test("metadata-only export remains unmaterialized and never claims complete file coverage", async () => {
	const f = await fixture();
	f.result.artifacts = {
		status: "unavailable",
		code: "grok_build_archive_not_qualified",
		entries: [],
	};
	expect(
		await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" }),
	).toMatchObject({
		status: "not_materialized",
		coverage: { complete: false, referencedFiles: "not_qualified", appIdentity: "unobserved" },
	});
});

test("a metadata-only Grok artifact cannot borrow a workspace ZIP by matching filename/conversation", async () => {
	const f = await fixture(),
		retained = await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" }),
		store = createRunArchiveIndexStore(),
		native = await store.readItem(retained.itemIds[0]);
	if (!native) throw new Error("native item missing");
	const foreign = {
		...native,
		id: "metadata-only-grok-artifact",
		artifactId: "other-native-file",
		fileAvailable: false,
		localPath: null,
		checksumSha256: null,
		cacheKey: null,
		metadata: {},
		links: {},
	};
	await store.upsertItems([foreign]);
	const provider = vi.fn(async () => null);
	const result = await createArchiveMaterializationService({
		config: {},
		materializeConversationArtifact: provider,
	}).materializeItem({ archiveItemId: foreign.id });
	expect(result.status).toBe("skipped");
	expect(result.file).toBeNull();
	expect(provider).toHaveBeenCalledOnce();
});

import { createArchiveMaterializationJobService } from "../src/runtime/archiveMaterializationJobService.js";

test("existing durable archive jobs retain queued work across service restart and reuse verified bytes", async () => {
	const f = await fixture(),
		retained = await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" }),
		provider = vi.fn(),
		materialization = createArchiveMaterializationService({
			config: {},
			materializeConversationArtifact: provider,
		}),
		gate = vi.fn(async (work: () => Promise<unknown>) => work());
	const first = createArchiveMaterializationJobService({
		materializationService: materialization,
		schedule: () => {},
		withForegroundWork: gate as never,
	});
	const created = await first.createJob({ archiveItemId: retained.itemIds[0] });
	const restarted = createArchiveMaterializationJobService({
		materializationService: materialization,
		schedule: () => {},
		withForegroundWork: gate as never,
	});
	expect(await restarted.createJob({ archiveItemId: retained.itemIds[0] })).toMatchObject({
		reused: true,
		job: { id: created.job.id, status: "queued" },
	});
	expect(await restarted.runJob(created.job.id)).toMatchObject({
		status: "succeeded",
		attemptCount: 1,
		result: { status: "already_materialized" },
	});
	expect(gate).toHaveBeenCalledOnce();
	expect(provider).not.toHaveBeenCalled();
});

test("repeat retention reuses the exact local receipt and keeps different native account snapshots separate", async () => {
	const f = await fixture();
	const first = await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" });
	expect(await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" })).toEqual(
		first,
	);
	f.result.providerAccountRef = "different-observed-account";
	const second = await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" });
	expect(second.itemIds).not.toEqual(first.itemIds);
	expect(await createRunArchiveIndexStore().listItems()).toHaveLength(2);
});
test("missing or symlinked retained bytes never become newly indexed proof", async () => {
	const f = await fixture();
	await fs.rm(f.file);
	expect(
		await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" }),
	).toMatchObject({ status: "failed" });
	const actual = path.join(f.root, "actual.zip");
	await fs.writeFile(actual, "retained native archive test bytes");
	await fs.symlink(actual, f.file);
	expect(
		await retainGrokBuildArchive({ result: f.result, runtimeProfile: "default" }),
	).toMatchObject({ status: "failed" });
	expect(await createRunArchiveIndexStore().listItems()).toHaveLength(0);
});
