import {
	createApiHistoryMaterializationJobForCli,
	readApiHistoryMaterializationJobForCli,
	type ApiHistoryMaterializationCreateCliOptions,
	type ApiHistoryMaterializationStatusCliOptions,
} from "./apiHistoryMaterializationCommand.js";
import {
	approveHandoffTargetSubmit,
	approveHandoffTargetUpload,
	buildHandoffResumePlan,
	exportHandoffManualBundle,
	prepareCrossServiceHandoffPacket,
	readHandoffStatus,
	readJsonInputFile,
	repairHandoffPacket,
	submitHandoffTargetPackage,
	uploadHandoffTargetPackage,
	type HandoffApproveSubmitResult,
	type HandoffApproveUploadResult,
	type HandoffExportResult,
	type HandoffSourceMaterializationImportMethod,
	type HandoffPrepareResult,
	type HandoffProvider,
	type HandoffRepairResult,
	type HandoffResumeResult,
	type HandoffSubmitTargetResult,
	type HandoffStatusResult,
	type HandoffUploadTargetResult,
} from "../handoff/service.js";

type MutableRecord = Record<string, unknown>;

export interface HandoffPrepareCliOptions {
	config: MutableRecord;
	sourceProvider: string;
	sourceProfile?: string | null;
	sourceRef: string;
	sourceProjectRef?: string | null;
	targetProvider: string;
	targetProfile?: string | null;
	targetRef?: string | null;
	targetProjectRef?: string | null;
	sourceContextJson?: string | null;
	sourceManifestJson?: string | null;
	sourceOmissionsJson?: string | null;
	sourceMaterializationJobJson?: string[] | null;
	sourceMaterializationJobId?: string[] | null;
	sourceMaterializationCreate?: boolean | null;
	sourceMaterializationAssetKind?: string[] | null;
	sourceMaterializationMaxItems?: number | null;
	sourceMaterializationProviderWorkTimeoutMs?: number | null;
	sourceMaterializationForce?: boolean | null;
	apiHost?: string | null;
	apiPort?: number | null;
	apiTimeoutMs?: number | null;
	materializationClient?: HandoffMaterializationClient | null;
	outputDir?: string | null;
	handoffId?: string | null;
	dryRun?: boolean | null;
	maxSelectedArtifacts?: number | null;
}

export interface HandoffStatusCliOptions {
	handoffId: string;
	outputDir?: string | null;
}

export interface HandoffApproveUploadCliOptions {
	handoffId: string;
	outputDir?: string | null;
	actor?: string | null;
	packageDigest?: string | null;
}

export interface HandoffApproveSubmitCliOptions {
	handoffId: string;
	outputDir?: string | null;
	actor?: string | null;
	packageDigest?: string | null;
}

export interface HandoffUploadCliOptions {
	handoffId: string;
	outputDir?: string | null;
}

export interface HandoffSubmitCliOptions {
	handoffId: string;
	outputDir?: string | null;
}

export interface HandoffResumeCliOptions {
	handoffId: string;
	outputDir?: string | null;
}

export interface HandoffRepairCliOptions {
	handoffId: string;
	outputDir?: string | null;
}

export interface HandoffExportCliOptions {
	handoffId: string;
	outputDir?: string | null;
}

export interface HandoffMaterializationClient {
	readJob(options: ApiHistoryMaterializationStatusCliOptions): Promise<unknown>;
	createJob(options: ApiHistoryMaterializationCreateCliOptions): Promise<unknown>;
}

