import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  createExecutionResponseForStoredRecord,
} from './responsesService.js';
import {
  createExecutionRunRecordStore,
  type ExecutionRunRecordStore,
  type ExecutionRunStoredRecord,
} from './store.js';
import {
  createResponseBatchStore,
  type ResponseBatchRecord,
  type ResponseBatchStore,
} from './responseBatchService.js';
import {
  createMediaGenerationRecordStore,
  type MediaGenerationRecordStore,
} from '../media/store.js';
import type { MediaGenerationStoredRecord } from '../media/types.js';
import type { ExecutionResponseOutputItem } from './apiTypes.js';
import type { ExecutionRunServiceId, ExecutionRunStep } from './types.js';
import {
  createRunArchiveIndexStore,
  type RunArchiveIndexRecord,
  type RunArchiveIndexStore,
} from './archiveIndexStore.js';
import {
  createRunArchiveEvidenceStore,
  type CreateRunArchiveEvidenceInput,
  type RunArchiveEvidenceRecord,
  type RunArchiveEvidenceStore,
} from './archiveEvidenceStore.js';

export type RunArchiveItemKind =
  | 'response'
  | 'response_batch'
  | 'team_run'
  | 'media_generation'
  | 'upload'
  | 'generated_artifact'
  | 'provider_conversation'
  | 'evidence';

export interface RunArchiveListRequest {
  kind?: RunArchiveItemKind | 'all' | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  projectId?: string | null;
  agent?: string | null;
  team?: string | null;
  responseId?: string | null;
  batchId?: string | null;
  status?: string | null;
  query?: string | null;
  limit?: number | null;
}

export interface RunArchiveAssetLookupRequest {
  checksumSha256?: string | null;
  cacheKey?: string | null;
  providerArtifactId?: string | null;
  artifactId?: string | null;
  limit?: number | null;
}

export interface RunArchiveItem {
  id: string;
  object: 'run_archive_item';
  kind: RunArchiveItemKind;
  source: 'runtime' | 'response_batch' | 'media_generation' | 'evidence';
  createdAt: string;
  updatedAt: string;
  title: string | null;
  status: string | null;
  provider: string | null;
  runtimeProfile: string | null;
  browserProfile: string | null;
  projectId: string | null;
  boundIdentityKey: string | null;
  agentId: string | null;
  teamId: string | null;
  responseId: string | null;
  batchId: string | null;
  batchIndex: number | null;
  mediaGenerationId: string | null;
  providerConversationId: string | null;
  providerConversationUrl: string | null;
  artifactId: string | null;
  fileName: string | null;
  mimeType: string | null;
  localPath: string | null;
  uri: string | null;
  cacheKey: string | null;
  checksumSha256: string | null;
  fileAvailable: boolean | null;
  metadata: Record<string, unknown>;
  links: Record<string, string>;
}

export interface RunArchiveListResult {
  object: 'run_archive';
  generatedAt: string;
  kind: RunArchiveItemKind | 'all';
  limit: number;
  items: RunArchiveItem[];
  metrics: {
    total: number;
    byKind: Record<RunArchiveItemKind, number>;
  };
}

export interface RunArchiveItemResult {
  object: 'run_archive_item_detail';
  generatedAt: string;
  item: RunArchiveItem;
}

