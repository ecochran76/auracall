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
  query?: string | null;
  limit?: number | null;
}

export interface ApiRunArchiveItemCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  id: string;
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
  appendOptionalSearchParam(url, 'q', options.query);
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    url.searchParams.set('limit', String(Math.max(0, Math.trunc(options.limit))));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
    });
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
    const response = await fetchImpl(new URL(`http://${host}:${port}/v1/archive/items/${encodeURIComponent(id)}`), {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`AuraCall run archive item returned HTTP ${response.status}.`);
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
    const response = await fetchImpl(new URL(`http://${host}:${port}/v1/archive/backfill`), {
      method: 'POST',
      signal: controller.signal,
    });
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
    const response = await fetchImpl(new URL(`http://${host}:${port}/v1/archive/evidence`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(options.payload),
      signal: controller.signal,
    });
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
      `- ${readString(item.kind) ?? 'unknown'} ${readString(item.id) ?? 'unknown'} status=${readString(item.status) ?? 'n/a'} provider=${readString(item.provider) ?? 'n/a'} project=${readString(item.projectId) ?? 'n/a'} response=${readString(item.responseId) ?? 'n/a'} batch=${readString(item.batchId) ?? 'n/a'} title=${readString(item.title) ?? ''}`.trim(),
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
    `Status: ${readString(item.status) ?? 'n/a'}`,
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
