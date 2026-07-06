import {
	type LiveFollowMaterializationBacklogState,
	type LiveFollowRoutineDecisionState,
	normalizeLiveFollowMaterializationBacklogState,
	normalizeLiveFollowRoutineDecisionState,
} from "../accountMirror/liveFollowOperatingModel.js";
import {
	LIVE_FOLLOW_SEVERITIES,
	type LiveFollowHealthSummary,
	type LiveFollowSeverity,
	summarizeLiveFollowHealth as summarizeSharedLiveFollowHealth,
} from "../status/liveFollowHealth.js";

export const API_STATUS_BACKPRESSURE_REASONS = [
	"none",
	"routine-delayed",
	"provider-guard",
	"blocked-by-browser-work",
	"yielded-to-queued-work",
	"foreground-work",
] as const;

export type ApiStatusBackpressureReason = (typeof API_STATUS_BACKPRESSURE_REASONS)[number];

export const API_STATUS_ACCOUNT_MIRROR_POSTURES = [
	"disabled",
	"paused",
	"running",
	"scheduled",
	"waiting",
	"ready",
	"healthy",
	"backpressured",
] as const;

export type ApiStatusAccountMirrorPosture = (typeof API_STATUS_ACCOUNT_MIRROR_POSTURES)[number];

export const API_STATUS_LIVE_FOLLOW_SEVERITIES = LIVE_FOLLOW_SEVERITIES;

export type ApiStatusLiveFollowSeverity = LiveFollowSeverity;

export interface ApiStatusCliOptions {
	host?: string | null;
	port?: number | null;
	timeoutMs?: number | null;
}

export interface ApiStatusBackpressureExpectation {
	expectedReason?: ApiStatusBackpressureReason | null;
}

export interface ApiStatusSchedulerPostureExpectation {
	expectedPosture?: ApiStatusAccountMirrorPosture | null;
}

export interface ApiStatusCompletionMetricsExpectation {
	expectedPaused?: number | null;
	expectedCancelled?: number | null;
	expectedFailed?: number | null;
	expectedActive?: number | null;
}

export interface ApiStatusLiveFollowSeverityExpectation {
	expectedSeverity?: ApiStatusLiveFollowSeverity | null;
}

export interface ApiStatusApiProcessSummary {
	pid: number | null;
	ppid: number | null;
	uptimeSeconds: number | null;
	cwd: string | null;
	execPath: string | null;
	nodeVersion: string | null;
}

export interface ApiStatusManagedServiceSummary {
	manager: string | null;
	unitName: string | null;
	logPath: string | null;
	installCommand: string | null;
	restartCommand: string | null;
	statusCommand: string | null;
}

export interface ApiStatusApiSummary {
	process: ApiStatusApiProcessSummary;
	managedService: ApiStatusManagedServiceSummary;
	logTailRoute: string | null;
}

export interface ApiStatusBackpressureSummary {
	reason: ApiStatusBackpressureReason | "unknown";
	message: string | null;
}

export interface ApiStatusSchedulerOperatorSummary {
	posture: ApiStatusAccountMirrorPosture | "unknown";
	reason: string | null;
	backpressureReason: string | null;
}

export interface ApiStatusSchedulerSummary {
	enabled: boolean | null;
	state: string | null;
	dryRun: boolean | null;
	lastWakeReason: string | null;
	lastWakeAt: string | null;
	lastAction: string | null;
	operatorStatus: ApiStatusSchedulerOperatorSummary;
	foregroundWork: ApiStatusSchedulerForegroundWorkSummary;
	backpressure: ApiStatusBackpressureSummary;
	latestYield: ApiStatusSchedulerYieldSummary | null;
}

export interface ApiStatusSchedulerForegroundWorkSummary {
	active: boolean | null;
	activeRequestCount: number | null;
	drainReservations: number | null;
	backgroundDrainScheduled: boolean | null;
	backgroundDrainState: string | null;
}

export interface ApiStatusCompletionMetricsSummary {
	total: number | null;
	active: number | null;
	queued: number | null;
	running: number | null;
	idleWaiting: number | null;
	paused: number | null;
	completed: number | null;
	blocked: number | null;
	failed: number | null;
	cancelled: number | null;
}

export interface ApiStatusCompletionOperationSummary {
	id: string | null;
	provider: string | null;
	runtimeProfileId: string | null;
	mode: string | null;
	phase: string | null;
	status: string | null;
	startedAt: string | null;
	completedAt: string | null;
	nextAttemptAt: string | null;
	passCount: number | null;
	errorMessage: string | null;
	latestLifecycleEvent: {
		at: string | null;
		type: string | null;
		message: string | null;
	} | null;
}

export interface ApiStatusCompletionControlSummary {
	generatedAt: string | null;
	metrics: ApiStatusCompletionMetricsSummary;
	active: ApiStatusCompletionOperationSummary[];
	recentControlled: ApiStatusCompletionOperationSummary[];
}

export type ApiStatusLiveFollowHealthSummary = LiveFollowHealthSummary;

export interface ApiStatusCliSummary {
	ok: boolean | null;
	host: string;
	port: number;
	api: ApiStatusApiSummary;
	scheduler: ApiStatusSchedulerSummary;
	completions: ApiStatusCompletionControlSummary;
	proofScope: {
		enabled: boolean;
		provider: string | null;
		runtimeProfileId: string | null;
		tenantKey: string | null;
		bindingKey: string | null;
		globalLiveFollowSuppressed: boolean | null;
	} | null;
	liveFollow: ApiStatusLiveFollowHealthSummary;
	schedulerDiagnosticsHints: ApiStatusSchedulerDiagnosticsHint[];
	raw: unknown;
}

export interface ApiStatusSchedulerDiagnosticsHint {
	provider: string | null;
	runtimeProfileId: string | null;
	completionId: string | null;
	command: string;
}

export interface ApiStatusSchedulerYieldSummary {
	completedAt: string | null;
	provider: string | null;
	runtimeProfileId: string | null;
	queuedOwnerCommand: string | null;
	remainingDetailSurfaces: number | null;
}

export async function readApiStatusForCli(
	options: ApiStatusCliOptions = {},
	fetchImpl: typeof fetch = fetch,
): Promise<ApiStatusCliSummary> {
	const host = normalizeApiStatusHost(options.host);
	const port = normalizeApiStatusPort(options.port);
	const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(`http://${host}:${port}/status`, {
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`AuraCall API status returned HTTP ${response.status}.`);
		}
		const raw = await response.json();
		return summarizeApiStatusPayload(raw, { host, port });
	} finally {
		clearTimeout(timeout);
	}
}