export interface RunArchiveAssetResult {
  object: 'run_archive_asset';
  generatedAt: string;
  item: RunArchiveItem;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface RunArchiveAssetLookupResult {
  object: 'run_archive_asset_lookup';
  generatedAt: string;
  query: {
    checksumSha256: string | null;
    cacheKey: string | null;
    providerArtifactId: string | null;
    artifactId: string | null;
  };
  canonicalItem: RunArchiveItem | null;
  items: RunArchiveItem[];
  metrics: {
    total: number;
    fileAvailable: number;
    duplicateCacheKeys: string[];
  };
}

export interface RunArchiveBackfillResult {
  object: 'run_archive_backfill';
  generatedAt: string;
  index: {
    updatedAt: string;
    itemCount: number;
  };
  metrics: {
    byKind: Record<RunArchiveItemKind, number>;
  };
}

export interface RunArchiveEvidenceResult {
  object: 'run_archive_evidence_result';
  generatedAt: string;
  evidence: RunArchiveEvidenceRecord;
  item: RunArchiveItem;
}

export interface RunArchiveService {
  listItems(request?: RunArchiveListRequest): Promise<RunArchiveListResult>;
  readItem(id: string): Promise<RunArchiveItemResult | null>;
  readAsset(id: string): Promise<RunArchiveAssetResult | null>;
  lookupAsset(request: RunArchiveAssetLookupRequest): Promise<RunArchiveAssetLookupResult>;
  attachEvidence(input: CreateRunArchiveEvidenceInput): Promise<RunArchiveEvidenceResult>;
  upsertResponseItems(responseId: string): Promise<RunArchiveBackfillResult>;
  upsertBatchItems(batchId: string): Promise<RunArchiveBackfillResult>;
  upsertMediaGenerationItems(mediaGenerationId: string): Promise<RunArchiveBackfillResult>;
  backfillIndex(): Promise<RunArchiveBackfillResult>;
}

export interface RunArchiveServiceDeps {
  runStore?: ExecutionRunRecordStore;
  batchStore?: ResponseBatchStore;
  mediaStore?: MediaGenerationRecordStore;
  indexStore?: RunArchiveIndexStore;
  evidenceStore?: RunArchiveEvidenceStore;
  now?: () => Date;
}

const DEFAULT_LIMIT = 50;

export function createRunArchiveService(deps: RunArchiveServiceDeps = {}): RunArchiveService {
  const runStore = deps.runStore ?? createExecutionRunRecordStore();
  const batchStore = deps.batchStore ?? createResponseBatchStore();
  const mediaStore = deps.mediaStore ?? createMediaGenerationRecordStore();
  const indexStore = deps.indexStore ?? createRunArchiveIndexStore();
  const evidenceStore = deps.evidenceStore ?? createRunArchiveEvidenceStore();
  const now = deps.now ?? (() => new Date());
  async function readIndexedItems(): Promise<RunArchiveItem[]> {
    const index = await indexStore.readIndex();
    if (index) return index.items;
    return backfillIndexItems({
      runStore,
      batchStore,
      mediaStore,
      evidenceStore,
      indexStore,
      updatedAt: now().toISOString(),
    }).then((record) => record.items);
  }
  return {
    async listItems(request = {}) {
      const kind = normalizeKind(request.kind);
      const limit = normalizeLimit(request.limit);
      const items = (await readIndexedItems())
        .filter((item) => matchesRequest(item, { ...request, kind }))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const limited = items.slice(0, limit);
      return {
        object: 'run_archive',
        generatedAt: now().toISOString(),
        kind,
        limit,
        items: limited,
        metrics: {
          total: items.length,
          byKind: countByKind(items),
        },
      };
    },
    async readItem(id) {
      const item = await indexStore.readItem(id) ?? (await readIndexedItems()).find((entry) => entry.id === id) ?? null;
      if (!item) return null;
      return {
        object: 'run_archive_item_detail',
        generatedAt: now().toISOString(),
        item,
      };
    },
    async readAsset(id) {
      const item = await indexStore.readItem(id) ?? (await readIndexedItems()).find((entry) => entry.id === id) ?? null;
      if (!item?.localPath) return null;
      const stat = await fs.stat(item.localPath).catch(() => null);
      if (!stat?.isFile()) return null;
      return {
        object: 'run_archive_asset',
        generatedAt: now().toISOString(),
        item,
        path: item.localPath,
        fileName: item.fileName ?? item.title ?? item.artifactId ?? item.id,
        mimeType: item.mimeType ?? inferArchiveAssetMimeType(item.fileName ?? item.title ?? item.localPath),
        size: stat.size,
      };
    },
    async lookupAsset(request) {
      const query = normalizeAssetLookupRequest(request);
      const limit = normalizeLimit(request.limit);
      const items = (await readIndexedItems())
        .filter((item) => matchesAssetLookupRequest(item, query))
        .sort(compareAssetLookupItems);
      const limited = items.slice(0, limit);
      const canonicalItem = limited.find((item) => item.fileAvailable === true && Boolean(item.localPath)) ?? limited[0] ?? null;
      const duplicateCacheKeys = Array.from(new Set(
        limited
          .map((item) => item.cacheKey)
          .filter((cacheKey): cacheKey is string => typeof cacheKey === 'string' && cacheKey.length > 0),
      )).filter((cacheKey) => limited.filter((item) => item.cacheKey === cacheKey).length > 1);
      return {
        object: 'run_archive_asset_lookup',
        generatedAt: now().toISOString(),
        query,
        canonicalItem,
        items: limited,
        metrics: {
          total: items.length,
          fileAvailable: items.filter((item) => item.fileAvailable === true).length,
          duplicateCacheKeys,
        },
      };
    },
    async attachEvidence(input) {
      const timestamp = now().toISOString();
      const evidence = await evidenceStore.createEvidence({
        ...input,
        createdAt: input.createdAt ?? timestamp,
        updatedAt: input.updatedAt ?? input.createdAt ?? timestamp,
      });
      const item = buildEvidenceArchiveItem(evidence);
      await ensureArchiveIndex({
        runStore,
        batchStore,
        mediaStore,
        evidenceStore,
        indexStore,
        updatedAt: timestamp,
      });
      await indexStore.upsertItems([item], {
        updatedAt: timestamp,
      });
      return {
        object: 'run_archive_evidence_result',
        generatedAt: timestamp,
        evidence,
        item,
      };
    },
    async upsertResponseItems(responseId) {
      const timestamp = now().toISOString();
      const record = await runStore.readRecord(responseId);
      const items = record ? await enrichFileMetadata(await buildRunArchiveItems([record])) : [];
      const index = await upsertArchiveItems({
        runStore,
        batchStore,
        mediaStore,
        evidenceStore,
        indexStore,
        updatedAt: timestamp,
        items,
        removeExisting: (item) => item.source === 'runtime' && item.responseId === responseId,
      });
      return toBackfillResult(index, timestamp);
    },
    async upsertBatchItems(batchId) {
      const timestamp = now().toISOString();
      const record = await batchStore.readBatch(batchId);
      const items = record ? buildBatchArchiveItems([record]) : [];
      const index = await upsertArchiveItems({
        runStore,
        batchStore,
        mediaStore,
        evidenceStore,
        indexStore,
        updatedAt: timestamp,
        items,
        removeExisting: (item) => item.batchId === batchId && item.kind === 'response_batch',
      });
      return toBackfillResult(index, timestamp);
    },
    async upsertMediaGenerationItems(mediaGenerationId) {
      const timestamp = now().toISOString();
      const record = await mediaStore.readRecord(mediaGenerationId);
      const items = record ? await enrichFileMetadata(buildMediaArchiveItems([record])) : [];
      const index = await upsertArchiveItems({
        runStore,
        batchStore,
        mediaStore,
        evidenceStore,
        indexStore,
        updatedAt: timestamp,
        items,
        removeExisting: (item) => item.source === 'media_generation' && item.mediaGenerationId === mediaGenerationId,
      });
      return toBackfillResult(index, timestamp);
    },
    async backfillIndex() {
      const index = await backfillIndexItems({
        runStore,
        batchStore,
        mediaStore,
        evidenceStore,
        indexStore,
        updatedAt: now().toISOString(),
      });
      return {
        object: 'run_archive_backfill',
        generatedAt: now().toISOString(),
        index: {
          updatedAt: index.updatedAt,
          itemCount: index.itemCount,
        },
        metrics: {
          byKind: countByKind(index.items),
        },
      };
    },
  };
}

function inferArchiveAssetMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown; charset=utf-8';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function backfillIndexItems(input: {
  runStore: ExecutionRunRecordStore;
  batchStore: ResponseBatchStore;
  mediaStore: MediaGenerationRecordStore;
  evidenceStore: RunArchiveEvidenceStore;
  indexStore: RunArchiveIndexStore;
  updatedAt: string;
}): Promise<RunArchiveIndexRecord> {
  const items = await collectArchiveItems(input);
  return input.indexStore.writeIndex(items, { updatedAt: input.updatedAt });
}

