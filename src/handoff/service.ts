import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAuracallHomeDir } from "../auracallHome.js";
import {
	getPreferredRuntimeProfile,
	getPreferredRuntimeProfileName,
	getRuntimeProfileBrowserProfileId,
} from "../config/model.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";

type MutableRecord = Record<string, unknown>;

export type HandoffProvider = "chatgpt" | "gemini" | "grok";
export type HandoffPhase =
	| "discover_source"
	| "cache_source"
	| "verify_source"
	| "analyze"
	| "discover_target"
	| "preview_target";

export const HANDOFF_PACKET_SCHEMA = "auracall.handoff-packet.v1";
export const HANDOFF_RUN_SCHEMA = "auracall.handoff-run.v1";
export const HANDOFF_LEDGER_SCHEMA = "auracall.handoff-ledger.v1";
export const HANDOFF_ANALYSIS_SCHEMA = "auracall.handoff-analysis-decision.v1";
export const HANDOFF_SUBMISSION_PLAN_SCHEMA = "auracall.handoff-submission-plan.v1";

export interface HandoffEndpointCapabilities {
	readConversationContext: boolean;
	materializeArtifacts: boolean;
	uploadFiles: boolean;
	submitMessage: boolean;
	readTargetResponse: boolean;
}

export interface HandoffEndpoint {
	provider: HandoffProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	accountBindingKey: string;
	accountMirrorTenantKey: string | null;
	conversationRef: string | null;
	projectRef: string | null;
	capabilities: HandoffEndpointCapabilities;
}

export interface HandoffManifestItem {
	id: string;
	kind: "file" | "artifact" | "media" | "context" | "archive_item";
	title: string | null;
	localPath: string | null;
	archiveItemId: string | null;
	sourceRef: string | null;
	mimeType: string | null;
	sizeBytes: number | null;
	checksumSha256: string | null;
	materializationMethod: string | null;
	importanceHint: number | null;
}

export interface HandoffOmission {
	id: string;
	kind: string;
	sourceRef: string | null;
	reason: string;
	retryable: boolean;
}

export type HandoffSourceMaterializationImportMethod = "json_file" | "api_read" | "api_create";

export interface HandoffSourceMaterializationJobEvidence {
	jobId: string;
	status: string | null;
	sourceType: string | null;
	importMethod: HandoffSourceMaterializationImportMethod | null;
	reused: boolean | null;
	reuseReason: string | null;
	hasResult: boolean;
	terminal: boolean;
}

export interface HandoffSourceMaterializationJobsReport {
	object: "auracall.handoff-source-materialization-jobs.v1";
	generatedAt: string;
	jobs: HandoffSourceMaterializationJobEvidence[];
	metrics: {
		total: number;
		importedJson: number;
		apiRead: number;
		apiCreated: number;
		terminal: number;
		withResult: number;
	};
}

export interface HandoffSourceContext {
	object: "handoff_source_context";
	sourceRef: string;
	status: "provided" | "not_cached";
	payload: unknown;
	metrics: {
		messageCount: number;
	};
}

export interface HandoffCompleteness {
	state: "complete" | "partial" | "not_cached";
	contextProvided: boolean;
	messageCount: number;
	manifestItemCount: number;
	localMaterializedCount: number;
	checksumCount: number;
	omissionCount: number;
	retryableOmissionCount: number;
}

export interface HandoffAnalysisDecision {
	object: typeof HANDOFF_ANALYSIS_SCHEMA;
	generatedAt: string;
	decisionSource: "deterministic-dry-run";
	schemaValid: boolean;
	sourceMaterializationJobIds: string[];
	selectedManifestItemIds: string[];
	compactContext: {
		sourceProvider: HandoffProvider;
		sourceRef: string | null;
		targetProvider: HandoffProvider;
		messageCount: number;
		materializedItemCount: number;
		omissionCount: number;
		summary: string;
	};
	targetPrimer: string;
	warnings: string[];
}

export interface HandoffSubmissionPlan {
	object: typeof HANDOFF_SUBMISSION_PLAN_SCHEMA;
	generatedAt: string;
	dryRun: true;
	targetMutationAllowed: false;
	target: HandoffEndpoint;
	selectedManifestItemIds: string[];
	selectedFileCount: number;
	selectedTotalBytes: number | null;
	primerRef: string;
	compactContextRef: string;
	requiredApproval: "target-submit";
	zeroTargetMutationEvidence: {
		submitTargetPhaseSkipped: true;
		uploadAttemptCount: 0;
		submitAttemptCount: 0;
	};
}

export interface HandoffRunRecord {
	object: typeof HANDOFF_RUN_SCHEMA;
	id: string;
	schema: typeof HANDOFF_PACKET_SCHEMA;
	createdAt: string;
	updatedAt: string;
	status: "preview_ready";
	dryRun: true;
	phases: Record<HandoffPhase, "completed" | "skipped">;
	source: HandoffEndpoint;
	target: HandoffEndpoint;
	sourceCompleteness: HandoffCompleteness;
	packetPath: string;
	artifacts: {
		sourceContext: string;
		sourceManifest: string;
		sourceOmissions: string;
		analysisDecision: string;
		compactContext: string;
		targetPrimer: string;
		targetSubmissionPlan: string;
	};
}

