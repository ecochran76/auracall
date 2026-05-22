import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import { readEnvFile, toApiAuthEnvSuffix } from '../config/apiKeyIssuer.js';

export interface ApiRunArchiveCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  kind?: string | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  projectId?: string | null;
  agent?: string | null;
  team?: string | null;
  responseId?: string | null;
  batchId?: string | null;
  status?: string | null;
  fileAvailable?: boolean | null;
  assetAvailability?: string | null;
  query?: string | null;
  limit?: number | null;
}

export interface ApiRunArchiveItemCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  id: string;
}

export interface ApiRunArchiveItemMaterializeCliOptions extends ApiRunArchiveItemCliOptions {}

export interface ApiRunArchiveMaterializationJobCliOptions extends ApiRunArchiveItemCliOptions {}

export interface ApiRunArchiveMaterializationJobStatusCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  id: string;
}

export interface ApiRunArchiveMaterializationJobCancelCliOptions extends ApiRunArchiveMaterializationJobStatusCliOptions {}

export interface ApiRunArchiveMaterializationJobListCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  status?: string | null;
  archiveItemId?: string | null;
  limit?: number | null;
}

export interface ApiRunArchiveAssetLookupCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  checksumSha256?: string | null;
  cacheKey?: string | null;
  providerArtifactId?: string | null;
  artifactId?: string | null;
  limit?: number | null;
}

export interface ApiRunArchiveEvidenceCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  payload: unknown;
}

