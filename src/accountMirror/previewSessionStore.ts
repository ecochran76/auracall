import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuracallHomeDir } from '../auracallHome.js';

const PREVIEW_SESSIONS_DIRNAME = 'preview-sessions';
const PREVIEW_SESSION_SCHEMA = 'auracall.preview-session-manifest.v1';

export interface AccountMirrorPreviewSessionItem {
  index?: number;
  provider?: string;
  runtimeProfile?: string;
  kind?: string;
  title?: string;
  itemId?: string;
  boundIdentity?: string;
  updatedAt?: string;
  url: string;
}

export interface AccountMirrorPreviewSessionManifest {
  schema: typeof PREVIEW_SESSION_SCHEMA;
  generatedAt: string;
  count: number;
  items: AccountMirrorPreviewSessionItem[];
}

export interface AccountMirrorPreviewSessionRecord {
  object: 'account_mirror_preview_session';
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  manifest: AccountMirrorPreviewSessionManifest;
}

export interface AccountMirrorPreviewSessionStore {
  writeSession(input: {
    id?: string | null;
    name?: string | null;
    manifest: unknown;
    now?: string | null;
  }): Promise<AccountMirrorPreviewSessionRecord>;
  readSession(id: string): Promise<AccountMirrorPreviewSessionRecord | null>;
  listSessions(options?: { limit?: number | null }): Promise<AccountMirrorPreviewSessionRecord[]>;
}

export function createAccountMirrorPreviewSessionStore(input: {
  config: Record<string, unknown> | null | undefined;
}): AccountMirrorPreviewSessionStore {
  const rootDir = resolveAccountMirrorPreviewSessionsDir(input.config);
  return {
    async writeSession(request) {
      const now = normalizeIsoString(request.now) ?? new Date().toISOString();
      const id = normalizeSessionId(request.id) ?? randomUUID();
      const existing = await readStoredRecord(rootDir, id);
      const manifest = normalizeManifest(request.manifest, now);
      const record: AccountMirrorPreviewSessionRecord = {
        object: 'account_mirror_preview_session',
        version: 1,
        id,
        name: normalizeName(request.name) ?? existing?.name ?? `Preview session ${id.slice(0, 8)}`,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        itemCount: manifest.items.length,
        manifest,
      };
      await fs.mkdir(rootDir, { recursive: true });
      const recordPath = resolvePreviewSessionRecordPath(rootDir, id);
      const tempPath = `${recordPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
      await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      await fs.rename(tempPath, recordPath);
      return record;
    },
    async readSession(id) {
      const normalized = normalizeSessionId(id);
      return normalized ? readStoredRecord(rootDir, normalized) : null;
    },
    async listSessions(options = {}) {
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
            .map((entry) => readStoredRecordFile(path.join(rootDir, entry.name))),
        )
      ).filter((record): record is AccountMirrorPreviewSessionRecord => record !== null);
      const limit = normalizeLimit(options.limit);
      return records
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, limit);
    },
  };
}

function resolveAccountMirrorPreviewSessionsDir(config: Record<string, unknown> | null | undefined): string {
  const cacheRoot = readNestedString(config, ['browser', 'cache', 'rootDir'])
    ?? path.join(getAuracallHomeDir(), 'cache');
  return path.join(cacheRoot, 'account-mirror', PREVIEW_SESSIONS_DIRNAME);
}

function resolvePreviewSessionRecordPath(rootDir: string, id: string): string {
  return path.join(rootDir, `${encodeURIComponent(id)}.json`);
}

async function readStoredRecord(rootDir: string, id: string): Promise<AccountMirrorPreviewSessionRecord | null> {
  return readStoredRecordFile(resolvePreviewSessionRecordPath(rootDir, id));
}

async function readStoredRecordFile(recordPath: string): Promise<AccountMirrorPreviewSessionRecord | null> {
  try {
    const raw = await fs.readFile(recordPath, 'utf8');
    return normalizeRecord(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

function normalizeRecord(value: unknown): AccountMirrorPreviewSessionRecord {
  if (!isRecord(value) || value.object !== 'account_mirror_preview_session') {
    throw new Error('Invalid account mirror preview session record.');
  }
  const id = normalizeSessionId(value.id);
  if (!id) {
    throw new Error('Invalid account mirror preview session id.');
  }
  const updatedAt = normalizeIsoString(value.updatedAt) ?? new Date(0).toISOString();
  const manifest = normalizeManifest(value.manifest, updatedAt);
  return {
    object: 'account_mirror_preview_session',
    version: 1,
    id,
    name: normalizeName(value.name) ?? `Preview session ${id.slice(0, 8)}`,
    createdAt: normalizeIsoString(value.createdAt) ?? updatedAt,
    updatedAt,
    itemCount: manifest.items.length,
    manifest,
  };
}

function normalizeManifest(value: unknown, generatedAtFallback: string): AccountMirrorPreviewSessionManifest {
  if (!isRecord(value) || value.schema !== PREVIEW_SESSION_SCHEMA || !Array.isArray(value.items)) {
    throw new Error('Invalid preview session manifest.');
  }
  const items: AccountMirrorPreviewSessionItem[] = [];
  for (const item of value.items) {
    if (!isRecord(item)) continue;
    const url = normalizeUrl(item.url);
    if (!url || items.some((existing) => existing.url === url)) continue;
    items.push({
      index: items.length + 1,
      provider: normalizeOptionalString(item.provider),
      runtimeProfile: normalizeOptionalString(item.runtimeProfile),
      kind: normalizeOptionalString(item.kind),
      title: normalizeOptionalString(item.title),
      itemId: normalizeOptionalString(item.itemId),
      boundIdentity: normalizeOptionalString(item.boundIdentity),
      updatedAt: normalizeOptionalString(item.updatedAt),
      url,
    });
    if (items.length >= 24) break;
  }
  if (!items.length) {
    throw new Error('Preview session manifest has no valid items.');
  }
  return {
    schema: PREVIEW_SESSION_SCHEMA,
    generatedAt: normalizeIsoString(value.generatedAt) ?? generatedAtFallback,
    count: items.length,
    items,
  };
}

function normalizeSessionId(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  return /^[a-zA-Z0-9._:-]{1,120}$/.test(text) ? text : null;
}

function normalizeName(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return text ? text.slice(0, 120) : null;
}

function normalizeUrl(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.startsWith('data:image/') || text.startsWith('data:video/') || text.startsWith('data:audio/') || text.startsWith('data:application/pdf')) {
    return text;
  }
  try {
    const parsed = new URL(text);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    return null;
  }
  return null;
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIsoString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(200, Math.floor(value)));
}

function readNestedString(
  value: Record<string, unknown> | null | undefined,
  segments: string[],
): string | null {
  let current: unknown = value;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[segment];
  }
  const trimmed = typeof current === 'string' ? current.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'ENOENT');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
