import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuracallHomeDir } from '../auracallHome.js';
import { ExecutionRunRecordBundleSchema } from './schema.js';
import type { ExecutionRunRecordBundle, ExecutionRunSourceKind, ExecutionRunStatus } from './types.js';

const RUNTIME_DIRNAME = 'runtime';
const RUNS_DIRNAME = 'runs';
const BUNDLE_FILENAME = 'bundle.json';
const RECORD_FILENAME = 'record.json';
const JSON_READ_RETRY_DELAYS_MS = [10, 25, 50];

export interface ListExecutionRunRecordOptions {
  limit?: number;
  status?: ExecutionRunStatus;
  sourceKind?: ExecutionRunSourceKind;
  updatedSince?: string;
}

export interface ExecutionRunStoredRecord {
  runId: string;
  revision: number;
  persistedAt: string;
  bundle: ExecutionRunRecordBundle;
}

export interface WriteExecutionRunRecordOptions {
  expectedRevision?: number | null;
  persistedAt?: string;
}

export interface ExecutionRunRecordStore {
  ensureStorage(): Promise<void>;
  writeBundle(bundle: ExecutionRunRecordBundle): Promise<string>;
  readBundle(runId: string): Promise<ExecutionRunRecordBundle | null>;
  readRecord(runId: string): Promise<ExecutionRunStoredRecord | null>;
  writeRecord(bundle: ExecutionRunRecordBundle, options?: WriteExecutionRunRecordOptions): Promise<ExecutionRunStoredRecord>;
  listBundles(options?: ListExecutionRunRecordOptions): Promise<ExecutionRunRecordBundle[]>;
}

export function getRuntimeDir(): string {
  return path.join(getAuracallHomeDir(), RUNTIME_DIRNAME);
}

export function getExecutionRunsDir(): string {
  return path.join(getRuntimeDir(), RUNS_DIRNAME);
}

export function getExecutionRunDir(runId: string): string {
  return path.join(getExecutionRunsDir(), runId);
}

export function getExecutionRunBundlePath(runId: string): string {
  return path.join(getExecutionRunDir(runId), BUNDLE_FILENAME);
}

export function getExecutionRunRecordPath(runId: string): string {
  return path.join(getExecutionRunDir(runId), RECORD_FILENAME);
}

export async function ensureExecutionRunStorage(): Promise<void> {
  await fs.mkdir(getExecutionRunsDir(), { recursive: true });
}

export async function writeExecutionRunRecordBundle(bundle: ExecutionRunRecordBundle): Promise<string> {
  const record = await writeExecutionRunStoredRecord(bundle);
  return getExecutionRunBundlePath(record.runId);
}

