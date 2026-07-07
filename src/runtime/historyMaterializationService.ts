import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { findChromePidUsingUserDataDir } from "../../packages/browser-service/src/processCheck.js";
import {
	type AccountMirrorConversationEvidence,
	createAccountMirrorPersistence,
} from "../accountMirror/cachePersistence.js";
import {
	type AccountMirrorCatalogEntry,
	type AccountMirrorCatalogItemResult,
	type AccountMirrorCatalogKind,
	type AccountMirrorCatalogService,
	createAccountMirrorCatalogService,
} from "../accountMirror/catalogService.js";
import { createLlmService } from "../browser/llmService/providers/index.js";
import type { ConversationArtifact, FileRef, ProviderId } from "../browser/providers/domain.js";
import {
	type BrowserScrapeTelemetrySnapshot,
	createBrowserScrapeTelemetryRecorder,
	snapshotBrowserScrapeTelemetry,
} from "../browser/providers/scrapeTelemetry.js";
import type { BrowserProviderListOptions } from "../browser/providers/types.js";
import type { BrowserProcessOwnerAttribution } from "../browser/service/browserService.js";
import { resolveRuntimeProfileUserConfig } from "../browser/service/profileConfig.js";
import { resolveManagedBrowserLaunchContextFromResolvedConfig } from "../browser/service/profileResolution.js";
import type { ResolvedUserConfig } from "../config.js";
import { createBrowserMediaGenerationMaterializer } from "../media/browserExecutor.js";
import { createMediaGenerationService } from "../media/service.js";
import type {
	MediaGenerationArtifact,
	MediaGenerationResponse,
	MediaGenerationType,
} from "../media/types.js";
import { getRunArchiveDir } from "./archiveIndexStore.js";
import {
	createRunArchiveService,
	type RunArchiveHistoryMaterializationAsset,
	type RunArchiveItem,
	type RunArchiveService,
} from "./archiveService.js";

const execFileAsync = promisify(execFile);

export type HistoryMaterializationJobStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "skipped"
	| "failed"
	| "cancelled";

export type HistoryMaterializationAssetKind = "artifacts" | "files" | "media" | "all";
export type HistoryMaterializationAssetSource = "account-library";

export interface HistoryMaterializationCreateRequest {
	provider?: ProviderId | null;
	runtimeProfile?: string | null;
	browserProfile?: string | null;
	boundIdentityKey?: string | null;
	conversationId?: string | null;
	conversationIds?: string[] | null;
	providerConversationUrl?: string | null;
	projectId?: string | null;
	catalogItemId?: string | null;
	catalogKind?: AccountMirrorCatalogKind | null;
	archiveItemId?: string | null;
	reconcile?: boolean | null;
	assetSource?: HistoryMaterializationAssetSource | null;
	refreshSnapshot?: boolean | null;
	assetKinds?: HistoryMaterializationAssetKind[] | null;
	maxItems?: number | null;
	providerWorkTimeoutMs?: number | null;
	force?: boolean | null;
}

export interface HistoryMaterializationManifestEntry {
	kind: "artifact" | "file" | "media";
	providerId: string | null;
	title: string | null;
	status: "materialized" | "duplicate" | "skipped" | "failed";
	localPath: string | null;
	remoteUrl: string | null;
	cacheKey: string | null;
	checksumSha256: string | null;
	mimeType: string | null;
	size: number | null;
	materializationMethod: string | null;
	reason: string | null;
	archiveItemId: string | null;
	assetRoute: string | null;
}

export interface HistoryMaterializationTarget {
	provider: ProviderId;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	conversationId: string;
	providerConversationUrl: string | null;
	projectId: string | null;
}

export type HistoryMaterializationSnapshotRouteabilityState =
	| "routeable"
	| "not_found_or_unavailable"
	| "identity_mismatch"
	| "guarded"
	| "auth_conflict"
	| "unknown";

export interface HistoryMaterializationSnapshotRefresh {
	object: "history_materialization_snapshot_refresh";
	generatedAt: string;
	status: "refreshed" | "skipped" | "failed";
	target: HistoryMaterializationTarget | null;
	routeabilityState: HistoryMaterializationSnapshotRouteabilityState;
	messageCount: number | null;
	fileCount: number | null;
	sourceCount: number | null;
	artifactCount: number | null;
	error: string | null;
	message: string;
}

export interface HistoryMaterializationPhases {
	snapshotRefresh: HistoryMaterializationSnapshotRefresh | null;
	materialization: {
		status: HistoryMaterializationResult["status"];
		generatedAt: string;
		manifestPaths: string[];
		entries: number;
		archiveItems: number;
		metrics: HistoryMaterializationResult["metrics"];
	} | null;
}

export interface HistoryMediaGenerationMaterializeInput {
	mediaGenerationId: string;
	provider: ProviderId;
	mediaType: MediaGenerationType;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	conversationId: string;
	providerConversationUrl: string | null;
	projectId: string | null;
	jobId: string;
	matchBasis: string;
	count: number | null;
	metadata?: Record<string, unknown> | null;
}

export interface HistoryAccountLibraryMaterializeInput {
	provider: ProviderId;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	catalogItemId: string;
	file: FileRef;
	jobId: string;
}

export interface HistoryAccountLibraryListInput {
	provider: ProviderId;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	jobId?: string | null;
}

export interface HistoryProjectSourcesMaterializeInput {
	provider: ProviderId;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	projectId: string;
	jobId: string;
	maxItems: number | null;
}

export interface HistoryMaterializationProviderListOptions extends BrowserProviderListOptions {
	configuredUrl?: string;
	tabUrl?: string;
	projectId?: string;
	allowNavigation: true;
	expectedUserIdentity?: {
		email?: string;
		handle?: string;
	};
	skipFeatureSignature?: boolean;
}

export interface HistoryMaterializationResult {
	object: "history_materialization_result";
	generatedAt: string;
	status: "materialized" | "skipped";
	target: HistoryMaterializationTarget | null;
	source: HistoryMaterializationJob["source"];
	manifestPaths: string[];
	entries: HistoryMaterializationManifestEntry[];
	archiveItems: RunArchiveItem[];
	snapshotRefreshes?: HistoryMaterializationSnapshotRefresh[] | null;
	scrapeTelemetry?: BrowserScrapeTelemetrySnapshot | null;
	metrics: {
		conversations: number;
		materialized: number;
		duplicateAliases?: number;
		skipped: number;
		failed: number;
	};
	phases?: HistoryMaterializationPhases | null;
	message: string;
}

export interface HistoryMaterializationJob {
	object: "history_materialization_job";
	id: string;
	source:
		| { type: "conversation"; provider: ProviderId; conversationId: string }
		| { type: "catalog_item"; catalogItemId: string; catalogKind: AccountMirrorCatalogKind | null }
		| { type: "archive_item"; archiveItemId: string }
		| { type: "project_sources"; provider: ProviderId; projectId: string }
		| { type: "reconciliation"; provider: ProviderId | null }
		| { type: "account_library_reconciliation"; provider: ProviderId | null };
	request: HistoryMaterializationCreateRequest;
	sourceKey: string;
	status: HistoryMaterializationJobStatus;
	createdAt: string;
	updatedAt: string;
	startedAt: string | null;
	completedAt: string | null;
	attemptCount: number;
	result: HistoryMaterializationResult | null;
	scrapeTelemetry?: BrowserScrapeTelemetrySnapshot | null;
	error: {
		message: string;
		type:
			| "invalid_request_error"
			| "not_found_error"
			| "provider_auth_conflict"
			| "provider_guard_required"
			| "internal_error";
		statusCode: number;
	} | null;
	message: string;
	scheduler?: HistoryMaterializationJobSchedulerDiagnostics | null;
}

export interface HistoryMaterializationJobSchedulerDiagnostics {
	object: "history_materialization_job_scheduler";
	generatedAt: string;
	state: "queued" | "stale_queued" | "running" | "succeeded" | "skipped" | "failed" | "cancelled";
	dispatchState: "scheduled" | "unscheduled" | "running" | "terminal";
	queuedAgeMs: number | null;
	runAgeMs: number | null;
	queuedToStartLatencyMs: number | null;
	stale: boolean;
	staleReason: string | null;
}

export interface HistoryMaterializationJobCreateResult {
	object: "history_materialization_job_create_result";
	generatedAt: string;
	reused: boolean;
	reuseReason: string | null;
	job: HistoryMaterializationJob;
}

export interface HistoryMaterializationJobListRequest {
	status?: HistoryMaterializationJobStatus | "active" | "terminal" | null;
	provider?: ProviderId | null;
	runtimeProfile?: string | null;
	sourceType?: HistoryMaterializationJob["source"]["type"] | null;
	limit?: number | null;
}

export interface HistoryMaterializationJobListResult {
	object: "history_materialization_jobs";
	generatedAt: string;
	status: HistoryMaterializationJobListRequest["status"] | null;
	provider: ProviderId | null;
	runtimeProfile: string | null;
	sourceType: HistoryMaterializationJobListRequest["sourceType"] | null;
	limit: number;
	jobs: HistoryMaterializationJob[];
	metrics: {
		total: number;
		byStatus: Record<string, number>;
		active: number;
		terminal: number;
	};
}

const DEFAULT_RUNNING_STALE_THRESHOLD_MS = 30 * 60_000;

export interface HistoryAccountLibraryReconciliationPreviewResult {
	object: "history_account_library_reconciliation_preview";
	generatedAt: string;
	provider: ProviderId | null;
	runtimeProfile: string | null;
	maxItems: number;
	metrics: {
		catalogFiles: number;
		eligibleCandidates: number;
		selectedCandidates: number;
		archivedFamilies: number;
		unresolvedStale: number;
		unsupportedOrTerminal: number;
		duplicateFamilies: number;
	};
}

export interface HistoryMaterializationService {
	createJob(
		request: HistoryMaterializationCreateRequest,
	): Promise<HistoryMaterializationJobCreateResult>;
	listJobs(
		request?: HistoryMaterializationJobListRequest,
	): Promise<HistoryMaterializationJobListResult>;
	readJob(id: string): Promise<HistoryMaterializationJob | null>;
	cancelJob(id: string): Promise<HistoryMaterializationJob>;
	runJob(id: string): Promise<HistoryMaterializationJob>;
	recoverInterruptedJobs(): Promise<number>;
	previewAccountLibraryReconciliation?(
		request: HistoryMaterializationCreateRequest,
	): Promise<HistoryAccountLibraryReconciliationPreviewResult>;
}

export class HistoryMaterializationError extends Error {
	constructor(
		message: string,
		readonly statusCode: 400 | 404 = 400,
	) {
		super(message);
		this.name = "HistoryMaterializationError";
	}
}

export class HistoryMaterializationJobControlError extends Error {
	constructor(
		message: string,
		readonly statusCode: 400 | 404 | 409 = 400,
		readonly type = statusCode === 404
			? "not_found_error"
			: statusCode === 409
				? "conflict_error"
				: "invalid_request_error",
	) {
		super(message);
		this.name = "HistoryMaterializationJobControlError";
	}
}

export function formatHistoryMaterializationFailureReason(input: {
	target?: HistoryMaterializationTarget | null;
	error: unknown;
}): string {
	const message = input.error instanceof Error ? input.error.message : String(input.error);
	const geminiRouteabilityReason = formatGeminiConversationRouteabilityReason(
		input.target ?? null,
		message,
	);
	return geminiRouteabilityReason ?? message;
}