export interface HandoffRunLedger {
	object: typeof HANDOFF_LEDGER_SCHEMA;
	runId: string;
	createdAt: string;
	updatedAt: string;
	status: HandoffRunRecord["status"];
	packetPath: string;
	mode: "preview";
	approvalPolicy: {
		upload: "not_allowed_preview";
		submit: "not_allowed_preview";
	};
	approvalEvents: unknown[];
	eventCount: number;
	sourceMaterializationJobs: HandoffSourceMaterializationJobEvidence[];
	targetMutationAllowed: false;
	repairState: {
		resumableFrom: "preview_target";
	};
}

export interface HandoffPrepareRequest {
	config: MutableRecord;
	sourceProvider: HandoffProvider | string;
	sourceRuntimeProfile?: string | null;
	sourceRef: string;
	sourceProjectRef?: string | null;
	targetProvider: HandoffProvider | string;
	targetRuntimeProfile?: string | null;
	targetRef?: string | null;
	targetProjectRef?: string | null;
	sourceContext?: unknown;
	sourceManifest?: unknown;
	sourceOmissions?: unknown;
	sourceMaterializationReadbacks?: unknown[] | null;
	sourceMaterializationReadbackSources?: HandoffSourceMaterializationImportMethod[] | null;
	outputRoot?: string | null;
	handoffId?: string | null;
	generatedAt?: string;
	maxSelectedArtifacts?: number | null;
}

export interface HandoffPrepareResult {
	object: "auracall.handoff.prepare.result";
	generatedAt: string;
	packetPath: string;
	run: HandoffRunRecord;
	sourceCompleteness: HandoffCompleteness;
	analysis: HandoffAnalysisDecision;
	submissionPlan: HandoffSubmissionPlan;
}

export interface HandoffStatusResult {
	object: "auracall.handoff.status.result";
	generatedAt: string;
	packetPath: string;
	packetDigest: string;
	eventCount: number;
	run: HandoffRunRecord;
	ledger: HandoffRunLedger | null;
	sourceMaterializationJobs: HandoffSourceMaterializationJobsReport | null;
	sourceCompleteness: HandoffCompleteness;
	analysis: HandoffAnalysisDecision | null;
	target: {
		submissionPlan: HandoffSubmissionPlan | null;
		submissionResult: unknown | null;
		readback: unknown | null;
		mutationAllowed: boolean;
		uploadAttemptCount: number;
		submitAttemptCount: number;
	};
}

export async function prepareCrossServiceHandoffPacket(
	request: HandoffPrepareRequest,
): Promise<HandoffPrepareResult> {
	const generatedAt = request.generatedAt ?? new Date().toISOString();
	const handoffId =
		normalizeHandoffId(request.handoffId) ?? `handoff_${Date.now()}_${randomUUID()}`;
	const packetPath = path.resolve(
		request.outputRoot ?? path.join(getAuracallHomeDir(), "handoffs"),
		handoffId,
	);
	const sourceProvider = normalizeHandoffProvider(request.sourceProvider);
	const targetProvider = normalizeHandoffProvider(request.targetProvider);
	const source = resolveHandoffEndpoint(request.config, {
		provider: sourceProvider,
		runtimeProfile: request.sourceRuntimeProfile,
		conversationRef: request.sourceRef,
		projectRef: request.sourceProjectRef,
		role: "source",
	});
	const target = resolveHandoffEndpoint(request.config, {
		provider: targetProvider,
		runtimeProfile: request.targetRuntimeProfile,
		conversationRef: request.targetRef ?? null,
		projectRef: request.targetProjectRef,
		role: "target",
	});
	const sourceContext = normalizeSourceContext(request.sourceContext, request.sourceRef);
	const importedReadback = importSourceMaterializationReadbacks(
		request.sourceMaterializationReadbacks,
		request.sourceMaterializationReadbackSources,
	);
	const sourceMaterializationJobs = buildSourceMaterializationJobsReport(
		generatedAt,
		importedReadback.jobs,
	);
	const manifestItems = mergeManifestItems([
		...normalizeManifestItems(request.sourceManifest),
		...importedReadback.manifestItems,
	]);
	const omissions = mergeOmissions([
		...normalizeOmissions(request.sourceOmissions),
		...importedReadback.omissions,
	]);
	const completeness = summarizeCompleteness(sourceContext, manifestItems, omissions);
	const analysis = buildAnalysisDecision({
		generatedAt,
		source,
		target,
		sourceContext,
		manifestItems,
		omissions,
		sourceMaterializationJobIds: importedReadback.jobIds,
		maxSelectedArtifacts: request.maxSelectedArtifacts,
	});
	const submissionPlan = buildSubmissionPlan({
		generatedAt,
		target,
		analysis,
		manifestItems,
	});
	const run = buildRunRecord({
		id: handoffId,
		generatedAt,
		packetPath,
		source,
		target,
		completeness,
	});

	await writePacket(packetPath, {
		run,
		sourceContext,
		manifestItems,
		omissions,
		sourceMaterializationJobIds: importedReadback.jobIds,
		sourceMaterializationJobs,
		analysis,
		submissionPlan,
	});

	return {
		object: "auracall.handoff.prepare.result",
		generatedAt,
		packetPath,
		run,
		sourceCompleteness: completeness,
		analysis,
		submissionPlan,
	};
}

