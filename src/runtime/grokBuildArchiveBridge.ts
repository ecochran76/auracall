import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { GrokBuildMaterialization, GrokBuildResult } from "../browser/grokBuildService.js";
import { createRunArchiveIndexStore, type RunArchiveIndexStore } from "./archiveIndexStore.js";
import type { RunArchiveItem } from "./archiveService.js";

export type GrokBuildArchiveRetention = GrokBuildMaterialization;
export interface GrokBuildArchiveProvenance {
	version: 1;
	providerAccountRef: string;
	targetId: string;
	conversationId: string;
	responseId: string;
	gatewayRowId: string;
	checksumSha256: string;
	sizeBytes: number;
	app: { id: string | null; version: string | null };
}
export function grokBuildArchiveProvenance(
	item: RunArchiveItem,
): GrokBuildArchiveProvenance | null {
	const p = item.metadata?.grokBuildArchive as GrokBuildArchiveProvenance | undefined;
	if (
		item.provider !== "grok" ||
		p?.version !== 1 ||
		typeof p.providerAccountRef !== "string" ||
		!p.providerAccountRef ||
		typeof p.targetId !== "string" ||
		!p.targetId ||
		typeof p.responseId !== "string" ||
		!p.responseId ||
		typeof p.gatewayRowId !== "string" ||
		!p.gatewayRowId.startsWith("gateway:") ||
		p.conversationId !== item.providerConversationId ||
		p.responseId !== item.responseId ||
		!/^([a-f0-9]{64})$/.test(p.checksumSha256) ||
		p.checksumSha256 !== item.checksumSha256 ||
		!Number.isSafeInteger(p.sizeBytes) ||
		p.sizeBytes < 1 ||
		p.sizeBytes > 25 * 1024 * 1024
	)
		return null;
	return p;
}
/** Never replace the retained checksum with a newly calculated hash of changed bytes. */
export async function verifyGrokBuildArchiveItem(item: RunArchiveItem): Promise<boolean> {
	const p = grokBuildArchiveProvenance(item);
	if (!p || !item.localPath) return false;
	try {
		await verifyFile(item.localPath, p.sizeBytes, p.checksumSha256);
		return true;
	} catch {
		return false;
	}
}
async function verifyFile(localPath: string, size: number, sha256: string) {
	const file = await fs.open(localPath, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const before = await file.stat();
		if (
			!before.isFile() ||
			before.size !== size ||
			before.size < 1 ||
			before.size > 25 * 1024 * 1024
		)
			throw new Error("grok_archive_bytes_unqualified");
		const buffer = Buffer.alloc(size + 1);
		let offset = 0;
		while (offset < buffer.length) {
			const read = await file.read(buffer, offset, buffer.length - offset, offset);
			if (read.bytesRead === 0) break;
			offset += read.bytesRead;
		}
		const bytes = buffer.subarray(0, offset);
		const after = await file.stat();
		if (
			after.size !== before.size ||
			after.mtimeMs !== before.mtimeMs ||
			after.ctimeMs !== before.ctimeMs ||
			bytes.length !== size ||
			createHash("sha256").update(bytes).digest("hex") !== sha256
		)
			throw new Error("grok_archive_integrity_mismatch");
	} finally {
		await file.close();
	}
}
/** Internal bridge from the qualified native export result, never a caller-supplied receipt import. */
export async function retainGrokBuildArchive(input: {
	result: GrokBuildResult;
	runtimeProfile: string;
	indexStore?: RunArchiveIndexStore;
	now?: () => Date;
}): Promise<GrokBuildArchiveRetention> {
	const result = input.result,
		coverage = {
			scope: "selected-workspace-archive" as const,
			complete: false as const,
			referencedFiles: "not_qualified" as const,
			appIdentity:
				result.app.id && result.app.version ? ("observed" as const) : ("unobserved" as const),
		};
	const empty = (status: GrokBuildArchiveRetention["status"]): GrokBuildArchiveRetention => ({
		status,
		itemIds: [],
		verifiedBytes: 0,
		coverage,
	});
	if (result.operation !== "export" || result.artifacts.status !== "retrieved")
		return empty("not_materialized");
	if (
		result.effectState !== "completed" ||
		result.cleanupState !== "completed" ||
		result.exportCapture?.reset !== "default_acknowledged" ||
		!result.providerAccountRef ||
		!result.targetId ||
		!result.conversationId ||
		!result.generation.responseId ||
		!result.generation.gatewayRowId?.startsWith("gateway:") ||
		result.generation.status !== "response_completed" ||
		result.generation.uiState !== "completed" ||
		result.artifacts.entries.length !== 1
	)
		return empty("failed");
	const file = result.artifacts.entries[0];
	if (
		file.kind !== "workspace-archive" ||
		file.provenance.source !== "native-download-menu" ||
		file.provenance.targetId !== result.targetId ||
		file.provenance.conversationId !== result.conversationId ||
		file.provenance.responseId !== result.generation.responseId ||
		!path.isAbsolute(file.localPath) ||
		!Number.isSafeInteger(file.sizeBytes) ||
		file.sizeBytes < 1 ||
		file.sizeBytes > 25 * 1024 * 1024 ||
		!/^([a-f0-9]{64})$/.test(file.sha256)
	)
		return empty("failed");
	try {
		await verifyFile(file.localPath, file.sizeBytes, file.sha256);
		const provenance: GrokBuildArchiveProvenance = {
			version: 1,
			providerAccountRef: result.providerAccountRef,
			targetId: result.targetId,
			conversationId: result.conversationId,
			responseId: result.generation.responseId,
			gatewayRowId: result.generation.gatewayRowId,
			checksumSha256: file.sha256,
			sizeBytes: file.sizeBytes,
			app: { ...result.app },
		};
		// Local archive-item identity only; this hash is never a provider app/version/artifact ID.
		const id =
			"grok-build-archive:" +
			createHash("sha256")
				.update(JSON.stringify([input.runtimeProfile, provenance]))
				.digest("hex");
		const store = input.indexStore ?? createRunArchiveIndexStore(),
			existing = await store.readItem(id);
		if (existing && (await verifyGrokBuildArchiveItem(existing)))
			return { status: "indexed", itemIds: [id], verifiedBytes: file.sizeBytes, coverage };
		const timestamp = (input.now?.() ?? new Date()).toISOString();
		const item: RunArchiveItem = {
			id,
			object: "run_archive_item",
			kind: "generated_artifact",
			source: "evidence",
			createdAt: existing?.createdAt ?? timestamp,
			updatedAt: timestamp,
			title: "Grok Build workspace archive",
			status: "materialized",
			provider: "grok",
			runtimeProfile: input.runtimeProfile,
			browserProfile: null,
			projectId: null,
			boundIdentityKey: null,
			agentId: null,
			teamId: null,
			responseId: result.generation.responseId,
			batchId: null,
			batchIndex: null,
			mediaGenerationId: null,
			providerConversationId: result.conversationId,
			providerConversationUrl: null,
			artifactId: null,
			fileName: path.basename(file.localPath),
			mimeType: "application/zip",
			localPath: file.localPath,
			uri: null,
			cacheKey: "sha256:" + file.sha256,
			checksumSha256: file.sha256,
			fileAvailable: true,
			metadata: {
				grokBuildArchive: provenance,
				identifierSource: "local-archive-receipt",
				fileSizeBytes: file.sizeBytes,
				checksumSha256: file.sha256,
				materialization: {
					status: "materialized",
					source: "grok-build-native-export",
					method: "verified-workspace-archive",
				},
				coverage,
			},
			links: { asset: "/v1/archive/items/b64/" + Buffer.from(id).toString("base64url") + "/asset" },
		};
		await store.upsertItems([item], { updatedAt: timestamp });
		return { status: "indexed", itemIds: [id], verifiedBytes: file.sizeBytes, coverage };
	} catch {
		return empty("failed");
	}
}