export interface HistoryMaterializationServiceDeps {
	config: ResolvedUserConfig | Record<string, unknown>;
	catalogService?: AccountMirrorCatalogService;
	runArchiveService?: RunArchiveService;
	store?: HistoryMaterializationJobStore;
	now?: () => Date;
	generateId?: () => string;
	schedule?: (work: () => Promise<void>) => void;
	withForegroundWork?: <T>(work: () => Promise<T>) => Promise<T>;
	cleanupManagedBrowserAfterProviderWork?: boolean;
	materializeConversation?: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationResult>;
	refreshConversationSnapshot?: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationSnapshotRefresh>;
	recordConversationEvidence?: (
		target: HistoryMaterializationTarget,
		evidence: AccountMirrorConversationEvidence,
	) => Promise<void>;
	materializeMediaGeneration?: (
		input: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	materializeAccountLibraryFiles?: (input: HistoryAccountLibraryMaterializeInput) => Promise<{
		accountFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	listAccountLibraryFiles?: (input: HistoryAccountLibraryListInput) => Promise<FileRef[]>;
	materializeProjectSources?: (input: HistoryProjectSourcesMaterializeInput) => Promise<{
		projectFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
}

export interface HistoryMaterializationJobStore {
	listJobs(): Promise<HistoryMaterializationJob[]>;
	readJob(id: string): Promise<HistoryMaterializationJob | null>;
	upsertJob(job: HistoryMaterializationJob): Promise<void>;
}

export function createHistoryMaterializationService(
	deps: HistoryMaterializationServiceDeps,
): HistoryMaterializationService {
	const now = deps.now ?? (() => new Date());
	const store = deps.store ?? createHistoryMaterializationJobStore();
	const runArchiveService = deps.runArchiveService ?? createRunArchiveService();
	const catalogService =
		deps.catalogService ??
		createAccountMirrorCatalogService({
			config: deps.config as Record<string, unknown>,
			now,
		});
	const generateId = deps.generateId ?? (() => `hmj_${randomUUID().replace(/-/g, "")}`);
	const schedule =
		deps.schedule ??
		((work) => {
			setImmediate(() => {
				void work();
			});
		});
	const withForegroundWork = deps.withForegroundWork ?? (async (work) => work());
	const cleanupBrowserBackedProviderWork = deps.cleanupManagedBrowserAfterProviderWork === true;
	let queue = Promise.resolve();
	const scheduledJobIds = new Set<string>();

	const materializeConversation =
		deps.materializeConversation ??
		((target, request, jobId) =>
			materializeConversationTarget({
				config: deps.config,
				runArchiveService,
				target,
				request,
				jobId,
				now,
			}));
	const refreshConversationSnapshot =
		deps.refreshConversationSnapshot ??
		((target, request, jobId) =>
			refreshConversationSnapshotTarget({
				config: deps.config,
				target,
				request,
				jobId,
				now,
			}));
	const accountMirrorPersistence = createAccountMirrorPersistence({
		config: deps.config as Record<string, unknown>,
	});
	const recordConversationEvidence =
		deps.recordConversationEvidence ??
		(async (target, evidence) => {
			await accountMirrorPersistence.updateConversationEvidence?.({
				provider: target.provider,
				boundIdentityKey: target.boundIdentityKey,
				conversationId: target.conversationId,
				evidence,
				upsert: {
					title: target.conversationId,
					projectId: target.projectId,
					url: target.providerConversationUrl,
				},
			});
		});
	const materializeMediaGeneration =
		deps.materializeMediaGeneration ??
		((request) =>
			materializeMediaGenerationTarget({
				config: deps.config,
				request,
			}));
	const materializeAccountLibraryFiles =
		deps.materializeAccountLibraryFiles ??
		((request) =>
			materializeAccountLibraryFilesTarget({
				config: deps.config,
				request,
			}));
	const listAccountLibraryFiles =
		deps.listAccountLibraryFiles ??
		((request) =>
			listAccountLibraryFilesTarget({
				config: deps.config,
				request,
			}));
	const materializeProjectSources =
		deps.materializeProjectSources ??
		((request) =>
			materializeProjectSourcesTarget({
				config: deps.config,
				request,
			}));

	const service: HistoryMaterializationService = {
		async createJob(request) {
			const normalized = normalizeCreateRequest(request);
			const source = sourceFromCreateRequest(normalized);
			const sourceKey = sourceKeyFromCreateRequest(normalized);
			const generatedAt = now().toISOString();
			const active = await findActiveJobForSource(store, sourceKey, recoverStaleRunningJob);
			if (active) {
				if (active.status === "queued") {
					scheduleJob(active.id);
				}
				return {
					object: "history_materialization_job_create_result",
					generatedAt,
					reused: true,
					reuseReason: `active sourceKey is already ${active.status}`,
					job: withSchedulerDiagnostics(active),
				};
			}
			const job: HistoryMaterializationJob = {
				object: "history_materialization_job",
				id: generateId(),
				source,
				request: normalized,
				sourceKey,
				status: "queued",
				createdAt: generatedAt,
				updatedAt: generatedAt,
				startedAt: null,
				completedAt: null,
				attemptCount: 0,
				result: null,
				error: null,
				message: "History materialization job queued.",
			};
			await store.upsertJob(job);
			scheduleJob(job.id);
			return {
				object: "history_materialization_job_create_result",
				generatedAt,
				reused: false,
				reuseReason: null,
				job: withSchedulerDiagnostics(job),
			};
		},

		async listJobs(request = {}) {
			const status = request.status ?? null;
			const provider = request.provider ?? null;
			const runtimeProfile = normalizeOptionalString(request.runtimeProfile);
			const sourceType = request.sourceType ?? null;
			const limit = normalizeListLimit(request.limit);
			const allJobs = await recoverStaleRunningJobs(await store.listJobs());
			const filtered = allJobs.filter(
				(job) =>
					matchesStatusFilter(job, status) &&
					(!provider || job.request.provider === provider) &&
					(!runtimeProfile || job.request.runtimeProfile === runtimeProfile) &&
					(!sourceType || job.source.type === sourceType),
			);
			const jobs = filtered.slice(0, limit).map((job) => withSchedulerDiagnostics(job));
			return {
				object: "history_materialization_jobs",
				generatedAt: now().toISOString(),
				status,
				provider,
				runtimeProfile,
				sourceType,
				limit,
				jobs,
				metrics: summarizeJobs(filtered),
			};
		},

		async readJob(id) {
			const job = await store.readJob(id.trim());
			return withSchedulerDiagnostics(await recoverStaleRunningJob(job));
		},

		async cancelJob(id) {
			const jobId = id.trim();
			if (!jobId) {
				throw new HistoryMaterializationJobControlError(
					"History materialization job id is required.",
				);
			}
			const job = await store.readJob(jobId);
			if (!job) {
				throw new HistoryMaterializationJobControlError(
					`History materialization job ${jobId} was not found.`,
					404,
				);
			}
			if (job.status === "cancelled") return withSchedulerDiagnostics(job);
			if (job.status !== "queued") {
				throw new HistoryMaterializationJobControlError(
					`History materialization job ${jobId} is ${job.status}; only queued jobs can be cancelled before provider work starts.`,
					409,
				);
			}
			const cancelledAt = now().toISOString();
			const cancelled: HistoryMaterializationJob = {
				...job,
				status: "cancelled",
				updatedAt: cancelledAt,
				completedAt: cancelledAt,
				error: null,
				message: "History materialization job cancelled before provider work started.",
			};
			await store.upsertJob(cancelled);
			return withSchedulerDiagnostics(cancelled);
		},

		async runJob(id) {
			const job = await store.readJob(id.trim());
			if (!job) {
				throw new HistoryMaterializationError(
					`History materialization job ${id} was not found.`,
					404,
				);
			}
			if (!isActiveStatus(job.status)) return withSchedulerDiagnostics(job);
			const startedAt = now().toISOString();
			const running: HistoryMaterializationJob = {
				...job,
				status: "running",
				startedAt: job.startedAt ?? startedAt,
				updatedAt: startedAt,
				attemptCount: job.attemptCount + 1,
				error: null,
				message: "History materialization job is running.",
			};
			await store.upsertJob(running);
			try {
				const result = await withForegroundWork(() =>
					materializeHistoryRequest({
						config: deps.config,
						request: running.request,
						jobId: running.id,
						catalogService,
						runArchiveService,
						materializeConversation,
						refreshConversationSnapshot,
						recordConversationEvidence,
						materializeMediaGeneration,
						materializeAccountLibraryFiles,
						listAccountLibraryFiles,
						materializeProjectSources,
						jobStore: store,
						now,
					}),
				);
				const current = await store.readJob(running.id);
				if (current && !isActiveStatus(current.status)) {
					return withSchedulerDiagnostics(current);
				}
				const completedAt = now().toISOString();
				const completed: HistoryMaterializationJob = {
					...running,
					status: result.status === "skipped" ? "skipped" : "succeeded",
					updatedAt: completedAt,
					completedAt,
					result,
					error: null,
					message: result.message,
				};
				await store.upsertJob(completed);
				return withSchedulerDiagnostics(completed);
			} catch (error) {
				const current = await store.readJob(running.id);
				if (current && !isActiveStatus(current.status)) {
					return withSchedulerDiagnostics(current);
				}
				const completedAt = now().toISOString();
				const failed: HistoryMaterializationJob = {
					...running,
					status: "failed",
					updatedAt: completedAt,
					completedAt,
					result: null,
					error: historyMaterializationJobError(error),
					message: error instanceof Error ? error.message : "History materialization job failed.",
				};
				await store.upsertJob(failed);
				return withSchedulerDiagnostics(failed);
			} finally {
				if (cleanupBrowserBackedProviderWork) {
					await cleanupHistoryMaterializationManagedBrowser(deps.config, running.request);
				}
			}
		},

		async recoverInterruptedJobs() {
			const jobs = await store.listJobs();
			let recovered = 0;
			for (const job of jobs) {
				if (!isActiveStatus(job.status)) continue;
				if (job.status === "queued") {
					const timestamp = now().toISOString();
					await store.upsertJob({
						...job,
						updatedAt: timestamp,
						error: null,
						message:
							"History materialization job was recovered and re-queued after AuraCall API startup.",
					});
					scheduleJob(job.id);
					recovered += 1;
					continue;
				}
				const timestamp = now().toISOString();
				await store.upsertJob({
					...job,
					status: "failed",
					updatedAt: timestamp,
					completedAt: timestamp,
					error: {
						message:
							"History materialization job was interrupted before this AuraCall API process started.",
						type: "internal_error",
						statusCode: 500,
					},
					message:
						"History materialization job was interrupted before this AuraCall API process started.",
				});
				recovered += 1;
			}
			return recovered;
		},

		async previewAccountLibraryReconciliation(request) {
			return buildAccountLibraryReconciliationPreview({
				request: normalizeCreateRequest(request),
				catalogService,
				runArchiveService,
				listAccountLibraryFiles,
				now,
			});
		},
	};

	function scheduleJob(jobId: string): void {
		if (scheduledJobIds.has(jobId)) return;
		scheduledJobIds.add(jobId);
		schedule(async () => {
			queue = queue
				.then(() => service.runJob(jobId))
				.then(
					() => undefined,
					() => undefined,
				);
			try {
				await queue;
			} finally {
				scheduledJobIds.delete(jobId);
			}
		});
	}

	function withSchedulerDiagnostics<T extends HistoryMaterializationJob | null>(job: T): T {
		if (!job) return job;
		return {
			...job,
			scheduler: summarizeHistoryMaterializationJobScheduler(job, now(), {
				scheduled: scheduledJobIds.has(job.id),
			}),
		};
	}

	async function recoverStaleRunningJobs(
		jobs: HistoryMaterializationJob[],
	): Promise<HistoryMaterializationJob[]> {
		const results: HistoryMaterializationJob[] = [];
		for (const job of jobs) {
			results.push((await recoverStaleRunningJob(job)) ?? job);
		}
		return results;
	}

	async function recoverStaleRunningJob(
		job: HistoryMaterializationJob | null,
	): Promise<HistoryMaterializationJob | null> {
		if (!job || !canRunningJobTimeout(job)) return job;
		const timestampDate = now();
		if (!isTimedOutRunningJob(job, timestampDate)) return job;
		const timestamp = timestampDate.toISOString();
		const timeoutMs = resolveRunningStaleThresholdMs(job);
		const message = formatRunningTimeoutMessage(job, timeoutMs);
		const scrapeTelemetryProgress = await readHistoryMaterializationScrapeTelemetryProgress(job.id);
		const failed: HistoryMaterializationJob = {
			...job,
			status: "failed",
			updatedAt: timestamp,
			completedAt: timestamp,
			scrapeTelemetry: scrapeTelemetryProgress?.scrapeTelemetry ?? job.scrapeTelemetry ?? null,
			error: {
				message,
				type: "internal_error",
				statusCode: 500,
			},
			message,
		};
		await store.upsertJob(failed);
		if (scheduledJobIds.delete(job.id)) {
			queue = Promise.resolve();
		}
		if (cleanupBrowserBackedProviderWork) {
			await cleanupHistoryMaterializationManagedBrowser(deps.config, job.request);
		}
		return failed;
	}

	return service;
}

export function createHistoryMaterializationJobStore(
	filePath = path.join(getRunArchiveDir(), "history-materialization-jobs", "index.json"),
): HistoryMaterializationJobStore {
	return {
		async listJobs() {
			return readJobStoreFile(filePath);
		},
		async readJob(id) {
			const jobs = await readJobStoreFile(filePath);
			return jobs.find((job) => job.id === id) ?? null;
		},
		async upsertJob(job) {
			const jobs = await readJobStoreFile(filePath);
			const nextJobs = [job, ...jobs.filter((candidate) => candidate.id !== job.id)].sort(
				(left, right) => right.updatedAt.localeCompare(left.updatedAt),
			);
			await writeJobStoreFile(filePath, nextJobs);
		},
	};
}

interface HistoryMaterializationScrapeTelemetryProgress {
	generatedAt: string;
	scrapeTelemetry: BrowserScrapeTelemetrySnapshot;
}

function resolveHistoryMaterializationScrapeTelemetryProgressPath(jobId: string): string {
	return path.join(
		getRunArchiveDir(),
		"history-materialization-jobs",
		`${jobId}-scrape-telemetry.json`,
	);
}

async function writeHistoryMaterializationScrapeTelemetryProgress(
	jobId: string,
	progress: HistoryMaterializationScrapeTelemetryProgress,
): Promise<void> {
	const filePath = resolveHistoryMaterializationScrapeTelemetryProgressPath(jobId);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
}

async function readHistoryMaterializationScrapeTelemetryProgress(
	jobId: string,
): Promise<HistoryMaterializationScrapeTelemetryProgress | null> {
	try {
		const raw = await fs.readFile(
			resolveHistoryMaterializationScrapeTelemetryProgressPath(jobId),
			"utf8",
		);
		const parsed = JSON.parse(raw) as Partial<HistoryMaterializationScrapeTelemetryProgress>;
		if (!parsed.scrapeTelemetry) return null;
		return {
			generatedAt:
				typeof parsed.generatedAt === "string" ? parsed.generatedAt : new Date(0).toISOString(),
			scrapeTelemetry: parsed.scrapeTelemetry,
		};
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT") return null;
		return null;
	}
}

async function materializeHistoryRequest(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	materializeConversation: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationResult>;
	refreshConversationSnapshot: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationSnapshotRefresh>;
	recordConversationEvidence: (
		target: HistoryMaterializationTarget,
		evidence: AccountMirrorConversationEvidence,
	) => Promise<void>;
	materializeMediaGeneration: (
		request: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	materializeAccountLibraryFiles: (request: HistoryAccountLibraryMaterializeInput) => Promise<{
		accountFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	listAccountLibraryFiles: (request: HistoryAccountLibraryListInput) => Promise<FileRef[]>;
	materializeProjectSources: (request: HistoryProjectSourcesMaterializeInput) => Promise<{
		projectFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	jobStore: HistoryMaterializationJobStore;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const request = input.request;
	if (request.reconcile === true || (request.conversationIds?.length ?? 0) > 0) {
		if (request.assetSource === "account-library") {
			return materializeAccountLibraryReconciliation(input);
		}
		return materializeReconciliation(input);
	}
	if (
		request.provider &&
		request.projectId &&
		!request.conversationId &&
		!request.catalogItemId &&
		!request.archiveItemId
	) {
		return materializeProjectSources({
			request,
			jobId: input.jobId,
			runArchiveService: input.runArchiveService,
			materializeProjectSources: input.materializeProjectSources,
			now: input.now,
		});
	}
	if (request.archiveItemId) {
		const detail = await input.runArchiveService.readItem(request.archiveItemId);
		if (!detail) {
			throw new HistoryMaterializationError(
				`Run archive item ${request.archiveItemId} was not found.`,
				404,
			);
		}
		if (detail.item.fileAvailable === true && detail.item.localPath && request.force !== true) {
			return skippedResult({
				now: input.now,
				source: sourceFromCreateRequest(request),
				target: targetFromArchiveItem(detail.item),
				message: "Run archive item already has a readable local asset.",
			});
		}
		const mediaArchiveResult = await materializeMediaArchiveItem({
			request,
			jobId: input.jobId,
			catalogService: input.catalogService,
			runArchiveService: input.runArchiveService,
			materializeMediaGeneration: input.materializeMediaGeneration,
			now: input.now,
			archiveItem: detail.item,
		});
		if (mediaArchiveResult) return mediaArchiveResult;
		const target = targetFromArchiveItem(detail.item);
		if (!target) {
			return skippedResult({
				now: input.now,
				source: sourceFromCreateRequest(request),
				target: null,
				message:
					"Run archive item does not have provider conversation evidence for history materialization.",
			});
		}
		return reconcileConversationTarget({
			target,
			request,
			jobId: input.jobId,
			materializeConversation: input.materializeConversation,
			refreshConversationSnapshot: input.refreshConversationSnapshot,
			recordConversationEvidence: input.recordConversationEvidence,
			now: input.now,
		});
	}
	if (request.catalogItemId) {
		const detail = await input.catalogService.readItem({
			itemId: request.catalogItemId,
			provider: request.provider ?? null,
			runtimeProfileId: request.runtimeProfile ?? null,
			kind: request.catalogKind ?? "all",
			limit: 500,
		});
		if (!detail) {
			throw new HistoryMaterializationError(
				`Account mirror catalog item ${request.catalogItemId} was not found.`,
				404,
			);
		}
		const accountLibraryResult = await materializeAccountLibraryCatalogItem({
			detail,
			request,
			jobId: input.jobId,
			runArchiveService: input.runArchiveService,
			materializeAccountLibraryFiles: input.materializeAccountLibraryFiles,
			now: input.now,
		});
		if (accountLibraryResult) return accountLibraryResult;
		const target = targetFromCatalogItem(detail, request);
		if (!target) {
			return skippedResult({
				now: input.now,
				source: sourceFromCreateRequest(request),
				target: null,
				message:
					"Account mirror catalog item does not have provider conversation evidence for history materialization.",
			});
		}
		const scopedRequest = {
			...request,
			assetKinds: request.assetKinds ?? defaultAssetKindsForCatalogKind(detail.kind),
		};
		return reconcileConversationTarget({
			target,
			request: scopedRequest,
			jobId: input.jobId,
			materializeConversation: input.materializeConversation,
			refreshConversationSnapshot: input.refreshConversationSnapshot,
			recordConversationEvidence: input.recordConversationEvidence,
			now: input.now,
		});
	}
	if (request.conversationId && request.provider) {
		return reconcileConversationTarget({
			target: {
				provider: request.provider,
				runtimeProfile: request.runtimeProfile ?? null,
				browserProfile: request.browserProfile ?? null,
				boundIdentityKey: request.boundIdentityKey ?? null,
				conversationId: request.conversationId,
				providerConversationUrl:
					request.providerConversationUrl ??
					resolveProviderConversationUrl(request.provider, request.conversationId),
				projectId: request.projectId ?? null,
			},
			request,
			jobId: input.jobId,
			materializeConversation: input.materializeConversation,
			refreshConversationSnapshot: input.refreshConversationSnapshot,
			recordConversationEvidence: input.recordConversationEvidence,
			now: input.now,
		});
	}
	throw new HistoryMaterializationError(
		"Provide conversationId with provider, projectId with provider, conversationIds with provider, catalogItemId, archiveItemId, or reconcile=true.",
	);
}

async function materializeProjectSources(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	runArchiveService: RunArchiveService;
	materializeProjectSources: (request: HistoryProjectSourcesMaterializeInput) => Promise<{
		projectFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const provider = input.request.provider;
	const projectId = input.request.projectId;
	if (!provider || !projectId) {
		throw new HistoryMaterializationError(
			"Project source materialization requires provider and projectId.",
		);
	}
	const maxItems = normalizeMaxItems(input.request.maxItems);
	const materialized = await input.materializeProjectSources({
		provider,
		runtimeProfile: input.request.runtimeProfile ?? null,
		browserProfile: input.request.browserProfile ?? null,
		boundIdentityKey: input.request.boundIdentityKey ?? null,
		projectId,
		jobId: input.jobId,
		maxItems,
	});
	const manifestEntries = await readFileManifestEntries(materialized.manifestPath);
	const entries = await Promise.all(
		manifestEntries.map((entry) => historyEntryFromFileManifest(entry)),
	);
	const archiveAssets: RunArchiveHistoryMaterializationAsset[] = [];
	for (const file of materialized.files) {
		const manifestEntry = findFileManifestForFile(manifestEntries, file);
		archiveAssets.push({
			kind: "file",
			file,
			artifactId: manifestEntry?.fileId ?? file.id,
			title: manifestEntry?.fileName ?? file.name,
			manifestPath: materialized.manifestPath,
			materializationMethod:
				manifestEntry?.materializationMethod ??
				readRecordString(file.metadata, ["materialization", "materializationSource"]) ??
				"project-source",
		});
	}
	if (archiveAssets.length > 0 && !input.runArchiveService.upsertHistoryMaterializationItems) {
		throw new Error("History materialization archive upsert is not configured.");
	}
	const archiveTarget = projectSourcesTargetFromRequest(input.request);
	const archiveItems =
		archiveAssets.length > 0
			? ((
					await input.runArchiveService.upsertHistoryMaterializationItems?.({
						provider,
						runtimeProfile: input.request.runtimeProfile ?? null,
						browserProfile: input.request.browserProfile ?? null,
						projectId,
						boundIdentityKey: input.request.boundIdentityKey ?? null,
						providerConversationId: archiveTarget.conversationId,
						providerConversationUrl: archiveTarget.providerConversationUrl,
						materializationJobId: input.jobId,
						assets: archiveAssets,
					})
				)?.items ?? [])
			: [];
	applyArchiveLinks(entries, archiveItems);
	const generatedAt = input.now().toISOString();
	const metrics = summarizeEntries(entries, 1);
	return {
		object: "history_materialization_result",
		generatedAt,
		status: metrics.materialized > 0 ? "materialized" : "skipped",
		target: archiveTarget,
		source: sourceFromCreateRequest(input.request),
		manifestPaths: materialized.manifestPath ? [materialized.manifestPath] : [],
		entries,
		archiveItems,
		metrics,
		phases: {
			snapshotRefresh: null,
			materialization: {
				status: metrics.materialized > 0 ? "materialized" : "skipped",
				generatedAt,
				manifestPaths: materialized.manifestPath ? [materialized.manifestPath] : [],
				entries: entries.length,
				archiveItems: archiveItems.length,
				metrics,
			},
		},
		message:
			metrics.materialized > 0
				? `Project source materialization downloaded ${metrics.materialized} file${metrics.materialized === 1 ? "" : "s"} for project ${projectId}.`
				: `Project source materialization found no downloadable files for project ${projectId}.`,
	};
}

async function materializeAccountLibraryReconciliation(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	materializeAccountLibraryFiles: (request: HistoryAccountLibraryMaterializeInput) => Promise<{
		accountFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	listAccountLibraryFiles: (request: HistoryAccountLibraryListInput) => Promise<FileRef[]>;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const preview = await buildAccountLibraryReconciliationPreview(input);
	const results: HistoryMaterializationResult[] = [];
	for (const candidate of preview.selectedCandidates) {
		const result = await materializeAccountLibraryCatalogItem({
			detail: {
				object: "account_mirror_catalog_item",
				generatedAt: input.now().toISOString(),
				provider: candidate.entry.provider,
				tenantKey: candidate.entry.tenantKey,
				bindingKey: candidate.entry.bindingKey,
				runtimeProfileId: candidate.entry.runtimeProfileId,
				browserProfileId: candidate.entry.browserProfileId,
				boundIdentityKey: candidate.entry.boundIdentityKey,
				status: candidate.entry.status,
				reason: candidate.entry.reason,
				kind: "files",
				itemId: readCatalogItemId(candidate.item) ?? candidate.file.id,
				item: candidate.item,
			},
			file: candidate.file,
			request: input.request,
			jobId: input.jobId,
			runArchiveService: input.runArchiveService,
			materializeAccountLibraryFiles: input.materializeAccountLibraryFiles,
			now: input.now,
		});
		if (result) results.push(result);
	}
	const generatedAt = input.now().toISOString();
	const entries = results.flatMap((result) => result.entries);
	const archiveItems = results.flatMap((result) => result.archiveItems);
	const manifestPaths = Array.from(new Set(results.flatMap((result) => result.manifestPaths)));
	const metrics = summarizeEntries(entries, 0);
	return {
		object: "history_materialization_result",
		generatedAt,
		status: metrics.materialized > 0 ? "materialized" : "skipped",
		target: null,
		source: sourceFromCreateRequest(input.request),
		manifestPaths,
		entries,
		archiveItems,
		metrics,
		phases: {
			snapshotRefresh: null,
			materialization: {
				status: metrics.materialized > 0 ? "materialized" : "skipped",
				generatedAt,
				manifestPaths,
				entries: entries.length,
				archiveItems: archiveItems.length,
				metrics,
			},
		},
		message:
			metrics.materialized > 0
				? `Account-library reconciliation materialized ${metrics.materialized} file${metrics.materialized === 1 ? "" : "s"} from ${results.length} candidate${results.length === 1 ? "" : "s"}.`
				: "Account-library reconciliation did not find downloadable files to materialize.",
	};
}

async function buildAccountLibraryReconciliationPreview(input: {
	request: HistoryMaterializationCreateRequest;
	jobId?: string | null;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	listAccountLibraryFiles: (request: HistoryAccountLibraryListInput) => Promise<FileRef[]>;
	now: () => Date;
}): Promise<
	HistoryAccountLibraryReconciliationPreviewResult & {
		candidates: AccountLibraryReconciliationCandidate[];
		selectedCandidates: AccountLibraryReconciliationCandidate[];
	}
> {
	if (input.request.provider !== "chatgpt") {
		throw new HistoryMaterializationError(
			"Account-library reconciliation currently supports provider=chatgpt only.",
		);
	}
	const selectedKinds = normalizeAssetKinds(input.request.assetKinds);
	if (selectedKinds.some((kind) => kind !== "files") || !selectedKinds.includes("files")) {
		throw new HistoryMaterializationError(
			"Account-library reconciliation currently supports assetKinds=[files] only.",
		);
	}
	const maxItems = normalizeMaxItems(input.request.maxItems) ?? 1;
	if (maxItems <= 0) {
		throw new HistoryMaterializationError(
			"Account-library reconciliation requires maxItems greater than 0.",
		);
	}
	const catalog = await input.catalogService.readCatalog({
		provider: input.request.provider,
		runtimeProfileId: input.request.runtimeProfile ?? null,
		kind: "files",
		limit: Math.max(50, maxItems * 20),
	});
	const archivedSignatures =
		input.request.force === true
			? new Set<string>()
			: new Set(
					await materializedAccountLibraryFileFamilySignatures({
						runArchiveService: input.runArchiveService,
						request: input.request,
					}),
				);
	const selectedSignatures = new Set<string>();
	const candidates: AccountLibraryReconciliationCandidate[] = [];
	const currentAccountFilesByScope = new Map<string, FileRef[]>();
	const metrics = {
		catalogFiles: 0,
		eligibleCandidates: 0,
		selectedCandidates: 0,
		archivedFamilies: 0,
		unresolvedStale: 0,
		unsupportedOrTerminal: 0,
		duplicateFamilies: 0,
	};
	let sequence = 0;
	for (const entry of catalog.entries) {
		if (input.request.boundIdentityKey && entry.boundIdentityKey !== input.request.boundIdentityKey)
			continue;
		for (const item of entry.manifests.files) {
			metrics.catalogFiles += 1;
			if (entry.status === "blocked") {
				metrics.unsupportedOrTerminal += 1;
				continue;
			}
			const catalogFile = accountLibraryFileRefFromCatalogEntry(entry, item);
			if (!catalogFile) {
				metrics.unsupportedOrTerminal += 1;
				continue;
			}
			const file = await resolveBroadAccountLibraryFile({
				catalogFile,
				entry,
				request: input.request,
				jobId: input.jobId ?? null,
				currentAccountFilesByScope,
				listAccountLibraryFiles: input.listAccountLibraryFiles,
			});
			if (!file) {
				metrics.unresolvedStale += 1;
				continue;
			}
			const signature = accountLibraryFileFamilySignature(file);
			if (signature && archivedSignatures.has(signature)) {
				metrics.archivedFamilies += 1;
				continue;
			}
			if (signature && selectedSignatures.has(signature)) {
				metrics.duplicateFamilies += 1;
				continue;
			}
			if (signature) selectedSignatures.add(signature);
			candidates.push({ entry, item, file, signature, sequence });
			metrics.eligibleCandidates += 1;
			sequence += 1;
		}
	}
	const selectedCandidates = candidates.slice(0, maxItems);
	metrics.selectedCandidates = selectedCandidates.length;
	return {
		object: "history_account_library_reconciliation_preview",
		generatedAt: input.now().toISOString(),
		provider: input.request.provider ?? null,
		runtimeProfile: input.request.runtimeProfile ?? null,
		maxItems,
		metrics,
		candidates,
		selectedCandidates,
	};
}

type AccountLibraryReconciliationCandidate = {
	entry: AccountMirrorCatalogEntry;
	item: unknown;
	file: FileRef;
	signature: string | null;
	sequence: number;
};

async function materializeAccountLibraryCatalogItem(input: {
	detail: AccountMirrorCatalogItemResult;
	file?: FileRef | null;
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	runArchiveService: RunArchiveService;
	materializeAccountLibraryFiles: (request: HistoryAccountLibraryMaterializeInput) => Promise<{
		accountFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	now: () => Date;
}): Promise<HistoryMaterializationResult | null> {
	const file = input.file ?? accountLibraryFileRefFromCatalogItem(input.detail);
	if (!file) return null;
	const provider = normalizeProviderId(input.detail.provider);
	if (!provider) return null;
	if (provider !== "chatgpt") return null;
	const fetch = await input.materializeAccountLibraryFiles({
		provider,
		runtimeProfile: input.detail.runtimeProfileId,
		browserProfile: input.detail.browserProfileId,
		boundIdentityKey: input.detail.boundIdentityKey,
		catalogItemId: input.detail.itemId,
		file,
		jobId: input.jobId,
	});
	const manifestPaths = fetch.manifestPath ? [fetch.manifestPath] : [];
	const manifestEntries = await readFileManifestEntries(fetch.manifestPath);
	const entries = await Promise.all(
		manifestEntries.map((entry) => historyEntryFromFileManifest(entry)),
	);
	const archiveAssets: RunArchiveHistoryMaterializationAsset[] = [];
	for (const materializedFile of fetch.files) {
		const manifestEntry = findFileManifestForFile(manifestEntries, materializedFile);
		archiveAssets.push({
			kind: "file",
			file: materializedFile,
			artifactId: manifestEntry?.fileId ?? materializedFile.id,
			title: manifestEntry?.fileName ?? materializedFile.name,
			manifestPath: fetch.manifestPath,
			materializationMethod:
				manifestEntry?.materializationMethod ??
				readRecordString(materializedFile.metadata, ["materialization", "materializationSource"]),
		});
	}
	if (archiveAssets.length > 0 && !input.runArchiveService.upsertHistoryMaterializationItems) {
		throw new Error("History materialization archive upsert is not configured.");
	}
	const archiveItems =
		archiveAssets.length > 0
			? ((
					await input.runArchiveService.upsertHistoryMaterializationItems?.({
						provider,
						runtimeProfile: input.detail.runtimeProfileId,
						browserProfile: input.detail.browserProfileId,
						projectId: null,
						boundIdentityKey: input.detail.boundIdentityKey,
						providerConversationId: "account-library",
						providerConversationUrl: "https://chatgpt.com/library",
						materializationJobId: input.jobId,
						assets: archiveAssets,
					})
				)?.items ?? [])
			: [];
	applyArchiveLinks(entries, archiveItems);
	const generatedAt = input.now().toISOString();
	const metrics = summarizeEntries(entries, 0);
	return {
		object: "history_materialization_result",
		generatedAt,
		status: metrics.materialized > 0 ? "materialized" : "skipped",
		target: null,
		source: sourceFromCreateRequest(input.request),
		manifestPaths,
		entries,
		archiveItems,
		metrics,
		message:
			metrics.materialized > 0
				? `Account-library materialization downloaded ${metrics.materialized} asset${metrics.materialized === 1 ? "" : "s"} for catalog item ${input.detail.itemId}.`
				: `Account-library materialization found no downloadable assets for catalog item ${input.detail.itemId}.`,
	};
}

async function materializeAccountLibraryFilesTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryAccountLibraryMaterializeInput;
}): Promise<{ accountFiles: FileRef[]; files: FileRef[]; manifestPath: string | null }> {
	const llmService = createLlmService(
		input.request.provider,
		withRuntimeProfileSelection(
			input.config,
			input.request.provider,
			input.request.runtimeProfile,
		) as ResolvedUserConfig,
		{
			browserProcessOwner: createHistoryMaterializationBrowserProcessOwner({
				request: {
					provider: input.request.provider,
					runtimeProfile: input.request.runtimeProfile,
					browserProfile: input.request.browserProfile,
					boundIdentityKey: input.request.boundIdentityKey,
					catalogItemId: input.request.catalogItemId,
					assetSource: "account-library",
					assetKinds: ["files"],
				},
				jobId: input.request.jobId,
				provider: input.request.provider,
				runtimeProfile: input.request.runtimeProfile,
				browserProfile: input.request.browserProfile,
				reason: "account-library-file-materialization",
			}),
		},
	);
	const listOptions: HistoryMaterializationProviderListOptions = {
		configuredUrl: "https://chatgpt.com/library",
		tabUrl: "https://chatgpt.com/library",
		allowNavigation: true,
		expectedUserIdentity: resolveHistoryMaterializationExpectedIdentity({
			provider: input.request.provider,
			runtimeProfile: input.request.runtimeProfile,
			browserProfile: input.request.browserProfile,
			boundIdentityKey: input.request.boundIdentityKey,
			conversationId: "account-library",
			providerConversationUrl: "https://chatgpt.com/library",
			projectId: null,
		}),
		skipFeatureSignature: true,
	};
	const file = await resolveAccountLibraryFileForMaterialization(
		llmService,
		input.request.file,
		listOptions,
	);
	return llmService.materializeAccountFiles({
		listOptions,
		files: [file],
		maxItems: 1,
	});
}

async function materializeProjectSourcesTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryProjectSourcesMaterializeInput;
}): Promise<{ projectFiles: FileRef[]; files: FileRef[]; manifestPath: string | null }> {
	const llmService = createLlmService(
		input.request.provider,
		withRuntimeProfileSelection(
			input.config,
			input.request.provider,
			input.request.runtimeProfile,
		) as ResolvedUserConfig,
		{
			browserProcessOwner: createHistoryMaterializationBrowserProcessOwner({
				request: {
					provider: input.request.provider,
					runtimeProfile: input.request.runtimeProfile,
					browserProfile: input.request.browserProfile,
					boundIdentityKey: input.request.boundIdentityKey,
					projectId: input.request.projectId,
					assetKinds: ["files"],
				},
				jobId: input.request.jobId,
				provider: input.request.provider,
				runtimeProfile: input.request.runtimeProfile,
				browserProfile: input.request.browserProfile,
				reason: "project-source-materialization",
			}),
		},
	);
	const projectUrl = resolveProviderProjectUrl(input.request.provider, input.request.projectId);
	const listOptions: HistoryMaterializationProviderListOptions = {
		...(projectUrl ? { configuredUrl: projectUrl, tabUrl: projectUrl } : {}),
		projectId: input.request.projectId,
		allowNavigation: true,
		expectedUserIdentity: resolveHistoryMaterializationExpectedIdentity({
			provider: input.request.provider,
			runtimeProfile: input.request.runtimeProfile,
			browserProfile: input.request.browserProfile,
			boundIdentityKey: input.request.boundIdentityKey,
			conversationId: `project:${input.request.projectId}`,
			providerConversationUrl: projectUrl,
			projectId: input.request.projectId,
		}),
		skipFeatureSignature: true,
	};
	return llmService.materializeProjectFiles(input.request.projectId, {
		listOptions,
		maxItems: input.request.maxItems,
	});
}

async function listAccountLibraryFilesTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryAccountLibraryListInput;
}): Promise<FileRef[]> {
	const llmService = createLlmService(
		input.request.provider,
		withRuntimeProfileSelection(
			input.config,
			input.request.provider,
			input.request.runtimeProfile,
		) as ResolvedUserConfig,
		{
			browserProcessOwner: createHistoryMaterializationBrowserProcessOwner({
				request: {
					provider: input.request.provider,
					runtimeProfile: input.request.runtimeProfile,
					browserProfile: input.request.browserProfile,
					boundIdentityKey: input.request.boundIdentityKey,
					reconcile: true,
					assetSource: "account-library",
					assetKinds: ["files"],
				},
				jobId: input.request.jobId ?? null,
				provider: input.request.provider,
				runtimeProfile: input.request.runtimeProfile,
				browserProfile: input.request.browserProfile,
				reason: "account-library-inventory-list",
			}),
		},
	);
	const listOptions: HistoryMaterializationProviderListOptions = {
		configuredUrl: "https://chatgpt.com/library",
		tabUrl: "https://chatgpt.com/library",
		allowNavigation: true,
		expectedUserIdentity: resolveHistoryMaterializationExpectedIdentity({
			provider: input.request.provider,
			runtimeProfile: input.request.runtimeProfile,
			browserProfile: input.request.browserProfile,
			boundIdentityKey: input.request.boundIdentityKey,
			conversationId: "account-library",
			providerConversationUrl: "https://chatgpt.com/library",
			projectId: null,
		}),
		skipFeatureSignature: true,
	};
	return llmService.listAccountFiles({ listOptions });
}

async function resolveBroadAccountLibraryFile(input: {
	catalogFile: FileRef;
	entry: AccountMirrorCatalogEntry;
	request: HistoryMaterializationCreateRequest;
	jobId?: string | null;
	currentAccountFilesByScope: Map<string, FileRef[]>;
	listAccountLibraryFiles: (request: HistoryAccountLibraryListInput) => Promise<FileRef[]>;
}): Promise<FileRef | null> {
	if (isRouteableChatgptAccountLibraryFile(input.catalogFile)) return input.catalogFile;
	const provider = normalizeProviderId(input.entry.provider);
	if (provider !== "chatgpt") return null;
	const scope = accountLibraryInventoryScopeKey({
		provider,
		runtimeProfile: input.entry.runtimeProfileId,
		browserProfile: input.entry.browserProfileId,
		boundIdentityKey: input.entry.boundIdentityKey,
		jobId: input.jobId ?? null,
	});
	let currentAccountFiles = input.currentAccountFilesByScope.get(scope);
	if (!currentAccountFiles) {
		currentAccountFiles = await input.listAccountLibraryFiles({
			provider,
			runtimeProfile: input.entry.runtimeProfileId,
			browserProfile: input.entry.browserProfileId,
			boundIdentityKey: input.entry.boundIdentityKey,
		});
		input.currentAccountFilesByScope.set(scope, currentAccountFiles);
	}
	const match = findAccountLibraryFileInventoryMatch(input.catalogFile, currentAccountFiles);
	if (!match) return null;
	return {
		...match,
		metadata: {
			...(isRecord(match.metadata) ? match.metadata : {}),
			accountLibraryCatalogItemId: readRecordString(input.catalogFile.metadata, [
				"accountLibraryCatalogItemId",
			]),
			accountLibraryCatalogFileId: input.catalogFile.id,
		},
	};
}

function accountLibraryInventoryScopeKey(input: HistoryAccountLibraryListInput): string {
	return stableKey({
		provider: input.provider,
		runtimeProfile: input.runtimeProfile,
		browserProfile: input.browserProfile,
		boundIdentityKey: input.boundIdentityKey,
	});
}

async function resolveAccountLibraryFileForMaterialization(
	llmService: ReturnType<typeof createLlmService>,
	catalogFile: FileRef,
	listOptions: HistoryMaterializationProviderListOptions,
): Promise<FileRef> {
	if (isRouteableChatgptAccountLibraryFile(catalogFile)) return catalogFile;
	const accountFiles = await llmService.listAccountFiles({ listOptions });
	const match = findAccountLibraryFileInventoryMatch(catalogFile, accountFiles);
	if (!match) {
		throw new Error(
			`Account-library catalog item ${catalogFile.id} does not have a current ChatGPT provider file id in the account-file inventory.`,
		);
	}
	return {
		...match,
		metadata: {
			...(isRecord(match.metadata) ? match.metadata : {}),
			accountLibraryCatalogItemId: readRecordString(catalogFile.metadata, [
				"accountLibraryCatalogItemId",
			]),
			accountLibraryCatalogFileId: catalogFile.id,
		},
	};
}

function isRouteableChatgptAccountLibraryFile(file: FileRef): boolean {
	const metadata = isRecord(file.metadata) ? file.metadata : {};
	const providerFileId = readRecordString(metadata, ["providerFileId"]);
	return Boolean(
		providerFileId ||
			(typeof file.remoteUrl === "string" && file.remoteUrl.startsWith("chatgpt://file/")),
	);
}

function findAccountLibraryFileInventoryMatch(
	catalogFile: FileRef,
	accountFiles: readonly FileRef[],
): FileRef | null {
	const catalogMetadata = isRecord(catalogFile.metadata) ? catalogFile.metadata : {};
	const catalogId = normalizeAccountLibraryMatchText(catalogFile.id);
	const catalogName = normalizeAccountLibraryMatchText(catalogFile.name);
	const catalogIdentity = normalizeAccountLibraryMatchText(
		readRecordString(catalogMetadata, ["libraryIdentity"]) ?? "",
	);
	let best: { file: FileRef; score: number } | null = null;
	for (const accountFile of accountFiles) {
		const metadata = isRecord(accountFile.metadata) ? accountFile.metadata : {};
		if (readRecordString(metadata, ["source"]) !== "chatgpt-library") continue;
		if (!isRouteableChatgptAccountLibraryFile(accountFile)) continue;
		const candidateId = normalizeAccountLibraryMatchText(accountFile.id);
		const candidateName = normalizeAccountLibraryMatchText(accountFile.name);
		const candidateIdentity = normalizeAccountLibraryMatchText(
			readRecordString(metadata, ["libraryIdentity"]) ?? "",
		);
		const score = scoreAccountLibraryFileMatch({
			catalogId,
			catalogName,
			catalogIdentity,
			candidateId,
			candidateName,
			candidateIdentity,
		});
		if (score > (best?.score ?? 0)) {
			best = { file: accountFile, score };
		}
	}
	return best && best.score >= 80 ? best.file : null;
}

function scoreAccountLibraryFileMatch(input: {
	catalogId: string;
	catalogName: string;
	catalogIdentity: string;
	candidateId: string;
	candidateName: string;
	candidateIdentity: string;
}): number {
	if (input.catalogId && input.catalogId === input.candidateId) return 120;
	if (input.catalogIdentity && input.catalogIdentity === input.candidateIdentity) return 115;
	if (input.catalogName && input.catalogName === input.candidateName) return 110;
	if (
		input.catalogIdentity &&
		input.candidateName &&
		(input.candidateName.startsWith(input.catalogIdentity) ||
			input.catalogIdentity.startsWith(input.candidateName))
	) {
		return 100;
	}
	if (
		input.catalogName &&
		input.candidateName &&
		(input.candidateName.startsWith(input.catalogName) ||
			input.catalogName.startsWith(input.candidateName))
	) {
		return 95;
	}
	return 0;
}

function normalizeAccountLibraryMatchText(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/todaytoday[\d.,]+\s*(b|kb|mb|gb)$/i, "")
		.trim();
}

async function materializeMediaArchiveItem(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	materializeMediaGeneration: (
		request: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	now: () => Date;
	archiveItem: RunArchiveItem;
}): Promise<HistoryMaterializationResult | null> {
	if (!archiveItemLooksLikeMediaGeneration(input.archiveItem, input.request)) return null;
	const provider = input.request.provider ?? normalizeProviderId(input.archiveItem.provider);
	const catalog = await input.catalogService.readCatalog({
		provider,
		runtimeProfileId: input.request.runtimeProfile ?? input.archiveItem.runtimeProfile,
		kind: "all",
		limit: 50,
	});
	const [candidate] = await buildMediaGenerationReconciliationCandidates(
		input.runArchiveService,
		[input.archiveItem],
		input.request,
	);
	if (!candidate) {
		return skippedResult({
			now: input.now,
			source: sourceFromCreateRequest(input.request),
			target: null,
			message: `Run archive item ${input.archiveItem.id} does not have media-generation evidence for history materialization.`,
		});
	}
	const unsupportedReason = unsupportedMediaReconciliationReason(candidate);
	if (unsupportedReason) {
		return skippedMediaGenerationResult({
			now: input.now,
			source: sourceFromCreateRequest(input.request),
			candidate,
			reason: unsupportedReason,
		});
	}
	const matchResult = matchMediaCandidateToConversation(
		candidate,
		buildCatalogConversationCandidates(catalog, input.request),
	);
	if (!matchResult.matched) {
		return skippedMediaGenerationResult({
			now: input.now,
			source: sourceFromCreateRequest(input.request),
			candidate,
			reason: matchResult.reason,
		});
	}
	try {
		return await materializeMatchedMediaGeneration({
			request: input.request,
			jobId: input.jobId,
			runArchiveService: input.runArchiveService,
			materializeMediaGeneration: input.materializeMediaGeneration,
			candidate,
			match: matchResult.match,
			now: input.now,
		});
	} catch (error) {
		if (isProviderAuthPreflightError(error) || isProviderHumanVerificationError(error)) {
			throw error;
		}
		return failedMediaGenerationResult({
			now: input.now,
			source: sourceFromCreateRequest(input.request),
			target: matchResult.match.target,
			candidate,
			error,
		});
	}
}

async function materializeReconciliation(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	materializeConversation: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationResult>;
	refreshConversationSnapshot: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationSnapshotRefresh>;
	recordConversationEvidence: (
		target: HistoryMaterializationTarget,
		evidence: AccountMirrorConversationEvidence,
	) => Promise<void>;
	materializeMediaGeneration: (
		request: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	jobStore: HistoryMaterializationJobStore;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const maxTargets = normalizeMaxItems(input.request.maxItems) ?? 10;
	const selectedKinds = normalizeAssetKinds(input.request.assetKinds);
	const selectedConversationIds = normalizeConversationIds(input.request.conversationIds);
	const catalogLimit = selectedKinds.includes("media")
		? Math.max(50, maxTargets * 20)
		: Math.max(500, maxTargets * 20);
	const catalog = await input.catalogService.readCatalog({
		provider: input.request.provider ?? null,
		runtimeProfileId: input.request.runtimeProfile ?? null,
		kind: "all",
		limit: catalogLimit,
	});
	const results: HistoryMaterializationResult[] = [];
	let consumedTargetBudget = 0;
	let remainingAssetBudget = maxTargets;
	const selectedConversationIdSet = new Set(selectedConversationIds);
	const selectedCatalogTargets = new Map<string, HistoryMaterializationTarget>();
	if (selectedConversationIdSet.size > 0) {
		for (const entry of catalog.entries) {
			if (
				input.request.boundIdentityKey &&
				entry.boundIdentityKey !== input.request.boundIdentityKey
			)
				continue;
			for (const item of entry.manifests.conversations) {
				const conversationId = readCatalogStringField(item, ["id", "conversationId"]);
				if (
					!conversationId ||
					!selectedConversationIdSet.has(conversationId) ||
					selectedCatalogTargets.has(conversationId)
				) {
					continue;
				}
				const target = targetFromCatalogConversation(entry, item, conversationId);
				if (target) selectedCatalogTargets.set(conversationId, target);
			}
		}
	}
	if (
		selectedConversationIds.length > 0 &&
		input.request.provider &&
		(selectedKinds.includes("artifacts") ||
			selectedKinds.includes("files") ||
			selectedKinds.includes("media"))
	) {
		for (const conversationId of selectedConversationIds) {
			if (consumedTargetBudget >= maxTargets) break;
			const target = selectedCatalogTargets.get(conversationId) ?? {
				provider: input.request.provider,
				runtimeProfile: input.request.runtimeProfile ?? null,
				browserProfile: input.request.browserProfile ?? null,
				boundIdentityKey: input.request.boundIdentityKey ?? null,
				conversationId,
				providerConversationUrl: resolveProviderConversationUrl(
					input.request.provider,
					conversationId,
				),
				projectId: input.request.projectId ?? null,
			};
			const result = await reconcileConversationTarget({
				target,
				request: input.request,
				jobId: input.jobId,
				materializeConversation: input.materializeConversation,
				refreshConversationSnapshot: input.refreshConversationSnapshot,
				recordConversationEvidence: input.recordConversationEvidence,
				now: input.now,
			});
			results.push(result);
			if (consumesReconciliationTargetBudget(result)) {
				consumedTargetBudget += 1;
			}
		}
	} else if (
		selectedKinds.includes("artifacts") ||
		selectedKinds.includes("files") ||
		selectedKinds.includes("media")
	) {
		const candidates: Array<{
			target: HistoryMaterializationTarget;
			assetFamilySignatures: string[];
			priority: number;
			sequence: number;
		}> = [];
		const attemptedAssetFamilySignatures = new Set<string>();
		if (input.request.force !== true) {
			const archiveSignatures = await materializedArchiveAssetFamilySignatures({
				runArchiveService: input.runArchiveService,
				request: input.request,
				selectedKinds,
			});
			for (const signature of archiveSignatures) {
				attemptedAssetFamilySignatures.add(signature);
			}
			const terminalVolatileSignatures = await terminalVolatileAssetFamilySignatures({
				jobStore: input.jobStore,
				request: input.request,
				selectedKinds,
			});
			for (const signature of terminalVolatileSignatures) {
				attemptedAssetFamilySignatures.add(signature);
			}
			for (const entry of catalog.entries) {
				if (
					input.request.boundIdentityKey &&
					entry.boundIdentityKey !== input.request.boundIdentityKey
				)
					continue;
				for (const item of entry.manifests.conversations) {
					const conversationId = readCatalogStringField(item, ["id", "conversationId"]);
					if (!conversationId || !catalogConversationHasCompleteSelectedAssets(item)) continue;
					for (const signature of catalogConversationAssetFamilySignatures(
						entry.manifests,
						conversationId,
						selectedKinds,
						entry.provider,
					)) {
						attemptedAssetFamilySignatures.add(signature);
					}
				}
			}
		}
		let sequence = 0;
		for (const entry of catalog.entries) {
			if (
				input.request.boundIdentityKey &&
				entry.boundIdentityKey !== input.request.boundIdentityKey
			)
				continue;
			for (const item of entry.manifests.conversations) {
				const conversationId = readCatalogStringField(item, ["id", "conversationId"]);
				if (!conversationId) continue;
				const assetFamilySignatures = catalogConversationAssetFamilySignatures(
					entry.manifests,
					conversationId,
					selectedKinds,
					entry.provider,
				);
				const priority = catalogConversationMaterializationPriority(
					item,
					selectedKinds,
					{
						provider: entry.provider,
						conversationId,
						manifests: entry.manifests,
					},
					{
						force: input.request.force === true,
						refreshSnapshot: input.request.refreshSnapshot === true,
					},
				);
				if (priority === null) continue;
				const target = targetFromCatalogConversation(entry, item, conversationId);
				if (!target) continue;
				candidates.push({
					target,
					assetFamilySignatures,
					priority,
					sequence,
				});
				sequence += 1;
			}
		}
		candidates.sort(
			(left, right) => left.priority - right.priority || left.sequence - right.sequence,
		);
		for (const candidate of candidates) {
			if (consumedTargetBudget >= maxTargets) break;
			if (remainingAssetBudget <= 0) break;
			if (
				candidate.assetFamilySignatures.length > 0 &&
				candidate.assetFamilySignatures.every((signature) =>
					attemptedAssetFamilySignatures.has(signature),
				)
			) {
				continue;
			}
			for (const signature of candidate.assetFamilySignatures) {
				attemptedAssetFamilySignatures.add(signature);
			}
			const result = await reconcileConversationTarget({
				target: candidate.target,
				request: {
					...input.request,
					maxItems: remainingAssetBudget,
				},
				jobId: input.jobId,
				materializeConversation: input.materializeConversation,
				refreshConversationSnapshot: input.refreshConversationSnapshot,
				recordConversationEvidence: input.recordConversationEvidence,
				now: input.now,
			});
			results.push(result);
			remainingAssetBudget =
				decrementRemaining(remainingAssetBudget, countAttemptedReconciliationAssetBudget(result)) ??
				0;
			if (consumesReconciliationTargetBudget(result)) {
				consumedTargetBudget += 1;
			}
		}
	}
	if (
		selectedKinds.includes("media") &&
		consumedTargetBudget < maxTargets &&
		selectedConversationIds.length === 0
	) {
		results.push(
			...(await materializeMediaGenerationReconciliation({
				...input,
				catalog,
				maxTargets: maxTargets - consumedTargetBudget,
			})),
		);
	}
	const generatedAt = input.now().toISOString();
	const entries = results.flatMap((result) => result.entries);
	const archiveItems = results.flatMap((result) => result.archiveItems);
	const manifestPaths = Array.from(new Set(results.flatMap((result) => result.manifestPaths)));
	const snapshotRefreshes = results.flatMap((result) => snapshotRefreshesFromResult(result));
	const metrics = summarizeEntries(entries, results.length);
	return {
		object: "history_materialization_result",
		generatedAt,
		status: metrics.materialized > 0 ? "materialized" : "skipped",
		target: null,
		source: sourceFromCreateRequest(input.request),
		manifestPaths,
		entries,
		archiveItems,
		snapshotRefreshes,
		metrics,
		phases: {
			snapshotRefresh: snapshotRefreshes.length === 1 ? snapshotRefreshes[0] : null,
			materialization: {
				status: metrics.materialized > 0 ? "materialized" : "skipped",
				generatedAt,
				manifestPaths,
				entries: entries.length,
				archiveItems: archiveItems.length,
				metrics,
			},
		},
		message:
			metrics.materialized > 0
				? `History reconciliation materialized ${metrics.materialized} asset${metrics.materialized === 1 ? "" : "s"} from ${results.length} conversation${results.length === 1 ? "" : "s"}.`
				: "History reconciliation did not find downloadable assets to materialize.",
	};
}

function targetFromCatalogConversation(
	entry: AccountMirrorCatalogEntry,
	item: unknown,
	conversationId: string,
): HistoryMaterializationTarget | null {
	const rawProviderConversationUrl = readCatalogStringField(item, [
		"url",
		"href",
		"providerConversationUrl",
	]);
	const targetFields = normalizeProviderConversationTargetFields(
		entry.provider,
		conversationId,
		rawProviderConversationUrl,
	);
	if (!targetFields) return null;
	const normalizedConversationId = targetFields.conversationId;
	return {
		provider: entry.provider,
		runtimeProfile: entry.runtimeProfileId,
		browserProfile: entry.browserProfileId,
		boundIdentityKey: entry.boundIdentityKey,
		conversationId: normalizedConversationId,
		providerConversationUrl:
			targetFields.providerConversationUrl ??
			resolveProviderConversationUrl(entry.provider, normalizedConversationId),
		projectId: readCatalogStringField(item, ["projectId"]),
	};
}

async function materializeMediaGenerationTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryMediaGenerationMaterializeInput;
}): Promise<MediaGenerationResponse> {
	const mediaService = createMediaGenerationService({
		materializer: createBrowserMediaGenerationMaterializer(
			withRuntimeProfileSelection(
				input.config,
				input.request.provider,
				input.request.runtimeProfile,
			) as ResolvedUserConfig,
		),
		runtimeProfile: input.request.runtimeProfile,
		refreshArchiveIndex: false,
	});
	if (!mediaService.materializeGeneration) {
		throw new Error("Media generation materialization is not configured.");
	}
	return mediaService.materializeGeneration(input.request.mediaGenerationId, {
		count: input.request.count,
		source: "api",
		metadata: {
			...(input.request.metadata ?? {}),
			conversationId: input.request.conversationId,
			providerConversationId: input.request.conversationId,
			providerConversationUrl: input.request.providerConversationUrl,
			conversationUrl: input.request.providerConversationUrl,
			projectId: input.request.projectId,
			boundIdentityKey: input.request.boundIdentityKey,
			historyMaterializationJobId: input.request.jobId,
			historyMatchBasis: input.request.matchBasis,
		},
	});
}

async function materializeMediaGenerationReconciliation(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	catalog: Awaited<ReturnType<AccountMirrorCatalogService["readCatalog"]>>;
	runArchiveService: RunArchiveService;
	materializeMediaGeneration: (
		request: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	maxTargets: number;
	now: () => Date;
}): Promise<HistoryMaterializationResult[]> {
	const archive = await input.runArchiveService.listItems({
		kind: "generated_artifact",
		provider: input.request.provider ?? null,
		runtimeProfile: null,
		assetAvailability: "unavailable",
		limit: Math.max(1, input.maxTargets * 10),
	});
	const candidates = await buildMediaGenerationReconciliationCandidates(
		input.runArchiveService,
		archive.items,
		input.request,
	);
	const conversations = buildCatalogConversationCandidates(input.catalog, input.request);
	const results: HistoryMaterializationResult[] = [];
	let consumedTargetBudget = 0;
	for (const candidate of candidates) {
		if (consumedTargetBudget >= input.maxTargets) break;
		const unsupportedReason = unsupportedMediaReconciliationReason(candidate);
		if (unsupportedReason) {
			const result = skippedMediaGenerationResult({
				now: input.now,
				source: sourceFromCreateRequest(input.request),
				candidate,
				reason: unsupportedReason,
			});
			results.push(result);
			if (consumesReconciliationTargetBudget(result)) {
				consumedTargetBudget += 1;
			}
			continue;
		}
		const matchResult = matchMediaCandidateToConversation(candidate, conversations);
		if (!matchResult.matched) {
			const result = skippedMediaGenerationResult({
				now: input.now,
				source: sourceFromCreateRequest(input.request),
				candidate,
				reason: matchResult.reason,
			});
			results.push(result);
			if (consumesReconciliationTargetBudget(result)) {
				consumedTargetBudget += 1;
			}
			continue;
		}
		try {
			const result = await materializeMatchedMediaGeneration({
				...input,
				candidate,
				match: matchResult.match,
			});
			results.push(result);
			if (consumesReconciliationTargetBudget(result)) {
				consumedTargetBudget += 1;
			}
		} catch (error) {
			if (isProviderAuthPreflightError(error) || isProviderHumanVerificationError(error)) {
				throw error;
			}
			const result = failedMediaGenerationResult({
				now: input.now,
				source: sourceFromCreateRequest(input.request),
				target: matchResult.match.target,
				candidate,
				error,
			});
			results.push(result);
			if (consumesReconciliationTargetBudget(result)) {
				consumedTargetBudget += 1;
			}
		}
	}
	return results;
}

type MediaGenerationReconciliationCandidate = {
	mediaGenerationId: string;
	provider: ProviderId;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	projectId: string | null;
	mediaType: MediaGenerationType;
	prompt: string | null;
	providerConversationId: string | null;
	providerConversationUrl: string | null;
	artifactCount: number;
	createdAt: string | null;
	archiveItem: RunArchiveItem;
	baseItem: RunArchiveItem | null;
};

type CatalogConversationCandidate = {
	target: HistoryMaterializationTarget;
	title: string | null;
	normalizedTitle: string | null;
	cachedArtifactCount: number;
	cachedFileCount: number;
	cachedMediaCount: number;
	observedAt: string | null;
};

type MediaConversationMatch = {
	target: HistoryMaterializationTarget;
	matchBasis: string;
};

type MediaConversationMatchResult =
	| { matched: true; match: MediaConversationMatch }
	| { matched: false; reason: string };

const MAX_MEDIA_TITLE_TIMESTAMP_MATCH_MS = 24 * 60 * 60 * 1000;

async function buildMediaGenerationReconciliationCandidates(
	runArchiveService: RunArchiveService,
	items: RunArchiveItem[],
	request: HistoryMaterializationCreateRequest,
): Promise<MediaGenerationReconciliationCandidate[]> {
	const byMediaGeneration = new Map<string, RunArchiveItem[]>();
	for (const item of items) {
		if (!item.mediaGenerationId) continue;
		if (item.fileAvailable === true && item.localPath && request.force !== true) continue;
		if (
			request.boundIdentityKey &&
			item.boundIdentityKey &&
			item.boundIdentityKey !== request.boundIdentityKey
		)
			continue;
		if (
			request.runtimeProfile &&
			item.runtimeProfile &&
			item.runtimeProfile !== request.runtimeProfile
		)
			continue;
		const provider = normalizeProviderId(item.provider);
		if (!provider) continue;
		const mediaType = normalizeMediaGenerationType(
			readRecordString(item.metadata, ["mediaType"]) ??
				item.mimeType ??
				item.fileName ??
				item.title,
		);
		if (!mediaType) continue;
		const existing = byMediaGeneration.get(item.mediaGenerationId) ?? [];
		existing.push(item);
		byMediaGeneration.set(item.mediaGenerationId, existing);
	}
	const candidates: MediaGenerationReconciliationCandidate[] = [];
	for (const [mediaGenerationId, generationItems] of byMediaGeneration) {
		const first = generationItems[0];
		if (!first) continue;
		const base =
			(await runArchiveService.readItem(`media-generation:${mediaGenerationId}`))?.item ?? null;
		const provider = normalizeProviderId(first.provider ?? base?.provider);
		const mediaType = normalizeMediaGenerationType(
			readRecordString(base?.metadata, ["mediaType"]) ??
				readRecordString(first.metadata, ["mediaType"]) ??
				first.mimeType ??
				first.fileName ??
				first.title,
		);
		if (!provider || !mediaType) continue;
		candidates.push({
			mediaGenerationId,
			provider,
			runtimeProfile:
				first.runtimeProfile ?? base?.runtimeProfile ?? request.runtimeProfile ?? null,
			browserProfile:
				first.browserProfile ?? base?.browserProfile ?? request.browserProfile ?? null,
			boundIdentityKey:
				first.boundIdentityKey ?? base?.boundIdentityKey ?? request.boundIdentityKey ?? null,
			projectId: first.projectId ?? base?.projectId ?? request.projectId ?? null,
			mediaType,
			prompt:
				base?.title ??
				readRecordString(base?.metadata, ["prompt"]) ??
				readRecordString(first.metadata, ["prompt"]) ??
				null,
			providerConversationId: first.providerConversationId ?? base?.providerConversationId ?? null,
			providerConversationUrl:
				first.providerConversationUrl ?? base?.providerConversationUrl ?? null,
			artifactCount: generationItems.length,
			createdAt: base?.createdAt ?? first.createdAt ?? null,
			archiveItem: first,
			baseItem: base,
		});
	}
	return candidates;
}

function buildCatalogConversationCandidates(
	catalog: Awaited<ReturnType<AccountMirrorCatalogService["readCatalog"]>>,
	request: HistoryMaterializationCreateRequest,
): CatalogConversationCandidate[] {
	const candidates: CatalogConversationCandidate[] = [];
	for (const entry of catalog.entries) {
		if (request.boundIdentityKey && entry.boundIdentityKey !== request.boundIdentityKey) continue;
		const mediaCounts = countCatalogMediaByConversation(entry.manifests.media);
		for (const item of entry.manifests.conversations) {
			const rawConversationId = readCatalogStringField(item, ["id", "conversationId"]);
			const rawProviderConversationUrl = readCatalogStringField(item, [
				"url",
				"href",
				"providerConversationUrl",
			]);
			const targetFields = normalizeProviderConversationTargetFields(
				entry.provider,
				rawConversationId,
				rawProviderConversationUrl,
			);
			if (!targetFields) continue;
			const { conversationId, providerConversationUrl } = targetFields;
			const target: HistoryMaterializationTarget = {
				provider: entry.provider,
				runtimeProfile: entry.runtimeProfileId,
				browserProfile: entry.browserProfileId,
				boundIdentityKey: entry.boundIdentityKey,
				conversationId,
				providerConversationUrl,
				projectId: readCatalogStringField(item, ["projectId"]),
			};
			const title = readCatalogStringField(item, ["title", "name", "prompt"]);
			candidates.push({
				target,
				title,
				normalizedTitle: normalizeMediaMatchTitle(title),
				cachedArtifactCount: readCatalogNumberField(item, ["cachedArtifactCount"]),
				cachedFileCount: readCatalogNumberField(item, ["cachedFileCount"]),
				cachedMediaCount:
					readCatalogNumberField(item, ["cachedMediaCount"]) +
					(mediaCounts.get(conversationId) ?? 0),
				observedAt: readCatalogStringField(item, [
					"updatedAt",
					"createdAt",
					"lastActivityAt",
					"timestamp",
				]),
			});
		}
	}
	return candidates;
}

function matchMediaCandidateToConversation(
	candidate: MediaGenerationReconciliationCandidate,
	conversations: CatalogConversationCandidate[],
): MediaConversationMatchResult {
	const scoped = conversations.filter(
		(conversation) =>
			conversation.target.provider === candidate.provider &&
			(!candidate.runtimeProfile ||
				conversation.target.runtimeProfile === candidate.runtimeProfile) &&
			(!candidate.boundIdentityKey ||
				conversation.target.boundIdentityKey === candidate.boundIdentityKey),
	);
	if (candidate.providerConversationId) {
		const direct = scoped.find(
			(conversation) => conversation.target.conversationId === candidate.providerConversationId,
		);
		const directTarget = direct?.target ?? targetFromMediaCandidateProviderConversation(candidate);
		if (directTarget) {
			return {
				matched: true,
				match: {
					target: withCandidateRuntimeEvidence(directTarget, candidate),
					matchBasis: "provider-conversation-id",
				},
			};
		}
	}
	const prompt = normalizeMediaMatchTitle(candidate.prompt);
	if (prompt) {
		const titleMatches = scoped.filter((conversation) => conversation.normalizedTitle === prompt);
		if (titleMatches.length > 0) {
			if (titleMatches.length === 1) {
				return {
					matched: true,
					match: {
						target: withCandidateRuntimeEvidence(titleMatches[0].target, candidate),
						matchBasis: "exact-title",
					},
				};
			}
			const mediaEvidenceMatches = titleMatches.filter(
				(conversation) => conversation.cachedMediaCount > 0,
			);
			if (mediaEvidenceMatches.length === 1) {
				return {
					matched: true,
					match: {
						target: withCandidateRuntimeEvidence(mediaEvidenceMatches[0].target, candidate),
						matchBasis: "exact-title-cached-media",
					},
				};
			}
			const timestampMatch = chooseNearestTimestampedTitleMatch(candidate, titleMatches);
			if (timestampMatch) {
				return {
					matched: true,
					match: {
						target: withCandidateRuntimeEvidence(timestampMatch.target, candidate),
						matchBasis: "exact-title-nearest-time",
					},
				};
			}
			return {
				matched: false,
				reason: formatAmbiguousMediaTitleMatchReason(candidate, titleMatches),
			};
		}
	}
	return {
		matched: false,
		reason: `No matching account-mirror conversation found for media generation ${candidate.mediaGenerationId}.`,
	};
}

function formatAmbiguousMediaTitleMatchReason(
	candidate: MediaGenerationReconciliationCandidate,
	titleMatches: CatalogConversationCandidate[],
): string {
	const ids = titleMatches
		.map((conversation) => conversation.target.conversationId)
		.filter(Boolean);
	const cachedMediaMatches = titleMatches.filter(
		(conversation) => conversation.cachedMediaCount > 0,
	).length;
	const cachedArtifactOrFileMatches = titleMatches.filter(
		(conversation) => conversation.cachedArtifactCount > 0 || conversation.cachedFileCount > 0,
	).length;
	const candidateTime = parseTimestampMs(candidate.createdAt);
	const usableTimestampMatches =
		candidateTime === null
			? 0
			: titleMatches.filter((conversation) => {
					const observedAt = parseTimestampMs(conversation.observedAt);
					return (
						observedAt !== null &&
						Math.abs(observedAt - candidateTime) <= MAX_MEDIA_TITLE_TIMESTAMP_MATCH_MS
					);
				}).length;
	const timestampEvidence =
		candidateTime === null
			? "candidate timestamp missing"
			: `${usableTimestampMatches} with usable timestamps`;
	return (
		`Ambiguous account-mirror conversations for media generation ${candidate.mediaGenerationId}: ` +
		`${titleMatches.length} cached ${candidate.provider} conversations share the exact title` +
		`${ids.length ? ` (${ids.join(", ")})` : ""}; ` +
		"no unique media recovery evidence is available " +
		`(${cachedMediaMatches} with cached media, ${timestampEvidence}, ` +
		`${cachedArtifactOrFileMatches} with cached artifacts/files).`
	);
}

function chooseNearestTimestampedTitleMatch(
	candidate: MediaGenerationReconciliationCandidate,
	titleMatches: CatalogConversationCandidate[],
): CatalogConversationCandidate | null {
	const candidateTime = parseTimestampMs(candidate.createdAt);
	if (candidateTime === null) return null;
	const ranked = titleMatches
		.map((conversation) => {
			const observedAt = parseTimestampMs(conversation.observedAt);
			return observedAt === null
				? null
				: {
						conversation,
						distanceMs: Math.abs(observedAt - candidateTime),
					};
		})
		.filter((entry): entry is { conversation: CatalogConversationCandidate; distanceMs: number } =>
			Boolean(entry),
		)
		.sort((left, right) => left.distanceMs - right.distanceMs);
	const best = ranked[0];
	if (!best || best.distanceMs > MAX_MEDIA_TITLE_TIMESTAMP_MATCH_MS) return null;
	const second = ranked[1];
	if (second && second.distanceMs === best.distanceMs) return null;
	return best.conversation;
}

function unsupportedMediaReconciliationReason(
	candidate: MediaGenerationReconciliationCandidate,
): string | null {
	if (candidate.provider !== "grok") return null;
	return (
		`Grok history media materialization is not supported for media generation ${candidate.mediaGenerationId}: ` +
		"the Grok resumed image materializer can only inspect the active Imagine/files surface, not a matched historical conversation."
	);
}

function targetFromMediaCandidateProviderConversation(
	candidate: MediaGenerationReconciliationCandidate,
): HistoryMaterializationTarget | null {
	const targetFields = normalizeProviderConversationTargetFields(
		candidate.provider,
		candidate.providerConversationId,
		candidate.providerConversationUrl,
	);
	if (!targetFields) return null;
	return {
		provider: candidate.provider,
		runtimeProfile: candidate.runtimeProfile,
		browserProfile: candidate.browserProfile,
		boundIdentityKey: candidate.boundIdentityKey,
		conversationId: targetFields.conversationId,
		providerConversationUrl: targetFields.providerConversationUrl,
		projectId: candidate.projectId,
	};
}

function withCandidateRuntimeEvidence(
	target: HistoryMaterializationTarget,
	candidate: MediaGenerationReconciliationCandidate,
): HistoryMaterializationTarget {
	return {
		...target,
		runtimeProfile: target.runtimeProfile ?? candidate.runtimeProfile,
		browserProfile: target.browserProfile ?? candidate.browserProfile,
		boundIdentityKey: target.boundIdentityKey ?? candidate.boundIdentityKey,
		projectId: target.projectId ?? candidate.projectId,
	};
}

async function materializeMatchedMediaGeneration(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	runArchiveService: RunArchiveService;
	materializeMediaGeneration: (
		request: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	candidate: MediaGenerationReconciliationCandidate;
	match: MediaConversationMatch;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const response = await input.materializeMediaGeneration({
		mediaGenerationId: input.candidate.mediaGenerationId,
		provider: input.candidate.provider,
		mediaType: input.candidate.mediaType,
		runtimeProfile: input.match.target.runtimeProfile ?? input.candidate.runtimeProfile,
		browserProfile: input.match.target.browserProfile ?? input.candidate.browserProfile,
		boundIdentityKey: input.match.target.boundIdentityKey ?? input.candidate.boundIdentityKey,
		conversationId: input.match.target.conversationId,
		providerConversationUrl: input.match.target.providerConversationUrl,
		projectId: input.match.target.projectId ?? input.candidate.projectId,
		jobId: input.jobId,
		matchBasis: input.match.matchBasis,
		count: Math.max(1, input.candidate.artifactCount),
		metadata: {
			sourceArchiveItemId: input.candidate.archiveItem.id,
			sourceMediaGenerationArchiveItemId: input.candidate.baseItem?.id ?? null,
		},
	});
	await input.runArchiveService.upsertMediaGenerationItems(input.candidate.mediaGenerationId);
	const archiveItems = await readMediaGenerationArchiveItems(
		input.runArchiveService,
		input.candidate.mediaGenerationId,
		response.artifacts,
	);
	const entries = await Promise.all(
		response.artifacts.map((artifact) => historyEntryFromMediaArtifact(artifact)),
	);
	applyArchiveLinks(entries, archiveItems);
	const generatedAt = input.now().toISOString();
	const metrics = summarizeEntries(entries, 1);
	return {
		object: "history_materialization_result",
		generatedAt,
		status: metrics.materialized > 0 ? "materialized" : "skipped",
		target: input.match.target,
		source: sourceFromCreateRequest(input.request),
		manifestPaths: [],
		entries,
		archiveItems,
		metrics,
		message:
			metrics.materialized > 0
				? `History reconciliation materialized ${metrics.materialized} media asset${metrics.materialized === 1 ? "" : "s"} for media generation ${input.candidate.mediaGenerationId}.`
				: `History reconciliation found no materialized media assets for media generation ${input.candidate.mediaGenerationId}.`,
	};
}

async function readMediaGenerationArchiveItems(
	runArchiveService: RunArchiveService,
	mediaGenerationId: string,
	artifacts: MediaGenerationArtifact[],
): Promise<RunArchiveItem[]> {
	const itemIds = [
		`media-generation:${mediaGenerationId}`,
		...artifacts.map((artifact) => `generated-artifact:${mediaGenerationId}:${artifact.id}`),
	];
	const items: RunArchiveItem[] = [];
	for (const itemId of itemIds) {
		const detail = await runArchiveService.readItem(itemId);
		if (detail?.item) items.push(detail.item);
	}
	return items;
}

async function historyEntryFromMediaArtifact(
	artifact: MediaGenerationArtifact,
): Promise<HistoryMaterializationManifestEntry> {
	const checksumSha256 = await calculateFileSha256(artifact.path ?? null);
	return {
		kind: "media",
		providerId: artifact.id,
		title: artifact.fileName ?? artifact.id,
		status: artifact.path || artifact.uri ? "materialized" : "failed",
		localPath: artifact.path ?? null,
		remoteUrl: artifact.uri ?? readRecordString(artifact.metadata, ["remoteUrl", "providerUrl"]),
		cacheKey: checksumSha256
			? `sha256:${checksumSha256}`
			: artifact.path
				? `path:${artifact.path}`
				: null,
		checksumSha256,
		mimeType: artifact.mimeType ?? null,
		size: readNumber(readRecordValue(artifact.metadata, ["size"])),
		materializationMethod: readRecordString(artifact.metadata, [
			"materialization",
			"materializationSource",
		]),
		reason:
			artifact.path || artifact.uri
				? null
				: "media artifact did not include a local path or remote URI",
		archiveItemId: null,
		assetRoute: null,
	};
}

function skippedMediaGenerationResult(input: {
	now: () => Date;
	source: HistoryMaterializationJob["source"];
	candidate: MediaGenerationReconciliationCandidate;
	reason: string;
}): HistoryMaterializationResult {
	const generatedAt = input.now().toISOString();
	return {
		object: "history_materialization_result",
		generatedAt,
		status: "skipped",
		target: null,
		source: input.source,
		manifestPaths: [],
		entries: [
			{
				kind: "media",
				providerId: input.candidate.archiveItem.artifactId,
				title: input.candidate.prompt ?? input.candidate.archiveItem.title,
				status: "skipped",
				localPath: null,
				remoteUrl: input.candidate.archiveItem.uri,
				cacheKey: null,
				checksumSha256: null,
				mimeType: input.candidate.archiveItem.mimeType,
				size: null,
				materializationMethod: null,
				reason: input.reason,
				archiveItemId: input.candidate.archiveItem.id,
				assetRoute: input.candidate.archiveItem.links.asset ?? null,
			},
		],
		archiveItems: [input.candidate.archiveItem],
		metrics: { conversations: 0, materialized: 0, skipped: 1, failed: 0 },
		message: input.reason,
	};
}

function failedMediaGenerationResult(input: {
	now: () => Date;
	source: HistoryMaterializationJob["source"];
	target: HistoryMaterializationTarget;
	candidate: MediaGenerationReconciliationCandidate;
	error: unknown;
}): HistoryMaterializationResult {
	const message = formatHistoryMaterializationFailureReason({
		target: input.target,
		error: input.error,
	});
	return {
		object: "history_materialization_result",
		generatedAt: input.now().toISOString(),
		status: "skipped",
		target: input.target,
		source: input.source,
		manifestPaths: [],
		entries: [
			{
				kind: "media",
				providerId: input.candidate.archiveItem.artifactId,
				title: input.candidate.prompt ?? input.candidate.archiveItem.title,
				status: "failed",
				localPath: null,
				remoteUrl: input.candidate.archiveItem.uri,
				cacheKey: null,
				checksumSha256: null,
				mimeType: input.candidate.archiveItem.mimeType,
				size: null,
				materializationMethod: null,
				reason: message,
				archiveItemId: input.candidate.archiveItem.id,
				assetRoute: input.candidate.archiveItem.links.asset ?? null,
			},
		],
		archiveItems: [input.candidate.archiveItem],
		metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 1 },
		message,
	};
}

function consumesReconciliationTargetBudget(result: HistoryMaterializationResult): boolean {
	return !isTerminalConversationUnavailableResult(result);
}

function isTerminalConversationUnavailableResult(result: HistoryMaterializationResult): boolean {
	if (result.metrics.materialized > 0) return false;
	return result.entries.some((entry) => isConversationNotFoundOrUnavailableReason(entry.reason));
}

function isConversationNotFoundOrUnavailableReason(reason: string | null | undefined): boolean {
	return typeof reason === "string" && reason.startsWith("conversation-not-found-or-unavailable:");
}

async function reconcileConversationTarget(input: {
	target: HistoryMaterializationTarget;
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	materializeConversation: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationResult>;
	refreshConversationSnapshot: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationSnapshotRefresh>;
	recordConversationEvidence: (
		target: HistoryMaterializationTarget,
		evidence: AccountMirrorConversationEvidence,
	) => Promise<void>;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	if (!shouldRefreshSnapshot(input.request)) {
		return input.materializeConversation(input.target, input.request, input.jobId);
	}
	if (shouldMaterializeBeforeSnapshotRefresh(input.target, input.request)) {
		const materialization = await input.materializeConversation(
			input.target,
			input.request,
			input.jobId,
		);
		await input.recordConversationEvidence(
			input.target,
			evidenceFromMaterializationResult(materialization),
		);
		if (materialization.metrics.materialized > 0) {
			return materialization;
		}
	}
	let snapshotRefresh: HistoryMaterializationSnapshotRefresh;
	try {
		snapshotRefresh = await input.refreshConversationSnapshot(
			input.target,
			input.request,
			input.jobId,
		);
	} catch (error) {
		if (isProviderAuthPreflightError(error) || isProviderHumanVerificationError(error)) {
			throw error;
		}
		snapshotRefresh = failedSnapshotRefresh({
			target: input.target,
			error,
			now: input.now,
		});
	}
	await input.recordConversationEvidence(
		input.target,
		evidenceFromSnapshotRefresh(snapshotRefresh),
	);
	if (snapshotRefresh.status === "failed") {
		return snapshotRefreshFailureResult({
			request: input.request,
			target: input.target,
			snapshotRefresh,
			now: input.now,
		});
	}
	const materialization = await input.materializeConversation(
		input.target,
		input.request,
		input.jobId,
	);
	await input.recordConversationEvidence(
		input.target,
		evidenceFromMaterializationResult(materialization),
	);
	return withSnapshotRefreshPhase(materialization, snapshotRefresh);
}

function shouldMaterializeBeforeSnapshotRefresh(
	target: HistoryMaterializationTarget,
	request: HistoryMaterializationCreateRequest,
): boolean {
	if (target.provider !== "chatgpt") return false;
	if (request.reconcile !== true) return false;
	const selectedKinds = normalizeAssetKinds(request.assetKinds);
	return (
		selectedKinds.includes("artifacts") ||
		selectedKinds.includes("files") ||
		selectedKinds.includes("media")
	);
}

async function refreshConversationSnapshotTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	target: HistoryMaterializationTarget;
	request?: HistoryMaterializationCreateRequest | null;
	jobId?: string | null;
	now: () => Date;
}): Promise<HistoryMaterializationSnapshotRefresh> {
	const llmService = createLlmService(
		input.target.provider,
		withRuntimeProfileSelection(
			input.config,
			input.target.provider,
			input.target.runtimeProfile,
		) as ResolvedUserConfig,
		{
			browserProcessOwner: input.request
				? createHistoryMaterializationBrowserProcessOwner({
						request: input.request,
						jobId: input.jobId ?? null,
						provider: input.target.provider,
						runtimeProfile: input.target.runtimeProfile,
						browserProfile: input.target.browserProfile,
						reason: "conversation-snapshot-refresh",
					})
				: undefined,
		},
	);
	const listOptions = resolveHistoryMaterializationProviderListOptions(input.target);
	const context = await llmService.getConversationContext(input.target.conversationId, {
		projectId: input.target.projectId ?? undefined,
		refresh: true,
		allowCacheFallback: false,
		listOptions,
	});
	return {
		object: "history_materialization_snapshot_refresh",
		generatedAt: input.now().toISOString(),
		status: "refreshed",
		target: input.target,
		routeabilityState: "routeable",
		messageCount: context.messages.length,
		fileCount: context.files?.length ?? 0,
		sourceCount: context.sources?.length ?? 0,
		artifactCount: context.artifacts?.length ?? 0,
		error: null,
		message: `Conversation snapshot refreshed for ${input.target.provider} conversation ${input.target.conversationId}.`,
	};
}

