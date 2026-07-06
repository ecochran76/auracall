import type { AccountMirrorProvider } from "./politePolicy.js";
import type { AccountMirrorCompleteness, AccountMirrorMetadataEvidence } from "./statusRegistry.js";

export type AccountMirrorBackfillPhase =
	| "identity"
	| "projects"
	| "root-conversations"
	| "project-conversations"
	| "detail-inventory"
	| "account-library"
	| "materialization"
	| "complete";

export type AccountMirrorBackfillCursorStatus = "pending" | "complete" | "skipped" | "unknown";

export interface AccountMirrorBackfillCursor {
	status: AccountMirrorBackfillCursorStatus;
	reason: string;
	updatedAt: string | null;
	nextIndex: number | null;
	readLimit: number | null;
	scanned: number | null;
	yielded: boolean;
}

export interface AccountMirrorBackfillDetailCursor extends AccountMirrorBackfillCursor {
	conversationDetail: {
		conversationId: string;
		nextMessageIndex: number;
		messageLimit: number;
		totalMessages: number | null;
	} | null;
}

export interface AccountMirrorBackfillLedger {
	object: "account_mirror_backfill_ledger";
	version: 1;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	boundIdentityKey: string | null;
	updatedAt: string;
	state: "not_started" | "in_progress" | "complete";
	lastCompletedPhase: AccountMirrorBackfillPhase | null;
	nextEligiblePhase: AccountMirrorBackfillPhase;
	cursors: {
		projects: AccountMirrorBackfillCursor;
		rootRail: AccountMirrorBackfillCursor;
		projectConversations: AccountMirrorBackfillCursor;
		newestFirstDetail: AccountMirrorBackfillDetailCursor;
		accountLibrary: AccountMirrorBackfillCursor;
		materialization: AccountMirrorBackfillCursor;
	};
}

export function deriveAccountMirrorBackfillLedger(input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	boundIdentityKey: string | null;
	updatedAt: string;
	previous?: AccountMirrorBackfillLedger | null;
	evidence: AccountMirrorMetadataEvidence | null;
	mirrorCompleteness: AccountMirrorCompleteness | null;
}): AccountMirrorBackfillLedger {
	const evidence = input.evidence;
	const previous = normalizeAccountMirrorBackfillLedger(input.previous);
	const projects = deriveProjectsCursor(evidence, input.updatedAt);
	const rootRail = deriveRootRailCursor(evidence, input.updatedAt);
	const projectConversations = deriveProjectConversationsCursor(evidence, input.updatedAt);
	const newestFirstDetail = deriveNewestFirstDetailCursor({
		evidence,
		mirrorCompleteness: input.mirrorCompleteness,
		updatedAt: input.updatedAt,
	});
	const accountLibrary =
		previous?.cursors.accountLibrary ?? skippedCursor("No account-library cursor recorded yet.");
	const materialization =
		previous?.cursors.materialization ?? skippedCursor("No materialization cursor recorded yet.");
	const cursors = {
		projects,
		rootRail,
		projectConversations,
		newestFirstDetail,
		accountLibrary,
		materialization,
	};
	const nextEligiblePhase = chooseNextEligiblePhase(cursors, evidence);
	const lastCompletedPhase = chooseLastCompletedPhase(cursors);
	return {
		object: "account_mirror_backfill_ledger",
		version: 1,
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId,
		browserProfileId: input.browserProfileId,
		boundIdentityKey: input.boundIdentityKey,
		updatedAt: input.updatedAt,
		state: evidence
			? nextEligiblePhase === "complete"
				? "complete"
				: "in_progress"
			: "not_started",
		lastCompletedPhase,
		nextEligiblePhase,
		cursors,
	};
}

