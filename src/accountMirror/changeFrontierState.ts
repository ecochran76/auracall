import { createHash } from "node:crypto";
import type { Conversation, ProviderId } from "../browser/providers/domain.js";

export type AccountMirrorFrontierAction = "skip" | "visit_once" | "materialize_retained" | "defer";
export type AccountMirrorFrontierOutcome = "pending" | "complete" | "deferred" | "terminal";
export type AccountMirrorAssetAvailability = "available" | "unavailable" | "unknown";

export interface AccountMirrorPhysicalActivityCounters {
	targetsCreated: number;
	navigations: number;
	reloads: number;
	snapshotRefreshes: number;
	artifactResolutions: number;
	downloads: number;
	duplicates: number;
}

export interface AccountMirrorProviderIndexEpoch {
	object: "account_mirror_provider_index_epoch";
	version: 1;
	epochId: string;
	provider: ProviderId;
	runtimeProfileId: string;
	browserProfileId: string | null;
	identityScopeHash: string;
	observedAt: string;
	indexFingerprint: string;
	coverage: {
		conversations: number;
		projects: number;
	};
}

export interface AccountMirrorConversationWorkState {
	object: "account_mirror_conversation_work_state";
	version: 1;
	conversationKey: string;
	epochId: string;
	indexFingerprint: string;
	detailFingerprint: string | null;
	action: AccountMirrorFrontierAction | null;
	outcome: AccountMirrorFrontierOutcome;
	assetAvailability: AccountMirrorAssetAvailability;
	retryNotBefore: string | null;
	checkpointedAt: string | null;
	physicalActivity: AccountMirrorPhysicalActivityCounters;
	lifetimePhysicalActivity: AccountMirrorPhysicalActivityCounters;
}

export function createAccountMirrorProviderIndexEpoch(input: {
	provider: ProviderId;
	runtimeProfileId: string;
	browserProfileId: string | null;
	boundIdentityKey: string;
	observedAt: string;
	projectCount: number;
	conversations: readonly Conversation[];
}): AccountMirrorProviderIndexEpoch {
	const indexFingerprint = fingerprint(
		input.conversations.map((conversation, index) => ({
			index,
			id: conversation.id,
			title: conversation.title,
			projectId: conversation.projectId ?? null,
			updatedAt: conversation.updatedAt ?? null,
			fingerprint: readMetadataString(conversation.metadata, "conversationFingerprint"),
		})),
	);
	const identityScopeHash = fingerprint(normalizeIdentityKey(input.boundIdentityKey));
	const epochId = fingerprint({
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId,
		browserProfileId: input.browserProfileId,
		identityScopeHash,
		observedAt: normalizeIsoString(input.observedAt),
		indexFingerprint,
	});
	return {
		object: "account_mirror_provider_index_epoch",
		version: 1,
		epochId,
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId.trim() || "default",
		browserProfileId: normalizeOptionalString(input.browserProfileId),
		identityScopeHash,
		observedAt: normalizeIsoString(input.observedAt),
		indexFingerprint,
		coverage: {
			conversations: input.conversations.length,
			projects: nonNegativeInteger(input.projectCount),
		},
	};
}

export function rollAccountMirrorConversationWorkState(input: {
	conversation: Conversation;
	epoch: AccountMirrorProviderIndexEpoch;
	previous?: unknown;
}): AccountMirrorConversationWorkState {
	const previous = normalizeAccountMirrorConversationWorkState(input.previous);
	const sameEpoch = previous?.epochId === input.epoch.epochId;
	const physicalActivity = sameEpoch ? previous.physicalActivity : emptyPhysicalActivityCounters();
	const lifetimePhysicalActivity = sameEpoch
		? previous.lifetimePhysicalActivity
		: addPhysicalActivityCounters(
				previous?.lifetimePhysicalActivity ?? emptyPhysicalActivityCounters(),
				previous?.physicalActivity ?? emptyPhysicalActivityCounters(),
			);
	return {
		object: "account_mirror_conversation_work_state",
		version: 1,
		conversationKey: fingerprint(input.conversation.id.trim()),
		epochId: input.epoch.epochId,
		indexFingerprint:
			readMetadataString(input.conversation.metadata, "conversationFingerprint") ??
			fingerprint(input.conversation),
		detailFingerprint: previous?.detailFingerprint ?? null,
		action: sameEpoch ? previous.action : null,
		outcome: sameEpoch ? previous.outcome : "pending",
		assetAvailability: previous?.assetAvailability ?? "unknown",
		retryNotBefore: previous?.retryNotBefore ?? null,
		checkpointedAt: sameEpoch ? previous.checkpointedAt : null,
		physicalActivity,
		lifetimePhysicalActivity,
	};
}

