import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getRuntimeDir } from './store.js';
import { ExecutionRequestSchema } from './apiSchema.js';
import type {
  ExecutionRequest,
  ExecutionResponse,
  ExecutionResponseStatus,
  ExecutionRuntimeDiagnosticsSummary,
} from './apiTypes.js';
import type { ExecutionRuntimeControlContract } from './contract.js';
import type { ExecutionResponsesService } from './responsesService.js';
import type { ExecutionRunStoredRecord } from './store.js';
import { refreshRunArchiveIndexBestEffort } from './archiveIndexRefresh.js';
import {
  normalizeResponseBatchDispatchRequest,
  ResponseBatchDispatchRequestSchema,
  type ResponseBatchDispatchJobAssignment,
  type ResponseBatchDispatchRecord,
  type ResponseBatchDispatchRequest,
  type ResponseBatchDispatchResolution,
} from './responseBatchDispatchPool.js';

const RESPONSE_BATCHES_DIRNAME = 'response-batches';
const RECORD_FILENAME = 'record.json';

// biome-ignore lint/style/useNamingConvention: exported schema names follow the runtime API schema convention.
export const ResponseBatchCreateRequestSchema = z.object({
  id: z.string().trim().min(1).optional(),
  team: z.string().trim().min(1).optional(),
  dispatch: ResponseBatchDispatchRequestSchema.optional(),
  dispatchResolution: z
    .object({
      requests: z.array(ExecutionRequestSchema),
      dispatch: z.object({
        team: z.string().trim().min(1),
        mode: z.literal('next_available'),
        projectSync: z.literal('none'),
        memberCount: z.number().int().nonnegative(),
        projectName: z.string().nullable().optional(),
        warnings: z.array(z.string()),
      }),
      assignments: z.array(z.object({
        team: z.string().trim().min(1),
        mode: z.literal('next_available'),
        memberAgent: z.string().trim().min(1),
        memberIndex: z.number().int().min(0),
      })),
    })
    .optional(),
  requests: z.array(ExecutionRequestSchema).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  limits: z
    .object({
      maxConcurrentRuns: z.number().int().positive().optional(),
      maxBrowserInteractionsPerMinute: z.number().int().positive().optional(),
    })
    .optional(),
});

export type ResponseBatchCreateRequest = z.infer<typeof ResponseBatchCreateRequestSchema>;

export interface ResponseBatchJobRecord {
  index: number;
  responseId: string;
  model: string;
  agent: string | null;
  service: string | null;
  runtimeProfile: string | null;
  dispatch?: ResponseBatchDispatchJobAssignment | null;
  createdAt: string;
}

export interface ResponseBatchRecord {
  id: string;
  object: 'response_batch';
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  limits: {
    maxConcurrentRuns: number | null;
    maxBrowserInteractionsPerMinute: number | null;
  };
  dispatch?: ResponseBatchDispatchRecord | null;
  jobs: ResponseBatchJobRecord[];
}

export interface ResponseBatchJobStatus extends ResponseBatchJobRecord {
  status: ExecutionResponseStatus | 'missing';
  completedAt: string | null;
  failure: unknown | null;
  diagnostics?: ExecutionRuntimeDiagnosticsSummary | null;
  runtimeState?: ExecutionRuntimeDiagnosticsSummary['runtimeState'] | null;
}

export interface ResponseBatchStatus {
  id: string;
  object: 'response_batch_status';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'mixed_terminal';
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  limits: ResponseBatchRecord['limits'];
  dispatch: ResponseBatchDispatchRecord | null;
  counts: {
    total: number;
    in_progress: number;
    completed: number;
    failed: number;
    cancelled: number;
    missing: number;
  };
  jobs: ResponseBatchJobStatus[];
}

export interface ResponseBatchStore {
  readBatch(id: string): Promise<ResponseBatchRecord | null>;
  writeBatch(record: ResponseBatchRecord): Promise<ResponseBatchRecord>;
  listBatches?(options?: { limit?: number | null }): Promise<ResponseBatchRecord[]>;
}

export interface ResponseBatchService {
  createBatch(input: ResponseBatchCreateRequest): Promise<ResponseBatchStatus>;
  readBatchStatus(id: string): Promise<ResponseBatchStatus | null>;
}

export interface ResponseBatchServiceDeps {
  responsesService: Pick<ExecutionResponsesService, 'createResponse' | 'readResponse'>;
  resolveDispatchPool?: (input: {
    dispatch: ResponseBatchDispatchRequest;
    requests: ExecutionRequest[];
  }) => Promise<ResponseBatchDispatchResolution>;
  now?: () => Date;
  generateBatchId?: () => string;
  store?: ResponseBatchStore;
  refreshArchiveIndex?: boolean;
}