export async function readApiRunArchiveForCli(
  options: ApiRunArchiveCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const url = new URL(`http://${host}:${port}/v1/archive`);
  appendOptionalSearchParam(url, 'kind', options.kind);
  appendOptionalSearchParam(url, 'provider', options.provider);
  appendOptionalSearchParam(url, 'runtimeProfile', options.runtimeProfile);
  appendOptionalSearchParam(url, 'projectId', options.projectId);
  appendOptionalSearchParam(url, 'agent', options.agent);
  appendOptionalSearchParam(url, 'team', options.team);
  appendOptionalSearchParam(url, 'responseId', options.responseId);
  appendOptionalSearchParam(url, 'batchId', options.batchId);
  appendOptionalSearchParam(url, 'status', options.status);
  appendOptionalBooleanSearchParam(url, 'fileAvailable', options.fileAvailable);
  appendOptionalSearchParam(url, 'assetAvailability', options.assetAvailability);
  appendOptionalSearchParam(url, 'q', options.query);
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    url.searchParams.set('limit', String(Math.max(0, Math.trunc(options.limit))));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(url, {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall run archive returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function readApiRunArchiveItemForCli(
  options: ApiRunArchiveItemCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const id = normalizeRequiredString(options.id, 'archive item id');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/archive/items/${encodeURIComponent(id)}`), {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall run archive item returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function materializeApiRunArchiveItemForCli(
  options: ApiRunArchiveItemMaterializeCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const id = normalizeRequiredString(options.id, 'archive item id');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/archive/items/${encodeURIComponent(id)}/materialize`), {
      method: 'POST',
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall run archive item materialization returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function createApiRunArchiveMaterializationJobForCli(
  options: ApiRunArchiveMaterializationJobCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const id = normalizeRequiredString(options.id, 'archive item id');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/archive/materializations`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ archiveItemId: id }),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall run archive materialization job create returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function readApiRunArchiveMaterializationJobForCli(
  options: ApiRunArchiveMaterializationJobStatusCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const id = normalizeRequiredString(options.id, 'archive materialization job id');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/archive/materializations/${encodeURIComponent(id)}`), {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall run archive materialization job returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function cancelApiRunArchiveMaterializationJobForCli(
  options: ApiRunArchiveMaterializationJobCancelCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const id = normalizeRequiredString(options.id, 'archive materialization job id');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/archive/materializations/${encodeURIComponent(id)}`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'cancel' }),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall run archive materialization job cancel returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function listApiRunArchiveMaterializationJobsForCli(
  options: ApiRunArchiveMaterializationJobListCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const url = new URL(`http://${host}:${port}/v1/archive/materializations`);
  appendOptionalSearchParam(url, 'status', options.status);
  appendOptionalSearchParam(url, 'archiveItemId', options.archiveItemId);
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    url.searchParams.set('limit', String(Math.max(0, Math.trunc(options.limit))));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(url, {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall run archive materialization jobs returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupApiRunArchiveAssetForCli(
  options: ApiRunArchiveAssetLookupCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const url = new URL(`http://${host}:${port}/v1/archive/assets/lookup`);
  appendOptionalSearchParam(url, 'checksumSha256', options.checksumSha256);
  appendOptionalSearchParam(url, 'cacheKey', options.cacheKey);
  appendOptionalSearchParam(url, 'providerArtifactId', options.providerArtifactId);
  appendOptionalSearchParam(url, 'artifactId', options.artifactId);
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    url.searchParams.set('limit', String(Math.max(0, Math.trunc(options.limit))));
  }
  if ([...url.searchParams.keys()].length === 0) {
    throw new Error('Use at least one of --checksum-sha256, --cache-key, --provider-artifact-id, or --artifact-id.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(url, {
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall run archive asset lookup returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function backfillApiRunArchiveForCli(
  options: Pick<ApiRunArchiveCliOptions, 'host' | 'port' | 'timeoutMs'> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/archive/backfill`), {
      method: 'POST',
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall run archive backfill returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function attachApiRunArchiveEvidenceForCli(
  options: ApiRunArchiveEvidenceCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(new URL(`http://${host}:${port}/v1/archive/evidence`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(options.payload),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall run archive evidence attach returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiRunArchiveCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const items = Array.isArray(record.items) ? record.items : [];
  const metrics = isRecord(record.metrics) ? record.metrics : {};
  const lines = [
    `Run archive: ${readNumber(metrics.total) ?? items.length} item${(readNumber(metrics.total) ?? items.length) === 1 ? '' : 's'}`,
    `Kind: ${readString(record.kind) ?? 'all'}`,
  ];
  for (const item of items.slice(0, 25)) {
    if (!isRecord(item)) continue;
    lines.push(
      `- ${readString(item.kind) ?? 'unknown'} ${readString(item.id) ?? 'unknown'} ${formatArchiveStatusInline(item)} provider=${readString(item.provider) ?? 'n/a'} project=${readString(item.projectId) ?? 'n/a'} response=${readString(item.responseId) ?? 'n/a'} batch=${readString(item.batchId) ?? 'n/a'} title=${readString(item.title) ?? ''}`.trim(),
    );
  }
  return lines.join('\n');
}

export function formatApiRunArchiveItemCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const item = isRecord(record.item) ? record.item : {};
  const lines = [
    `Run archive item: ${readString(item.id) ?? 'unknown'}`,
    `Kind: ${readString(item.kind) ?? 'unknown'}`,
    `Status: ${formatArchiveStatusDisplay(item)}`,
    `Provider: ${readString(item.provider) ?? 'n/a'}`,
    `Project: ${readString(item.projectId) ?? 'n/a'}`,
    `Response: ${readString(item.responseId) ?? 'n/a'}`,
    `Batch: ${readString(item.batchId) ?? 'n/a'}`,
  ];
  const localPath = readString(item.localPath);
  if (localPath) lines.push(`Local path: ${localPath}`);
  const uri = readString(item.uri);
  if (uri) lines.push(`URI: ${uri}`);
  const conversationId = readString(item.providerConversationId);
  if (conversationId) lines.push(`Provider conversation: ${conversationId}`);
  return lines.join('\n');
}

export function formatApiRunArchiveItemMaterializeCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const item = isRecord(record.item) ? record.item : {};
  const file = isRecord(record.file) ? record.file : {};
  const lines = [
    `Run archive item materialization: ${readString(record.status) ?? 'unknown'}`,
    `Item: ${readString(item.id) ?? 'unknown'}`,
  ];
  const message = readString(record.message);
  if (message) lines.push(`Message: ${message}`);
  const localPath = readString(file.localPath) ?? readString(item.localPath);
  if (localPath) lines.push(`Local path: ${localPath}`);
  const fileName = readString(file.name) ?? readString(item.fileName);
  if (fileName) lines.push(`File: ${fileName}`);
  const links = isRecord(item.links) ? item.links : {};
  const asset = readString(links.asset);
  if (asset) lines.push(`Asset: ${asset}`);
  return lines.join('\n');
}

export function formatApiRunArchiveMaterializationJobCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const job = isRecord(record.job) ? record.job : record;
  const result = isRecord(job.result) ? job.result : {};
  const resultItem = isRecord(result.item) ? result.item : {};
  const resultFile = isRecord(result.file) ? result.file : {};
  const error = isRecord(job.error) ? job.error : {};
  const lines = [
    `Run archive materialization job: ${readString(job.id) ?? 'unknown'}`,
    `Status: ${readString(job.status) ?? 'unknown'}`,
    `Archive item: ${readString(job.archiveItemId) ?? readString(resultItem.id) ?? 'unknown'}`,
  ];
  if (typeof record.reused === 'boolean') {
    lines.push(`Reused active job: ${record.reused ? 'yes' : 'no'}`);
  }
  const message = readString(job.message) ?? readString(result.message);
  if (message) lines.push(`Message: ${message}`);
  const localPath = readString(resultFile.localPath) ?? readString(resultItem.localPath);
  if (localPath) lines.push(`Local path: ${localPath}`);
  const errorMessage = readString(error.message);
  if (errorMessage) lines.push(`Error: ${errorMessage}`);
  return lines.join('\n');
}

export function formatApiRunArchiveMaterializationJobsCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const jobs = Array.isArray(record.jobs) ? record.jobs : [];
  const metrics = isRecord(record.metrics) ? record.metrics : {};
  const lines = [
    `Run archive materialization jobs: ${readNumber(metrics.total) ?? jobs.length} job${(readNumber(metrics.total) ?? jobs.length) === 1 ? '' : 's'}`,
    `Active: ${readNumber(metrics.active) ?? 0}`,
    `Terminal: ${readNumber(metrics.terminal) ?? 0}`,
  ];
  for (const job of jobs.slice(0, 25)) {
    if (!isRecord(job)) continue;
    lines.push(
      `- ${readString(job.id) ?? 'unknown'} status=${readString(job.status) ?? 'unknown'} item=${readString(job.archiveItemId) ?? 'unknown'} updated=${readString(job.updatedAt) ?? 'unknown'}`,
    );
  }
  return lines.join('\n');
}

function formatArchiveStatusInline(item: Record<string, unknown>): string {
  const display = formatArchiveStatusDisplay(item);
  const runtimeState = readString(item.runtimeState);
  if (runtimeState && runtimeState !== 'terminal') {
    return `status=${display}`;
  }
  return `status=${readString(item.status) ?? 'n/a'}`;
}

function formatArchiveStatusDisplay(item: Record<string, unknown>): string {
  const status = readString(item.status);
  const runtimeState = readString(item.runtimeState);
  if (!runtimeState || runtimeState === 'terminal' || runtimeState === status) {
    return status ?? 'n/a';
  }
  return `${runtimeState} (raw: ${status ?? 'n/a'})`;
}

export function formatApiRunArchiveAssetLookupCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const metrics = isRecord(record.metrics) ? record.metrics : {};
  const canonical = isRecord(record.canonicalItem) ? record.canonicalItem : null;
  const items = Array.isArray(record.items) ? record.items : [];
  const lines = [
    `Run archive asset lookup: ${readNumber(metrics.total) ?? items.length} item${(readNumber(metrics.total) ?? items.length) === 1 ? '' : 's'}`,
    `Available files: ${readNumber(metrics.fileAvailable) ?? 0}`,
  ];
  if (canonical) {
    lines.push(`Canonical: ${readString(canonical.id) ?? 'unknown'}`);
    const localPath = readString(canonical.localPath);
    if (localPath) lines.push(`Local path: ${localPath}`);
    const checksum = readString(canonical.checksumSha256);
    if (checksum) lines.push(`SHA-256: ${checksum}`);
  }
  for (const item of items.slice(0, 10)) {
    if (!isRecord(item)) continue;
    lines.push(
      `- ${readString(item.id) ?? 'unknown'} kind=${readString(item.kind) ?? 'unknown'} available=${String(item.fileAvailable ?? 'n/a')} cache=${readString(item.cacheKey) ?? 'n/a'}`,
    );
  }
  return lines.join('\n');
}

export function formatApiRunArchiveBackfillCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const index = isRecord(record.index) ? record.index : {};
  return [
    `Run archive index backfilled: ${readNumber(index.itemCount) ?? 0} item${(readNumber(index.itemCount) ?? 0) === 1 ? '' : 's'}`,
    `Updated: ${readString(index.updatedAt) ?? 'unknown'}`,
  ].join('\n');
}

export function formatApiRunArchiveEvidenceCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const evidence = isRecord(record.evidence) ? record.evidence : {};
  const item = isRecord(record.item) ? record.item : {};
  return [
    `Run archive evidence attached: ${readString(item.id) ?? 'unknown'}`,
    `Evidence: ${readString(evidence.id) ?? 'unknown'}`,
    `Schema: ${readString(evidence.schema) ?? 'unknown'}`,
    `Status: ${readString(evidence.status) ?? 'unknown'}`,
  ].join('\n');
}

function appendOptionalSearchParam(url: URL, key: string, value: string | null | undefined): void {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized) url.searchParams.set(key, normalized);
}

function appendOptionalBooleanSearchParam(url: URL, key: string, value: boolean | null | undefined): void {
  if (typeof value === 'boolean') url.searchParams.set(key, String(value));
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

function normalizeRequiredString(value: string, label: string): string {
  const trimmed = String(value).trim();
  if (!trimmed) throw new Error(`Missing ${label}.`);
  return trimmed;
}

async function fetchWithLocalApiAuth(
  url: URL,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const response = await fetchImpl(url, init);
  if (response.status !== 401) return response;
  const apiKey = await resolveLocalApiKey();
  if (!apiKey) return response;
  const headers = new Headers(init.headers);
  if (!headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiKey}`);
  }
  return fetchImpl(url, {
    ...init,
    headers,
  });
}

async function resolveLocalApiKey(): Promise<string | null> {
  const envKey = readString(process.env.AURACALL_API_KEY);
  if (envKey) return envKey;
  const envPath = path.join(getAuracallHomeDir(), 'api.env');
  const state = await readEnvFile(envPath);
  const primary = readString(state.values.AURACALL_API_KEY);
  if (primary) return primary;
  const keyIds = (state.values.AURACALL_API_KEY_IDS ?? '')
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  for (const keyId of keyIds) {
    const secret = readString(state.values[`AURACALL_API_KEY_${toApiAuthEnvSuffix(keyId)}`]);
    if (secret) return secret;
  }
  return null;
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