export async function readHandoffStatus(input: {
	handoffId: string;
	outputRoot?: string | null;
	generatedAt?: string;
}): Promise<HandoffStatusResult | null> {
	const normalizedId = normalizeHandoffId(input.handoffId);
	if (!normalizedId) {
		throw new Error("A handoff id is required.");
	}
	const packetPath = path.resolve(
		input.outputRoot ?? path.join(getAuracallHomeDir(), "handoffs"),
		normalizedId,
	);
	const run = await readJsonIfExists(path.join(packetPath, "run.json"));
	if (!isHandoffRunRecord(run)) {
		return null;
	}
	const ledger = normalizeHandoffLedger(
		await readJsonIfExists(path.join(packetPath, "ledger.json")),
	);
	const sourceMaterializationJobs = normalizeSourceMaterializationJobsReport(
		await readJsonIfExists(path.join(packetPath, "source", "materialization-jobs.json")),
	);
	const events = await readEventsIfExists(path.join(packetPath, "events.jsonl"));
	const manifest = await readJsonIfExists(path.join(packetPath, "source", "manifest.json"));
	const manifestItems = normalizeManifestItems(manifest);
	const omissionsJson = await readJsonIfExists(path.join(packetPath, "source", "omissions.json"));
	const omissions = normalizeOmissions(omissionsJson);
	const sourceContext = await readJsonIfExists(path.join(packetPath, "source", "context.json"));
	const sourceCompleteness = summarizeCompleteness(
		normalizeSourceContextForStatus(sourceContext, run.source.conversationRef ?? ""),
		manifestItems,
		omissions,
	);
	const analysis = normalizeAnalysisDecision(
		await readJsonIfExists(path.join(packetPath, "analysis", "decision.json")),
	);
	const submissionPlan = normalizeSubmissionPlan(
		await readJsonIfExists(path.join(packetPath, "target", "submission-plan.json")),
	);
	const submissionResult = await readJsonIfExists(
		path.join(packetPath, "target", "submission-result.json"),
	);
	const readback = await readJsonIfExists(path.join(packetPath, "target", "readback.json"));
	return {
		object: "auracall.handoff.status.result",
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		packetPath,
		packetDigest: buildPacketDigest({
			run,
			events,
			manifest,
			omissions: omissionsJson,
			analysis,
			submissionPlan,
			submissionResult,
			readback,
		}),
		eventCount: events.length,
		run,
		ledger,
		sourceMaterializationJobs,
		sourceCompleteness,
		analysis,
		target: {
			submissionPlan,
			submissionResult,
			readback,
			mutationAllowed: Boolean(
				(submissionPlan as { targetMutationAllowed?: unknown } | null)?.targetMutationAllowed,
			),
			uploadAttemptCount: readAttemptCount(submissionResult, "uploadAttemptCount"),
			submitAttemptCount: readAttemptCount(submissionResult, "submitAttemptCount"),
		},
	};
}

export function normalizeHandoffProvider(value: unknown): HandoffProvider {
	const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
	if (normalized === "chatgpt" || normalized === "gemini" || normalized === "grok")
		return normalized;
	throw new Error(
		`Invalid handoff provider "${String(value)}". Use "chatgpt", "gemini", or "grok".`,
	);
}

function resolveHandoffEndpoint(
	config: MutableRecord,
	input: {
		provider: HandoffProvider;
		runtimeProfile?: string | null;
		conversationRef?: string | null;
		projectRef?: string | null;
		role: "source" | "target";
	},
): HandoffEndpoint {
	const runtimeProfileId = getPreferredRuntimeProfileName(config, {
		explicitProfileName: input.runtimeProfile ?? null,
	});
	if (!runtimeProfileId) {
		throw new Error(
			`No AuraCall runtime profile could be resolved for ${input.role} ${input.provider}.`,
		);
	}
	const explicitRuntimeProfile = normalizeOptionalString(input.runtimeProfile);
	if (explicitRuntimeProfile && explicitRuntimeProfile !== runtimeProfileId) {
		throw new Error(
			`AuraCall runtime profile "${explicitRuntimeProfile}" was not found for ${input.role} ${input.provider}.`,
		);
	}
	const runtimeProfile = getPreferredRuntimeProfile(config, {
		explicitProfileName: runtimeProfileId,
	});
	const browserProfileId = getRuntimeProfileBrowserProfileId(runtimeProfile);
	const bindingBrowserProfile = browserProfileId ?? "unbound-browser-profile";
	return {
		provider: input.provider,
		runtimeProfileId,
		browserProfileId,
		accountBindingKey: `binding:${input.provider}:${runtimeProfileId}:${bindingBrowserProfile}`,
		accountMirrorTenantKey: resolveConfiguredServiceAccountId(config, {
			serviceId: input.provider,
			runtimeProfileId,
		}),
		conversationRef: normalizeOptionalString(input.conversationRef),
		projectRef: normalizeOptionalString(input.projectRef),
		capabilities: defaultCapabilities(input.role),
	};
}