export function summarizeApiStatusPayload(
	raw: unknown,
	source: { host: string; port: number },
): ApiStatusCliSummary {
	const record = isRecord(raw) ? raw : {};
	const scheduler = isRecord(record.accountMirrorScheduler) ? record.accountMirrorScheduler : {};
	const lastPass = isRecord(scheduler.lastPass) ? scheduler.lastPass : {};
	const operatorStatus = isRecord(scheduler.operatorStatus) ? scheduler.operatorStatus : {};
	const foregroundWork = isRecord(scheduler.foregroundWork) ? scheduler.foregroundWork : {};
	const backpressure = isRecord(lastPass.backpressure) ? lastPass.backpressure : {};
	const latestYield = summarizeLatestYield(scheduler, lastPass);
	const completions = summarizeAccountMirrorCompletions(record.accountMirrorCompletions);
	const rawLiveFollow = isRecord(record.liveFollow) ? record.liveFollow : {};
	const targets = summarizeLiveFollowTargets(rawLiveFollow.targets);
	const routes = isRecord(record.routes) ? record.routes : {};
	const schedulerSummary: ApiStatusSchedulerSummary = {
		enabled: typeof scheduler.enabled === "boolean" ? scheduler.enabled : null,
		state: readString(scheduler.state),
		dryRun: typeof scheduler.dryRun === "boolean" ? scheduler.dryRun : null,
		lastWakeReason: readString(scheduler.lastWakeReason),
		lastWakeAt: readString(scheduler.lastWakeAt),
		lastAction: readString(lastPass.action),
		operatorStatus: {
			posture: normalizeApiStatusAccountMirrorPosture(operatorStatus.posture),
			reason: readString(operatorStatus.reason),
			backpressureReason: readString(operatorStatus.backpressureReason),
		},
		foregroundWork: {
			active: readBoolean(foregroundWork.active),
			activeRequestCount: readNumber(foregroundWork.activeRequestCount),
			drainReservations: readNumber(foregroundWork.drainReservations),
			backgroundDrainScheduled: readBoolean(foregroundWork.backgroundDrainScheduled),
			backgroundDrainState: readString(foregroundWork.backgroundDrainState),
		},
		backpressure: {
			reason: normalizeApiStatusBackpressureReason(backpressure.reason),
			message: readString(backpressure.message),
		},
		latestYield,
	};
	const liveFollow = summarizeLiveFollowHealth(schedulerSummary, completions, targets);
	return {
		ok: typeof record.ok === "boolean" ? record.ok : null,
		host: source.host,
		port: source.port,
		api: summarizeApiRuntime(record.api, routes),
		scheduler: schedulerSummary,
		completions,
		proofScope: summarizeProofScope(record.accountMirrorProofScope),
		liveFollow,
		schedulerDiagnosticsHints: buildSchedulerDiagnosticsHints({
			host: source.host,
			port: source.port,
			completions,
			targets,
		}),
		raw,
	};
}

export function assertApiStatusSchedulerPosture(
	summary: ApiStatusCliSummary,
	expectation: ApiStatusSchedulerPostureExpectation = {},
): void {
	const expectedPosture = expectation.expectedPosture ?? null;
	if (!expectedPosture) return;
	const actualPosture = summary.scheduler.operatorStatus.posture;
	if (actualPosture !== expectedPosture) {
		throw new Error(
			`Expected accountMirrorScheduler.operatorStatus.posture to be ${expectedPosture}, got ${actualPosture}.`,
		);
	}
}

export function assertApiStatusBackpressure(
	summary: ApiStatusCliSummary,
	expectation: ApiStatusBackpressureExpectation = {},
): void {
	const expectedReason = expectation.expectedReason ?? null;
	if (!expectedReason) return;
	const actualReason = summary.scheduler.backpressure.reason;
	if (actualReason !== expectedReason) {
		throw new Error(
			`Expected accountMirrorScheduler.lastPass.backpressure.reason to be ${expectedReason}, got ${actualReason}.`,
		);
	}
}

export function assertApiStatusCompletionMetrics(
	summary: ApiStatusCliSummary,
	expectation: ApiStatusCompletionMetricsExpectation = {},
): void {
	const checks: Array<
		[keyof ApiStatusCompletionMetricsSummary, number | null | undefined, string]
	> = [
		["paused", expectation.expectedPaused, "paused"],
		["cancelled", expectation.expectedCancelled, "cancelled"],
		["failed", expectation.expectedFailed, "failed"],
		["active", expectation.expectedActive, "active"],
	];
	for (const [metricKey, expected, label] of checks) {
		if (expected == null) continue;
		const actual = summary.completions.metrics[metricKey];
		if (actual !== expected) {
			throw new Error(
				`Expected accountMirrorCompletions.metrics.${label} to be ${expected}, got ${actual ?? "unknown"}.`,
			);
		}
	}
}

export function assertApiStatusLiveFollowSeverity(
	summary: ApiStatusCliSummary,
	expectation: ApiStatusLiveFollowSeverityExpectation = {},
): void {
	const expectedSeverity = expectation.expectedSeverity ?? null;
	if (!expectedSeverity) return;
	const actualSeverity = summary.liveFollow.severity;
	if (actualSeverity !== expectedSeverity) {
		throw new Error(
			`Expected liveFollow.severity to be ${expectedSeverity}, got ${actualSeverity}.`,
		);
	}
}

