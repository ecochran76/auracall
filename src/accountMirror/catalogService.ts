import {
  createAccountMirrorPersistence,
  type AccountMirrorPersistence,
} from './cachePersistence.js';
import type { AccountMirrorProvider } from './politePolicy.js';
import {
  createAccountMirrorStatusRegistry,
  type AccountMirrorStatusEntry,
  type AccountMirrorStatusRegistry,
} from './statusRegistry.js';

export type AccountMirrorCatalogKind =
  | 'all'
  | 'projects'
  | 'conversations'
  | 'artifacts'
  | 'files'
  | 'media';

export interface AccountMirrorCatalogRequest {
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  kind?: AccountMirrorCatalogKind | null;
  limit?: number | null;
}

export interface AccountMirrorCatalogItemRequest extends AccountMirrorCatalogRequest {
  itemId: string;
}

export interface AccountMirrorCatalogEntry {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  boundIdentityKey: string | null;
  status: AccountMirrorStatusEntry['status'];
  reason: AccountMirrorStatusEntry['reason'];
  mirrorCompleteness: AccountMirrorStatusEntry['mirrorCompleteness'];
  manifests: {
    projects: unknown[];
    conversations: unknown[];
    artifacts: unknown[];
    files: unknown[];
    media: unknown[];
  };
  counts: {
    projects: number;
    conversations: number;
    artifacts: number;
    files: number;
    media: number;
  };
}

export interface AccountMirrorCatalogResult {
  object: 'account_mirror_catalog';
  generatedAt: string;
  kind: AccountMirrorCatalogKind;
  limit: number;
  entries: AccountMirrorCatalogEntry[];
  metrics: {
    targets: number;
    projects: number;
    conversations: number;
    artifacts: number;
    files: number;
    media: number;
  };
}

export interface AccountMirrorCatalogItemResult {
  object: 'account_mirror_catalog_item';
  generatedAt: string;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  boundIdentityKey: string | null;
  status: AccountMirrorStatusEntry['status'];
  reason: AccountMirrorStatusEntry['reason'];
  kind: Exclude<AccountMirrorCatalogKind, 'all'>;
  itemId: string;
  item: unknown;
}

export interface AccountMirrorCatalogService {
  readCatalog(request?: AccountMirrorCatalogRequest): Promise<AccountMirrorCatalogResult>;
  readItem(request: AccountMirrorCatalogItemRequest): Promise<AccountMirrorCatalogItemResult | null>;
}

export function createAccountMirrorCatalogService(input: {
  config: Record<string, unknown> | null | undefined;
  registry?: AccountMirrorStatusRegistry;
  persistence?: AccountMirrorPersistence;
  now?: () => Date;
}): AccountMirrorCatalogService {
  const now = input.now ?? (() => new Date());
  const persistence = input.persistence ?? createAccountMirrorPersistence({
    config: input.config,
  });
  const registry = input.registry ?? createAccountMirrorStatusRegistry({
    config: input.config,
    now,
    readPersistentState: persistence.readState,
  });
  return {
    async readCatalog(request = {}) {
      await registry.refreshPersistentState?.();
      const kind = request.kind ?? 'all';
      const limit = normalizeLimit(request.limit);
      const status = registry.readStatus({
        provider: request.provider ?? null,
        runtimeProfileId: request.runtimeProfileId ?? null,
      });
      const entries: AccountMirrorCatalogEntry[] = [];
      for (const target of status.entries) {
        const catalog = await persistence.readCatalog({
          provider: target.provider,
          boundIdentityKey: target.expectedIdentityKey,
          limit,
        });
        const manifests = filterCatalogKind(catalog ?? {
          projects: [],
          conversations: [],
          artifacts: [],
          files: [],
          media: [],
        }, kind);
        entries.push({
          provider: target.provider,
          runtimeProfileId: target.runtimeProfileId,
          browserProfileId: target.browserProfileId,
          boundIdentityKey: target.expectedIdentityKey,
          status: target.status,
          reason: target.reason,
          mirrorCompleteness: target.mirrorCompleteness,
          manifests,
          counts: {
            projects: manifests.projects.length,
            conversations: manifests.conversations.length,
            artifacts: manifests.artifacts.length,
            files: manifests.files.length,
            media: manifests.media.length,
          },
        });
      }
      const metrics = entries.reduce<AccountMirrorCatalogResult['metrics']>(
        (acc, entry) => {
          acc.targets += 1;
          acc.projects += entry.counts.projects;
          acc.conversations += entry.counts.conversations;
          acc.artifacts += entry.counts.artifacts;
          acc.files += entry.counts.files;
          acc.media += entry.counts.media;
          return acc;
        },
        { targets: 0, projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 },
      );
      return {
        object: 'account_mirror_catalog',
        generatedAt: now().toISOString(),
        kind,
        limit,
        entries,
        metrics,
      };
    },
    async readItem(request) {
      const catalog = await this.readCatalog({
        provider: request.provider ?? null,
        runtimeProfileId: request.runtimeProfileId ?? null,
        kind: request.kind ?? 'all',
        limit: request.limit ?? 500,
      });
      const requestedId = request.itemId.trim();
      for (const entry of catalog.entries) {
        for (const kind of catalogKindsForItemLookup(request.kind ?? 'all')) {
          const items = entry.manifests[kind];
          for (const item of items) {
            const itemId = readCatalogItemId(item);
            if (itemId === requestedId) {
              return {
                object: 'account_mirror_catalog_item',
                generatedAt: now().toISOString(),
                provider: entry.provider,
                runtimeProfileId: entry.runtimeProfileId,
                browserProfileId: entry.browserProfileId,
                boundIdentityKey: entry.boundIdentityKey,
                status: entry.status,
                reason: entry.reason,
                kind,
                itemId,
                item,
              };
            }
          }
        }
      }
      return null;
    },
  };
}

function catalogKindsForItemLookup(kind: AccountMirrorCatalogKind): Array<Exclude<AccountMirrorCatalogKind, 'all'>> {
  if (kind === 'all') return ['projects', 'conversations', 'artifacts', 'files', 'media'];
  return [kind];
}

function readCatalogItemId(item: unknown): string {
  return readCatalogStringField(item, ['id', 'conversationId', 'projectId', 'artifactId', 'fileId', 'mediaId', 'url', 'href'])
    ?? 'unknown';
}

function readCatalogStringField(item: unknown, fields: string[]): string | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function filterCatalogKind(
  manifests: AccountMirrorCatalogEntry['manifests'],
  kind: AccountMirrorCatalogKind,
): AccountMirrorCatalogEntry['manifests'] {
  if (kind === 'all') return manifests;
  return {
    projects: kind === 'projects' ? manifests.projects : [],
    conversations: kind === 'conversations' ? manifests.conversations : [],
    artifacts: kind === 'artifacts' ? manifests.artifacts : [],
    files: kind === 'files' ? manifests.files : [],
    media: kind === 'media' ? manifests.media : [],
  };
}

function normalizeLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(500, Math.floor(value)));
}
