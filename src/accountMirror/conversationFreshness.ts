import { createHash } from 'node:crypto';
import type { AccountMirrorCompleteness, AccountMirrorStatusEntry } from './statusRegistry.js';

export type AccountMirrorConversationFreshnessState =
  | 'fresh'
  | 'stale'
  | 'partial'
  | 'missing_assets'
  | 'terminal_unavailable'
  | 'guarded'
  | 'unknown';

export type AccountMirrorConversationRouteabilityState =
  | 'routeable'
  | 'not_found_or_unavailable'
  | 'identity_mismatch'
  | 'guarded'
  | 'unknown';

export type AccountMirrorConversationCompleteness = 'none' | 'partial' | 'complete' | 'unknown';

export interface AccountMirrorConversationFreshness {
  object: 'account_mirror_conversation_freshness';
  state: AccountMirrorConversationFreshnessState;
  reasons: string[];
  indexObservedAt: string | null;
  indexSource: string | null;
  indexRank: number | null;
  detailObservedAt: string | null;
  manifestObservedAt: string | null;
  materializedAt: string | null;
  routeabilityObservedAt: string | null;
  routeabilityState: AccountMirrorConversationRouteabilityState;
  conversationFingerprint: string;
  detailCompleteness: AccountMirrorConversationCompleteness;
  assetCompleteness: AccountMirrorConversationCompleteness;
  assetCounts: {
    known: number;
    local: number;
    missingLocal: number;
  };
}

export interface AccountMirrorConversationFreshnessInput {
  conversationId: string;
  item: unknown;
  indexRank?: number | null;
  target: {
    lastCompletedAt?: string | null;
    lastSuccessAt?: string | null;
    reason?: string | null;
    providerGuard?: AccountMirrorStatusEntry['providerGuard'] | null;
    mirrorCompleteness?: AccountMirrorCompleteness | null;
  };
  detail?: {
    exists: boolean;
    observedAt?: string | null;
    messageCount?: number | null;
    fileCount?: number | null;
    artifactCount?: number | null;
    sourceCount?: number | null;
  } | null;
  assets?: unknown[];
}