function defaultCapabilities(role: "source" | "target"): HandoffEndpointCapabilities {
	return {
		readConversationContext: role === "source",
		materializeArtifacts: role === "source",
		uploadFiles: role === "target",
		submitMessage: role === "target",
		readTargetResponse: role === "target",
	};
}

function normalizeSourceContext(value: unknown, sourceRef: string): HandoffSourceContext {
	if (typeof value === "undefined" || value === null) {
		return {
			object: "handoff_source_context",
			sourceRef,
			status: "not_cached",
			payload: {
				sourceRef,
				note: "No source context payload was provided to the dry-run packet builder.",
			},
			metrics: { messageCount: 0 },
		};
	}
	return {
		object: "handoff_source_context",
		sourceRef,
		status: "provided",
		payload: value,
		metrics: { messageCount: countMessages(value) },
	};
}

function normalizeManifestItems(value: unknown): HandoffManifestItem[] {
	const rawItems = Array.isArray(value)
		? value
		: isRecord(value) && Array.isArray(value.items)
			? value.items
			: [];
	return rawItems.map((item, index) => normalizeManifestItem(item, index));
}

function normalizeManifestItem(value: unknown, index: number): HandoffManifestItem {
	const record = isRecord(value) ? value : {};
	const id = normalizeOptionalString(record.id) ?? `item_${index + 1}`;
	return {
		id,
		kind: normalizeManifestKind(record.kind),
		title: normalizeOptionalString(record.title ?? record.name),
		localPath: normalizeOptionalString(record.localPath ?? record.path),
		archiveItemId: normalizeOptionalString(record.archiveItemId),
		sourceRef: normalizeOptionalString(record.sourceRef ?? record.remoteUrl ?? record.url),
		mimeType: normalizeOptionalString(record.mimeType ?? record.contentType),
		sizeBytes: normalizeNumber(record.sizeBytes ?? record.size),
		checksumSha256: normalizeSha256(record.checksumSha256 ?? record.sha256),
		materializationMethod: normalizeOptionalString(
			record.materializationMethod ?? record.materializationSurface,
		),
		importanceHint: normalizeNumber(record.importanceHint),
	};
}

function normalizeManifestKind(value: unknown): HandoffManifestItem["kind"] {
	const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
	if (
		normalized === "file" ||
		normalized === "artifact" ||
		normalized === "media" ||
		normalized === "context" ||
		normalized === "archive_item"
	) {
		return normalized;
	}
	return "file";
}

function normalizeOmissions(value: unknown): HandoffOmission[] {
	const rawItems = Array.isArray(value)
		? value
		: isRecord(value) && Array.isArray(value.items)
			? value.items
			: [];
	return rawItems.map((item, index) => {
		const record = isRecord(item) ? item : {};
		return {
			id: normalizeOptionalString(record.id) ?? `omission_${index + 1}`,
			kind: normalizeOptionalString(record.kind) ?? "unknown",
			sourceRef: normalizeOptionalString(record.sourceRef ?? record.remoteUrl ?? record.url),
			reason: normalizeOptionalString(record.reason) ?? "No omission reason was provided.",
			retryable: record.retryable === true,
		};
	});
}

function importSourceMaterializationReadbacks(
	value: unknown[] | null | undefined,
	sources: HandoffSourceMaterializationImportMethod[] | null | undefined = null,
): {
	jobIds: string[];
	jobs: HandoffSourceMaterializationJobEvidence[];
	manifestItems: HandoffManifestItem[];
	omissions: HandoffOmission[];
} {
	if (!Array.isArray(value) || value.length === 0) {
		return { jobIds: [], jobs: [], manifestItems: [], omissions: [] };
	}
	const jobs = value.map((entry, index) =>
		normalizeMaterializationJobReadback(
			entry,
			index,
			Array.isArray(sources) ? sources[index] : null,
		),
	);
	return {
		jobIds: Array.from(new Set(jobs.map((job) => job.id))),
		jobs: dedupeSourceMaterializationJobs(jobs.map((job) => job.evidence)),
		manifestItems: jobs.flatMap((job) => job.manifestItems),
		omissions: jobs.flatMap((job) => job.omissions),
	};
}

