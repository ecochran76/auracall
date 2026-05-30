import type {
  AccountMirrorAssetInventoryEvidence,
  AccountMirrorStatusEntry,
  AccountMirrorStatusRegistry,
} from './statusRegistry.js';
import type { AccountMirrorProvider } from './politePolicy.js';
import type {
  SearchProjectionRequest,
  SearchProjectionRow,
  SearchProjectionService,
} from '../runtime/searchProjectionService.js';

export type AccountMirrorArtifactRecoveryCandidateStatus =
  | 'eligible'
  | 'needs_detail_refresh'
  | 'deferred'
  | 'blocked'
  | 'unsupported'
  | 'terminal';

export type AccountMirrorArtifactRecoveryCandidateAction =
  | 'queue_history_materialization'
  | 'refresh_detail_inventory'
  | 'start_materialization_policy_completion'
  | 'inspect_archive_materialization'
  | 'none';

export interface AccountMirrorArtifactRecoveryPlanRequest {
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  tenantKey?: string | null;
  status?: AccountMirrorArtifactRecoveryCandidateStatus | null;
  action?: AccountMirrorArtifactRecoveryCandidateAction | null;
  includeSearchRows?: boolean | null;
  limit?: number | null;
}

export interface AccountMirrorArtifactRecoveryCandidate {
  object: 'account_mirror_artifact_recovery_candidate';
  id: string;
  source: 'account_mirror_status' | 'search_projection';
  provider: AccountMirrorProvider | string | null;
  tenantKey: string | null;
  bindingKey: string | null;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  status: AccountMirrorArtifactRecoveryCandidateStatus;
  action: AccountMirrorArtifactRecoveryCandidateAction;
  reason: string;
  evidenceConfidence: 'high' | 'medium' | 'low';
  materializationPolicy: string | null;
  assetInventory: AccountMirrorAssetInventoryEvidence | null;
  counts: {
    remoteKnownMissingLocal: {
      artifacts: number;
      files: number;
      media: number;
      total: number;
    };
    localMaterialized: {
      artifacts: number;
      files: number;
      media: number;
      total: number;
    };
    unknownOrDeferred: {
      artifacts: number;
      files: number;
      media: number;
      total: number;
    };
  };
  sourceItem: {
    id: string | null;
    kind: string | null;
    title: string | null;
    links: Record<string, string>;
  } | null;
  createRequest: {
    provider?: string;
    runtimeProfile?: string;
    boundIdentityKey?: string;
    catalogItemId?: string;
    catalogKind?: 'artifacts' | 'files' | 'media' | 'conversations';
    archiveItemId?: string;
    reconcile?: boolean;
    refreshSnapshot?: boolean;
    assetKinds?: Array<'artifacts' | 'files' | 'media' | 'all'>;
    maxItems?: number;
  } | null;
}

export interface AccountMirrorArtifactRecoveryPlanResult {
  object: 'account_mirror_artifact_recovery_plan';
  generatedAt: string;
  query: {
    provider: AccountMirrorProvider | null;
    runtimeProfileId: string | null;
    tenantKey: string | null;
    status: AccountMirrorArtifactRecoveryCandidateStatus | null;
    action: AccountMirrorArtifactRecoveryCandidateAction | null;
    includeSearchRows: boolean;
    limit: number;
  };
  candidates: AccountMirrorArtifactRecoveryCandidate[];
  omitted: {
    candidates: number;
  };
  metrics: {
    total: number;
    returned: number;
    byStatus: Record<AccountMirrorArtifactRecoveryCandidateStatus, number>;
    byAction: Record<AccountMirrorArtifactRecoveryCandidateAction, number>;
    remoteKnownMissingLocal: {
      artifacts: number;
      files: number;
      media: number;
      total: number;
    };
    unknownOrDeferred: {
      artifacts: number;
      files: number;
      media: number;
      total: number;
    };
  };
}

export interface AccountMirrorArtifactRecoveryPlanner {
  plan(request?: AccountMirrorArtifactRecoveryPlanRequest): Promise<AccountMirrorArtifactRecoveryPlanResult>;
}

