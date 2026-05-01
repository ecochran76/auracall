export interface ApiSchedulerHistoryCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  limit?: number | null;
}

export interface ApiSchedulerHistoryCliSummary {
  host: string;
  port: number;
  history: unknown;
}

export async function readApiSchedulerHistoryForCli(
  options: ApiSchedulerHistoryCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<ApiSchedulerHistoryCliSummary> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const limit = normalizeLimit(options.limit);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(`http://${host}:${port}/v1/account-mirrors/scheduler/history`);
    if (limit !== null) {
      url.searchParams.set('limit', String(limit));
    }
    const response = await fetchImpl(url, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`AuraCall API scheduler history returned HTTP ${response.status}.`);
    }
    return {
      host,
      port,
      history: await response.json(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiSchedulerHistoryCliSummary(summary: ApiSchedulerHistoryCliSummary): string {
  const history = isRecord(summary.history) ? summary.history : {};
  const entries = Array.isArray(history.entries) ? history.entries : [];
  const latestYield = isRecord(history.latestYield) ? history.latestYield : null;
  const lines = [
    `AuraCall account mirror scheduler history (${summary.host}:${summary.port})`,
    `Updated: ${readString(history.updatedAt) ?? 'unknown'}`,
    `Entries: ${entries.length}`,
  ];
  if (latestYield) {
    const queuedWork = isRecord(latestYield.queuedWork) ? latestYield.queuedWork : {};
    const remaining = isRecord(latestYield.remainingDetailSurfaces)
      ? latestYield.remainingDetailSurfaces
      : {};
    lines.push(
      `Latest yield: ${readString(latestYield.provider) ?? 'unknown'}/${readString(latestYield.runtimeProfileId) ?? 'unknown'} at ${readString(latestYield.completedAt) ?? 'unknown'} queued=${readString(queuedWork.ownerCommand) ?? 'unknown'} remaining=${readNumber(remaining.total) ?? 'unknown'}`,
    );
  } else {
    lines.push('Latest yield: none');
  }
  for (const entry of entries.slice(0, 10)) {
    if (!isRecord(entry)) continue;
    lines.push(
      `- ${readString(entry.completedAt) ?? 'unknown'} ${readString(entry.action) ?? 'unknown'} ${readString(entry.provider) ?? 'unknown'}/${readString(entry.runtimeProfileId) ?? 'unknown'} backpressure=${readString(entry.backpressureReason) ?? 'unknown'} yielded=${readBoolean(entry.yielded)}`,
    );
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

function normalizeLimit(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(50, Math.trunc(value)));
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): string {
  return typeof value === 'boolean' ? String(value) : 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