function normalizeMaterializationJobReadback(
	value: unknown,
	index: number,
	defaultImportMethod: HandoffSourceMaterializationImportMethod | null,
): {
	id: string;
	evidence: HandoffSourceMaterializationJobEvidence;
	manifestItems: HandoffManifestItem[];
	omissions: HandoffOmission[];
} {
	const record = isRecord(value) ? value : {};
	const wrapperPayload = isRecord(record.payload) ? record.payload : null;
	const wrapperImportMethod = normalizeSourceMaterializationImportMethod(record.importMethod);
	const payload = wrapperPayload ?? record;
	const payloadRecord = isRecord(payload) ? payload : {};
	const job = isRecord(payloadRecord.job) ? payloadRecord.job : payloadRecord;
	if (job.object !== "history_materialization_job") {
		throw new Error(
			`Source materialization readback ${index + 1} is not a history_materialization_job.`,
		);
	}
	const jobId = normalizeOptionalString(job.id) ?? `history_materialization_job_${index + 1}`;
	const importMethod = wrapperImportMethod ?? defaultImportMethod;
	const result = isRecord(job.result) ? job.result : null;
	const entries = result && Array.isArray(result.entries) ? result.entries : [];
	const manifestItems: HandoffManifestItem[] = [];
	const omissions: HandoffOmission[] = [];
	entries.forEach((entry, entryIndex) => {
		const item = normalizeMaterializationEntry(jobId, entry, entryIndex);
		if (!item) return;
		if ("reason" in item) {
			omissions.push(item);
		} else {
			manifestItems.push(item);
		}
	});
	const error = isRecord(job.error) ? job.error : null;
	const errorMessage = normalizeOptionalString(error?.message);
	if (errorMessage && omissions.length === 0 && manifestItems.length === 0) {
		omissions.push({
			id: `${jobId}:job_error`,
			kind: "history_materialization_job",
			sourceRef: jobId,
			reason: errorMessage,
			retryable: true,
		});
	}
	return {
		id: jobId,
		evidence: {
			jobId,
			status: normalizeOptionalString(job.status),
			sourceType: isRecord(job.source) ? normalizeOptionalString(job.source.type) : null,
			importMethod,
			reused: payloadRecord.reused === true ? true : payloadRecord.reused === false ? false : null,
			reuseReason: normalizeOptionalString(payloadRecord.reuseReason),
			hasResult: result !== null,
			terminal: isTerminalSourceMaterializationStatus(job.status),
		},
		manifestItems,
		omissions,
	};
}

function normalizeSourceMaterializationImportMethod(
	value: unknown,
): HandoffSourceMaterializationImportMethod | null {
	const normalized = normalizeOptionalString(value);
	if (normalized === "json_file" || normalized === "api_read" || normalized === "api_create")
		return normalized;
	return null;
}

function isTerminalSourceMaterializationStatus(value: unknown): boolean {
	const status = normalizeOptionalString(value);
	return (
		status === "succeeded" || status === "skipped" || status === "failed" || status === "cancelled"
	);
}

function dedupeSourceMaterializationJobs(
	jobs: HandoffSourceMaterializationJobEvidence[],
): HandoffSourceMaterializationJobEvidence[] {
	const byId = new Map<string, HandoffSourceMaterializationJobEvidence>();
	for (const job of jobs) {
		byId.set(job.jobId, job);
	}
	return Array.from(byId.values());
}

function buildSourceMaterializationJobsReport(
	generatedAt: string,
	jobs: HandoffSourceMaterializationJobEvidence[],
): HandoffSourceMaterializationJobsReport {
	return {
		object: "auracall.handoff-source-materialization-jobs.v1",
		generatedAt,
		jobs,
		metrics: {
			total: jobs.length,
			importedJson: jobs.filter((job) => job.importMethod === "json_file").length,
			apiRead: jobs.filter((job) => job.importMethod === "api_read").length,
			apiCreated: jobs.filter((job) => job.importMethod === "api_create").length,
			terminal: jobs.filter((job) => job.terminal).length,
			withResult: jobs.filter((job) => job.hasResult).length,
		},
	};
}

function normalizeMaterializationEntry(
	jobId: string,
	value: unknown,
	index: number,
): HandoffManifestItem | HandoffOmission | null {
	const record = isRecord(value) ? value : {};
	const status = normalizeOptionalString(record.status);
	const kind = normalizeManifestKind(record.kind);
	const entryId = `${jobId}:entry_${index + 1}`;
	if (status === "materialized" || status === "duplicate") {
		return {
			id: entryId,
			kind,
			title: normalizeOptionalString(record.title ?? record.providerId),
			localPath: normalizeOptionalString(record.localPath),
			archiveItemId: normalizeOptionalString(record.archiveItemId),
			sourceRef: normalizeOptionalString(
				record.remoteUrl ?? record.providerId ?? record.assetRoute,
			),
			mimeType: normalizeOptionalString(record.mimeType),
			sizeBytes: normalizeNumber(record.sizeBytes ?? record.size),
			checksumSha256: normalizeSha256(record.checksumSha256),
			materializationMethod: normalizeOptionalString(
				record.materializationMethod ?? record.materializationSurface,
			),
			importanceHint: status === "materialized" ? 5 : 3,
		};
	}
	if (status === "failed" || status === "skipped") {
		return {
			id: entryId,
			kind,
			sourceRef: normalizeOptionalString(
				record.remoteUrl ?? record.providerId ?? record.assetRoute,
			),
			reason: normalizeOptionalString(record.reason) ?? `history materialization entry ${status}`,
			retryable: status === "failed",
		};
	}
	return null;
}