export function createAccountMirrorArtifactRecoveryPlanner(input: {
  registry: AccountMirrorStatusRegistry;
  searchProjectionService?: SearchProjectionService | null;
  now?: () => Date;
}): AccountMirrorArtifactRecoveryPlanner {
  const now = input.now ?? (() => new Date());
  return {
    async plan(request = {}) {
      const normalized = normalizeRequest(request);
      await input.registry.refreshPersistentState?.();
      const status = input.registry.readStatus({
        provider: normalized.provider,
        runtimeProfileId: normalized.runtimeProfileId,
      });
      const materializedOverlay = input.searchProjectionService
        ? await readMaterializedArchiveOverlay(input.searchProjectionService, normalized)
        : new Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>();
      const statusCandidates = status.entries
        .filter((entry) => !normalized.tenantKey || entry.tenantKey === normalized.tenantKey)
        .flatMap((entry) => candidateFromStatusEntry(entry, materializedOverlay));
      const searchCandidates = normalized.includeSearchRows && input.searchProjectionService
        ? await candidatesFromSearch(input.searchProjectionService, normalized)
        : [];
      const filtered = [...statusCandidates, ...searchCandidates]
        .filter((candidate) => !normalized.status || candidate.status === normalized.status)
        .filter((candidate) => !normalized.action || candidate.action === normalized.action)
        .sort(compareCandidates);
      const candidates = filtered.slice(0, normalized.limit);
      return {
        object: 'account_mirror_artifact_recovery_plan',
        generatedAt: now().toISOString(),
        query: normalized,
        candidates,
        omitted: {
          candidates: Math.max(0, filtered.length - candidates.length),
        },
        metrics: summarizeCandidates(filtered, candidates.length),
      };
    },
  };
}

type NormalizedAccountMirrorArtifactRecoveryPlanRequest = Required<
  Pick<AccountMirrorArtifactRecoveryPlanResult['query'], 'includeSearchRows' | 'limit'>
> & Omit<AccountMirrorArtifactRecoveryPlanResult['query'], 'includeSearchRows' | 'limit'>;

function candidateFromStatusEntry(
  entry: AccountMirrorStatusEntry,
  materializedOverlay: Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>,
): AccountMirrorArtifactRecoveryCandidate[] {
  const inventory = entry.mirrorCompleteness.assetInventory ?? entry.metadataEvidence?.assetInventory ?? null;
  if (!inventory) {
    if (entry.status !== 'blocked') return [];
    return [createStatusCandidate({
      entry,
      inventory: null,
      status: 'blocked',
      action: 'none',
      reason: entry.reason || 'Account mirror target is blocked before recovery planning.',
      confidence: 'low',
    })];
  }

  const adjustedInventory = applyMaterializedOverlay(entry, inventory, materializedOverlay);
  const remoteTotal = sumAssetCounts(adjustedInventory.remoteKnownMissingLocal);
  const unknownTotal = sumAssetCounts(adjustedInventory.unknownOrDeferred);
  if (remoteTotal <= 0 && unknownTotal <= 0) return [];

  if (entry.status === 'blocked') {
    return [createStatusCandidate({
      entry,
      inventory: adjustedInventory,
      status: 'blocked',
      action: 'none',
      reason: entry.reason || 'Account mirror target is blocked before recovery planning.',
      confidence: 'low',
    })];
  }

  if (remoteTotal > 0) {
    const materializationPolicy = entry.liveFollow.materializationPolicy;
    const action: AccountMirrorArtifactRecoveryCandidateAction =
      materializationPolicy === 'recent_missing_assets' || materializationPolicy === 'full_missing_assets'
        ? 'start_materialization_policy_completion'
        : 'queue_history_materialization';
    return [createStatusCandidate({
      entry,
      inventory: adjustedInventory,
      status: 'eligible',
      action,
      reason: materializationPolicy
        ? `Target has ${remoteTotal} remote-known missing local assets and materialization policy ${materializationPolicy}.`
        : `Target has ${remoteTotal} remote-known missing local assets; live follow is metadata-only until explicit recovery work is queued.`,
      confidence: recoveryConfidence(inventory),
    })];
  }

  return [createStatusCandidate({
    entry,
    inventory: adjustedInventory,
    status: 'needs_detail_refresh',
    action: 'refresh_detail_inventory',
    reason: `Target has ${unknownTotal} unknown or deferred asset counts and needs provider detail inventory before materialization.`,
    confidence: 'medium',
  })];
}

