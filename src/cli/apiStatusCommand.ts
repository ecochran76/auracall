export const API_STATUS_BACKPRESSURE_REASONS = [
  'none',
  'routine-delayed',
  'blocked-by-browser-work',
  'yielded-to-queued-work',
] as const;

export type ApiStatusBackpressureReason = typeof API_STATUS_BACKPRESSURE_REASONS[number];

export const API_STATUS_ACCOUNT_MIRROR_POSTURES = [
  'disabled',
  'paused',
  'running',
  'scheduled',
  'ready',
  'healthy',
  'backpressured',
] as const;

export type ApiStatusAccountMirrorPosture = typeof API_STATUS_ACCOUNT_MIRROR_POSTURES[number];

export const API_STATUS_LIVE_FOLLOW_SEVERITIES = [
  'healthy',
  'backpressured',
  'paused',
  'attention-needed',
] as const;

export type ApiStatusLiveFollowSeverity = typeof API_STATUS_LIVE_FOLLOW_SEVERITIES[number];

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

export interface ApiStatusBackpressureSummary {
  reason: ApiStatusBackpressureReason | 'unknown';
  message: string | null;
}

export interface ApiStatusSchedulerOperatorSummary {
  posture: ApiStatusAccountMirrorPosture | 'unknown';
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
  backpressure: ApiStatusBackpressureSummary;
  latestYield: ApiStatusSchedulerYieldSummary | null;
}

export interface ApiStatusCompletionMetricsSummary {
  total: number | null;
  active: number | null;
  queued: number | null;
  running: number | null;
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
}

export interface ApiStatusCompletionControlSummary {
  generatedAt: string | null;
  metrics: ApiStatusCompletionMetricsSummary;
  active: ApiStatusCompletionOperationSummary[];
  recentControlled: ApiStatusCompletionOperationSummary[];
}

export interface ApiStatusLiveFollowHealthSummary {
  line: string;
  severity: ApiStatusLiveFollowSeverity;
  schedulerPosture: ApiStatusSchedulerOperatorSummary['posture'];
  schedulerState: string | null;
  backpressureReason: ApiStatusBackpressureSummary['reason'];
  activeCompletions: number | null;
  pausedCompletions: number | null;
  failedCompletions: number | null;
  cancelledCompletions: number | null;
  latestYield: ApiStatusSchedulerYieldSummary | null;
}

