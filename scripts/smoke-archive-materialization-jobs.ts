#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AccountMirrorCatalogResult, AccountMirrorCatalogService } from '../src/accountMirror/catalogService.js';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import {
  listApiRunArchiveMaterializationJobsForCli,
  readApiRunArchiveMaterializationJobForCli,
} from '../src/cli/apiRunArchiveCommand.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
import {
  createRunArchiveMaterializationJobToolHandler,
  createRunArchiveMaterializationJobsToolHandler,
} from '../src/mcp/tools/runArchive.js';
import {
  createArchiveMaterializationJobService,
  type ArchiveMaterializationJob,
  type ArchiveMaterializationJobService,
  type ArchiveMaterializationJobStatus,
} from '../src/runtime/archiveMaterializationJobService.js';
import type { RunArchiveItem, RunArchiveListRequest, RunArchiveListResult, RunArchiveService } from '../src/runtime/archiveService.js';

const ids = ['ramj_smoke_queued', 'ramj_smoke_succeeded', 'ramj_smoke_skipped', 'ramj_smoke_failed'];
const itemIds = {
  queued: 'generated-artifact:smoke-response:artifact-queued',
  succeeded: 'generated-artifact:smoke-response:artifact-succeeded',
  skipped: 'generated-artifact:smoke-response:artifact-skipped',
  failed: 'generated-artifact:smoke-response:artifact-failed',
} as const;

async function main(): Promise<void> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialization-jobs-smoke-'));
  setAuracallHomeDirOverrideForTest(homeDir);
  try {
    const archiveItems = createFixtureArchiveItems();
    const service = createFixtureJobService(archiveItems);
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        accountMirrorCatalogService: createEmptyAccountMirrorCatalogService(),
        archiveMaterializationJobService: service,
        runArchiveService: createFixtureRunArchiveService(archiveItems),
      },
    );
    try {
      await assertSearchAssetReconciliationBefore(server.port);
      await seedJobs(service);
      await assertSearchAssetReconciliationAfter(server.port);
      await assertHttpFilters(server.port);
      await assertCliFilters(server.port);
      await assertMcpFilters(service);
      console.log(JSON.stringify({
        ok: true,
        fixtureHome: homeDir,
        checks: {
          http: 'archive-materialization-job-filters',
          cli: 'archive-materialization-job-filters',
          mcp: 'archive-materialization-job-filters',
          search: 'materialization-asset-reconciliation',
        },
        jobs: ids,
      }, null, 2));
    } finally {
      await server.close();
    }
  } finally {
    setAuracallHomeDirOverrideForTest(null);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => {});
  }
}

function createFixtureJobService(archiveItems: Map<string, RunArchiveItem>): ArchiveMaterializationJobService {
  return createArchiveMaterializationJobService({
    materializationService: {
      materializeItem: async (request) => {
        if (request.archiveItemId === itemIds.failed) {
          throw new Error('fixture materialization failed');
        }
        const materializedItem = request.archiveItemId === itemIds.skipped
          ? createFixtureArchiveItem(request.archiveItemId)
          : createMaterializedFixtureArchiveItem(request.archiveItemId);
        archiveItems.set(request.archiveItemId, materializedItem);
        return {
          object: 'run_archive_item_materialization',
          generatedAt: '2026-05-22T12:00:00.000Z',
          status: request.archiveItemId === itemIds.skipped ? 'skipped' : 'already_materialized',
          item: materializedItem,
          file: materializedItem.fileAvailable ? {
            id: materializedItem.artifactId ?? materializedItem.id,
            name: materializedItem.fileName ?? 'materialized-artifact.json',
            localPath: materializedItem.localPath ?? '/tmp/materialized-artifact.json',
            remoteUrl: null,
            mimeType: materializedItem.mimeType ?? 'application/json',
            size: 42,
          } : null,
          message: request.archiveItemId === itemIds.skipped
            ? 'Fixture materializer skipped this archive item.'
            : 'Fixture archive item already has a readable local asset.',
        };
      },
    },
    generateId: sequenceId(ids),
    now: sequenceNow([
      '2026-05-22T12:00:00.000Z',
      '2026-05-22T12:00:01.000Z',
      '2026-05-22T12:00:02.000Z',
      '2026-05-22T12:00:03.000Z',
      '2026-05-22T12:00:04.000Z',
      '2026-05-22T12:00:05.000Z',
      '2026-05-22T12:00:06.000Z',
      '2026-05-22T12:00:07.000Z',
      '2026-05-22T12:00:08.000Z',
      '2026-05-22T12:00:09.000Z',
      '2026-05-22T12:00:10.000Z',
      '2026-05-22T12:00:11.000Z',
    ]),
    schedule: () => {},
  });
}