export function normalizeAccountMirrorBackfillLedger(
	value: unknown,
): AccountMirrorBackfillLedger | null {
	if (!isRecord(value) || value.object !== "account_mirror_backfill_ledger") return null;
	const provider = readProvider(value.provider);
	const runtimeProfileId = readString(value.runtimeProfileId);
	const updatedAt = readIsoString(value.updatedAt);
	if (!provider || !runtimeProfileId || !updatedAt) return null;
	const cursors = isRecord(value.cursors) ? value.cursors : {};
	const ledger: AccountMirrorBackfillLedger = {
		object: "account_mirror_backfill_ledger",
		version: 1,
		provider,
		runtimeProfileId,
		browserProfileId: readNullableString(value.browserProfileId),
		boundIdentityKey: readNullableString(value.boundIdentityKey),
		updatedAt,
		state:
			value.state === "complete"
				? "complete"
				: value.state === "in_progress"
					? "in_progress"
					: "not_started",
		lastCompletedPhase: readPhase(value.lastCompletedPhase),
		nextEligiblePhase: readPhase(value.nextEligiblePhase) ?? "identity",
		cursors: {
			projects: normalizeCursor(cursors.projects),
			rootRail: normalizeCursor(cursors.rootRail),
			projectConversations: normalizeCursor(cursors.projectConversations),
			newestFirstDetail: normalizeDetailCursor(cursors.newestFirstDetail),
			accountLibrary: normalizeCursor(cursors.accountLibrary),
			materialization: normalizeCursor(cursors.materialization),
		},
	};
	return ledger;
}

function deriveProjectsCursor(
	evidence: AccountMirrorMetadataEvidence | null,
	updatedAt: string,
): AccountMirrorBackfillCursor {
	if (!evidence) return unknownCursor("No project evidence has been collected.");
	const complete = evidence.truncated.projects !== true;
	return {
		status: complete ? "complete" : "pending",
		reason: complete
			? "Project index was not truncated in the latest refresh."
			: "Project index was truncated and needs another backfill pass.",
		updatedAt,
		nextIndex: complete ? null : evidence.projectSampleIds.length,
		readLimit: null,
		scanned: evidence.projectSampleIds.length,
		yielded: false,
	};
}

function deriveRootRailCursor(
	evidence: AccountMirrorMetadataEvidence | null,
	updatedAt: string,
): AccountMirrorBackfillCursor {
	if (!evidence) return unknownCursor("No root conversation evidence has been collected.");
	const complete = evidence.truncated.conversations !== true;
	return {
		status: complete ? "complete" : "pending",
		reason: complete
			? "Root conversation rail was not truncated in the latest refresh."
			: "Root conversation rail was truncated and needs another backfill pass.",
		updatedAt,
		nextIndex: complete ? null : evidence.conversationSampleIds.length,
		readLimit: null,
		scanned: evidence.conversationSampleIds.length,
		yielded: false,
	};
}

function deriveProjectConversationsCursor(
	evidence: AccountMirrorMetadataEvidence | null,
	updatedAt: string,
): AccountMirrorBackfillCursor {
	const cursor = evidence?.projectConversations ?? null;
	if (!evidence) return unknownCursor("No project conversation evidence has been collected.");
	if (!cursor) return skippedCursor("No project conversation cursor was emitted.");
	const pending = cursor.yielded === true;
	return {
		status: pending ? "pending" : "complete",
		reason: pending
			? "Project conversation pass yielded before finishing."
			: "Project conversation cursor completed in the latest refresh.",
		updatedAt,
		nextIndex: cursor.nextProjectIndex,
		readLimit: cursor.readLimit,
		scanned: cursor.scannedProjects,
		yielded: cursor.yielded === true,
	};
}

function deriveNewestFirstDetailCursor(input: {
	evidence: AccountMirrorMetadataEvidence | null;
	mirrorCompleteness: AccountMirrorCompleteness | null;
	updatedAt: string;
}): AccountMirrorBackfillDetailCursor {
	const cursor = input.evidence?.attachmentInventory ?? null;
	if (!input.evidence) {
		return {
			...unknownCursor("No detail inventory evidence has been collected."),
			conversationDetail: null,
		};
	}
	const remaining = input.mirrorCompleteness?.remainingDetailSurfaces?.total ?? 0;
	const pending =
		cursor?.yielded === true ||
		Boolean(cursor?.conversationDetail) ||
		input.evidence.truncated.artifacts === true ||
		remaining > 0;
	return {
		status: pending ? "pending" : "complete",
		reason: pending
			? "Detail inventory cursor or remaining detail surfaces are still pending."
			: "Detail inventory is complete for the current evidence window.",
		updatedAt: input.updatedAt,
		nextIndex: cursor?.nextConversationIndex ?? null,
		readLimit: cursor?.detailReadLimit ?? null,
		scanned: cursor?.scannedConversations ?? null,
		yielded: cursor?.yielded === true,
		conversationDetail: cursor?.conversationDetail
			? {
					conversationId: cursor.conversationDetail.conversationId,
					nextMessageIndex: cursor.conversationDetail.nextMessageIndex,
					messageLimit: cursor.conversationDetail.messageLimit,
					totalMessages: cursor.conversationDetail.totalMessages ?? null,
				}
			: null,
	};
}

