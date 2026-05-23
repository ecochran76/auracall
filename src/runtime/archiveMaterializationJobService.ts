import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ArchiveMaterializationError,
  type ArchiveItemMaterializationResult,
  type ArchiveMaterializationService,
} from './archiveMaterializationService.js';
import { getRunArchiveDir } from './archiveIndexStore.js';

export type ArchiveMaterializationJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'skipped'
  | 'failed'
  | 'cancelled';

export interface ArchiveMaterializationJob {
  object: 'run_archive_materialization_job';
  id: string;
  archiveItemId: string;
  force?: boolean;
  status: ArchiveMaterializationJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attemptCount: number;
  result: ArchiveItemMaterializationResult | null;
  error: {
    message: string;
    type: 'invalid_request_error' | 'not_found_error' | 'provider_auth_conflict' | 'internal_error';
    statusCode: number;
  } | null;
  message: string;
}

export interface ArchiveMaterializationJobCreateResult {
  object: 'run_archive_materialization_job_create_result';
  generatedAt: string;
  reused: boolean;
  job: ArchiveMaterializationJob;
}

export interface ArchiveMaterializationJobListRequest {
  status?: ArchiveMaterializationJobStatus | 'active' | 'terminal' | null;
  archiveItemId?: string | null;
  limit?: number | null;
}

export interface ArchiveMaterializationJobListResult {
  object: 'run_archive_materialization_jobs';
  generatedAt: string;
  status: ArchiveMaterializationJobListRequest['status'] | null;
  archiveItemId: string | null;
  limit: number;
  jobs: ArchiveMaterializationJob[];
  metrics: {
    total: number;
    byStatus: Record<string, number>;
    active: number;
    terminal: number;
  };
}

export interface ArchiveMaterializationJobService {
  createJob(request: { archiveItemId: string; force?: boolean | null }): Promise<ArchiveMaterializationJobCreateResult>;
  listJobs(request?: ArchiveMaterializationJobListRequest): Promise<ArchiveMaterializationJobListResult>;
  readJob(id: string): Promise<ArchiveMaterializationJob | null>;
  cancelJob(id: string): Promise<ArchiveMaterializationJob>;
  runJob(id: string): Promise<ArchiveMaterializationJob>;
  recoverInterruptedJobs(): Promise<number>;
}

export class ArchiveMaterializationJobControlError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 | 409 = 400,
    readonly type = statusCode === 404 ? 'not_found_error' : statusCode === 409 ? 'conflict_error' : 'invalid_request_error',
  ) {
    super(message);
    this.name = 'ArchiveMaterializationJobControlError';
  }
}

export interface ArchiveMaterializationJobServiceDeps {
  materializationService: ArchiveMaterializationService;
  store?: ArchiveMaterializationJobStore;
  now?: () => Date;
  generateId?: () => string;
  schedule?: (work: () => Promise<void>) => void;
  withForegroundWork?: <T>(work: () => Promise<T>) => Promise<T>;
}

export interface ArchiveMaterializationJobStore {
  listJobs(): Promise<ArchiveMaterializationJob[]>;
  readJob(id: string): Promise<ArchiveMaterializationJob | null>;
  upsertJob(job: ArchiveMaterializationJob): Promise<void>;
}

