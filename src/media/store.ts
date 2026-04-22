import fs from 'node:fs/promises';
import path from 'node:path';
import { getRuntimeDir } from '../runtime/store.js';
import { MediaGenerationStoredRecordSchema } from './schema.js';
import type { MediaGenerationResponse, MediaGenerationStoredRecord } from './types.js';

const MEDIA_GENERATIONS_DIRNAME = 'media-generations';
const RECORD_FILENAME = 'record.json';
const ARTIFACTS_DIRNAME = 'artifacts';

export interface MediaGenerationRecordStore {
  ensureStorage(): Promise<void>;
  getGenerationDir(id: string): string;
  getArtifactDir(id: string): string;
  readRecord(id: string): Promise<MediaGenerationStoredRecord | null>;
  writeResponse(response: MediaGenerationResponse, options?: { persistedAt?: string }): Promise<MediaGenerationStoredRecord>;
}

export function getMediaGenerationsDir(): string {
  return path.join(getRuntimeDir(), MEDIA_GENERATIONS_DIRNAME);
}

export function getMediaGenerationDir(id: string): string {
  return path.join(getMediaGenerationsDir(), id);
}

export function getMediaGenerationArtifactDir(id: string): string {
  return path.join(getMediaGenerationDir(id), ARTIFACTS_DIRNAME);
}

export function getMediaGenerationRecordPath(id: string): string {
  return path.join(getMediaGenerationDir(id), RECORD_FILENAME);
}

export async function ensureMediaGenerationStorage(): Promise<void> {
  await fs.mkdir(getMediaGenerationsDir(), { recursive: true });
}

export async function readMediaGenerationRecord(id: string): Promise<MediaGenerationStoredRecord | null> {
  try {
    const raw = await fs.readFile(getMediaGenerationRecordPath(id), 'utf8');
    return MediaGenerationStoredRecordSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function writeMediaGenerationResponse(
  response: MediaGenerationResponse,
  options: { persistedAt?: string } = {},
): Promise<MediaGenerationStoredRecord> {
  const existing = await readMediaGenerationRecord(response.id);
  const record: MediaGenerationStoredRecord = {
    id: response.id,
    revision: (existing?.revision ?? 0) + 1,
    persistedAt: options.persistedAt ?? response.updatedAt,
    response,
  };
  const parsedRecord = MediaGenerationStoredRecordSchema.parse(record);
  const generationDir = getMediaGenerationDir(response.id);
  await fs.mkdir(generationDir, { recursive: true });
  await fs.writeFile(getMediaGenerationRecordPath(response.id), `${JSON.stringify(parsedRecord, null, 2)}\n`, 'utf8');
  return parsedRecord;
}

export function createMediaGenerationRecordStore(): MediaGenerationRecordStore {
  return {
    ensureStorage: ensureMediaGenerationStorage,
    getGenerationDir: getMediaGenerationDir,
    getArtifactDir: getMediaGenerationArtifactDir,
    readRecord: readMediaGenerationRecord,
    writeResponse: writeMediaGenerationResponse,
  };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
