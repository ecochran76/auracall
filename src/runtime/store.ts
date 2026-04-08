import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import { ExecutionRunRecordBundleSchema } from './schema.js';
import type { ExecutionRunRecordBundle, ExecutionRunSourceKind, ExecutionRunStatus } from './types.js';

const RUNTIME_DIRNAME = 'runtime';
const RUNS_DIRNAME = 'runs';
const BUNDLE_FILENAME = 'bundle.json';
const RECORD_FILENAME = 'record.json';

export interface ListExecutionRunRecordOptions {
  limit?: number;
  status?: ExecutionRunStatus;
  sourceKind?: ExecutionRunSourceKind;
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
    const raw = await fs.readFile(bundlePath, 'utf8');
    return ExecutionRunRecordBundleSchema.parse(JSON.parse(raw));
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

  const bundles = (
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => readExecutionRunRecordBundle(entry.name)),
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

export async function readExecutionRunStoredRecord(runId: string): Promise<ExecutionRunStoredRecord | null> {
  const recordPath = getExecutionRunRecordPath(runId);
  try {
    const raw = await fs.readFile(recordPath, 'utf8');
    return parseStoredRecord(JSON.parse(raw));
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
  await fs.writeFile(recordPath, `${JSON.stringify(nextRecord, null, 2)}\n`, 'utf8');
  await fs.writeFile(bundlePath, `${JSON.stringify(parsedBundle, null, 2)}\n`, 'utf8');
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

function parseStoredRecord(value: unknown): ExecutionRunStoredRecord {
  const record = value as Partial<ExecutionRunStoredRecord>;
  return {
    runId: String(record.runId),
    revision: Number(record.revision),
    persistedAt: String(record.persistedAt),
    bundle: ExecutionRunRecordBundleSchema.parse(record.bundle),
  };
}