export async function readExecutionRunRecordBundle(runId: string): Promise<ExecutionRunRecordBundle | null> {
  const record = await readExecutionRunStoredRecord(runId);
  if (record) return record.bundle;
  const bundlePath = getExecutionRunBundlePath(runId);
  try {
    return await readJsonFileWithRetries(bundlePath, (value) => ExecutionRunRecordBundleSchema.parse(value));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function listExecutionRunRecordBundles(
  options: ListExecutionRunRecordOptions = {},
): Promise<ExecutionRunRecordBundle[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(getExecutionRunsDir(), { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }

  const runEntries = entries.filter((entry) => entry.isDirectory());
  const candidateEntries = options.updatedSince
    ? await filterRunEntriesUpdatedSince(runEntries, options.updatedSince)
    : runEntries;

  const bundles = (
    await Promise.all(
      candidateEntries.map(async (entry) => readExecutionRunRecordBundle(entry.name)),
    )
  ).filter((bundle): bundle is ExecutionRunRecordBundle => bundle !== null);

  const filtered = bundles.filter((bundle) => {
    if (options.status && bundle.run.status !== options.status) return false;
    if (options.sourceKind && bundle.run.sourceKind !== options.sourceKind) return false;
    return true;
  });

  filtered.sort((left, right) => right.run.createdAt.localeCompare(left.run.createdAt));

  if (typeof options.limit === 'number' && options.limit >= 0) {
    return filtered.slice(0, options.limit);
  }
  return filtered;
}

async function filterRunEntriesUpdatedSince(entries: Dirent[], updatedSince: string): Promise<Dirent[]> {
  const cutoffMs = Date.parse(updatedSince);
  if (!Number.isFinite(cutoffMs)) return entries;
  const checks = await Promise.all(
    entries.map(async (entry) => {
      const updated = await hasRunRecordUpdatedSince(entry.name, cutoffMs);
      return updated ? entry : null;
    }),
  );
  return checks.filter((entry): entry is Dirent => entry !== null);
}

async function hasRunRecordUpdatedSince(runId: string, cutoffMs: number): Promise<boolean> {
  for (const filePath of [getExecutionRunRecordPath(runId), getExecutionRunBundlePath(runId)]) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs >= cutoffMs) return true;
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
  }
  return false;
}

export async function readExecutionRunStoredRecord(runId: string): Promise<ExecutionRunStoredRecord | null> {
  const recordPath = getExecutionRunRecordPath(runId);
  try {
    return await readJsonFileWithRetries(recordPath, parseStoredRecord);
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function writeExecutionRunStoredRecord(
  bundle: ExecutionRunRecordBundle,
  options: WriteExecutionRunRecordOptions = {},
): Promise<ExecutionRunStoredRecord> {
  const parsedBundle = ExecutionRunRecordBundleSchema.parse(bundle);
  const existing = await readExecutionRunStoredRecord(parsedBundle.run.id);
  const expectedRevision = options.expectedRevision ?? undefined;
  if (typeof expectedRevision === 'number') {
    const currentRevision = existing?.revision ?? 0;
    if (currentRevision !== expectedRevision) {
      throw new Error(
        `Execution run ${parsedBundle.run.id} revision mismatch: expected ${expectedRevision}, found ${currentRevision}`,
      );
    }
  }

  const nextRecord: ExecutionRunStoredRecord = {
    runId: parsedBundle.run.id,
    revision: (existing?.revision ?? 0) + 1,
    persistedAt: options.persistedAt ?? parsedBundle.run.updatedAt,
    bundle: parsedBundle,
  };

  const runDir = getExecutionRunDir(parsedBundle.run.id);
  const recordPath = getExecutionRunRecordPath(parsedBundle.run.id);
  const bundlePath = getExecutionRunBundlePath(parsedBundle.run.id);
  await fs.mkdir(runDir, { recursive: true });
  await writeJsonFileAtomically(recordPath, nextRecord);
  await writeJsonFileAtomically(bundlePath, parsedBundle);
  return nextRecord;
}

export function createExecutionRunRecordStore(): ExecutionRunRecordStore {
  return {
    ensureStorage: ensureExecutionRunStorage,
    writeBundle: writeExecutionRunRecordBundle,
    readBundle: readExecutionRunRecordBundle,
    readRecord: readExecutionRunStoredRecord,
    writeRecord: writeExecutionRunStoredRecord,
    listBundles: listExecutionRunRecordBundles,
  };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function readJsonFileWithRetries<T>(filePath: string, parse: (value: unknown) => T): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= JSON_READ_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return parse(JSON.parse(raw));
    } catch (error) {
      if (isMissingFileError(error) || !(error instanceof SyntaxError)) {
        throw error;
      }
      lastError = error;
      if (attempt >= JSON_READ_RETRY_DELAYS_MS.length) {
        break;
      }
      await sleep(JSON_READ_RETRY_DELAYS_MS[attempt] ?? 0);
    }
  }
  throw lastError;
}

async function writeJsonFileAtomically(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function parseStoredRecord(value: unknown): ExecutionRunStoredRecord {
  const record = value as Partial<ExecutionRunStoredRecord>;
  return {
    runId: String(record.runId),
    revision: Number(record.revision),
    persistedAt: String(record.persistedAt),
    bundle: ExecutionRunRecordBundleSchema.parse(record.bundle),
  };
}
