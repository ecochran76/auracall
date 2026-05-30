import { describe, expect, it, vi } from 'vitest';
import {
  createAccountMirrorArtifactRecoveryPlanner,
} from '../../src/accountMirror/artifactRecoveryPlanner.js';
import type {
  AccountMirrorAssetInventoryEvidence,
  AccountMirrorStatusEntry,
  AccountMirrorStatusRegistry,
  AccountMirrorStatusSummary,
} from '../../src/accountMirror/statusRegistry.js';
import type { SearchProjectionService } from '../../src/runtime/searchProjectionService.js';

describe('account mirror artifact recovery planner', () => {
  it('classifies remote-known missing local assets without launching browser work', async () => {
    const refreshPersistentState = vi.fn(async () => undefined);
    const registry = registryWithEntries([
      statusEntry({
        provider: 'chatgpt',
        runtimeProfileId: 'wsl-chrome-4',
        tenantKey: 'service-account:chatgpt:operator@example.com',
        expectedIdentityKey: 'operator@example.com',
        assetInventory: assetInventory({
          remoteKnownMissingLocal: { artifacts: 4, files: 2, media: 0 },
          detailScannedThisPass: { projects: 0, conversations: 1, total: 1 },
        }),
      }),
      statusEntry({
        provider: 'gemini',
        runtimeProfileId: 'auracall-gemini-pro',
        tenantKey: 'service-account:gemini:operator@example.com',
        expectedIdentityKey: 'operator@example.com',
        assetInventory: assetInventory({
          state: 'deferred',
          remoteKnownMissingLocal: { artifacts: 0, files: 0, media: 0 },
          unknownOrDeferred: { artifacts: 1, files: 1, media: 1 },
        }),
      }),
    ], refreshPersistentState);
    const search = vi.fn(async () => ({
      object: 'search_results' as const,
      generatedAt: '2026-05-30T16:30:00.000Z',
      query: {
        q: null,
        provider: null,
        runtimeProfile: null,
        tenant: null,
        kind: 'artifact',
        status: null,
        fileAvailable: null,
        assetAvailability: 'unavailable' as const,
        materialization: null,
        limit: 500,
        cursor: null,
      },
      rows: [],
      nextCursor: null,
      metrics: { total: 0, returned: 0 },
      facets: {
        providers: [],
        tenants: [],
        runtimeProfiles: [],
        kinds: [],
        statuses: [],
        assetAvailability: [],
        materialization: [],
      },
    }));

    const planner = createAccountMirrorArtifactRecoveryPlanner({
      registry,
      searchProjectionService: { search } satisfies SearchProjectionService,
      now: () => new Date('2026-05-30T16:30:00.000Z'),
    });

    const result = await planner.plan({ limit: 1 });

    expect(refreshPersistentState).toHaveBeenCalled();
    expect(search).toHaveBeenCalledWith({
      provider: null,
      runtimeProfile: null,
      tenant: null,
      kind: 'artifact',
      assetAvailability: 'unavailable',
      limit: 500,
    });
    expect(result.metrics.total).toBe(2);
    expect(result.metrics.returned).toBe(1);
    expect(result.omitted.candidates).toBe(1);
    expect(result.metrics.remoteKnownMissingLocal.total).toBe(6);
    expect(result.metrics.unknownOrDeferred.total).toBe(3);
    expect(result.candidates[0]).toMatchObject({
      provider: 'chatgpt',
      runtimeProfileId: 'wsl-chrome-4',
      status: 'eligible',
      action: 'queue_history_materialization',
      counts: {
        remoteKnownMissingLocal: {
          total: 6,
        },
      },
      createRequest: {
        provider: 'chatgpt',
        runtimeProfile: 'wsl-chrome-4',
        boundIdentityKey: 'operator@example.com',
        reconcile: true,
        assetKinds: ['all'],
      },
    });
  });

  it('can include unavailable search rows as explicit recovery candidates', async () => {
    const registry = registryWithEntries([]);
    const search = vi.fn(async () => ({
      object: 'search_results' as const,
      generatedAt: '2026-05-30T16:30:00.000Z',
      query: {
        q: null,
        provider: 'chatgpt',
        runtimeProfile: 'default',
        tenant: null,
        kind: 'artifact',
        status: null,
        fileAvailable: null,
        assetAvailability: 'unavailable' as const,
        materialization: null,
        limit: 500,
        cursor: null,
      },
      rows: [{
        id: 'catalog:artifacts:chatgpt:default:artifact_1',
        object: 'search_result_row' as const,
        source: 'account_mirror' as const,
        sourceKind: 'artifacts',
        kind: 'artifact',
        title: 'analysis.csv',
        summary: null,
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        tenant: 'operator@example.com',
        projectId: null,
        status: 'available-remotely',
        runtimeState: null,
        sortTime: '2026-05-30T16:00:00.000Z',
        updatedAt: '2026-05-30T16:00:00.000Z',
        itemId: 'artifact_1',
        counts: { messages: null, files: 0, artifacts: 1 },
        links: { catalogItem: '/v1/account-mirrors/catalog/items/artifact_1' },
        metadata: {},
      }],
      nextCursor: null,
      metrics: { total: 1, returned: 1 },
      facets: {
        providers: [],
        tenants: [],
        runtimeProfiles: [],
        kinds: [],
        statuses: [],
        assetAvailability: [],
        materialization: [],
      },
    }));

    const planner = createAccountMirrorArtifactRecoveryPlanner({
      registry,
      searchProjectionService: { search } satisfies SearchProjectionService,
    });

    const result = await planner.plan({ provider: 'chatgpt', runtimeProfileId: 'default' });

    expect(result.candidates[0]).toMatchObject({
      source: 'search_projection',
      sourceItem: {
        id: 'artifact_1',
        kind: 'artifact',
      },
      createRequest: {
        catalogItemId: 'artifact_1',
        catalogKind: 'artifacts',
        refreshSnapshot: true,
      },
    });
  });

  it('subtracts materialized archive evidence from remote-known missing counts', async () => {
    const registry = registryWithEntries([
      statusEntry({
        provider: 'chatgpt',
        runtimeProfileId: 'wsl-chrome-3',
        tenantKey: 'service-account:chatgpt:operator@example.com',
        expectedIdentityKey: 'operator@example.com',
        assetInventory: assetInventory({
          remoteKnownMissingLocal: { artifacts: 4, files: 2, media: 0 },
          detailScannedThisPass: { projects: 0, conversations: 1, total: 1 },
        }),
      }),
    ]);
    const search = vi.fn(async (request) => ({
      object: 'search_results' as const,
      generatedAt: '2026-05-30T16:30:00.000Z',
      query: {
        q: null,
        provider: 'chatgpt',
        runtimeProfile: 'wsl-chrome-3',
        tenant: null,
        kind: String(request?.kind ?? 'artifact'),
        status: null,
        fileAvailable: null,
        assetAvailability: request?.assetAvailability ?? null,
        materialization: null,
        limit: 500,
        cursor: null,
      },
      rows: request?.assetAvailability === 'available'
        ? request.kind === 'artifact'
          ? [searchRow({
              id: 'archive:artifact_1',
              source: 'run_archive',
              sourceKind: 'generated_artifact',
              kind: 'artifact',
              tenant: 'operator@example.com',
            })]
          : [
              searchRow({
                id: 'archive:file_1',
                source: 'run_archive',
                sourceKind: 'upload',
                kind: 'upload',
                tenant: 'operator@example.com',
              }),
              searchRow({
                id: 'archive:file_2',
                source: 'run_archive',
                sourceKind: 'upload',
                kind: 'upload',
                tenant: 'operator@example.com',
              }),
            ]
        : [],
      nextCursor: null,
      metrics: { total: 0, returned: 0 },
      facets: {
        providers: [],
        tenants: [],
        runtimeProfiles: [],
        kinds: [],
        statuses: [],
        assetAvailability: [],
        materialization: [],
      },
    }));

    const planner = createAccountMirrorArtifactRecoveryPlanner({
      registry,
      searchProjectionService: { search } satisfies SearchProjectionService,
    });

    const result = await planner.plan({ provider: 'chatgpt', runtimeProfileId: 'wsl-chrome-3' });

    expect(result.metrics.remoteKnownMissingLocal).toEqual({
      artifacts: 3,
      files: 0,
      media: 0,
      total: 3,
    });
    expect(result.candidates[0]?.counts.localMaterialized).toEqual({
      artifacts: 1,
      files: 2,
      media: 0,
      total: 3,
    });
    expect(result.candidates[0]?.createRequest).toMatchObject({
      maxItems: 3,
    });
  });
});