async function ensureArchiveIndex(input: {
  runStore: ExecutionRunRecordStore;
  batchStore: ResponseBatchStore;
  mediaStore: MediaGenerationRecordStore;
  evidenceStore: RunArchiveEvidenceStore;
  indexStore: RunArchiveIndexStore;
  updatedAt: string;
}): Promise<void> {
  if (await input.indexStore.readIndex()) return;
  await backfillIndexItems(input);
}

async function upsertArchiveItems(input: {
  runStore: ExecutionRunRecordStore;
  batchStore: ResponseBatchStore;
  mediaStore: MediaGenerationRecordStore;
  evidenceStore: RunArchiveEvidenceStore;
  indexStore: RunArchiveIndexStore;
  updatedAt: string;
  items: RunArchiveItem[];
  removeExisting: (item: RunArchiveItem) => boolean;
}): Promise<RunArchiveIndexRecord> {
  await ensureArchiveIndex(input);
  return input.indexStore.upsertItems(input.items, {
    updatedAt: input.updatedAt,
    removeExisting: input.removeExisting,
  });
}

function toBackfillResult(index: RunArchiveIndexRecord, generatedAt: string): RunArchiveBackfillResult {
  return {
    object: 'run_archive_backfill',
    generatedAt,
    index: {
      updatedAt: index.updatedAt,
      itemCount: index.itemCount,
    },
    metrics: {
      byKind: countByKind(index.items),
    },
  };
}