function shouldRefreshSnapshot(request: HistoryMaterializationCreateRequest): boolean {
	return request.refreshSnapshot === true;
}

function withSnapshotRefreshPhase(
	result: HistoryMaterializationResult,
	snapshotRefresh: HistoryMaterializationSnapshotRefresh,
): HistoryMaterializationResult {
	return {
		...result,
		snapshotRefreshes: [...snapshotRefreshesFromResult(result), snapshotRefresh],
		phases: {
			snapshotRefresh,
			materialization: materializationPhaseFromResult(result),
		},
	};
}

function snapshotRefreshFailureResult(input: {
	request: HistoryMaterializationCreateRequest;
	target: HistoryMaterializationTarget;
	snapshotRefresh: HistoryMaterializationSnapshotRefresh;
	now: () => Date;
}): HistoryMaterializationResult {
	const reason = input.snapshotRefresh.error ?? input.snapshotRefresh.message;
	const entry = unsupportedEntry(
		historyEntryKindForSnapshotRefresh(input.request),
		new Error(reason),
		input.target,
	);
	entry.status = "failed";
	const generatedAt = input.now().toISOString();
	return {
		object: "history_materialization_result",
		generatedAt,
		status: "skipped",
		target: input.target,
		source: sourceFromCreateRequest(input.request),
		manifestPaths: [],
		entries: [entry],
		archiveItems: [],
		snapshotRefreshes: [input.snapshotRefresh],
		metrics: summarizeEntries([entry], 1),
		phases: {
			snapshotRefresh: input.snapshotRefresh,
			materialization: null,
		},
		message: input.snapshotRefresh.message,
	};
}

