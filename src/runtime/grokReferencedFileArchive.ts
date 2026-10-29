import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import type { GrokReferencedFileObservation } from "../browser/providers/grokReferencedFile.js";
import type { RunArchiveItem } from "./archiveService.js";

export interface GrokReferencedFileReceipt extends GrokReferencedFileObservation {
	targetId: string;
	providerAccountRef: string;
	providerAccountRefFormat: "legacy-untagged";
	downloadUrlSha256: string;
	sha256: string;
	sizeBytes: number;
	downloadCapture: { setup: string; reset: string };
}
export function grokReferencedFileReceipt(item: RunArchiveItem): GrokReferencedFileReceipt | null {
	const p = item.metadata.grokReferencedFile as GrokReferencedFileReceipt | undefined;
	if (
		item.provider !== "grok" ||
		item.kind !== "upload" ||
		p?.version !== 1 ||
		p.conversationId !== item.providerConversationId ||
		p.fileMetadataId !== item.artifactId ||
		p.fileName !== item.fileName ||
		p.messageDomId !== `response-${p.providerResponseId}` ||
		typeof p.providerResponseId !== "string" ||
		!p.providerResponseId ||
		typeof p.targetId !== "string" ||
		!p.targetId ||
		typeof p.providerAccountRef !== "string" ||
		!p.providerAccountRef ||
		p.providerAccountRefFormat !== "legacy-untagged" ||
		!/^([a-f0-9]{64})$/.test(p.fileUriSha256) ||
		!/^([a-f0-9]{64})$/.test(p.downloadUrlSha256) ||
		!/^([a-f0-9]{64})$/.test(p.sha256) ||
		p.sha256 !== item.checksumSha256 ||
		!Number.isSafeInteger(p.sizeBytes) ||
		p.sizeBytes < 0 ||
		p.sizeBytes > 25 * 1024 * 1024 ||
		p.appId !== null ||
		p.appVersion !== null ||
		p.downloadCapture?.setup !== "acknowledged" ||
		p.downloadCapture?.reset !== "default_acknowledged" ||
		Boolean(item.metadata.grokWorkspaceFile) ||
		Boolean(item.metadata.grokReferenceFailure)
	)
		return null;
	return p;
}
export async function verifyGrokReferencedArchiveItem(item: RunArchiveItem): Promise<boolean> {
	const p = grokReferencedFileReceipt(item);
	if (!p || !item.localPath) return false;
	try {
		const file = await fs.open(item.localPath, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const before = await file.stat();
			if (!before.isFile() || before.size !== p.sizeBytes) return false;
			const buffer = Buffer.alloc(p.sizeBytes + 1),
				{ bytesRead } = await file.read(buffer, 0, buffer.length, 0),
				bytes = buffer.subarray(0, bytesRead),
				after = await file.stat();
			return (
				after.isFile() &&
				before.size === after.size &&
				before.mtimeMs === after.mtimeMs &&
				before.ino === after.ino &&
				before.dev === after.dev &&
				bytes.length === p.sizeBytes &&
				createHash("sha256").update(bytes).digest("hex") === p.sha256
			);
		} finally {
			await file.close();
		}
	} catch {
		return false;
	}
}
