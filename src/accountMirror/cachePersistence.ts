import type { ResolvedUserConfig } from "../config.js";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAuracallHomeDir } from "../auracallHome.js";
import type { ProviderCacheContext } from "../browser/providers/cache.js";
import type {
	Conversation,
	ConversationArtifact,
	ConversationContext,
	FileRef,
	Project,
} from "../browser/providers/domain.js";
import {
	createCacheStore,
	type AccountMirrorCacheSnapshot,
	type AccountMirrorMediaManifestEntry,
	type CacheStore,
	type CacheStoreKind,
} from "../browser/llmService/cache/store.js";
import type { AccountMirrorProvider } from "./politePolicy.js";
import type {
	AccountMirrorMetadataCounts,
	AccountMirrorMetadataEvidence,
	AccountMirrorStatusState,
} from "./statusRegistry.js";

export interface AccountMirrorPersistenceRecord {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	boundIdentityKey: string;
	detectedIdentityKey: string | null;
	detectedAccountLevel: string | null;
	requestId: string;
	startedAt: string;
	completedAt: string;
	dispatcherKey: string | null;
	dispatcherOperationId: string | null;
	metadataCounts: AccountMirrorMetadataCounts;
	metadataEvidence: AccountMirrorMetadataEvidence | null;
	manifests: {
		projects: Project[];
		conversations: Conversation[];
		artifacts: ConversationArtifact[];
		files: FileRef[];
		media: AccountMirrorMediaManifestEntry[];
	};
}

export interface AccountMirrorConversationContextCacheEntry {
	context: ConversationContext;
	fetchedAt: string | null;
	stale: boolean;
}

export interface AccountMirrorConversationContextRequest {
	provider: AccountMirrorProvider;
	boundIdentityKey: string | null;
	conversationId: string;
}

export interface AccountMirrorConversationEvidence {
	detailObservedAt?: string | null;
	manifestObservedAt?: string | null;
	materializedAt?: string | null;
	routeabilityObservedAt?: string | null;
	routeabilityState?: string | null;
	routeabilityReason?: string | null;
	detailCompleteness?: string | null;
	assetCompleteness?: string | null;
	messageCount?: number | null;
	fileCount?: number | null;
	sourceCount?: number | null;
	artifactCount?: number | null;
}

export interface AccountMirrorPersistence {
	writeSnapshot(record: AccountMirrorPersistenceRecord): Promise<void>;
	writeState?(record: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		browserProfileId: string | null;
		boundIdentityKey: string | null;
		updatedAt: string;
		state: AccountMirrorStatusState;
	}): Promise<void>;
	updateConversationEvidence?(
		input: AccountMirrorConversationContextRequest & {
			evidence: AccountMirrorConversationEvidence;
			upsert?: {
				title?: string | null;
				projectId?: string | null;
				url?: string | null;
			} | null;
		},
	): Promise<boolean>;
	readCatalog(input: {
		provider: AccountMirrorProvider;
		boundIdentityKey: string | null;
		limit?: number | null;
	}): Promise<{
		projects: Project[];
		conversations: Conversation[];
		artifacts: ConversationArtifact[];
		files: FileRef[];
		media: AccountMirrorMediaManifestEntry[];
	} | null>;
	readState(input: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		browserProfileId: string | null;
		boundIdentityKey: string | null;
	}): Promise<AccountMirrorStatusState | null>;
	readConversationContext(
		input: AccountMirrorConversationContextRequest,
	): Promise<ConversationContext | null>;
	readConversationContextEntry?(
		input: AccountMirrorConversationContextRequest,
	): Promise<AccountMirrorConversationContextCacheEntry | null>;
}