function createFixtureArchiveItems(): Map<string, RunArchiveItem> {
  return new Map(Object.values(itemIds).map((id) => [id, createFixtureArchiveItem(id)]));
}

function createFixtureArchiveItem(id: string): RunArchiveItem {
  return {
    object: 'run_archive_item',
    id,
    kind: 'generated_artifact',
    source: 'runtime',
    createdAt: '2026-05-22T12:00:00.000Z',
    updatedAt: '2026-05-22T12:00:00.000Z',
    title: id,
    status: 'succeeded',
    runtimeState: 'terminal',
    provider: 'chatgpt',
    runtimeProfile: 'default',
    browserProfile: 'default',
    projectId: 'proj_smoke',
    boundIdentityKey: 'smoke@example.test',
    agentId: 'agent_smoke',
    teamId: null,
    responseId: 'resp_smoke',
    batchId: null,
    batchIndex: null,
    mediaGenerationId: null,
    providerConversationId: 'conv_smoke',
    providerConversationUrl: 'https://chatgpt.com/c/conv_smoke',
    artifactId: id.split(':').at(-1) ?? id,
    fileName: null,
    mimeType: null,
    localPath: null,
    uri: null,
    cacheKey: null,
    checksumSha256: null,
    fileAvailable: false,
    metadata: {},
    links: {},
  };
}

function createMaterializedFixtureArchiveItem(id: string): RunArchiveItem {
  return {
    ...createFixtureArchiveItem(id),
    updatedAt: '2026-05-22T12:00:11.000Z',
    fileName: 'materialized-artifact.json',
    mimeType: 'application/json',
    localPath: `/tmp/auracall-smoke/${id.split(':').at(-1) ?? 'artifact'}.json`,
    cacheKey: `sha256:${id.split(':').at(-1) ?? 'artifact'}`,
    checksumSha256: id.split(':').at(-1) ?? 'artifact',
    fileAvailable: true,
    metadata: {
      materialization: {
        status: 'succeeded',
      },
    },
    links: {
      asset: `/v1/archive/items/b64/${Buffer.from(id, 'utf8').toString('base64url')}/asset`,
    },
  };
}

function createFixtureRunArchiveService(archiveItems: Map<string, RunArchiveItem>): RunArchiveService {
  return {
    listItems: async (request: RunArchiveListRequest = {}): Promise<RunArchiveListResult> => {
      const items = [...archiveItems.values()]
        .filter((item) => !request.kind || request.kind === 'all' || item.kind === request.kind)
        .filter((item) => !request.query || item.id.includes(request.query) || String(item.title ?? '').includes(request.query))
        .filter((item) => typeof request.fileAvailable !== 'boolean' || item.fileAvailable === request.fileAvailable)
        .filter((item) => {
          if (!request.assetAvailability) return true;
          const availability = item.fileAvailable === true ? 'available' : item.fileAvailable === false ? 'unavailable' : 'pending';
          return availability === request.assetAvailability;
        });
      return {
        object: 'run_archive',
        generatedAt: '2026-05-22T12:00:12.000Z',
        kind: request.kind ?? 'all',
        limit: request.limit ?? 500,
        items,
        metrics: {
          total: items.length,
          byKind: {
            response: 0,
            response_batch: 0,
            team_run: 0,
            media_generation: 0,
            upload: 0,
            generated_artifact: items.filter((item) => item.kind === 'generated_artifact').length,
            provider_conversation: 0,
            evidence: 0,
          },
        },
      };
    },
    readItem: async () => null,
    readAsset: async () => null,
    lookupAsset: async () => ({
      object: 'run_archive_asset_lookup',
      generatedAt: '2026-05-22T12:00:12.000Z',
      query: {
        checksumSha256: null,
        cacheKey: null,
        providerArtifactId: null,
        artifactId: null,
      },
      canonicalItem: null,
      items: [],
      metrics: {
        total: 0,
        fileAvailable: 0,
        duplicateCacheKeys: [],
      },
    }),
    attachEvidence: async () => {
      throw new Error('not used');
    },
    upsertResponseItems: async () => {
      throw new Error('not used');
    },
    upsertBatchItems: async () => {
      throw new Error('not used');
    },
    upsertMediaGenerationItems: async () => {
      throw new Error('not used');
    },
    backfillIndex: async () => {
      throw new Error('not used');
    },
  };
}

