import { fetchWithLocalApiAuth } from './localApiClient.js';

export interface ApiSearchCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  query?: string | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  tenant?: string | null;
  kind?: string | null;
  status?: string | null;
  fileAvailable?: boolean | null;
  assetAvailability?: string | null;
  materialization?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export async function readApiSearchProjectionForCli(
  options: ApiSearchCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const url = new URL(`http://${host}:${port}/v1/search`);
  appendOptionalSearchParam(url, 'q', options.query);
  appendOptionalSearchParam(url, 'provider', options.provider);
  appendOptionalSearchParam(url, 'runtimeProfile', options.runtimeProfile);
  appendOptionalSearchParam(url, 'tenant', options.tenant);
  appendOptionalSearchParam(url, 'kind', options.kind);
  appendOptionalSearchParam(url, 'status', options.status);
  appendOptionalBooleanSearchParam(url, 'fileAvailable', options.fileAvailable);
  appendOptionalSearchParam(url, 'assetAvailability', options.assetAvailability);
  appendOptionalSearchParam(url, 'materialization', options.materialization);
  appendOptionalSearchParam(url, 'cursor', options.cursor);
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
      throw new Error(`AuraCall search projection returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiSearchProjectionCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const rows = Array.isArray(record.rows) ? record.rows : [];
  const metrics = isRecord(record.metrics) ? record.metrics : {};
  const lines = [
    `Search results: ${readNumber(metrics.total) ?? rows.length} row${(readNumber(metrics.total) ?? rows.length) === 1 ? '' : 's'}`,
    `Returned: ${readNumber(metrics.returned) ?? rows.length}`,
  ];
  const nextCursor = readString(record.nextCursor);
  if (nextCursor) lines.push(`Next cursor: ${nextCursor}`);
  for (const row of rows.slice(0, 25)) {
    if (!isRecord(row)) continue;
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    const availability = readBoolean(metadata.fileAvailable);
    const materialization = readString(metadata.materializationStatus);
    lines.push(
      `- ${readString(row.kind) ?? 'unknown'} ${readString(row.itemId) ?? readString(row.id) ?? 'unknown'} source=${readString(row.source) ?? 'unknown'} status=${readString(row.status) ?? 'n/a'} available=${availability === null ? 'n/a' : String(availability)} materialization=${materialization ?? 'n/a'} title=${readString(row.title) ?? ''}`.trim(),
    );
  }
  return lines.join('\n');
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