function searchRow(input: {
  id: string;
  source: 'account_mirror' | 'run_archive';
  sourceKind: string;
  kind: string;
  tenant: string;
}) {
  return {
    id: input.id,
    object: 'search_result_row' as const,
    source: input.source,
    sourceKind: input.sourceKind,
    kind: input.kind,
    title: input.id,
    summary: null,
    provider: 'chatgpt',
    runtimeProfileId: 'wsl-chrome-3',
    browserProfileId: 'default',
    tenant: input.tenant,
    projectId: null,
    status: 'materialized',
    runtimeState: null,
    sortTime: '2026-05-30T16:00:00.000Z',
    updatedAt: '2026-05-30T16:00:00.000Z',
    itemId: input.id,
    counts: { messages: null, files: input.kind === 'upload' ? 1 : 0, artifacts: input.kind === 'artifact' ? 1 : 0 },
    links: {},
    metadata: { fileAvailable: true },
  };
}

function registryWithEntries(
  entries: AccountMirrorStatusEntry[],
  refreshPersistentState: () => Promise<void> = async () => undefined,
): AccountMirrorStatusRegistry {
  return {
    refreshPersistentState,
    readStatus(): AccountMirrorStatusSummary {
      return {
        object: 'account_mirror_status',
        generatedAt: '2026-05-30T16:30:00.000Z',
        entries,
        metrics: {
          total: entries.length,
          eligible: entries.filter((entry) => entry.status === 'eligible').length,
          delayed: entries.filter((entry) => entry.status === 'delayed').length,
          blocked: entries.filter((entry) => entry.status === 'blocked').length,
        },
      };
    },
    updateState() {},
    mergeState() {
      return {};
    },
  };
}