function createEmptyAccountMirrorCatalogService(): AccountMirrorCatalogService {
  return {
    readCatalog: async (): Promise<AccountMirrorCatalogResult> => ({
      object: 'account_mirror_catalog',
      generatedAt: '2026-05-22T12:00:12.000Z',
      kind: 'all',
      limit: 500,
      entries: [],
      metrics: { targets: 0, projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 },
    }),
    readItem: async () => null,
  };
}

async function seedJobs(service: ArchiveMaterializationJobService): Promise<void> {
  await service.createJob({ archiveItemId: itemIds.queued });
  await service.createJob({ archiveItemId: itemIds.succeeded });
  await service.createJob({ archiveItemId: itemIds.skipped });
  await service.createJob({ archiveItemId: itemIds.failed });
  await service.runJob(ids[1]!);
  await service.runJob(ids[2]!);
  await service.runJob(ids[3]!);
}

async function assertSearchAssetReconciliationBefore(port: number): Promise<void> {
  const search = await fetchJson<SearchResultsPayload>(
    `http://127.0.0.1:${port}/v1/search?kind=artifact&limit=10`,
  );
  assertSearchFacet(search, 'assetAvailability', 'unavailable', 4, 'Search before materialization unavailable facet');
  assertSearchFacet(search, 'assetAvailability', 'available', 0, 'Search before materialization available facet');
  const available = await fetchJson<SearchResultsPayload>(
    `http://127.0.0.1:${port}/v1/search?kind=artifact&assetAvailability=available&limit=10`,
  );
  assertSearchRows(available, [], 'Search before materialization available rows');
}

async function assertSearchAssetReconciliationAfter(port: number): Promise<void> {
  const search = await fetchJson<SearchResultsPayload>(
    `http://127.0.0.1:${port}/v1/search?kind=artifact&limit=10`,
  );
  assertSearchFacet(search, 'assetAvailability', 'available', 1, 'Search after materialization available facet');
  assertSearchFacet(search, 'assetAvailability', 'unavailable', 3, 'Search after materialization unavailable facet');
  assertSearchFacet(search, 'materialization', 'succeeded', 1, 'Search after materialization succeeded facet');

  const available = await fetchJson<SearchResultsPayload>(
    `http://127.0.0.1:${port}/v1/search?kind=artifact&assetAvailability=available&limit=10`,
  );
  assertSearchRows(available, [itemIds.succeeded], 'Search after materialization available rows');

  const succeeded = await fetchJson<SearchResultsPayload>(
    `http://127.0.0.1:${port}/v1/search?kind=artifact&materialization=succeeded&limit=10`,
  );
  assertSearchRows(succeeded, [itemIds.succeeded], 'Search after materialization succeeded rows');
}

async function assertHttpFilters(port: number): Promise<void> {
  const active = await fetchJson<MaterializationJobsPayload>(
    `http://127.0.0.1:${port}/v1/archive/materializations?status=active&limit=5`,
  );
  assertJobIds(active, ['ramj_smoke_queued'], 'HTTP active jobs');
  assertMetrics(active, { total: 1, active: 1, terminal: 0 }, 'HTTP active metrics');

  const terminal = await fetchJson<MaterializationJobsPayload>(
    `http://127.0.0.1:${port}/v1/archive/materializations?status=terminal&limit=10`,
  );
  assertJobIds(terminal, ['ramj_smoke_failed', 'ramj_smoke_skipped', 'ramj_smoke_succeeded'], 'HTTP terminal jobs');
  assertMetrics(terminal, { total: 3, active: 0, terminal: 3 }, 'HTTP terminal metrics');

  const byItem = await fetchJson<MaterializationJobsPayload>(
    `http://127.0.0.1:${port}/v1/archive/materializations?archiveItemId=${encodeURIComponent(itemIds.skipped)}&limit=1`,
  );
  assertJobIds(byItem, ['ramj_smoke_skipped'], 'HTTP archive-item jobs');
  assertStatus(byItem.jobs[0], 'skipped', 'HTTP archive-item status');

  const failed = await fetchJson<ArchiveMaterializationJob>(
    `http://127.0.0.1:${port}/v1/archive/materializations/ramj_smoke_failed`,
  );
  assertStatus(failed, 'failed', 'HTTP read failed job');
}