export interface ApiStatusCliSummary {
  ok: boolean | null;
  host: string;
  port: number;
  scheduler: ApiStatusSchedulerSummary;
  completions: ApiStatusCompletionControlSummary;
  liveFollow: ApiStatusLiveFollowHealthSummary;
  raw: unknown;
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
  const scheduler = isRecord(record.accountMirrorScheduler)
    ? record.accountMirrorScheduler
    : {};
  const lastPass = isRecord(scheduler.lastPass) ? scheduler.lastPass : {};
  const operatorStatus = isRecord(scheduler.operatorStatus) ? scheduler.operatorStatus : {};
  const backpressure = isRecord(lastPass.backpressure) ? lastPass.backpressure : {};
  const latestYield = summarizeLatestYield(scheduler, lastPass);
  const completions = summarizeAccountMirrorCompletions(record.accountMirrorCompletions);
  const schedulerSummary: ApiStatusSchedulerSummary = {
    enabled: typeof scheduler.enabled === 'boolean' ? scheduler.enabled : null,
    state: readString(scheduler.state),
    dryRun: typeof scheduler.dryRun === 'boolean' ? scheduler.dryRun : null,
    lastWakeReason: readString(scheduler.lastWakeReason),
    lastWakeAt: readString(scheduler.lastWakeAt),
    lastAction: readString(lastPass.action),
    operatorStatus: {
      posture: normalizeApiStatusAccountMirrorPosture(operatorStatus.posture),
      reason: readString(operatorStatus.reason),
      backpressureReason: readString(operatorStatus.backpressureReason),
    },
    backpressure: {
      reason: normalizeApiStatusBackpressureReason(backpressure.reason),
      message: readString(backpressure.message),
    },
    latestYield,
  };
  return {
    ok: typeof record.ok === 'boolean' ? record.ok : null,
    host: source.host,
    port: source.port,
    scheduler: schedulerSummary,
    completions,
    liveFollow: summarizeLiveFollowHealth(schedulerSummary, completions),
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
  const checks: Array<[keyof ApiStatusCompletionMetricsSummary, number | null | undefined, string]> = [
    ['paused', expectation.expectedPaused, 'paused'],
    ['cancelled', expectation.expectedCancelled, 'cancelled'],
    ['failed', expectation.expectedFailed, 'failed'],
    ['active', expectation.expectedActive, 'active'],
  ];
  for (const [metricKey, expected, label] of checks) {
    if (expected == null) continue;
    const actual = summary.completions.metrics[metricKey];
    if (actual !== expected) {
      throw new Error(
        `Expected accountMirrorCompletions.metrics.${label} to be ${expected}, got ${actual ?? 'unknown'}.`,
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
    throw new Error(`Expected liveFollow.severity to be ${expectedSeverity}, got ${actualSeverity}.`);
  }
}

export function formatApiStatusCliSummary(summary: ApiStatusCliSummary): string {
  const scheduler = summary.scheduler;
  const backpressure = scheduler.backpressure;
  const operatorStatus = scheduler.operatorStatus;
  const lines = [
    `AuraCall API status: ${summary.ok === null ? 'unknown' : summary.ok ? 'ok' : 'not-ok'} (${summary.host}:${summary.port})`,
    summary.liveFollow.line,
    `Account mirror scheduler: state=${scheduler.state ?? 'unknown'} enabled=${formatNullableBoolean(scheduler.enabled)} dryRun=${formatNullableBoolean(scheduler.dryRun)}`,
    `Account mirror posture: ${operatorStatus.posture}${operatorStatus.reason ? ` - ${operatorStatus.reason}` : ''}`,
    `Latest lazy mirror wake: ${scheduler.lastWakeReason ?? 'unknown'}${scheduler.lastWakeAt ? ` at ${scheduler.lastWakeAt}` : ''}`,
    `Latest lazy mirror backpressure: ${backpressure.reason}${backpressure.message ? ` - ${backpressure.message}` : ''}`,
  ];
  if (scheduler.lastAction) {
    lines.push(`Latest lazy mirror action: ${scheduler.lastAction}`);
  }
  if (scheduler.latestYield) {
    const yieldSummary = scheduler.latestYield;
    lines.push(
      `Latest lazy mirror yield: ${yieldSummary.provider ?? 'unknown'}/${yieldSummary.runtimeProfileId ?? 'unknown'} at ${yieldSummary.completedAt ?? 'unknown'} queued=${yieldSummary.queuedOwnerCommand ?? 'unknown'} remaining=${yieldSummary.remainingDetailSurfaces ?? 'unknown'}`,
    );
  }
  lines.push(formatCompletionControlLine(summary.completions));
  const activeLine = formatCompletionOperationLine('Active mirror completion', summary.completions.active);
  if (activeLine) {
    lines.push(activeLine);
  }
  const recentLine = formatCompletionOperationLine('Recent controlled mirror completion', summary.completions.recentControlled);
  if (recentLine) {
    lines.push(recentLine);
  }
  return lines.join('\n');
}

export function normalizeApiStatusAccountMirrorPosture(value: unknown): ApiStatusSchedulerOperatorSummary['posture'] {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return API_STATUS_ACCOUNT_MIRROR_POSTURES.includes(normalized as ApiStatusAccountMirrorPosture)
    ? normalized as ApiStatusAccountMirrorPosture
    : 'unknown';
}

export function normalizeApiStatusBackpressureReason(value: unknown): ApiStatusBackpressureSummary['reason'] {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return API_STATUS_BACKPRESSURE_REASONS.includes(normalized as ApiStatusBackpressureReason)
    ? normalized as ApiStatusBackpressureReason
    : 'unknown';
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
    `Invalid account mirror posture "${value}". Use one of: ${API_STATUS_ACCOUNT_MIRROR_POSTURES.join(', ')}.`,
  );
}

export function parseApiStatusBackpressureReason(value: string | undefined): ApiStatusBackpressureReason | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (API_STATUS_BACKPRESSURE_REASONS.includes(normalized as ApiStatusBackpressureReason)) {
    return normalized as ApiStatusBackpressureReason;
  }
  throw new Error(
    `Invalid backpressure reason "${value}". Use one of: ${API_STATUS_BACKPRESSURE_REASONS.join(', ')}.`,
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
    `Invalid live-follow severity "${value}". Use one of: ${API_STATUS_LIVE_FOLLOW_SEVERITIES.join(', ')}.`,
  );
}

function normalizeApiStatusHost(value: string | null | undefined): string {
  const trimmed = String(value ?? '127.0.0.1').trim();
  return trimmed.length > 0 ? trimmed : '127.0.0.1';
}

function normalizeApiStatusPort(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('Use --port <number> to select the local AuraCall API server.');
  }
  return Math.trunc(value);
}

function normalizeTimeoutMs(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 5000;
  }
  return Math.max(100, Math.min(60_000, Math.trunc(value)));
}

function formatNullableBoolean(value: boolean | null): string {
  return value === null ? 'unknown' : value ? 'true' : 'false';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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
    runtimeProfileId: readString(selectedTarget.runtimeProfileId) ?? readString(refresh.runtimeProfileId),
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
      paused: readNumber(metrics.paused),
      completed: readNumber(metrics.completed),
      blocked: readNumber(metrics.blocked),
      failed: readNumber(metrics.failed),
      cancelled: readNumber(metrics.cancelled),
    },
    active,
    recentControlled: recent.filter((operation) => isControlledCompletionStatus(operation.status)).slice(0, 5),
  };
}