export function deriveAccountMirrorConversationFreshness(
  input: AccountMirrorConversationFreshnessInput,
): AccountMirrorConversationFreshness {
  const explicit = readFreshnessRecord(input.item);
  const itemRecord = isRecord(input.item) ? input.item : {};
  const metadata = isRecord(itemRecord.metadata) ? itemRecord.metadata : {};
  const providerGuard = input.target.providerGuard;
  const indexObservedAt = normalizeIsoString(
    readString(explicit, ['indexObservedAt']) ??
      readString(itemRecord, ['indexObservedAt', 'observedAt']) ??
      readString(metadata, ['indexObservedAt', 'observedAt']) ??
      input.target.lastCompletedAt ??
      input.target.lastSuccessAt,
  );
  const detailObservedAt = normalizeIsoString(
    readString(explicit, ['detailObservedAt']) ??
      readString(itemRecord, ['detailObservedAt']) ??
      readString(metadata, ['detailObservedAt']) ??
      input.detail?.observedAt,
  );
  const manifestObservedAt = normalizeIsoString(
    readString(explicit, ['manifestObservedAt']) ??
      readString(itemRecord, ['manifestObservedAt']) ??
      readString(metadata, ['manifestObservedAt']) ??
      detailObservedAt,
  );
  const assets = input.assets ?? [];
  let assetCounts = countAssetAvailability(assets);
  const materializedAt = normalizeIsoString(
    readString(explicit, ['materializedAt']) ??
      readString(itemRecord, ['materializedAt']) ??
      readString(metadata, ['materializedAt']) ??
      latestMaterializedAt(assets),
  );
  const routeabilityState = deriveRouteabilityState({
    explicit,
    item: itemRecord,
    metadata,
    providerGuard,
    targetReason: input.target.reason,
  });
  const routeabilityObservedAt = normalizeIsoString(
    readString(explicit, ['routeabilityObservedAt']) ??
      readString(itemRecord, ['routeabilityObservedAt']) ??
      readString(metadata, ['routeabilityObservedAt']) ??
      providerGuard?.detectedAt ??
      providerGuard?.clearedAt,
  );
  const detailCompleteness = deriveDetailCompleteness({
    explicit,
    detail: input.detail,
    mirrorCompleteness: input.target.mirrorCompleteness,
  });
  let assetCompleteness = deriveAssetCompleteness({
    explicit: readCompletenessOverride(explicit, itemRecord, metadata, 'assetCompleteness'),
    detailExists: input.detail?.exists === true,
    assetCounts,
  });
  if (assetCompleteness === 'complete' && assetCounts.known > 0 && assetCounts.local < assetCounts.known) {
    assetCounts = {
      known: assetCounts.known,
      local: assetCounts.known,
      missingLocal: 0,
    };
    assetCompleteness = 'complete';
  }
  const conversationFingerprint =
    readString(explicit, ['conversationFingerprint']) ??
    readString(itemRecord, ['conversationFingerprint']) ??
    readString(metadata, ['conversationFingerprint']) ??
    fingerprintConversation(input.item, input.detail, assetCounts);
  const stateReasons: string[] = [];
  const state = deriveFreshnessState({
    explicit,
    routeabilityState,
    detailCompleteness,
    assetCompleteness,
    assetCounts,
    indexObservedAt,
    detailObservedAt,
    manifestObservedAt,
    conversationFingerprint,
    stateReasons,
  });
  return {
    object: 'account_mirror_conversation_freshness',
    state,
    reasons: stateReasons,
    indexObservedAt,
    indexSource:
      readString(explicit, ['indexSource']) ??
      readString(itemRecord, ['indexSource']) ??
      readString(metadata, ['indexSource']) ??
      'account-mirror-snapshot',
    indexRank: normalizeRank(
      readNumber(explicit, ['indexRank']) ??
        readNumber(itemRecord, ['indexRank']) ??
        readNumber(metadata, ['indexRank']) ??
        input.indexRank,
    ),
    detailObservedAt,
    manifestObservedAt,
    materializedAt,
    routeabilityObservedAt,
    routeabilityState,
    conversationFingerprint,
    detailCompleteness,
    assetCompleteness,
    assetCounts,
  };
}

export function readAccountMirrorConversationFreshness(
  item: unknown,
): AccountMirrorConversationFreshness | null {
  if (!isRecord(item)) return null;
  const value = item.conversationFreshness;
  return isConversationFreshness(value) ? value : null;
}

function deriveFreshnessState(input: {
  explicit: Record<string, unknown>;
  routeabilityState: AccountMirrorConversationRouteabilityState;
  detailCompleteness: AccountMirrorConversationCompleteness;
  assetCompleteness: AccountMirrorConversationCompleteness;
  assetCounts: AccountMirrorConversationFreshness['assetCounts'];
  indexObservedAt: string | null;
  detailObservedAt: string | null;
  manifestObservedAt: string | null;
  conversationFingerprint: string;
  stateReasons: string[];
}): AccountMirrorConversationFreshnessState {
  const explicitState = normalizeFreshnessState(readString(input.explicit, ['state']));
  if (input.routeabilityState === 'guarded') {
    input.stateReasons.push('provider_guard_active');
    return 'guarded';
  }
  if (
    input.routeabilityState === 'not_found_or_unavailable' ||
    input.routeabilityState === 'identity_mismatch'
  ) {
    input.stateReasons.push(`routeability_${input.routeabilityState}`);
    return 'terminal_unavailable';
  }
  if (input.assetCounts.missingLocal > 0 || input.assetCompleteness === 'partial') {
    input.stateReasons.push('missing_local_assets');
    return 'missing_assets';
  }
  if (input.detailCompleteness === 'partial' || input.detailCompleteness === 'none') {
    input.stateReasons.push(`detail_${input.detailCompleteness}`);
    return 'partial';
  }
  if (isFingerprintChanged(input.explicit, input.conversationFingerprint)) {
    input.stateReasons.push('conversation_fingerprint_changed');
    return 'stale';
  }
  if (isObservedAfter(input.indexObservedAt, input.detailObservedAt)) {
    input.stateReasons.push('index_newer_than_detail');
    return 'stale';
  }
  if (isObservedAfter(input.indexObservedAt, input.manifestObservedAt)) {
    input.stateReasons.push('index_newer_than_manifest');
    return 'stale';
  }
  if (explicitState === 'stale') {
    input.stateReasons.push('explicit_stale');
    return 'stale';
  }
  if (input.detailCompleteness === 'complete') {
    input.stateReasons.push('detail_current');
    return 'fresh';
  }
  if (explicitState) {
    input.stateReasons.push(`explicit_${explicitState}`);
    return explicitState;
  }
  input.stateReasons.push('insufficient_freshness_evidence');
  return 'unknown';
}

