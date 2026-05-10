import type {
  LazyLiveFollowPreflightRun,
  LazyLiveFollowPreflightRunStep,
} from '../preflightStatus.js';

export interface ApiPreflightRunCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  id: string;
}

export interface ApiPreflightRunCliSummary {
  host: string;
  port: number;
  run: LazyLiveFollowPreflightRun;
}

export async function readApiPreflightRunForCli(
  options: ApiPreflightRunCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiPreflightRunCliSummary> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const id = normalizeRunId(options.id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(`http://${host}:${port}/v1/preflight/lazy-live-follow/runs/${encodeURIComponent(id)}`);
    const response = await fetchImpl(url, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`AuraCall preflight run ${id} returned HTTP ${response.status}.`);
    }
    return {
      host,
      port,
      run: normalizePreflightRun(await response.json()),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiPreflightRunCliSummary(summary: ApiPreflightRunCliSummary): string {
  const run = summary.run;
  const activeStep = run.steps.find((step) => step.status === 'running');
  const latestStep = run.steps.at(-1);
  const step = activeStep ?? latestStep ?? null;
  return [
    `AuraCall preflight run ${run.id} (${summary.host}:${summary.port})`,
    `Status: ${run.status} durationMs=${run.durationMs ?? 'pending'} exitCode=${run.exitCode ?? 'pending'}`,
    `Log: ${run.logPath}`,
    `Steps: ${run.steps.length}${step ? ` latest="${step.label}" status=${step.status}` : ''}`,
  ].join('\n');
}

function normalizePreflightRun(raw: unknown): LazyLiveFollowPreflightRun {
  const record = isRecord(raw) ? raw : {};
  return {
    object: 'auracall_preflight_run',
    id: readString(record.id) ?? 'unknown',
    name: 'lazy-live-follow',
    status: readEnum(record.status, ['queued', 'running', 'passed', 'failed']) ?? 'failed',
    command: readString(record.command) ?? 'unknown',
    args: Array.isArray(record.args) ? record.args.filter((entry): entry is string => typeof entry === 'string') : [],
    cwd: readString(record.cwd) ?? 'unknown',
    logPath: readString(record.logPath) ?? 'unknown',
    startedAt: readString(record.startedAt) ?? 'unknown',
    completedAt: readString(record.completedAt),
    durationMs: readNumber(record.durationMs),
    exitCode: readNumber(record.exitCode),
    signal: readString(record.signal),
    errorMessage: readString(record.errorMessage),
    steps: Array.isArray(record.steps)
      ? record.steps.map(normalizePreflightRunStep).filter((step): step is LazyLiveFollowPreflightRunStep => Boolean(step))
      : [],
  };
}

function normalizePreflightRunStep(raw: unknown): LazyLiveFollowPreflightRunStep | null {
  const record = isRecord(raw) ? raw : {};
  const label = readString(record.label);
  const status = readEnum(record.status, ['running', 'passed', 'failed']);
  const startedAt = readString(record.startedAt);
  if (!label || !status || !startedAt) return null;
  return {
    label,
    status,
    command: readString(record.command),
    startedAt,
    completedAt: readString(record.completedAt),
    durationMs: readNumber(record.durationMs),
    errorMessage: readString(record.errorMessage),
  };
}

function normalizeHost(value: string | null | undefined): string {
  const trimmed = String(value ?? '127.0.0.1').trim();
  return trimmed.length > 0 ? trimmed : '127.0.0.1';
}

function normalizePort(value: number | null | undefined): number {
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

function normalizeRunId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Use --id <run_id> to select a preflight run.');
  return trimmed;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readEnum<const T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
