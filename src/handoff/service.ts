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
export const HANDOFF_ANALYSIS_INPUT_SCHEMA = "auracall.handoff-analysis-input.v1";
export const HANDOFF_ANALYSIS_SCHEMA = "auracall.handoff-analysis-decision.v2";
export const HANDOFF_ANALYSIS_VALIDATION_SCHEMA = "auracall.handoff-analysis-validation-report.v1";
export const HANDOFF_TARGET_PACKAGE_SCHEMA = "auracall.handoff-target-package.v1";
export const HANDOFF_TARGET_UPLOAD_MANIFEST_SCHEMA = "auracall.handoff-target-upload-manifest.v1";
export const HANDOFF_SUBMISSION_PLAN_SCHEMA = "auracall.handoff-submission-plan.v1";
export const HANDOFF_APPROVAL_SCHEMA = "auracall.handoff-approval.v1";
export const HANDOFF_UPLOAD_RESULT_SCHEMA = "auracall.handoff-upload-result.v1";
export const HANDOFF_SUBMISSION_RESULT_SCHEMA = "auracall.handoff-submission-result.v1";
export const HANDOFF_TARGET_READBACK_SCHEMA = "auracall.handoff-target-readback.v1";

export const HANDOFF_ANALYSIS_OMISSION_WARNING_PREFIXES = [
	"source_context_not_provided",
	"source_omissions_present",
	"selected_item_missing_local_file:",
	"selected_file_budget_exceeded",
	"prompt_budget_exceeded",
] as const;

export type HandoffApprovalRecommendation =
	| "preview_only"
	| "request_upload_approval"
	| "request_submit_approval";

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

export interface HandoffAnalysisInput {
	object: typeof HANDOFF_ANALYSIS_INPUT_SCHEMA;
	generatedAt: string;
	source: HandoffEndpoint;
	target: HandoffEndpoint;
	refs: {
		context: "source/context.json";
		manifest: "source/manifest.json";
		omissions: "source/omissions.json";
		sourceMaterializationJobs: "source/materialization-jobs.json";
	};
	sourceCompleteness: HandoffCompleteness;
	sourceMaterializationJobIds: string[];
	budgets: {
		maxPromptTokens: number;
		maxSelectedFileBytes: number;
		maxSelectedFiles: number;
	};
	manifestItems: HandoffAnalysisManifestItemRef[];
	omissions: HandoffAnalysisOmissionRef[];
	operatorPriorities: {
		maxSelectedArtifacts: number;
	};
}

export interface HandoffAnalysisManifestItemRef {
	id: string;
	kind: HandoffManifestItem["kind"];
	title: string | null;
	hasLocalPath: boolean;
	hasChecksum: boolean;
	mimeType: string | null;
	sizeBytes: number | null;
	importanceHint: number | null;
}

export interface HandoffAnalysisOmissionRef {
	id: string;
	kind: string;
	retryable: boolean;
	reason: string;
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
	omissionWarnings: string[];
	budgetFit: {
		fits: boolean;
		estimatedPromptTokens: number;
		selectedFileBytes: number;
	};
	approvalRecommendation: HandoffApprovalRecommendation;
}

export interface HandoffAnalysisValidationReport {
	object: typeof HANDOFF_ANALYSIS_VALIDATION_SCHEMA;
	generatedAt: string;
	schemaValid: boolean;
	errors: string[];
	warnings: string[];
	selectedManifestItemIds: string[];
	budgetFit: HandoffAnalysisDecision["budgetFit"];
}

export interface HandoffTargetPackage {
	object: typeof HANDOFF_TARGET_PACKAGE_SCHEMA;
	generatedAt: string;
	packageDigest: string;
	targetMutationAllowed: false;
	analysisDecisionRef: "analysis/decision.json";
	analysisValidationRef: "analysis/validation-report.json";
	compactContextRef: "target/compact-context.json";
	primerRef: "target/primer.md";
	uploadManifestRef: "target/upload-manifest.json";
	submissionPlanRef: "target/submission-plan.json";
	selectedFileCount: number;
	selectedTotalBytes: number;
	packageOmissionCount: number;
	zeroTargetMutationEvidence: {
		uploadAttemptCount: 0;
		submitAttemptCount: 0;
	};
}

export interface HandoffTargetUploadManifest {
	object: typeof HANDOFF_TARGET_UPLOAD_MANIFEST_SCHEMA;
	generatedAt: string;
	packageDigest: string;
	targetMutationAllowed: false;
	items: HandoffTargetUploadManifestItem[];
	omissions: HandoffTargetPackageOmission[];
}

export interface HandoffTargetUploadManifestItem {
	sourceManifestItemId: string;
	packetPath: string;
	filename: string;
	mimeType: string | null;
	sizeBytes: number;
	checksumSha256: string;
}

export interface HandoffTargetPackageOmission {
	sourceManifestItemId: string;
	reason: string;
	retryable: boolean;
}

export interface HandoffUploadApproval {
	object: typeof HANDOFF_APPROVAL_SCHEMA;
	kind: "target_upload";
	runId: string;
	actor: string;
	approvedAt: string;
	packageDigest: string;
	target: HandoffEndpoint;
	uploadManifestRef: "target/upload-manifest.json";
	selectedFileCount: number;
	selectedTotalBytes: number;
	status: "approved";
}

export interface HandoffSubmitApproval {
	object: typeof HANDOFF_APPROVAL_SCHEMA;
	kind: "target_submit";
	runId: string;
	actor: string;
	approvedAt: string;
	packageDigest: string;
	primerDigest: string;
	compactContextDigest: string;
	uploadSetDigest: string;
	target: HandoffEndpoint;
	submissionPlanRef: "target/submission-plan.json";
	uploadResultRef: "target/upload-result.json";
	status: "approved";
}

export interface HandoffUploadResult {
	object: typeof HANDOFF_UPLOAD_RESULT_SCHEMA;
	generatedAt: string;
	status: "uploaded" | "skipped_no_files" | "failed";
	packageDigest: string;
	target: HandoffEndpoint;
	uploadAttemptCount: number;
	submitAttemptCount: 0;
	uploadedFileCount: number;
	failedFileCount: number;
	rows: HandoffUploadResultRow[];
	omissions: HandoffTargetPackageOmission[];
}

export interface HandoffUploadResultRow {
	sourceManifestItemId: string;
	packetPath: string;
	filename: string;
	mimeType: string | null;
	sizeBytes: number;
	checksumSha256: string;
	targetProvider: HandoffProvider;
	targetRuntimeProfileId: string;
	providerFileId: string;
	status: "uploaded";
}

interface HandoffSelectedFileCopy {
	item: HandoffManifestItem;
	sourcePath: string;
	targetPath: string;
	relativePath: string;
	filename: string;
	sizeBytes: number;
	checksumSha256: string;
}

export interface HandoffSubmissionPlan {
	object: typeof HANDOFF_SUBMISSION_PLAN_SCHEMA;
	generatedAt: string;
	dryRun: true;
	targetMutationAllowed: false;
	target: HandoffEndpoint;
	selectedManifestItemIds: string[];
	selectedFileCount: number;
	selectedTotalBytes: number;
	packageDigest: string | null;
	primerRef: "target/primer.md";
	compactContextRef: "target/compact-context.json";
	uploadManifestRef: "target/upload-manifest.json";
	requiredApproval: "target-submit";
	zeroTargetMutationEvidence: {
		submitTargetPhaseSkipped: true;
		uploadAttemptCount: 0;
		submitAttemptCount: 0;
	};
}