async function collectArchiveItems(deps: {
  runStore: ExecutionRunRecordStore;
  batchStore: ResponseBatchStore;
  mediaStore: MediaGenerationRecordStore;
  evidenceStore?: RunArchiveEvidenceStore;
}): Promise<RunArchiveItem[]> {
  const [runRecords, batchRecords, mediaRecords, evidenceRecords] = await Promise.all([
    deps.runStore.listBundles().then((bundles) => bundles.map((bundle) => ({
      runId: bundle.run.id,
      revision: 0,
      persistedAt: bundle.run.updatedAt,
      bundle,
    } satisfies ExecutionRunStoredRecord))),
    listBatches(deps.batchStore),
    deps.mediaStore.listRecords({ limit: null }),
    (deps.evidenceStore ?? createRunArchiveEvidenceStore()).listEvidence(),
  ]);
  return enrichFileMetadata([
    ...(await buildRunArchiveItems(runRecords)),
    ...buildBatchArchiveItems(batchRecords),
    ...buildMediaArchiveItems(mediaRecords),
    ...evidenceRecords.map(buildEvidenceArchiveItem),
  ]);
}

function listBatches(store: ResponseBatchStore): Promise<ResponseBatchRecord[]> {
  return store.listBatches
    ? store.listBatches({ limit: null })
    : createResponseBatchStore().listBatches?.({ limit: null }) ?? Promise.resolve([]);
}

async function buildRunArchiveItems(records: ExecutionRunStoredRecord[]): Promise<RunArchiveItem[]> {
  const items: RunArchiveItem[] = [];
  for (const record of records) {
    const response = await createExecutionResponseForStoredRecord(record.bundle);
    const firstStep = record.bundle.steps.slice().sort((left, right) => left.order - right.order)[0] ?? null;
    const base = createBaseRunItem(record, firstStep);
    const batch = readBatchMetadata(record);
    const responseKind: RunArchiveItemKind = record.bundle.run.sourceKind === 'team-run' ? 'team_run' : 'response';
    items.push({
      ...base,
      id: `${responseKind}:${record.runId}`,
      kind: responseKind,
      title: record.bundle.run.entryPrompt,
      responseId: record.runId,
      batchId: batch.batchId,
      batchIndex: batch.batchIndex,
      metadata: {
        sourceKind: record.bundle.run.sourceKind,
        outputItemCount: response.output.length,
        stepCount: record.bundle.steps.length,
        requestedOutputCount: response.metadata?.executionSummary?.requestedOutputSummary?.total ?? 0,
      },
      links: {
        response: `/v1/responses/${encodeURIComponent(record.runId)}`,
        runtimeRun: `/v1/runtime-runs/inspect?runtimeRunId=${encodeURIComponent(record.runId)}`,
      },
    });

    for (const artifact of listInputArtifacts(record.bundle.steps)) {
      items.push({
        ...base,
        id: `upload:${record.runId}:${artifact.stepId}:${artifact.id}`,
        kind: 'upload',
        title: artifact.title,
        responseId: record.runId,
        batchId: batch.batchId,
        batchIndex: batch.batchIndex,
        artifactId: artifact.id,
        fileName: artifact.title,
        localPath: artifact.path,
        uri: artifact.uri,
        metadata: {
          stepId: artifact.stepId,
          artifactKind: artifact.kind,
          ...(artifact.metadata ?? {}),
        },
        links: {
          response: `/v1/responses/${encodeURIComponent(record.runId)}`,
        },
      });
    }

    for (const artifact of response.output.filter(isArtifactOutput)) {
      items.push({
        ...base,
        id: `generated-artifact:${record.runId}:${artifact.id}`,
        kind: 'generated_artifact',
        title: artifact.title ?? artifact.id,
        responseId: record.runId,
        batchId: batch.batchId,
        batchIndex: batch.batchIndex,
        artifactId: artifact.id,
        fileName: readMetadataString(artifact.metadata, ['fileName', 'name']) ?? artifact.title ?? null,
        mimeType: artifact.mime_type ?? null,
        localPath: readMetadataString(artifact.metadata, ['localPath', 'path']),
        uri: artifact.uri ?? null,
        metadata: {
          artifactType: artifact.artifact_type,
          disposition: artifact.disposition ?? null,
          ...(artifact.metadata ?? {}),
        },
        links: {
          response: `/v1/responses/${encodeURIComponent(record.runId)}`,
        },
      });
    }

    for (const ref of listProviderConversationRefs(record)) {
      items.push({
        ...base,
        id: `provider-conversation:${record.runId}:${ref.provider}:${ref.conversationId}`,
        kind: 'provider_conversation',
        title: ref.conversationId,
        provider: ref.provider,
        runtimeProfile: ref.runtimeProfileId,
        browserProfile: ref.browserProfileId,
        projectId: ref.projectId,
        boundIdentityKey: ref.boundIdentityKey,
        responseId: record.runId,
        batchId: batch.batchId,
        batchIndex: batch.batchIndex,
        providerConversationId: ref.conversationId,
        providerConversationUrl: ref.url,
        metadata: {
          stepId: ref.stepId,
        },
        links: {
          response: `/v1/responses/${encodeURIComponent(record.runId)}`,
          catalogItem: buildCatalogItemPath(ref),
        },
      });
    }
  }
  return items;
}