function mergeManifestItems(items: HandoffManifestItem[]): HandoffManifestItem[] {
	const byId = new Map<string, HandoffManifestItem>();
	for (const item of items) {
		byId.set(item.id, item);
	}
	return Array.from(byId.values());
}

function mergeOmissions(items: HandoffOmission[]): HandoffOmission[] {
	const byId = new Map<string, HandoffOmission>();
	for (const item of items) {
		byId.set(item.id, item);
	}
	return Array.from(byId.values());
}

function summarizeCompleteness(
	sourceContext: HandoffSourceContext,
	manifestItems: HandoffManifestItem[],
	omissions: HandoffOmission[],
): HandoffCompleteness {
	const contextProvided = sourceContext.status === "provided";
	const localMaterializedCount = manifestItems.filter((item) => item.localPath).length;
	const checksumCount = manifestItems.filter((item) => item.checksumSha256).length;
	const retryableOmissionCount = omissions.filter((item) => item.retryable).length;
	const hasEvidence = contextProvided || manifestItems.length > 0;
	const state = !hasEvidence ? "not_cached" : omissions.length > 0 ? "partial" : "complete";
	return {
		state,
		contextProvided,
		messageCount: sourceContext.metrics.messageCount,
		manifestItemCount: manifestItems.length,
		localMaterializedCount,
		checksumCount,
		omissionCount: omissions.length,
		retryableOmissionCount,
	};
}

function buildAnalysisDecision(input: {
	generatedAt: string;
	source: HandoffEndpoint;
	target: HandoffEndpoint;
	sourceContext: HandoffSourceContext;
	manifestItems: HandoffManifestItem[];
	omissions: HandoffOmission[];
	sourceMaterializationJobIds: string[];
	maxSelectedArtifacts?: number | null;
}): HandoffAnalysisDecision {
	const maxSelectedArtifacts =
		typeof input.maxSelectedArtifacts === "number" && Number.isFinite(input.maxSelectedArtifacts)
			? Math.max(0, Math.trunc(input.maxSelectedArtifacts))
			: 10;
	const selected = [...input.manifestItems]
		.sort((left, right) => {
			const rightScore = right.importanceHint ?? (right.localPath ? 1 : 0);
			const leftScore = left.importanceHint ?? (left.localPath ? 1 : 0);
			return rightScore - leftScore || left.id.localeCompare(right.id);
		})
		.slice(0, maxSelectedArtifacts);
	const warnings = [
		...(input.sourceContext.status === "not_cached" ? ["source_context_not_provided"] : []),
		...(input.omissions.length > 0 ? ["source_omissions_present"] : []),
	];
	return {
		object: HANDOFF_ANALYSIS_SCHEMA,
		generatedAt: input.generatedAt,
		decisionSource: "deterministic-dry-run",
		schemaValid: true,
		sourceMaterializationJobIds: input.sourceMaterializationJobIds,
		selectedManifestItemIds: selected.map((item) => item.id),
		compactContext: {
			sourceProvider: input.source.provider,
			sourceRef: input.source.conversationRef,
			targetProvider: input.target.provider,
			messageCount: input.sourceContext.metrics.messageCount,
			materializedItemCount: input.manifestItems.filter((item) => item.localPath).length,
			omissionCount: input.omissions.length,
			summary: `Dry-run handoff preview from ${input.source.provider} to ${input.target.provider}.`,
		},
		targetPrimer: [
			"You are receiving a compact cross-service context handoff.",
			`Source provider: ${input.source.provider}`,
			`Source ref: ${input.source.conversationRef ?? "not provided"}`,
			`Selected artifacts: ${selected.length}`,
			"Use the attached compact context JSON and selected files as the authoritative starting point.",
		].join("\n"),
		warnings,
	};
}

function buildSubmissionPlan(input: {
	generatedAt: string;
	target: HandoffEndpoint;
	analysis: HandoffAnalysisDecision;
	manifestItems: HandoffManifestItem[];
}): HandoffSubmissionPlan {
	const selected = input.manifestItems.filter((item) =>
		input.analysis.selectedManifestItemIds.includes(item.id),
	);
	const sizes = selected
		.map((item) => item.sizeBytes)
		.filter((value): value is number => typeof value === "number");
	return {
		object: HANDOFF_SUBMISSION_PLAN_SCHEMA,
		generatedAt: input.generatedAt,
		dryRun: true,
		targetMutationAllowed: false,
		target: input.target,
		selectedManifestItemIds: input.analysis.selectedManifestItemIds,
		selectedFileCount: selected.filter((item) => item.localPath).length,
		selectedTotalBytes:
			sizes.length === selected.length ? sizes.reduce((total, value) => total + value, 0) : null,
		primerRef: "analysis/target-primer.md",
		compactContextRef: "analysis/compact-context.json",
		requiredApproval: "target-submit",
		zeroTargetMutationEvidence: {
			submitTargetPhaseSkipped: true,
			uploadAttemptCount: 0,
			submitAttemptCount: 0,
		},
	};
}

