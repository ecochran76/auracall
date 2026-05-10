export interface ApiMirrorProviderGuardClearCliOptions {
  host?: string | null;
  port?: number | null;
  timeoutMs?: number | null;
  provider: string;
  runtimeProfile?: string | null;
  cooldownMs?: number | null;
}

export interface ApiMirrorProviderGuardClearCliSummary {
  host: string;
  port: number;
  provider: string;
  runtimeProfileId: string;
  cooldownUntil: string | null;
  status: string | null;
  reason: string | null;
  raw: unknown;
}

export async function clearApiMirrorProviderGuardForCli(
  options: ApiMirrorProviderGuardClearCliOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiMirrorProviderGuardClearCliSummary> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const provider = normalizeProvider(options.provider);
  const runtimeProfileId = normalizeRuntimeProfile(options.runtimeProfile);
  const cooldownMs = normalizeOptionalNonNegativeInteger(options.cooldownMs);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL(`http://${host}:${port}/status`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountMirrorProviderGuard: {
          action: 'clear',
          provider,
          runtimeProfile: runtimeProfileId,
          ...(typeof cooldownMs === 'number' ? { cooldownMs } : {}),
        },
      }),
      signal: controller.signal,
    });
    const raw = await response.json();
    if (!response.ok) {
      throw new Error(`AuraCall API mirror provider guard clear returned HTTP ${response.status}.`);
    }
    const record = isRecord(raw) ? raw : {};
    const controlResult = isRecord(record.controlResult) ? record.controlResult : {};
    const entry = findMirrorStatusEntry(record.accountMirrorStatus, provider, runtimeProfileId);
    return {
      host,
      port,
      provider,
      runtimeProfileId,
      cooldownUntil: readString(controlResult.cooldownUntil),
      status: readString(entry?.status),
      reason: readString(entry?.reason),
      raw,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApiMirrorProviderGuardClearCliSummary(
  summary: ApiMirrorProviderGuardClearCliSummary,
): string {
  return [
    `Account mirror provider guard cleared (${summary.host}:${summary.port})`,
    `Target: ${summary.provider}/${summary.runtimeProfileId}`,
    `Cooldown until: ${summary.cooldownUntil ?? 'none'}`,
    `Mirror status: ${summary.status ?? 'unknown'} ${summary.reason ?? 'unknown'}`,
  ].join('\n');
}

function findMirrorStatusEntry(
  value: unknown,
  provider: string,
  runtimeProfileId: string,
): Record<string, unknown> | null {
  const status = isRecord(value) ? value : {};
  const entries = Array.isArray(status.entries) ? status.entries : [];
  const entry = entries.find((candidate) => {
    if (!isRecord(candidate)) return false;
    return readString(candidate.provider) === provider &&
      readString(candidate.runtimeProfileId) === runtimeProfileId;
  });
  return isRecord(entry) ? entry : null;
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

function normalizeProvider(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'chatgpt' || trimmed === 'gemini' || trimmed === 'grok') {
    return trimmed;
  }
  throw new Error('Use --provider chatgpt, gemini, or grok.');
}

function normalizeRuntimeProfile(value: string | null | undefined): string {
  const trimmed = String(value ?? 'default').trim();
  return trimmed.length > 0 ? trimmed : 'default';
}

function normalizeOptionalNonNegativeInteger(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.trunc(value));
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