function statusEntry(input: {
  provider: AccountMirrorStatusEntry['provider'];
  runtimeProfileId: string;
  tenantKey: string;
  expectedIdentityKey: string;
  assetInventory: AccountMirrorAssetInventoryEvidence;
}): AccountMirrorStatusEntry {
  return {
    provider: input.provider,
    tenantKey: input.tenantKey,
    bindingKey: `binding:${input.provider}:${input.runtimeProfileId}:default`,
    runtimeProfileId: input.runtimeProfileId,
    browserProfileId: 'default',
    expectedIdentityKey: input.expectedIdentityKey,
    detectedIdentityKey: input.expectedIdentityKey,
    accountLevel: null,
    status: 'delayed',
    reason: 'minimum-interval',
    eligibleAt: null,
    delayMs: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastQueuedAt: null,
    lastStartedAt: null,
    lastCompletedAt: null,
    consecutiveFailureCount: 0,
    mirrorState: {
      queued: false,
      running: false,
      lastRefreshRequestId: null,
      lastDispatcherKey: null,
      lastDispatcherOperationId: null,
      lastDispatcherBlockedBy: null,
    },
    providerGuard: {
      state: 'clear',
      kind: null,
      summary: null,
      detectedAt: null,
      clearedAt: null,
      cooldownUntil: null,
      url: null,
      action: null,
    },
    metadataCounts: {
      projects: 0,
      conversations: 1,
      artifacts: input.assetInventory.remoteKnownMissingLocal.artifacts,
      files: input.assetInventory.remoteKnownMissingLocal.files,
      media: input.assetInventory.remoteKnownMissingLocal.media,
    },
    metadataEvidence: {
      identitySource: 'test',
      projectSampleIds: [],
      conversationSampleIds: [],
      assetInventory: input.assetInventory,
      detailScannedThisPass: input.assetInventory.detailScannedThisPass,
      truncated: {
        projects: false,
        conversations: false,
        artifacts: input.assetInventory.state === 'in_progress',
      },
    },
    mirrorCompleteness: {
      state: 'in_progress',
      summary: 'test completeness',
      assetInventory: input.assetInventory,
      remainingDetailSurfaces: null,
      signals: {
        projectsTruncated: false,
        conversationsTruncated: false,
        attachmentInventoryTruncated: input.assetInventory.state === 'in_progress',
        attachmentCursorPresent: false,
      },
    },
    liveFollow: {
      configured: true,
      enabled: true,
      state: 'enabled',
      reason: 'test live follow',
      mode: 'metadata-first',
      priority: 'normal',
      sweepMode: 'steady_follow',
      materializationPolicy: null,
      materializationAssetKinds: null,
      materializationMaxItems: null,
      materializationRefreshSnapshot: null,
      materializationForce: null,
    },
    limits: {
      minIntervalMs: 0,
      explicitRefreshMinIntervalMs: 0,
      jitterMs: 0,
      jitterMaxMs: 0,
      failureCooldownMs: 0,
      hardStopCooldownMs: 0,
      maxBrowserInteractionsPerMinute: 0,
      maxPageReadsPerCycle: 0,
      maxConversationRowsPerCycle: 0,
      maxArtifactRowsPerCycle: 0,
    },
  };
}

function assetInventory(input: {
  state?: AccountMirrorAssetInventoryEvidence['state'];
  remoteKnownMissingLocal: AccountMirrorAssetInventoryEvidence['remoteKnownMissingLocal'];
  unknownOrDeferred?: AccountMirrorAssetInventoryEvidence['unknownOrDeferred'];
  detailScannedThisPass?: AccountMirrorAssetInventoryEvidence['detailScannedThisPass'];
}): AccountMirrorAssetInventoryEvidence {
  return {
    state: input.state ?? 'in_progress',
    summary: 'test inventory',
    detailScannedThisPass: input.detailScannedThisPass ?? { projects: 0, conversations: 0, total: 0 },
    localMaterialized: { artifacts: 0, files: 0, media: 0 },
    remoteKnownMissingLocal: input.remoteKnownMissingLocal,
    unknownOrDeferred: input.unknownOrDeferred ?? { artifacts: 0, files: 0, media: 0 },
  };
}
