import { fetchWithLocalApiAuth } from './localApiClient.js';

export interface ApiMirrorCompletionCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  maxPasses?: number | null;
  sweepMode?: string | null;
  materializationPolicy?: string | null;
  materializationAssetKinds?: string[] | null;
  materializationMaxItems?: number | null;
  materializationRefreshSnapshot?: boolean | null;
  materializationForce?: boolean | null;
}

export interface ApiMirrorCompletionStatusCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  id: string;
}

export interface ApiMirrorCompletionListCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  status?: string | null;
  activeOnly?: boolean | null;
  limit?: number | null;
}

export interface ApiMirrorCompletionControlCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  id: string;
  action: 'pause' | 'resume' | 'cancel' | 'run_one_pass' | 'run-one-pass';
}

export interface ApiMirrorReconciliationCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  identity?: string | null;
  includeDisabled?: boolean | null;
  maxTargets?: number | null;
  maxActiveTargets?: number | null;
  materializationPolicy?: string | null;
  materializationAssetKinds?: string[] | null;
  materializationMaxItems?: number | null;
  dryRun?: boolean | null;
}

export interface ApiMirrorReconciliationStatusCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  id: string;
}

export interface ApiMirrorReconciliationListCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  status?: string | null;
  limit?: number | null;
}

export interface ApiMirrorReconciliationControlCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  id: string;
  action: string;
}