export interface HandoffSubmissionResult {
	object: typeof HANDOFF_SUBMISSION_RESULT_SCHEMA;
	generatedAt: string;
	status: "skipped_dry_run" | "upload_completed" | "upload_skipped_no_files" | "submitted";
	packageDigest: string | null;
	uploadAttemptCount: number;
	submitAttemptCount: 0 | 1;
	uploadResultRef: "target/upload-result.json" | null;
	submitApprovalRef?: "approvals/submit.json";
	promptDigest?: string;
	primerDigest?: string;
	compactContextDigest?: string;
	uploadSetDigest?: string;
	targetConversationRef?: string;
	providerMessageId?: string;
	readbackRef?: "target/readback.json";
	uploadedProviderFileIds?: string[];
}

export interface HandoffTargetReadback {
	object: typeof HANDOFF_TARGET_READBACK_SCHEMA;
	generatedAt: string;
	status: "skipped_dry_run" | "readback_cached";
	packageDigest?: string;
	target: HandoffEndpoint;
	targetConversationRef?: string;
	providerMessageId?: string;
	responseSummary?: string;
	responseExcerpt?: string;
	compactContextRef?: "target/compact-context.json";
	primerRef?: "target/primer.md";
	submissionResultRef?: "target/submission-result.json";
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
		analysisInput: string;
		analysisDecision: string;
		analysisValidation: string;
		compactContext: string;
		targetPrimer: string;
		targetPackage: string;
		targetUploadManifest: string;
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
		upload: "not_allowed_preview" | "explicit_approval_required";
		submit: "not_allowed_preview" | "explicit_approval_required";
	};
	approvalEvents: Array<HandoffUploadApproval | HandoffSubmitApproval>;
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
	analysisInput: HandoffAnalysisInput;
	analysis: HandoffAnalysisDecision;
	analysisValidation: HandoffAnalysisValidationReport;
	targetPackage: HandoffTargetPackage;
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
	analysisValidation: HandoffAnalysisValidationReport | null;
	target: {
		package: HandoffTargetPackage | null;
		uploadManifest: HandoffTargetUploadManifest | null;
		submissionPlan: HandoffSubmissionPlan | null;
		submissionResult: HandoffSubmissionResult | null;
		uploadApproval: HandoffUploadApproval | null;
		submitApproval: HandoffSubmitApproval | null;
		uploadResult: HandoffUploadResult | null;
		readback: HandoffTargetReadback | null;
		mutationAllowed: boolean;
		uploadAttemptCount: number;
		submitAttemptCount: number;
		packageDigest: string | null;
		selectedFileCount: number;
		selectedTotalBytes: number;
		uploadApproved: boolean;
		uploadApprovalDigest: string | null;
		submitApproved: boolean;
		submitApprovalDigest: string | null;
		uploadedFileCount: number;
		uploadFailureCount: number;
		uploadStatus: HandoffUploadResult["status"] | "not_uploaded";
		submitStatus: HandoffSubmissionResult["status"] | "not_submitted";
		readbackStatus: HandoffTargetReadback["status"] | "missing";
		targetConversationRef: string | null;
		providerMessageId: string | null;
	};
}

export interface HandoffApproveUploadRequest {
	handoffId: string;
	outputRoot?: string | null;
	actor?: string | null;
	packageDigest?: string | null;
	generatedAt?: string;
}

export interface HandoffApproveUploadResult {
	object: "auracall.handoff.approve-upload.result";
	generatedAt: string;
	packetPath: string;
	runId: string;
	approval: HandoffUploadApproval;
}

export interface HandoffApproveSubmitRequest {
	handoffId: string;
	outputRoot?: string | null;
	actor?: string | null;
	packageDigest?: string | null;
	generatedAt?: string;
}

export interface HandoffApproveSubmitResult {
	object: "auracall.handoff.approve-submit.result";
	generatedAt: string;
	packetPath: string;
	runId: string;
	approval: HandoffSubmitApproval;
}

export interface HandoffUploadTargetRequest {
	handoffId: string;
	outputRoot?: string | null;
	generatedAt?: string;
}

export interface HandoffUploadTargetResult {
	object: "auracall.handoff.upload-target.result";
	generatedAt: string;
	packetPath: string;
	runId: string;
	approval: HandoffUploadApproval;
	uploadResult: HandoffUploadResult;
	submissionResult: HandoffSubmissionResult;
}

export interface HandoffSubmitTargetRequest {
	handoffId: string;
	outputRoot?: string | null;
	generatedAt?: string;
}

export interface HandoffSubmitTargetResult {
	object: "auracall.handoff.submit-target.result";
	generatedAt: string;
	packetPath: string;
	runId: string;
	approval: HandoffSubmitApproval;
	submissionResult: HandoffSubmissionResult;
	readback: HandoffTargetReadback;
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
	const analysisInput = buildAnalysisInput({
		generatedAt,
		source,
		target,
		sourceContext,
		manifestItems,
		omissions,
		sourceMaterializationJobIds: importedReadback.jobIds,
		sourceCompleteness: completeness,
		maxSelectedArtifacts: request.maxSelectedArtifacts,
	});
	const analysis = buildAnalysisDecision({
		generatedAt,
		source,
		target,
		sourceContext,
		manifestItems,
		omissions,
		sourceMaterializationJobIds: importedReadback.jobIds,
		maxSelectedArtifacts: request.maxSelectedArtifacts,
		budgets: analysisInput.budgets,
	});
	const analysisValidation = validateHandoffAnalysisDecision({
		generatedAt,
		decision: analysis,
		manifestItems,
		omissions,
		budgets: analysisInput.budgets,
	});
	if (!analysisValidation.schemaValid) {
		throw new Error(
			`Handoff analysis decision failed validation: ${analysisValidation.errors.join("; ")}`,
		);
	}
	const targetPackageInput = await buildTargetPackage({
		packetPath,
		generatedAt,
		analysis,
		manifestItems,
	});
	const submissionPlan = buildSubmissionPlan({
		generatedAt,
		target,
		analysis,
		targetPackage: targetPackageInput.targetPackage,
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
		analysisInput,
		analysis,
		analysisValidation,
		targetPackage: targetPackageInput.targetPackage,
		uploadManifest: targetPackageInput.uploadManifest,
		selectedFileCopies: targetPackageInput.selectedFileCopies,
		submissionPlan,
	});