export async function prepareHandoffForCli(
	options: HandoffPrepareCliOptions,
): Promise<HandoffPrepareResult> {
	if (options.dryRun !== true) {
		throw new Error("Plan 0111 currently supports only --dry-run handoff preparation.");
	}
	const materializationJobPaths = options.sourceMaterializationJobJson ?? [];
	const [sourceContext, sourceManifest, sourceOmissions, jsonMaterializationReadbacks] =
		await Promise.all([
			options.sourceContextJson
				? readJsonInputFile(options.sourceContextJson)
				: Promise.resolve(undefined),
			options.sourceManifestJson
				? readJsonInputFile(options.sourceManifestJson)
				: Promise.resolve(undefined),
			options.sourceOmissionsJson
				? readJsonInputFile(options.sourceOmissionsJson)
				: Promise.resolve(undefined),
			Promise.all(materializationJobPaths.map((filePath) => readJsonInputFile(filePath))),
		]);
	const sourceMaterialization = await collectSourceMaterializationReadbacks(
		options,
		jsonMaterializationReadbacks,
	);
	return prepareCrossServiceHandoffPacket({
		config: options.config,
		sourceProvider: options.sourceProvider as HandoffProvider,
		sourceRuntimeProfile: options.sourceProfile,
		sourceRef: options.sourceRef,
		sourceProjectRef: options.sourceProjectRef,
		targetProvider: options.targetProvider as HandoffProvider,
		targetRuntimeProfile: options.targetProfile,
		targetRef: options.targetRef,
		targetProjectRef: options.targetProjectRef,
		sourceContext,
		sourceManifest,
		sourceOmissions,
		sourceMaterializationReadbacks: sourceMaterialization.readbacks,
		sourceMaterializationReadbackSources: sourceMaterialization.sources,
		outputRoot: options.outputDir,
		handoffId: options.handoffId,
		maxSelectedArtifacts: options.maxSelectedArtifacts,
	});
}

async function collectSourceMaterializationReadbacks(
	options: HandoffPrepareCliOptions,
	jsonReadbacks: unknown[],
): Promise<{
	readbacks: unknown[];
	sources: HandoffSourceMaterializationImportMethod[];
}> {
	const readbacks = [...jsonReadbacks];
	const sources: HandoffSourceMaterializationImportMethod[] = jsonReadbacks.map(() => "json_file");
	const client = options.materializationClient ?? defaultMaterializationClient;
	for (const jobId of normalizeStringList(options.sourceMaterializationJobId)) {
		readbacks.push(
			await client.readJob({
				id: jobId,
				host: options.apiHost,
				port: options.apiPort,
				timeoutMs: options.apiTimeoutMs,
			}),
		);
		sources.push("api_read");
	}
	if (options.sourceMaterializationCreate === true && readbacks.length === 0) {
		readbacks.push(
			await client.createJob({
				host: options.apiHost,
				port: options.apiPort,
				timeoutMs: options.apiTimeoutMs,
				provider: options.sourceProvider,
				runtimeProfile: options.sourceProfile,
				providerConversationUrl: options.sourceRef,
				assetKinds: options.sourceMaterializationAssetKind,
				maxItems: options.sourceMaterializationMaxItems,
				providerWorkTimeoutMs: options.sourceMaterializationProviderWorkTimeoutMs,
				force: options.sourceMaterializationForce,
			}),
		);
		sources.push("api_create");
	}
	return { readbacks, sources };
}

const defaultMaterializationClient: HandoffMaterializationClient = {
	readJob: (options) => readApiHistoryMaterializationJobForCli(options),
	createJob: (options) => createApiHistoryMaterializationJobForCli(options),
};

export async function readHandoffStatusForCli(
	options: HandoffStatusCliOptions,
): Promise<HandoffStatusResult | null> {
	return readHandoffStatus({
		handoffId: options.handoffId,
		outputRoot: options.outputDir,
	});
}

export async function approveHandoffUploadForCli(
	options: HandoffApproveUploadCliOptions,
): Promise<HandoffApproveUploadResult> {
	return approveHandoffTargetUpload({
		handoffId: options.handoffId,
		outputRoot: options.outputDir,
		actor: options.actor,
		packageDigest: options.packageDigest,
	});
}

export async function approveHandoffSubmitForCli(
	options: HandoffApproveSubmitCliOptions,
): Promise<HandoffApproveSubmitResult> {
	return approveHandoffTargetSubmit({
		handoffId: options.handoffId,
		outputRoot: options.outputDir,
		actor: options.actor,
		packageDigest: options.packageDigest,
	});
}

export async function uploadHandoffForCli(
	options: HandoffUploadCliOptions,
): Promise<HandoffUploadTargetResult> {
	return uploadHandoffTargetPackage({
		handoffId: options.handoffId,
		outputRoot: options.outputDir,
	});
}