export async function startApiMirrorCompletionForCli(
  options: ApiMirrorCompletionCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/account-mirrors/completions`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: normalizeOptionalString(options.provider),
        runtimeProfile: normalizeOptionalString(options.runtimeProfile),
        maxPasses: normalizeOptionalNumber(options.maxPasses),
        sweepMode: normalizeOptionalString(options.sweepMode),
        materializationPolicy: normalizeOptionalString(options.materializationPolicy),
        materializationAssetKinds: normalizeStringList(options.materializationAssetKinds),
        materializationMaxItems: normalizeOptionalNumber(options.materializationMaxItems),
        materializationRefreshSnapshot: options.materializationRefreshSnapshot === true ? true : undefined,
        materializationForce: options.materializationForce === true ? true : undefined,
      }),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall API mirror completion start returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function readApiMirrorCompletionForCli(
  options: ApiMirrorCompletionStatusCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const id = normalizeId(options.id);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/account-mirrors/completions/${encodeURIComponent(id)}`), {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall API mirror completion status returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function listApiMirrorCompletionsForCli(
  options: ApiMirrorCompletionListCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const url = new URL(`http://${host}:${port}/v1/account-mirrors/completions`);
  appendOptionalSearchParam(url, 'provider', options.provider);
  appendOptionalSearchParam(url, 'runtimeProfile', options.runtimeProfile);
  appendOptionalSearchParam(url, 'status', options.status);
  if (options.activeOnly === true) {
    url.searchParams.set('activeOnly', 'true');
  }
  const limit = normalizeOptionalNumber(options.limit);
  if (typeof limit === 'number') {
    url.searchParams.set('limit', String(limit));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(url, {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall API mirror completion list returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function controlApiMirrorCompletionForCli(
  options: ApiMirrorCompletionControlCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const id = normalizeId(options.id);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/account-mirrors/completions/${encodeURIComponent(id)}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: normalizeAction(options.action) }),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall API mirror completion control returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function startApiMirrorReconciliationForCli(
  options: ApiMirrorReconciliationCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/account-mirrors/reconciliations`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: normalizeOptionalString(options.provider),
        runtimeProfile: normalizeOptionalString(options.runtimeProfile),
        identity: normalizeOptionalString(options.identity),
        includeDisabled: options.includeDisabled === true ? true : undefined,
        maxTargets: normalizeOptionalNumber(options.maxTargets),
        maxActiveTargets: normalizeOptionalNumber(options.maxActiveTargets),
        materializationPolicy: normalizeOptionalString(options.materializationPolicy),
        materializationAssetKinds: normalizeStringList(options.materializationAssetKinds),
        materializationMaxItems: normalizeOptionalNumber(options.materializationMaxItems),
        dryRun: options.dryRun !== false,
      }),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall API mirror reconciliation start returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function readApiMirrorReconciliationForCli(
  options: ApiMirrorReconciliationStatusCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const id = normalizeId(options.id);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/account-mirrors/reconciliations/${encodeURIComponent(id)}`), {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall API mirror reconciliation status returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function listApiMirrorReconciliationsForCli(
  options: ApiMirrorReconciliationListCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const url = new URL(`http://${host}:${port}/v1/account-mirrors/reconciliations`);
  appendOptionalSearchParam(url, 'status', options.status);
  const limit = normalizeOptionalNumber(options.limit);
  if (typeof limit === 'number') {
    url.searchParams.set('limit', String(limit));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(url, {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall API mirror reconciliation list returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function controlApiMirrorReconciliationForCli(
  options: ApiMirrorReconciliationControlCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const id = normalizeId(options.id);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/account-mirrors/reconciliations/${encodeURIComponent(id)}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: normalizeReconciliationAction(options.action) }),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall API mirror reconciliation control returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiMirrorCompletionCliSummary(operation: unknown): string {
  const record = isRecord(operation) ? operation : {};
  const lines = [
    `Account mirror completion: ${readString(record.id) ?? 'unknown'}`,
    `Status: ${readString(record.status) ?? 'unknown'}`,
    `Mode: ${readString(record.mode) ?? 'unknown'}`,
    `Sweep: ${readString(record.sweepMode) ?? 'steady_follow'}`,
    `Phase: ${readString(record.phase) ?? 'unknown'}`,
    `Target: ${readString(record.provider) ?? 'unknown'}/${readString(record.runtimeProfileId) ?? 'unknown'}`,
    `Passes: ${readNumber(record.passCount) ?? 0}/${readNumber(record.maxPasses) ?? 'unbounded'}`,
  ];
  const completeness = isRecord(record.mirrorCompleteness) ? record.mirrorCompleteness : null;
  if (completeness) {
    lines.push(`Completeness: ${readString(completeness.state) ?? 'unknown'}`);
  }
  const nextAttemptAt = readString(record.nextAttemptAt);
  if (nextAttemptAt) {
    lines.push(`Next attempt: ${nextAttemptAt}`);
  }
  const materializationPolicy = readString(record.materializationPolicy);
  if (materializationPolicy) {
    lines.push(`Materialization policy: ${materializationPolicy}`);
  }
  const materializationCursor = isRecord(record.materializationCursor) ? record.materializationCursor : null;
  if (materializationCursor) {
    lines.push(`Materialization job: ${readString(materializationCursor.jobId) ?? 'unknown'} status=${readString(materializationCursor.jobStatus) ?? 'unknown'}`);
  }
  const materializationOutcome = isRecord(record.materializationOutcome) ? record.materializationOutcome : null;
  if (materializationOutcome) {
    lines.push(
      `Materialization outcome: conversations=${readNumber(materializationOutcome.conversationsAttempted) ?? 0} materialized=${readNumber(materializationOutcome.materialized) ?? 0} skipped=${readNumber(materializationOutcome.skipped) ?? 0} failed=${readNumber(materializationOutcome.failed) ?? 0} checksums=${readNumber(materializationOutcome.checksumCount) ?? 0}`,
    );
    const manifestPaths = Array.isArray(materializationOutcome.manifestPaths)
      ? materializationOutcome.manifestPaths.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      : [];
    if (manifestPaths.length > 0) {
      lines.push(`Materialization manifests: ${manifestPaths.join(', ')}`);
    }
  }
  const error = isRecord(record.error) ? record.error : null;
  if (error) {
    lines.push(`Error: ${readString(error.code) ?? 'unknown'} ${readString(error.message) ?? ''}`.trim());
  }
  const lifecycleEvent = latestLifecycleEvent(record.lifecycleEvents);
  if (lifecycleEvent) {
    lines.push(`Latest lifecycle: ${readString(lifecycleEvent.type) ?? 'unknown'} at ${readString(lifecycleEvent.at) ?? 'unknown'} - ${readString(lifecycleEvent.message) ?? ''}`.trim());
  }
  return lines.join('\n');
}

export function formatApiMirrorCompletionListCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const data = Array.isArray(record.data) ? record.data : [];
  if (data.length === 0) {
    return 'Account mirror completions: none';
  }
  const lines = [`Account mirror completions: ${data.length}`];
  for (const item of data) {
    const operation = isRecord(item) ? item : {};
    const id = readString(operation.id) ?? 'unknown';
    const status = readString(operation.status) ?? 'unknown';
    const mode = readString(operation.mode) ?? 'unknown';
    const sweepMode = readString(operation.sweepMode) ?? 'steady_follow';
    const phase = readString(operation.phase) ?? 'unknown';
    const provider = readString(operation.provider) ?? 'unknown';
    const runtimeProfileId = readString(operation.runtimeProfileId) ?? 'unknown';
    const passCount = readNumber(operation.passCount) ?? 0;
    const maxPasses = readNumber(operation.maxPasses) ?? 'unbounded';
    const nextAttemptAt = readString(operation.nextAttemptAt);
    const lifecycleEvent = latestLifecycleEvent(operation.lifecycleEvents);
    const lifecycle = lifecycleEvent ? ` lifecycle=${readString(lifecycleEvent.type) ?? 'unknown'}` : '';
    const materializationOutcome = isRecord(operation.materializationOutcome) ? operation.materializationOutcome : null;
    const materialization = materializationOutcome
      ? ` materialized=${readNumber(materializationOutcome.materialized) ?? 0} checksums=${readNumber(materializationOutcome.checksumCount) ?? 0}`
      : '';
    lines.push(`- ${id}: ${status} ${mode}/${sweepMode}/${phase} ${provider}/${runtimeProfileId} passes=${passCount}/${maxPasses}${nextAttemptAt ? ` next=${nextAttemptAt}` : ''}${materialization}${lifecycle}`);
  }
  return lines.join('\n');
}

export function formatApiMirrorReconciliationCliSummary(campaign: unknown): string {
  const record = isRecord(campaign) ? campaign : {};
  const metrics = isRecord(record.metrics) ? record.metrics : {};
  const lines = [
    `Account mirror reconciliation: ${readString(record.id) ?? 'unknown'}`,
    `Status: ${readString(record.status) ?? 'unknown'}`,
    `Dry run: ${record.dryRun === true ? 'yes' : 'no'}`,
    `Targets: ${readNumber(metrics.totalTargets) ?? 0} total, ${readNumber(metrics.selectedTargets) ?? 0} selected`,
  ];
  const materialization = isRecord(metrics.materialization) ? metrics.materialization : null;
  if (materialization) {
    lines.push(
      `Materialization: jobs=${readNumber(materialization.jobs) ?? 0} active=${readNumber(materialization.activeJobs) ?? 0} materialized=${readNumber(materialization.materialized) ?? 0} checksums=${readNumber(materialization.checksummedAssets) ?? 0} unavailable=${readNumber(materialization.terminalUnavailableConversations) ?? 0}`,
    );
  }
  const targets = Array.isArray(record.targets) ? record.targets : [];
  const deferredTargets = targets.filter((item) => {
    const target = isRecord(item) ? item : {};
    const execution = isRecord(target.execution) ? target.execution : {};
    return readString(execution.status) === 'deferred';
  }).length;
  const status = readString(record.status) ?? 'unknown';
  if (record.dryRun === true) {
    lines.push('Action: rerun with --no-dry-run to start selected eligible targets.');
  } else if (status === 'paused') {
    lines.push('Action: resume or cancel the campaign.');
  } else if (deferredTargets > 0) {
    lines.push('Action: run-next-pass will start deferred targets when provider/browser capacity is free.');
  }
  for (const item of targets.slice(0, 12)) {
    const target = isRecord(item) ? item : {};
    const provider = readString(target.provider) ?? 'unknown';
    const runtimeProfileId = readString(target.runtimeProfileId) ?? 'unknown';
    const state = readString(target.state) ?? 'unknown';
    const selected = target.selected === true ? 'selected' : 'skip';
    const identity = readString(target.expectedIdentityKey);
    const tenantKey = readString(target.tenantKey);
    const bindingKey = readString(target.bindingKey);
    const activeCompletionId = readString(target.activeCompletionId);
    const execution = isRecord(target.execution) ? target.execution : {};
    const childOperations = isRecord(target.childOperations) ? target.childOperations : {};
    const executionStatus = readString(execution.status);
    const completionId = readString(childOperations.completionId) ?? activeCompletionId;
    const materializationJobId = readString(childOperations.materializationJobId);
    const materializationMetrics = isRecord(execution.materializationMetrics) ? execution.materializationMetrics : null;
    const assets = Array.isArray(execution.materializedAssets) ? execution.materializedAssets : [];
    const assetSummary = materializationMetrics || assets.length > 0
      ? ` assets=${readNumber(materializationMetrics?.materialized) ?? assets.length}/${readNumber(materializationMetrics?.checksummedAssets) ?? assets.filter((asset) => isRecord(asset) && readString(asset.checksumSha256)).length}`
      : '';
    lines.push(`- ${provider}/${runtimeProfileId}${identity ? ` identity=${identity}` : ''}${tenantKey ? ` tenant=${tenantKey}` : ''}${bindingKey ? ` binding=${bindingKey}` : ''}: ${state} ${selected}${executionStatus ? ` exec=${executionStatus}` : ''}${completionId ? ` child=${completionId}` : ''}${materializationJobId ? ` materialization=${materializationJobId}` : ''}${assetSummary}`);
  }
  if (targets.length > 12) {
    lines.push(`... ${targets.length - 12} more target(s)`);
  }
  return lines.join('\n');
}

export function formatApiMirrorReconciliationListCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const data = Array.isArray(record.data) ? record.data : [];
  if (data.length === 0) {
    return 'Account mirror reconciliations: none';
  }
  const lines = [`Account mirror reconciliations: ${data.length}`];
  for (const item of data) {
    const campaign = isRecord(item) ? item : {};
    const metrics = isRecord(campaign.metrics) ? campaign.metrics : {};
    lines.push(`- ${readString(campaign.id) ?? 'unknown'}: ${readString(campaign.status) ?? 'unknown'} targets=${readNumber(metrics.totalTargets) ?? 0} selected=${readNumber(metrics.selectedTargets) ?? 0}`);
  }
  return lines.join('\n');
}

function latestLifecycleEvent(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const latest = value.at(-1);
  return isRecord(latest) ? latest : null;
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

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function appendOptionalSearchParam(url: URL, name: string, value: string | null | undefined): void {
  const normalized = normalizeOptionalString(value);
  if (normalized) {
    url.searchParams.set(name, normalized);
  }
}

function normalizeOptionalNumber(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.trunc(value);
}

function normalizeStringList(value: string[] | null | undefined): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function normalizeId(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error('Use a completion id.');
  return trimmed;
}

function normalizeAction(value: string): ApiMirrorCompletionControlCliOptions['action'] {
  if (value === 'run-one-pass') return 'run_one_pass';
  if (value === 'run_one_pass') return value;
  if (value === 'pause' || value === 'resume' || value === 'cancel') return value;
  throw new Error('Use a completion control action: pause, resume, cancel, or run-one-pass.');
}

function normalizeReconciliationAction(value: string): 'pause' | 'resume' | 'cancel' | 'run_next_pass' {
  if (value === 'run-next-pass') return 'run_next_pass';
  if (value === 'pause' || value === 'resume' || value === 'cancel' || value === 'run_next_pass') return value;
  throw new Error('Use a reconciliation control action: pause, resume, cancel, or run-next-pass.');
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