export function normalizeAccountMirrorProviderIndexEpoch(
	value: unknown,
): AccountMirrorProviderIndexEpoch | null {
	if (!isRecord(value)) return null;
	if (value.object !== "account_mirror_provider_index_epoch" || value.version !== 1) return null;
	const provider = normalizeProvider(value.provider);
	const epochId = normalizeRequiredString(value.epochId);
	const runtimeProfileId = normalizeRequiredString(value.runtimeProfileId);
	const identityScopeHash = normalizeRequiredString(value.identityScopeHash);
	const observedAt = normalizeOptionalIsoString(value.observedAt);
	const indexFingerprint = normalizeRequiredString(value.indexFingerprint);
	if (
		!provider ||
		!epochId ||
		!runtimeProfileId ||
		!identityScopeHash ||
		!observedAt ||
		!indexFingerprint
	) {
		return null;
	}
	const coverage = isRecord(value.coverage) ? value.coverage : {};
	return {
		object: "account_mirror_provider_index_epoch",
		version: 1,
		epochId,
		provider,
		runtimeProfileId,
		browserProfileId: normalizeOptionalString(value.browserProfileId),
		identityScopeHash,
		observedAt,
		indexFingerprint,
		coverage: {
			conversations: nonNegativeInteger(coverage.conversations),
			projects: nonNegativeInteger(coverage.projects),
		},
	};
}

export function normalizeAccountMirrorConversationWorkState(
	value: unknown,
): AccountMirrorConversationWorkState | null {
	if (!isRecord(value)) return null;
	if (value.object !== "account_mirror_conversation_work_state" || value.version !== 1) return null;
	const conversationKey = normalizeRequiredString(value.conversationKey);
	const epochId = normalizeRequiredString(value.epochId);
	const indexFingerprint = normalizeRequiredString(value.indexFingerprint);
	if (!conversationKey || !epochId || !indexFingerprint) return null;
	return {
		object: "account_mirror_conversation_work_state",
		version: 1,
		conversationKey,
		epochId,
		indexFingerprint,
		detailFingerprint: normalizeOptionalString(value.detailFingerprint),
		action: normalizeAction(value.action),
		outcome: normalizeOutcome(value.outcome),
		assetAvailability: normalizeAvailability(value.assetAvailability),
		retryNotBefore: normalizeOptionalIsoString(value.retryNotBefore),
		checkpointedAt: normalizeOptionalIsoString(value.checkpointedAt),
		physicalActivity: normalizePhysicalActivityCounters(value.physicalActivity),
		lifetimePhysicalActivity: normalizePhysicalActivityCounters(value.lifetimePhysicalActivity),
	};
}

export function emptyPhysicalActivityCounters(): AccountMirrorPhysicalActivityCounters {
	return {
		targetsCreated: 0,
		navigations: 0,
		reloads: 0,
		snapshotRefreshes: 0,
		artifactResolutions: 0,
		downloads: 0,
		duplicates: 0,
	};
}

export function fingerprintAccountMirrorConversationIndexRow(conversation: Conversation): string {
	const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
	return fingerprint({
		id: conversation.id,
		title: conversation.title,
		provider: conversation.provider,
		projectId: conversation.projectId ?? null,
		url: conversation.url ?? null,
		updatedAt: conversation.updatedAt ?? null,
		latestTurnId:
			readMetadataString(metadata, "latestTurnId") ?? readMetadataString(metadata, "lastMessageId"),
	});
}

function normalizePhysicalActivityCounters(value: unknown): AccountMirrorPhysicalActivityCounters {
	const record = isRecord(value) ? value : {};
	return {
		targetsCreated: nonNegativeInteger(record.targetsCreated),
		navigations: nonNegativeInteger(record.navigations),
		reloads: nonNegativeInteger(record.reloads),
		snapshotRefreshes: nonNegativeInteger(record.snapshotRefreshes),
		artifactResolutions: nonNegativeInteger(record.artifactResolutions),
		downloads: nonNegativeInteger(record.downloads),
		duplicates: nonNegativeInteger(record.duplicates),
	};
}

function addPhysicalActivityCounters(
	left: AccountMirrorPhysicalActivityCounters,
	right: AccountMirrorPhysicalActivityCounters,
): AccountMirrorPhysicalActivityCounters {
	return {
		targetsCreated: left.targetsCreated + right.targetsCreated,
		navigations: left.navigations + right.navigations,
		reloads: left.reloads + right.reloads,
		snapshotRefreshes: left.snapshotRefreshes + right.snapshotRefreshes,
		artifactResolutions: left.artifactResolutions + right.artifactResolutions,
		downloads: left.downloads + right.downloads,
		duplicates: left.duplicates + right.duplicates,
	};
}

function fingerprint(value: unknown): string {
	return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32)}`;
}

function readMetadataString(value: unknown, key: string): string | null {
	return isRecord(value) ? normalizeOptionalString(value[key]) : null;
}

function normalizeProvider(value: unknown): ProviderId | null {
	return value === "chatgpt" || value === "gemini" || value === "grok" ? value : null;
}

function normalizeAction(value: unknown): AccountMirrorFrontierAction | null {
	return value === "skip" ||
		value === "visit_once" ||
		value === "materialize_retained" ||
		value === "defer"
		? value
		: null;
}

function normalizeOutcome(value: unknown): AccountMirrorFrontierOutcome {
	return value === "complete" || value === "deferred" || value === "terminal" ? value : "pending";
}

function normalizeAvailability(value: unknown): AccountMirrorAssetAvailability {
	return value === "available" || value === "unavailable" ? value : "unknown";
}

function normalizeRequiredString(value: unknown): string | null {
	const normalized = normalizeOptionalString(value);
	return normalized || null;
}

function normalizeOptionalString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIdentityKey(value: string): string {
	return value.trim().toLowerCase();
}

function normalizeIsoString(value: string): string {
	return normalizeOptionalIsoString(value) ?? new Date(0).toISOString();
}

function normalizeOptionalIsoString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function nonNegativeInteger(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