export function createArchiveMaterializationJobService(
  deps: ArchiveMaterializationJobServiceDeps,
): ArchiveMaterializationJobService {
  const store = deps.store ?? createArchiveMaterializationJobStore();
  const now = deps.now ?? (() => new Date());
  const generateId = deps.generateId ?? (() => `ramj_${randomUUID().replace(/-/g, '')}`);
  const schedule = deps.schedule ?? ((work) => {
    setImmediate(() => {
      void work();
    });
  });
  const withForegroundWork = deps.withForegroundWork ?? (async (work) => work());
  let queue = Promise.resolve();

  const service: ArchiveMaterializationJobService = {
    async createJob(request) {
      const archiveItemId = request.archiveItemId.trim();
      const force = request.force === true;
      if (!archiveItemId) {
        throw new ArchiveMaterializationError('Archive item id is required.');
      }
      const generatedAt = now().toISOString();
      const active = await findActiveJobForArchiveItem(store, archiveItemId);
      if (active) {
        return {
          object: 'run_archive_materialization_job_create_result',
          generatedAt,
          reused: true,
          job: active,
        };
      }
      const job: ArchiveMaterializationJob = {
        object: 'run_archive_materialization_job',
        id: generateId(),
        archiveItemId,
        force,
        status: 'queued',
        createdAt: generatedAt,
        updatedAt: generatedAt,
        startedAt: null,
        completedAt: null,
        attemptCount: 0,
        result: null,
        error: null,
        message: 'Archive materialization job queued.',
      };
      await store.upsertJob(job);
      schedule(async () => {
        queue = queue.then(() => service.runJob(job.id)).then(
          () => undefined,
          () => undefined,
        );
        await queue;
      });
      return {
        object: 'run_archive_materialization_job_create_result',
        generatedAt,
        reused: false,
        job,
      };
    },

    async listJobs(request = {}) {
      const status = request.status ?? null;
      const archiveItemId = normalizeOptionalString(request.archiveItemId);
      const limit = normalizeListLimit(request.limit);
      const allJobs = await store.listJobs();
      const filtered = allJobs.filter((job) =>
        matchesStatusFilter(job, status)
        && (!archiveItemId || job.archiveItemId === archiveItemId)
      );
      const jobs = filtered.slice(0, limit);
      return {
        object: 'run_archive_materialization_jobs',
        generatedAt: now().toISOString(),
        status,
        archiveItemId,
        limit,
        jobs,
        metrics: summarizeJobs(filtered),
      };
    },

    async readJob(id) {
      return store.readJob(id.trim());
    },

    async cancelJob(id) {
      const jobId = id.trim();
      if (!jobId) {
        throw new ArchiveMaterializationJobControlError('Archive materialization job id is required.');
      }
      const job = await store.readJob(jobId);
      if (!job) {
        throw new ArchiveMaterializationJobControlError(`Archive materialization job ${jobId} was not found.`, 404);
      }
      if (job.status === 'cancelled') {
        return job;
      }
      if (job.status !== 'queued') {
        throw new ArchiveMaterializationJobControlError(
          `Archive materialization job ${jobId} is ${job.status}; only queued jobs can be cancelled before provider work starts.`,
          409,
        );
      }
      const cancelledAt = now().toISOString();
      const cancelled: ArchiveMaterializationJob = {
        ...job,
        status: 'cancelled',
        updatedAt: cancelledAt,
        completedAt: cancelledAt,
        error: null,
        message: 'Archive materialization job cancelled before provider work started.',
      };
      await store.upsertJob(cancelled);
      return cancelled;
    },

    async runJob(id) {
      const job = await store.readJob(id.trim());
      if (!job) {
        throw new ArchiveMaterializationError(`Archive materialization job ${id} was not found.`, 404);
      }
      if (!isActiveStatus(job.status)) {
        return job;
      }
      const startedAt = now().toISOString();
      const running: ArchiveMaterializationJob = {
        ...job,
        status: 'running',
        startedAt: job.startedAt ?? startedAt,
        updatedAt: startedAt,
        attemptCount: job.attemptCount + 1,
        error: null,
        message: 'Archive materialization job is running.',
      };
      await store.upsertJob(running);
      try {
        const result = await withForegroundWork(() => deps.materializationService.materializeItem({
          archiveItemId: running.archiveItemId,
          force: running.force === true,
        }));
        const completedAt = now().toISOString();
        const completed: ArchiveMaterializationJob = {
          ...running,
          status: result.status === 'skipped' ? 'skipped' : 'succeeded',
          updatedAt: completedAt,
          completedAt,
          result,
          error: null,
          message: result.message,
        };
        await store.upsertJob(completed);
        return completed;
      } catch (error) {
        const completedAt = now().toISOString();
        const failed: ArchiveMaterializationJob = {
          ...running,
          status: 'failed',
          updatedAt: completedAt,
          completedAt,
          result: null,
          error: materializationJobError(error),
          message: error instanceof Error ? error.message : 'Archive materialization job failed.',
        };
        await store.upsertJob(failed);
        return failed;
      }
    },

    async recoverInterruptedJobs() {
      const jobs = await store.listJobs();
      let recovered = 0;
      for (const job of jobs) {
        if (!isActiveStatus(job.status)) continue;
        const timestamp = now().toISOString();
        await store.upsertJob({
          ...job,
          status: 'failed',
          updatedAt: timestamp,
          completedAt: timestamp,
          error: {
            message: 'Archive materialization job was interrupted before this AuraCall API process started.',
            type: 'internal_error',
            statusCode: 500,
          },
          message: 'Archive materialization job was interrupted before this AuraCall API process started.',
        });
        recovered += 1;
      }
      return recovered;
    },
  };

  return service;
}