function failedSnapshotRefresh(input: {
	target: HistoryMaterializationTarget;
	error: unknown;
	now: () => Date;
}): HistoryMaterializationSnapshotRefresh {
	const reason = formatHistoryMaterializationFailureReason({
		target: input.target,
		error: input.error,
	});
	return {
		object: "history_materialization_snapshot_refresh",
		generatedAt: input.now().toISOString(),
		status: "failed",
		target: input.target,
		routeabilityState: classifySnapshotRouteabilityState(reason, input.error),
		messageCount: null,
		fileCount: null,
		sourceCount: null,
		artifactCount: null,
		error: reason,
		message: `Conversation snapshot refresh failed for ${input.target.provider} conversation ${input.target.conversationId}: ${reason}`,
	};
}

function evidenceFromSnapshotRefresh(
	snapshotRefresh: HistoryMaterializationSnapshotRefresh,
): AccountMirrorConversationEvidence {
	const routeabilityState = conversationEvidenceRouteabilityState(
		snapshotRefresh.routeabilityState,
	);
	if (snapshotRefresh.status === "refreshed") {
		const assetCount = (snapshotRefresh.fileCount ?? 0) + (snapshotRefresh.artifactCount ?? 0);
		return {
			detailObservedAt: snapshotRefresh.generatedAt,
			manifestObservedAt: snapshotRefresh.generatedAt,
			routeabilityObservedAt: snapshotRefresh.generatedAt,
			routeabilityState,
			detailCompleteness: "complete",
			assetCompleteness: assetCount > 0 ? "unknown" : "none",
			messageCount: snapshotRefresh.messageCount,
			fileCount: snapshotRefresh.fileCount,
			sourceCount: snapshotRefresh.sourceCount,
			artifactCount: snapshotRefresh.artifactCount,
		};
	}
	return {
		routeabilityObservedAt: snapshotRefresh.generatedAt,
		routeabilityState,
		routeabilityReason: snapshotRefresh.error ?? snapshotRefresh.message,
	};
}

