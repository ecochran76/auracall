export interface ApiSchedulerDiagnosticsCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  completionId?: string | null;
}

export interface ApiSchedulerDiagnosticsCliSummary {
  host: string;
  port: number;
  diagnostics: unknown;
}

export async function readApiSchedulerDiagnosticsForCli(
  options: ApiSchedulerDiagnosticsCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<ApiSchedulerDiagnosticsCliSummary> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(`http://${host}:${port}/v1/account-mirrors/scheduler/diagnostics`);
    appendOptionalSearchParam(url, 'provider', options.provider);
    appendOptionalSearchParam(url, 'runtimeProfile', options.runtimeProfile);
    appendOptionalSearchParam(url, 'completionId', options.completionId);
    const response = await fetchImpl(url, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`AuraCall API scheduler diagnostics returned HTTP ${response.status}.`);
    }
    return {
      host,
      port,
      diagnostics: await response.json(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiSchedulerDiagnosticsCliSummary(summary: ApiSchedulerDiagnosticsCliSummary): string {
  const diagnostics = isRecord(summary.diagnostics) ? summary.diagnostics : {};
  const target = isRecord(diagnostics.target) ? diagnostics.target : {};
  const wait = isRecord(diagnostics.wait) ? diagnostics.wait : {};
  const completion = isRecord(diagnostics.completion) ? diagnostics.completion : null;
  const lines = [
    `AuraCall account mirror scheduler diagnostics (${summary.host}:${summary.port})`,
    `Target: ${readString(target.provider) ?? 'unknown'}/${readString(target.runtimeProfileId) ?? 'unknown'}`,
    `Wait: ${readString(wait.label) ?? readString(wait.kind) ?? 'unknown'}`,
    `Cache: ${readString(target.cachePath) ?? 'unknown'}`,
  ];
  if (completion) {
    lines.push(
      `Completion: ${readString(completion.id) ?? 'unknown'} ${readString(completion.status) ?? 'unknown'} ${readString(completion.phase) ?? 'unknown'}`,
    );
  } else {
    lines.push('Completion: none');
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

function appendOptionalSearchParam(url: URL, name: string, value: string | null | undefined): void {
  const normalized = normalizeOptionalString(value);
  if (normalized) {
    url.searchParams.set(name, normalized);
  }
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