function chooseNextEligiblePhase(
	cursors: AccountMirrorBackfillLedger["cursors"],
	evidence: AccountMirrorMetadataEvidence | null,
): AccountMirrorBackfillPhase {
	if (!evidence) return "identity";
	if (cursors.projects.status === "pending") return "projects";
	if (cursors.rootRail.status === "pending") return "root-conversations";
	if (cursors.projectConversations.status === "pending") return "project-conversations";
	if (cursors.newestFirstDetail.status === "pending") return "detail-inventory";
	if (cursors.accountLibrary.status === "pending") return "account-library";
	if (cursors.materialization.status === "pending") return "materialization";
	return "complete";
}

function chooseLastCompletedPhase(
	cursors: AccountMirrorBackfillLedger["cursors"],
): AccountMirrorBackfillPhase | null {
	const ordered: Array<[AccountMirrorBackfillPhase, AccountMirrorBackfillCursor]> = [
		["projects", cursors.projects],
		["root-conversations", cursors.rootRail],
		["project-conversations", cursors.projectConversations],
		["detail-inventory", cursors.newestFirstDetail],
		["account-library", cursors.accountLibrary],
		["materialization", cursors.materialization],
	];
	let last: AccountMirrorBackfillPhase | null = null;
	for (const [phase, cursor] of ordered) {
		if (cursor.status === "pending" || cursor.status === "unknown") break;
		if (cursor.status === "complete") last = phase;
	}
	return last;
}

function normalizeCursor(value: unknown): AccountMirrorBackfillCursor {
	if (!isRecord(value)) return unknownCursor("Cursor evidence is unavailable.");
	return {
		status: readCursorStatus(value.status),
		reason: readString(value.reason) ?? "Cursor evidence is unavailable.",
		updatedAt: readIsoString(value.updatedAt),
		nextIndex: readNonNegativeInteger(value.nextIndex),
		readLimit: readNonNegativeInteger(value.readLimit),
		scanned: readNonNegativeInteger(value.scanned),
		yielded: value.yielded === true,
	};
}

function normalizeDetailCursor(value: unknown): AccountMirrorBackfillDetailCursor {
	const cursor = normalizeCursor(value);
	const detail =
		isRecord(value) && isRecord(value.conversationDetail) ? value.conversationDetail : null;
	return {
		...cursor,
		conversationDetail: detail
			? {
					conversationId: readString(detail.conversationId) ?? "",
					nextMessageIndex: readNonNegativeInteger(detail.nextMessageIndex) ?? 0,
					messageLimit: readNonNegativeInteger(detail.messageLimit) ?? 0,
					totalMessages: readNonNegativeInteger(detail.totalMessages),
				}
			: null,
	};
}

function unknownCursor(reason: string): AccountMirrorBackfillCursor {
	return {
		status: "unknown",
		reason,
		updatedAt: null,
		nextIndex: null,
		readLimit: null,
		scanned: null,
		yielded: false,
	};
}

function skippedCursor(reason: string): AccountMirrorBackfillCursor {
	return {
		status: "skipped",
		reason,
		updatedAt: null,
		nextIndex: null,
		readLimit: null,
		scanned: null,
		yielded: false,
	};
}

function readCursorStatus(value: unknown): AccountMirrorBackfillCursorStatus {
	return value === "pending" || value === "complete" || value === "skipped" ? value : "unknown";
}

function readPhase(value: unknown): AccountMirrorBackfillPhase | null {
	return value === "identity" ||
		value === "projects" ||
		value === "root-conversations" ||
		value === "project-conversations" ||
		value === "detail-inventory" ||
		value === "account-library" ||
		value === "materialization" ||
		value === "complete"
		? value
		: null;
}

function readProvider(value: unknown): AccountMirrorProvider | null {
	return value === "chatgpt" || value === "gemini" || value === "grok" ? value : null;
}

function readNullableString(value: unknown): string | null {
	return readString(value);
}

function readString(value: unknown): string | null {
	const trimmed = typeof value === "string" ? value.trim() : "";
	return trimmed.length > 0 ? trimmed : null;
}

function readIsoString(value: unknown): string | null {
	const raw = readString(value);
	if (!raw) return null;
	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function readNonNegativeInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.floor(value)
		: null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