export interface ResponseBatchExecutionGateDeps {
  control: ExecutionRuntimeControlContract;
  now?: () => Date;
}

export function createResponseBatchService(deps: ResponseBatchServiceDeps): ResponseBatchService {
  const now = deps.now ?? (() => new Date());
  const generateBatchId = deps.generateBatchId ?? (() => `batch_${randomUUID().replace(/-/g, '')}`);
  const store = deps.store ?? createResponseBatchStore();
  const refreshArchiveIndex = deps.refreshArchiveIndex ?? true;

  return {
    async createBatch(input) {
      const payload = ResponseBatchCreateRequestSchema.parse(input);
      const id = payload.id ?? generateBatchId();
      const createdAt = now().toISOString();
      const dispatchRequest = normalizeResponseBatchDispatchRequest(payload);
      const dispatchResolution = await resolveDispatchResolution({
        dispatch: dispatchRequest,
        payloadResolution: payload.dispatchResolution,
        requests: payload.requests,
        resolver: deps.resolveDispatchPool,
      });
      const requests = dispatchResolution?.requests ?? payload.requests;
      const limits = {
        maxConcurrentRuns: payload.limits?.maxConcurrentRuns ?? null,
        maxBrowserInteractionsPerMinute: payload.limits?.maxBrowserInteractionsPerMinute ?? null,
      };
      const jobs: ResponseBatchJobRecord[] = [];
      for (const [index, request] of requests.entries()) {
        const assignment = dispatchResolution?.assignments[index] ?? null;
        const response = await deps.responsesService.createResponse(
          withBatchMetadata(request, id, index, limits, dispatchResolution?.dispatch ?? null, assignment),
        );
        jobs.push({
          index,
          responseId: response.id,
          model: request.model,
          agent: request.auracall?.agent ?? null,
          service: request.auracall?.service ?? null,
          runtimeProfile: request.auracall?.runtimeProfile ?? null,
          dispatch: assignment,
          createdAt,
        });
      }
      const record: ResponseBatchRecord = {
        id,
        object: 'response_batch',
        createdAt,
        updatedAt: createdAt,
        metadata: payload.metadata ?? {},
        limits,
        dispatch: dispatchResolution?.dispatch ?? null,
        jobs,
      };
      await store.writeBatch(record);
      if (refreshArchiveIndex) {
        await refreshRunArchiveIndexBestEffort({ batchId: id });
      }
      return summarizeBatchStatus(record, deps.responsesService);
    },

    async readBatchStatus(id) {
      const record = await store.readBatch(id);
      if (!record) return null;
      return summarizeBatchStatus(record, deps.responsesService);
    },
  };
}

export function createResponseBatchStore(): ResponseBatchStore {
  return {
    readBatch: readResponseBatchRecord,
    writeBatch: writeResponseBatchRecord,
    listBatches: listResponseBatchRecords,
  };
}

export function getResponseBatchesDir(): string {
  return path.join(getRuntimeDir(), RESPONSE_BATCHES_DIRNAME);
}

export function createResponseBatchExecutionGate(deps: ResponseBatchExecutionGateDeps) {
  const now = deps.now ?? (() => new Date());
  return async (record: ExecutionRunStoredRecord): Promise<{ allowed: true } | { allowed: false; reason: string }> => {
    const batchMetadata = readResponseBatchRunMetadata(record);
    if (!batchMetadata) return { allowed: true };

    if (batchMetadata.limits.maxConcurrentRuns !== null) {
      const activeCount = await countActiveBatchRuns(deps.control, batchMetadata.batchId, record.runId);
      if (activeCount >= batchMetadata.limits.maxConcurrentRuns) {
        return {
          allowed: false,
          reason: `response batch ${batchMetadata.batchId} concurrency limit reached: ${activeCount}/${batchMetadata.limits.maxConcurrentRuns}`,
        };
      }
    }

    if (batchMetadata.limits.maxBrowserInteractionsPerMinute !== null) {
      const startedCount = await countRecentlyStartedBatchRuns(deps.control, {
        batchId: batchMetadata.batchId,
        now: now(),
        windowMs: 60_000,
      });
      if (startedCount >= batchMetadata.limits.maxBrowserInteractionsPerMinute) {
        return {
          allowed: false,
          reason: `response batch ${batchMetadata.batchId} browser interaction rate limit reached: ${startedCount}/${batchMetadata.limits.maxBrowserInteractionsPerMinute} per minute`,
        };
      }
    }

    return { allowed: true };
  };
}

function getResponseBatchRecordPath(id: string): string {
  return path.join(getResponseBatchesDir(), id, RECORD_FILENAME);
}