function createStatusCandidate(input: {
  entry: AccountMirrorStatusEntry;
  inventory: AccountMirrorAssetInventoryEvidence | null;
  status: AccountMirrorArtifactRecoveryCandidateStatus;
  action: AccountMirrorArtifactRecoveryCandidateAction;
  reason: string;
  confidence: AccountMirrorArtifactRecoveryCandidate['evidenceConfidence'];
}): AccountMirrorArtifactRecoveryCandidate {
  const remote = totalAssetCounts(input.inventory?.remoteKnownMissingLocal);
  const local = totalAssetCounts(input.inventory?.localMaterialized);
  const unknown = totalAssetCounts(input.inventory?.unknownOrDeferred);
  return {
    object: 'account_mirror_artifact_recovery_candidate',
    id: `status:${input.entry.provider}:${input.entry.runtimeProfileId}:${input.entry.tenantKey ?? input.entry.bindingKey}`,
    source: 'account_mirror_status',
    provider: input.entry.provider,
    tenantKey: input.entry.tenantKey,
    bindingKey: input.entry.bindingKey,
    runtimeProfileId: input.entry.runtimeProfileId,
    browserProfileId: input.entry.browserProfileId,
    status: input.status,
    action: input.action,
    reason: input.reason,
    evidenceConfidence: input.confidence,
    materializationPolicy: input.entry.liveFollow.materializationPolicy,
    assetInventory: input.inventory,
    counts: {
      remoteKnownMissingLocal: remote,
      localMaterialized: local,
      unknownOrDeferred: unknown,
    },
    sourceItem: null,
    createRequest: input.action === 'queue_history_materialization' || input.action === 'refresh_detail_inventory'
      ? {
          provider: input.entry.provider,
          runtimeProfile: input.entry.runtimeProfileId,
          boundIdentityKey: input.entry.expectedIdentityKey ?? undefined,
          reconcile: true,
          refreshSnapshot: input.action === 'refresh_detail_inventory',
          assetKinds: ['all'],
          maxItems: Math.max(1, Math.min(25, remote.total || unknown.total || 1)),
        }
      : null,
  };
}

async function readMaterializedArchiveOverlay(
  searchProjectionService: SearchProjectionService,
  request: NormalizedAccountMirrorArtifactRecoveryPlanRequest,
): Promise<Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>> {
  const [artifactRows, uploadRows] = await Promise.all([
    searchProjectionService.search(materializedArchiveSearchRequest(request, 'artifact')),
    searchProjectionService.search(materializedArchiveSearchRequest(request, 'upload')),
  ]);
  const overlay = new Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>();
  for (const row of artifactRows.rows) {
    addMaterializedArchiveRow(overlay, row, 'artifacts');
  }
  for (const row of uploadRows.rows) {
    addMaterializedArchiveRow(overlay, row, 'files');
  }
  return overlay;
}

function materializedArchiveSearchRequest(
  request: NormalizedAccountMirrorArtifactRecoveryPlanRequest,
  kind: 'artifact' | 'upload',
): SearchProjectionRequest {
  return {
    provider: request.provider,
    runtimeProfile: request.runtimeProfileId,
    tenant: request.tenantKey,
    kind,
    assetAvailability: 'available',
    limit: 500,
  };
}

function addMaterializedArchiveRow(
  overlay: Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>,
  row: SearchProjectionRow,
  field: 'artifacts' | 'files' | 'media',
): void {
  if (row.source !== 'run_archive') return;
  if (!row.provider || !row.runtimeProfileId || !row.tenant) return;
  const key = materializedOverlayKey({
    provider: row.provider,
    runtimeProfileId: row.runtimeProfileId,
    tenantKey: row.tenant,
  });
  const current = overlay.get(key) ?? { artifacts: 0, files: 0, media: 0, total: 0 };
  current[field] += 1;
  current.total = current.artifacts + current.files + current.media;
  overlay.set(key, current);
}

function applyMaterializedOverlay(
  entry: AccountMirrorStatusEntry,
  inventory: AccountMirrorAssetInventoryEvidence,
  overlay: Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>,
): AccountMirrorAssetInventoryEvidence {
  const overlayCounts = overlay.get(materializedOverlayKey({
    provider: entry.provider,
    runtimeProfileId: entry.runtimeProfileId,
    tenantKey: entry.tenantKey ?? entry.expectedIdentityKey ?? entry.detectedIdentityKey,
  }));
  if (!overlayCounts || overlayCounts.total <= 0) return inventory;
  const localMaterialized = maxAssetCounts(inventory.localMaterialized, overlayCounts);
  const localDelta = subtractAssetCounts(localMaterialized, inventory.localMaterialized);
  const remoteKnownMissingLocal = subtractAssetCounts(inventory.remoteKnownMissingLocal, localDelta);
  return {
    ...inventory,
    state: sumAssetCounts(remoteKnownMissingLocal) > 0 || sumAssetCounts(inventory.unknownOrDeferred) > 0
      ? inventory.state
      : 'complete',
    localMaterialized,
    remoteKnownMissingLocal,
  };
}

function materializedOverlayKey(input: {
  provider: string | null;
  runtimeProfileId: string | null;
  tenantKey: string | null;
}): string {
  return [
    input.provider ?? '',
    input.runtimeProfileId ?? '',
    normalizeTenantKey(input.tenantKey),
  ].join('\n');
}