export function formatApiStatusCliSummary(summary: ApiStatusCliSummary): string {
	const scheduler = summary.scheduler;
	const backpressure = scheduler.backpressure;
	const operatorStatus = scheduler.operatorStatus;
	const lines = [
		`AuraCall API status: ${summary.ok === null ? "unknown" : summary.ok ? "ok" : "not-ok"} (${summary.host}:${summary.port})`,
		formatApiRuntimeLine(summary.api),
		summary.liveFollow.line,
		`Account mirror scheduler: state=${scheduler.state ?? "unknown"} enabled=${formatNullableBoolean(scheduler.enabled)} dryRun=${formatNullableBoolean(scheduler.dryRun)}`,
		`Account mirror posture: ${operatorStatus.posture}${operatorStatus.reason ? ` - ${operatorStatus.reason}` : ""}`,
		formatForegroundWorkLine(scheduler.foregroundWork),
		`Latest lazy mirror wake: ${scheduler.lastWakeReason ?? "unknown"}${scheduler.lastWakeAt ? ` at ${scheduler.lastWakeAt}` : ""}`,
		`Latest lazy mirror backpressure: ${backpressure.reason}${backpressure.message ? ` - ${backpressure.message}` : ""}`,
	];
	if (scheduler.lastAction) {
		lines.push(`Latest lazy mirror action: ${scheduler.lastAction}`);
	}
	if (scheduler.latestYield) {
		const yieldSummary = scheduler.latestYield;
		lines.push(
			`Latest lazy mirror yield: ${yieldSummary.provider ?? "unknown"}/${yieldSummary.runtimeProfileId ?? "unknown"} at ${yieldSummary.completedAt ?? "unknown"} queued=${yieldSummary.queuedOwnerCommand ?? "unknown"} remaining=${yieldSummary.remainingDetailSurfaces ?? "unknown"}`,
		);
	}
	if (summary.proofScope?.enabled) {
		lines.push(
			`Account mirror proof scope: ${summary.proofScope.provider ?? "any"}/${summary.proofScope.runtimeProfileId ?? "any"} tenant=${summary.proofScope.tenantKey ?? "unknown"} binding=${summary.proofScope.bindingKey ?? "unknown"} suppressed=${formatNullableBoolean(summary.proofScope.globalLiveFollowSuppressed)}`,
		);
	}
	lines.push(formatCompletionControlLine(summary.completions));
	lines.push(...formatSchedulerDiagnosticsHintLines(summary.schedulerDiagnosticsHints));
	const targetLine = formatLiveFollowTargetLine(summary.liveFollow.targets);
	if (targetLine) {
		lines.push(targetLine);
	}
	const desiredActualLine = formatLiveFollowDesiredActualLine(summary.liveFollow.targets);
	if (desiredActualLine) {
		lines.push(desiredActualLine);
	}
	const activeLine = formatCompletionOperationLine(
		"Active mirror completion",
		summary.completions.active,
	);
	if (activeLine) {
		lines.push(activeLine);
	}
	const recentLine = formatCompletionOperationLine(
		"Recent controlled mirror completion",
		summary.completions.recentControlled,
	);
	if (recentLine) {
		lines.push(recentLine);
	}
	return lines.join("\n");
}

function formatSchedulerDiagnosticsHintLines(hints: ApiStatusSchedulerDiagnosticsHint[]): string[] {
	if (hints.length === 0) return [];
	return [
		`Scheduler diagnostics: available=${hints.length}`,
		...hints.map((hint, index) => {
			const label = [hint.provider, hint.runtimeProfileId].filter(Boolean).join("/");
			return `Scheduler diagnostics command ${index + 1}${label ? ` (${label})` : ""}: ${JSON.stringify(hint.command)}`;
		}),
	];
}

function formatApiRuntimeLine(api: ApiStatusApiSummary): string {
	const process = api.process;
	const service = api.managedService;
	return [
		"API service:",
		`pid=${formatNullableNumber(process.pid)}`,
		`unit=${service.unitName ?? "unknown"}`,
		`log=${service.logPath ?? "unknown"}`,
		`tail=${api.logTailRoute ?? "unknown"}`,
	].join(" ");
}

function formatLiveFollowTargetLine(
	targets: ApiStatusLiveFollowHealthSummary["targets"],
): string | null {
	if (!targets) return null;
	const deferredAssets = (targets.accounts ?? []).filter(
		(account) =>
			account.assetInventory?.state === "deferred" || account.assetInventory?.state === "unknown",
	).length;
	return [
		"Live follow targets:",
		`total=${targets.total}`,
		`enabled=${targets.enabled}`,
		`active=${targets.active}`,
		`complete=${targets.complete}`,
		`in_progress=${targets.inProgress}`,
		`asset_unknown_or_deferred=${deferredAssets}`,
		`attention=${targets.attentionNeeded}`,
	].join(" ");
}

function formatLiveFollowDesiredActualLine(
	targets: ApiStatusLiveFollowHealthSummary["targets"],
): string | null {
	if (!targets) return null;
	const desired = targets.desired ?? targets;
	const actual = targets.actual ?? targets;
	return [
		"Live follow desired/actual:",
		`desired_enabled=${desired.enabled}`,
		`desired_disabled=${desired.disabled}`,
		`desired_missing_identity=${desired.missingIdentity}`,
		`actual_active=${actual.active}`,
		`actual_complete=${actual.complete}`,
		`actual_attention=${actual.attentionNeeded}`,
	].join(" ");
}

function formatForegroundWorkLine(summary: ApiStatusSchedulerForegroundWorkSummary): string {
	return [
		"Foreground work:",
		`active=${formatNullableBoolean(summary.active)}`,
		`activeRequests=${formatNullableNumber(summary.activeRequestCount)}`,
		`pendingDrains=${formatNullableNumber(summary.drainReservations)}`,
		`backgroundDrainScheduled=${formatNullableBoolean(summary.backgroundDrainScheduled)}`,
		`backgroundDrainState=${summary.backgroundDrainState ?? "unknown"}`,
	].join(" ");
}

export function normalizeApiStatusAccountMirrorPosture(
	value: unknown,
): ApiStatusSchedulerOperatorSummary["posture"] {
	const normalized = typeof value === "string" ? value.trim() : "";
	return API_STATUS_ACCOUNT_MIRROR_POSTURES.includes(normalized as ApiStatusAccountMirrorPosture)
		? (normalized as ApiStatusAccountMirrorPosture)
		: "unknown";
}

export function normalizeApiStatusBackpressureReason(
	value: unknown,
): ApiStatusBackpressureSummary["reason"] {
	const normalized = typeof value === "string" ? value.trim() : "";
	return API_STATUS_BACKPRESSURE_REASONS.includes(normalized as ApiStatusBackpressureReason)
		? (normalized as ApiStatusBackpressureReason)
		: "unknown";
}

export function parseApiStatusAccountMirrorPosture(
	value: string | undefined,
): ApiStatusAccountMirrorPosture | undefined {
	if (value == null) return undefined;
	const normalized = value.trim();
	if (API_STATUS_ACCOUNT_MIRROR_POSTURES.includes(normalized as ApiStatusAccountMirrorPosture)) {
		return normalized as ApiStatusAccountMirrorPosture;
	}
	throw new Error(
		`Invalid account mirror posture "${value}". Use one of: ${API_STATUS_ACCOUNT_MIRROR_POSTURES.join(", ")}.`,
	);
}

export function parseApiStatusBackpressureReason(
	value: string | undefined,
): ApiStatusBackpressureReason | undefined {
	if (value == null) return undefined;
	const normalized = value.trim();
	if (API_STATUS_BACKPRESSURE_REASONS.includes(normalized as ApiStatusBackpressureReason)) {
		return normalized as ApiStatusBackpressureReason;
	}
	throw new Error(
		`Invalid backpressure reason "${value}". Use one of: ${API_STATUS_BACKPRESSURE_REASONS.join(", ")}.`,
	);
}