function buildRunRecord(input: {
	id: string;
	generatedAt: string;
	packetPath: string;
	source: HandoffEndpoint;
	target: HandoffEndpoint;
	completeness: HandoffCompleteness;
}): HandoffRunRecord {
	return {
		object: HANDOFF_RUN_SCHEMA,
		id: input.id,
		schema: HANDOFF_PACKET_SCHEMA,
		createdAt: input.generatedAt,
		updatedAt: input.generatedAt,
		status: "preview_ready",
		dryRun: true,
		phases: {
			discover_source: "completed",
			cache_source: "completed",
			verify_source: "completed",
			analyze: "completed",
			discover_target: "completed",
			preview_target: "completed",
		},
		source: input.source,
		target: input.target,
		sourceCompleteness: input.completeness,
		packetPath: input.packetPath,
		artifacts: {
			sourceContext: "source/context.json",
			sourceManifest: "source/manifest.json",
			sourceOmissions: "source/omissions.json",
			analysisDecision: "analysis/decision.json",
			compactContext: "analysis/compact-context.json",
			targetPrimer: "analysis/target-primer.md",
			targetSubmissionPlan: "target/submission-plan.json",
		},
	};
}

async function writePacket(
	packetPath: string,
	input: {
		run: HandoffRunRecord;
		sourceContext: HandoffSourceContext;
		manifestItems: HandoffManifestItem[];
		omissions: HandoffOmission[];
		sourceMaterializationJobIds: string[];
		sourceMaterializationJobs: HandoffSourceMaterializationJobsReport;
		analysis: HandoffAnalysisDecision;
		submissionPlan: HandoffSubmissionPlan;
	},
): Promise<void> {
	await fs.mkdir(path.join(packetPath, "source", "files"), { recursive: true });
	await fs.mkdir(path.join(packetPath, "source", "artifacts"), { recursive: true });
	await fs.mkdir(path.join(packetPath, "analysis"), { recursive: true });
	await fs.mkdir(path.join(packetPath, "target"), { recursive: true });
	await writeJson(path.join(packetPath, "run.json"), input.run);
	await writeEvents(path.join(packetPath, "events.jsonl"), input.run);
	await writeJson(
		path.join(packetPath, "ledger.json"),
		buildRunLedger(input.run, input.sourceMaterializationJobs.jobs),
	);
	await writeJson(path.join(packetPath, "source", "context.json"), input.sourceContext);
	await writeJson(path.join(packetPath, "source", "manifest.json"), {
		object: "auracall.handoff-source-manifest.v1",
		generatedAt: input.run.createdAt,
		items: input.manifestItems,
	});
	await writeJson(path.join(packetPath, "source", "omissions.json"), {
		object: "auracall.handoff-source-omissions.v1",
		generatedAt: input.run.createdAt,
		items: input.omissions,
	});
	await writeJson(
		path.join(packetPath, "source", "materialization-jobs.json"),
		input.sourceMaterializationJobs,
	);
	await writeJson(path.join(packetPath, "analysis", "input-index.json"), {
		object: "auracall.handoff-analysis-input-index.v1",
		generatedAt: input.run.createdAt,
		contextRef: "source/context.json",
		manifestRef: "source/manifest.json",
		omissionsRef: "source/omissions.json",
		sourceMaterializationJobIds: input.sourceMaterializationJobIds,
	});
	await writeJson(path.join(packetPath, "analysis", "selected-target-seed.json"), {
		object: "auracall.handoff-selected-target-seed.v1",
		generatedAt: input.run.createdAt,
		selectedManifestItemIds: input.analysis.selectedManifestItemIds,
	});
	await writeJson(
		path.join(packetPath, "analysis", "compact-context.json"),
		input.analysis.compactContext,
	);
	await fs.writeFile(
		path.join(packetPath, "analysis", "target-primer.md"),
		`${input.analysis.targetPrimer}\n`,
		"utf8",
	);
	await writeJson(path.join(packetPath, "analysis", "decision.json"), input.analysis);
	await writeJson(path.join(packetPath, "target", "submission-plan.json"), input.submissionPlan);
	await writeJson(path.join(packetPath, "target", "submission-result.json"), {
		object: "auracall.handoff-submission-result.v1",
		generatedAt: input.run.createdAt,
		status: "skipped_dry_run",
		uploadAttemptCount: 0,
		submitAttemptCount: 0,
	});
	await writeJson(path.join(packetPath, "target", "readback.json"), {
		object: "auracall.handoff-target-readback.v1",
		generatedAt: input.run.createdAt,
		status: "skipped_dry_run",
	});
}

function buildRunLedger(
	run: HandoffRunRecord,
	sourceMaterializationJobs: HandoffSourceMaterializationJobEvidence[] = [],
): HandoffRunLedger {
	const eventCount = Object.keys(run.phases).length;
	return {
		object: HANDOFF_LEDGER_SCHEMA,
		runId: run.id,
		createdAt: run.createdAt,
		updatedAt: run.updatedAt,
		status: run.status,
		packetPath: run.packetPath,
		mode: "preview",
		approvalPolicy: {
			upload: "not_allowed_preview",
			submit: "not_allowed_preview",
		},
		approvalEvents: [],
		eventCount,
		sourceMaterializationJobs,
		targetMutationAllowed: false,
		repairState: {
			resumableFrom: "preview_target",
		},
	};
}