	return {
		object: "auracall.handoff.prepare.result",
		generatedAt,
		packetPath,
		run,
		sourceCompleteness: completeness,
		analysisInput,
		analysis,
		analysisValidation,
		targetPackage: targetPackageInput.targetPackage,
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
	const analysisValidation = normalizeAnalysisValidationReport(
		await readJsonIfExists(path.join(packetPath, "analysis", "validation-report.json")),
	);
	const targetPackage = normalizeTargetPackage(
		await readJsonIfExists(path.join(packetPath, "target", "package.json")),
	);
	const uploadManifest = normalizeTargetUploadManifest(
		await readJsonIfExists(path.join(packetPath, "target", "upload-manifest.json")),
	);
	const submissionPlan = normalizeSubmissionPlan(
		await readJsonIfExists(path.join(packetPath, "target", "submission-plan.json")),
	);
	const submissionResult = await readJsonIfExists(
		path.join(packetPath, "target", "submission-result.json"),
	);
	const uploadApproval = normalizeUploadApproval(
		await readJsonIfExists(path.join(packetPath, "approvals", "upload.json")),
	);
	const submitApproval = normalizeSubmitApproval(
		await readJsonIfExists(path.join(packetPath, "approvals", "submit.json")),
	);
	const uploadResult = normalizeUploadResult(
		await readJsonIfExists(path.join(packetPath, "target", "upload-result.json")),
	);
	const readback = normalizeTargetReadback(
		await readJsonIfExists(path.join(packetPath, "target", "readback.json")),
	);
	const normalizedSubmissionResult = normalizeSubmissionResult(submissionResult);
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
			analysisValidation,
			targetPackage,
			uploadManifest,
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
		analysisValidation,
		target: {
			package: targetPackage,
			uploadManifest,
			submissionPlan,
			submissionResult: normalizedSubmissionResult,
			uploadApproval,
			submitApproval,
			uploadResult,
			readback,
			mutationAllowed: Boolean(
				(submissionPlan as { targetMutationAllowed?: unknown } | null)?.targetMutationAllowed,
			),
			uploadAttemptCount: normalizedSubmissionResult?.uploadAttemptCount ?? 0,
			submitAttemptCount: normalizedSubmissionResult?.submitAttemptCount ?? 0,
			packageDigest: targetPackage?.packageDigest ?? submissionPlan?.packageDigest ?? null,
			selectedFileCount: targetPackage?.selectedFileCount ?? submissionPlan?.selectedFileCount ?? 0,
			selectedTotalBytes:
				targetPackage?.selectedTotalBytes ?? submissionPlan?.selectedTotalBytes ?? 0,
			uploadApproved:
				Boolean(uploadApproval) &&
				Boolean(targetPackage) &&
				uploadApproval?.packageDigest === targetPackage?.packageDigest,
			uploadApprovalDigest: uploadApproval?.packageDigest ?? null,
				submitApproved:
					submitApproval !== null &&
					targetPackage !== null &&
					uploadResult !== null &&
					submitApproval.packageDigest === targetPackage.packageDigest &&
					submitApproval.uploadSetDigest === buildUploadSetDigest(uploadResult),
			submitApprovalDigest: submitApproval?.packageDigest ?? null,
			uploadedFileCount: uploadResult?.uploadedFileCount ?? 0,
			uploadFailureCount: uploadResult?.failedFileCount ?? 0,
			uploadStatus: uploadResult?.status ?? "not_uploaded",
			submitStatus: normalizedSubmissionResult?.status ?? "not_submitted",
			readbackStatus: readback?.status ?? "missing",
			targetConversationRef: normalizedSubmissionResult?.targetConversationRef ?? null,
			providerMessageId: normalizedSubmissionResult?.providerMessageId ?? null,
		},
	};
}

export async function approveHandoffTargetUpload(
	input: HandoffApproveUploadRequest,
): Promise<HandoffApproveUploadResult> {
	const packet = await readPreparedHandoffPacket(input.handoffId, input.outputRoot);
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const expectedDigest = normalizeOptionalString(input.packageDigest);
	if (expectedDigest && expectedDigest !== packet.targetPackage.packageDigest) {
		throw new Error(
			`Upload approval package digest mismatch: expected ${packet.targetPackage.packageDigest}, got ${expectedDigest}.`,
		);
	}
	const actor = normalizeOptionalString(input.actor) ?? "operator";
	const approval: HandoffUploadApproval = {
		object: HANDOFF_APPROVAL_SCHEMA,
		kind: "target_upload",
		runId: packet.run.id,
		actor,
		approvedAt: generatedAt,
		packageDigest: packet.targetPackage.packageDigest,
		target: packet.run.target,
		uploadManifestRef: "target/upload-manifest.json",
		selectedFileCount: packet.targetPackage.selectedFileCount,
		selectedTotalBytes: packet.targetPackage.selectedTotalBytes,
		status: "approved",
	};
	await fs.mkdir(path.join(packet.packetPath, "approvals"), { recursive: true });
	await writeJson(path.join(packet.packetPath, "approvals", "upload.json"), approval);
	const ledger = buildRunLedger(packet.run, packet.ledger?.sourceMaterializationJobs ?? []);
	ledger.approvalPolicy.upload = "explicit_approval_required";
	ledger.approvalEvents = [approval];
	await writeJson(path.join(packet.packetPath, "ledger.json"), ledger);
	return {
		object: "auracall.handoff.approve-upload.result",
		generatedAt,
		packetPath: packet.packetPath,
		runId: packet.run.id,
		approval,
	};
}

export async function approveHandoffTargetSubmit(
	input: HandoffApproveSubmitRequest,
): Promise<HandoffApproveSubmitResult> {
	const packet = await readPreparedHandoffPacket(input.handoffId, input.outputRoot);
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const expectedDigest = normalizeOptionalString(input.packageDigest);
	if (expectedDigest && expectedDigest !== packet.targetPackage.packageDigest) {
		throw new Error(
			`Submit approval package digest mismatch: expected ${packet.targetPackage.packageDigest}, got ${expectedDigest}.`,
		);
	}
	const uploadResult = normalizeUploadResult(
		await readJsonIfExists(path.join(packet.packetPath, "target", "upload-result.json")),
	);
	if (!uploadResult) {
		throw new Error("Target submit approval requires a completed target upload result.");
	}
	if (uploadResult.packageDigest !== packet.targetPackage.packageDigest) {
		throw new Error(
			`Target upload result is stale for package digest ${packet.targetPackage.packageDigest}.`,
		);
	}
	const guard = await buildSubmitGuard(packet.packetPath, packet.targetPackage, uploadResult);
	const actor = normalizeOptionalString(input.actor) ?? "operator";
	const approval: HandoffSubmitApproval = {
		object: HANDOFF_APPROVAL_SCHEMA,
		kind: "target_submit",
		runId: packet.run.id,
		actor,
		approvedAt: generatedAt,
		packageDigest: packet.targetPackage.packageDigest,
		primerDigest: guard.primerDigest,
		compactContextDigest: guard.compactContextDigest,
		uploadSetDigest: guard.uploadSetDigest,
		target: packet.run.target,
		submissionPlanRef: "target/submission-plan.json",
		uploadResultRef: "target/upload-result.json",
		status: "approved",
	};
	await fs.mkdir(path.join(packet.packetPath, "approvals"), { recursive: true });
	await writeJson(path.join(packet.packetPath, "approvals", "submit.json"), approval);
	const uploadApproval = normalizeUploadApproval(
		await readJsonIfExists(path.join(packet.packetPath, "approvals", "upload.json")),
	);
	const ledger = buildRunLedger(packet.run, packet.ledger?.sourceMaterializationJobs ?? []);
	if (uploadApproval) {
		ledger.approvalPolicy.upload = "explicit_approval_required";
		ledger.approvalEvents.push(uploadApproval);
	}
	ledger.approvalPolicy.submit = "explicit_approval_required";
	ledger.approvalEvents.push(approval);
	await writeJson(path.join(packet.packetPath, "ledger.json"), ledger);
	return {
		object: "auracall.handoff.approve-submit.result",
		generatedAt,
		packetPath: packet.packetPath,
		runId: packet.run.id,
		approval,
	};
}