export async function submitHandoffForCli(
	options: HandoffSubmitCliOptions,
): Promise<HandoffSubmitTargetResult> {
	return submitHandoffTargetPackage({
		handoffId: options.handoffId,
		outputRoot: options.outputDir,
	});
}

export async function resumeHandoffForCli(
	options: HandoffResumeCliOptions,
): Promise<HandoffResumeResult> {
	return buildHandoffResumePlan({
		handoffId: options.handoffId,
		outputRoot: options.outputDir,
	});
}

export async function repairHandoffForCli(
	options: HandoffRepairCliOptions,
): Promise<HandoffRepairResult> {
	return repairHandoffPacket({
		handoffId: options.handoffId,
		outputRoot: options.outputDir,
	});
}

export async function exportHandoffForCli(
	options: HandoffExportCliOptions,
): Promise<HandoffExportResult> {
	return exportHandoffManualBundle({
		handoffId: options.handoffId,
		outputRoot: options.outputDir,
	});
}

export function formatHandoffPrepareCliSummary(result: HandoffPrepareResult): string {
	return [
		`Handoff packet: ${result.run.id}`,
		`Status: ${result.run.status}`,
		`Packet path: ${result.packetPath}`,
		`Source: ${formatEndpoint(result.run.source)}`,
		`Target: ${formatEndpoint(result.run.target)}`,
		`Source completeness: ${result.sourceCompleteness.state}`,
		`Messages: ${result.sourceCompleteness.messageCount}`,
		`Manifest items: ${result.sourceCompleteness.manifestItemCount}`,
		`Local materialized: ${result.sourceCompleteness.localMaterializedCount}`,
		`Omissions: ${result.sourceCompleteness.omissionCount}`,
		`Selected target seed items: ${result.analysis.selectedManifestItemIds.length}`,
		`Analysis schema valid: ${result.analysisValidation.schemaValid ? "true" : "false"}`,
		`Target package digest: ${result.targetPackage.packageDigest}`,
		`Target package files: ${result.targetPackage.selectedFileCount}`,
		"Target mutation: skipped_dry_run",
	].join("\n");
}

export function formatHandoffStatusCliSummary(result: HandoffStatusResult): string {
	return [
		`Handoff packet: ${result.run.id}`,
		`Status: ${result.run.status}`,
		`Packet path: ${result.packetPath}`,
		`Packet digest: ${result.packetDigest}`,
		`Events: ${result.eventCount}`,
		`Source: ${formatEndpoint(result.run.source)}`,
		`Target: ${formatEndpoint(result.run.target)}`,
		`Source completeness: ${result.sourceCompleteness.state}`,
		`Messages: ${result.sourceCompleteness.messageCount}`,
		`Manifest items: ${result.sourceCompleteness.manifestItemCount}`,
		`Local materialized: ${result.sourceCompleteness.localMaterializedCount}`,
		`Omissions: ${result.sourceCompleteness.omissionCount}`,
		`Selected target seed items: ${result.analysis?.selectedManifestItemIds.length ?? 0}`,
		`Analysis schema valid: ${result.analysisValidation?.schemaValid ? "true" : "false"}`,
		`Target package digest: ${result.target.packageDigest ?? "missing"}`,
		`Target package files: ${result.target.selectedFileCount}`,
		`Target package bytes: ${result.target.selectedTotalBytes}`,
		`Target upload approved: ${result.target.uploadApproved ? "true" : "false"}`,
		`Target upload status: ${result.target.uploadStatus}`,
		`Target uploaded files: ${result.target.uploadedFileCount}`,
		`Target upload failures: ${result.target.uploadFailureCount}`,
		`Target submit approved: ${result.target.submitApproved ? "true" : "false"}`,
		`Target submit status: ${result.target.submitStatus}`,
		`Target readback status: ${result.target.readbackStatus}`,
		`Target conversation ref: ${result.target.targetConversationRef ?? "missing"}`,
		`Target provider message id: ${result.target.providerMessageId ?? "missing"}`,
		`Source materialization jobs: ${result.sourceMaterializationJobs?.metrics.total ?? 0}`,
		`Target mutation allowed: ${result.target.mutationAllowed ? "true" : "false"}`,
		`Target upload attempts: ${result.target.uploadAttemptCount}`,
		`Target submit attempts: ${result.target.submitAttemptCount}`,
	].join("\n");
}