export function createAccountMirrorPersistence(input: {
	config: Record<string, unknown> | null | undefined;
	cacheStore?: CacheStore;
}): AccountMirrorPersistence {
	const options = input;
	const cacheStore = options.cacheStore ?? createCacheStore(resolveCacheStoreKind(options.config));
	const statusDir = resolveAccountMirrorStatusDir(options.config);
	const readConversationContextEntry = async (
		request: AccountMirrorConversationContextRequest,
	): Promise<AccountMirrorConversationContextCacheEntry | null> => {
		if (!request.boundIdentityKey || !request.conversationId.trim()) {
			return null;
		}
		const context = createMirrorCacheContext({
			config: options.config,
			provider: request.provider,
			boundIdentityKey: request.boundIdentityKey,
		});
		const result = await cacheStore.readConversationContext(context, request.conversationId.trim());
		return hasConversationContextPayload(result.items)
			? {
					context: result.items,
					fetchedAt: result.fetchedAt === null ? null : new Date(result.fetchedAt).toISOString(),
					stale: result.stale,
				}
			: null;
	};
	return {
		async writeSnapshot(record) {
			const context = createMirrorCacheContext({
				config: options.config,
				provider: record.provider,
				boundIdentityKey: record.boundIdentityKey,
			});
			const snapshot: AccountMirrorCacheSnapshot = {
				object: "account_mirror_snapshot",
				version: 1,
				provider: record.provider,
				boundIdentityKey: record.boundIdentityKey,
				detectedIdentityKey: record.detectedIdentityKey,
				detectedAccountLevel: record.detectedAccountLevel,
				collectedAt: record.completedAt,
				metadataCounts: record.metadataCounts,
				metadataEvidence: record.metadataEvidence,
				refresh: {
					requestId: record.requestId,
					runtimeProfileId: record.runtimeProfileId,
					browserProfileId: record.browserProfileId,
					startedAt: record.startedAt,
					completedAt: record.completedAt,
					dispatcherKey: record.dispatcherKey,
					dispatcherOperationId: record.dispatcherOperationId,
				},
			};
			await cacheStore.writeAccountMirrorSnapshot(context, snapshot);
			await cacheStore.writeProjects(context, record.manifests.projects);
			await cacheStore.writeConversations(context, annotateSnapshotConversations(record));
			await cacheStore.writeAccountMirrorArtifacts(context, record.manifests.artifacts);
			await cacheStore.writeAccountMirrorFiles(context, record.manifests.files);
			await cacheStore.writeAccountMirrorMedia(context, record.manifests.media);
		},
		async writeState(record) {
			if (!record.boundIdentityKey) {
				return;
			}
			await fs.mkdir(statusDir, { recursive: true });
			const statusRecord = normalizePersistentStatusRecord(record);
			const recordPath = resolveStatusRecordPath(statusDir, record);
			const tempPath = `${recordPath}.${process.pid}.${Date.now()}.tmp`;
			await fs.writeFile(tempPath, `${JSON.stringify(statusRecord, null, 2)}\n`, "utf8");
			await fs.rename(tempPath, recordPath);
		},
		async updateConversationEvidence(request) {
			if (!request.boundIdentityKey || !request.conversationId.trim()) {
				return false;
			}
			const context = createMirrorCacheContext({
				config: options.config,
				provider: request.provider,
				boundIdentityKey: request.boundIdentityKey,
			});
			const result = await cacheStore.readConversations(context);
			let updated = false;
			const next = result.items.map((conversation) => {
				if (conversation.id !== request.conversationId.trim()) {
					return conversation;
				}
				updated = true;
				return mergeConversationEvidence(conversation, request.evidence);
			});
			if (!updated) {
				if (!request.upsert) {
					return false;
				}
				next.push(
					mergeConversationEvidence(
						{
							id: request.conversationId.trim(),
							title: request.upsert.title?.trim() || request.conversationId.trim(),
							provider: request.provider,
							projectId: request.upsert.projectId?.trim() || undefined,
							url: request.upsert.url?.trim() || undefined,
						},
						request.evidence,
					),
				);
			}
			await cacheStore.writeConversations(context, next);
			return true;
		},
		async readCatalog(request) {
			if (!request.boundIdentityKey) {
				return null;
			}
			const context = createMirrorCacheContext({
				config: options.config,
				provider: request.provider,
				boundIdentityKey: request.boundIdentityKey,
			});
			const limit = normalizeLimit(request.limit);
			const [projects, conversations, artifacts, files, media] = await Promise.all([
				cacheStore.readProjects(context),
				cacheStore.readConversations(context),
				cacheStore.readAccountMirrorArtifacts(context),
				cacheStore.readAccountMirrorFiles(context),
				cacheStore.readAccountMirrorMedia(context),
			]);
			return {
				projects: projects.items.slice(0, limit),
				conversations: conversations.items.slice(0, limit),
				artifacts: artifacts.items.slice(0, limit),
				files: files.items.slice(0, limit),
				media: media.items.slice(0, limit),
			};
		},
		async readState(request) {
			if (!request.boundIdentityKey) {
				return null;
			}
			const statusRecord = await readPersistentStatusRecord(statusDir, request);
			const statusState = statusRecord?.state ?? null;
			const context = createMirrorCacheContext({
				config: options.config,
				provider: request.provider,
				boundIdentityKey: request.boundIdentityKey,
			});
			const result = await cacheStore.readAccountMirrorSnapshot(context);
			const snapshot = result.items;
			if (!snapshot || snapshot.object !== "account_mirror_snapshot") {
				return statusState;
			}
			if (
				snapshot.provider !== request.provider ||
				normalizeIdentityKey(snapshot.boundIdentityKey) !==
					normalizeIdentityKey(request.boundIdentityKey)
			) {
				return statusState;
			}
			const snapshotCompletedAtMs = Date.parse(
				snapshot.refresh.completedAt || snapshot.collectedAt,
			);
			const shouldApplyStatusRecord = statusRecord
				? !Number.isFinite(snapshotCompletedAtMs) ||
					Date.parse(statusRecord.updatedAt) >= snapshotCompletedAtMs
				: false;
			if (
				snapshot.refresh.runtimeProfileId !== request.runtimeProfileId ||
				snapshot.refresh.browserProfileId !== request.browserProfileId
			) {
				return mergeStatusState(
					{
						detectedIdentityKey: snapshot.detectedIdentityKey,
						lastSuccessAtMs: Date.parse(snapshot.collectedAt),
						lastCompletedAtMs: Date.parse(snapshot.collectedAt),
						metadataCounts: snapshot.metadataCounts,
						metadataEvidence: snapshot.metadataEvidence,
					},
					shouldApplyStatusRecord ? statusState : null,
				);
			}
			return mergeStatusState(
				{
					detectedIdentityKey: snapshot.detectedIdentityKey,
					lastSuccessAtMs: Date.parse(snapshot.refresh.completedAt),
					lastCompletedAtMs: Date.parse(snapshot.refresh.completedAt),
					lastRefreshRequestId: snapshot.refresh.requestId,
					lastStartedAtMs: Date.parse(snapshot.refresh.startedAt),
					lastDispatcherKey: snapshot.refresh.dispatcherKey,
					lastDispatcherOperationId: snapshot.refresh.dispatcherOperationId,
					metadataCounts: snapshot.metadataCounts,
					metadataEvidence: snapshot.metadataEvidence,
				},
				shouldApplyStatusRecord ? statusState : null,
			);
		},
		async readConversationContext(request) {
			return (await readConversationContextEntry(request))?.context ?? null;
		},
		readConversationContextEntry,
	};
}