function evidenceFromMaterializationResult(
	result: HistoryMaterializationResult,
): AccountMirrorConversationEvidence {
	const entryCount = result.entries.length;
	const materializedCount = result.entries.filter(
		(entry) => entry.status === "materialized",
	).length;
	const duplicateAliasCount = result.entries.filter((entry) => entry.status === "duplicate").length;
	return {
		manifestObservedAt: result.generatedAt,
		materializedAt: materializedCount > 0 ? result.generatedAt : undefined,
		assetCompleteness:
			entryCount > 0 && materializedCount + duplicateAliasCount === entryCount
				? "complete"
				: undefined,
	};
}

function conversationEvidenceRouteabilityState(
	state: HistoryMaterializationSnapshotRouteabilityState,
): AccountMirrorConversationEvidence["routeabilityState"] {
	if (
		state === "routeable" ||
		state === "not_found_or_unavailable" ||
		state === "identity_mismatch" ||
		state === "guarded"
	) {
		return state;
	}
	return "unknown";
}

function classifySnapshotRouteabilityState(
	reason: string,
	error: unknown,
): HistoryMaterializationSnapshotRouteabilityState {
	if (isConversationNotFoundOrUnavailableReason(reason)) return "not_found_or_unavailable";
	if (isProviderHumanVerificationError(error) || isProviderHumanVerificationError(reason))
		return "guarded";
	if (reason.includes("account_session_drift") || reason.includes("expected_identity_missing"))
		return "identity_mismatch";
	if (isProviderAuthPreflightError(error) || isProviderAuthPreflightError(reason))
		return "auth_conflict";
	return "unknown";
}

function materializationPhaseFromResult(
	result: HistoryMaterializationResult,
): NonNullable<HistoryMaterializationPhases["materialization"]> {
	return {
		status: result.status,
		generatedAt: result.generatedAt,
		manifestPaths: result.manifestPaths,
		entries: result.entries.length,
		archiveItems: result.archiveItems.length,
		metrics: result.metrics,
	};
}

function snapshotRefreshesFromResult(
	result: HistoryMaterializationResult,
): HistoryMaterializationSnapshotRefresh[] {
	const values = [
		...(Array.isArray(result.snapshotRefreshes) ? result.snapshotRefreshes : []),
		result.phases?.snapshotRefresh ?? null,
	].filter((entry): entry is HistoryMaterializationSnapshotRefresh => Boolean(entry));
	return Array.from(
		new Map(
			values.map((entry) => [
				`${entry.generatedAt}:${entry.target?.provider ?? "unknown"}:${entry.target?.conversationId ?? "unknown"}:${entry.status}`,
				entry,
			]),
		).values(),
	);
}

function historyEntryKindForSnapshotRefresh(
	request: HistoryMaterializationCreateRequest,
): HistoryMaterializationManifestEntry["kind"] {
	const selectedKinds = normalizeAssetKinds(request.assetKinds);
	if (selectedKinds.length === 1 && selectedKinds[0] === "files") return "file";
	if (selectedKinds.length === 1 && selectedKinds[0] === "media") return "media";
	return "artifact";
}

async function materializeConversationTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	runArchiveService: RunArchiveService;
	target: HistoryMaterializationTarget;
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const selectedKinds = normalizeAssetKinds(input.request.assetKinds);
	const maxItems = normalizeMaxItems(input.request.maxItems);
	let scrapeTelemetryProgressWrite = Promise.resolve();
	const persistScrapeTelemetryProgress = () => {
		const snapshot = snapshotBrowserScrapeTelemetry(scrapeTelemetry);
		if (!snapshot) return;
		scrapeTelemetryProgressWrite = scrapeTelemetryProgressWrite
			.then(() =>
				writeHistoryMaterializationScrapeTelemetryProgress(input.jobId, {
					generatedAt: input.now().toISOString(),
					scrapeTelemetry: snapshot,
				}),
			)
			.catch(() => undefined);
	};
	const scrapeTelemetry = createBrowserScrapeTelemetryRecorder({
		onUpdate: persistScrapeTelemetryProgress,
	});
	const llmService = createLlmService(
		input.target.provider,
		withRuntimeProfileSelection(
			input.config,
			input.target.provider,
			input.target.runtimeProfile,
		) as ResolvedUserConfig,
		{
			browserProcessOwner: createHistoryMaterializationBrowserProcessOwner({
				request: input.request,
				jobId: input.jobId,
				provider: input.target.provider,
				runtimeProfile: input.target.runtimeProfile,
				browserProfile: input.target.browserProfile,
				reason: "conversation-materialization",
			}),
		},
	);
	const listOptions = {
		...resolveHistoryMaterializationProviderListOptions(input.target),
		scrapeTelemetry,
		useProviderSession: true,
		keepProviderSessionOpen: true,
	};
	try {
		const manifestPaths: string[] = [];
		let remaining = maxItems;
		let artifactFetch: {
			artifacts: ConversationArtifact[];
			files: FileRef[];
			manifestPath: string | null;
		} | null = null;
		let fileFetch: {
			conversationFiles: FileRef[];
			files: FileRef[];
			manifestPath: string | null;
		} | null = null;
		const entries: HistoryMaterializationManifestEntry[] = [];
		const archiveAssets: RunArchiveHistoryMaterializationAsset[] = [];
		const refreshMaterializationSource = input.request.refreshSnapshot !== true;

		if (selectedKinds.includes("artifacts") || selectedKinds.includes("media")) {
			if (remaining === null || remaining > 0) {
				try {
					artifactFetch = await llmService.materializeConversationArtifacts(
						input.target.conversationId,
						{
							projectId: input.target.projectId ?? undefined,
							listOptions,
							refresh: refreshMaterializationSource,
							maxItems: remaining,
						},
					);
					if (artifactFetch.manifestPath) manifestPaths.push(artifactFetch.manifestPath);
					const manifestEntries = await readArtifactManifestEntries(artifactFetch.manifestPath);
					entries.push(
						...(await Promise.all(
							manifestEntries.map((entry) => historyEntryFromArtifactManifest(entry)),
						)),
					);
					if (artifactFetch.artifacts.length === 0 && manifestEntries.length === 0) {
						entries.push(noMaterializableEntry("artifact", input.target));
					}
					for (const file of artifactFetch.files) {
						const manifestEntry = findArtifactManifestForFile(manifestEntries, file);
						archiveAssets.push({
							kind:
								selectedKinds.includes("media") && !selectedKinds.includes("artifacts")
									? "media"
									: "artifact",
							file,
							artifactId: manifestEntry?.artifactId ?? file.id,
							title: manifestEntry?.title ?? file.name,
							manifestPath: artifactFetch.manifestPath,
							materializationMethod:
								manifestEntry?.materializationMethod ??
								readRecordString(file.metadata, ["materialization", "materializationSource"]),
						});
					}
					remaining = decrementRemaining(remaining, artifactFetch.artifacts.length);
				} catch (error) {
					entries.push(unsupportedEntry("artifact", error, input.target));
				}
			}
		}

		if (selectedKinds.includes("files")) {
			if (remaining === null || remaining > 0) {
				try {
					fileFetch = await llmService.materializeConversationFiles(input.target.conversationId, {
						projectId: input.target.projectId ?? undefined,
						listOptions,
						refresh: refreshMaterializationSource,
						maxItems: remaining,
					});
					if (fileFetch.manifestPath) manifestPaths.push(fileFetch.manifestPath);
					const manifestEntries = await readFileManifestEntries(fileFetch.manifestPath);
					entries.push(
						...(await Promise.all(
							manifestEntries.map((entry) => historyEntryFromFileManifest(entry)),
						)),
					);
					if (fileFetch.conversationFiles.length === 0 && manifestEntries.length === 0) {
						entries.push(noMaterializableEntry("file", input.target));
					}
					for (const file of fileFetch.files) {
						const manifestEntry = findFileManifestForFile(manifestEntries, file);
						archiveAssets.push({
							kind: "file",
							file,
							artifactId: manifestEntry?.fileId ?? file.id,
							title: manifestEntry?.fileName ?? file.name,
							manifestPath: fileFetch.manifestPath,
							materializationMethod:
								manifestEntry?.materializationMethod ??
								readRecordString(file.metadata, ["materialization", "materializationSource"]),
						});
					}
				} catch (error) {
					entries.push(unsupportedEntry("file", error, input.target));
				}
			}
		}

		if (archiveAssets.length > 0 && !input.runArchiveService.upsertHistoryMaterializationItems) {
			throw new Error("History materialization archive upsert is not configured.");
		}
		const archiveItems =
			archiveAssets.length > 0
				? ((
						await input.runArchiveService.upsertHistoryMaterializationItems?.({
							provider: input.target.provider,
							runtimeProfile: input.target.runtimeProfile,
							browserProfile: input.target.browserProfile,
							projectId: input.target.projectId,
							boundIdentityKey: input.target.boundIdentityKey,
							providerConversationId: input.target.conversationId,
							providerConversationUrl: input.target.providerConversationUrl,
							materializationJobId: input.jobId,
							assets: archiveAssets,
						})
					)?.items ?? [])
				: [];
		applyArchiveLinks(entries, archiveItems);
		const generatedAt = input.now().toISOString();
		const metrics = summarizeEntries(entries, 1);
		return {
			object: "history_materialization_result",
			generatedAt,
			status: metrics.materialized > 0 ? "materialized" : "skipped",
			target: input.target,
			source: sourceFromCreateRequest(input.request),
			manifestPaths,
			entries,
			archiveItems,
			scrapeTelemetry: snapshotBrowserScrapeTelemetry(scrapeTelemetry),
			metrics,
			message:
				metrics.materialized > 0
					? `History materialization downloaded ${metrics.materialized} asset${metrics.materialized === 1 ? "" : "s"} for conversation ${input.target.conversationId}.`
					: `History materialization found no downloadable assets for conversation ${input.target.conversationId}.`,
		};
	} finally {
		await listOptions.providerSession?.close();
		await scrapeTelemetryProgressWrite;
	}
}

function normalizeCreateRequest(
	request: HistoryMaterializationCreateRequest,
): HistoryMaterializationCreateRequest {
	const provider = normalizeProviderId(request.provider) ?? null;
	const normalized: HistoryMaterializationCreateRequest = {
		provider,
		runtimeProfile: normalizeOptionalString(request.runtimeProfile),
		browserProfile: normalizeOptionalString(request.browserProfile),
		boundIdentityKey: normalizeOptionalString(request.boundIdentityKey),
		conversationId: normalizeOptionalString(request.conversationId),
		conversationIds: normalizeConversationIds(request.conversationIds),
		providerConversationUrl: normalizeOptionalString(request.providerConversationUrl),
		projectId: normalizeOptionalString(request.projectId),
		catalogItemId: normalizeOptionalString(request.catalogItemId),
		catalogKind: normalizeCatalogKind(request.catalogKind),
		archiveItemId: normalizeOptionalString(request.archiveItemId),
		reconcile: request.reconcile === true,
		assetSource: normalizeAssetSource(request.assetSource),
		refreshSnapshot: request.refreshSnapshot === true,
		assetKinds: normalizeRequestedAssetKinds(request.assetKinds),
		maxItems: normalizeMaxItems(request.maxItems),
		providerWorkTimeoutMs: normalizeProviderWorkTimeoutMs(request.providerWorkTimeoutMs),
		force: request.force === true,
	};
	if (normalized.conversationId && !normalized.provider) {
		throw new HistoryMaterializationError("Provider is required when conversationId is provided.");
	}
	if (normalized.provider === "gemini" && normalized.conversationId) {
		const targetFields = normalizeProviderConversationTargetFields(
			normalized.provider,
			normalized.conversationId,
			normalized.providerConversationUrl,
		);
		if (!targetFields) {
			throw new HistoryMaterializationError(
				"Gemini conversation materialization requires a canonical gemini.google.com/app/<conversation-id> target.",
			);
		}
		normalized.conversationId = targetFields.conversationId;
		normalized.providerConversationUrl = targetFields.providerConversationUrl;
	}
	if (normalized.conversationIds && normalized.conversationIds.length > 0 && !normalized.provider) {
		throw new HistoryMaterializationError(
			"Provider is required when conversationIds are provided.",
		);
	}
	if (
		normalized.provider === "gemini" &&
		normalized.conversationIds &&
		normalized.conversationIds.length > 0
	) {
		const normalizedConversationIds = normalized.conversationIds
			.map((conversationId) => normalizeGeminiConversationId(conversationId))
			.filter((conversationId): conversationId is string => Boolean(conversationId));
		if (normalizedConversationIds.length !== normalized.conversationIds.length) {
			throw new HistoryMaterializationError(
				"Gemini selected conversation batches require canonical conversation ids.",
			);
		}
		normalized.conversationIds = Array.from(new Set(normalizedConversationIds));
	}
	if (
		normalized.conversationIds &&
		normalized.conversationIds.length > 0 &&
		(normalized.conversationId || normalized.catalogItemId || normalized.archiveItemId)
	) {
		throw new HistoryMaterializationError(
			"Use conversationIds for a selected batch without conversationId, catalogItemId, or archiveItemId.",
		);
	}
	if (normalized.assetSource === "account-library") {
		if (normalized.reconcile !== true) {
			throw new HistoryMaterializationError(
				"Account-library source is only supported with reconcile=true.",
			);
		}
		if (normalized.provider !== "chatgpt") {
			throw new HistoryMaterializationError(
				"Account-library reconciliation requires provider=chatgpt.",
			);
		}
		if ((normalized.conversationIds?.length ?? 0) > 0 || normalized.conversationId) {
			throw new HistoryMaterializationError(
				"Account-library reconciliation cannot be combined with conversation ids.",
			);
		}
		normalized.assetKinds = ["files"];
	}
	if (
		normalized.provider &&
		normalized.projectId &&
		!normalized.conversationId &&
		(!normalized.conversationIds || normalized.conversationIds.length === 0) &&
		!normalized.catalogItemId &&
		!normalized.archiveItemId &&
		normalized.reconcile !== true
	) {
		const selectedKinds = normalizeAssetKinds(normalized.assetKinds);
		if (selectedKinds.some((kind) => kind !== "files")) {
			throw new HistoryMaterializationError(
				"Project source materialization currently supports assetKinds=[files] only.",
			);
		}
		normalized.assetKinds = ["files"];
	}
	if (
		!normalized.conversationId &&
		!normalized.projectId &&
		(!normalized.conversationIds || normalized.conversationIds.length === 0) &&
		!normalized.catalogItemId &&
		!normalized.archiveItemId &&
		normalized.reconcile !== true
	) {
		throw new HistoryMaterializationError(
			"Provide conversationId, projectId, conversationIds, catalogItemId, archiveItemId, or reconcile=true.",
		);
	}
	return normalized;
}