function summarizeLiveFollowHealth(
  scheduler: ApiStatusSchedulerSummary,
  completions: ApiStatusCompletionControlSummary,
): ApiStatusLiveFollowHealthSummary {
  const metrics = completions.metrics;
  const latestYield = scheduler.latestYield;
  const severity = deriveLiveFollowSeverity(scheduler, completions);
  const yieldText = latestYield
    ? `${latestYield.provider ?? 'unknown'}/${latestYield.runtimeProfileId ?? 'unknown'} remaining=${latestYield.remainingDetailSurfaces ?? 'unknown'} queued=${latestYield.queuedOwnerCommand ?? 'unknown'}`
    : 'none';
  const summary: Omit<ApiStatusLiveFollowHealthSummary, 'line'> = {
    severity,
    schedulerPosture: scheduler.operatorStatus.posture,
    schedulerState: scheduler.state,
    backpressureReason: scheduler.backpressure.reason,
    activeCompletions: metrics.active,
    pausedCompletions: metrics.paused,
    failedCompletions: metrics.failed,
    cancelledCompletions: metrics.cancelled,
    latestYield,
  };
  return {
    ...summary,
    line: [
      'Live follow health:',
      `severity=${summary.severity}`,
      `posture=${summary.schedulerPosture}`,
      `state=${summary.schedulerState ?? 'unknown'}`,
      `active=${formatNullableNumber(summary.activeCompletions)}`,
      `paused=${formatNullableNumber(summary.pausedCompletions)}`,
      `failed=${formatNullableNumber(summary.failedCompletions)}`,
      `cancelled=${formatNullableNumber(summary.cancelledCompletions)}`,
      `backpressure=${summary.backpressureReason}`,
      `latestYield=${yieldText}`,
    ].join(' '),
  };
}

function deriveLiveFollowSeverity(
  scheduler: ApiStatusSchedulerSummary,
  completions: ApiStatusCompletionControlSummary,
): ApiStatusLiveFollowSeverity {
  const metrics = completions.metrics;
  const failedCompletions = metrics.failed ?? 0;
  const cancelledCompletions = metrics.cancelled ?? 0;
  const pausedCompletions = metrics.paused ?? 0;
  const schedulerPosture = scheduler.operatorStatus.posture;
  const backpressureReason = scheduler.backpressure.reason;
  if (
    failedCompletions > 0
    || cancelledCompletions > 0
  ) {
    return 'attention-needed';
  }
  if (pausedCompletions > 0 || schedulerPosture === 'paused') {
    return 'paused';
  }
  if (schedulerPosture === 'unknown' || backpressureReason === 'unknown') {
    return 'attention-needed';
  }
  if (schedulerPosture === 'backpressured' || backpressureReason !== 'none') {
    return 'backpressured';
  }
  return 'healthy';
}

function summarizeCompletionOperation(value: unknown): ApiStatusCompletionOperationSummary {
  const operation = isRecord(value) ? value : {};
  const error = isRecord(operation.error) ? operation.error : {};
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
  };
}

function isControlledCompletionStatus(status: string | null): boolean {
  return status === 'paused' || status === 'cancelled' || status === 'failed' || status === 'blocked';
}

function formatCompletionControlLine(summary: ApiStatusCompletionControlSummary): string {
  const metrics = summary.metrics;
  return [
    'Account mirror completions:',
    `active=${formatNullableNumber(metrics.active)}`,
    `queued=${formatNullableNumber(metrics.queued)}`,
    `running=${formatNullableNumber(metrics.running)}`,
    `paused=${formatNullableNumber(metrics.paused)}`,
    `failed=${formatNullableNumber(metrics.failed)}`,
    `cancelled=${formatNullableNumber(metrics.cancelled)}`,
    `total=${formatNullableNumber(metrics.total)}`,
  ].join(' ');
}

function formatCompletionOperationLine(
  label: string,
  operations: ApiStatusCompletionOperationSummary[],
): string | null {
  if (operations.length === 0) {
    return null;
  }
  const formatted = operations.slice(0, 3).map((operation) => {
    const target = `${operation.provider ?? 'unknown'}/${operation.runtimeProfileId ?? 'unknown'}`;
    const phase = operation.phase ? ` phase=${operation.phase}` : '';
    const next = operation.nextAttemptAt ? ` next=${operation.nextAttemptAt}` : '';
    const error = operation.errorMessage ? ` error=${operation.errorMessage}` : '';
    return `${operation.id ?? 'unknown'} ${target} status=${operation.status ?? 'unknown'}${phase}${next}${error}`;
  });
  const suffix = operations.length > formatted.length ? ` (+${operations.length - formatted.length} more)` : '';
  return `${label}: ${formatted.join('; ')}${suffix}`;
}

function isYieldPass(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const backpressure = isRecord(value.backpressure) ? value.backpressure : {};
  return backpressure.reason === 'yielded-to-queued-work';
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatNullableNumber(value: number | null): string {
  return value === null ? 'unknown' : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