async function assertCliFilters(port: number): Promise<void> {
  const terminal = await listApiRunArchiveMaterializationJobsForCli({
    port,
    status: 'terminal',
    limit: 2,
  }) as MaterializationJobsPayload;
  assertJobIds(terminal, ['ramj_smoke_failed', 'ramj_smoke_skipped'], 'CLI terminal jobs limit');
  assertMetrics(terminal, { total: 3, active: 0, terminal: 3 }, 'CLI terminal metrics');

  const byItem = await listApiRunArchiveMaterializationJobsForCli({
    port,
    archiveItemId: itemIds.succeeded,
    limit: 5,
  }) as MaterializationJobsPayload;
  assertJobIds(byItem, ['ramj_smoke_succeeded'], 'CLI archive-item jobs');

  const queued = await readApiRunArchiveMaterializationJobForCli({
    port,
    id: 'ramj_smoke_queued',
  }) as ArchiveMaterializationJob;
  assertStatus(queued, 'queued', 'CLI read queued job');
}

async function assertMcpFilters(service: ArchiveMaterializationJobService): Promise<void> {
  const list = createRunArchiveMaterializationJobsToolHandler({ service });
  const read = createRunArchiveMaterializationJobToolHandler({ service });

  const active = await list({ status: 'active', limit: 5 });
  const activePayload = active.structuredContent as MaterializationJobsPayload;
  assertJobIds(activePayload, ['ramj_smoke_queued'], 'MCP active jobs');
  assertMetrics(activePayload, { total: 1, active: 1, terminal: 0 }, 'MCP active metrics');

  const skipped = await list({ status: 'skipped', archiveItemId: itemIds.skipped, limit: 5 });
  const skippedPayload = skipped.structuredContent as MaterializationJobsPayload;
  assertJobIds(skippedPayload, ['ramj_smoke_skipped'], 'MCP skipped archive-item jobs');

  const failed = await read({ id: 'ramj_smoke_failed' });
  assertStatus(failed.structuredContent as ArchiveMaterializationJob, 'failed', 'MCP read failed job');
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json() as T;
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

interface MaterializationJobsPayload {
  object: 'run_archive_materialization_jobs';
  jobs: ArchiveMaterializationJob[];
  metrics: {
    total: number;
    active: number;
    terminal: number;
  };
}

interface SearchResultsPayload {
  object: 'search_results';
  rows: Array<{
    itemId?: string | null;
    metadata?: {
      fileAvailable?: boolean;
      materializationStatus?: string | null;
    };
  }>;
  facets?: {
    assetAvailability?: Array<{ value: string; count: number }>;
    materialization?: Array<{ value: string; count: number }>;
  };
}

function assertSearchRows(payload: SearchResultsPayload, expectedItemIds: string[], label: string): void {
  const actual = payload.rows.map((row) => row.itemId).filter((itemId): itemId is string => typeof itemId === 'string');
  if (JSON.stringify(actual) !== JSON.stringify(expectedItemIds)) {
    throw new Error(`${label}: expected ${JSON.stringify(expectedItemIds)}, got ${JSON.stringify(actual)}.`);
  }
}

function assertSearchFacet(
  payload: SearchResultsPayload,
  facetName: 'assetAvailability' | 'materialization',
  value: string,
  expectedCount: number,
  label: string,
): void {
  const actual = payload.facets?.[facetName]?.find((facet) => facet.value === value)?.count ?? 0;
  if (actual !== expectedCount) {
    throw new Error(`${label}: expected ${value}=${expectedCount}, got ${actual}.`);
  }
}

function assertJobIds(payload: MaterializationJobsPayload, expected: string[], label: string): void {
  const actual = payload.jobs.map((job) => job.id);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function assertMetrics(
  payload: MaterializationJobsPayload,
  expected: { total: number; active: number; terminal: number },
  label: string,
): void {
  if (
    payload.metrics.total !== expected.total
    || payload.metrics.active !== expected.active
    || payload.metrics.terminal !== expected.terminal
  ) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(payload.metrics)}.`);
  }
}

function assertStatus(
  job: ArchiveMaterializationJob | undefined,
  expected: ArchiveMaterializationJobStatus,
  label: string,
): void {
  if (job?.status !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${String(job?.status)}.`);
  }
}

function sequenceId(values: string[]): () => string {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

function sequenceNow(values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]!);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
