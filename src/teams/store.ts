import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import { TaskRunSpecSchema } from './schema.js';
import type { TaskRunSpec } from './types.js';

const TEAMS_DIRNAME = 'teams';
const TASK_RUN_SPECS_DIRNAME = 'task-run-specs';
const SPEC_FILENAME = 'spec.json';
const RECORD_FILENAME = 'record.json';

export interface TaskRunSpecStoredRecord {
  taskRunSpecId: string;
  revision: number;
  persistedAt: string;
  spec: TaskRunSpec;
}

export interface TaskRunSpecInspectionSummary {
  id: string;
  teamId: string;
  title: string;
  objective: string;
  createdAt: string;
  persistedAt: string;
  requestedOutputCount: number;
  inputArtifactCount: number;
}

export interface WriteTaskRunSpecRecordOptions {
  expectedRevision?: number | null;
  persistedAt?: string;
}

export interface TaskRunSpecRecordStore {
  ensureStorage(): Promise<void>;
  writeSpec(spec: TaskRunSpec): Promise<string>;
  readSpec(taskRunSpecId: string): Promise<TaskRunSpec | null>;
  readRecord(taskRunSpecId: string): Promise<TaskRunSpecStoredRecord | null>;
  writeRecord(spec: TaskRunSpec, options?: WriteTaskRunSpecRecordOptions): Promise<TaskRunSpecStoredRecord>;
}

export function getTeamsDir(): string {
  return path.join(getAuracallHomeDir(), TEAMS_DIRNAME);
}

export function getTaskRunSpecsDir(): string {
  return path.join(getTeamsDir(), TASK_RUN_SPECS_DIRNAME);
}

export function getTaskRunSpecDir(taskRunSpecId: string): string {
  return path.join(getTaskRunSpecsDir(), taskRunSpecId);
}

export function getTaskRunSpecPath(taskRunSpecId: string): string {
  return path.join(getTaskRunSpecDir(taskRunSpecId), SPEC_FILENAME);
}

export function getTaskRunSpecRecordPath(taskRunSpecId: string): string {
  return path.join(getTaskRunSpecDir(taskRunSpecId), RECORD_FILENAME);
}

export async function ensureTaskRunSpecStorage(): Promise<void> {
  await fs.mkdir(getTaskRunSpecsDir(), { recursive: true });
}

export async function writeTaskRunSpec(spec: TaskRunSpec): Promise<string> {
  const record = await writeTaskRunSpecStoredRecord(spec);
  return getTaskRunSpecPath(record.taskRunSpecId);
}

export async function readTaskRunSpec(taskRunSpecId: string): Promise<TaskRunSpec | null> {
  const record = await readTaskRunSpecStoredRecord(taskRunSpecId);
  if (record) return record.spec;
  const specPath = getTaskRunSpecPath(taskRunSpecId);
  try {
    const raw = await fs.readFile(specPath, 'utf8');
    return TaskRunSpecSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function readTaskRunSpecStoredRecord(taskRunSpecId: string): Promise<TaskRunSpecStoredRecord | null> {
  const recordPath = getTaskRunSpecRecordPath(taskRunSpecId);
  try {
    const raw = await fs.readFile(recordPath, 'utf8');
    return parseStoredRecord(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function writeTaskRunSpecStoredRecord(
  spec: TaskRunSpec,
  options: WriteTaskRunSpecRecordOptions = {},
): Promise<TaskRunSpecStoredRecord> {
  const parsedSpec = TaskRunSpecSchema.parse(spec);
  const existing = await readTaskRunSpecStoredRecord(parsedSpec.id);
  const expectedRevision = options.expectedRevision ?? undefined;
  if (typeof expectedRevision === 'number') {
    const currentRevision = existing?.revision ?? 0;
    if (currentRevision !== expectedRevision) {
      throw new Error(
        `Task run spec ${parsedSpec.id} revision mismatch: expected ${expectedRevision}, found ${currentRevision}`,
      );
    }
  }

  const nextRecord: TaskRunSpecStoredRecord = {
    taskRunSpecId: parsedSpec.id,
    revision: (existing?.revision ?? 0) + 1,
    persistedAt: options.persistedAt ?? parsedSpec.createdAt,
    spec: parsedSpec,
  };

  const specDir = getTaskRunSpecDir(parsedSpec.id);
  await fs.mkdir(specDir, { recursive: true });
  await fs.writeFile(getTaskRunSpecRecordPath(parsedSpec.id), `${JSON.stringify(nextRecord, null, 2)}
`, 'utf8');
  await fs.writeFile(getTaskRunSpecPath(parsedSpec.id), `${JSON.stringify(parsedSpec, null, 2)}
`, 'utf8');
  return nextRecord;
}

export async function readTaskRunSpecInspectionSummary(
  taskRunSpecId: string,
): Promise<TaskRunSpecInspectionSummary | null> {
  const record = await readTaskRunSpecStoredRecord(taskRunSpecId);
  if (!record) return null;
  return summarizeTaskRunSpecStoredRecord(record);
}

export function summarizeTaskRunSpecStoredRecord(
  record: TaskRunSpecStoredRecord,
): TaskRunSpecInspectionSummary {
  return {
    id: record.spec.id,
    teamId: record.spec.teamId,
    title: record.spec.title,
    objective: record.spec.objective,
    createdAt: record.spec.createdAt,
    persistedAt: record.persistedAt,
    requestedOutputCount: record.spec.requestedOutputs.length,
    inputArtifactCount: record.spec.inputArtifacts.length,
  };
}

export function createTaskRunSpecRecordStore(): TaskRunSpecRecordStore {
  return {
    ensureStorage: ensureTaskRunSpecStorage,
    writeSpec: writeTaskRunSpec,
    readSpec: readTaskRunSpec,
    readRecord: readTaskRunSpecStoredRecord,
    writeRecord: writeTaskRunSpecStoredRecord,
  };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function parseStoredRecord(value: unknown): TaskRunSpecStoredRecord {
  const record = value as Partial<TaskRunSpecStoredRecord>;
  return {
    taskRunSpecId: String(record.taskRunSpecId),
    revision: Number(record.revision),
    persistedAt: String(record.persistedAt),
    spec: TaskRunSpecSchema.parse(record.spec),
  };
}
