import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuracallHomeDir } from '../auracallHome.js';
import type {
  AccountMirrorCompletionMaterializationAssetKind,
  AccountMirrorCompletionMaterializationCursor,
  AccountMirrorCompletionMaterializationPolicy,
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionSweepMode,
} from './completionService.js';

const COMPLETIONS_DIRNAME = 'completions';

export interface AccountMirrorCompletionStoredRecord {
  object: 'account_mirror_completion_record';
  version: 1;
  id: string;
  revision: number;
  persistedAt: string;
  operation: AccountMirrorCompletionOperation;
}

export interface AccountMirrorCompletionStore {
  ensureStorage(): Promise<void>;
  readOperation(id: string): Promise<AccountMirrorCompletionOperation | null>;
  writeOperation(operation: AccountMirrorCompletionOperation, options?: { persistedAt?: string }): Promise<AccountMirrorCompletionStoredRecord>;
  listOperations(options?: {
    activeOnly?: boolean;
    limit?: number | null;
  }): Promise<AccountMirrorCompletionOperation[]>;
}

export function createAccountMirrorCompletionStore(input: {
  config: Record<string, unknown> | null | undefined;
}): AccountMirrorCompletionStore {
  const rootDir = resolveAccountMirrorCompletionsDir(input.config);
  return {
    async ensureStorage() {
      await fs.mkdir(rootDir, { recursive: true });
    },
    async readOperation(id) {
      const record = await readStoredRecord(rootDir, id);
      return record?.operation ?? null;
    },
    async writeOperation(operation, options = {}) {
      const existing = await readStoredRecord(rootDir, operation.id);
      const record: AccountMirrorCompletionStoredRecord = {
        object: 'account_mirror_completion_record',
        version: 1,
        id: operation.id,
        revision: (existing?.revision ?? 0) + 1,
        persistedAt: options.persistedAt ?? operation.completedAt ?? operation.nextAttemptAt ?? new Date().toISOString(),
        operation,
      };
      const parsed = parseStoredRecord(record);
      await fs.mkdir(rootDir, { recursive: true });
      const recordPath = resolveCompletionRecordPath(rootDir, operation.id);
      const tempPath = `${recordPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
      await fs.writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
      await fs.rename(tempPath, recordPath);
      return parsed;
    },
    async listOperations(options = {}) {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(rootDir, { withFileTypes: true });
      } catch (error) {
        if (isMissingFileError(error)) return [];
        throw error;
      }
      const records = (
        await Promise.all(
          entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
            .map(async (entry) => readStoredRecordFile(path.join(rootDir, entry.name))),
        )
      ).filter((record): record is AccountMirrorCompletionStoredRecord => record !== null);
      const operations = records
        .map((record) => record.operation)
        .filter((operation) => !options.activeOnly || isActiveOperation(operation))
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
      const limit = normalizeLimit(options.limit);
      return limit === null ? operations : operations.slice(0, limit);
    },
  };
}

function resolveAccountMirrorCompletionsDir(config: Record<string, unknown> | null | undefined): string {
  const cacheRoot = readNestedString(config, ['browser', 'cache', 'rootDir'])
    ?? path.join(getAuracallHomeDir(), 'cache');
  return path.join(cacheRoot, 'account-mirror', COMPLETIONS_DIRNAME);
}

function resolveCompletionRecordPath(rootDir: string, id: string): string {
  return path.join(rootDir, `${encodeURIComponent(id)}.json`);
}

async function readStoredRecord(rootDir: string, id: string): Promise<AccountMirrorCompletionStoredRecord | null> {
  return readStoredRecordFile(resolveCompletionRecordPath(rootDir, id));
}

async function readStoredRecordFile(recordPath: string): Promise<AccountMirrorCompletionStoredRecord | null> {
  try {
    const raw = await fs.readFile(recordPath, 'utf8');
    return parseStoredRecord(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

function parseStoredRecord(value: unknown): AccountMirrorCompletionStoredRecord {
  const record = isRecord(value) ? value : {};
  return {
    object: 'account_mirror_completion_record',
    version: 1,
    id: String(record.id ?? ''),
    revision: normalizeRevision(record.revision),
    persistedAt: normalizeIsoString(record.persistedAt) ?? new Date(0).toISOString(),
    operation: parseOperation(record.operation),
  };
}

function parseOperation(value: unknown): AccountMirrorCompletionOperation {
  if (!isRecord(value) || value.object !== 'account_mirror_completion') {
    throw new Error('Invalid account mirror completion operation record.');
  }
  return {
    object: 'account_mirror_completion',
    id: readRequiredString(value.id, 'id'),
    provider: readProvider(value.provider),
    runtimeProfileId: readRequiredString(value.runtimeProfileId, 'runtimeProfileId'),
    mode: value.mode === 'bounded' ? 'bounded' : 'live_follow',
    sweepMode: readSweepMode(value.sweepMode),
    phase: value.phase === 'steady_follow' ? 'steady_follow' : 'backfill_history',
    status: readStatus(value.status),
    startedAt: normalizeIsoString(value.startedAt) ?? new Date(0).toISOString(),
    completedAt: normalizeIsoString(value.completedAt),
    nextAttemptAt: normalizeIsoString(value.nextAttemptAt),
    maxPasses: readMaxPasses(value.maxPasses),
    passCount: Math.max(0, Math.floor(readNumber(value.passCount) ?? 0)),
    lastRefresh: isRecord(value.lastRefresh) ? value.lastRefresh as unknown as AccountMirrorCompletionOperation['lastRefresh'] : null,
    materializationPolicy: readMaterializationPolicy(value.materializationPolicy, readSweepMode(value.sweepMode)),
    materializationAssetKinds: readMaterializationAssetKinds(value.materializationAssetKinds),
    materializationMaxItems: readMaterializationMaxItems(value.materializationMaxItems),
    materializationRefreshSnapshot: readBoolean(value.materializationRefreshSnapshot) ?? (readSweepMode(value.sweepMode) === 'full_sweep'),
    materializationForce: readBoolean(value.materializationForce) ?? false,
    materializationCursor: parseMaterializationCursor(value.materializationCursor),
    materializationOutcome: parseMaterializationOutcome(value.materializationOutcome),
    accountLibraryCursor: parseAccountLibraryCursor(value.accountLibraryCursor),
    mirrorCompleteness: isRecord(value.mirrorCompleteness) ? value.mirrorCompleteness as AccountMirrorCompletionOperation['mirrorCompleteness'] : null,
    error: parseError(value.error),
    lifecycleEvents: parseLifecycleEvents(value.lifecycleEvents),
  };
}

function parseLifecycleEvents(value: unknown): NonNullable<AccountMirrorCompletionOperation['lifecycleEvents']> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const at = normalizeIsoString(entry.at);
      const type = readLifecycleEventType(entry.type);
      if (!at || !type) return null;
      return {
        at,
        type,
        status: readStatus(entry.status),
        previousStatus: isKnownStatus(entry.previousStatus) ? entry.previousStatus : null,
        processPid: Math.max(0, Math.floor(readNumber(entry.processPid) ?? 0)),
        message: typeof entry.message === 'string' ? entry.message : '',
      } satisfies NonNullable<AccountMirrorCompletionOperation['lifecycleEvents']>[number];
    })
    .filter((entry): entry is NonNullable<AccountMirrorCompletionOperation['lifecycleEvents']>[number] => entry !== null)
    .slice(-20);
}

function parseError(value: unknown): AccountMirrorCompletionOperation['error'] {
  if (!isRecord(value)) return null;
  return {
    message: String(value.message ?? ''),
    code: typeof value.code === 'string' && value.code.length > 0 ? value.code : null,
  };
}

function readSweepMode(value: unknown): AccountMirrorCompletionSweepMode {
  return value === 'full_sweep' ? 'full_sweep' : 'steady_follow';
}

function readMaterializationPolicy(
  value: unknown,
  sweepMode: AccountMirrorCompletionSweepMode,
): AccountMirrorCompletionMaterializationPolicy {
  if (value === 'metadata_only' || value === 'recent_missing_assets' || value === 'full_missing_assets') {
    return value;
  }
  return sweepMode === 'full_sweep' ? 'full_missing_assets' : 'metadata_only';
}

function readMaterializationAssetKinds(value: unknown): AccountMirrorCompletionMaterializationAssetKind[] {
  if (!Array.isArray(value)) return ['all'];
  const normalized = value.filter((entry): entry is AccountMirrorCompletionMaterializationAssetKind =>
    entry === 'artifacts' ||
    entry === 'files' ||
    entry === 'media' ||
    entry === 'all'
  );
  if (normalized.includes('all')) return ['all'];
  return normalized.length > 0 ? Array.from(new Set(normalized)) : ['all'];
}

function readMaterializationMaxItems(value: unknown): number | null {
  const parsed = readNumber(value);
  if (parsed === null) return null;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = readNumber(value);
  if (parsed === null) return null;
  return Math.max(1, Math.floor(parsed));
}

function parseMaterializationCursor(value: unknown): AccountMirrorCompletionMaterializationCursor | null {
  if (!isRecord(value) || !isRecord(value.request)) return null;
  const jobId = typeof value.jobId === 'string' ? value.jobId.trim() : '';
  if (!jobId) return null;
  return {
    jobId,
    jobStatus: typeof value.jobStatus === 'string' && value.jobStatus.trim() ? value.jobStatus.trim() : 'unknown',
    reused: readBoolean(value.reused) ?? false,
    requestedAt: normalizeIsoString(value.requestedAt) ?? new Date(0).toISOString(),
    passCount: Math.max(0, Math.floor(readNumber(value.passCount) ?? 0)),
    request: {
      provider: readProvider(value.request.provider),
      runtimeProfile: typeof value.request.runtimeProfile === 'string' && value.request.runtimeProfile.trim()
        ? value.request.runtimeProfile.trim()
        : 'default',
      reconcile: true,
      refreshSnapshot: readBoolean(value.request.refreshSnapshot) ?? false,
      assetKinds: readMaterializationAssetKinds(value.request.assetKinds),
      maxItems: readMaterializationMaxItems(value.request.maxItems),
      force: readBoolean(value.request.force) ?? false,
    },
  };
}

function parseAccountLibraryCursor(value: unknown): AccountMirrorCompletionOperation['accountLibraryCursor'] {
  if (!isRecord(value)) return null;
  const passCount = Math.max(0, Math.floor(readNumber(value.passCount) ?? 0));
  const status = value.status === 'queued' || value.status === 'reused' ? value.status : 'skipped';
  const request = isRecord(value.request)
    ? {
        provider: readProvider(value.request.provider),
        runtimeProfile: typeof value.request.runtimeProfile === 'string' && value.request.runtimeProfile.trim()
          ? value.request.runtimeProfile.trim()
          : 'default',
        browserProfile: typeof value.request.browserProfile === 'string' && value.request.browserProfile.trim()
          ? value.request.browserProfile.trim()
          : null,
        boundIdentityKey: typeof value.request.boundIdentityKey === 'string' && value.request.boundIdentityKey.trim()
          ? value.request.boundIdentityKey.trim()
          : null,
        reconcile: true as const,
        assetSource: value.request.assetSource === 'account-library' ? 'account-library' as const : null,
        refreshSnapshot: readBoolean(value.request.refreshSnapshot) ?? false,
        assetKinds: readMaterializationAssetKinds(value.request.assetKinds),
        maxItems: readMaterializationMaxItems(value.request.maxItems),
        providerWorkTimeoutMs: readPositiveInteger(value.request.providerWorkTimeoutMs),
        force: readBoolean(value.request.force) ?? false,
      }
    : null;
  return {
    jobId: typeof value.jobId === 'string' && value.jobId.trim() ? value.jobId.trim() : null,
    jobStatus: typeof value.jobStatus === 'string' && value.jobStatus.trim() ? value.jobStatus.trim() : null,
    reused: readBoolean(value.reused) ?? false,
    requestedAt: normalizeIsoString(value.requestedAt) ?? new Date(0).toISOString(),
    passCount,
    status,
    reason: typeof value.reason === 'string' ? value.reason : '',
    request,
  };
}

function parseMaterializationOutcome(value: unknown): AccountMirrorCompletionOperation['materializationOutcome'] {
  if (!isRecord(value)) return null;
  const jobId = typeof value.jobId === 'string' && value.jobId.trim() ? value.jobId.trim() : '';
  if (!jobId) return null;
  return {
    jobId,
    jobStatus: typeof value.jobStatus === 'string' && value.jobStatus.trim() ? value.jobStatus.trim() : 'unknown',
    completedAt: normalizeIsoString(value.completedAt),
    conversationsAttempted: Math.max(0, Math.floor(readNumber(value.conversationsAttempted) ?? 0)),
    materialized: Math.max(0, Math.floor(readNumber(value.materialized) ?? 0)),
    skipped: Math.max(0, Math.floor(readNumber(value.skipped) ?? 0)),
    failed: Math.max(0, Math.floor(readNumber(value.failed) ?? 0)),
    checksumCount: Math.max(0, Math.floor(readNumber(value.checksumCount) ?? 0)),
    manifestPaths: Array.isArray(value.manifestPaths)
      ? value.manifestPaths.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    terminalRouteabilityCounts: isRecord(value.terminalRouteabilityCounts)
      ? Object.fromEntries(
          Object.entries(value.terminalRouteabilityCounts)
            .map(([key, count]) => [key, Math.max(0, Math.floor(readNumber(count) ?? 0))] as const)
            .filter((entry) => entry[1] > 0),
        )
      : {},
    message: typeof value.message === 'string' && value.message.trim() ? value.message.trim() : null,
  };
}

function readProvider(value: unknown): AccountMirrorCompletionOperation['provider'] {
  if (value === 'gemini' || value === 'grok') return value;
  return 'chatgpt';
}

function readStatus(value: unknown): AccountMirrorCompletionOperation['status'] {
  if (isKnownStatus(value)) return value;
  return 'queued';
}

function isKnownStatus(value: unknown): value is AccountMirrorCompletionOperation['status'] {
  if (
    value === 'running'
    || value === 'idle_waiting'
    || value === 'paused'
    || value === 'completed'
    || value === 'blocked'
    || value === 'failed'
    || value === 'cancelled'
  ) return true;
  return value === 'queued';
}

function readLifecycleEventType(value: unknown): NonNullable<AccountMirrorCompletionOperation['lifecycleEvents']>[number]['type'] | null {
  if (
    value === 'started'
    || value === 'parked_for_shutdown'
    || value === 'resumed_after_restart'
    || value === 'operator_paused'
    || value === 'operator_resumed'
    || value === 'operator_cancelled'
    || value === 'campaign_policy_upgraded'
    || value === 'live_follow_policy_upgraded'
    || value === 'automatic_resume_blocked'
    || value === 'operator_resume_blocked'
    || value === 'account_library_catchup_queued'
    || value === 'account_library_catchup_skipped'
  ) return value;
  return null;
}

function readMaxPasses(value: unknown): number | null {
  const parsed = readNumber(value);
  if (parsed === null) return null;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function readRequiredString(value: unknown, field: string): string {
  const parsed = typeof value === 'string' ? value.trim() : '';
  if (!parsed) throw new Error(`Invalid account mirror completion operation: missing ${field}.`);
  return parsed;
}

function normalizeIsoString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && !Number.isNaN(Date.parse(trimmed)) ? trimmed : null;
}

function normalizeRevision(value: unknown): number {
  return Math.max(1, Math.floor(readNumber(value) ?? 1));
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}

function normalizeLimit(value: number | null | undefined): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function isActiveOperation(operation: AccountMirrorCompletionOperation): boolean {
  return operation.status === 'queued' || operation.status === 'running' || operation.status === 'idle_waiting' || operation.status === 'paused';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function readNestedString(
  value: Record<string, unknown> | null | undefined,
  segments: string[],
): string | null {
  let current: unknown = value;
  for (const segment of segments) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  const trimmed = typeof current === 'string' ? current.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}