function deriveRouteabilityState(input: {
  explicit: Record<string, unknown>;
  item: Record<string, unknown>;
  metadata: Record<string, unknown>;
  providerGuard?: AccountMirrorStatusEntry['providerGuard'] | null;
  targetReason?: string | null;
}): AccountMirrorConversationRouteabilityState {
  const explicitState = normalizeRouteabilityState(
    readString(input.explicit, ['routeabilityState']) ??
      readString(input.item, ['routeabilityState']) ??
      readString(input.metadata, ['routeabilityState']),
  );
  if (explicitState) return explicitState;
  const reason = [
    readString(input.explicit, ['reason', 'routeabilityReason']),
    readString(input.item, ['reason', 'routeabilityReason', 'failureReason', 'skipReason', 'error']),
    readString(input.metadata, ['reason', 'routeabilityReason', 'failureReason', 'skipReason', 'error']),
    input.targetReason,
  ].filter((value): value is string => Boolean(value)).join('\n');
  if (/conversation-not-found-or-unavailable/i.test(reason)) return 'not_found_or_unavailable';
  if (/identity[_ -]?mismatch|wrong managed browser profile/i.test(reason)) return 'identity_mismatch';
  if (/google\.com\/sorry|captcha|recaptcha|human.verification|anti-bot|provider[-_ ]guard/i.test(reason)) {
    return 'guarded';
  }
  if (input.providerGuard?.state === 'manual_clear_required' || input.providerGuard?.state === 'cooldown') {
    return 'guarded';
  }
  return 'unknown';
}

function deriveDetailCompleteness(input: {
  explicit: Record<string, unknown>;
  detail?: AccountMirrorConversationFreshnessInput['detail'];
  mirrorCompleteness?: AccountMirrorCompleteness | null;
}): AccountMirrorConversationCompleteness {
  const explicit = normalizeCompleteness(
    readString(input.explicit, ['detailCompleteness']),
  );
  if (explicit) return explicit;
  if (input.detail?.exists === true) return 'complete';
  if (input.mirrorCompleteness?.state === 'in_progress') return 'partial';
  if (input.mirrorCompleteness?.state === 'none') return 'none';
  if (input.mirrorCompleteness?.state === 'complete') return 'none';
  return 'unknown';
}

function deriveAssetCompleteness(input: {
  explicit: AccountMirrorConversationCompleteness | null;
  detailExists: boolean;
  assetCounts: AccountMirrorConversationFreshness['assetCounts'];
}): AccountMirrorConversationCompleteness {
  if (input.explicit) return input.explicit;
  if (input.assetCounts.missingLocal > 0) return 'partial';
  if (input.assetCounts.known > 0 && input.assetCounts.local === input.assetCounts.known) {
    return 'complete';
  }
  if (input.assetCounts.known > 0) return 'unknown';
  if (input.detailExists) return 'none';
  return 'unknown';
}

