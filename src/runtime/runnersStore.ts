import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { getRuntimeDir } from './store.js';
import { ExecutionRunnerRecordSchema } from './schema.js';
import type { ExecutionRunnerRecord, ExecutionRunnerServiceId, ExecutionRunnerStatus } from './types.js';

const RUNNERS_DIRNAME = 'runners';
const RUNNER_FILENAME = 'runner.json';
const RECORD_FILENAME = 'record.json';
const runnerWriteQueues = new Map<string, Promise<unknown>>();

export interface ListExecutionRunnerRecordOptions {
  limit?: number;
  status?: ExecutionRunnerStatus;
  hostId?: string;
  serviceId?: ExecutionRunnerServiceId;
}

export interface ExecutionRunnerStoredRecord {
  runnerId: string;
  revision: number;
  persistedAt: string;
  runner: ExecutionRunnerRecord;
}

export interface WriteExecutionRunnerRecordOptions {
  expectedRevision?: number | null;
  persistedAt?: string;
}

export interface ExecutionRunnerRecordStore {
  ensureStorage(): Promise<void>;
  writeRunner(runner: ExecutionRunnerRecord, options?: WriteExecutionRunnerRecordOptions): Promise<ExecutionRunnerStoredRecord>;
  readRunner(runnerId: string): Promise<ExecutionRunnerRecord | null>;
  readRecord(runnerId: string): Promise<ExecutionRunnerStoredRecord | null>;
  listRunners(options?: ListExecutionRunnerRecordOptions): Promise<ExecutionRunnerRecord[]>;
  deleteRunner(runnerId: string): Promise<void>;
}

export function getExecutionRunnersDir(): string {
  return path.join(getRuntimeDir(), RUNNERS_DIRNAME);
}

export function getExecutionRunnerDir(runnerId: string): string {
  return path.join(getExecutionRunnersDir(), runnerId);
}

export function getExecutionRunnerPath(runnerId: string): string {
  return path.join(getExecutionRunnerDir(runnerId), RUNNER_FILENAME);
}

export function getExecutionRunnerRecordPath(runnerId: string): string {
  return path.join(getExecutionRunnerDir(runnerId), RECORD_FILENAME);
}

export async function ensureExecutionRunnerStorage(): Promise<void> {
  await fs.mkdir(getExecutionRunnersDir(), { recursive: true });
}

export async function readExecutionRunnerStoredRecord(runnerId: string): Promise<ExecutionRunnerStoredRecord | null> {
  const recordPath = getExecutionRunnerRecordPath(runnerId);
  try {
    const raw = await fs.readFile(recordPath, 'utf8');
    return parseStoredRunnerRecord(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    if (isInvalidJsonError(error)) return readLegacyRunnerRecordAsStoredRecord(runnerId);
    throw error;
  }
}

export async function readExecutionRunnerRecord(runnerId: string): Promise<ExecutionRunnerRecord | null> {
  const record = await readExecutionRunnerStoredRecord(runnerId);
  if (record) return record.runner;
  const runnerPath = getExecutionRunnerPath(runnerId);
  try {
    const raw = await fs.readFile(runnerPath, 'utf8');
    return ExecutionRunnerRecordSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error) || isInvalidJsonError(error)) return null;
    throw error;
  }
}

export async function writeExecutionRunnerStoredRecord(
  runner: ExecutionRunnerRecord,
  options: WriteExecutionRunnerRecordOptions = {},
): Promise<ExecutionRunnerStoredRecord> {
  return withRunnerWriteQueue(runner.id, () => writeExecutionRunnerStoredRecordNow(runner, options));
}

