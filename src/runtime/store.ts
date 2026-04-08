import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import { ExecutionRunRecordBundleSchema } from './schema.js';
import type { ExecutionRunRecordBundle, ExecutionRunSourceKind, ExecutionRunStatus } from './types.js';

const RUNTIME_DIRNAME = 'runtime';
const RUNS_DIRNAME = 'runs';
const BUNDLE_FILENAME = 'bundle.json';

export interface ListExecutionRunRecordOptions {
  limit?: number;
  status?: ExecutionRunStatus;
  sourceKind?: ExecutionRunSourceKind;
}

export interface ExecutionRunRecordStore {
  ensureStorage(): Promise<void>;
  writeBundle(bundle: ExecutionRunRecordBundle): Promise<string>;
  readBundle(runId: string): Promise<ExecutionRunRecordBundle | null>;
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

export async function ensureExecutionRunStorage(): Promise<void> {
  await fs.mkdir(getExecutionRunsDir(), { recursive: true });
}

export async function writeExecutionRunRecordBundle(bundle: ExecutionRunRecordBundle): Promise<string> {
  const parsed = ExecutionRunRecordBundleSchema.parse(bundle);
  const bundlePath = getExecutionRunBundlePath(parsed.run.id);
  await fs.mkdir(path.dirname(bundlePath), { recursive: true });
  await fs.writeFile(bundlePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return bundlePath;
}

export async function readExecutionRunRecordBundle(runId: string): Promise<ExecutionRunRecordBundle | null> {
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

export function createExecutionRunRecordStore(): ExecutionRunRecordStore {
  return {
    ensureStorage: ensureExecutionRunStorage,
    writeBundle: writeExecutionRunRecordBundle,
    readBundle: readExecutionRunRecordBundle,
    listBundles: listExecutionRunRecordBundles,
  };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