function sourceFromCreateRequest(
	request: HistoryMaterializationCreateRequest,
): HistoryMaterializationJob["source"] {
	if (request.archiveItemId) return { type: "archive_item", archiveItemId: request.archiveItemId };
	if (request.catalogItemId) {
		return {
			type: "catalog_item",
			catalogItemId: request.catalogItemId,
			catalogKind: request.catalogKind ?? null,
		};
	}
	if (request.conversationIds && request.conversationIds.length > 0) {
		return { type: "reconciliation", provider: request.provider ?? null };
	}
	if (request.provider && request.projectId && !request.conversationId) {
		return { type: "project_sources", provider: request.provider, projectId: request.projectId };
	}
	if (request.reconcile === true && request.assetSource === "account-library")
		return { type: "account_library_reconciliation", provider: request.provider ?? null };
	if (request.reconcile === true)
		return { type: "reconciliation", provider: request.provider ?? null };
	if (request.provider && request.conversationId) {
		return {
			type: "conversation",
			provider: request.provider,
			conversationId: request.conversationId,
		};
	}
	throw new HistoryMaterializationError("History materialization source is incomplete.");
}

function projectSourcesTargetFromRequest(
	request: HistoryMaterializationCreateRequest,
): HistoryMaterializationTarget {
	const provider = request.provider;
	const projectId = request.projectId;
	if (!provider || !projectId) {
		throw new HistoryMaterializationError("Project source target requires provider and projectId.");
	}
	return {
		provider,
		runtimeProfile: request.runtimeProfile ?? null,
		browserProfile: request.browserProfile ?? null,
		boundIdentityKey: request.boundIdentityKey ?? null,
		conversationId: `project:${projectId}`,
		providerConversationUrl: resolveProviderProjectUrl(provider, projectId),
		projectId,
	};
}

function sourceKeyFromCreateRequest(request: HistoryMaterializationCreateRequest): string {
	return stableKey({
		source: sourceFromCreateRequest(request),
		provider: request.provider ?? null,
		runtimeProfile: request.runtimeProfile ?? null,
		browserProfile: request.browserProfile ?? null,
		conversationIds: request.conversationIds ?? null,
		providerConversationUrl: request.providerConversationUrl ?? null,
		projectId: request.projectId ?? null,
		boundIdentityKey: request.boundIdentityKey ?? null,
		assetSource: request.assetSource ?? null,
		refreshSnapshot: request.refreshSnapshot === true,
		assetKinds: request.assetKinds ?? null,
		maxItems: request.maxItems ?? null,
		providerWorkTimeoutMs: request.providerWorkTimeoutMs ?? null,
		force: request.force === true,
	});
}

function createHistoryMaterializationBrowserProcessOwner(input: {
	request: HistoryMaterializationCreateRequest;
	jobId?: string | null;
	provider: ProviderId | null;
	runtimeProfile: string | null;
	browserProfile: string | null;
	reason: string;
}): BrowserProcessOwnerAttribution | undefined {
	if (!input.jobId) return undefined;
	const acquiredAt = new Date().toISOString();
	const source = sourceFromCreateRequest(input.request);
	const operation = {
		kind: "history_materialization_job",
		id: input.jobId,
		provider: input.provider ?? null,
		runtimeProfileId: input.runtimeProfile ?? null,
		browserProfileId: input.browserProfile ?? null,
		sourceType: source.type,
		sourceKey: sourceKeyFromCreateRequest(input.request),
		reason: input.reason,
	};
	return {
		owner: {
			...operation,
			acquiredAt,
			heartbeatAt: acquiredAt,
		},
		operation,
		lease: {
			id: `${operation.kind}:${input.jobId}:${input.provider ?? "unknown"}:${input.runtimeProfile ?? "default"}`,
			ownerId: input.jobId,
			acquiredAt,
			heartbeatAt: acquiredAt,
			expiresAt: null,
			cleanupPolicy: "history-materialization-provider-work",
		},
	};
}

function targetFromArchiveItem(item: RunArchiveItem): HistoryMaterializationTarget | null {
	const provider = normalizeProviderId(item.provider);
	if (!provider || !item.providerConversationId) return null;
	return {
		provider,
		runtimeProfile: item.runtimeProfile,
		browserProfile: item.browserProfile,
		boundIdentityKey: item.boundIdentityKey,
		conversationId: item.providerConversationId,
		providerConversationUrl:
			item.providerConversationUrl ??
			resolveProviderConversationUrl(provider, item.providerConversationId),
		projectId: item.projectId,
	};
}

function archiveItemLooksLikeMediaGeneration(
	item: RunArchiveItem,
	request: HistoryMaterializationCreateRequest,
): boolean {
	if (item.kind !== "generated_artifact" || !item.mediaGenerationId) return false;
	if (!normalizeProviderId(item.provider)) return false;
	if (
		Array.isArray(request.assetKinds) &&
		request.assetKinds.length > 0 &&
		!normalizeAssetKinds(request.assetKinds).includes("media")
	) {
		return false;
	}
	return Boolean(
		normalizeMediaGenerationType(
			readRecordString(item.metadata, ["mediaType"]) ??
				item.mimeType ??
				item.fileName ??
				item.title,
		),
	);
}

function targetFromCatalogItem(
	detail: AccountMirrorCatalogItemResult,
	request: HistoryMaterializationCreateRequest,
): HistoryMaterializationTarget | null {
	const item = isRecord(detail.item) ? detail.item : {};
	const metadata = isRecord(item.metadata) ? item.metadata : {};
	const provider = normalizeProviderId(detail.provider);
	const conversationId =
		readCatalogStringField(item, ["conversationId"]) ??
		readRecordString(metadata, ["conversationId"]) ??
		(detail.kind === "conversations" ? detail.itemId : null);
	if (!provider || !conversationId) return null;
	const providerConversationUrl =
		request.providerConversationUrl ??
		readCatalogStringField(item, ["url", "href", "providerConversationUrl"]) ??
		readRecordString(metadata, ["url", "href", "providerConversationUrl"]) ??
		resolveProviderConversationUrl(provider, conversationId);
	const targetFields = normalizeProviderConversationTargetFields(
		provider,
		conversationId,
		providerConversationUrl,
	);
	if (!targetFields) return null;
	return {
		provider,
		runtimeProfile: detail.runtimeProfileId,
		browserProfile: detail.browserProfileId,
		boundIdentityKey: detail.boundIdentityKey,
		conversationId: targetFields.conversationId,
		providerConversationUrl: targetFields.providerConversationUrl,
		projectId:
			request.projectId ??
			readCatalogStringField(item, ["projectId"]) ??
			readRecordString(metadata, ["projectId"]),
	};
}

function accountLibraryFileRefFromCatalogItem(
	detail: AccountMirrorCatalogItemResult,
): FileRef | null {
	if (detail.kind !== "files") return null;
	if (detail.provider !== "chatgpt") return null;
	const item = isRecord(detail.item) ? detail.item : null;
	if (!item) return null;
	const metadata = isRecord(item.metadata) ? item.metadata : {};
	const source = readRecordString(metadata, ["source"]) ?? readCatalogStringField(item, ["source"]);
	if (source !== "chatgpt-library") return null;
	const id =
		readCatalogStringField(item, ["id", "fileId", "providerFileId"]) ??
		readRecordString(metadata, ["fileId", "providerFileId", "libraryIdentity"]);
	const name =
		readCatalogStringField(item, ["name", "fileName", "title"]) ??
		readRecordString(metadata, ["name", "fileName", "title"]);
	const providerFileId =
		readRecordString(metadata, ["providerFileId"]) ??
		readCatalogStringField(item, ["providerFileId"]);
	const remoteUrl =
		readCatalogStringField(item, ["remoteUrl", "uri", "url", "href"]) ??
		readRecordString(metadata, ["remoteUrl", "uri", "url", "href"]) ??
		(providerFileId ? `chatgpt://file/${encodeURIComponent(providerFileId)}` : null);
	if (!id || !name) return null;
	if (remoteUrl && !remoteUrl.startsWith("chatgpt://file/")) return null;
	return {
		id,
		name,
		provider: "chatgpt",
		source: "account",
		...(remoteUrl ? { remoteUrl } : {}),
		mimeType:
			readCatalogStringField(item, ["mimeType"]) ??
			readRecordString(metadata, ["mimeType"]) ??
			undefined,
		size: readNumber(item.size) ?? readNumber(metadata.size) ?? undefined,
		metadata: {
			...metadata,
			source: "chatgpt-library",
			...(providerFileId ? { providerFileId } : {}),
			materializationSurface:
				readRecordString(metadata, ["materializationSurface"]) ?? "chatgpt-library-file-row-click",
			accountLibraryCatalogItemId: detail.itemId,
		},
	};
}

function accountLibraryFileRefFromCatalogEntry(
	entry: AccountMirrorCatalogEntry,
	item: unknown,
): FileRef | null {
	const itemId = readCatalogItemId(item);
	if (!itemId) return null;
	return accountLibraryFileRefFromCatalogItem({
		object: "account_mirror_catalog_item",
		generatedAt: new Date(0).toISOString(),
		provider: entry.provider,
		tenantKey: entry.tenantKey,
		bindingKey: entry.bindingKey,
		runtimeProfileId: entry.runtimeProfileId,
		browserProfileId: entry.browserProfileId,
		boundIdentityKey: entry.boundIdentityKey,
		status: entry.status,
		reason: entry.reason,
		kind: "files",
		itemId,
		item,
	});
}

function readCatalogItemId(item: unknown): string | null {
	return readCatalogStringField(item, ["id", "itemId", "fileId", "providerFileId", "artifactId"]);
}

function defaultAssetKindsForCatalogKind(
	kind: Exclude<AccountMirrorCatalogKind, "all">,
): HistoryMaterializationAssetKind[] {
	if (kind === "files") return ["files"];
	if (kind === "media") return ["media"];
	if (kind === "artifacts") return ["artifacts"];
	return ["artifacts", "files"];
}

function catalogConversationMaterializationPriority(
	item: unknown,
	selectedKinds: HistoryMaterializationAssetKind[] = ["artifacts", "files"],
	manifestEvidence: {
		provider: ProviderId;
		conversationId: string;
		manifests: AccountMirrorCatalogEntry["manifests"];
	},
	options: {
		force?: boolean;
		refreshSnapshot?: boolean;
	} = {},
): number | null {
	const record = isRecord(item) ? item : {};
	const metadata = isRecord(record.metadata) ? record.metadata : {};
	if (
		catalogConversationHasIgnoredProviderRoute(
			manifestEvidence.provider,
			manifestEvidence.conversationId,
			record,
			metadata,
		)
	) {
		return null;
	}
	if (!options.force && catalogConversationHasTerminalEvidence(record, metadata)) {
		return null;
	}
	if (options.force && options.refreshSnapshot) {
		return 0;
	}
	const freshnessState =
		readConversationFreshnessString(record, metadata, "state") ??
		readCatalogStringField(record, ["freshnessState"]) ??
		readRecordString(metadata, ["freshnessState"]);
	const manifestCounts = countEligibleManifestAssetsForConversation(
		manifestEvidence.manifests,
		manifestEvidence.conversationId,
		manifestEvidence.provider,
	);
	const rawManifestCounts = countManifestAssetsForConversation(
		manifestEvidence.manifests,
		manifestEvidence.conversationId,
	);
	const rowArtifactCount = maxKnownCount([
		record.cachedArtifactCount,
		record.artifactCount,
		metadata.artifactCount,
	]);
	const artifactCount = Math.max(rowArtifactCount, manifestCounts.artifacts);
	const fileCount = maxKnownCount([
		record.cachedFileCount,
		record.fileCount,
		metadata.fileCount,
		manifestCounts.files,
	]);
	const rowMediaCount = maxKnownCount([
		record.cachedMediaCount,
		record.mediaCount,
		metadata.mediaCount,
	]);
	const mediaCount = Math.max(rowMediaCount, manifestCounts.media);
	const assetCounts = readConversationFreshnessRecord(record, metadata, "assetCounts");
	const freshnessKnownCount = readNumber(readRecordValue(assetCounts, ["known"])) ?? 0;
	const freshnessMissingLocalCount =
		readNumber(readRecordValue(assetCounts, ["missingLocal"])) ?? 0;
	const assetCompleteness =
		readConversationFreshnessString(record, metadata, "assetCompleteness") ??
		readCatalogStringField(record, ["assetCompleteness"]) ??
		readRecordString(metadata, ["assetCompleteness"]);
	const hasFreshnessAssetEvidence = freshnessKnownCount > 0 || freshnessMissingLocalCount > 0;
	const mediaOnly = selectedKinds.length === 1 && selectedKinds[0] === "media";
	const refreshOnlyCandidate =
		options.refreshSnapshot === true &&
		(freshnessState === "stale" ||
			freshnessState === "partial" ||
			freshnessState === "missing_assets");
	const selectedRawManifestCount =
		(selectedKinds.includes("artifacts") ? rawManifestCounts.artifacts : 0) +
		(selectedKinds.includes("files") ? rawManifestCounts.files : 0) +
		(selectedKinds.includes("media") ? rawManifestCounts.media : 0);
	const selectedEligibleManifestCount =
		(selectedKinds.includes("artifacts") ? manifestCounts.artifacts : 0) +
		(selectedKinds.includes("files") ? manifestCounts.files : 0) +
		(selectedKinds.includes("media") ? manifestCounts.media : 0);
	if (selectedRawManifestCount > 0 && selectedEligibleManifestCount === 0) {
		return null;
	}
	const hasSelectedAssets =
		(selectedKinds.includes("artifacts") && artifactCount > 0) ||
		(selectedKinds.includes("files") && fileCount > 0) ||
		(selectedKinds.includes("media") &&
			(mediaOnly
				? rowMediaCount > 0 || rowArtifactCount > 0
				: mediaCount > 0 || artifactCount > 0)) ||
		hasFreshnessAssetEvidence;
	if (!hasSelectedAssets) return refreshOnlyCandidate ? 2 : null;
	if (
		!options.force &&
		catalogConversationAssetsAlreadyComplete(record, metadata, freshnessState)
	) {
		return null;
	}
	const hasMissingLocalAssetEvidence =
		freshnessMissingLocalCount > 0 ||
		(assetCompleteness === "partial" && hasFreshnessAssetEvidence) ||
		(freshnessState === "missing_assets" && hasFreshnessAssetEvidence);
	if (hasMissingLocalAssetEvidence) return 0;
	return 1;
}

function catalogConversationHasIgnoredProviderRoute(
	provider: ProviderId,
	conversationId: string,
	record: Record<string, unknown>,
	metadata: Record<string, unknown>,
): boolean {
	if (provider !== "gemini") return false;
	if (isIgnoredGeminiConversationId(conversationId)) return true;
	const url =
		readCatalogStringField(record, ["url", "href", "providerConversationUrl"]) ??
		readRecordString(metadata, ["url", "href", "providerConversationUrl"]);
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return (
			parsed.hostname === "gemini.google.com" && isIgnoredGeminiConversationPath(parsed.pathname)
		);
	} catch {
		return false;
	}
}

