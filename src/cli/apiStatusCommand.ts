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
}

export interface ApiStatusCliSummary {
  ok: boolean | null;
  host: string;
  port: number;
  scheduler: ApiStatusSchedulerSummary;
  raw: unknown;
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
  return {
    ok: typeof record.ok === 'boolean' ? record.ok : null,
    host: source.host,
    port: source.port,
    scheduler: {
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
    },
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

export function formatApiStatusCliSummary(summary: ApiStatusCliSummary): string {
  const scheduler = summary.scheduler;
  const backpressure = scheduler.backpressure;
  const operatorStatus = scheduler.operatorStatus;
  const lines = [
    `AuraCall API status: ${summary.ok === null ? 'unknown' : summary.ok ? 'ok' : 'not-ok'} (${summary.host}:${summary.port})`,
    `Account mirror scheduler: state=${scheduler.state ?? 'unknown'} enabled=${formatNullableBoolean(scheduler.enabled)} dryRun=${formatNullableBoolean(scheduler.dryRun)}`,
    `Account mirror posture: ${operatorStatus.posture}${operatorStatus.reason ? ` - ${operatorStatus.reason}` : ''}`,
    `Latest lazy mirror wake: ${scheduler.lastWakeReason ?? 'unknown'}${scheduler.lastWakeAt ? ` at ${scheduler.lastWakeAt}` : ''}`,
    `Latest lazy mirror backpressure: ${backpressure.reason}${backpressure.message ? ` - ${backpressure.message}` : ''}`,
  ];
  if (scheduler.lastAction) {
    lines.push(`Latest lazy mirror action: ${scheduler.lastAction}`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
