import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getRunArchiveDir } from './archiveIndexStore.js';

const EVIDENCE_DIRNAME = 'evidence';
const RECORD_FILENAME = 'record.json';

export type RunArchiveEvidenceStatus = 'pass' | 'fail' | 'warning' | 'info' | 'unknown';

export interface RunArchiveEvidenceRecord {
  id: string;
  object: 'run_archive_evidence';
  createdAt: string;
  updatedAt: string;
  producer: string;
  schema: string;
  status: RunArchiveEvidenceStatus;
  title: string | null;
  summary: string | null;
  responseId: string | null;
  batchId: string | null;
  archiveItemId: string | null;
  providerConversationId: string | null;
  data: unknown;
  metadata: Record<string, unknown>;
}

export interface CreateRunArchiveEvidenceInput {
  id?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  producer: string;
  schema: string;
  status?: RunArchiveEvidenceStatus | null;
  title?: string | null;
  summary?: string | null;
  responseId?: string | null;
  batchId?: string | null;
  archiveItemId?: string | null;
  providerConversationId?: string | null;
  data?: unknown;
  metadata?: Record<string, unknown> | null;
}

export interface RunArchiveEvidenceStore {
  createEvidence(input: CreateRunArchiveEvidenceInput): Promise<RunArchiveEvidenceRecord>;
  listEvidence(): Promise<RunArchiveEvidenceRecord[]>;
  readEvidence(id: string): Promise<RunArchiveEvidenceRecord | null>;
}

export function createRunArchiveEvidenceStore(): RunArchiveEvidenceStore {
  return {
    createEvidence: createRunArchiveEvidence,
    listEvidence: listRunArchiveEvidence,
    readEvidence: readRunArchiveEvidence,
  };
}

export function getRunArchiveEvidenceDir(): string {
  return path.join(getRunArchiveDir(), EVIDENCE_DIRNAME);
}

export function getRunArchiveEvidenceRecordPath(id: string): string {
  return path.join(getRunArchiveEvidenceDir(), id, RECORD_FILENAME);
}

export async function createRunArchiveEvidence(input: CreateRunArchiveEvidenceInput): Promise<RunArchiveEvidenceRecord> {
  const now = new Date().toISOString();
  const id = normalizeEvidenceId(input.id) ?? `evidence_${randomUUID().replace(/-/g, '')}`;
  const record: RunArchiveEvidenceRecord = {
    id,
    object: 'run_archive_evidence',
    createdAt: normalizeString(input.createdAt) ?? now,
    updatedAt: normalizeString(input.updatedAt) ?? normalizeString(input.createdAt) ?? now,
    producer: requireNonEmpty(input.producer, 'producer'),
    schema: requireNonEmpty(input.schema, 'schema'),
    status: normalizeEvidenceStatus(input.status),
    title: normalizeString(input.title),
    summary: normalizeString(input.summary),
    responseId: normalizeString(input.responseId),
    batchId: normalizeString(input.batchId),
    archiveItemId: normalizeString(input.archiveItemId),
    providerConversationId: normalizeString(input.providerConversationId),
    data: input.data ?? null,
    metadata: isRecord(input.metadata) ? input.metadata : {},
  };
  const recordPath = getRunArchiveEvidenceRecordPath(id);
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  const tempPath = `${recordPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, recordPath);
  return record;
}

export async function readRunArchiveEvidence(id: string): Promise<RunArchiveEvidenceRecord | null> {
  try {
    const raw = await fs.readFile(getRunArchiveEvidenceRecordPath(id), 'utf8');
    return normalizeRecord(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function listRunArchiveEvidence(): Promise<RunArchiveEvidenceRecord[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(getRunArchiveEvidenceDir(), { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
  const records = (
    await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readRunArchiveEvidence(entry.name)))
  ).filter((record): record is RunArchiveEvidenceRecord => Boolean(record));
  records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return records;
}

function normalizeRecord(value: unknown): RunArchiveEvidenceRecord {
  const record = isRecord(value) ? value : {};
  return {
    id: requireNonEmpty(record.id, 'id'),
    object: 'run_archive_evidence',
    createdAt: requireNonEmpty(record.createdAt, 'createdAt'),
    updatedAt: requireNonEmpty(record.updatedAt, 'updatedAt'),
    producer: requireNonEmpty(record.producer, 'producer'),
    schema: requireNonEmpty(record.schema, 'schema'),
    status: normalizeEvidenceStatus(record.status),
    title: normalizeString(record.title),
    summary: normalizeString(record.summary),
    responseId: normalizeString(record.responseId),
    batchId: normalizeString(record.batchId),
    archiveItemId: normalizeString(record.archiveItemId),
    providerConversationId: normalizeString(record.providerConversationId),
    data: record.data ?? null,
    metadata: isRecord(record.metadata) ? record.metadata : {},
  };
}

function normalizeEvidenceId(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return normalized.replace(/[^a-zA-Z0-9:_-]+/g, '_').slice(0, 120) || null;
}

function normalizeEvidenceStatus(value: unknown): RunArchiveEvidenceStatus {
  if (value === 'pass' || value === 'fail' || value === 'warning' || value === 'info' || value === 'unknown') return value;
  return 'unknown';
}

function requireNonEmpty(value: unknown, label: string): string {
  const normalized = normalizeString(value);
  if (!normalized) throw new Error(`Run archive evidence ${label} is required.`);
  return normalized;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