function normalizeTenantKey(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const serviceAccountMatch = trimmed.match(/^service-account:[^:]+:(.+)$/u);
  return serviceAccountMatch?.[1]?.trim() || trimmed;
}

async function candidatesFromSearch(
  searchProjectionService: SearchProjectionService,
  request: NormalizedAccountMirrorArtifactRecoveryPlanRequest,
): Promise<AccountMirrorArtifactRecoveryCandidate[]> {
  const result = await searchProjectionService.search({
    provider: request.provider,
    runtimeProfile: request.runtimeProfileId,
    tenant: request.tenantKey,
    kind: 'artifact',
    assetAvailability: 'unavailable',
    limit: 500,
  });
  return result.rows.map(candidateFromSearchRow);
}

function candidateFromSearchRow(row: SearchProjectionRow): AccountMirrorArtifactRecoveryCandidate {
  const archiveItemId = row.source === 'run_archive' ? row.itemId : null;
  const catalogKind = catalogKindFromSearchRow(row);
  const catalogItemId = row.source === 'account_mirror' ? row.itemId : null;
  return {
    object: 'account_mirror_artifact_recovery_candidate',
    id: `search:${row.id}`,
    source: 'search_projection',
    provider: row.provider,
    tenantKey: row.tenant,
    bindingKey: null,
    runtimeProfileId: row.runtimeProfileId,
    browserProfileId: row.browserProfileId,
    status: 'eligible',
    action: archiveItemId ? 'inspect_archive_materialization' : 'queue_history_materialization',
    reason: archiveItemId
      ? 'Search row is an unavailable archive artifact with archive-owned provider evidence.'
      : 'Search row is an unavailable account-mirror artifact with catalog evidence.',
    evidenceConfidence: archiveItemId || catalogItemId ? 'high' : 'medium',
    materializationPolicy: null,
    assetInventory: null,
    counts: {
      remoteKnownMissingLocal: { artifacts: 1, files: 0, media: 0, total: 1 },
      localMaterialized: { artifacts: 0, files: 0, media: 0, total: 0 },
      unknownOrDeferred: { artifacts: 0, files: 0, media: 0, total: 0 },
    },
    sourceItem: {
      id: row.itemId,
      kind: row.kind,
      title: row.title,
      links: row.links,
    },
    createRequest: archiveItemId
      ? { archiveItemId, assetKinds: ['all'], maxItems: 1 }
      : catalogItemId && catalogKind
        ? {
            provider: typeof row.provider === 'string' ? row.provider : undefined,
            runtimeProfile: row.runtimeProfileId ?? undefined,
            boundIdentityKey: row.tenant ?? undefined,
            catalogItemId,
            catalogKind,
            refreshSnapshot: true,
            assetKinds: ['all'],
            maxItems: 1,
          }
        : null,
  };
}

function catalogKindFromSearchRow(row: SearchProjectionRow): 'artifacts' | 'files' | 'media' | 'conversations' | null {
  if (row.sourceKind === 'artifacts') return 'artifacts';
  if (row.sourceKind === 'files') return 'files';
  if (row.sourceKind === 'media') return 'media';
  if (row.sourceKind === 'conversations') return 'conversations';
  return null;
}

function normalizeRequest(
  request: AccountMirrorArtifactRecoveryPlanRequest,
): NormalizedAccountMirrorArtifactRecoveryPlanRequest {
  return {
    provider: normalizeProvider(request.provider),
    runtimeProfileId: normalizeString(request.runtimeProfileId),
    tenantKey: normalizeString(request.tenantKey),
    status: normalizeCandidateStatus(request.status),
    action: normalizeCandidateAction(request.action),
    includeSearchRows: request.includeSearchRows !== false,
    limit: normalizeLimit(request.limit),
  };
}

function normalizeProvider(value: unknown): AccountMirrorProvider | null {
  if (value === 'chatgpt' || value === 'gemini' || value === 'grok') return value;
  return null;
}

function normalizeCandidateStatus(value: unknown): AccountMirrorArtifactRecoveryCandidateStatus | null {
  if (
    value === 'eligible' ||
    value === 'needs_detail_refresh' ||
    value === 'deferred' ||
    value === 'blocked' ||
    value === 'unsupported' ||
    value === 'terminal'
  ) {
    return value;
  }
  return null;
}

function normalizeCandidateAction(value: unknown): AccountMirrorArtifactRecoveryCandidateAction | null {
  if (
    value === 'queue_history_materialization' ||
    value === 'refresh_detail_inventory' ||
    value === 'start_materialization_policy_completion' ||
    value === 'inspect_archive_materialization' ||
    value === 'none'
  ) {
    return value;
  }
  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.min(500, Math.max(0, Math.floor(value)));
}

