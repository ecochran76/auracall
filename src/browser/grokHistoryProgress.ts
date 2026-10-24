import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getAuracallHomeDir } from "../auracallHome.js";
import type { GrokHistoryCoverage } from "./providers/grokHistoryInventory.js";

export type GrokHistoryProgress = Omit<GrokHistoryCoverage, "nextCursor"> & {
	nextCursorAvailable: boolean;
};
function progressPath(runtimeProfileId: string): string {
	return path.join(
		getAuracallHomeDir(),
		"cache",
		"providers",
		"grok",
		"__runtime__",
		`history-progress-${Buffer.from(runtimeProfileId).toString("base64url")}.json`,
	);
}
/** Counts and bounded reason codes only; no chat text, query, IDs or account identity. */
export async function recordGrokHistoryProgress(
	runtimeProfileId: string,
	coverage: GrokHistoryCoverage,
): Promise<void> {
	const { nextCursor, reason, ...rest } = coverage;
	const progress: GrokHistoryProgress = {
		...rest,
		reason: [
			"page-limit",
			"time-limit",
			"item-limit",
			"cursor-anchor-not-found",
			"unattributed-project-rows",
			"unknown-timestamps",
			"loading",
			"explicit-empty",
			"visible-bottom",
			"cancelled",
		].includes(reason)
			? reason
			: "history-failed",
		nextCursorAvailable: nextCursor !== null,
	};
	const destination = progressPath(runtimeProfileId),
		temporary = `${destination}.${randomUUID()}.tmp`;
	await fs.mkdir(path.dirname(destination), { recursive: true });
	try {
		await fs.writeFile(temporary, JSON.stringify(progress), { mode: 0o600 });
		await fs.rename(temporary, destination);
	} finally {
		await fs.rm(temporary, { force: true });
	}
}
export async function readGrokHistoryProgress(
	runtimeProfileId: string,
): Promise<GrokHistoryProgress | undefined> {
	try {
		const value = JSON.parse(await fs.readFile(progressPath(runtimeProfileId), "utf8"));
		if (
			value.source !== "visible-chats" ||
			!["complete", "empty", "incomplete", "failed"].includes(value.state) ||
			typeof value.loadedCount !== "number" ||
			typeof value.pages !== "number"
		)
			throw new Error("Malformed Grok history progress.");
		return value as GrokHistoryProgress;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}
