import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAuracallHomeDir } from "../auracallHome.js";
import type { GrokHistoryCoverage } from "./providers/grokHistoryInventory.js";
export type GrokHistoryProgress = Omit<GrokHistoryCoverage, "nextCursor"> & {
	nextCursorAvailable: boolean;
};
const reasons = new Set([
	"page-limit",
	"foreground-yield",
	"incremental-frontier",
	"time-limit",
	"item-limit",
	"cursor-anchor-not-found",
	"cursor-restart-required",
	"cursor-rebuilding",
	"foreground-yield",
	"incremental-frontier",
	"unattributed-project-rows",
	"unknown-timestamps",
	"loading",
	"explicit-empty",
	"visible-bottom",
	"cancelled",
	"history-failed",
	"history-read-failed",
	"history-invalid-request",
	"history-account-unconfirmed",
	"history-cleanup-unconfirmed",
]);
function progressPath(profile: string) {
	return path.join(
		getAuracallHomeDir(),
		"cache",
		"providers",
		"grok",
		"__runtime__",
		`history-progress-${createHash("sha256").update(profile).digest("hex")}.json`,
	);
}
function sanitize(value: GrokHistoryCoverage | GrokHistoryProgress): GrokHistoryProgress {
	return {
		state: ["complete", "empty", "incomplete", "failed"].includes(value.state)
			? value.state
			: "failed",
		source: "visible-chats",
		scope: value.scope === "project" ? "project" : "root",
		reason: reasons.has(value.reason) ? value.reason : "history-failed",
		loadedCount:
			Number.isSafeInteger(value.loadedCount) && value.loadedCount >= 0 ? value.loadedCount : 0,
		pages: Number.isSafeInteger(value.pages) && value.pages >= 0 ? value.pages : 0,
		nextCursorAvailable:
			"nextCursor" in value
				? typeof value.nextCursor === "string" && value.nextCursor.length > 0
				: value.nextCursorAvailable === true,
		observedAt:
			typeof value.observedAt === "string" && Number.isFinite(Date.parse(value.observedAt))
				? new Date(value.observedAt).toISOString()
				: new Date().toISOString(),
	};
}
/** Whitelisted counts/reason codes; never query, cursor, chat IDs or titles. */
export async function recordGrokHistoryProgress(
	profile: string,
	coverage: GrokHistoryCoverage,
): Promise<void> {
	const destination = progressPath(profile),
		temporary = `${destination}.${randomUUID()}.tmp`;
	await fs.mkdir(path.dirname(destination), { recursive: true });
	try {
		await fs.writeFile(temporary, JSON.stringify(sanitize(coverage)), { mode: 0o600 });
		await fs.rename(temporary, destination);
	} finally {
		await fs.rm(temporary, { force: true });
	}
}
export async function readGrokHistoryProgress(
	profile: string,
): Promise<GrokHistoryProgress | undefined> {
	try {
		return sanitize(JSON.parse(await fs.readFile(progressPath(profile), "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}
