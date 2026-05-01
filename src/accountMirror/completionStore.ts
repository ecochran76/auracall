import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuracallHomeDir } from '../auracallHome.js';
import type { AccountMirrorCompletionOperation } from './completionService.js';

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
    phase: value.phase === 'steady_follow' ? 'steady_follow' : 'backfill_history',
    status: readStatus(value.status),
    startedAt: normalizeIsoString(value.startedAt) ?? new Date(0).toISOString(),
    completedAt: normalizeIsoString(value.completedAt),
    nextAttemptAt: normalizeIsoString(value.nextAttemptAt),
    maxPasses: readMaxPasses(value.maxPasses),
    passCount: Math.max(0, Math.floor(readNumber(value.passCount) ?? 0)),
    lastRefresh: isRecord(value.lastRefresh) ? value.lastRefresh as unknown as AccountMirrorCompletionOperation['lastRefresh'] : null,
    mirrorCompleteness: isRecord(value.mirrorCompleteness) ? value.mirrorCompleteness as AccountMirrorCompletionOperation['mirrorCompleteness'] : null,
    error: parseError(value.error),
  };
}

function parseError(value: unknown): AccountMirrorCompletionOperation['error'] {
  if (!isRecord(value)) return null;
  return {
    message: String(value.message ?? ''),
    code: typeof value.code === 'string' && value.code.length > 0 ? value.code : null,
  };
}

function readProvider(value: unknown): AccountMirrorCompletionOperation['provider'] {
  if (value === 'gemini' || value === 'grok') return value;
  return 'chatgpt';
}

function readStatus(value: unknown): AccountMirrorCompletionOperation['status'] {
  if (value === 'running' || value === 'completed' || value === 'blocked' || value === 'failed') return value;
  return 'queued';
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

function normalizeLimit(value: number | null | undefined): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function isActiveOperation(operation: AccountMirrorCompletionOperation): boolean {
  return operation.status === 'queued' || operation.status === 'running';
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
