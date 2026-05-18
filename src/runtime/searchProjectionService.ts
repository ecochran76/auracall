import type {
  AccountMirrorCatalogEntry,
  AccountMirrorCatalogService,
} from '../accountMirror/catalogService.js';
import type {
  RunArchiveItem,
  RunArchiveListRequest,
  RunArchiveService,
} from './archiveService.js';

export type SearchProjectionSource = 'account_mirror' | 'run_archive';

export interface SearchProjectionRequest {
  query?: string | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  tenant?: string | null;
  kind?: string | null;
  status?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface SearchProjectionRow {
  id: string;
  object: 'search_result_row';
  source: SearchProjectionSource;
  sourceKind: string;
  kind: string;
  title: string | null;
  summary: string | null;
  provider: string | null;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  tenant: string | null;
  projectId: string | null;
  status: string | null;
  runtimeState: RunArchiveItem['runtimeState'] | null;
  sortTime: string | null;
  updatedAt: string | null;
  itemId: string | null;
  counts: {
    messages: number | null;
    files: number;
    artifacts: number;
  };
  links: Record<string, string>;
  metadata: Record<string, unknown>;
}

export interface SearchProjectionFacetValue {
  value: string;
  count: number;
}

export interface SearchProjectionResult {
  object: 'search_results';
  generatedAt: string;
  query: {
    q: string | null;
    provider: string | null;
    runtimeProfile: string | null;
    tenant: string | null;
    kind: string | null;
    status: string | null;
    limit: number;
    cursor: string | null;
  };
  rows: SearchProjectionRow[];
  nextCursor: string | null;
  metrics: {
    total: number;
    returned: number;
  };
  facets: {
    providers: SearchProjectionFacetValue[];
    tenants: SearchProjectionFacetValue[];
    runtimeProfiles: SearchProjectionFacetValue[];
    kinds: SearchProjectionFacetValue[];
    statuses: SearchProjectionFacetValue[];
  };
}

export interface SearchProjectionService {
  search(request?: SearchProjectionRequest): Promise<SearchProjectionResult>;
}

interface NormalizedSearchProjectionRequest {
  query: string | null;
  provider: string | null;
  runtimeProfile: string | null;
  tenant: string | null;
  kind: string | null;
  status: string | null;
  limit: number;
  cursor: string | null;
}

export function createSearchProjectionService(input: {
  accountMirrorCatalogService: AccountMirrorCatalogService;
  runArchiveService: RunArchiveService;
  now?: () => Date;
}): SearchProjectionService {
  const now = input.now ?? (() => new Date());
  return {
    async search(request = {}) {
      const normalized = normalizeRequest(request);
      const [catalog, archive] = await Promise.all([
        input.accountMirrorCatalogService.readCatalog({
          provider: normalizeProvider(normalized.provider),
          runtimeProfileId: normalized.runtimeProfile,
          kind: 'all',
          limit: 500,
        }),
        input.runArchiveService.listItems({
          kind: archiveKindForSearchKind(normalized.kind),
          provider: normalized.provider,
          runtimeProfile: normalized.runtimeProfile,
          status: normalized.status,
          query: normalized.query,
          limit: 500,
        }),
      ]);
      const rows = [
        ...catalog.entries.flatMap((entry) => rowsFromCatalogEntry(entry)),
        ...archive.items.map(rowFromArchiveItem),
      ]
        .filter((row) => matchesSearchRequest(row, normalized))
        .sort(compareRows);
      const start = decodeCursor(normalized.cursor);
      const page = rows.slice(start, start + normalized.limit);
      const nextStart = start + page.length;
      return {
        object: 'search_results',
        generatedAt: now().toISOString(),
        query: {
          q: normalized.query,
          provider: normalized.provider,
          runtimeProfile: normalized.runtimeProfile,
          tenant: normalized.tenant,
          kind: normalized.kind,
          status: normalized.status,
          limit: normalized.limit,
          cursor: normalized.cursor,
        },
        rows: page,
        nextCursor: nextStart < rows.length ? encodeCursor(nextStart) : null,
        metrics: {
          total: rows.length,
          returned: page.length,
        },
        facets: {
          providers: facet(rows, (row) => row.provider),
          tenants: facet(rows, (row) => row.tenant),
          runtimeProfiles: facet(rows, (row) => row.runtimeProfileId),
          kinds: facet(rows, (row) => row.kind),
          statuses: facet(rows, (row) => row.status),
        },
      };
    },
  };
}

function rowsFromCatalogEntry(entry: AccountMirrorCatalogEntry): SearchProjectionRow[] {
  const rows: SearchProjectionRow[] = [];
  for (const kind of ['projects', 'conversations', 'artifacts', 'files', 'media'] as const) {
    for (const item of entry.manifests[kind]) {
      rows.push(rowFromCatalogItem(entry, kind, item));
    }
  }
  return rows;
}

function rowFromCatalogItem(
  entry: AccountMirrorCatalogEntry,
  sourceKind: 'projects' | 'conversations' | 'artifacts' | 'files' | 'media',
  item: unknown,
): SearchProjectionRow {
  const itemId = readItemId(item);
  const kind = catalogKindToSearchKind(sourceKind);
  const provider = readString(item, ['provider']) ?? entry.provider;
  const runtimeProfileId = entry.runtimeProfileId;
  const sortTime = readItemTime(item, provider, itemId);
  const params = new URLSearchParams({
    provider,
    runtimeProfile: runtimeProfileId,
    kind: sourceKind,
  });
  const url = readString(item, ['url', 'providerUrl', 'conversationUrl', 'href']);
  return {
    id: `catalog:${sourceKind}:${provider}:${runtimeProfileId}:${itemId}`,
    object: 'search_result_row',
    source: 'account_mirror',
    sourceKind,
    kind,
    title: readString(item, ['title', 'name', 'fileName', 'prompt', 'summary']) ?? itemId,
    summary: readString(item, ['summary', 'description', 'snippet']),
    provider,
    runtimeProfileId,
    browserProfileId: entry.browserProfileId,
    tenant: entry.boundIdentityKey,
    projectId: readString(item, ['projectId', 'projectName', 'projectTitle', 'workspaceName']),
    status: readString(item, ['status', 'state']) ?? entry.status,
    runtimeState: null,
    sortTime,
    updatedAt: sortTime,
    itemId,
    counts: {
      messages: readNumber(item, ['messageCount', 'messagesCount', 'turnCount']),
      files: readNumber(item, ['fileCount', 'filesCount', 'cachedFileCount', 'attachmentCount', 'attachmentsCount']) ?? 0,
      artifacts: readNumber(item, ['artifactCount', 'artifactsCount', 'cachedArtifactCount']) ?? 0,
    },
    links: {
      catalogItem: `/v1/account-mirrors/catalog/items/${encodeURIComponent(itemId)}?${params.toString()}`,
      ...(url ? { provider: url } : {}),
    },
    metadata: {
      mirrorReason: entry.reason,
      mirrorCompleteness: entry.mirrorCompleteness,
      raw: item,
    },
  };
}

function rowFromArchiveItem(item: RunArchiveItem): SearchProjectionRow {
  const runtimeState = item.runtimeState ?? null;
  const rawStatus = item.status;
  return {
    id: `archive:${item.id}`,
    object: 'search_result_row',
    source: 'run_archive',
    sourceKind: item.kind,
    kind: archiveKindToSearchKind(item.kind),
    title: item.title ?? item.fileName ?? item.artifactId ?? item.id,
    summary: null,
    provider: item.provider,
    runtimeProfileId: item.runtimeProfile,
    browserProfileId: item.browserProfile,
    tenant: item.boundIdentityKey,
    projectId: item.projectId,
    status: displayStatusFromArchiveItem(rawStatus, runtimeState),
    runtimeState,
    sortTime: item.updatedAt ?? item.createdAt,
    updatedAt: item.updatedAt ?? item.createdAt,
    itemId: item.id,
    counts: {
      messages: null,
      files: item.kind === 'upload' ? 1 : 0,
      artifacts: item.kind === 'generated_artifact' ? 1 : 0,
    },
    links: {
      archiveItem: `/v1/archive/items/b64/${Buffer.from(item.id, 'utf8').toString('base64url')}`,
      ...item.links,
    },
    metadata: {
      responseId: item.responseId,
      batchId: item.batchId,
      agentId: item.agentId,
      teamId: item.teamId,
      rawStatus,
      runtimeState,
      localPath: item.localPath,
      fileAvailable: item.fileAvailable,
      raw: item.metadata,
    },
  };
}

function displayStatusFromArchiveItem(
  status: string | null,
  runtimeState: RunArchiveItem['runtimeState'] | null,
): string | null {
  if (!runtimeState || runtimeState === 'terminal') return status;
  return runtimeState;
}

function matchesSearchRequest(row: SearchProjectionRow, request: NormalizedSearchProjectionRequest) {
  if (request.provider && row.provider !== request.provider) return false;
  if (request.runtimeProfile && row.runtimeProfileId !== request.runtimeProfile) return false;
  if (request.tenant && row.tenant !== request.tenant) return false;
  if (request.status && row.status !== request.status && row.runtimeState !== request.status) return false;
  if (request.kind && !searchKindMatches(row, request.kind)) return false;
  if (!request.query) return true;
  const needle = request.query.toLowerCase();
  const haystack = [
    row.id,
    row.kind,
    row.sourceKind,
    row.title,
    row.summary,
    row.provider,
    row.runtimeProfileId,
    row.tenant,
    row.projectId,
    row.status,
    row.runtimeState,
    row.itemId,
    JSON.stringify(row.metadata),
  ].filter((value): value is string => typeof value === 'string').join('\n').toLowerCase();
  return haystack.includes(needle);
}

function searchKindMatches(row: SearchProjectionRow, kind: string): boolean {
  if (kind === 'all') return true;
  if (kind === row.kind || kind === row.sourceKind) return true;
  if (kind === 'run') return ['response', 'response_batch', 'team_run', 'media_generation'].includes(row.sourceKind);
  if (kind === 'artifact') return row.kind === 'artifact' || row.sourceKind === 'generated_artifact';
  if (kind === 'upload') return row.kind === 'upload' || row.sourceKind === 'files';
  if (kind === 'conversation') return row.kind === 'conversation' || row.sourceKind === 'provider_conversation';
  return false;
}

function compareRows(left: SearchProjectionRow, right: SearchProjectionRow): number {
  const leftTime = Date.parse(left.sortTime ?? '');
  const rightTime = Date.parse(right.sortTime ?? '');
  const leftHasTime = Number.isFinite(leftTime);
  const rightHasTime = Number.isFinite(rightTime);
  if (leftHasTime !== rightHasTime) return leftHasTime ? -1 : 1;
  if (leftHasTime && rightHasTime && leftTime !== rightTime) return rightTime - leftTime;
  return String(left.title ?? '').localeCompare(String(right.title ?? '')) || left.id.localeCompare(right.id);
}

function normalizeRequest(request: SearchProjectionRequest): NormalizedSearchProjectionRequest {
  return {
    query: normalizeString(request.query),
    provider: normalizeString(request.provider),
    runtimeProfile: normalizeString(request.runtimeProfile),
    tenant: normalizeString(request.tenant),
    kind: normalizeString(request.kind),
    status: normalizeString(request.status),
    limit: normalizeLimit(request.limit),
    cursor: normalizeString(request.cursor),
  };
}

function normalizeProvider(value: string | null): 'chatgpt' | 'gemini' | 'grok' | null {
  if (value === 'chatgpt' || value === 'gemini' || value === 'grok') return value;
  return null;
}

function archiveKindForSearchKind(kind: string | null): RunArchiveListRequest['kind'] {
  if (!kind || kind === 'all') return 'all';
  if (kind === 'conversation') return 'provider_conversation';
  if (kind === 'artifact') return 'generated_artifact';
  if (kind === 'run') return 'all';
  if (
    kind === 'response' ||
    kind === 'response_batch' ||
    kind === 'team_run' ||
    kind === 'media_generation' ||
    kind === 'upload' ||
    kind === 'generated_artifact' ||
    kind === 'provider_conversation' ||
    kind === 'evidence'
  ) {
    return kind;
  }
  return 'all';
}

function catalogKindToSearchKind(kind: string): string {
  if (kind === 'conversations') return 'conversation';
  if (kind === 'artifacts') return 'artifact';
  if (kind === 'files') return 'upload';
  if (kind === 'projects') return 'project';
  if (kind === 'media') return 'media';
  return kind;
}

function archiveKindToSearchKind(kind: string): string {
  if (kind === 'provider_conversation') return 'conversation';
  if (kind === 'generated_artifact') return 'artifact';
  if (['response', 'response_batch', 'team_run', 'media_generation'].includes(kind)) return 'run';
  return kind;
}

function readItemId(item: unknown): string {
  return readString(item, ['id', 'conversationId', 'projectId', 'artifactId', 'fileId', 'mediaId', 'url', 'href']) ?? 'unknown';
}

function readItemTime(item: unknown, provider: string | null, itemId: string): string | null {
  const explicit = readString(item, ['updatedAt', 'lastMessageAt', 'createdAt', 'createTime', 'timestamp', 'time']);
  if (explicit) return explicit;
  const timestampPrefix = itemId.match(/^([0-9a-f]{8})-/iu)?.[1];
  if (provider === 'chatgpt' && timestampPrefix) {
    const timestamp = Number.parseInt(timestampPrefix, 16) * 1000;
    const earliest = Date.UTC(2022, 0, 1);
    const latest = Date.now() + 24 * 60 * 60 * 1000;
    if (Number.isFinite(timestamp) && timestamp >= earliest && timestamp <= latest) {
      return new Date(timestamp).toISOString();
    }
  }
  return null;
}

function readString(item: unknown, fields: string[]): string | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(item: unknown, fields: string[]): number | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 80;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };
    return typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0 ? parsed.offset : 0;
  } catch {
    return 0;
  }
}

function facet(rows: SearchProjectionRow[], reader: (row: SearchProjectionRow) => string | null): SearchProjectionFacetValue[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = reader(row);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}