function readCompletenessOverride(
  explicit: Record<string, unknown>,
  item: Record<string, unknown>,
  metadata: Record<string, unknown>,
  field: string,
): AccountMirrorConversationCompleteness | null {
  return normalizeCompleteness(
    readString(explicit, [field]) ??
      readString(item, [field]) ??
      readString(metadata, [field]),
  );
}

function countAssetAvailability(assets: unknown[]): AccountMirrorConversationFreshness['assetCounts'] {
  let known = 0;
  let local = 0;
  let missingLocal = 0;
  for (const asset of assets) {
    if (!isRecord(asset)) continue;
    if (!hasKnownAssetEvidence(asset)) continue;
    known += 1;
    if (hasLocalAssetEvidence(asset)) {
      local += 1;
      continue;
    }
    if (hasMissingLocalEvidence(asset)) {
      missingLocal += 1;
    }
  }
  return { known, local, missingLocal };
}

function hasKnownAssetEvidence(asset: Record<string, unknown>): boolean {
  return Boolean(
    readString(asset, ['id', 'artifactId', 'fileId', 'mediaId', 'title', 'name', 'uri', 'url', 'href']) ||
      readString(readRecord(asset, 'metadata'), ['id', 'artifactId', 'fileId', 'mediaId', 'title', 'name', 'uri', 'url', 'href']),
  );
}

function hasLocalAssetEvidence(asset: Record<string, unknown>): boolean {
  if (readBoolean(asset, ['fileAvailable']) === true) return true;
  const metadata = readRecord(asset, 'metadata');
  return Boolean(
    readString(asset, [
      'localPath',
      'path',
      'filePath',
      'absolutePath',
      'assetStorageRelpath',
      'storageRelpath',
      'cacheKey',
      'checksumSha256',
    ]) ||
      readString(metadata, [
        'localPath',
        'path',
        'filePath',
        'absolutePath',
        'assetStorageRelpath',
        'storageRelpath',
        'cacheKey',
        'checksumSha256',
      ]),
  );
}

function hasMissingLocalEvidence(asset: Record<string, unknown>): boolean {
  const fileAvailable = readBoolean(asset, ['fileAvailable']);
  if (fileAvailable === false) return true;
  const status = readString(asset, ['status', 'assetStatus']);
  if (status === 'missing_local' || status === 'remote_only') return true;
  const metadata = readRecord(asset, 'metadata');
  const metadataStatus = readString(metadata, ['status', 'assetStatus']);
  if (metadataStatus === 'missing_local' || metadataStatus === 'remote_only') return true;
  return Boolean(
    readString(asset, ['uri', 'url', 'href', 'downloadUrl', 'downloadHref', 'remoteUrl', 'previewUrl', 'thumbnailUrl']) ||
      readString(metadata, ['uri', 'url', 'href', 'downloadUrl', 'downloadHref', 'remoteUrl', 'previewUrl', 'thumbnailUrl']),
  );
}

function latestMaterializedAt(assets: unknown[]): string | null {
  let latest: string | null = null;
  for (const asset of assets) {
    if (!isRecord(asset) || !hasLocalAssetEvidence(asset)) continue;
    const metadata = readRecord(asset, 'metadata');
    const candidate = normalizeIsoString(
      readString(asset, ['materializedAt', 'updatedAt', 'createdAt']) ??
        readString(metadata, ['materializedAt', 'updatedAt', 'createdAt']),
    );
    if (candidate && (!latest || Date.parse(candidate) > Date.parse(latest))) {
      latest = candidate;
    }
  }
  return latest;
}