export async function uploadHandoffTargetPackage(
	input: HandoffUploadTargetRequest,
): Promise<HandoffUploadTargetResult> {
	const packet = await readPreparedHandoffPacket(input.handoffId, input.outputRoot);
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const approval = normalizeUploadApproval(
		await readJsonIfExists(path.join(packet.packetPath, "approvals", "upload.json")),
	);
	if (!approval) {
		throw new Error("Target upload requires an explicit upload approval.");
	}
	if (approval.packageDigest !== packet.targetPackage.packageDigest) {
		throw new Error(
			`Upload approval is stale for package digest ${packet.targetPackage.packageDigest}.`,
		);
	}
	const uploadManifest = packet.uploadManifest;
	const rows: HandoffUploadResultRow[] = uploadManifest.items.map((item) => ({
		sourceManifestItemId: item.sourceManifestItemId,
		packetPath: item.packetPath,
		filename: item.filename,
		mimeType: item.mimeType,
		sizeBytes: item.sizeBytes,
		checksumSha256: item.checksumSha256,
		targetProvider: packet.run.target.provider,
		targetRuntimeProfileId: packet.run.target.runtimeProfileId,
		providerFileId: buildDeterministicProviderFileId(
			packet.targetPackage.packageDigest,
			item.sourceManifestItemId,
			item.checksumSha256,
		),
		status: "uploaded",
	}));
	const uploadResult: HandoffUploadResult = {
		object: HANDOFF_UPLOAD_RESULT_SCHEMA,
		generatedAt,
		status: rows.length > 0 ? "uploaded" : "skipped_no_files",
		packageDigest: packet.targetPackage.packageDigest,
		target: packet.run.target,
		uploadAttemptCount: rows.length,
		submitAttemptCount: 0,
		uploadedFileCount: rows.length,
		failedFileCount: 0,
		rows,
		omissions: uploadManifest.omissions,
	};
	const submissionResult: HandoffSubmissionResult = {
		object: HANDOFF_SUBMISSION_RESULT_SCHEMA,
		generatedAt,
		status: rows.length > 0 ? "upload_completed" : "upload_skipped_no_files",
		packageDigest: packet.targetPackage.packageDigest,
		uploadAttemptCount: rows.length,
		submitAttemptCount: 0,
		uploadResultRef: "target/upload-result.json",
	};
	await writeJson(path.join(packet.packetPath, "target", "upload-result.json"), uploadResult);
	await writeJson(
		path.join(packet.packetPath, "target", "submission-result.json"),
		submissionResult,
	);
	return {
		object: "auracall.handoff.upload-target.result",
		generatedAt,
		packetPath: packet.packetPath,
		runId: packet.run.id,
		approval,
		uploadResult,
		submissionResult,
	};
}

