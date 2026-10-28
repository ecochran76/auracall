import { constants } from "node:fs";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { RunArchiveItem } from "./archiveService.js";

export interface GrokWorkspaceFileReceipt {
	version: 1;
	conversationId: string;
	fsKey: string;
	filePath: string;
	dataUrlSha256: string;
	targetId: string;
	providerAccountRef: string;
	sha256: string;
	sizeBytes: number;
	contentRevision: string | number | null;
	appId: null;
	appVersion: null;
}
export function grokWorkspaceFileReceipt(item: RunArchiveItem): GrokWorkspaceFileReceipt | null {
	const p = item.metadata.grokWorkspaceFile as GrokWorkspaceFileReceipt | undefined;
	if (
		item.provider !== "grok" ||
		p?.version !== 1 ||
		p.conversationId !== item.providerConversationId ||
		p.fsKey !== `conversation:${p.conversationId}` ||
		typeof p.filePath !== "string" ||
		p.filePath !== item.artifactId ||
		path.posix.basename(p.filePath) !== item.fileName ||
		typeof p.targetId !== "string" ||
		!p.targetId ||
		typeof p.providerAccountRef !== "string" ||
		!p.providerAccountRef ||
		!/^([a-f0-9]{64})$/.test(p.dataUrlSha256) ||
		!/^([a-f0-9]{64})$/.test(p.sha256) ||
		p.sha256 !== item.checksumSha256 ||
		!Number.isSafeInteger(p.sizeBytes) ||
		p.sizeBytes < 0 ||
		p.sizeBytes > 25 * 1024 * 1024
	)
		return null;
	return p;
}
export async function verifyGrokWorkspaceArchiveItem(item: RunArchiveItem): Promise<boolean> {
	const p = grokWorkspaceFileReceipt(item);
	if (!p || !item.localPath) return false;
	try {
		const file = await fs.open(item.localPath, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const before = await file.stat();
			if (!before.isFile() || before.size !== p.sizeBytes) return false;
			const buffer = Buffer.alloc(p.sizeBytes + 1);
			const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
			const bytes = buffer.subarray(0, bytesRead);
			const after = await file.stat();
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