export function parseApiStatusLiveFollowSeverity(
	value: string | undefined,
): ApiStatusLiveFollowSeverity | undefined {
	if (value == null) return undefined;
	const normalized = value.trim();
	if (API_STATUS_LIVE_FOLLOW_SEVERITIES.includes(normalized as ApiStatusLiveFollowSeverity)) {
		return normalized as ApiStatusLiveFollowSeverity;
	}
	throw new Error(
		`Invalid live-follow severity "${value}". Use one of: ${API_STATUS_LIVE_FOLLOW_SEVERITIES.join(", ")}.`,
	);
}

function normalizeApiStatusHost(value: string | null | undefined): string {
	const trimmed = String(value ?? "127.0.0.1").trim();
	return trimmed.length > 0 ? trimmed : "127.0.0.1";
}

function normalizeApiStatusPort(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error("Use --port <number> to select the local AuraCall API server.");
	}
	return Math.trunc(value);
}

function normalizeTimeoutMs(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return 5000;
	}
	return Math.max(100, Math.min(60_000, Math.trunc(value)));
}

function formatNullableBoolean(value: boolean | null): string {
	return value === null ? "unknown" : value ? "true" : "false";
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function summarizeApiRuntime(value: unknown, routes: Record<string, unknown>): ApiStatusApiSummary {
	const api = isRecord(value) ? value : {};
	const process = isRecord(api.process) ? api.process : {};
	const managedService = isRecord(api.managedService) ? api.managedService : {};
	return {
		process: {
			pid: readNumber(process.pid),
			ppid: readNumber(process.ppid),
			uptimeSeconds: readNumber(process.uptimeSeconds),
			cwd: readString(process.cwd),
			execPath: readString(process.execPath),
			nodeVersion: readString(process.nodeVersion),
		},
		managedService: {
			manager: readString(managedService.manager),
			unitName: readString(managedService.unitName),
			logPath: readString(managedService.logPath),
			installCommand: readString(managedService.installCommand),
			restartCommand: readString(managedService.restartCommand),
			statusCommand: readString(managedService.statusCommand),
		},
		logTailRoute: readString(routes.apiLogTail),
	};
}

function summarizeProofScope(value: unknown): ApiStatusCliSummary["proofScope"] {
	const scope = isRecord(value) ? value : null;
	if (!scope) return null;
	return {
		enabled: scope.enabled === true,
		provider: readString(scope.provider),
		runtimeProfileId: readString(scope.runtimeProfileId),
		tenantKey: readString(scope.tenantKey),
		bindingKey: readString(scope.bindingKey),
		globalLiveFollowSuppressed:
			typeof scope.globalLiveFollowSuppressed === "boolean"
				? scope.globalLiveFollowSuppressed
				: null,
	};
}

function summarizeLatestYield(
	scheduler: Record<string, unknown>,
	lastPass: Record<string, unknown>,
): ApiStatusSchedulerYieldSummary | null {
	const history = isRecord(scheduler.history) ? scheduler.history : {};
	const entries = Array.isArray(history.entries) ? history.entries : [];
	const yieldEntry = entries.find(isYieldPass) ?? (isYieldPass(lastPass) ? lastPass : null);
	if (!yieldEntry || !isRecord(yieldEntry)) {
		return null;
	}
	const refresh = isRecord(yieldEntry.refresh) ? yieldEntry.refresh : {};
	const selectedTarget = isRecord(yieldEntry.selectedTarget) ? yieldEntry.selectedTarget : {};
	const metadataEvidence = isRecord(refresh.metadataEvidence) ? refresh.metadataEvidence : {};
	const attachmentInventory = isRecord(metadataEvidence.attachmentInventory)
		? metadataEvidence.attachmentInventory
		: {};
	const yieldCause = isRecord(attachmentInventory.yieldCause) ? attachmentInventory.yieldCause : {};
	const mirrorCompleteness = isRecord(refresh.mirrorCompleteness) ? refresh.mirrorCompleteness : {};
	const remainingDetailSurfaces = isRecord(mirrorCompleteness.remainingDetailSurfaces)
		? mirrorCompleteness.remainingDetailSurfaces
		: {};
	return {
		completedAt: readString(yieldEntry.completedAt),
		provider: readString(selectedTarget.provider) ?? readString(refresh.provider),
		runtimeProfileId:
			readString(selectedTarget.runtimeProfileId) ?? readString(refresh.runtimeProfileId),
		queuedOwnerCommand: readString(yieldCause.ownerCommand),
		remainingDetailSurfaces: readNumber(remainingDetailSurfaces.total),
	};
}

function summarizeAccountMirrorCompletions(value: unknown): ApiStatusCompletionControlSummary {
	const completions = isRecord(value) ? value : {};
	const metrics = isRecord(completions.metrics) ? completions.metrics : {};
	const active = Array.isArray(completions.active)
		? completions.active.map(summarizeCompletionOperation).filter((operation) => operation.id)
		: [];
	const recent = Array.isArray(completions.recent)
		? completions.recent.map(summarizeCompletionOperation).filter((operation) => operation.id)
		: [];
	return {
		generatedAt: readString(completions.generatedAt),
		metrics: {
			total: readNumber(metrics.total),
			active: readNumber(metrics.active),
			queued: readNumber(metrics.queued),
			running: readNumber(metrics.running),
			idleWaiting: readNumber(metrics.idle_waiting),
			paused: readNumber(metrics.paused),
			completed: readNumber(metrics.completed),
			blocked: readNumber(metrics.blocked),
			failed: readNumber(metrics.failed),
			cancelled: readNumber(metrics.cancelled),
		},
		active,
		recentControlled: recent
			.filter((operation) => isControlledCompletionStatus(operation.status))
			.slice(0, 5),
	};
}

function summarizeLiveFollowHealth(
	scheduler: ApiStatusSchedulerSummary,
	completions: ApiStatusCompletionControlSummary,
	targets: ApiStatusLiveFollowHealthSummary["targets"] = null,
): ApiStatusLiveFollowHealthSummary {
	const metrics = completions.metrics;
	return summarizeSharedLiveFollowHealth({
		schedulerPosture: scheduler.operatorStatus.posture,
		schedulerState: scheduler.state,
		backpressureReason: scheduler.backpressure.reason,
		activeCompletions: metrics.active,
		pausedCompletions: metrics.paused,
		failedCompletions: metrics.failed,
		cancelledCompletions: metrics.cancelled,
		latestYield: scheduler.latestYield,
		targets,
	});
}

function summarizeLiveFollowTargets(value: unknown): ApiStatusLiveFollowHealthSummary["targets"] {
	if (!isRecord(value)) return null;
	const accounts = Array.isArray(value.accounts)
		? value.accounts
				.map(summarizeLiveFollowTargetAccount)
				.filter((account) => account.provider && account.runtimeProfileId)
		: [];
	return {
		total: readNumber(value.total) ?? accounts.length,
		enabled: readNumber(value.enabled) ?? 0,
		disabled: readNumber(value.disabled) ?? 0,
		unconfigured: readNumber(value.unconfigured) ?? 0,
		missingIdentity: readNumber(value.missingIdentity) ?? 0,
		unsupported: readNumber(value.unsupported) ?? 0,
		active: readNumber(value.active) ?? 0,
		queued: readNumber(value.queued) ?? 0,
		running: readNumber(value.running) ?? 0,
		paused: readNumber(value.paused) ?? 0,
		attentionNeeded: readNumber(value.attentionNeeded) ?? 0,
		complete: readNumber(value.complete) ?? 0,
		inProgress: readNumber(value.inProgress) ?? 0,
		none: readNumber(value.none) ?? 0,
		unknown: readNumber(value.unknown) ?? 0,
		desired: summarizeLiveFollowDesiredTargets(value.desired, value),
		actual: summarizeLiveFollowActualTargets(value.actual, value),
		accounts,
	};
}

function summarizeLiveFollowDesiredTargets(value: unknown, fallback: Record<string, unknown>) {
	const desired = isRecord(value) ? value : fallback;
	return {
		total: readNumber(desired.total) ?? readNumber(fallback.total) ?? 0,
		enabled: readNumber(desired.enabled) ?? readNumber(fallback.enabled) ?? 0,
		disabled: readNumber(desired.disabled) ?? readNumber(fallback.disabled) ?? 0,
		unconfigured: readNumber(desired.unconfigured) ?? readNumber(fallback.unconfigured) ?? 0,
		missingIdentity:
			readNumber(desired.missingIdentity) ?? readNumber(fallback.missingIdentity) ?? 0,
		unsupported: readNumber(desired.unsupported) ?? readNumber(fallback.unsupported) ?? 0,
	};
}

function summarizeLiveFollowActualTargets(value: unknown, fallback: Record<string, unknown>) {
	const actual = isRecord(value) ? value : fallback;
	return {
		active: readNumber(actual.active) ?? readNumber(fallback.active) ?? 0,
		queued: readNumber(actual.queued) ?? readNumber(fallback.queued) ?? 0,
		running: readNumber(actual.running) ?? readNumber(fallback.running) ?? 0,
		paused: readNumber(actual.paused) ?? readNumber(fallback.paused) ?? 0,
		attentionNeeded:
			readNumber(actual.attentionNeeded) ?? readNumber(fallback.attentionNeeded) ?? 0,
		complete: readNumber(actual.complete) ?? readNumber(fallback.complete) ?? 0,
		inProgress: readNumber(actual.inProgress) ?? readNumber(fallback.inProgress) ?? 0,
		none: readNumber(actual.none) ?? readNumber(fallback.none) ?? 0,
		unknown: readNumber(actual.unknown) ?? readNumber(fallback.unknown) ?? 0,
	};
}

function summarizeLiveFollowTargetAccount(value: unknown) {
	const account = isRecord(value) ? value : {};
	const metadataCounts = isRecord(account.metadataCounts) ? account.metadataCounts : null;
	const assetInventory = isRecord(account.assetInventory) ? account.assetInventory : null;
	const routineDecision = isRecord(account.routineDecision) ? account.routineDecision : null;
	const materializationOutcome = isRecord(account.materializationOutcome)
		? account.materializationOutcome
		: null;
	const materializationBacklog = isRecord(account.materializationBacklog)
		? account.materializationBacklog
		: null;
	const scrapeBudget = isRecord(account.scrapeBudget) ? account.scrapeBudget : null;
	const accountLibraryCatchup = isRecord(account.accountLibraryCatchup)
		? account.accountLibraryCatchup
		: null;
	const accountLibraryPreview =
		accountLibraryCatchup && isRecord(accountLibraryCatchup.preview)
			? accountLibraryCatchup.preview
			: null;
	const metadataCountEvidence = isRecord(account.metadataCountEvidence)
		? account.metadataCountEvidence
		: null;
	const identityEvidence = isRecord(account.identityEvidence) ? account.identityEvidence : null;
	const identityRepair =
		identityEvidence && isRecord(identityEvidence.repair) ? identityEvidence.repair : null;
	return {
		provider: readString(account.provider) ?? "",
		tenantKey: readString(account.tenantKey),
		bindingKey: readString(account.bindingKey) ?? "",
		runtimeProfileId: readString(account.runtimeProfileId) ?? "",
		browserProfileId: readString(account.browserProfileId),
		desiredState: readString(account.desiredState) ?? "unknown",
		desiredEnabled: account.desiredEnabled === true,
		actualStatus: readString(account.actualStatus),
		statusReason: readString(account.statusReason),
		identityEvidence: identityEvidence
			? {
					source: readString(identityEvidence.source) ?? "unknown",
					confidence: readString(identityEvidence.confidence) ?? "unknown",
					observedAt: readString(identityEvidence.observedAt),
					recheckable: identityEvidence.recheckable === true,
					repairStatus: readString(identityEvidence.repairStatus) ?? "none",
					previousDetectedIdentityKey: readString(identityEvidence.previousDetectedIdentityKey),
					currentDetectedIdentityKey: readString(identityEvidence.currentDetectedIdentityKey),
					lastCheckedAt: readString(identityEvidence.lastCheckedAt),
					repair: identityRepair
						? {
								status: readString(identityRepair.status) ?? "none",
								previousDetectedIdentityKey: readString(identityRepair.previousDetectedIdentityKey),
								currentDetectedIdentityKey: readString(identityRepair.currentDetectedIdentityKey),
								repairedAt: readString(identityRepair.repairedAt),
								checkedAt: readString(identityRepair.checkedAt),
								source: readString(identityRepair.source),
								requestId: readString(identityRepair.requestId),
							}
						: null,
				}
			: undefined,
		attentionNeeded: account.attentionNeeded === true,
		activeCompletionId: readString(account.activeCompletionId),
		latestCompletionStatus: readString(account.latestCompletionStatus),
		latestCompletionError: readString(account.latestCompletionError),
		phase: readString(account.phase),
		passCount: readNumber(account.passCount),
		routineEligibleAt: readString(account.routineEligibleAt),
		lastFailureAt: readString(account.lastFailureAt),
		consecutiveFailureCount: readNumber(account.consecutiveFailureCount) ?? 0,
		activeCompletionNextAttemptAt: readString(account.activeCompletionNextAttemptAt),
		nextAttemptAt: readString(account.nextAttemptAt),
		providerGuard: summarizeLiveFollowProviderGuard(account.providerGuard),
		mirrorCompleteness: readString(account.mirrorCompleteness),
		routineDecision: summarizeLiveFollowRoutineDecision(routineDecision),
		assetInventory: assetInventory
			? {
					state: readString(assetInventory.state) ?? "unknown",
					summary: readString(assetInventory.summary),
					detailScannedThisPass: summarizeDetailScanned(assetInventory.detailScannedThisPass),
				}
			: null,
		materializationBacklog: materializationBacklog
			? {
					state: summarizeMaterializationBacklogState(materializationBacklog.state),
					policy: readString(materializationBacklog.policy),
					metadataCurrent: materializationBacklog.metadataCurrent === true,
					localRequired: materializationBacklog.localRequired === true,
					remoteKnownMissingLocal: summarizeMaterializationAssetCounts(
						materializationBacklog.remoteKnownMissingLocal,
					),
					localMaterialized: summarizeMaterializationAssetCounts(
						materializationBacklog.localMaterialized,
					),
					unknownOrDeferred: summarizeMaterializationAssetCounts(
						materializationBacklog.unknownOrDeferred,
					),
					summary: readString(materializationBacklog.summary) ?? "",
				}
			: null,
		latestLifecycleEvent: readLatestCompletionLifecycleEvent(account.latestLifecycleEvent),
		materializationOutcome: materializationOutcome
			? {
					jobStatus: readString(materializationOutcome.jobStatus),
					conversationsAttempted: readNumber(materializationOutcome.conversationsAttempted) ?? 0,
					materialized: readNumber(materializationOutcome.materialized) ?? 0,
					checksumCount: readNumber(materializationOutcome.checksumCount) ?? 0,
				}
			: null,
		scrapeBudget: summarizeLiveFollowScrapeBudget(scrapeBudget),
		accountLibraryCatchup: accountLibraryCatchup
			? {
					mode: readString(accountLibraryCatchup.mode) ?? "disabled",
					enabled: accountLibraryCatchup.enabled === true,
					status: readString(accountLibraryCatchup.status) ?? "disabled",
					reason: readString(accountLibraryCatchup.reason),
					activeJobId: readString(accountLibraryCatchup.activeJobId),
					activeJobStatus: readString(accountLibraryCatchup.activeJobStatus),
					activeJobScheduler: summarizeAccountLibraryScheduler(
						accountLibraryCatchup.activeJobScheduler,
					),
					activeJobCount: readNumber(accountLibraryCatchup.activeJobCount) ?? 0,
					maxItems: readNumber(accountLibraryCatchup.maxItems),
					minIntervalMs: readNumber(accountLibraryCatchup.minIntervalMs),
					failureCooldownMs: readNumber(accountLibraryCatchup.failureCooldownMs),
					cooldownUntil: readString(accountLibraryCatchup.cooldownUntil),
					maxActiveJobs: readNumber(accountLibraryCatchup.maxActiveJobs),
					providerWorkTimeoutMs: readNumber(accountLibraryCatchup.providerWorkTimeoutMs),
					nextAttemptAt: readString(accountLibraryCatchup.nextAttemptAt),
					browserHealth: isRecord(accountLibraryCatchup.browserHealth)
						? {
								status: readString(accountLibraryCatchup.browserHealth.status) ?? "unknown",
								reason: readString(accountLibraryCatchup.browserHealth.reason),
								processAlive: accountLibraryCatchup.browserHealth.processAlive === true,
								devToolsResponsive: accountLibraryCatchup.browserHealth.devToolsResponsive === true,
								launchCommandHasBlankArg:
									accountLibraryCatchup.browserHealth.launchCommandHasBlankArg === true,
								openBlankPageCount:
									readNumber(accountLibraryCatchup.browserHealth.openBlankPageCount) ?? 0,
								pageTargetCount:
									readNumber(accountLibraryCatchup.browserHealth.pageTargetCount) ?? 0,
								pid: readNumber(accountLibraryCatchup.browserHealth.pid),
								port: readNumber(accountLibraryCatchup.browserHealth.port),
								error: readString(accountLibraryCatchup.browserHealth.error),
							}
						: null,
					preview: accountLibraryPreview
						? {
								generatedAt: readString(accountLibraryPreview.generatedAt),
								catalogFiles: readNumber(accountLibraryPreview.catalogFiles) ?? 0,
								eligibleCandidates: readNumber(accountLibraryPreview.eligibleCandidates) ?? 0,
								selectedCandidates: readNumber(accountLibraryPreview.selectedCandidates) ?? 0,
								archivedFamilies: readNumber(accountLibraryPreview.archivedFamilies) ?? 0,
								unresolvedStale: readNumber(accountLibraryPreview.unresolvedStale) ?? 0,
								unsupportedOrTerminal: readNumber(accountLibraryPreview.unsupportedOrTerminal) ?? 0,
								duplicateFamilies: readNumber(accountLibraryPreview.duplicateFamilies) ?? 0,
							}
						: null,
				}
			: null,
		metadataCounts: metadataCounts
			? {
					projects: readNumber(metadataCounts.projects) ?? 0,
					conversations: readNumber(metadataCounts.conversations) ?? 0,
					artifacts: readNumber(metadataCounts.artifacts) ?? 0,
					files: readNumber(metadataCounts.files) ?? 0,
					media: readNumber(metadataCounts.media) ?? 0,
				}
			: null,
		metadataCountEvidence: metadataCountEvidence
			? {
					observedThisPass: summarizeMetadataCounts(metadataCountEvidence.observedThisPass),
					retainedFromCache: summarizeMetadataCounts(metadataCountEvidence.retainedFromCache),
					mergedTotal: summarizeMetadataCounts(metadataCountEvidence.mergedTotal),
				}
			: null,
	};
}

function summarizeLiveFollowScrapeBudget(value: Record<string, unknown> | null) {
	if (!value) return null;
	const passive = isRecord(value.passive) ? value.passive : {};
	const active = isRecord(value.active) ? value.active : {};
	const providerInteractions = isRecord(value.providerInteractions)
		? value.providerInteractions
		: {};
	const providerGuardCorrelation = isRecord(value.providerGuardCorrelation)
		? value.providerGuardCorrelation
		: {};
	return {
		classification: readString(value.classification) ?? "unknown",
		summary: readString(value.summary) ?? "",
		passive: {
			domParses: readNumber(passive.domParses) ?? 0,
			appStateReads: readNumber(passive.appStateReads) ?? 0,
			downloadLinkEnumerations: readNumber(passive.downloadLinkEnumerations) ?? 0,
			cachedFileCarries: readNumber(passive.cachedFileCarries) ?? 0,
			total: readNumber(passive.total) ?? 0,
		},
		active: {
			identityReads: readNumber(active.identityReads) ?? 0,
			projectIndexReads: readNumber(active.projectIndexReads) ?? 0,
			rootRailReads: readNumber(active.rootRailReads) ?? 0,
			projectConversationReads: readNumber(active.projectConversationReads) ?? 0,
			chatLoads: readNumber(active.chatLoads) ?? 0,
			accountLibraryReads: readNumber(active.accountLibraryReads) ?? 0,
			downloads: readNumber(active.downloads) ?? 0,
			total: readNumber(active.total) ?? 0,
		},
		providerInteractions: {
			budget: readNumber(providerInteractions.budget),
			used: readNumber(providerInteractions.used) ?? 0,
			remaining: readNumber(providerInteractions.remaining),
			yielded: providerInteractions.yielded === true,
			yieldReason: readString(providerInteractions.yieldReason),
		},
		providerGuardCorrelation: {
			state: readString(providerGuardCorrelation.state) ?? "none",
			kind: readString(providerGuardCorrelation.kind),
			summary: readString(providerGuardCorrelation.summary),
			detectedAt: readString(providerGuardCorrelation.detectedAt),
			cooldownUntil: readString(providerGuardCorrelation.cooldownUntil),
			action: readString(providerGuardCorrelation.action),
			correlatedWithYield: providerGuardCorrelation.correlatedWithYield === true,
			yieldReason: readString(providerGuardCorrelation.yieldReason),
		},
		llmServiceRequests: readNumber(value.llmServiceRequests) ?? 0,
		cdpMethodCalls: readNumber(value.cdpMethodCalls),
		cdpMethods: summarizeNumberRecord(value.cdpMethods),
		providerActions: summarizeNumberRecord(value.providerActions),
	};
}

function summarizeNumberRecord(value: unknown): Record<string, number> {
	if (!isRecord(value)) return {};
	const summary: Record<string, number> = {};
	for (const [key, rawCount] of Object.entries(value)) {
		const count = readNumber(rawCount);
		if (count === null || count <= 0) continue;
		summary[key] = count;
	}
	return summary;
}

function summarizeAccountLibraryScheduler(value: unknown) {
	const scheduler = isRecord(value) ? value : null;
	if (!scheduler) return null;
	return {
		object: readString(scheduler.object) ?? "history_materialization_job_scheduler",
		generatedAt: readString(scheduler.generatedAt) ?? "",
		state: readString(scheduler.state) ?? "unknown",
		dispatchState: readString(scheduler.dispatchState) ?? "unknown",
		queuedAgeMs: readNumber(scheduler.queuedAgeMs),
		runAgeMs: readNumber(scheduler.runAgeMs),
		queuedToStartLatencyMs: readNumber(scheduler.queuedToStartLatencyMs),
		stale: scheduler.stale === true,
		staleReason: readString(scheduler.staleReason),
	};
}

function summarizeDetailScanned(value: unknown) {
	const record = isRecord(value) ? value : null;
	if (!record) return null;
	return {
		projects: readNumber(record.projects) ?? 0,
		conversations: readNumber(record.conversations) ?? 0,
		total: readNumber(record.total) ?? 0,
	};
}

function summarizeMetadataCounts(value: unknown) {
	const record = isRecord(value) ? value : {};
	return {
		projects: readNumber(record.projects) ?? 0,
		conversations: readNumber(record.conversations) ?? 0,
		artifacts: readNumber(record.artifacts) ?? 0,
		files: readNumber(record.files) ?? 0,
		media: readNumber(record.media) ?? 0,
	};
}

function summarizeMaterializationAssetCounts(value: unknown) {
	const record = isRecord(value) ? value : {};
	const artifacts = readNumber(record.artifacts) ?? 0;
	const files = readNumber(record.files) ?? 0;
	const media = readNumber(record.media) ?? 0;
	return {
		artifacts,
		files,
		media,
		total: readNumber(record.total) ?? artifacts + files + media,
	};
}

function summarizeMaterializationBacklogState(
	value: unknown,
): LiveFollowMaterializationBacklogState {
	return normalizeLiveFollowMaterializationBacklogState(readString(value));
}

function summarizeLiveFollowRoutineDecision(value: unknown) {
	const decision = isRecord(value) ? value : null;
	const remainingWork = decision && isRecord(decision.remainingWork) ? decision.remainingWork : {};
	const guard = decision && isRecord(decision.guard) ? decision.guard : null;
	const preemption = decision && isRecord(decision.preemption) ? decision.preemption : null;
	const cycle = decision && isRecord(decision.cycle) ? decision.cycle : null;
	return {
		state: summarizeLiveFollowRoutineDecisionState(decision?.state),
		nextPhase: readString(decision?.nextPhase),
		why: readString(decision?.why) ?? "live-follow routine decision is unavailable",
		eligibleAt: readString(decision?.eligibleAt),
		lastProgressAt: readString(decision?.lastProgressAt),
		remainingWork: {
			detailSurfaces: readNumber(remainingWork.detailSurfaces),
			materializationAssets: readNumber(remainingWork.materializationAssets) ?? 0,
			accountLibraryStatus: readString(remainingWork.accountLibraryStatus),
		},
		guard: guard ? summarizeLiveFollowProviderGuard(guard) : null,
		preemption: preemption
			? {
					state: readString(preemption.state) ?? "unknown",
					reason: readString(preemption.reason),
					retryAt: readString(preemption.retryAt),
				}
			: null,
		cycle: cycle
			? {
					id: readString(cycle.id) ?? "",
					currentPhase: readString(cycle.currentPhase) ?? "complete",
					nextPhase: readString(cycle.nextPhase) ?? "complete",
					status: readString(cycle.status),
					updatedAt: readString(cycle.updatedAt) ?? "",
					passCount: readNumber(cycle.passCount) ?? 0,
					reason: readString(cycle.reason) ?? "",
				}
			: null,
	};
}

function summarizeLiveFollowRoutineDecisionState(value: unknown): LiveFollowRoutineDecisionState {
	return normalizeLiveFollowRoutineDecisionState(readString(value));
}

function summarizeLiveFollowProviderGuard(value: unknown) {
	const guard = isRecord(value) ? value : null;
	if (!guard) return null;
	return {
		state: readString(guard.state) ?? "unknown",
		kind: readString(guard.kind),
		summary: readString(guard.summary),
		cooldownUntil: readString(guard.cooldownUntil),
		url: readString(guard.url),
		action: readString(guard.action),
	};
}

function buildSchedulerDiagnosticsHints(input: {
	host: string;
	port: number;
	completions: ApiStatusCompletionControlSummary;
	targets: ApiStatusLiveFollowHealthSummary["targets"];
}): ApiStatusSchedulerDiagnosticsHint[] {
	const candidates: Array<{
		provider: string | null;
		runtimeProfileId: string | null;
		completionId: string | null;
	}> = [];
	for (const completion of input.completions.active) {
		candidates.push({
			provider: completion.provider,
			runtimeProfileId: completion.runtimeProfileId,
			completionId: completion.id,
		});
	}
	for (const account of input.targets?.accounts ?? []) {
		if (!account.activeCompletionId) continue;
		candidates.push({
			provider: account.provider,
			runtimeProfileId: account.runtimeProfileId,
			completionId: account.activeCompletionId,
		});
	}

	const seen = new Set<string>();
	const hints: ApiStatusSchedulerDiagnosticsHint[] = [];
	for (const candidate of candidates) {
		const provider = normalizeOptionalValue(candidate.provider);
		const runtimeProfileId = normalizeOptionalValue(candidate.runtimeProfileId);
		const completionId = normalizeOptionalValue(candidate.completionId);
		if (!provider && !runtimeProfileId && !completionId) continue;
		const key = [provider ?? "", runtimeProfileId ?? "", completionId ?? ""].join("\0");
		if (seen.has(key)) continue;
		seen.add(key);
		hints.push({
			provider,
			runtimeProfileId,
			completionId,
			command: formatSchedulerDiagnosticsCommand({
				host: input.host,
				port: input.port,
				provider,
				runtimeProfileId,
				completionId,
			}),
		});
	}
	return hints;
}

function formatSchedulerDiagnosticsCommand(input: {
	host: string;
	port: number;
	provider: string | null;
	runtimeProfileId: string | null;
	completionId: string | null;
}): string {
	const args = ["auracall", "api", "scheduler-diagnostics"];
	if (input.host && input.host !== "127.0.0.1") {
		args.push("--host", input.host);
	}
	args.push("--port", String(input.port));
	if (input.provider) {
		args.push("--provider", input.provider);
	}
	if (input.runtimeProfileId) {
		args.push("--runtime-profile", input.runtimeProfileId);
	}
	if (input.completionId) {
		args.push("--completion-id", input.completionId);
	}
	return args.map(quoteCliArg).join(" ");
}

function quoteCliArg(value: string): string {
	return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function normalizeOptionalValue(value: string | null | undefined): string | null {
	const trimmed = String(value ?? "").trim();
	return trimmed.length > 0 ? trimmed : null;
}

function summarizeCompletionOperation(value: unknown): ApiStatusCompletionOperationSummary {
	const operation = isRecord(value) ? value : {};
	const error = isRecord(operation.error) ? operation.error : {};
	const latestLifecycleEvent = readLatestCompletionLifecycleEvent(operation.lifecycleEvents);
	return {
		id: readString(operation.id),
		provider: readString(operation.provider),
		runtimeProfileId: readString(operation.runtimeProfileId),
		mode: readString(operation.mode),
		phase: readString(operation.phase),
		status: readString(operation.status),
		startedAt: readString(operation.startedAt),
		completedAt: readString(operation.completedAt),
		nextAttemptAt: readString(operation.nextAttemptAt),
		passCount: readNumber(operation.passCount),
		errorMessage: readString(error.message),
		latestLifecycleEvent,
	};
}

function readLatestCompletionLifecycleEvent(
	value: unknown,
): ApiStatusCompletionOperationSummary["latestLifecycleEvent"] {
	const event = Array.isArray(value)
		? isRecord(value.at(-1))
			? (value.at(-1) as Record<string, unknown>)
			: null
		: isRecord(value)
			? value
			: null;
	if (!event) return null;
	return {
		at: readString(event.at),
		type: readString(event.type),
		message: readString(event.message),
	};
}

function isControlledCompletionStatus(status: string | null): boolean {
	return (
		status === "paused" || status === "cancelled" || status === "failed" || status === "blocked"
	);
}

function formatCompletionControlLine(summary: ApiStatusCompletionControlSummary): string {
	const metrics = summary.metrics;
	return [
		"Account mirror completions:",
		`active=${formatNullableNumber(metrics.active)}`,
		`queued=${formatNullableNumber(metrics.queued)}`,
		`running=${formatNullableNumber(metrics.running)}`,
		`idle_waiting=${formatNullableNumber(metrics.idleWaiting)}`,
		`paused=${formatNullableNumber(metrics.paused)}`,
		`failed=${formatNullableNumber(metrics.failed)}`,
		`cancelled=${formatNullableNumber(metrics.cancelled)}`,
		`total=${formatNullableNumber(metrics.total)}`,
	].join(" ");
}

function formatCompletionOperationLine(
	label: string,
	operations: ApiStatusCompletionOperationSummary[],
): string | null {
	if (operations.length === 0) {
		return null;
	}
	const formatted = operations.slice(0, 3).map((operation) => {
		const target = `${operation.provider ?? "unknown"}/${operation.runtimeProfileId ?? "unknown"}`;
		const phase = operation.phase ? ` phase=${operation.phase}` : "";
		const next = operation.nextAttemptAt ? ` next=${operation.nextAttemptAt}` : "";
		const error = operation.errorMessage ? ` error=${operation.errorMessage}` : "";
		const lifecycle = operation.latestLifecycleEvent?.type
			? ` lifecycle=${operation.latestLifecycleEvent.type}`
			: "";
		return `${operation.id ?? "unknown"} ${target} status=${operation.status ?? "unknown"}${phase}${next}${error}${lifecycle}`;
	});
	const suffix =
		operations.length > formatted.length ? ` (+${operations.length - formatted.length} more)` : "";
	return `${label}: ${formatted.join("; ")}${suffix}`;
}

function isYieldPass(value: unknown): value is Record<string, unknown> {
	if (!isRecord(value)) {
		return false;
	}
	const backpressure = isRecord(value.backpressure) ? value.backpressure : {};
	return backpressure.reason === "yielded-to-queued-work";
}

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

function formatNullableNumber(value: number | null): string {
	return value === null ? "unknown" : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