function isIgnoredGeminiConversationPath(pathname: string): boolean {
	const match = pathname.match(/^\/app\/([^/?#]+)$/i);
	return Boolean(match?.[1] && isIgnoredGeminiConversationId(match[1]));
}

function isIgnoredGeminiConversationId(conversationId: string): boolean {
	return conversationId.toLowerCase() === "download";
}

function catalogConversationHasTerminalEvidence(
	record: Record<string, unknown>,
	metadata: Record<string, unknown>,
): boolean {
	const freshnessState =
		readConversationFreshnessString(record, metadata, "state") ??
		readCatalogStringField(record, ["freshnessState"]) ??
		readRecordString(metadata, ["freshnessState"]);
	const routeabilityState =
		readConversationFreshnessString(record, metadata, "routeabilityState") ??
		readCatalogStringField(record, ["routeabilityState"]) ??
		readRecordString(metadata, ["routeabilityState"]);
	return (
		freshnessState === "terminal_unavailable" ||
		freshnessState === "guarded" ||
		routeabilityState === "not_found_or_unavailable" ||
		routeabilityState === "identity_mismatch" ||
		routeabilityState === "guarded"
	);
}

function catalogConversationAssetsAlreadyComplete(
	record: Record<string, unknown>,
	metadata: Record<string, unknown>,
	freshnessState: string | null,
): boolean {
	if (freshnessState && freshnessState !== "fresh" && freshnessState !== "unknown") {
		return false;
	}
	const assetCompleteness =
		readConversationFreshnessString(record, metadata, "assetCompleteness") ??
		readCatalogStringField(record, ["assetCompleteness"]) ??
		readRecordString(metadata, ["assetCompleteness"]);
	if (assetCompleteness !== "complete") return false;
	const assetCounts = readConversationFreshnessRecord(record, metadata, "assetCounts");
	const missingLocal = readNumber(readRecordValue(assetCounts, ["missingLocal"]));
	return missingLocal === null || missingLocal <= 0;
}

function catalogConversationHasCompleteSelectedAssets(item: unknown): boolean {
	if (!isRecord(item)) return false;
	const metadata = isRecord(item.metadata) ? item.metadata : {};
	const freshnessState =
		readConversationFreshnessString(item, metadata, "state") ??
		readCatalogStringField(item, ["freshnessState"]) ??
		readRecordString(metadata, ["freshnessState"]);
	return catalogConversationAssetsAlreadyComplete(item, metadata, freshnessState);
}

function readConversationFreshnessString(
	record: Record<string, unknown>,
	metadata: Record<string, unknown>,
	field: string,
): string | null {
	const freshness = readConversationFreshnessRecord(record, metadata);
	return readRecordString(freshness, [field]) ?? readRecordString(metadata, [field]);
}

function readConversationFreshnessRecord(
	record: Record<string, unknown>,
	metadata: Record<string, unknown>,
	field?: string,
): Record<string, unknown> | null {
	const direct = readRecordValue(record, ["conversationFreshness", "freshness"]);
	const nested = isRecord(direct)
		? direct
		: readRecordValue(metadata, ["conversationFreshness", "freshness"]);
	if (!field) return isRecord(nested) ? nested : null;
	const value = readRecordValue(nested, [field]);
	return isRecord(value) ? value : null;
}

function countManifestAssetsForConversation(
	manifests: AccountMirrorCatalogEntry["manifests"],
	conversationId: string,
): { artifacts: number; files: number; media: number } {
	return {
		artifacts: manifests.artifacts.filter((item) =>
			manifestItemBelongsToConversation(item, conversationId),
		).length,
		files: manifests.files.filter((item) => manifestItemBelongsToConversation(item, conversationId))
			.length,
		media: manifests.media.filter((item) => manifestItemBelongsToConversation(item, conversationId))
			.length,
	};
}

function countEligibleManifestAssetsForConversation(
	manifests: AccountMirrorCatalogEntry["manifests"],
	conversationId: string,
	provider: ProviderId,
): { artifacts: number; files: number; media: number } {
	return {
		artifacts: manifests.artifacts.filter(
			(item) =>
				manifestItemBelongsToConversation(item, conversationId) &&
				catalogManifestAssetIsEligibleForMaterialization("artifact", item, provider),
		).length,
		files: manifests.files.filter(
			(item) =>
				manifestItemBelongsToConversation(item, conversationId) &&
				catalogManifestAssetIsEligibleForMaterialization("file", item, provider),
		).length,
		media: manifests.media.filter(
			(item) =>
				manifestItemBelongsToConversation(item, conversationId) &&
				catalogManifestAssetIsEligibleForMaterialization("media", item, provider),
		).length,
	};
}

function catalogConversationAssetFamilySignatures(
	manifests: AccountMirrorCatalogEntry["manifests"],
	conversationId: string,
	selectedKinds: HistoryMaterializationAssetKind[],
	provider: ProviderId,
): string[] {
	const signatures = new Set<string>();
	if (selectedKinds.includes("artifacts") || selectedKinds.includes("media")) {
		for (const item of manifests.artifacts) {
			if (!manifestItemBelongsToConversation(item, conversationId)) continue;
			if (!catalogManifestAssetIsEligibleForMaterialization("artifact", item, provider)) continue;
			const signature = catalogManifestAssetFamilySignature("artifact", item);
			if (signature) signatures.add(signature);
		}
	}
	if (selectedKinds.includes("files")) {
		for (const item of manifests.files) {
			if (!manifestItemBelongsToConversation(item, conversationId)) continue;
			if (!catalogManifestAssetIsEligibleForMaterialization("file", item, provider)) continue;
			const signature = catalogManifestAssetFamilySignature("file", item);
			if (signature) signatures.add(signature);
		}
	}
	if (selectedKinds.includes("media")) {
		for (const item of manifests.media) {
			if (!manifestItemBelongsToConversation(item, conversationId)) continue;
			if (!catalogManifestAssetIsEligibleForMaterialization("media", item, provider)) continue;
			const signature = catalogManifestAssetFamilySignature("media", item);
			if (signature) signatures.add(signature);
		}
	}
	return Array.from(signatures);
}

async function materializedArchiveAssetFamilySignatures(input: {
	runArchiveService: RunArchiveService;
	request: HistoryMaterializationCreateRequest;
	selectedKinds: HistoryMaterializationAssetKind[];
}): Promise<string[]> {
	const archive = await input.runArchiveService.listItems({
		provider: input.request.provider ?? null,
		runtimeProfile: input.request.runtimeProfile ?? null,
		assetAvailability: "available",
		limit: 500,
	});
	const signatures = new Set<string>();
	for (const item of archive.items) {
		if (input.request.boundIdentityKey && item.boundIdentityKey !== input.request.boundIdentityKey)
			continue;
		const signature = archiveItemAssetFamilySignature(item, input.selectedKinds);
		if (signature) signatures.add(signature);
	}
	return Array.from(signatures);
}

async function terminalVolatileAssetFamilySignatures(input: {
	jobStore: HistoryMaterializationJobStore;
	request: HistoryMaterializationCreateRequest;
	selectedKinds: HistoryMaterializationAssetKind[];
}): Promise<string[]> {
	const signatures = new Set<string>();
	for (const job of await input.jobStore.listJobs()) {
		if (isActiveStatus(job.status)) continue;
		if (input.request.provider && job.request.provider !== input.request.provider) continue;
		if (
			input.request.runtimeProfile &&
			job.request.runtimeProfile !== input.request.runtimeProfile
		) {
			continue;
		}
		if (
			input.request.boundIdentityKey &&
			job.request.boundIdentityKey !== input.request.boundIdentityKey
		) {
			continue;
		}
		for (const entry of job.result?.entries ?? []) {
			if (!isConfirmedVolatileMissingEntry(entry)) continue;
			for (const signature of historyEntryAssetFamilySignatures(entry, input.selectedKinds)) {
				signatures.add(signature);
			}
		}
	}
	return Array.from(signatures);
}

async function materializedAccountLibraryFileFamilySignatures(input: {
	runArchiveService: RunArchiveService;
	request: HistoryMaterializationCreateRequest;
}): Promise<string[]> {
	const archive = await input.runArchiveService.listItems({
		provider: input.request.provider ?? null,
		runtimeProfile: input.request.runtimeProfile ?? null,
		assetAvailability: "available",
		limit: 500,
	});
	const signatures = new Set<string>();
	for (const item of archive.items) {
		if (input.request.boundIdentityKey && item.boundIdentityKey !== input.request.boundIdentityKey)
			continue;
		const signature = archiveItemAccountLibraryFileFamilySignature(item);
		if (signature) signatures.add(signature);
	}
	return Array.from(signatures);
}

function isConfirmedVolatileMissingEntry(entry: HistoryMaterializationManifestEntry): boolean {
	if (entry.status !== "failed" && entry.status !== "skipped") return false;
	if (!isVolatileProviderAssetLocation(entry.remoteUrl) && !isVolatileProviderAssetLocation(entry.providerId)) {
		return false;
	}
	const reason = entry.reason?.trim().toLowerCase() ?? "";
	if (!reason) return true;
	return (
		reason.includes("expired") ||
		reason.includes("not found") ||
		reason.includes("not_found") ||
		reason.includes("missing") ||
		reason.includes("unavailable") ||
		reason.includes("tile_not_found") ||
		reason.includes("archive_linkage_missing")
	);
}

function isVolatileProviderAssetLocation(value: string | null | undefined): boolean {
	const normalized = value?.trim().toLowerCase();
	return Boolean(
		normalized?.startsWith("sandbox:") ||
			normalized?.includes(":sandbox:/") ||
			normalized?.startsWith("sediment://") ||
			normalized?.startsWith("chatgpt://file/"),
	);
}

function historyEntryAssetFamilySignatures(
	entry: HistoryMaterializationManifestEntry,
	selectedKinds: HistoryMaterializationAssetKind[],
): string[] {
	const field =
		entry.kind === "artifact" ? "artifacts" : entry.kind === "file" ? "files" : "media";
	if (!selectedKinds.includes(field)) return [];
	const title = normalizeAssetFamilyTitle(entry.title ?? entry.providerId);
	if (!title) return [];
	const kind = entry.kind;
	const sources = new Set<string>();
	const source =
		readAssetFamilySourceFromId(entry.providerId) ??
		readAssetFamilySourceFromId(entry.remoteUrl);
	if (source) sources.add(source.trim().toLowerCase());
	sources.add("unknown");
	if (entry.kind === "file") {
		sources.add("conversation");
		sources.add("file");
	}
	return Array.from(sources).map((candidateSource) => `${kind}:${candidateSource}:${title}`);
}

function archiveItemAccountLibraryFileFamilySignature(item: RunArchiveItem): string | null {
	if (item.kind !== "upload") return null;
	const metadata = isRecord(item.metadata) ? item.metadata : null;
	const source =
		readRecordString(metadata, ["source"]) ??
		readRecordString(metadata, ["fileSource"]) ??
		readAssetFamilySourceFromId(item.id) ??
		readAssetFamilySourceFromId(item.artifactId);
	if (source !== "chatgpt-library") return null;
	const providerFileId =
		readRecordString(metadata, ["providerFileId"]) ??
		readRecordString(metadata, ["fileId"]) ??
		(item.artifactId?.startsWith("file_") ? item.artifactId : null);
	if (providerFileId) return `file-id:${providerFileId}`;
	const title = normalizeAssetFamilyTitle(item.title ?? item.fileName ?? item.artifactId);
	const size = readNumber(readRecordValue(metadata, ["size"]));
	const mimeType = item.mimeType?.trim().toLowerCase() ?? null;
	if (!title) return null;
	return `title:${title}:mime:${mimeType ?? "unknown"}:size:${size ?? "unknown"}`;
}

function accountLibraryFileFamilySignature(file: FileRef): string | null {
	const metadata = isRecord(file.metadata) ? file.metadata : null;
	const providerFileId =
		readRecordString(metadata, ["providerFileId"]) ??
		extractChatgptProviderFileId(file.remoteUrl) ??
		(file.id.startsWith("file_") ? file.id : null);
	if (providerFileId) return `file-id:${providerFileId}`;
	const title = normalizeAssetFamilyTitle(file.name ?? file.id);
	const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : null;
	const mimeType = file.mimeType?.trim().toLowerCase() ?? null;
	if (!title) return null;
	return `title:${title}:mime:${mimeType ?? "unknown"}:size:${size ?? "unknown"}`;
}

function extractChatgptProviderFileId(value: string | null | undefined): string | null {
	if (!value?.startsWith("chatgpt://file/")) return null;
	const raw = value.slice("chatgpt://file/".length);
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

function archiveItemAssetFamilySignature(
	item: RunArchiveItem,
	selectedKinds: HistoryMaterializationAssetKind[],
): string | null {
	const field =
		item.kind === "generated_artifact"
			? "artifacts"
			: item.kind === "upload"
				? "files"
				: item.kind === "media_generation"
					? "media"
					: null;
	if (!field || !selectedKinds.includes(field)) return null;
	const kind = field === "artifacts" ? "artifact" : field === "files" ? "file" : "media";
	const metadata = isRecord(item.metadata) ? item.metadata : null;
	const rawTitle = item.title ?? item.fileName ?? item.artifactId;
	const title = normalizeAssetFamilyTitle(rawTitle);
	if (!title) return null;
	const rawSource =
		readRecordString(metadata, ["source"]) ??
		readRecordString(metadata, ["artifactKind"]) ??
		readRecordString(metadata, ["fileSource"]) ??
		readRecordString(metadata, ["providerFileSource"]) ??
		readAssetFamilySourceFromId(item.artifactId) ??
		readAssetFamilySourceFromId(readRecordString(metadata, ["providerFileId"]));
	const source = rawSource ? rawSource.trim().toLowerCase() : "unknown";
	return `${kind}:${source}:${title}`;
}

function catalogManifestAssetIsEligibleForMaterialization(
	kind: "artifact" | "file" | "media",
	item: unknown,
	provider: ProviderId,
): boolean {
	if (provider !== "chatgpt") return true;
	if (kind === "file" && isUnsupportedChatgptConversationFileManifestItem(item)) return false;
	if (kind === "artifact" && isChatgptStaticImageFalsePositiveManifestItem(item)) return false;
	return true;
}

function isUnsupportedChatgptConversationFileManifestItem(item: unknown): boolean {
	if (!isRecord(item)) return false;
	const metadata = isRecord(item.metadata) ? item.metadata : null;
	const source = readRecordString(metadata, ["source", "fileSource"]);
	if (source === "chatgpt-library") return false;
	if (readMaterializableAssetLocation(item, metadata)) return false;
	return Boolean(
		readCatalogStringField(item, ["conversationId"]) ??
			readRecordString(metadata, ["conversationId"]),
	);
}

function isChatgptStaticImageFalsePositiveManifestItem(item: unknown): boolean {
	if (!isRecord(item)) return false;
	const metadata = isRecord(item.metadata) ? item.metadata : null;
	const id = readCatalogStringField(item, ["id", "providerId", "artifactId"]) ?? "";
	const extraction = readRecordString(metadata, ["extraction"]);
	if (!id.startsWith("image-dom:") && extraction !== "dom-imagegen-image") return false;
	const location = readMaterializableAssetLocation(item, metadata);
	if (!location) return true;
	return isStaticChromeImageUrl(location);
}

function readMaterializableAssetLocation(
	item: unknown,
	metadata: Record<string, unknown> | null,
): string | null {
	return (
		readCatalogStringField(item, [
			"uri",
			"remoteUrl",
			"url",
			"href",
			"downloadUrl",
			"sourceUrl",
			"cacheKey",
			"fileId",
			"providerFileId",
		]) ??
		readRecordString(metadata, [
			"uri",
			"remoteUrl",
			"url",
			"href",
			"downloadUrl",
			"sourceUrl",
			"cacheKey",
			"fileId",
			"providerFileId",
		])
	);
}

function isStaticChromeImageUrl(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (!normalized) return true;
	if (normalized.startsWith("blob:")) return false;
	if (normalized.startsWith("chatgpt://")) return false;
	if (normalized.startsWith("sandbox:")) return false;
	if (normalized.startsWith("sediment://")) return false;
	try {
		const parsed = new URL(normalized);
		if (parsed.hostname === "www.google.com" && parsed.pathname === "/s2/favicons") return true;
		if (parsed.pathname.includes("/favicon")) return true;
		if (parsed.pathname.endsWith("/favicon.ico")) return true;
		return false;
	} catch {
		return false;
	}
}

function catalogManifestAssetFamilySignature(
	kind: "artifact" | "file" | "media",
	item: unknown,
): string | null {
	const metadata = isRecord(item) && isRecord(item.metadata) ? item.metadata : null;
	const rawTitle =
		readCatalogStringField(item, ["title", "name", "fileName", "prompt"]) ??
		readRecordString(metadata, ["title", "name", "fileName", "prompt"]);
	const title = normalizeAssetFamilyTitle(rawTitle);
	if (!title) return null;
	const rawSource =
		readCatalogStringField(item, ["source"]) ??
		readRecordString(metadata, ["source"]) ??
		readRecordString(metadata, ["artifactKind"]) ??
		readRecordString(metadata, ["fileSource"]) ??
		readAssetFamilySourceFromId(readCatalogStringField(item, ["id", "providerId", "artifactId"])) ??
		readAssetFamilySourceFromId(
			readRecordString(metadata, ["providerFileId", "artifactId", "fileId"]),
		);
	const source = rawSource ? rawSource.trim().toLowerCase() : "unknown";
	return `${kind}:${source}:${title}`;
}

function readAssetFamilySourceFromId(value: string | null): string | null {
	if (!value) return null;
	const parts = value
		.split(":")
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);
	if (parts.includes("download")) return "download";
	if (parts.includes("deep-research")) return "deep-research";
	if (parts.includes("conversation")) return "conversation";
	if (parts.includes("chatgpt-library")) return "chatgpt-library";
	if (parts.includes("account")) return "account";
	if (parts.includes("image-dom") || parts.includes("download-dom")) return parts[0] ?? null;
	return null;
}

function normalizeAssetFamilyTitle(value: string | null): string | null {
	if (!value) return null;
	const normalized = value
		.replace(/\s+\((?:word|pdf|markdown|docx|md)\)$/i, "")
		.replace(/\.(?:pdf|docx|md|markdown)$/i, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
	return normalized || null;
}

function manifestItemBelongsToConversation(item: unknown, conversationId: string): boolean {
	const metadata = isRecord(item) && isRecord(item.metadata) ? item.metadata : null;
	return (
		readCatalogStringField(item, ["conversationId"]) === conversationId ||
		readRecordString(metadata, ["conversationId"]) === conversationId
	);
}

function maxKnownCount(values: unknown[]): number {
	return values.reduce<number>((max, value) => {
		const number = readNumber(value);
		return number === null ? max : Math.max(max, number);
	}, 0);
}

function countAttemptedReconciliationAssetBudget(result: HistoryMaterializationResult): number {
	if (isTerminalConversationUnavailableResult(result)) return 0;
	return result.entries.length > 0
		? result.entries.length
		: result.metrics.materialized + result.metrics.failed + result.metrics.skipped;
}

function skippedResult(input: {
	now: () => Date;
	source: HistoryMaterializationJob["source"];
	target: HistoryMaterializationTarget | null;
	message: string;
}): HistoryMaterializationResult {
	return {
		object: "history_materialization_result",
		generatedAt: input.now().toISOString(),
		status: "skipped",
		target: input.target,
		source: input.source,
		manifestPaths: [],
		entries: [],
		archiveItems: [],
		metrics: {
			conversations: input.target ? 1 : 0,
			materialized: 0,
			skipped: 1,
			failed: 0,
		},
		message: input.message,
	};
}

type ArtifactManifestEntry = {
	artifactId: string;
	title?: string;
	kind?: ConversationArtifact["kind"];
	uri?: string | null;
	status: "materialized" | "skipped" | "error";
	fileId?: string;
	fileName?: string;
	localPath?: string;
	remoteUrl?: string | null;
	mimeType?: string;
	size?: number;
	materializationMethod?: string;
	error?: string;
};

type FileManifestEntry = {
	fileId: string;
	fileName?: string;
	status: "materialized" | "error";
	localPath?: string;
	remoteUrl?: string | null;
	mimeType?: string;
	size?: number;
	materializationMethod?: string;
	error?: string;
};

async function readArtifactManifestEntries(
	manifestPath: string | null,
): Promise<ArtifactManifestEntry[]> {
	const manifest = await readJsonManifest(manifestPath);
	const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
	return entries.filter(isRecord).map((entry) => ({
		artifactId: readRecordString(entry, ["artifactId"]) ?? "unknown",
		title: readRecordString(entry, ["title"]) ?? undefined,
		kind: normalizeArtifactKind(readRecordString(entry, ["kind"])),
		uri: readRecordString(entry, ["uri"]),
		status:
			entry.status === "materialized" || entry.status === "skipped" || entry.status === "error"
				? entry.status
				: "error",
		fileId: readRecordString(entry, ["fileId"]) ?? undefined,
		fileName: readRecordString(entry, ["fileName"]) ?? undefined,
		localPath: readRecordString(entry, ["localPath"]) ?? undefined,
		remoteUrl: readRecordString(entry, ["remoteUrl"]),
		mimeType: readRecordString(entry, ["mimeType"]) ?? undefined,
		size: readNumber(entry.size) ?? undefined,
		materializationMethod: readRecordString(entry, ["materializationMethod"]) ?? undefined,
		error: readRecordString(entry, ["error"]) ?? undefined,
	}));
}

async function readFileManifestEntries(manifestPath: string | null): Promise<FileManifestEntry[]> {
	const manifest = await readJsonManifest(manifestPath);
	const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
	return entries.filter(isRecord).map((entry) => ({
		fileId: readRecordString(entry, ["fileId"]) ?? "unknown",
		fileName: readRecordString(entry, ["fileName"]) ?? undefined,
		status: entry.status === "materialized" || entry.status === "error" ? entry.status : "error",
		localPath: readRecordString(entry, ["localPath"]) ?? undefined,
		remoteUrl: readRecordString(entry, ["remoteUrl"]),
		mimeType: readRecordString(entry, ["mimeType"]) ?? undefined,
		size: readNumber(entry.size) ?? undefined,
		materializationMethod: readRecordString(entry, ["materializationMethod"]) ?? undefined,
		error: readRecordString(entry, ["error"]) ?? undefined,
	}));
}

async function readJsonManifest(
	manifestPath: string | null,
): Promise<Record<string, unknown> | null> {
	if (!manifestPath) return null;
	try {
		const raw = await fs.readFile(manifestPath, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

async function historyEntryFromArtifactManifest(
	entry: ArtifactManifestEntry,
): Promise<HistoryMaterializationManifestEntry> {
	const checksumSha256 = await calculateFileSha256(entry.localPath ?? null);
	return {
		kind: "artifact",
		providerId: entry.artifactId,
		title: entry.title ?? null,
		status:
			entry.status === "materialized"
				? "materialized"
				: entry.status === "skipped"
					? "skipped"
					: "failed",
		localPath: entry.localPath ?? null,
		remoteUrl: entry.remoteUrl ?? entry.uri ?? null,
		cacheKey: checksumSha256
			? `sha256:${checksumSha256}`
			: entry.localPath
				? `path:${entry.localPath}`
				: null,
		checksumSha256,
		mimeType: entry.mimeType ?? null,
		size: readNumber(entry.size),
		materializationMethod: entry.materializationMethod ?? null,
		reason: entry.status === "materialized" ? null : (entry.error ?? entry.status),
		archiveItemId: null,
		assetRoute: null,
	};
}

async function historyEntryFromFileManifest(
	entry: FileManifestEntry,
): Promise<HistoryMaterializationManifestEntry> {
	const checksumSha256 = await calculateFileSha256(entry.localPath ?? null);
	return {
		kind: "file",
		providerId: entry.fileId,
		title: entry.fileName ?? null,
		status: entry.status === "materialized" ? "materialized" : "failed",
		localPath: entry.localPath ?? null,
		remoteUrl: entry.remoteUrl ?? null,
		cacheKey: checksumSha256
			? `sha256:${checksumSha256}`
			: entry.localPath
				? `path:${entry.localPath}`
				: null,
		checksumSha256,
		mimeType: entry.mimeType ?? null,
		size: readNumber(entry.size),
		materializationMethod: entry.materializationMethod ?? null,
		reason: entry.status === "materialized" ? null : (entry.error ?? entry.status),
		archiveItemId: null,
		assetRoute: null,
	};
}

function findArtifactManifestForFile(
	entries: ArtifactManifestEntry[],
	file: FileRef,
): ArtifactManifestEntry | null {
	return (
		entries.find(
			(entry) =>
				entry.fileId === file.id ||
				(entry.localPath && file.localPath && entry.localPath === file.localPath) ||
				(entry.fileName && entry.fileName === file.name),
		) ?? null
	);
}

function findFileManifestForFile(
	entries: FileManifestEntry[],
	file: FileRef,
): FileManifestEntry | null {
	return (
		entries.find(
			(entry) =>
				entry.fileId === file.id ||
				(entry.localPath && file.localPath && entry.localPath === file.localPath) ||
				(entry.fileName && entry.fileName === file.name),
		) ?? null
	);
}

function unsupportedEntry(
	kind: HistoryMaterializationManifestEntry["kind"],
	error: unknown,
	target: HistoryMaterializationTarget | null,
): HistoryMaterializationManifestEntry {
	return {
		kind,
		providerId: null,
		title: null,
		status: "skipped",
		localPath: null,
		remoteUrl: null,
		cacheKey: null,
		checksumSha256: null,
		mimeType: null,
		size: null,
		materializationMethod: null,
		reason: formatHistoryMaterializationFailureReason({ target, error }),
		archiveItemId: null,
		assetRoute: null,
	};
}

function noMaterializableEntry(
	kind: HistoryMaterializationManifestEntry["kind"],
	target: HistoryMaterializationTarget,
): HistoryMaterializationManifestEntry {
	return {
		kind,
		providerId: null,
		title: null,
		status: "skipped",
		localPath: null,
		remoteUrl: null,
		cacheKey: null,
		checksumSha256: null,
		mimeType: null,
		size: null,
		materializationMethod: null,
		reason: `no-materializable-${kind}: provider detail exposed no downloadable ${kind} assets for conversation ${target.conversationId}`,
		archiveItemId: null,
		assetRoute: null,
	};
}

function formatGeminiConversationRouteabilityReason(
	target: HistoryMaterializationTarget | null,
	message: string,
): string | null {
	if (target?.provider !== "gemini") return null;
	if (!/Gemini conversation .*content not found/i.test(message)) return null;
	const activeState = readActiveStateFromErrorMessage(message);
	if (!activeState) return null;
	const pathname = readRecordString(activeState, ["pathname"]);
	const href = readRecordString(activeState, ["href"]);
	const activeConversationId = readRecordString(activeState, ["conversationId"]);
	const bareAppRoute =
		pathname === "/app" ||
		href === "https://gemini.google.com/app" ||
		href === "https://gemini.google.com/app/";
	if (!bareAppRoute || activeConversationId) return null;
	const selector = [
		`conversation=${target.conversationId}`,
		target.runtimeProfile ? `runtimeProfile=${target.runtimeProfile}` : null,
		target.browserProfile ? `browserProfile=${target.browserProfile}` : null,
		target.boundIdentityKey ? `identity=${target.boundIdentityKey}` : null,
	]
		.filter(Boolean)
		.join(" ");
	return (
		`conversation-not-found-or-unavailable: Gemini routeability check for ${selector} landed on bare /app; ` +
		"treat the cached conversation id as deleted/non-existent in the tenant, unavailable to the active identity, " +
		`or opened under the wrong managed browser profile. activeState=${JSON.stringify(activeState)}`
	);
}

function readActiveStateFromErrorMessage(message: string): Record<string, unknown> | null {
	const marker = "activeState=";
	const index = message.indexOf(marker);
	if (index < 0) return null;
	const raw = message.slice(index + marker.length).trim();
	try {
		const parsed = JSON.parse(raw) as unknown;
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function applyArchiveLinks(
	entries: HistoryMaterializationManifestEntry[],
	archiveItems: RunArchiveItem[],
): void {
	for (const entry of entries) {
		if (entry.status !== "materialized") continue;
		const match = archiveItems.find(
			(item) =>
				(entry.localPath && item.localPath === entry.localPath) ||
				(entry.providerId && item.artifactId === entry.providerId),
		);
		const duplicateTarget =
			match ??
			archiveItems.find(
				(item) => entry.checksumSha256 && item.checksumSha256 === entry.checksumSha256,
			);
		if (duplicateTarget) {
			entry.archiveItemId = duplicateTarget.id;
			entry.assetRoute = duplicateTarget.links.asset ?? null;
			entry.cacheKey = entry.cacheKey ?? duplicateTarget.cacheKey;
			entry.checksumSha256 = entry.checksumSha256 ?? duplicateTarget.checksumSha256;
			if (!match) {
				entry.status = "duplicate";
				entry.reason = `already_materialized_alias:${duplicateTarget.id}`;
			}
			continue;
		}
		entry.status = "failed";
		entry.reason = "archive_linkage_missing";
	}
}

function summarizeEntries(
	entries: HistoryMaterializationManifestEntry[],
	conversations: number,
): HistoryMaterializationResult["metrics"] {
	return {
		conversations,
		materialized: entries.filter((entry) => entry.status === "materialized").length,
		duplicateAliases: entries.filter((entry) => entry.status === "duplicate").length,
		skipped: entries.filter((entry) => entry.status === "skipped").length,
		failed: entries.filter((entry) => entry.status === "failed").length,
	};
}

function normalizeProviderId(value: unknown): ProviderId | null {
	return value === "chatgpt" || value === "gemini" || value === "grok" ? value : null;
}

function normalizeCatalogKind(value: unknown): AccountMirrorCatalogKind | null {
	if (
		value === "all" ||
		value === "projects" ||
		value === "conversations" ||
		value === "artifacts" ||
		value === "files" ||
		value === "media"
	) {
		return value;
	}
	return null;
}

function normalizeAssetSource(value: unknown): HistoryMaterializationAssetSource | null {
	return value === "account-library" ? value : null;
}

function normalizeArtifactKind(value: string | null): ConversationArtifact["kind"] | undefined {
	if (
		value === "document" ||
		value === "download" ||
		value === "canvas" ||
		value === "generated" ||
		value === "image" ||
		value === "spreadsheet"
	) {
		return value;
	}
	return undefined;
}

function normalizeAssetKinds(
	value: HistoryMaterializationAssetKind[] | null | undefined,
): HistoryMaterializationAssetKind[] {
	const values = Array.isArray(value) ? value : [];
	if (values.length === 0) return ["artifacts", "files"];
	if (values.includes("all")) return ["artifacts", "files", "media"];
	return Array.from(
		new Set(
			values.filter((entry) => entry === "artifacts" || entry === "files" || entry === "media"),
		),
	);
}

function normalizeRequestedAssetKinds(
	value: HistoryMaterializationAssetKind[] | null | undefined,
): HistoryMaterializationAssetKind[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	return normalizeAssetKinds(value);
}

function normalizeOptionalString(value: string | null | undefined): string | null {
	const normalized = typeof value === "string" ? value.trim() : "";
	return normalized || null;
}

function normalizeConversationIds(value: string[] | null | undefined): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(
			value
				.map((entry) => normalizeOptionalString(entry))
				.filter((entry): entry is string => Boolean(entry)),
		),
	);
}

export function resolveHistoryMaterializationProviderListOptions(
	target: HistoryMaterializationTarget,
): HistoryMaterializationProviderListOptions {
	const providerConversationUrl =
		target.providerConversationUrl ??
		resolveProviderConversationUrl(target.provider, target.conversationId) ??
		undefined;
	return {
		configuredUrl: resolveHistoryMaterializationConfiguredUrl(target, providerConversationUrl),
		tabUrl: providerConversationUrl,
		projectId: target.projectId ?? undefined,
		allowNavigation: true,
		expectedUserIdentity: resolveHistoryMaterializationExpectedIdentity(target),
		skipFeatureSignature: true,
	};
}

function resolveHistoryMaterializationConfiguredUrl(
	target: HistoryMaterializationTarget,
	providerConversationUrl: string | undefined,
): string | undefined {
	if (target.provider !== "gemini") return providerConversationUrl;
	const projectId = normalizeOptionalString(target.projectId);
	if (projectId) {
		return `https://gemini.google.com/gem/${encodeURIComponent(projectId)}`;
	}
	return "https://gemini.google.com/app";
}

function resolveHistoryMaterializationExpectedIdentity(
	target: HistoryMaterializationTarget,
): HistoryMaterializationProviderListOptions["expectedUserIdentity"] {
	const boundIdentityKey = normalizeOptionalString(target.boundIdentityKey);
	if (!boundIdentityKey) return undefined;
	if (
		(target.provider === "gemini" || target.provider === "chatgpt") &&
		/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(boundIdentityKey)
	) {
		return { email: boundIdentityKey.toLowerCase() };
	}
	if (target.provider === "grok" && /^@[A-Za-z0-9_]{2,32}$/.test(boundIdentityKey)) {
		return { handle: boundIdentityKey };
	}
	return undefined;
}

function normalizeProviderConversationTargetFields(
	provider: ProviderId,
	conversationId: string | null | undefined,
	providerConversationUrl: string | null | undefined,
): { conversationId: string; providerConversationUrl: string | null } | null {
	const rawConversationId = normalizeOptionalString(conversationId);
	const rawProviderConversationUrl = normalizeOptionalString(providerConversationUrl);
	if (provider !== "gemini") {
		if (!rawConversationId) return null;
		return {
			conversationId: rawConversationId,
			providerConversationUrl:
				rawProviderConversationUrl ?? resolveProviderConversationUrl(provider, rawConversationId),
		};
	}
	const normalizedConversationId =
		normalizeGeminiConversationId(rawConversationId) ??
		extractGeminiConversationIdFromProviderConversationUrl(rawProviderConversationUrl);
	if (!normalizedConversationId) return null;
	return {
		conversationId: normalizedConversationId,
		providerConversationUrl: resolveProviderConversationUrl(provider, normalizedConversationId),
	};
}

function normalizeGeminiConversationId(value: string | null): string | null {
	const raw = normalizeOptionalString(value);
	if (!raw) return null;
	const fromUrl = extractGeminiConversationIdFromProviderConversationUrl(raw);
	if (fromUrl) return fromUrl;
	if (/[?#&]/.test(raw)) return null;
	const appPathMatch = raw.match(/^\/?app\/([^/?#&]+)/i);
	const stripped = normalizeOptionalString(appPathMatch?.[1] ?? raw);
	if (!stripped || isIgnoredGeminiConversationId(stripped)) return null;
	if (!/^[A-Za-z0-9_-]+$/.test(stripped)) return null;
	return stripped;
}

function extractGeminiConversationIdFromProviderConversationUrl(
	value: string | null,
): string | null {
	const raw = normalizeOptionalString(value);
	if (!raw || !/^https?:\/\//i.test(raw)) return null;
	try {
		const parsed = new URL(raw);
		if (parsed.hostname === "gemini.google.com") {
			if (parsed.search || parsed.hash) return null;
			return normalizeGeminiConversationIdFromPathname(parsed.pathname);
		}
		return null;
	} catch {
		return null;
	}
}

function normalizeGeminiConversationIdFromPathname(pathname: string): string | null {
	const match = pathname.match(/^\/app\/([^/?#&]+)$/i);
	const conversationId = normalizeOptionalString(match?.[1]);
	if (!conversationId || isIgnoredGeminiConversationId(conversationId)) return null;
	if (!/^[A-Za-z0-9_-]+$/.test(conversationId)) return null;
	return conversationId;
}

function normalizeMaxItems(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return Math.max(0, Math.min(500, Math.trunc(value)));
}

function normalizeProviderWorkTimeoutMs(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
	return Math.max(1, Math.trunc(value));
}

function normalizeQueuedStaleThresholdMs(job: HistoryMaterializationJob): number {
	return normalizeProviderWorkTimeoutMs(job.request.providerWorkTimeoutMs) ?? 120_000;
}

function normalizeListLimit(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 50;
	return Math.max(0, Math.min(500, Math.trunc(value)));
}

function decrementRemaining(value: number | null, count: number): number | null {
	if (value === null) return null;
	return Math.max(0, value - count);
}

function isActiveStatus(status: HistoryMaterializationJobStatus): boolean {
	return status === "queued" || status === "running";
}

function canRunningJobTimeout(job: HistoryMaterializationJob): boolean {
	return job.status === "running";
}

function resolveRunningStaleThresholdMs(job: HistoryMaterializationJob): number {
	return (
		normalizeProviderWorkTimeoutMs(job.request.providerWorkTimeoutMs) ??
		DEFAULT_RUNNING_STALE_THRESHOLD_MS
	);
}

function isTimedOutRunningJob(job: HistoryMaterializationJob, now: Date): boolean {
	if (!canRunningJobTimeout(job)) return false;
	const timeoutMs = resolveRunningStaleThresholdMs(job);
	const startedAtMs = Date.parse(job.startedAt ?? job.updatedAt);
	if (!Number.isFinite(startedAtMs)) return false;
	return now.getTime() - startedAtMs >= timeoutMs;
}

function usesAccountLibraryProviderWorkTimeout(job: HistoryMaterializationJob): boolean {
	return (
		job.source.type === "account_library_reconciliation" &&
		normalizeProviderWorkTimeoutMs(job.request.providerWorkTimeoutMs) !== null
	);
}

function formatRunningTimeoutMessage(job: HistoryMaterializationJob, timeoutMs: number): string {
	if (usesAccountLibraryProviderWorkTimeout(job)) {
		return `Account-library materialization job exceeded provider-work timeout (${timeoutMs}ms).`;
	}
	return `History materialization job exceeded running stale threshold (${timeoutMs}ms).`;
}

function summarizeHistoryMaterializationJobScheduler(
	job: HistoryMaterializationJob,
	now: Date,
	options: { scheduled: boolean },
): HistoryMaterializationJobSchedulerDiagnostics {
	const generatedAt = now.toISOString();
	const createdAtMs = Date.parse(job.createdAt);
	const startedAtMs = Date.parse(job.startedAt ?? "");
	const nowMs = now.getTime();
	const queuedAgeMs =
		job.status === "queued" && Number.isFinite(createdAtMs)
			? Math.max(0, nowMs - createdAtMs)
			: null;
	const runAgeMs =
		job.status === "running" && Number.isFinite(startedAtMs)
			? Math.max(0, nowMs - startedAtMs)
			: null;
	const queuedToStartLatencyMs =
		Number.isFinite(createdAtMs) && Number.isFinite(startedAtMs)
			? Math.max(0, startedAtMs - createdAtMs)
			: null;
	const terminal = !isActiveStatus(job.status);
	const queuedStaleThresholdMs = normalizeQueuedStaleThresholdMs(job);
	const staleQueued =
		job.status === "queued" &&
		!options.scheduled &&
		queuedAgeMs !== null &&
		queuedAgeMs >= queuedStaleThresholdMs;
	const runningTimedOut = isTimedOutRunningJob(job, now);
	const stale = staleQueued || runningTimedOut;
	const staleReason = staleQueued
		? `queued account-library materialization job has not been scheduled by this API process for ${queuedAgeMs}ms (threshold ${queuedStaleThresholdMs}ms)`
		: runningTimedOut
			? usesAccountLibraryProviderWorkTimeout(job)
				? `running account-library materialization job exceeded provider-work timeout (${resolveRunningStaleThresholdMs(job)}ms)`
				: `running history materialization job exceeded stale threshold (${resolveRunningStaleThresholdMs(job)}ms)`
			: null;
	const dispatchState = terminal
		? "terminal"
		: job.status === "running"
			? "running"
			: options.scheduled
				? "scheduled"
				: "unscheduled";
	const state = job.status === "queued" && staleQueued ? "stale_queued" : job.status;
	return {
		object: "history_materialization_job_scheduler",
		generatedAt,
		state,
		dispatchState,
		queuedAgeMs,
		runAgeMs,
		queuedToStartLatencyMs,
		stale,
		staleReason,
	};
}

function matchesStatusFilter(
	job: HistoryMaterializationJob,
	status: HistoryMaterializationJobListRequest["status"] | null,
): boolean {
	if (!status) return true;
	if (status === "active") return isActiveStatus(job.status);
	if (status === "terminal") return !isActiveStatus(job.status);
	return job.status === status;
}

async function findActiveJobForSource(
	store: HistoryMaterializationJobStore,
	sourceKey: string,
	recoverTimedOutJob: (
		job: HistoryMaterializationJob | null,
	) => Promise<HistoryMaterializationJob | null>,
): Promise<HistoryMaterializationJob | null> {
	const jobs = await store.listJobs();
	for (const job of jobs) {
		if (job.sourceKey !== sourceKey || !isActiveStatus(job.status)) continue;
		const recovered = await recoverTimedOutJob(job);
		if (recovered && isActiveStatus(recovered.status)) return recovered;
	}
	return null;
}

function summarizeJobs(
	jobs: HistoryMaterializationJob[],
): HistoryMaterializationJobListResult["metrics"] {
	const byStatus: Record<string, number> = {};
	let active = 0;
	let terminal = 0;
	for (const job of jobs) {
		byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;
		if (isActiveStatus(job.status)) active += 1;
		else terminal += 1;
	}
	return {
		total: jobs.length,
		byStatus,
		active,
		terminal,
	};
}

async function readJobStoreFile(filePath: string): Promise<HistoryMaterializationJob[]> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isHistoryMaterializationJob).map(normalizeHistoryMaterializationJob);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

async function writeJobStoreFile(
	filePath: string,
	jobs: HistoryMaterializationJob[],
): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const tmpPath = `${filePath}.${randomUUID()}.tmp`;
	await fs.writeFile(tmpPath, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
	await fs.rename(tmpPath, filePath);
}

function isHistoryMaterializationJob(value: unknown): value is HistoryMaterializationJob {
	if (!isRecord(value)) return false;
	return (
		value.object === "history_materialization_job" &&
		typeof value.id === "string" &&
		isRecord(value.source) &&
		typeof value.sourceKey === "string" &&
		typeof value.status === "string"
	);
}

function normalizeHistoryMaterializationJob(
	job: HistoryMaterializationJob,
): HistoryMaterializationJob {
	return {
		...job,
		request: normalizeCreateRequest(job.request),
	};
}

function historyMaterializationJobError(error: unknown): HistoryMaterializationJob["error"] {
	if (error instanceof HistoryMaterializationError) {
		return {
			message: error.message,
			type: error.statusCode === 404 ? "not_found_error" : "invalid_request_error",
			statusCode: error.statusCode,
		};
	}
	if (isProviderAuthPreflightError(error)) {
		return {
			message: error instanceof Error ? error.message : "Provider browser auth preflight failed.",
			type: "provider_auth_conflict",
			statusCode: 409,
		};
	}
	if (isProviderHumanVerificationError(error)) {
		return {
			message:
				error instanceof Error
					? error.message
					: "Provider human-verification guard requires manual clearance.",
			type: "provider_guard_required",
			statusCode: 409,
		};
	}
	return {
		message: error instanceof Error ? error.message : "History materialization job failed.",
		type: "internal_error",
		statusCode: 500,
	};
}

function isProviderAuthPreflightError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("browser auth preflight failed") ||
		message.includes("account_session_drift") ||
		message.includes("expected_identity_missing")
	);
}

function isProviderHumanVerificationError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /google\.com\/sorry|unusual traffic|recaptcha|captcha|human[-_ ]verification|anti[-_ ]?bot/i.test(
		message,
	);
}

function withRuntimeProfileSelection(
	config: ResolvedUserConfig | Record<string, unknown>,
	provider: ProviderId | null,
	runtimeProfile: string | null,
): Record<string, unknown> {
	return resolveRuntimeProfileUserConfig(config, {
		runtimeProfileId: runtimeProfile,
		provider,
	}) as Record<string, unknown>;
}

async function cleanupHistoryMaterializationManagedBrowser(
	config: ResolvedUserConfig | Record<string, unknown>,
	request: HistoryMaterializationCreateRequest,
): Promise<void> {
	const provider = normalizeProviderId(request.provider) ?? null;
	if (!provider) return;
	const runtimeProfile = request.runtimeProfile ?? null;
	const runtimeConfig = withRuntimeProfileSelection(config, provider, runtimeProfile);
	const browserConfig = isRecord(runtimeConfig.browser) ? runtimeConfig.browser : null;
	const managedProfileDirs = new Set<string>();
	const browserProfileName = resolveHistoryMaterializationBrowserProfileName(
		config,
		runtimeProfile,
		request.browserProfile ?? null,
	);
	const manualLoginProfileDir = readRecordString(browserConfig, ["manualLoginProfileDir"]);
	if (manualLoginProfileDir) managedProfileDirs.add(path.resolve(manualLoginProfileDir));
	const launchContext = resolveManagedBrowserLaunchContextFromResolvedConfig({
		auracallProfile: readRecordString(runtimeConfig, ["auracallProfile"]) ?? runtimeProfile,
		browserProfileName,
		browser: browserConfig,
		target: provider,
	});
	managedProfileDirs.add(path.resolve(launchContext.managedProfileDir));
	for (const managedProfileDir of managedProfileDirs) {
		const primaryPid = await findChromePidUsingUserDataDir(managedProfileDir).catch(() => null);
		const pids = await findHistoryMaterializationManagedBrowserPids(managedProfileDir);
		if (primaryPid) pids.add(primaryPid);
		if (pids.size === 0) continue;
		await terminateHistoryMaterializationManagedBrowserPids([...pids]).catch(() => undefined);
	}
}

function resolveHistoryMaterializationBrowserProfileName(
	config: ResolvedUserConfig | Record<string, unknown>,
	runtimeProfile: string | null,
	requestBrowserProfile: string | null,
): string | null {
	if (requestBrowserProfile) return requestBrowserProfile;
	if (!runtimeProfile || !isRecord(config)) return null;
	const runtimeProfiles = isRecord(config.runtimeProfiles) ? config.runtimeProfiles : null;
	const runtimeProfileConfig = isRecord(runtimeProfiles?.[runtimeProfile])
		? runtimeProfiles[runtimeProfile]
		: null;
	return readRecordString(runtimeProfileConfig, ["browserProfile", "browserFamily"]);
}

async function findHistoryMaterializationManagedBrowserPids(
	managedProfileDir: string,
): Promise<Set<number>> {
	const pids = new Set<number>();
	try {
		const { stdout } = await execFileAsync("ps", ["-ax", "-o", "pid,args"], {
			maxBuffer: 10 * 1024 * 1024,
		});
		for (const line of String(stdout ?? "").split("\n")) {
			const match = line.match(/^\s*(\d+)\s+(.*)$/);
			if (!match) continue;
			const pid = Number.parseInt(match[1], 10);
			const commandLine = match[2] ?? "";
			const lowerCommandLine = commandLine.toLowerCase();
			if (!Number.isFinite(pid) || pid <= 0) continue;
			if (!lowerCommandLine.includes("chrome") && !lowerCommandLine.includes("chromium")) {
				continue;
			}
			if (!commandLine.includes("--user-data-dir") || !commandLine.includes(managedProfileDir)) {
				continue;
			}
			pids.add(pid);
		}
	} catch {
		// best effort
	}
	return pids;
}

async function terminateHistoryMaterializationManagedBrowserPids(pids: number[]): Promise<void> {
	for (const pid of pids) {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			// already stopped
		}
	}
	await new Promise((resolve) => setTimeout(resolve, 1500));
	for (const pid of pids) {
		try {
			process.kill(pid, 0);
			process.kill(pid, "SIGKILL");
		} catch {
			// already stopped
		}
	}
}

function resolveProviderConversationUrl(
	provider: ProviderId,
	conversationId: string | null,
): string | null {
	if (!conversationId) return null;
	if (provider === "gemini")
		return `https://gemini.google.com/app/${encodeURIComponent(conversationId)}`;
	if (provider === "chatgpt") return `https://chatgpt.com/c/${encodeURIComponent(conversationId)}`;
	if (provider === "grok") return `https://grok.com/chat/${encodeURIComponent(conversationId)}`;
	return null;
}

function resolveProviderProjectUrl(provider: ProviderId, projectId: string | null): string | null {
	if (!projectId) return null;
	if (provider === "chatgpt")
		return `https://chatgpt.com/g/${encodeURIComponent(projectId)}/project`;
	if (provider === "gemini")
		return `https://gemini.google.com/gem/${encodeURIComponent(projectId)}`;
	return null;
}

function readCatalogStringField(item: unknown, fields: string[]): string | null {
	if (!isRecord(item)) return null;
	return readRecordString(item, fields);
}

function readCatalogNumberField(item: unknown, fields: string[]): number {
	if (!isRecord(item)) return 0;
	for (const field of fields) {
		const value = item[field];
		const number = readNumber(value);
		if (number !== null) return number;
	}
	return 0;
}

function readRecordString(value: unknown, keys: string[]): string | null {
	if (!isRecord(value)) return null;
	for (const key of keys) {
		const entry = value[key];
		if (typeof entry === "string" && entry.trim().length > 0) return entry.trim();
		if (typeof entry === "number" && Number.isFinite(entry)) return String(entry);
	}
	return null;
}

function readRecordValue(value: unknown, keys: string[]): unknown {
	if (!isRecord(value)) return undefined;
	for (const key of keys) {
		if (Object.hasOwn(value, key)) return value[key];
	}
	return undefined;
}

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeMediaGenerationType(value: unknown): MediaGenerationType | null {
	const normalized = typeof value === "string" ? value.toLowerCase() : "";
	if (normalized.includes("image") || /\.(avif|gif|jpe?g|png|webp)(?:[?#\s]|$)/i.test(normalized))
		return "image";
	if (normalized.includes("video") || /\.(m4v|mov|mp4|webm)(?:[?#\s]|$)/i.test(normalized))
		return "video";
	if (normalized.includes("music") || normalized.includes("song") || normalized.includes("track"))
		return "music";
	return null;
}

function normalizeMediaMatchTitle(value: string | null | undefined): string | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");
	return normalized.length > 0 ? normalized : null;
}

function parseTimestampMs(value: string | null | undefined): number | null {
	const timestamp = Date.parse(String(value ?? ""));
	return Number.isFinite(timestamp) ? timestamp : null;
}

function countCatalogMediaByConversation(items: unknown[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const item of items) {
		const metadata = isRecord(item) && isRecord(item.metadata) ? item.metadata : {};
		const conversationId =
			readCatalogStringField(item, ["conversationId"]) ??
			readRecordString(metadata, ["conversationId"]);
		if (!conversationId) continue;
		counts.set(conversationId, (counts.get(conversationId) ?? 0) + 1);
	}
	return counts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function calculateFileSha256(localPath: string | null): Promise<string | null> {
	if (!localPath) return null;
	try {
		const buffer = await fs.readFile(localPath);
		return createHash("sha256").update(buffer).digest("hex");
	} catch {
		return null;
	}
}

function stableKey(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map((entry) => stableKey(entry)).join(",")}]`;
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableKey(record[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
