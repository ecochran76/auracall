import { fetchWithLocalApiAuth } from './localApiClient.js';

export interface ApiHistoryMaterializationCreateCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  browserProfile?: string | null;
  boundIdentityKey?: string | null;
  conversationId?: string | null;
  conversationIds?: string[] | null;
  providerConversationUrl?: string | null;
  projectId?: string | null;
  catalogItemId?: string | null;
  catalogKind?: string | null;
  archiveItemId?: string | null;
  reconcile?: boolean | null;
  assetSource?: string | null;
  refreshSnapshot?: boolean | null;
  assetKinds?: string[] | null;
  maxItems?: number | null;
  providerWorkTimeoutMs?: number | null;
  force?: boolean | null;
}

export interface ApiHistoryMaterializationStatusCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  id: string;
}

export interface ApiHistoryMaterializationListCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  status?: string | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  sourceType?: string | null;
  limit?: number | null;
}

export async function createApiHistoryMaterializationJobForCli(
  options: ApiHistoryMaterializationCreateCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/account-mirrors/materializations`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: normalizeOptionalString(options.provider),
        runtimeProfile: normalizeOptionalString(options.runtimeProfile),
        browserProfile: normalizeOptionalString(options.browserProfile),
        boundIdentityKey: normalizeOptionalString(options.boundIdentityKey),
        conversationId: normalizeOptionalString(options.conversationId),
        conversationIds: normalizeStringList(options.conversationIds),
        providerConversationUrl: normalizeOptionalString(options.providerConversationUrl),
        projectId: normalizeOptionalString(options.projectId),
        catalogItemId: normalizeOptionalString(options.catalogItemId),
        catalogKind: normalizeOptionalString(options.catalogKind),
        archiveItemId: normalizeOptionalString(options.archiveItemId),
        reconcile: options.reconcile === true,
        assetSource: normalizeAssetSource(options.assetSource),
        refreshSnapshot: options.refreshSnapshot === true,
        assetKinds: normalizeAssetKinds(options.assetKinds),
        maxItems: normalizeOptionalNumber(options.maxItems),
        providerWorkTimeoutMs: normalizeOptionalNumber(options.providerWorkTimeoutMs),
        force: options.force === true,
      }),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall history materialization create returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function readApiHistoryMaterializationJobForCli(
  options: ApiHistoryMaterializationStatusCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const id = normalizeRequiredString(options.id, 'history materialization job id');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/account-mirrors/materializations/${encodeURIComponent(id)}`), {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall history materialization job returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function cancelApiHistoryMaterializationJobForCli(
  options: ApiHistoryMaterializationStatusCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const id = normalizeRequiredString(options.id, 'history materialization job id');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/account-mirrors/materializations/${encodeURIComponent(id)}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall history materialization cancel returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function listApiHistoryMaterializationJobsForCli(
  options: ApiHistoryMaterializationListCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const url = new URL(`http://${host}:${port}/v1/account-mirrors/materializations`);
  appendOptionalSearchParam(url, 'status', options.status);
  appendOptionalSearchParam(url, 'provider', options.provider);
  appendOptionalSearchParam(url, 'runtimeProfile', options.runtimeProfile);
  appendOptionalSearchParam(url, 'sourceType', options.sourceType);
  const limit = normalizeOptionalNumber(options.limit);
  if (typeof limit === 'number') url.searchParams.set('limit', String(limit));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(url, {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall history materialization jobs returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiHistoryMaterializationJobCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const job = isRecord(record.job) ? record.job : record;
  const result = isRecord(job.result) ? job.result : {};
  const metrics = isRecord(result.metrics) ? result.metrics : {};
  const target = isRecord(result.target) ? result.target : {};
  const error = isRecord(job.error) ? job.error : {};
  const lines = [
    `History materialization job: ${readString(job.id) ?? 'unknown'}`,
    `Status: ${readString(job.status) ?? 'unknown'}`,
    `Source: ${formatSource(job.source)}`,
  ];
  if (typeof record.reused === 'boolean') {
    lines.push(`Reused active job: ${record.reused ? 'yes' : 'no'}`);
  }
  const reuseReason = readString(record.reuseReason);
  if (reuseReason) lines.push(`Reuse reason: ${reuseReason}`);
  const schedulerLine = formatSchedulerDiagnostics(job.scheduler);
  if (schedulerLine) lines.push(schedulerLine);
  const targetText = [
    readString(target.provider),
    readString(target.runtimeProfile),
    readString(target.conversationId),
  ].filter(Boolean).join('/');
  if (targetText) lines.push(`Target: ${targetText}`);
  const message = readString(job.message) ?? readString(result.message);
  if (message) lines.push(`Message: ${message}`);
  if (readNumber(metrics.materialized) !== null) {
    lines.push(`Materialized: ${readNumber(metrics.materialized) ?? 0}`);
    lines.push(`Skipped: ${readNumber(metrics.skipped) ?? 0}`);
    lines.push(`Failed: ${readNumber(metrics.failed) ?? 0}`);
  }
  const errorMessage = readString(error.message);
  if (errorMessage) lines.push(`Error: ${errorMessage}`);
  return lines.join('\n');
}

export function formatApiHistoryMaterializationJobsCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const jobs = Array.isArray(record.jobs) ? record.jobs : [];
  const metrics = isRecord(record.metrics) ? record.metrics : {};
  const lines = [
    `History materialization jobs: ${readNumber(metrics.total) ?? jobs.length} job${(readNumber(metrics.total) ?? jobs.length) === 1 ? '' : 's'}`,
    `Active: ${readNumber(metrics.active) ?? 0}`,
    `Terminal: ${readNumber(metrics.terminal) ?? 0}`,
  ];
  for (const job of jobs.slice(0, 25)) {
    if (!isRecord(job)) continue;
    const scheduler = isRecord(job.scheduler) ? job.scheduler : {};
    const schedulerState = readString(scheduler.state);
    const dispatchState = readString(scheduler.dispatchState);
    const schedulerSuffix = schedulerState
      ? ` scheduler=${schedulerState}${dispatchState ? `/${dispatchState}` : ''}`
      : '';
    lines.push(
      `- ${readString(job.id) ?? 'unknown'} status=${readString(job.status) ?? 'unknown'} source=${formatSource(job.source)} updated=${readString(job.updatedAt) ?? 'unknown'}${schedulerSuffix}`,
    );
  }
  return lines.join('\n');
}

function formatSchedulerDiagnostics(value: unknown): string | null {
  const scheduler = isRecord(value) ? value : {};
  const state = readString(scheduler.state);
  const dispatchState = readString(scheduler.dispatchState);
  if (!state && !dispatchState) return null;
  const parts = [
    `state=${state ?? 'unknown'}`,
    `dispatch=${dispatchState ?? 'unknown'}`,
  ];
  const queuedAgeMs = readNumber(scheduler.queuedAgeMs);
  const runAgeMs = readNumber(scheduler.runAgeMs);
  const queuedToStartLatencyMs = readNumber(scheduler.queuedToStartLatencyMs);
  if (queuedAgeMs !== null) parts.push(`queuedAgeMs=${queuedAgeMs}`);
  if (runAgeMs !== null) parts.push(`runAgeMs=${runAgeMs}`);
  if (queuedToStartLatencyMs !== null) parts.push(`queuedToStartLatencyMs=${queuedToStartLatencyMs}`);
  if (scheduler.stale === true) parts.push('stale=yes');
  const staleReason = readString(scheduler.staleReason);
  if (staleReason) parts.push(`staleReason=${staleReason}`);
  return `Scheduler: ${parts.join(' ')}`;
}

function formatSource(value: unknown): string {
  const source = isRecord(value) ? value : {};
  const type = readString(source.type) ?? 'unknown';
  if (type === 'conversation') return `${type}:${readString(source.provider) ?? 'unknown'}/${readString(source.conversationId) ?? 'unknown'}`;
  if (type === 'catalog_item') return `${type}:${readString(source.catalogItemId) ?? 'unknown'}`;
  if (type === 'archive_item') return `${type}:${readString(source.archiveItemId) ?? 'unknown'}`;
  if (type === 'reconciliation') return `${type}:${readString(source.provider) ?? 'all'}`;
  if (type === 'account_library_reconciliation') return `${type}:${readString(source.provider) ?? 'all'}`;
  return type;
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
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 5000;
  return Math.max(100, Math.min(120_000, Math.trunc(value)));
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalNumber(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.trunc(value));
}

function normalizeAssetKinds(value: string[] | null | undefined): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry === 'artifacts' || entry === 'files' || entry === 'media' || entry === 'all');
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function normalizeAssetSource(value: string | null | undefined): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized === 'account-library' ? normalized : undefined;
}

function normalizeStringList(value: string[] | null | undefined): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function normalizeRequiredString(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Use a ${label}.`);
  return normalized;
}

function appendOptionalSearchParam(url: URL, name: string, value: string | null | undefined): void {
  const normalized = normalizeOptionalString(value);
  if (normalized) url.searchParams.set(name, normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
