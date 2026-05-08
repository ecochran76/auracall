export interface ApiLogTailCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  maxBytes?: number | null;
}

export interface ApiLogTailResponse {
  object: 'api_log_tail';
  logPath: string;
  exists: boolean;
  sizeBytes: number;
  maxBytes: number;
  truncated: boolean;
  content: string;
}

export interface ApiLogTailCliSummary {
  host: string;
  port: number;
  logTail: ApiLogTailResponse;
}

export async function readApiLogTailForCli(
  options: ApiLogTailCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<ApiLogTailCliSummary> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const maxBytes = normalizeMaxBytes(options.maxBytes);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(`http://${host}:${port}/v1/api/logs/tail`);
    url.searchParams.set('maxBytes', String(maxBytes));
    const response = await fetchImpl(url, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`AuraCall API log tail returned HTTP ${response.status}.`);
    }
    const raw = await response.json();
    return {
      host,
      port,
      logTail: normalizeApiLogTailResponse(raw),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiLogTailCliSummary(summary: ApiLogTailCliSummary): string {
  const tail = summary.logTail;
  const lines = [
    `AuraCall API log tail (${summary.host}:${summary.port})`,
    `Log: ${tail.logPath}`,
    `Exists: ${tail.exists ? 'yes' : 'no'} size=${tail.sizeBytes} maxBytes=${tail.maxBytes} truncated=${tail.truncated ? 'yes' : 'no'}`,
  ];
  if (tail.content.length > 0) {
    lines.push(tail.content.endsWith('\n') ? tail.content.slice(0, -1) : tail.content);
  }
  return lines.join('\n');
}

function normalizeApiLogTailResponse(raw: unknown): ApiLogTailResponse {
  const record = isRecord(raw) ? raw : {};
  return {
    object: 'api_log_tail',
    logPath: readString(record.logPath) ?? 'unknown',
    exists: typeof record.exists === 'boolean' ? record.exists : false,
    sizeBytes: readNumber(record.sizeBytes) ?? 0,
    maxBytes: readNumber(record.maxBytes) ?? 0,
    truncated: typeof record.truncated === 'boolean' ? record.truncated : false,
    content: readStringAllowEmpty(record.content) ?? '',
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

function normalizeMaxBytes(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 32_768;
  }
  return Math.max(1, Math.min(262_144, Math.trunc(value)));
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringAllowEmpty(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