function mergeConversationEvidence(
	conversation: Conversation,
	evidence: AccountMirrorConversationEvidence,
): Conversation {
	const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
	const cleaned = cleanEvidenceRecord(evidence);
	return {
		...conversation,
		metadata: {
			...metadata,
			...cleaned,
		},
	};
}

function cleanEvidenceRecord(evidence: AccountMirrorConversationEvidence): Record<string, unknown> {
	const cleaned: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(evidence)) {
		if (value !== undefined) {
			cleaned[key] = value;
		}
	}
	return cleaned;
}

function hasConversationContextPayload(context: ConversationContext): boolean {
	return Boolean(
		context.messages.length > 0 ||
			(context.files?.length ?? 0) > 0 ||
			(context.sources?.length ?? 0) > 0 ||
			(context.artifacts?.length ?? 0) > 0,
	);
}

function annotateSnapshotConversations(record: AccountMirrorPersistenceRecord): Conversation[] {
	return record.manifests.conversations.map((conversation, index) => {
		const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
		return {
			...conversation,
			metadata: {
				...metadata,
				indexObservedAt: record.completedAt,
				indexSource: conversation.projectId ? "project-conversations" : "left-rail",
				indexRank: index,
				conversationFingerprint: fingerprintConversationIndexRow(conversation),
			},
		};
	});
}