function buildBatchArchiveItems(records: ResponseBatchRecord[]): RunArchiveItem[] {
  return records.map((record) => ({
    id: `response-batch:${record.id}`,
    object: 'run_archive_item',
    kind: 'response_batch',
    source: 'response_batch',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    title: record.id,
    status: null,
    provider: null,
    runtimeProfile: null,
    browserProfile: null,
    projectId: null,
    boundIdentityKey: null,
    agentId: null,
    teamId: null,
    responseId: null,
    batchId: record.id,
    batchIndex: null,
    mediaGenerationId: null,
    providerConversationId: null,
    providerConversationUrl: null,
    artifactId: null,
    fileName: null,
    mimeType: null,
    localPath: null,
    uri: null,
    cacheKey: null,
    checksumSha256: null,
    fileAvailable: null,
    metadata: {
      jobCount: record.jobs.length,
      limits: record.limits,
      ...record.metadata,
    },
    links: {
      batch: `/v1/response-batches/${encodeURIComponent(record.id)}`,
    },
  }));
}

function buildMediaArchiveItems(records: MediaGenerationStoredRecord[]): RunArchiveItem[] {
  const items: RunArchiveItem[] = [];
  for (const record of records) {
    const response = record.response;
    const conversationId = readRecordString(response.metadata, ['conversationId', 'conversation_id']);
    const conversationUrl = readRecordString(response.metadata, ['tabUrl', 'conversationUrl', 'url']);
    const base: RunArchiveItem = {
      id: `media-generation:${response.id}`,
      object: 'run_archive_item',
      kind: 'media_generation',
      source: 'media_generation',
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
      title: response.prompt,
      status: response.status,
      provider: response.provider,
      runtimeProfile: readRecordString(response.metadata, ['runtimeProfileId', 'runtimeProfile']),
      browserProfile: readRecordString(response.metadata, ['browserProfileId', 'browserProfile']),
      projectId: readRecordString(response.metadata, ['projectId', 'project']),
      boundIdentityKey: readRecordString(response.metadata, ['boundIdentityKey', 'identityKey', 'serviceAccountId']),
      agentId: null,
      teamId: null,
      responseId: null,
      batchId: null,
      batchIndex: null,
      mediaGenerationId: response.id,
      providerConversationId: conversationId,
      providerConversationUrl: conversationUrl,
      artifactId: null,
      fileName: null,
      mimeType: null,
      localPath: null,
      uri: null,
      cacheKey: null,
      checksumSha256: null,
      fileAvailable: null,
      metadata: {
        mediaType: response.mediaType,
        artifactCount: response.artifacts.length,
        model: response.model ?? null,
      },
      links: {
        mediaGeneration: `/v1/media-generations/${encodeURIComponent(response.id)}`,
      },
    };
    items.push(base);
    for (const artifact of response.artifacts) {
      items.push({
        ...base,
        id: `generated-artifact:${response.id}:${artifact.id}`,
        kind: 'generated_artifact',
        title: artifact.fileName ?? artifact.id,
        artifactId: artifact.id,
        fileName: artifact.fileName ?? null,
        mimeType: artifact.mimeType ?? null,
        localPath: artifact.path ?? null,
        uri: artifact.uri ?? null,
        metadata: {
          mediaType: artifact.type,
          width: artifact.width ?? null,
          height: artifact.height ?? null,
          durationSeconds: artifact.durationSeconds ?? null,
          ...(artifact.metadata ?? {}),
        },
      });
    }
    if (conversationId) {
      items.push({
        ...base,
        id: `provider-conversation:${response.id}:${response.provider}:${conversationId}`,
        kind: 'provider_conversation',
        title: conversationId,
      });
    }
  }
  return items;
}