async function writeExecutionRunnerStoredRecordNow(
  runner: ExecutionRunnerRecord,
  options: WriteExecutionRunnerRecordOptions = {},
): Promise<ExecutionRunnerStoredRecord> {
  const parsedRunner = ExecutionRunnerRecordSchema.parse(runner);
  const existing = await readExecutionRunnerStoredRecord(parsedRunner.id);
  const expectedRevision = options.expectedRevision ?? undefined;
  if (typeof expectedRevision === 'number') {
    const currentRevision = existing?.revision ?? 0;
    if (currentRevision !== expectedRevision) {
      throw new Error(
        `Execution runner ${parsedRunner.id} revision mismatch: expected ${expectedRevision}, found ${currentRevision}`,
      );
    }
  }

  const nextRecord: ExecutionRunnerStoredRecord = {
    runnerId: parsedRunner.id,
    revision: (existing?.revision ?? 0) + 1,
    persistedAt: options.persistedAt ?? parsedRunner.lastHeartbeatAt,
    runner: parsedRunner,
  };

  const runnerDir = getExecutionRunnerDir(parsedRunner.id);
  await fs.mkdir(runnerDir, { recursive: true });
  await writeJsonFileAtomically(getExecutionRunnerRecordPath(parsedRunner.id), nextRecord);
  await writeJsonFileAtomically(getExecutionRunnerPath(parsedRunner.id), parsedRunner);
  return nextRecord;
}

export async function listExecutionRunnerRecords(
  options: ListExecutionRunnerRecordOptions = {},
): Promise<ExecutionRunnerRecord[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(getExecutionRunnersDir(), { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }

  const runners = (
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => readExecutionRunnerRecord(entry.name)),
    )
  ).filter((runner): runner is ExecutionRunnerRecord => runner !== null);

  const filtered = runners.filter((runner) => {
    if (options.status && runner.status !== options.status) return false;
    if (options.hostId && runner.hostId !== options.hostId) return false;
    if (options.serviceId && !runner.serviceIds.includes(options.serviceId)) return false;
    return true;
  });

  filtered.sort((left, right) => right.lastHeartbeatAt.localeCompare(left.lastHeartbeatAt));

  if (typeof options.limit === 'number' && options.limit >= 0) {
    return filtered.slice(0, options.limit);
  }
  return filtered;
}

export async function deleteExecutionRunnerRecord(runnerId: string): Promise<void> {
  await fs.rm(getExecutionRunnerDir(runnerId), { recursive: true, force: true });
}

export function createExecutionRunnerRecordStore(): ExecutionRunnerRecordStore {
  return {
    ensureStorage: ensureExecutionRunnerStorage,
    writeRunner: writeExecutionRunnerStoredRecord,
    readRunner: readExecutionRunnerRecord,
    readRecord: readExecutionRunnerStoredRecord,
    listRunners: listExecutionRunnerRecords,
    deleteRunner: deleteExecutionRunnerRecord,
  };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isInvalidJsonError(error: unknown): boolean {
  return error instanceof SyntaxError;
}

async function readLegacyRunnerRecordAsStoredRecord(runnerId: string): Promise<ExecutionRunnerStoredRecord | null> {
  const runnerPath = getExecutionRunnerPath(runnerId);
  let runner: ExecutionRunnerRecord;
  try {
    const raw = await fs.readFile(runnerPath, 'utf8');
    runner = ExecutionRunnerRecordSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error) || isInvalidJsonError(error)) return null;
    throw error;
  }
  if (!runner) return null;
  return {
    runnerId: runner.id,
    revision: 0,
    persistedAt: runner.lastHeartbeatAt,
    runner,
  };
}

async function writeJsonFileAtomically(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function withRunnerWriteQueue<T>(runnerId: string, write: () => Promise<T>): Promise<T> {
  const previous = runnerWriteQueues.get(runnerId) ?? Promise.resolve();
  const next = previous.then(write, write);
  const settled = next.catch(() => undefined).finally(() => {
    if (runnerWriteQueues.get(runnerId) === settled) {
      runnerWriteQueues.delete(runnerId);
    }
  });
  runnerWriteQueues.set(runnerId, settled);
  return next;
}

function parseStoredRunnerRecord(value: unknown): ExecutionRunnerStoredRecord {
  const record = value as Partial<ExecutionRunnerStoredRecord>;
  return {
    runnerId: String(record.runnerId),
    revision: Number(record.revision),
    persistedAt: String(record.persistedAt),
    runner: ExecutionRunnerRecordSchema.parse(record.runner),
  };
}