function fingerprintConversationIndexRow(conversation: Conversation): string {
	const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
	const source = {
		id: conversation.id,
		title: conversation.title,
		provider: conversation.provider,
		projectId: conversation.projectId ?? null,
		url: conversation.url ?? null,
		updatedAt: conversation.updatedAt ?? null,
		latestTurnId: readMetadataString(metadata, ["latestTurnId", "lastMessageId"]),
	};
	const digest = createHash("sha256").update(JSON.stringify(source)).digest("hex");
	return `sha256:${digest.slice(0, 32)}`;
}

function createMirrorCacheContext(input: {
	config: Record<string, unknown> | null | undefined;
	provider: AccountMirrorProvider;
	boundIdentityKey: string;
}): ProviderCacheContext {
	return {
		provider: input.provider,
		userConfig: (input.config ?? {}) as ResolvedUserConfig,
		listOptions: {},
		identityKey: normalizeIdentityKey(input.boundIdentityKey),
		cacheRoot: readCacheRoot(input.config),
	};
}

interface PersistentAccountMirrorStatusRecord {
	object: "account_mirror_status_state";
	version: 1;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	boundIdentityKey: string;
	updatedAt: string;
	state: AccountMirrorStatusState;
}

function resolveAccountMirrorStatusDir(config: Record<string, unknown> | null | undefined): string {
	return path.join(
		readCacheRoot(config) ?? path.join(getAuracallHomeDir(), "cache"),
		"account-mirror",
		"status",
	);
}

function resolveStatusRecordPath(
	rootDir: string,
	key: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		browserProfileId: string | null;
		boundIdentityKey: string | null;
	},
): string {
	const digest = createHash("sha256")
		.update(
			[
				key.provider,
				key.runtimeProfileId,
				key.browserProfileId ?? "",
				normalizeIdentityKey(key.boundIdentityKey ?? ""),
			].join("\n"),
		)
		.digest("hex");
	return path.join(
		rootDir,
		`${key.provider}-${encodeURIComponent(key.runtimeProfileId)}-${digest.slice(0, 16)}.json`,
	);
}

async function readPersistentStatusRecord(
	rootDir: string,
	key: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		browserProfileId: string | null;
		boundIdentityKey: string | null;
	},
): Promise<PersistentAccountMirrorStatusRecord | null> {
	if (!key.boundIdentityKey) return null;
	try {
		const raw = await fs.readFile(resolveStatusRecordPath(rootDir, key), "utf8");
		return parsePersistentStatusRecord(JSON.parse(raw), key);
	} catch (error) {
		if (isMissingFileError(error)) return null;
		throw error;
	}
}

function normalizePersistentStatusRecord(input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	boundIdentityKey: string | null;
	updatedAt: string;
	state: AccountMirrorStatusState;
}): PersistentAccountMirrorStatusRecord {
	return {
		object: "account_mirror_status_state",
		version: 1,
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId,
		browserProfileId: input.browserProfileId,
		boundIdentityKey: normalizeIdentityKey(input.boundIdentityKey ?? ""),
		updatedAt: normalizeIsoString(input.updatedAt) ?? new Date(0).toISOString(),
		state: normalizePersistentStatusState(input.state),
	};
}

