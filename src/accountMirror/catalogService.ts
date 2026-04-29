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

export interface AccountMirrorCatalogService {
  readCatalog(request?: AccountMirrorCatalogRequest): Promise<AccountMirrorCatalogResult>;
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
  };
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