function createBaseRunItem(record: ExecutionRunStoredRecord, firstStep: ExecutionRunStep | null): RunArchiveItem {
  const browserRun = readStepBrowserRun(firstStep);
  return {
    id: `response:${record.runId}`,
    object: 'run_archive_item',
    kind: 'response',
    source: 'runtime',
    createdAt: record.bundle.run.createdAt,
    updatedAt: record.bundle.run.updatedAt,
    title: record.bundle.run.entryPrompt,
    status: record.bundle.run.status,
    provider: firstStep?.service ?? null,
    runtimeProfile: firstStep?.runtimeProfileId ?? readRecordString(record.bundle.run.initialInputs, ['runtimeProfile']),
    browserProfile: firstStep?.browserProfileId ?? null,
    projectId: readRecordString(browserRun, ['projectId', 'project']),
    boundIdentityKey: readRecordString(browserRun, ['boundIdentityKey', 'identityKey', 'serviceAccountId']),
    agentId: firstStep?.agentId ?? null,
    teamId: record.bundle.run.sourceKind === 'team-run' ? record.bundle.run.sourceId : readRecordString(record.bundle.run.initialInputs, ['team']),
    responseId: record.runId,
    batchId: null,
    batchIndex: null,
    mediaGenerationId: null,
    providerConversationId: null,
    providerConversationUrl: null,
    artifactId: null,
    fileName: null,
    mimeType: null,
    localPath: null,
    uri: null,
    cacheKey: null,
    checksumSha256: null,
    fileAvailable: null,
    metadata: {},
    links: {},
  };
}

function buildEvidenceArchiveItem(record: RunArchiveEvidenceRecord): RunArchiveItem {
  return {
    id: `evidence:${record.id}`,
    object: 'run_archive_item',
    kind: 'evidence',
    source: 'evidence',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    title: record.title ?? record.summary ?? record.schema,
    status: record.status,
    provider: null,
    runtimeProfile: null,
    browserProfile: null,
    projectId: null,
    boundIdentityKey: null,
    agentId: null,
    teamId: null,
    responseId: record.responseId,
    batchId: record.batchId,
    batchIndex: null,
    mediaGenerationId: null,
    providerConversationId: record.providerConversationId,
    providerConversationUrl: null,
    artifactId: record.archiveItemId,
    fileName: null,
    mimeType: null,
    localPath: null,
    uri: null,
    cacheKey: null,
    checksumSha256: null,
    fileAvailable: null,
    metadata: {
      producer: record.producer,
      schema: record.schema,
      summary: record.summary,
      archiveItemId: record.archiveItemId,
      evidenceId: record.id,
      data: record.data,
      ...record.metadata,
    },
    links: {
      ...(record.responseId ? { response: `/v1/responses/${encodeURIComponent(record.responseId)}` } : {}),
      ...(record.batchId ? { batch: `/v1/response-batches/${encodeURIComponent(record.batchId)}` } : {}),
      ...(record.archiveItemId ? { archiveItem: `/v1/archive/items/${encodeURIComponent(record.archiveItemId)}` } : {}),
    },
  };
}

function listInputArtifacts(steps: ExecutionRunStep[]): Array<{
  stepId: string;
  id: string;
  kind: string;
  title: string | null;
  path: string | null;
  uri: string | null;
  metadata: Record<string, unknown> | null;
}> {
  return steps.flatMap((step) =>
    step.input.artifacts.map((artifact) => ({
      stepId: step.id,
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title ?? null,
      path: artifact.path ?? null,
      uri: artifact.uri ?? null,
      metadata: artifact.metadata ?? null,
    })),
  );
}

function readStepBrowserRun(step: ExecutionRunStep | null): Record<string, unknown> | null {
  return isRecord(step?.output?.structuredData?.browserRun)
    ? step.output.structuredData.browserRun
    : null;
}