function parsePersistentStatusRecord(
	value: unknown,
	key: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		browserProfileId: string | null;
		boundIdentityKey: string | null;
	},
): PersistentAccountMirrorStatusRecord | null {
	if (!isRecord(value) || value.object !== "account_mirror_status_state") return null;
	if (
		value.provider !== key.provider ||
		value.runtimeProfileId !== key.runtimeProfileId ||
		(typeof value.browserProfileId === "string" ? value.browserProfileId : null) !==
			key.browserProfileId ||
		normalizeIdentityKey(String(value.boundIdentityKey ?? "")) !==
			normalizeIdentityKey(key.boundIdentityKey ?? "")
	) {
		return null;
	}
	return normalizePersistentStatusRecord({
		provider: key.provider,
		runtimeProfileId: key.runtimeProfileId,
		browserProfileId: key.browserProfileId,
		boundIdentityKey: key.boundIdentityKey,
		updatedAt: String(value.updatedAt ?? ""),
		state: isRecord(value.state) ? (value.state as AccountMirrorStatusState) : {},
	});
}

function normalizePersistentStatusState(state: AccountMirrorStatusState): AccountMirrorStatusState {
	return {
		detectedIdentityKey: readOptionalString(state.detectedIdentityKey),
		detectedIdentitySource: readOptionalString(state.detectedIdentitySource),
		detectedIdentityObservedAtMs: readTimestampMs(state.detectedIdentityObservedAtMs),
		detectedIdentityConfidence: readOptionalString(state.detectedIdentityConfidence),
		identityMismatchLastCheckedAtMs: readTimestampMs(state.identityMismatchLastCheckedAtMs),
		identityMismatchRepair: normalizePersistentIdentityMismatchRepair(state.identityMismatchRepair),
		lastAttemptAtMs: readTimestampMs(state.lastAttemptAtMs),
		lastSuccessAtMs: readTimestampMs(state.lastSuccessAtMs),
		lastFailureAtMs: readTimestampMs(state.lastFailureAtMs),
		lastQueuedAtMs: readTimestampMs(state.lastQueuedAtMs),
		lastStartedAtMs: readTimestampMs(state.lastStartedAtMs),
		lastCompletedAtMs: readTimestampMs(state.lastCompletedAtMs),
		consecutiveFailureCount: readNonNegativeInteger(state.consecutiveFailureCount),
		providerCooldownUntilMs: readTimestampMs(state.providerCooldownUntilMs),
		providerHardStopAtMs: readTimestampMs(state.providerHardStopAtMs),
		providerGuard: normalizePersistentProviderGuard(state.providerGuard),
		queued: false,
		running: false,
		lastRefreshRequestId: readOptionalString(state.lastRefreshRequestId),
		lastDispatcherKey: readOptionalString(state.lastDispatcherKey),
		lastDispatcherOperationId: readOptionalString(state.lastDispatcherOperationId),
		lastDispatcherBlockedBy: isRecord(state.lastDispatcherBlockedBy)
			? state.lastDispatcherBlockedBy
			: null,
		metadataCounts: state.metadataCounts ?? null,
		metadataEvidence: state.metadataEvidence ?? null,
	};
}

function normalizePersistentIdentityMismatchRepair(
	value: AccountMirrorStatusState["identityMismatchRepair"],
): AccountMirrorStatusState["identityMismatchRepair"] {
	if (!value || !isRecord(value)) return null;
	const status =
		value.status === "current_mismatch_confirmed"
			? "current_mismatch_confirmed"
			: value.status === "stale_mismatch_repaired"
				? "stale_mismatch_repaired"
				: "none";
	if (status === "none") return null;
	return {
		status,
		previousDetectedIdentityKey: readOptionalString(value.previousDetectedIdentityKey),
		currentDetectedIdentityKey: readOptionalString(value.currentDetectedIdentityKey),
		repairedAtMs: readTimestampMs(value.repairedAtMs),
		checkedAtMs: readTimestampMs(value.checkedAtMs),
		source: readOptionalString(value.source),
		requestId: readOptionalString(value.requestId),
	};
}