async function writeEvents(filePath: string, run: HandoffRunRecord): Promise<void> {
	const lines = Object.entries(run.phases).map(([phase, status]) =>
		JSON.stringify({
			object: "auracall.handoff-event.v1",
			runId: run.id,
			generatedAt: run.createdAt,
			phase,
			status,
		}),
	);
	await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonIfExists(filePath: string): Promise<unknown | null> {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return null;
		throw error;
	}
}

async function readEventsIfExists(filePath: string): Promise<unknown[]> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.map((line) => JSON.parse(line) as unknown);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return [];
		throw error;
	}
}

function isHandoffRunRecord(value: unknown): value is HandoffRunRecord {
	return (
		isRecord(value) &&
		value.object === HANDOFF_RUN_SCHEMA &&
		typeof value.id === "string" &&
		typeof value.packetPath === "string"
	);
}

function normalizeHandoffLedger(value: unknown): HandoffRunLedger | null {
	if (!isRecord(value) || value.object !== HANDOFF_LEDGER_SCHEMA) return null;
	return value as unknown as HandoffRunLedger;
}

function normalizeSourceMaterializationJobsReport(
	value: unknown,
): HandoffSourceMaterializationJobsReport | null {
	if (!isRecord(value) || value.object !== "auracall.handoff-source-materialization-jobs.v1")
		return null;
	const jobs = Array.isArray(value.jobs)
		? value.jobs.map((job, index) => normalizeSourceMaterializationJobEvidence(job, index))
		: [];
	return buildSourceMaterializationJobsReport(
		normalizeOptionalString(value.generatedAt) ?? new Date(0).toISOString(),
		jobs,
	);
}

function normalizeSourceMaterializationJobEvidence(
	value: unknown,
	index: number,
): HandoffSourceMaterializationJobEvidence {
	const record = isRecord(value) ? value : {};
	return {
		jobId: normalizeOptionalString(record.jobId) ?? `source_job_${index + 1}`,
		status: normalizeOptionalString(record.status),
		sourceType: normalizeOptionalString(record.sourceType),
		importMethod: normalizeSourceMaterializationImportMethod(record.importMethod),
		reused: record.reused === true ? true : record.reused === false ? false : null,
		reuseReason: normalizeOptionalString(record.reuseReason),
		hasResult: record.hasResult === true,
		terminal: record.terminal === true,
	};
}

function normalizeAnalysisDecision(value: unknown): HandoffAnalysisDecision | null {
	if (!isRecord(value) || value.object !== HANDOFF_ANALYSIS_SCHEMA) return null;
	return value as unknown as HandoffAnalysisDecision;
}

function normalizeSubmissionPlan(value: unknown): HandoffSubmissionPlan | null {
	if (!isRecord(value) || value.object !== HANDOFF_SUBMISSION_PLAN_SCHEMA) return null;
	return value as unknown as HandoffSubmissionPlan;
}

function normalizeSourceContextForStatus(value: unknown, sourceRef: string): HandoffSourceContext {
	if (isRecord(value) && value.object === "handoff_source_context") {
		return {
			object: "handoff_source_context",
			sourceRef: normalizeOptionalString(value.sourceRef) ?? sourceRef,
			status: value.status === "provided" ? "provided" : "not_cached",
			payload: value.payload,
			metrics: {
				messageCount:
					normalizeNumber(isRecord(value.metrics) ? value.metrics.messageCount : null) ??
					countMessages(value.payload),
			},
		};
	}
	return normalizeSourceContext(value, sourceRef);
}

function readAttemptCount(
	value: unknown,
	key: "uploadAttemptCount" | "submitAttemptCount",
): number {
	if (!isRecord(value)) return 0;
	return normalizeNumber(value[key]) ?? 0;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return Boolean(error && typeof error === "object" && "code" in error);
}

function countMessages(value: unknown): number {
	if (Array.isArray(value)) return value.length;
	if (!isRecord(value)) return 0;
	if (Array.isArray(value.messages)) return value.messages.length;
	if (Array.isArray(value.turns)) return value.turns.length;
	if (isRecord(value.payload)) return countMessages(value.payload);
	return 0;
}

function normalizeOptionalString(value: unknown): string | null {
	const normalized = typeof value === "string" ? value.trim() : "";
	return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return Math.max(0, Math.trunc(value));
}

function normalizeSha256(value: unknown): string | null {
	const normalized = normalizeOptionalString(value);
	if (!normalized) return null;
	return /^[a-f0-9]{64}$/i.test(normalized) ? normalized.toLowerCase() : null;
}

function normalizeHandoffId(value: unknown): string | null {
	const normalized = normalizeOptionalString(value);
	if (!normalized) return null;
	return normalized.replace(/[^A-Za-z0-9._-]/g, "_");
}

function isRecord(value: unknown): value is MutableRecord {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function readJsonInputFile(filePath: string): Promise<unknown> {
	const raw = await fs.readFile(path.resolve(filePath), "utf8");
	return JSON.parse(raw) as unknown;
}

export function buildPacketDigest(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