function recoveryConfidence(inventory: AccountMirrorAssetInventoryEvidence): AccountMirrorArtifactRecoveryCandidate['evidenceConfidence'] {
  if (inventory.detailScannedThisPass.conversations > 0) return 'high';
  if (inventory.state === 'observed' || inventory.state === 'complete') return 'medium';
  return 'low';
}

function totalAssetCounts(value: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined) {
  const artifacts = Math.max(0, Math.floor(value?.artifacts ?? 0));
  const files = Math.max(0, Math.floor(value?.files ?? 0));
  const media = Math.max(0, Math.floor(value?.media ?? 0));
  return {
    artifacts,
    files,
    media,
    total: artifacts + files + media,
  };
}

function maxAssetCounts(
  left: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined,
  right: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined,
) {
  const leftCounts = totalAssetCounts(left);
  const rightCounts = totalAssetCounts(right);
  return {
    artifacts: Math.max(leftCounts.artifacts, rightCounts.artifacts),
    files: Math.max(leftCounts.files, rightCounts.files),
    media: Math.max(leftCounts.media, rightCounts.media),
  };
}

function subtractAssetCounts(
  left: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined,
  right: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined,
) {
  const leftCounts = totalAssetCounts(left);
  const rightCounts = totalAssetCounts(right);
  return {
    artifacts: Math.max(0, leftCounts.artifacts - rightCounts.artifacts),
    files: Math.max(0, leftCounts.files - rightCounts.files),
    media: Math.max(0, leftCounts.media - rightCounts.media),
  };
}

function sumAssetCounts(value: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined): number {
  return totalAssetCounts(value).total;
}

function summarizeCandidates(
  candidates: AccountMirrorArtifactRecoveryCandidate[],
  returned: number,
): AccountMirrorArtifactRecoveryPlanResult['metrics'] {
  const byStatus = {
    eligible: 0,
    needs_detail_refresh: 0,
    deferred: 0,
    blocked: 0,
    unsupported: 0,
    terminal: 0,
  };
  const byAction = {
    queue_history_materialization: 0,
    refresh_detail_inventory: 0,
    start_materialization_policy_completion: 0,
    inspect_archive_materialization: 0,
    none: 0,
  };
  const remoteKnownMissingLocal = { artifacts: 0, files: 0, media: 0, total: 0 };
  const unknownOrDeferred = { artifacts: 0, files: 0, media: 0, total: 0 };
  for (const candidate of candidates) {
    byStatus[candidate.status] += 1;
    byAction[candidate.action] += 1;
    remoteKnownMissingLocal.artifacts += candidate.counts.remoteKnownMissingLocal.artifacts;
    remoteKnownMissingLocal.files += candidate.counts.remoteKnownMissingLocal.files;
    remoteKnownMissingLocal.media += candidate.counts.remoteKnownMissingLocal.media;
    remoteKnownMissingLocal.total += candidate.counts.remoteKnownMissingLocal.total;
    unknownOrDeferred.artifacts += candidate.counts.unknownOrDeferred.artifacts;
    unknownOrDeferred.files += candidate.counts.unknownOrDeferred.files;
    unknownOrDeferred.media += candidate.counts.unknownOrDeferred.media;
    unknownOrDeferred.total += candidate.counts.unknownOrDeferred.total;
  }
  return {
    total: candidates.length,
    returned,
    byStatus,
    byAction,
    remoteKnownMissingLocal,
    unknownOrDeferred,
  };
}

function compareCandidates(left: AccountMirrorArtifactRecoveryCandidate, right: AccountMirrorArtifactRecoveryCandidate): number {
  const leftPriority = candidatePriority(left);
  const rightPriority = candidatePriority(right);
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return right.counts.remoteKnownMissingLocal.total - left.counts.remoteKnownMissingLocal.total
    || right.counts.unknownOrDeferred.total - left.counts.unknownOrDeferred.total
    || String(left.provider ?? '').localeCompare(String(right.provider ?? ''))
    || String(left.runtimeProfileId ?? '').localeCompare(String(right.runtimeProfileId ?? ''))
    || left.id.localeCompare(right.id);
}

function candidatePriority(candidate: AccountMirrorArtifactRecoveryCandidate): number {
  if (candidate.status === 'eligible') return 0;
  if (candidate.status === 'needs_detail_refresh') return 1;
  if (candidate.status === 'deferred') return 2;
  if (candidate.status === 'blocked') return 3;
  if (candidate.status === 'unsupported') return 4;
  return 5;
}