function listProviderConversationRefs(record: ExecutionRunStoredRecord): Array<{
  stepId: string;
  provider: Exclude<ExecutionRunServiceId, null>;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  projectId: string | null;
  boundIdentityKey: string | null;
  conversationId: string;
  url: string | null;
}> {
  const refs: ReturnType<typeof listProviderConversationRefs> = [];
  const seen = new Set<string>();
  for (const step of record.bundle.steps) {
    const browserRun = isRecord(step.output?.structuredData?.browserRun)
      ? step.output.structuredData.browserRun
      : null;
    if (!browserRun) continue;
    const provider = normalizeProvider(readRecordString(browserRun, ['provider', 'service']) ?? step.service);
    const conversationId = readRecordString(browserRun, ['conversationId', 'conversation_id']);
    if (!provider || !conversationId) continue;
    const runtimeProfileId = readRecordString(browserRun, ['runtimeProfileId', 'runtimeProfile']) ?? step.runtimeProfileId;
    const browserProfileId = readRecordString(browserRun, ['browserProfileId', 'browserProfile']) ?? step.browserProfileId;
    const projectId = readRecordString(browserRun, ['projectId', 'project']);
    const boundIdentityKey = readRecordString(browserRun, ['boundIdentityKey', 'identityKey', 'serviceAccountId']);
    const key = [provider, runtimeProfileId ?? '', conversationId].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      stepId: step.id,
      provider,
      runtimeProfileId,
      browserProfileId,
      projectId,
      boundIdentityKey,
      conversationId,
      url: readRecordString(browserRun, ['tabUrl', 'conversationUrl', 'url']),
    });
  }
  return refs;
}

function readBatchMetadata(record: ExecutionRunStoredRecord): {
  batchId: string | null;
  batchIndex: number | null;
} {
  const metadata = isRecord(record.bundle.run.initialInputs.metadata)
    ? record.bundle.run.initialInputs.metadata
    : {};
  return {
    batchId: readRecordString(metadata, ['batchId']),
    batchIndex: typeof metadata.batchIndex === 'number' ? metadata.batchIndex : null,
  };
}

function matchesRequest(item: RunArchiveItem, request: RunArchiveListRequest & { kind: RunArchiveItemKind | 'all' }): boolean {
  if (request.kind !== 'all' && item.kind !== request.kind) return false;
  if (request.provider && item.provider !== request.provider) return false;
  if (request.runtimeProfile && item.runtimeProfile !== request.runtimeProfile) return false;
  if (request.projectId && item.projectId !== request.projectId) return false;
  if (request.agent && item.agentId !== request.agent) return false;
  if (request.team && item.teamId !== request.team) return false;
  if (request.responseId && item.responseId !== request.responseId) return false;
  if (request.batchId && item.batchId !== request.batchId) return false;
  if (request.status && item.status !== request.status) return false;
  if (request.query && !itemMatchesQuery(item, request.query)) return false;
  return true;
}

function normalizeAssetLookupRequest(request: RunArchiveAssetLookupRequest): RunArchiveAssetLookupResult['query'] {
  const query = {
    checksumSha256: normalizeLookupString(request.checksumSha256)?.toLowerCase() ?? null,
    cacheKey: normalizeLookupString(request.cacheKey) ?? null,
    providerArtifactId: normalizeLookupString(request.providerArtifactId) ?? null,
    artifactId: normalizeLookupString(request.artifactId) ?? null,
  };
  if (!query.checksumSha256 && !query.cacheKey && !query.providerArtifactId && !query.artifactId) {
    throw new Error('At least one archive asset lookup key is required.');
  }
  return query;
}

function matchesAssetLookupRequest(item: RunArchiveItem, query: RunArchiveAssetLookupResult['query']): boolean {
  if (item.kind !== 'upload' && item.kind !== 'generated_artifact') return false;
  if (query.checksumSha256 && item.checksumSha256 !== query.checksumSha256) return false;
  if (query.cacheKey && item.cacheKey !== query.cacheKey) return false;
  if (query.artifactId && item.artifactId !== query.artifactId) return false;
  if (query.providerArtifactId) {
    const providerArtifactId =
      readRecordString(item.metadata, ['providerArtifactId', 'fileId', 'remoteId']) ??
      item.artifactId;
    if (providerArtifactId !== query.providerArtifactId) return false;
  }
  return true;
}

function compareAssetLookupItems(left: RunArchiveItem, right: RunArchiveItem): number {
  const leftAvailable = left.fileAvailable === true && Boolean(left.localPath) ? 1 : 0;
  const rightAvailable = right.fileAvailable === true && Boolean(right.localPath) ? 1 : 0;
  if (leftAvailable !== rightAvailable) return rightAvailable - leftAvailable;
  const leftChecksum = left.checksumSha256 ? 1 : 0;
  const rightChecksum = right.checksumSha256 ? 1 : 0;
  if (leftChecksum !== rightChecksum) return rightChecksum - leftChecksum;
  return right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id);
}