function fingerprintConversation(
  item: unknown,
  detail: AccountMirrorConversationFreshnessInput['detail'] | undefined | null,
  assetCounts: AccountMirrorConversationFreshness['assetCounts'],
): string {
  const record = isRecord(item) ? item : {};
  const metadata = readRecord(record, 'metadata');
  const source = {
    id: readString(record, ['id', 'conversationId']),
    title: readString(record, ['title', 'name']),
    provider: readString(record, ['provider']),
    projectId: readString(record, ['projectId']),
    url: readString(record, ['url', 'providerUrl', 'conversationUrl', 'href']),
    updatedAt: readString(record, ['updatedAt', 'lastMessageAt', 'createdAt', 'timestamp']),
    latestTurnId: readString(record, ['latestTurnId', 'lastMessageId']) ?? readString(metadata, ['latestTurnId', 'lastMessageId']),
    messageCount: detail?.messageCount ?? readNumber(record, ['messageCount', 'messagesCount', 'turnCount']),
    fileCount: detail?.fileCount ?? readNumber(record, ['fileCount', 'filesCount', 'cachedFileCount']),
    artifactCount: detail?.artifactCount ?? readNumber(record, ['artifactCount', 'artifactsCount', 'cachedArtifactCount']),
    sourceCount: detail?.sourceCount ?? readNumber(record, ['sourceCount', 'sourcesCount', 'cachedSourceCount']),
    assetCounts,
  };
  const digest = createHash('sha256')
    .update(JSON.stringify(source))
    .digest('hex');
  return `sha256:${digest.slice(0, 32)}`;
}

function isFingerprintChanged(
  explicit: Record<string, unknown>,
  conversationFingerprint: string,
): boolean {
  const previous = readString(explicit, ['previousConversationFingerprint', 'priorConversationFingerprint']);
  return Boolean(previous && previous !== conversationFingerprint);
}

function isObservedAfter(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs > rightMs + 1000;
}

function readFreshnessRecord(item: unknown): Record<string, unknown> {
  if (!isRecord(item)) return {};
  const direct = item.conversationFreshness ?? item.freshness;
  if (isRecord(direct)) return direct;
  const metadata = readRecord(item, 'metadata');
  const nested = metadata.conversationFreshness ?? metadata.freshness;
  return isRecord(nested) ? nested : {};
}

function isConversationFreshness(value: unknown): value is AccountMirrorConversationFreshness {
  return isRecord(value) &&
    value.object === 'account_mirror_conversation_freshness' &&
    normalizeFreshnessState(readString(value, ['state'])) !== null;
}

function normalizeFreshnessState(value: string | null): AccountMirrorConversationFreshnessState | null {
  switch (value) {
    case 'fresh':
    case 'stale':
    case 'partial':
    case 'missing_assets':
    case 'terminal_unavailable':
    case 'guarded':
    case 'unknown':
      return value;
    default:
      return null;
  }
}

function normalizeRouteabilityState(value: string | null): AccountMirrorConversationRouteabilityState | null {
  switch (value) {
    case 'routeable':
    case 'not_found_or_unavailable':
    case 'identity_mismatch':
    case 'guarded':
    case 'unknown':
      return value;
    default:
      return null;
  }
}

function normalizeCompleteness(value: string | null): AccountMirrorConversationCompleteness | null {
  switch (value) {
    case 'none':
    case 'partial':
    case 'complete':
    case 'unknown':
      return value;
    default:
      return null;
  }
}

function normalizeIsoString(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

function normalizeRank(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function readRecord(value: Record<string, unknown>, field: string): Record<string, unknown> {
  const nested = value[field];
  return isRecord(nested) ? nested : {};
}

function readString(item: unknown, fields: string[]): string | null {
  if (!isRecord(item)) return null;
  for (const field of fields) {
    const value = item[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(item: unknown, fields: string[]): number | null {
  if (!isRecord(item)) return null;
  for (const field of fields) {
    const value = item[field];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function readBoolean(item: unknown, fields: string[]): boolean | null {
  if (!isRecord(item)) return null;
  for (const field of fields) {
    const value = item[field];
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