export async function submitHandoffTargetPackage(
	input: HandoffSubmitTargetRequest,
): Promise<HandoffSubmitTargetResult> {
	const packet = await readPreparedHandoffPacket(input.handoffId, input.outputRoot);
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const approval = normalizeSubmitApproval(
		await readJsonIfExists(path.join(packet.packetPath, "approvals", "submit.json")),
	);
	if (!approval) {
		throw new Error("Target submit requires an explicit submit approval.");
	}
	const uploadResult = normalizeUploadResult(
		await readJsonIfExists(path.join(packet.packetPath, "target", "upload-result.json")),
	);
	if (!uploadResult) {
		throw new Error("Target submit requires a completed target upload result.");
	}
	if (uploadResult.packageDigest !== packet.targetPackage.packageDigest) {
		throw new Error(
			`Target upload result is stale for package digest ${packet.targetPackage.packageDigest}.`,
		);
	}
	const guard = await buildSubmitGuard(packet.packetPath, packet.targetPackage, uploadResult);
	if (
		approval.packageDigest !== packet.targetPackage.packageDigest ||
		approval.primerDigest !== guard.primerDigest ||
		approval.compactContextDigest !== guard.compactContextDigest ||
		approval.uploadSetDigest !== guard.uploadSetDigest
	) {
		throw new Error(`Submit approval is stale for package digest ${packet.targetPackage.packageDigest}.`);
	}
	const promptDigest = buildPacketDigest({
		packageDigest: packet.targetPackage.packageDigest,
		primerDigest: guard.primerDigest,
		compactContextDigest: guard.compactContextDigest,
		uploadSetDigest: guard.uploadSetDigest,
	});
	const targetConversationRef =
		packet.run.target.conversationRef ??
		`handoff-target-${buildPacketDigest({
			runId: packet.run.id,
			target: packet.run.target.accountBindingKey,
			packageDigest: packet.targetPackage.packageDigest,
		}).slice(0, 24)}`;
	const providerMessageId = `handoff-message-${buildPacketDigest({
		targetConversationRef,
		promptDigest,
	}).slice(0, 32)}`;
	const uploadedProviderFileIds = uploadResult.rows.map((row) => row.providerFileId);
	const submissionResult: HandoffSubmissionResult = {
		object: HANDOFF_SUBMISSION_RESULT_SCHEMA,
		generatedAt,
		status: "submitted",
		packageDigest: packet.targetPackage.packageDigest,
		uploadAttemptCount: uploadResult.uploadAttemptCount,
		submitAttemptCount: 1,
		uploadResultRef: "target/upload-result.json",
		submitApprovalRef: "approvals/submit.json",
		promptDigest,
		primerDigest: guard.primerDigest,
		compactContextDigest: guard.compactContextDigest,
		uploadSetDigest: guard.uploadSetDigest,
		targetConversationRef,
		providerMessageId,
		readbackRef: "target/readback.json",
		uploadedProviderFileIds,
	};
	const readback: HandoffTargetReadback = {
		object: HANDOFF_TARGET_READBACK_SCHEMA,
		generatedAt,
		status: "readback_cached",
		packageDigest: packet.targetPackage.packageDigest,
		target: packet.run.target,
		targetConversationRef,
		providerMessageId,
		responseSummary: "Deterministic target readback cached for the approved handoff submit.",
		responseExcerpt: `Approved handoff ${packet.run.id} submitted with ${uploadedProviderFileIds.length} uploaded file reference(s).`,
		compactContextRef: "target/compact-context.json",
		primerRef: "target/primer.md",
		submissionResultRef: "target/submission-result.json",
	};
	await writeJson(path.join(packet.packetPath, "target", "submission-result.json"), submissionResult);
	await writeJson(path.join(packet.packetPath, "target", "readback.json"), readback);
	return {
		object: "auracall.handoff.submit-target.result",
		generatedAt,
		packetPath: packet.packetPath,
		runId: packet.run.id,
		approval,
		submissionResult,
		readback,
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

function buildAnalysisInput(input: {
	generatedAt: string;
	source: HandoffEndpoint;
	target: HandoffEndpoint;
	sourceContext: HandoffSourceContext;
	manifestItems: HandoffManifestItem[];
	omissions: HandoffOmission[];
	sourceMaterializationJobIds: string[];
	sourceCompleteness: HandoffCompleteness;
	maxSelectedArtifacts?: number | null;
}): HandoffAnalysisInput {
	const maxSelectedArtifacts =
		typeof input.maxSelectedArtifacts === "number" && Number.isFinite(input.maxSelectedArtifacts)
			? Math.max(0, Math.trunc(input.maxSelectedArtifacts))
			: 10;
	return {
		object: HANDOFF_ANALYSIS_INPUT_SCHEMA,
		generatedAt: input.generatedAt,
		source: input.source,
		target: input.target,
		refs: {
			context: "source/context.json",
			manifest: "source/manifest.json",
			omissions: "source/omissions.json",
			sourceMaterializationJobs: "source/materialization-jobs.json",
		},
		sourceCompleteness: input.sourceCompleteness,
		sourceMaterializationJobIds: input.sourceMaterializationJobIds,
		budgets: {
			maxPromptTokens: 32000,
			maxSelectedFileBytes: 50 * 1024 * 1024,
			maxSelectedFiles: maxSelectedArtifacts,
		},
		manifestItems: input.manifestItems.map((item) => ({
			id: item.id,
			kind: item.kind,
			title: item.title,
			hasLocalPath: Boolean(item.localPath),
			hasChecksum: Boolean(item.checksumSha256),
			mimeType: item.mimeType,
			sizeBytes: item.sizeBytes,
			importanceHint: item.importanceHint,
		})),
		omissions: input.omissions.map((item) => ({
			id: item.id,
			kind: item.kind,
			retryable: item.retryable,
			reason: item.reason,
		})),
		operatorPriorities: {
			maxSelectedArtifacts,
		},
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
	budgets: HandoffAnalysisInput["budgets"];
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
	const selectedFileBytes = selected.reduce((total, item) => total + (item.sizeBytes ?? 0), 0);
	const estimatedPromptTokens = estimatePromptTokens(input.sourceContext, input.manifestItems);
	const omissionWarnings = [
		...(input.sourceContext.status === "not_cached" ? ["source_context_not_provided"] : []),
		...(input.omissions.length > 0 ? ["source_omissions_present"] : []),
		...selected
			.filter((item) => !item.localPath)
			.map((item) => `selected_item_missing_local_file:${item.id}`),
		...(selectedFileBytes > input.budgets.maxSelectedFileBytes
			? ["selected_file_budget_exceeded"]
			: []),
		...(estimatedPromptTokens > input.budgets.maxPromptTokens ? ["prompt_budget_exceeded"] : []),
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
		omissionWarnings,
		budgetFit: {
			fits:
				selectedFileBytes <= input.budgets.maxSelectedFileBytes &&
				estimatedPromptTokens <= input.budgets.maxPromptTokens,
			estimatedPromptTokens,
			selectedFileBytes,
		},
		approvalRecommendation: "preview_only",
	};
}

export function validateHandoffAnalysisDecision(input: {
	generatedAt?: string;
	decision: unknown;
	manifestItems: HandoffManifestItem[];
	omissions: HandoffOmission[];
	budgets: HandoffAnalysisInput["budgets"];
}): HandoffAnalysisValidationReport {
	const errors: string[] = [];
	const warnings: string[] = [];
	const decision = isRecord(input.decision) ? input.decision : {};
	if (decision.object !== HANDOFF_ANALYSIS_SCHEMA) {
		errors.push(`decision.object must be ${HANDOFF_ANALYSIS_SCHEMA}`);
	}
	const selectedManifestItemIds = Array.isArray(decision.selectedManifestItemIds)
		? decision.selectedManifestItemIds
				.map((id) => normalizeOptionalString(id))
				.filter((id): id is string => Boolean(id))
		: [];
	if (!Array.isArray(decision.selectedManifestItemIds)) {
		errors.push("selectedManifestItemIds must be an array");
	}
	const manifestById = new Map(input.manifestItems.map((item) => [item.id, item]));
	for (const id of selectedManifestItemIds) {
		const item = manifestById.get(id);
		if (!item) {
			errors.push(`selected manifest item does not exist: ${id}`);
			continue;
		}
		if (
			!item.localPath &&
			!hasOmissionForSelectedItem(id, input.omissions, decision.omissionWarnings)
		) {
			errors.push(`selected manifest item lacks local file and omission warning: ${id}`);
		}
	}
	if (typeof decision.targetPrimer !== "string" || decision.targetPrimer.trim().length === 0) {
		errors.push("targetPrimer must be a non-empty string");
	}
	if (!isRecord(decision.compactContext)) {
		errors.push("compactContext must be an object");
	}
	const approvalRecommendation = normalizeOptionalString(decision.approvalRecommendation);
	if (!isAllowedApprovalRecommendation(approvalRecommendation)) {
		errors.push("approvalRecommendation is not allowed");
	}
	const omissionWarnings = Array.isArray(decision.omissionWarnings)
		? decision.omissionWarnings
				.map((warning) => normalizeOptionalString(warning))
				.filter((warning): warning is string => Boolean(warning))
		: [];
	if (!Array.isArray(decision.omissionWarnings)) {
		errors.push("omissionWarnings must be an array");
	}
	for (const warning of omissionWarnings) {
		if (!isValidOmissionWarning(warning, input.omissions, selectedManifestItemIds, manifestById)) {
			errors.push(`omission warning has no matching omission or policy limit: ${warning}`);
		}
	}
	const budgetFit = normalizeBudgetFit(decision.budgetFit);
	if (budgetFit.selectedFileBytes > input.budgets.maxSelectedFileBytes) {
		errors.push("selected file bytes exceed analysis budget");
	}
	if (budgetFit.estimatedPromptTokens > input.budgets.maxPromptTokens) {
		errors.push("estimated prompt tokens exceed analysis budget");
	}
	if (budgetFit.fits === false) {
		warnings.push("budget_fit_false");
	}
	return {
		object: HANDOFF_ANALYSIS_VALIDATION_SCHEMA,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		schemaValid: errors.length === 0,
		errors,
		warnings,
		selectedManifestItemIds,
		budgetFit,
	};
}

async function buildTargetPackage(input: {
	packetPath: string;
	generatedAt: string;
	analysis: HandoffAnalysisDecision;
	manifestItems: HandoffManifestItem[];
}): Promise<{
	targetPackage: HandoffTargetPackage;
	uploadManifest: HandoffTargetUploadManifest;
	selectedFileCopies: HandoffSelectedFileCopy[];
}> {
	const selectedItems = input.manifestItems.filter((item) =>
		input.analysis.selectedManifestItemIds.includes(item.id),
	);
	const selectedFilesDir = path.join(input.packetPath, "target", "selected-files");
	const selectedFileCopies: HandoffSelectedFileCopy[] = [];
	const omissions: HandoffTargetPackageOmission[] = [];
	for (const item of selectedItems) {
		if (!item.localPath) {
			omissions.push({
				sourceManifestItemId: item.id,
				reason: "selected manifest item has no localPath",
				retryable: true,
			});
			continue;
		}
		const sourcePath = path.resolve(item.localPath);
		let stat: Awaited<ReturnType<typeof fs.stat>>;
		try {
			stat = await fs.stat(sourcePath);
		} catch {
			omissions.push({
				sourceManifestItemId: item.id,
				reason: "selected local file is unavailable",
				retryable: true,
			});
			continue;
		}
		if (!stat.isFile()) {
			omissions.push({
				sourceManifestItemId: item.id,
				reason: "selected local path is not a file",
				retryable: true,
			});
			continue;
		}
		const filename = buildSelectedFileName(item, selectedFileCopies.length);
		const relativePath = `target/selected-files/${filename}`;
		const targetPath = path.join(selectedFilesDir, filename);
		const checksumSha256 = await hashFile(sourcePath);
		selectedFileCopies.push({
			item,
			sourcePath,
			targetPath,
			relativePath,
			filename,
			sizeBytes: stat.size,
			checksumSha256,
		});
	}
	const digestSeed = {
		object: HANDOFF_TARGET_PACKAGE_SCHEMA,
		decision: {
			selectedManifestItemIds: input.analysis.selectedManifestItemIds,
			compactContext: input.analysis.compactContext,
			targetPrimer: input.analysis.targetPrimer,
			approvalRecommendation: input.analysis.approvalRecommendation,
		},
		selectedFiles: selectedFileCopies.map((copy) => ({
			sourceManifestItemId: copy.item.id,
			filename: copy.filename,
			mimeType: copy.item.mimeType,
			sizeBytes: copy.sizeBytes,
			checksumSha256: copy.checksumSha256,
		})),
		omissions,
	};
	const packageDigest = buildPacketDigest(stableJson(digestSeed));
	const uploadManifest: HandoffTargetUploadManifest = {
		object: HANDOFF_TARGET_UPLOAD_MANIFEST_SCHEMA,
		generatedAt: input.generatedAt,
		packageDigest,
		targetMutationAllowed: false,
		items: selectedFileCopies.map((copy) => ({
			sourceManifestItemId: copy.item.id,
			packetPath: copy.relativePath,
			filename: copy.filename,
			mimeType: copy.item.mimeType,
			sizeBytes: copy.sizeBytes,
			checksumSha256: copy.checksumSha256,
		})),
		omissions,
	};
	const selectedTotalBytes = selectedFileCopies.reduce((total, copy) => total + copy.sizeBytes, 0);
	const targetPackage: HandoffTargetPackage = {
		object: HANDOFF_TARGET_PACKAGE_SCHEMA,
		generatedAt: input.generatedAt,
		packageDigest,
		targetMutationAllowed: false,
		analysisDecisionRef: "analysis/decision.json",
		analysisValidationRef: "analysis/validation-report.json",
		compactContextRef: "target/compact-context.json",
		primerRef: "target/primer.md",
		uploadManifestRef: "target/upload-manifest.json",
		submissionPlanRef: "target/submission-plan.json",
		selectedFileCount: selectedFileCopies.length,
		selectedTotalBytes,
		packageOmissionCount: omissions.length,
		zeroTargetMutationEvidence: {
			uploadAttemptCount: 0,
			submitAttemptCount: 0,
		},
	};
	return { targetPackage, uploadManifest, selectedFileCopies };
}

function buildSubmissionPlan(input: {
	generatedAt: string;
	target: HandoffEndpoint;
	analysis: HandoffAnalysisDecision;
	targetPackage: HandoffTargetPackage;
}): HandoffSubmissionPlan {
	return {
		object: HANDOFF_SUBMISSION_PLAN_SCHEMA,
		generatedAt: input.generatedAt,
		dryRun: true,
		targetMutationAllowed: false,
		target: input.target,
		selectedManifestItemIds: input.analysis.selectedManifestItemIds,
		selectedFileCount: input.targetPackage.selectedFileCount,
		selectedTotalBytes: input.targetPackage.selectedTotalBytes,
		packageDigest: input.targetPackage.packageDigest,
		primerRef: "target/primer.md",
		compactContextRef: "target/compact-context.json",
		uploadManifestRef: "target/upload-manifest.json",
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
			analysisInput: "analysis/input.json",
			analysisDecision: "analysis/decision.json",
			analysisValidation: "analysis/validation-report.json",
			compactContext: "target/compact-context.json",
			targetPrimer: "target/primer.md",
			targetPackage: "target/package.json",
			targetUploadManifest: "target/upload-manifest.json",
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
		analysisInput: HandoffAnalysisInput;
		analysis: HandoffAnalysisDecision;
		analysisValidation: HandoffAnalysisValidationReport;
		targetPackage: HandoffTargetPackage;
		uploadManifest: HandoffTargetUploadManifest;
		selectedFileCopies: HandoffSelectedFileCopy[];
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
	await writeJson(path.join(packetPath, "analysis", "input.json"), input.analysisInput);
	await writeJson(path.join(packetPath, "analysis", "selected-target-seed.json"), {
		object: "auracall.handoff-selected-target-seed.v1",
		generatedAt: input.run.createdAt,
		selectedManifestItemIds: input.analysis.selectedManifestItemIds,
	});
	await writeJson(
		path.join(packetPath, "target", "compact-context.json"),
		input.analysis.compactContext,
	);
	await fs.writeFile(
		path.join(packetPath, "target", "primer.md"),
		`${input.analysis.targetPrimer}\n`,
		"utf8",
	);
	await writeJson(path.join(packetPath, "analysis", "decision.json"), input.analysis);
	await writeJson(
		path.join(packetPath, "analysis", "validation-report.json"),
		input.analysisValidation,
	);
	for (const copy of input.selectedFileCopies) {
		await fs.mkdir(path.dirname(copy.targetPath), { recursive: true });
		await fs.copyFile(copy.sourcePath, copy.targetPath);
	}
	await writeJson(path.join(packetPath, "target", "upload-manifest.json"), input.uploadManifest);
	await writeJson(path.join(packetPath, "target", "package.json"), input.targetPackage);
	await writeJson(path.join(packetPath, "target", "submission-plan.json"), input.submissionPlan);
	await writeJson(path.join(packetPath, "target", "submission-result.json"), {
		object: HANDOFF_SUBMISSION_RESULT_SCHEMA,
		generatedAt: input.run.createdAt,
		status: "skipped_dry_run",
		packageDigest: input.targetPackage.packageDigest,
		uploadAttemptCount: 0,
		submitAttemptCount: 0,
		uploadResultRef: null,
	});
	await writeJson(path.join(packetPath, "target", "readback.json"), {
		object: HANDOFF_TARGET_READBACK_SCHEMA,
		generatedAt: input.run.createdAt,
		status: "skipped_dry_run",
		target: input.run.target,
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

function normalizeAnalysisValidationReport(value: unknown): HandoffAnalysisValidationReport | null {
	if (!isRecord(value) || value.object !== HANDOFF_ANALYSIS_VALIDATION_SCHEMA) return null;
	return value as unknown as HandoffAnalysisValidationReport;
}

function normalizeTargetPackage(value: unknown): HandoffTargetPackage | null {
	if (!isRecord(value) || value.object !== HANDOFF_TARGET_PACKAGE_SCHEMA) return null;
	return value as unknown as HandoffTargetPackage;
}

function normalizeTargetUploadManifest(value: unknown): HandoffTargetUploadManifest | null {
	if (!isRecord(value) || value.object !== HANDOFF_TARGET_UPLOAD_MANIFEST_SCHEMA) return null;
	return value as unknown as HandoffTargetUploadManifest;
}

function normalizeSubmissionPlan(value: unknown): HandoffSubmissionPlan | null {
	if (!isRecord(value) || value.object !== HANDOFF_SUBMISSION_PLAN_SCHEMA) return null;
	return value as unknown as HandoffSubmissionPlan;
}

function normalizeUploadApproval(value: unknown): HandoffUploadApproval | null {
	if (!isRecord(value) || value.object !== HANDOFF_APPROVAL_SCHEMA) return null;
	if (value.kind !== "target_upload" || value.status !== "approved") return null;
	const target = isRecord(value.target) ? (value.target as unknown as HandoffEndpoint) : null;
	const packageDigest = normalizeOptionalString(value.packageDigest);
	if (!target || !packageDigest) return null;
	return {
		object: HANDOFF_APPROVAL_SCHEMA,
		kind: "target_upload",
		runId: normalizeOptionalString(value.runId) ?? "",
		actor: normalizeOptionalString(value.actor) ?? "operator",
		approvedAt: normalizeOptionalString(value.approvedAt) ?? new Date(0).toISOString(),
		packageDigest,
		target,
		uploadManifestRef: "target/upload-manifest.json",
		selectedFileCount: normalizeNumber(value.selectedFileCount) ?? 0,
		selectedTotalBytes: normalizeNumber(value.selectedTotalBytes) ?? 0,
		status: "approved",
	};
}

function normalizeSubmitApproval(value: unknown): HandoffSubmitApproval | null {
	if (!isRecord(value) || value.object !== HANDOFF_APPROVAL_SCHEMA) return null;
	if (value.kind !== "target_submit" || value.status !== "approved") return null;
	const target = isRecord(value.target) ? (value.target as unknown as HandoffEndpoint) : null;
	const packageDigest = normalizeOptionalString(value.packageDigest);
	const primerDigest = normalizeSha256(value.primerDigest);
	const compactContextDigest = normalizeSha256(value.compactContextDigest);
	const uploadSetDigest = normalizeSha256(value.uploadSetDigest);
	if (!target || !packageDigest || !primerDigest || !compactContextDigest || !uploadSetDigest) {
		return null;
	}
	return {
		object: HANDOFF_APPROVAL_SCHEMA,
		kind: "target_submit",
		runId: normalizeOptionalString(value.runId) ?? "",
		actor: normalizeOptionalString(value.actor) ?? "operator",
		approvedAt: normalizeOptionalString(value.approvedAt) ?? new Date(0).toISOString(),
		packageDigest,
		primerDigest,
		compactContextDigest,
		uploadSetDigest,
		target,
		submissionPlanRef: "target/submission-plan.json",
		uploadResultRef: "target/upload-result.json",
		status: "approved",
	};
}

function normalizeUploadResult(value: unknown): HandoffUploadResult | null {
	if (!isRecord(value) || value.object !== HANDOFF_UPLOAD_RESULT_SCHEMA) return null;
	const status = normalizeOptionalString(value.status);
	if (status !== "uploaded" && status !== "skipped_no_files" && status !== "failed") return null;
	const target = isRecord(value.target) ? (value.target as unknown as HandoffEndpoint) : null;
	const packageDigest = normalizeOptionalString(value.packageDigest);
	if (!target || !packageDigest) return null;
	return {
		object: HANDOFF_UPLOAD_RESULT_SCHEMA,
		generatedAt: normalizeOptionalString(value.generatedAt) ?? new Date(0).toISOString(),
		status,
		packageDigest,
		target,
		uploadAttemptCount: normalizeNumber(value.uploadAttemptCount) ?? 0,
		submitAttemptCount: 0,
		uploadedFileCount: normalizeNumber(value.uploadedFileCount) ?? 0,
		failedFileCount: normalizeNumber(value.failedFileCount) ?? 0,
		rows: Array.isArray(value.rows) ? value.rows.map(normalizeUploadResultRow) : [],
		omissions: normalizeTargetPackageOmissions(value.omissions),
	};
}

function normalizeUploadResultRow(value: unknown): HandoffUploadResultRow {
	const record = isRecord(value) ? value : {};
	return {
		sourceManifestItemId: normalizeOptionalString(record.sourceManifestItemId) ?? "unknown",
		packetPath: normalizeOptionalString(record.packetPath) ?? "",
		filename: normalizeOptionalString(record.filename) ?? "file",
		mimeType: normalizeOptionalString(record.mimeType),
		sizeBytes: normalizeNumber(record.sizeBytes) ?? 0,
		checksumSha256: normalizeSha256(record.checksumSha256) ?? "",
		targetProvider: normalizeHandoffProvider(record.targetProvider),
		targetRuntimeProfileId: normalizeOptionalString(record.targetRuntimeProfileId) ?? "",
		providerFileId: normalizeOptionalString(record.providerFileId) ?? "",
		status: "uploaded",
	};
}

function normalizeSubmissionResult(value: unknown): HandoffSubmissionResult | null {
	if (!isRecord(value)) return null;
	const status = normalizeOptionalString(value.status);
	if (
		status !== "skipped_dry_run" &&
		status !== "upload_completed" &&
		status !== "upload_skipped_no_files" &&
		status !== "submitted"
	) {
		return null;
	}
	const uploadedProviderFileIds = Array.isArray(value.uploadedProviderFileIds)
		? value.uploadedProviderFileIds
				.map((entry) => normalizeOptionalString(entry))
				.filter((entry): entry is string => Boolean(entry))
		: undefined;
	return {
		object: HANDOFF_SUBMISSION_RESULT_SCHEMA,
		generatedAt: normalizeOptionalString(value.generatedAt) ?? new Date(0).toISOString(),
		status,
		packageDigest: normalizeOptionalString(value.packageDigest),
		uploadAttemptCount: normalizeNumber(value.uploadAttemptCount) ?? 0,
		submitAttemptCount: status === "submitted" ? 1 : 0,
		uploadResultRef:
			normalizeOptionalString(value.uploadResultRef) === "target/upload-result.json"
				? "target/upload-result.json"
				: null,
		submitApprovalRef:
			normalizeOptionalString(value.submitApprovalRef) === "approvals/submit.json"
				? "approvals/submit.json"
				: undefined,
		promptDigest: normalizeSha256(value.promptDigest) ?? undefined,
		primerDigest: normalizeSha256(value.primerDigest) ?? undefined,
		compactContextDigest: normalizeSha256(value.compactContextDigest) ?? undefined,
		uploadSetDigest: normalizeSha256(value.uploadSetDigest) ?? undefined,
		targetConversationRef: normalizeOptionalString(value.targetConversationRef) ?? undefined,
		providerMessageId: normalizeOptionalString(value.providerMessageId) ?? undefined,
		readbackRef:
			normalizeOptionalString(value.readbackRef) === "target/readback.json"
				? "target/readback.json"
				: undefined,
		uploadedProviderFileIds,
	};
}

function normalizeTargetReadback(value: unknown): HandoffTargetReadback | null {
	if (!isRecord(value) || value.object !== HANDOFF_TARGET_READBACK_SCHEMA) return null;
	const status = normalizeOptionalString(value.status);
	if (status !== "skipped_dry_run" && status !== "readback_cached") return null;
	const target = isRecord(value.target) ? (value.target as unknown as HandoffEndpoint) : null;
	if (!target) return null;
	return {
		object: HANDOFF_TARGET_READBACK_SCHEMA,
		generatedAt: normalizeOptionalString(value.generatedAt) ?? new Date(0).toISOString(),
		status,
		packageDigest: normalizeOptionalString(value.packageDigest) ?? undefined,
		target,
		targetConversationRef: normalizeOptionalString(value.targetConversationRef) ?? undefined,
		providerMessageId: normalizeOptionalString(value.providerMessageId) ?? undefined,
		responseSummary: normalizeOptionalString(value.responseSummary) ?? undefined,
		responseExcerpt: normalizeOptionalString(value.responseExcerpt) ?? undefined,
		compactContextRef:
			normalizeOptionalString(value.compactContextRef) === "target/compact-context.json"
				? "target/compact-context.json"
				: undefined,
		primerRef:
			normalizeOptionalString(value.primerRef) === "target/primer.md" ? "target/primer.md" : undefined,
		submissionResultRef:
			normalizeOptionalString(value.submissionResultRef) === "target/submission-result.json"
				? "target/submission-result.json"
				: undefined,
	};
}

function normalizeTargetPackageOmissions(value: unknown): HandoffTargetPackageOmission[] {
	if (!Array.isArray(value)) return [];
	return value.map((entry, index) => {
		const record = isRecord(entry) ? entry : {};
		return {
			sourceManifestItemId:
				normalizeOptionalString(record.sourceManifestItemId) ?? `omission_${index + 1}`,
			reason: normalizeOptionalString(record.reason) ?? "No package omission reason was provided.",
			retryable: record.retryable === true,
		};
	});
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

async function readPreparedHandoffPacket(
	handoffId: string,
	outputRoot?: string | null,
): Promise<{
	packetPath: string;
	run: HandoffRunRecord;
	ledger: HandoffRunLedger | null;
	targetPackage: HandoffTargetPackage;
	uploadManifest: HandoffTargetUploadManifest;
}> {
	const normalizedId = normalizeHandoffId(handoffId);
	if (!normalizedId) throw new Error("A handoff id is required.");
	const packetPath = path.resolve(
		outputRoot ?? path.join(getAuracallHomeDir(), "handoffs"),
		normalizedId,
	);
	const run = await readJsonIfExists(path.join(packetPath, "run.json"));
	if (!isHandoffRunRecord(run)) {
		throw new Error(`Handoff packet not found: ${normalizedId}`);
	}
	const ledger = normalizeHandoffLedger(
		await readJsonIfExists(path.join(packetPath, "ledger.json")),
	);
	const targetPackage = normalizeTargetPackage(
		await readJsonIfExists(path.join(packetPath, "target", "package.json")),
	);
	if (!targetPackage) {
		throw new Error(`Handoff packet ${normalizedId} has no target package.`);
	}
	const uploadManifest = normalizeTargetUploadManifest(
		await readJsonIfExists(path.join(packetPath, "target", "upload-manifest.json")),
	);
	if (!uploadManifest) {
		throw new Error(`Handoff packet ${normalizedId} has no target upload manifest.`);
	}
	if (uploadManifest.packageDigest !== targetPackage.packageDigest) {
		throw new Error(`Handoff packet ${normalizedId} has mismatched target package digest.`);
	}
	return { packetPath, run, ledger, targetPackage, uploadManifest };
}

async function buildSubmitGuard(
	packetPath: string,
	targetPackage: HandoffTargetPackage,
	uploadResult: HandoffUploadResult,
): Promise<{
	packageDigest: string;
	primerDigest: string;
	compactContextDigest: string;
	uploadSetDigest: string;
}> {
	const [primerDigest, compactContextDigest] = await Promise.all([
		hashFile(path.join(packetPath, "target", "primer.md")),
		hashFile(path.join(packetPath, "target", "compact-context.json")),
	]);
	return {
		packageDigest: targetPackage.packageDigest,
		primerDigest,
		compactContextDigest,
		uploadSetDigest: buildUploadSetDigest(uploadResult),
	};
}

function buildUploadSetDigest(uploadResult: HandoffUploadResult): string {
	return buildPacketDigest({
		packageDigest: uploadResult.packageDigest,
		status: uploadResult.status,
		rows: uploadResult.rows.map((row) => ({
			sourceManifestItemId: row.sourceManifestItemId,
			checksumSha256: row.checksumSha256,
			providerFileId: row.providerFileId,
			status: row.status,
		})),
		omissions: uploadResult.omissions.map((omission) => ({
			sourceManifestItemId: omission.sourceManifestItemId,
			reason: omission.reason,
			retryable: omission.retryable,
		})),
	});
}

function estimatePromptTokens(
	sourceContext: HandoffSourceContext,
	manifestItems: HandoffManifestItem[],
): number {
	const sourceText = JSON.stringify(sourceContext.payload);
	const manifestText = JSON.stringify(
		manifestItems.map((item) => ({
			id: item.id,
			title: item.title,
			kind: item.kind,
			sizeBytes: item.sizeBytes,
		})),
	);
	return Math.ceil((sourceText.length + manifestText.length) / 4);
}

function normalizeBudgetFit(value: unknown): HandoffAnalysisDecision["budgetFit"] {
	const record = isRecord(value) ? value : {};
	return {
		fits: record.fits !== false,
		estimatedPromptTokens: normalizeNumber(record.estimatedPromptTokens) ?? 0,
		selectedFileBytes: normalizeNumber(record.selectedFileBytes) ?? 0,
	};
}

function isAllowedApprovalRecommendation(
	value: string | null,
): value is HandoffApprovalRecommendation {
	return (
		value === "preview_only" ||
		value === "request_upload_approval" ||
		value === "request_submit_approval"
	);
}

function hasOmissionForSelectedItem(
	id: string,
	omissions: HandoffOmission[],
	warnings: unknown,
): boolean {
	if (omissions.some((omission) => omission.id === id || omission.sourceRef === id)) return true;
	if (!Array.isArray(warnings)) return false;
	return warnings.some((warning) => warning === `selected_item_missing_local_file:${id}`);
}

function isValidOmissionWarning(
	warning: string,
	omissions: HandoffOmission[],
	selectedIds: string[],
	manifestById: Map<string, HandoffManifestItem>,
): boolean {
	if (warning === "source_omissions_present") return omissions.length > 0;
	if (warning === "source_context_not_provided") return true;
	if (warning === "selected_file_budget_exceeded" || warning === "prompt_budget_exceeded") {
		return true;
	}
	const missingPrefix = "selected_item_missing_local_file:";
	if (warning.startsWith(missingPrefix)) {
		const id = warning.slice(missingPrefix.length);
		const item = manifestById.get(id);
		return selectedIds.includes(id) && Boolean(item) && !item?.localPath;
	}
	return false;
}

function buildSelectedFileName(item: HandoffManifestItem, index: number): string {
	const title = item.title ?? path.basename(item.localPath ?? "") ?? item.id;
	const safeBase = sanitizeFileNameSegment(title) || sanitizeFileNameSegment(item.id) || "file";
	const safeId = sanitizeFileNameSegment(item.id) || "item";
	const ext = path.extname(safeBase);
	const stem = ext ? safeBase.slice(0, -ext.length) : safeBase;
	return `${String(index + 1).padStart(3, "0")}-${stem}-${safeId}${ext}`.replace(/\s+/g, "_");
}

function sanitizeFileNameSegment(value: string): string {
	return Array.from(value)
		.map((char) => {
			const code = char.charCodeAt(0);
			if (code < 32) return "_";
			return '<>:"/\\|?*'.includes(char) ? "_" : char;
		})
		.join("")
		.trim();
}

async function hashFile(filePath: string): Promise<string> {
	const hash = createHash("sha256");
	const content = await fs.readFile(filePath);
	hash.update(content);
	return hash.digest("hex");
}

function stableJson(value: unknown): string {
	return JSON.stringify(sortForStableJson(value));
}

function buildDeterministicProviderFileId(
	packageDigest: string,
	sourceManifestItemId: string,
	checksumSha256: string,
): string {
	const digest = buildPacketDigest({
		packageDigest,
		sourceManifestItemId,
		checksumSha256,
	}).slice(0, 32);
	return `handoff-file-${digest}`;
}

function sortForStableJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((entry) => sortForStableJson(entry));
	if (!isRecord(value)) return value;
	const sorted: MutableRecord = {};
	for (const key of Object.keys(value).sort()) {
		sorted[key] = sortForStableJson(value[key]);
	}
	return sorted;
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