async function readResponseBatchRecord(id: string): Promise<ResponseBatchRecord | null> {
  try {
    const raw = await fs.readFile(getResponseBatchRecordPath(id), 'utf8');
    return RESPONSE_BATCH_RECORD_SCHEMA.parse(JSON.parse(raw));
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeResponseBatchRecord(record: ResponseBatchRecord): Promise<ResponseBatchRecord> {
  const parsed = RESPONSE_BATCH_RECORD_SCHEMA.parse(record);
  const recordPath = getResponseBatchRecordPath(record.id);
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  const tempPath = `${recordPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, recordPath);
  return parsed;
}

export async function listResponseBatchRecords(options: { limit?: number | null } = {}): Promise<ResponseBatchRecord[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(getResponseBatchesDir(), { withFileTypes: true });
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return [];
    throw error;
  }
  const records = (
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readResponseBatchRecord(entry.name)),
    )
  ).filter((record): record is ResponseBatchRecord => record !== null);
  records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  if (typeof options.limit === 'number' && options.limit >= 0) {
    return records.slice(0, options.limit);
  }
  return records;
}

async function summarizeBatchStatus(
  record: ResponseBatchRecord,
  responsesService: Pick<ExecutionResponsesService, 'readResponse'>,
): Promise<ResponseBatchStatus> {
  const jobs: ResponseBatchJobStatus[] = [];
  for (const job of record.jobs) {
    const { response, readFailure } = await readBatchJobResponse(responsesService, job.responseId);
    const diagnostics = response?.metadata?.executionSummary?.runtimeDiagnosticsSummary ?? null;
    jobs.push({
      ...job,
      status: response?.status ?? 'missing',
      completedAt: (response?.metadata?.executionSummary?.completedAt as string | null | undefined) ?? null,
      failure: readFailure ?? response?.metadata?.executionSummary?.failureSummary ?? null,
      diagnostics,
      runtimeState: diagnostics?.runtimeState ?? null,
    });
  }
  const counts = {
    total: jobs.length,
    in_progress: jobs.filter((job) => job.status === 'in_progress').length,
    completed: jobs.filter((job) => job.status === 'completed').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
    cancelled: jobs.filter((job) => job.status === 'cancelled').length,
    missing: jobs.filter((job) => job.status === 'missing').length,
  };
  return {
    id: record.id,
    object: 'response_batch_status',
    status: resolveBatchStatus(counts),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    metadata: record.metadata,
    limits: record.limits,
    dispatch: record.dispatch ?? null,
    counts,
    jobs,
  };
}

async function readBatchJobResponse(
  responsesService: Pick<ExecutionResponsesService, 'readResponse'>,
  responseId: string,
): Promise<{
  response: ExecutionResponse | null;
  readFailure: { code: 'response_read_failed'; message: string } | null;
}> {
  try {
    return {
      response: await responsesService.readResponse(responseId),
      readFailure: null,
    };
  } catch (error) {
    return {
      response: null,
      readFailure: {
        code: 'response_read_failed',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function resolveBatchStatus(counts: ResponseBatchStatus['counts']): ResponseBatchStatus['status'] {
  if (counts.in_progress > 0) return 'running';
  if (counts.missing > 0) return 'failed';
  if (counts.failed > 0 && counts.completed + counts.cancelled + counts.failed === counts.total) return 'failed';
  if (counts.cancelled > 0 && counts.completed + counts.cancelled === counts.total) return 'cancelled';
  if (counts.completed === counts.total) return 'completed';
  if (counts.failed > 0 || counts.cancelled > 0) return 'mixed_terminal';
  return 'queued';
}

function withBatchMetadata(
  request: ExecutionRequest,
  batchId: string,
  batchIndex: number,
  limits: ResponseBatchRecord['limits'],
  dispatch: ResponseBatchDispatchRecord | null,
  assignment: ResponseBatchDispatchJobAssignment | null,
): ExecutionRequest {
  return {
    ...request,
    metadata: {
      ...(request.metadata ?? {}),
      batchId,
      batchIndex,
      batchLimits: limits,
      ...(dispatch && assignment
        ? {
            batchDispatch: {
              team: dispatch.team,
              mode: dispatch.mode,
              projectSync: dispatch.projectSync,
              memberAgent: assignment.memberAgent,
              memberIndex: assignment.memberIndex,
            },
          }
        : {}),
    },
  };
}

async function resolveDispatchResolution(input: {
  dispatch: ResponseBatchDispatchRequest | null;
  payloadResolution: ResponseBatchDispatchResolution | undefined;
  requests: ExecutionRequest[];
  resolver: ResponseBatchServiceDeps['resolveDispatchPool'];
}): Promise<ResponseBatchDispatchResolution | null> {
  if (!input.dispatch) return null;
  if (input.payloadResolution) {
    assertDispatchResolutionMatches(input.dispatch, input.payloadResolution);
    return input.payloadResolution;
  }
  if (!input.resolver) {
    throw new Error(
      `Response batch dispatch team "${input.dispatch.team}" requires a dispatch-pool resolver in this runtime surface.`,
    );
  }
  const resolution = await input.resolver({
    dispatch: input.dispatch,
    requests: input.requests,
  });
  assertDispatchResolutionMatches(input.dispatch, resolution);
  return resolution;
}

function assertDispatchResolutionMatches(
  dispatch: ResponseBatchDispatchRequest,
  resolution: ResponseBatchDispatchResolution,
): void {
  if (resolution.dispatch.team !== dispatch.team) {
    throw new Error(
      `Response batch dispatch resolution team "${resolution.dispatch.team}" does not match requested team "${dispatch.team}".`,
    );
  }
  if (resolution.requests.length !== resolution.assignments.length) {
    throw new Error('Response batch dispatch resolution must provide one assignment per expanded request.');
  }
}

function readResponseBatchRunMetadata(record: ExecutionRunStoredRecord): {
  batchId: string;
  limits: ResponseBatchRecord['limits'];
} | null {
  const metadata = readRecord(record.bundle.run.initialInputs.metadata);
  if (!metadata) return null;
  const batchId = typeof metadata.batchId === 'string' ? metadata.batchId : null;
  if (!batchId) return null;
  const rawLimits = readRecord(metadata.batchLimits);
  return {
    batchId,
    limits: {
      maxConcurrentRuns: readNullablePositiveInteger(rawLimits?.maxConcurrentRuns),
      maxBrowserInteractionsPerMinute: readNullablePositiveInteger(rawLimits?.maxBrowserInteractionsPerMinute),
    },
  };
}

async function countActiveBatchRuns(
  control: ExecutionRuntimeControlContract,
  batchId: string,
  excludingRunId: string,
): Promise<number> {
  const records = await control.listRuns({ sourceKind: 'direct' });
  return records.filter((record) => {
    if (record.runId === excludingRunId) return false;
    if (readResponseBatchRunMetadata(record)?.batchId !== batchId) return false;
    if (['succeeded', 'failed', 'cancelled'].includes(record.bundle.run.status)) return false;
    return record.bundle.leases.some((lease) => lease.status === 'active');
  }).length;
}

async function countRecentlyStartedBatchRuns(
  control: ExecutionRuntimeControlContract,
  input: {
    batchId: string;
    now: Date;
    windowMs: number;
  },
): Promise<number> {
  const cutoff = input.now.getTime() - input.windowMs;
  const records = await control.listRuns({ sourceKind: 'direct' });
  return records.reduce((count, record) => {
    if (readResponseBatchRunMetadata(record)?.batchId !== input.batchId) return count;
    return (
      count +
      record.bundle.events.filter((event) => {
        if (event.type !== 'step-started') return false;
        const createdAt = Date.parse(event.createdAt);
        return Number.isFinite(createdAt) && createdAt >= cutoff;
      }).length
    );
  }, 0);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readNullablePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

const RESPONSE_BATCH_JOB_RECORD_SCHEMA: z.ZodType<ResponseBatchJobRecord> = z.object({
  index: z.number().int().min(0),
  responseId: z.string(),
  model: z.string(),
  agent: z.string().nullable(),
  service: z.string().nullable(),
  runtimeProfile: z.string().nullable(),
  dispatch: z
    .object({
      team: z.string(),
      mode: z.literal('next_available'),
      memberAgent: z.string(),
      memberIndex: z.number().int().min(0),
    })
    .nullable()
    .optional(),
  createdAt: z.string(),
});

const RESPONSE_BATCH_RECORD_SCHEMA: z.ZodType<ResponseBatchRecord> = z.object({
  id: z.string(),
  object: z.literal('response_batch'),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  limits: z.object({
    maxConcurrentRuns: z.number().int().positive().nullable(),
    maxBrowserInteractionsPerMinute: z.number().int().positive().nullable(),
  }),
  dispatch: z
    .object({
      team: z.string(),
      mode: z.literal('next_available'),
      projectSync: z.literal('none'),
      memberCount: z.number().int().nonnegative(),
      projectName: z.string().nullable().optional(),
      warnings: z.array(z.string()),
    })
    .nullable()
    .optional(),
  jobs: z.array(RESPONSE_BATCH_JOB_RECORD_SCHEMA),
});

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
