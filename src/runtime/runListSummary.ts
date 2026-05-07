import type { ExecutionRunStoredRecord } from './store.js';
import type { ExecutionRunServiceId, ExecutionRunSourceKind, ExecutionRunStatus } from './types.js';

export interface ExecutionRunListItem {
  runId: string;
  sourceKind: ExecutionRunSourceKind;
  teamRunId: string | null;
  taskRunSpecId: string | null;
  status: ExecutionRunStatus;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
  runnableStepCount: number;
  runningStepCount: number;
  serviceIds: string[];
  runtimeProfileIds: string[];
  providerConversationSummary: ExecutionRunListProviderConversationSummary;
}

export interface ExecutionRunListProviderConversationSummary {
  count: number;
  providers: Array<Exclude<ExecutionRunServiceId, null>>;
  conversations: ExecutionRunListProviderConversationRef[];
  firstConversationId: string | null;
  firstProvider: Exclude<ExecutionRunServiceId, null> | null;
  firstCatalogItemPath: string | null;
  firstAccountMirrorPath: string | null;
}

export interface ExecutionRunListProviderConversationRef {
  provider: Exclude<ExecutionRunServiceId, null>;
  conversationId: string;
  runtimeProfileId: string | null;
  catalogItemPath: string;
  accountMirrorPath: string;
}

export function summarizeExecutionRunListItem(record: ExecutionRunStoredRecord): ExecutionRunListItem {
  const run = record.bundle.run;
  const steps = record.bundle.steps;
  return {
    runId: run.id,
    sourceKind: run.sourceKind,
    teamRunId: run.sourceKind === 'team-run' ? run.sourceId : null,
    taskRunSpecId: run.taskRunSpecId ?? null,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    stepCount: steps.length,
    runnableStepCount: steps.filter((step) => step.status === 'runnable').length,
    runningStepCount: steps.filter((step) => step.status === 'running').length,
    serviceIds: uniqueStrings(steps.map((step) => step.service).filter(Boolean)),
    runtimeProfileIds: uniqueStrings(steps.map((step) => step.runtimeProfileId).filter(Boolean)),
    providerConversationSummary: summarizeProviderConversations(record),
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function summarizeProviderConversations(record: ExecutionRunStoredRecord): ExecutionRunListProviderConversationSummary {
  const refs: Array<{
    provider: Exclude<ExecutionRunServiceId, null>;
    conversationId: string;
    runtimeProfileId: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const step of record.bundle.steps.slice().sort((left, right) => left.order - right.order)) {
    const browserRun = isRecord(step.output?.structuredData?.browserRun)
      ? step.output.structuredData.browserRun
      : null;
    if (!browserRun) continue;
    const provider = normalizeProvider(readRecordString(browserRun, ['provider', 'service']) ?? step.service);
    const conversationId = readRecordString(browserRun, ['conversationId', 'conversation_id']);
    if (!provider || !conversationId) continue;
    const runtimeProfileId = readRecordString(browserRun, ['runtimeProfileId', 'runtimeProfile']) ?? step.runtimeProfileId;
    const key = [provider, runtimeProfileId ?? '', conversationId].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ provider, conversationId, runtimeProfileId });
  }
  const first = refs[0] ?? null;
  return {
    count: refs.length,
    providers: uniqueStrings(refs.map((ref) => ref.provider)) as Array<Exclude<ExecutionRunServiceId, null>>,
    conversations: refs.map((ref) => ({
      ...ref,
      catalogItemPath: buildCatalogItemPath(ref),
      accountMirrorPath: buildAccountMirrorPath(ref),
    })),
    firstConversationId: first?.conversationId ?? null,
    firstProvider: first?.provider ?? null,
    firstCatalogItemPath: first ? buildCatalogItemPath(first) : null,
    firstAccountMirrorPath: first ? buildAccountMirrorPath(first) : null,
  };
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

function buildAccountMirrorPath(input: {
  provider: Exclude<ExecutionRunServiceId, null>;
  conversationId: string;
  runtimeProfileId: string | null;
}): string {
  const params = new URLSearchParams({
    provider: input.provider,
    kind: 'conversations',
    item: input.conversationId,
    itemKind: 'conversations',
    itemProvider: input.provider,
  });
  if (input.runtimeProfileId) {
    params.set('runtimeProfile', input.runtimeProfileId);
    params.set('itemRuntimeProfile', input.runtimeProfileId);
  }
  return `/account-mirror?${params.toString()}`;
}

function normalizeProvider(value: unknown): Exclude<ExecutionRunServiceId, null> | null {
  if (value === 'chatgpt' || value === 'gemini' || value === 'grok') return value;
  return null;
}

function readRecordString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