function normalizeLookupString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function itemMatchesQuery(item: RunArchiveItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    item.id,
    item.title,
    item.provider,
    item.runtimeProfile,
    item.projectId,
    item.boundIdentityKey,
    item.agentId,
    item.teamId,
    item.responseId,
    item.batchId,
    item.providerConversationId,
    item.fileName,
    item.uri,
    item.localPath,
    item.checksumSha256,
    JSON.stringify(item.metadata),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
    .toLowerCase();
  return haystack.includes(needle);
}

async function enrichFileMetadata(items: RunArchiveItem[]): Promise<RunArchiveItem[]> {
  return Promise.all(items.map(async (item) => {
    const checksumSha256 = readRecordString(item.metadata, ['checksumSha256']) ?? await calculateFileSha256(item.localPath);
    const fileAvailable = item.localPath ? await fileExists(item.localPath) : null;
    const fileSizeBytes = readRecordNumber(item.metadata, ['fileSizeBytes', 'size']) ?? await readFileSize(item.localPath);
    const cacheKey = checksumSha256
      ? `sha256:${checksumSha256}`
      : item.localPath
        ? `path:${item.localPath}`
        : null;
    return {
      ...item,
      cacheKey,
      checksumSha256,
      fileAvailable,
      metadata: {
        ...item.metadata,
        ...(checksumSha256 ? { checksumSha256 } : {}),
        ...(fileSizeBytes !== null ? { fileSizeBytes } : {}),
        ...(fileAvailable !== null ? { fileAvailable } : {}),
      },
    };
  }));
}

async function calculateFileSha256(localPath: string | null): Promise<string | null> {
  if (!localPath) return null;
  try {
    const content = await fs.readFile(localPath);
    return createHash('sha256').update(content).digest('hex');
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

async function fileExists(localPath: string): Promise<boolean> {
  try {
    await fs.access(localPath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

async function readFileSize(localPath: string | null): Promise<number | null> {
  if (!localPath) return null;
  try {
    const stats = await fs.stat(localPath);
    return stats.isFile() ? stats.size : null;
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

function normalizeKind(value: RunArchiveListRequest['kind']): RunArchiveItemKind | 'all' {
  if (
    value === 'response' ||
    value === 'response_batch' ||
    value === 'team_run' ||
    value === 'media_generation' ||
    value === 'upload' ||
    value === 'generated_artifact' ||
    value === 'provider_conversation' ||
    value === 'evidence'
  ) {
    return value;
  }
  return 'all';
}

function normalizeLimit(value: number | null | undefined): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  return DEFAULT_LIMIT;
}

function countByKind(items: RunArchiveItem[]): Record<RunArchiveItemKind, number> {
  const counts: Record<RunArchiveItemKind, number> = {
    response: 0,
    response_batch: 0,
    team_run: 0,
    media_generation: 0,
    upload: 0,
    generated_artifact: 0,
    provider_conversation: 0,
    evidence: 0,
  };
  for (const item of items) {
    counts[item.kind] += 1;
  }
  return counts;
}

function isArtifactOutput(item: ExecutionResponseOutputItem): item is Extract<ExecutionResponseOutputItem, { type: 'artifact' }> {
  return item.type === 'artifact';
}

function buildCatalogItemPath(input: {
  provider: Exclude<ExecutionRunServiceId, null>;
  conversationId: string;
  runtimeProfileId: string | null;
}): string {
  const params = new URLSearchParams({
    provider: input.provider,
    kind: 'conversations',
  });
  if (input.runtimeProfileId) params.set('runtimeProfile', input.runtimeProfileId);
  return `/v1/account-mirrors/catalog/items/${encodeURIComponent(input.conversationId)}?${params.toString()}`;
}

function normalizeProvider(value: unknown): Exclude<ExecutionRunServiceId, null> | null {
  if (value === 'chatgpt' || value === 'gemini' || value === 'grok') return value;
  return null;
}

function readMetadataString(value: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  return readRecordString(value, keys);
}

function readRecordString(value: unknown, keys: string[]): string | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === 'string' && entry.trim().length > 0) return entry.trim();
  }
  return null;
}

function readRecordNumber(value: unknown, keys: string[]): number | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === 'number' && Number.isFinite(entry) && entry >= 0) return entry;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