function mergeStatusState(
	base: AccountMirrorStatusState,
	overlay: AccountMirrorStatusState | null,
): AccountMirrorStatusState {
	if (!overlay) return base;
	const next: AccountMirrorStatusState = { ...base };
	for (const [key, value] of Object.entries(overlay) as Array<
		[keyof AccountMirrorStatusState, unknown]
	>) {
		if (key === "queued" || key === "running") continue;
		if (key === "providerGuard") {
			next.providerGuard = value as AccountMirrorStatusState["providerGuard"];
			continue;
		}
		if (key === "lastDispatcherBlockedBy") {
			next.lastDispatcherBlockedBy = isRecord(value) ? value : null;
			continue;
		}
		if (value !== null && value !== undefined) {
			(next as Record<string, unknown>)[key] = value;
		}
	}
	next.queued = false;
	next.running = false;
	next.metadataCounts = overlay.metadataCounts ?? base.metadataCounts;
	next.metadataEvidence = overlay.metadataEvidence ?? base.metadataEvidence;
	return next;
}

function normalizePersistentProviderGuard(
	value: AccountMirrorStatusState["providerGuard"],
): AccountMirrorStatusState["providerGuard"] {
	if (!value || !isRecord(value)) return null;
	return {
		state: value.state === "cooldown" ? "cooldown" : "manual_clear_required",
		kind: value.kind ?? "unknown",
		summary: readOptionalString(value.summary) ?? "Provider guard is active.",
		detectedAtMs: readTimestampMs(value.detectedAtMs) ?? Date.parse(new Date(0).toISOString()),
		clearedAtMs: readTimestampMs(value.clearedAtMs),
		cooldownUntilMs: readTimestampMs(value.cooldownUntilMs),
		url: readOptionalString(value.url),
		action: readOptionalString(value.action),
	};
}

function resolveCacheStoreKind(config: Record<string, unknown> | null | undefined): CacheStoreKind {
	const configured = readNestedString(config, ["browser", "cache", "store"]);
	if (configured === "json" || configured === "sqlite" || configured === "dual") {
		return configured;
	}
	return "dual";
}

function readCacheRoot(config: Record<string, unknown> | null | undefined): string | null {
	return readNestedString(config, ["browser", "cache", "rootDir"]);
}

function readNestedString(
	value: Record<string, unknown> | null | undefined,
	path: string[],
): string | null {
	let current: unknown = value;
	for (const segment of path) {
		if (!current || typeof current !== "object") return null;
		current = (current as Record<string, unknown>)[segment];
	}
	const trimmed = typeof current === "string" ? current.trim() : "";
	return trimmed.length > 0 ? trimmed : null;
}

function readMetadataString(value: Record<string, unknown>, fields: string[]): string | null {
	for (const field of fields) {
		const candidate = value[field];
		if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
		if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
	}
	return null;
}

function readOptionalString(value: unknown): string | null {
	const trimmed = typeof value === "string" ? value.trim() : "";
	return trimmed.length > 0 ? trimmed : null;
}

function readTimestampMs(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return Math.max(0, Math.floor(value));
}

function readNonNegativeInteger(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return Math.max(0, Math.floor(value));
}

function normalizeIsoString(value: unknown): string | null {
	const parsed = typeof value === "string" ? Date.parse(value) : NaN;
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function isMissingFileError(error: unknown): boolean {
	return Boolean(
		error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "ENOENT",
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeIdentityKey(value: string | null | undefined): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function normalizeLimit(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 50;
	return Math.max(0, Math.min(500, Math.floor(value)));
}
