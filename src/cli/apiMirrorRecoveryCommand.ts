import { fetchWithLocalApiAuth } from './localApiClient.js';

export interface ApiMirrorRecoveryCandidatesCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  tenant?: string | null;
  status?: string | null;
  action?: string | null;
  includeSearchRows?: boolean | null;
  limit?: number | null;
}

export async function readApiMirrorRecoveryCandidatesForCli(
  options: ApiMirrorRecoveryCandidatesCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const url = new URL(`http://${host}:${port}/v1/account-mirrors/recovery-candidates`);
  appendOptionalSearchParam(url, 'provider', options.provider);
  appendOptionalSearchParam(url, 'runtimeProfile', options.runtimeProfile);
  appendOptionalSearchParam(url, 'tenant', options.tenant);
  appendOptionalSearchParam(url, 'status', options.status);
  appendOptionalSearchParam(url, 'action', options.action);
  if (typeof options.includeSearchRows === 'boolean') {
    url.searchParams.set('includeSearchRows', String(options.includeSearchRows));
  }
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    url.searchParams.set('limit', String(Math.max(0, Math.trunc(options.limit))));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithLocalApiAuth(url, { signal: controller.signal }, fetchImpl);
    if (!response.ok) {
      throw new Error(`AuraCall mirror recovery candidates returned HTTP ${response.status}.`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiMirrorRecoveryCandidatesCliSummary(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const metrics = isRecord(record.metrics) ? record.metrics : {};
  const remote = isRecord(metrics.remoteKnownMissingLocal) ? metrics.remoteKnownMissingLocal : {};
  const unknown = isRecord(metrics.unknownOrDeferred) ? metrics.unknownOrDeferred : {};
  const omitted = isRecord(record.omitted) ? record.omitted : {};
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const lines = [
    `Mirror recovery candidates: ${readNumber(metrics.returned) ?? candidates.length}/${readNumber(metrics.total) ?? candidates.length}`,
    `Omitted: ${readNumber(omitted.candidates) ?? 0}`,
    `Remote-known missing local: ${readNumber(remote.total) ?? 0} total (${readNumber(remote.artifacts) ?? 0} artifacts, ${readNumber(remote.files) ?? 0} files, ${readNumber(remote.media) ?? 0} media)`,
    `Unknown/deferred: ${readNumber(unknown.total) ?? 0} total`,
  ];
  for (const candidate of candidates.slice(0, 25)) {
    if (!isRecord(candidate)) continue;
    const counts = isRecord(candidate.counts) ? candidate.counts : {};
    const missing = isRecord(counts.remoteKnownMissingLocal) ? counts.remoteKnownMissingLocal : {};
    lines.push(
      `- ${readString(candidate.provider) ?? 'unknown'}/${readString(candidate.runtimeProfileId) ?? 'unknown'} ${readString(candidate.status) ?? 'unknown'} action=${readString(candidate.action) ?? 'unknown'} missing=${readNumber(missing.total) ?? 0} reason=${readString(candidate.reason) ?? 'unknown'}`,
    );
  }
  return lines.join('\n');
}

function appendOptionalSearchParam(url: URL, key: string, value: unknown): void {
  const normalized = normalizeOptionalString(value);
  if (normalized) url.searchParams.set(key, normalized);
}

function normalizeHost(value: string | null | undefined): string {
  const normalized = normalizeOptionalString(value);
  return normalized ?? '127.0.0.1';
}

function normalizePort(value: number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value);
  return 18095;
}

function normalizeTimeoutMs(value: number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value);
  return 5000;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