export function formatHandoffApproveUploadCliSummary(result: HandoffApproveUploadResult): string {
	return [
		`Handoff packet: ${result.runId}`,
		`Packet path: ${result.packetPath}`,
		`Approval: target_upload`,
		`Actor: ${result.approval.actor}`,
		`Package digest: ${result.approval.packageDigest}`,
		`Approved files: ${result.approval.selectedFileCount}`,
	].join("\n");
}

export function formatHandoffApproveSubmitCliSummary(result: HandoffApproveSubmitResult): string {
	return [
		`Handoff packet: ${result.runId}`,
		`Packet path: ${result.packetPath}`,
		`Approval: target_submit`,
		`Actor: ${result.approval.actor}`,
		`Package digest: ${result.approval.packageDigest}`,
		`Primer digest: ${result.approval.primerDigest}`,
		`Compact context digest: ${result.approval.compactContextDigest}`,
		`Upload set digest: ${result.approval.uploadSetDigest}`,
	].join("\n");
}

export function formatHandoffUploadCliSummary(result: HandoffUploadTargetResult): string {
	return [
		`Handoff packet: ${result.runId}`,
		`Packet path: ${result.packetPath}`,
		`Upload status: ${result.uploadResult.status}`,
		`Package digest: ${result.uploadResult.packageDigest}`,
		`Uploaded files: ${result.uploadResult.uploadedFileCount}`,
		`Upload failures: ${result.uploadResult.failedFileCount}`,
		`Submit attempts: ${result.submissionResult.submitAttemptCount}`,
	].join("\n");
}

export function formatHandoffSubmitCliSummary(result: HandoffSubmitTargetResult): string {
	return [
		`Handoff packet: ${result.runId}`,
		`Packet path: ${result.packetPath}`,
		`Submit status: ${result.submissionResult.status}`,
		`Package digest: ${result.submissionResult.packageDigest ?? "missing"}`,
		`Submit attempts: ${result.submissionResult.submitAttemptCount}`,
		`Target conversation ref: ${result.submissionResult.targetConversationRef ?? "missing"}`,
		`Target provider message id: ${result.submissionResult.providerMessageId ?? "missing"}`,
		`Readback status: ${result.readback.status}`,
	].join("\n");
}

export function formatHandoffResumeCliSummary(result: HandoffResumeResult): string {
	return [
		`Handoff packet: ${result.runId}`,
		`Packet path: ${result.packetPath}`,
		`Current stage: ${result.resumePlan.currentStage}`,
		`Next action: ${result.resumePlan.nextAction}`,
		`Command: ${result.resumePlan.command ?? "none"}`,
		`Reasons: ${result.resumePlan.reasons.join("; ")}`,
	].join("\n");
}

export function formatHandoffRepairCliSummary(result: HandoffRepairResult): string {
	return [
		`Handoff packet: ${result.runId}`,
		`Packet path: ${result.packetPath}`,
		`Repair status: ${result.report.status}`,
		`Repaired refs: ${result.report.repairedRefs.length}`,
		`Blockers: ${result.report.blockers.length}`,
		`Next action: ${result.resumePlan.nextAction}`,
	].join("\n");
}

export function formatHandoffExportCliSummary(result: HandoffExportResult): string {
	return [
		`Handoff packet: ${result.runId}`,
		`Packet path: ${result.packetPath}`,
		`Manual export: target/manual-handoff-export.json`,
		`Package digest: ${result.exportBundle.packageDigest}`,
		`Selected files: ${result.exportBundle.selectedFiles.length}`,
		`Uploaded provider files: ${result.exportBundle.uploadedProviderFileIds.length}`,
		`Readback status: ${result.exportBundle.readbackStatus}`,
	].join("\n");
}

function normalizeStringList(value: string[] | null | undefined): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(
			value
				.flatMap((entry) => String(entry).split(","))
				.map((entry) => entry.trim())
				.filter(Boolean),
		),
	);
}

function formatEndpoint(endpoint: HandoffPrepareResult["run"]["source"]): string {
	return [
		endpoint.provider,
		endpoint.runtimeProfileId,
		endpoint.browserProfileId ?? "no-browser-profile",
	].join("/");
}