export function createArchiveMaterializationJobStore(
  filePath = path.join(getRunArchiveDir(), 'materialization-jobs', 'index.json'),
): ArchiveMaterializationJobStore {
  return {
    async listJobs() {
      return readJobStoreFile(filePath);
    },
    async readJob(id) {
      const jobs = await readJobStoreFile(filePath);
      return jobs.find((job) => job.id === id) ?? null;
    },
    async upsertJob(job) {
      const jobs = await readJobStoreFile(filePath);
      const nextJobs = [
        job,
        ...jobs.filter((candidate) => candidate.id !== job.id),
      ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      await writeJobStoreFile(filePath, nextJobs);
    },
  };
}

async function findActiveJobForArchiveItem(
  store: ArchiveMaterializationJobStore,
  archiveItemId: string,
): Promise<ArchiveMaterializationJob | null> {
  const jobs = await store.listJobs();
  return jobs.find((job) => job.archiveItemId === archiveItemId && isActiveStatus(job.status)) ?? null;
}

function isActiveStatus(status: ArchiveMaterializationJobStatus): boolean {
  return status === 'queued' || status === 'running';
}

function matchesStatusFilter(
  job: ArchiveMaterializationJob,
  status: ArchiveMaterializationJobListRequest['status'] | null,
): boolean {
  if (!status) return true;
  if (status === 'active') return isActiveStatus(job.status);
  if (status === 'terminal') return !isActiveStatus(job.status);
  return job.status === status;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function normalizeListLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 50;
  }
  return Math.max(0, Math.min(500, Math.trunc(value)));
}

function summarizeJobs(jobs: ArchiveMaterializationJob[]): ArchiveMaterializationJobListResult['metrics'] {
  const byStatus: Record<string, number> = {};
  let active = 0;
  let terminal = 0;
  for (const job of jobs) {
    byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;
    if (isActiveStatus(job.status)) {
      active += 1;
    } else {
      terminal += 1;
    }
  }
  return {
    total: jobs.length,
    byStatus,
    active,
    terminal,
  };
}

async function readJobStoreFile(filePath: string): Promise<ArchiveMaterializationJob[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isArchiveMaterializationJob).map(normalizeArchiveMaterializationJob);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeJobStoreFile(filePath: string, jobs: ArchiveMaterializationJob[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function isArchiveMaterializationJob(value: unknown): value is ArchiveMaterializationJob {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.object === 'run_archive_materialization_job'
    && typeof record.id === 'string'
    && typeof record.archiveItemId === 'string'
    && typeof record.status === 'string';
}

function normalizeArchiveMaterializationJob(job: ArchiveMaterializationJob): ArchiveMaterializationJob {
  return {
    ...job,
    force: job.force === true,
  };
}

function materializationJobError(error: unknown): ArchiveMaterializationJob['error'] {
  if (error instanceof ArchiveMaterializationError) {
    return {
      message: error.message,
      type: error.statusCode === 404 ? 'not_found_error' : 'invalid_request_error',
      statusCode: error.statusCode,
    };
  }
  if (isProviderAuthPreflightError(error)) {
    return {
      message: error instanceof Error ? error.message : 'Provider browser auth preflight failed.',
      type: 'provider_auth_conflict',
      statusCode: 409,
    };
  }
  return {
    message: error instanceof Error ? error.message : 'Archive materialization job failed.',
    type: 'internal_error',
    statusCode: 500,
  };
}

function isProviderAuthPreflightError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('browser auth preflight failed')
    || message.includes('account_session_drift')
    || message.includes('expected_identity_missing');
}
