import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getRuntimeDir } from './store.js';
import type { RunArchiveItem } from './archiveService.js';

const ARCHIVE_DIRNAME = 'archive';
const INDEX_FILENAME = 'index.json';
const INDEX_VERSION = 1;

export interface RunArchiveIndexRecord {
  object: 'run_archive_index';
  version: number;
  updatedAt: string;
  itemCount: number;
  items: RunArchiveItem[];
}

export interface RunArchiveIndexWriteOptions {
  updatedAt?: string;
}

export interface RunArchiveIndexUpsertOptions extends RunArchiveIndexWriteOptions {
  removeExisting?: (item: RunArchiveItem) => boolean;
}

export interface RunArchiveIndexStore {
  readIndex(): Promise<RunArchiveIndexRecord | null>;
  writeIndex(items: RunArchiveItem[], options?: RunArchiveIndexWriteOptions): Promise<RunArchiveIndexRecord>;
  upsertItems(items: RunArchiveItem[], options?: RunArchiveIndexUpsertOptions): Promise<RunArchiveIndexRecord>;
  readItem(id: string): Promise<RunArchiveItem | null>;
  listItems(): Promise<RunArchiveItem[]>;
}

export function getRunArchiveDir(): string {
  return path.join(getRuntimeDir(), ARCHIVE_DIRNAME);
}

export function getRunArchiveIndexPath(): string {
  return path.join(getRunArchiveDir(), INDEX_FILENAME);
}

export function createRunArchiveIndexStore(): RunArchiveIndexStore {
  return {
    readIndex: readRunArchiveIndex,
    writeIndex: writeRunArchiveIndex,
    upsertItems: upsertRunArchiveIndexedItems,
    readItem: readRunArchiveIndexedItem,
    listItems: listRunArchiveIndexedItems,
  };
}

export async function readRunArchiveIndex(): Promise<RunArchiveIndexRecord | null> {
  try {
    const raw = await fs.readFile(getRunArchiveIndexPath(), 'utf8');
    return normalizeIndexRecord(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function writeRunArchiveIndex(
  items: RunArchiveItem[],
  options: RunArchiveIndexWriteOptions = {},
): Promise<RunArchiveIndexRecord> {
  const record: RunArchiveIndexRecord = {
    object: 'run_archive_index',
    version: INDEX_VERSION,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    itemCount: items.length,
    items: normalizeItems(items),
  };
  await fs.mkdir(getRunArchiveDir(), { recursive: true });
  const indexPath = getRunArchiveIndexPath();
  const tempPath = `${indexPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, indexPath);
  return record;
}

export async function listRunArchiveIndexedItems(): Promise<RunArchiveItem[]> {
  return (await readRunArchiveIndex())?.items ?? [];
}

export async function upsertRunArchiveIndexedItems(
  items: RunArchiveItem[],
  options: RunArchiveIndexUpsertOptions = {},
): Promise<RunArchiveIndexRecord> {
  const current = (await readRunArchiveIndex())?.items ?? [];
  const incoming = normalizeItems(items);
  const incomingIds = new Set(incoming.map((item) => item.id));
  const retained = current.filter((item) => {
    if (incomingIds.has(item.id)) return false;
    if (options.removeExisting?.(item)) return false;
    return true;
  });
  return writeRunArchiveIndex([...retained, ...incoming], {
    updatedAt: options.updatedAt,
  });
}

export async function readRunArchiveIndexedItem(id: string): Promise<RunArchiveItem | null> {
  const items = await listRunArchiveIndexedItems();
  return items.find((item) => item.id === id) ?? null;
}

function normalizeIndexRecord(value: unknown): RunArchiveIndexRecord {
  const record = isRecord(value) ? value : {};
  const items = Array.isArray(record.items) ? normalizeItems(record.items) : [];
  return {
    object: 'run_archive_index',
    version: typeof record.version === 'number' ? record.version : INDEX_VERSION,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    itemCount: items.length,
    items,
  };
}

function normalizeItems(items: unknown[]): RunArchiveItem[] {
  return items
    .filter(isRunArchiveItem)
    .map(normalizeRunArchiveItem)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
}

function normalizeRunArchiveItem(item: RunArchiveItem): RunArchiveItem {
  const record = item as RunArchiveItem & { projectId?: unknown };
  return {
    ...item,
    projectId: typeof record.projectId === 'string' && record.projectId.trim().length > 0 ? record.projectId.trim() : null,
  };
}

function isRunArchiveItem(value: unknown): value is RunArchiveItem {
  if (!isRecord(value)) return false;
  return value.object === 'run_archive_item' && typeof value.id === 'string' && isRunArchiveKind(value.kind);
}

function isRunArchiveKind(value: unknown): boolean {
  return value === 'response' ||
    value === 'response_batch' ||
    value === 'team_run' ||
    value === 'media_generation' ||
    value === 'upload' ||
    value === 'generated_artifact' ||
    value === 'provider_conversation' ||
    value === 'evidence';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
