export interface ApiMirrorCompletionCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  maxPasses?: number | null;
}

export interface ApiMirrorCompletionStatusCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  id: string;
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
    const response = await fetchImpl(new URL(`http://${host}:${port}/v1/account-mirrors/completions`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: normalizeOptionalString(options.provider),
        runtimeProfile: normalizeOptionalString(options.runtimeProfile),
        maxPasses: normalizeOptionalNumber(options.maxPasses),
      }),
      signal: controller.signal,
    });
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
    const response = await fetchImpl(new URL(`http://${host}:${port}/v1/account-mirrors/completions/${encodeURIComponent(id)}`), {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`AuraCall API mirror completion status returned HTTP ${response.status}.`);
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
  const error = isRecord(record.error) ? record.error : null;
  if (error) {
    lines.push(`Error: ${readString(error.code) ?? 'unknown'} ${readString(error.message) ?? ''}`.trim());
  }
  return lines.join('\n');
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

function normalizeOptionalNumber(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.trunc(value);
}

function normalizeId(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error('Use a completion id.');
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
