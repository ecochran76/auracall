import { createExecutionRunnerRecord } from './model.js';
import {
  createExecutionRunnerRecordStore,
  type ExecutionRunnerRecordStore,
  type ExecutionRunnerStoredRecord,
  type ListExecutionRunnerRecordOptions,
  type WriteExecutionRunnerRecordOptions,
} from './runnersStore.js';
import type { ExecutionRunnerRecord } from './types.js';

export interface RegisterExecutionRunnerInput {
  runner: ExecutionRunnerRecord;
}

export interface HeartbeatExecutionRunnerInput {
  runnerId: string;
  heartbeatAt: string;
  expiresAt: string;
  serviceIds?: ExecutionRunnerRecord['serviceIds'];
  runtimeProfileIds?: string[];
  browserProfileIds?: string[];
  serviceAccountIds?: string[];
  browserCapable?: boolean;
  eligibilityNote?: string | null;
}

export interface MarkExecutionRunnerStaleInput {
  runnerId: string;
  staleAt: string;
  eligibilityNote?: string | null;
}

export interface ExpireExecutionRunnersInput {
  now: string;
  eligibilityNote?: string | null;
}

export interface ExpireExecutionRunnersResult {
  expiredRunnerIds: string[];
  records: ExecutionRunnerStoredRecord[];
}

export interface CompactStaleExecutionRunnersInput {
  keepNewest: number;
}

export interface CompactStaleExecutionRunnersResult {
  scannedStaleRunnerCount: number;
  retainedRunnerIds: string[];
  deletedRunnerIds: string[];
}

export interface RecordExecutionRunnerActivityInput {
  runnerId: string;
  activityAt: string;
  runId: string;
  eligibilityNote?: string | null;
}

export interface ExecutionRunnerControlContract {
  registerRunner(input: RegisterExecutionRunnerInput): Promise<ExecutionRunnerStoredRecord>;
  readRunner(runnerId: string): Promise<ExecutionRunnerStoredRecord | null>;
  listRunners(input?: ListExecutionRunnerRecordOptions): Promise<ExecutionRunnerStoredRecord[]>;
  heartbeatRunner(input: HeartbeatExecutionRunnerInput): Promise<ExecutionRunnerStoredRecord>;
  markRunnerStale(input: MarkExecutionRunnerStaleInput): Promise<ExecutionRunnerStoredRecord>;
  expireRunners(input: ExpireExecutionRunnersInput): Promise<ExpireExecutionRunnersResult>;
  compactStaleRunners(input: CompactStaleExecutionRunnersInput): Promise<CompactStaleExecutionRunnersResult>;
  recordRunnerActivity(input: RecordExecutionRunnerActivityInput): Promise<ExecutionRunnerStoredRecord>;
}

const RUNNER_UPDATE_MAX_ATTEMPTS = 3;

export function createExecutionRunnerControl(
  store: ExecutionRunnerRecordStore = createExecutionRunnerRecordStore(),
): ExecutionRunnerControlContract {
  return {
    async registerRunner(input) {
      await store.ensureStorage();
      return store.writeRunner(input.runner, { expectedRevision: 0 });
    },

    async readRunner(runnerId) {
      return store.readRecord(runnerId);
    },

    async listRunners(input = {}) {
      const runners = await store.listRunners(input);
      const records = await Promise.all(runners.map(async (runner) => store.readRecord(runner.id)));
      return records.filter((record): record is ExecutionRunnerStoredRecord => record !== null);
    },

    async heartbeatRunner(input) {
      return updateRunnerWithRevisionRetry(store, input.runnerId, (record) => {
        const nextRunner = createExecutionRunnerRecord({
          ...record.runner,
          status: 'active',
          startedAt: record.runner.startedAt,
          lastHeartbeatAt: input.heartbeatAt,
          expiresAt: input.expiresAt,
          serviceIds: input.serviceIds ?? record.runner.serviceIds,
          runtimeProfileIds: input.runtimeProfileIds ?? record.runner.runtimeProfileIds,
          browserProfileIds: input.browserProfileIds ?? record.runner.browserProfileIds,
          serviceAccountIds: input.serviceAccountIds ?? record.runner.serviceAccountIds,
          browserCapable: input.browserCapable ?? record.runner.browserCapable,
          eligibilityNote: input.eligibilityNote ?? record.runner.eligibilityNote,
        });
        return { runner: nextRunner };
      });
    },

    async markRunnerStale(input) {
      const record = await requireStoredRunnerRecord(store, input.runnerId);
      const nextRunner = createExecutionRunnerRecord({
        ...record.runner,
        status: 'stale',
        startedAt: record.runner.startedAt,
        lastHeartbeatAt: record.runner.lastHeartbeatAt,
        expiresAt: input.staleAt,
        eligibilityNote: input.eligibilityNote ?? record.runner.eligibilityNote,
      });
      return store.writeRunner(nextRunner, {
        expectedRevision: record.revision,
        persistedAt: input.staleAt,
      });
    },

    async expireRunners(input) {
      const records = await this.listRunners();
      const expiredRunnerIds: string[] = [];
      const updatedRecords: ExecutionRunnerStoredRecord[] = [];

      for (const record of records) {
        if (record.runner.status !== 'active') continue;
        if (record.runner.expiresAt > input.now) continue;

        const updated = await this.markRunnerStale({
          runnerId: record.runnerId,
          staleAt: input.now,
          eligibilityNote:
            input.eligibilityNote ?? record.runner.eligibilityNote ?? 'runner heartbeat expired',
        });
        expiredRunnerIds.push(updated.runnerId);
        updatedRecords.push(updated);
      }

      return {
        expiredRunnerIds,
        records: updatedRecords,
      };
    },

    async compactStaleRunners(input) {
      await store.ensureStorage();
      const keepNewest = Math.max(0, Math.floor(input.keepNewest));
      const staleRunners = await store.listRunners({ status: 'stale' });
      const retainedRunnerIds = staleRunners.slice(0, keepNewest).map((runner) => runner.id);
      const deletedRunnerIds = staleRunners.slice(keepNewest).map((runner) => runner.id);

      for (const runnerId of deletedRunnerIds) {
        await store.deleteRunner(runnerId);
      }

      return {
        scannedStaleRunnerCount: staleRunners.length,
        retainedRunnerIds,
        deletedRunnerIds,
      };
    },

    async recordRunnerActivity(input) {
      return updateRunnerWithRevisionRetry(store, input.runnerId, (record) => {
        const nextRunner = createExecutionRunnerRecord({
          ...record.runner,
          lastActivityAt: input.activityAt,
          lastClaimedRunId: input.runId,
          eligibilityNote: input.eligibilityNote ?? record.runner.eligibilityNote,
        });
        return {
          runner: nextRunner,
          options: { persistedAt: input.activityAt },
        };
      });
    },
  };
}

async function requireStoredRunnerRecord(
  store: ExecutionRunnerRecordStore,
  runnerId: string,
): Promise<ExecutionRunnerStoredRecord> {
  const record = await store.readRecord(runnerId);
  if (!record) {
    throw new Error(`Execution runner ${runnerId} was not found`);
  }
  return record;
}

async function updateRunnerWithRevisionRetry(
  store: ExecutionRunnerRecordStore,
  runnerId: string,
  buildUpdate: (
    record: ExecutionRunnerStoredRecord,
  ) => { runner: ExecutionRunnerRecord; options?: Omit<WriteExecutionRunnerRecordOptions, 'expectedRevision'> },
): Promise<ExecutionRunnerStoredRecord> {
  let lastMismatch: unknown = null;
  for (let attempt = 0; attempt < RUNNER_UPDATE_MAX_ATTEMPTS; attempt += 1) {
    const record = await requireStoredRunnerRecord(store, runnerId);
    const update = buildUpdate(record);
    try {
      return await store.writeRunner(update.runner, {
        ...update.options,
        expectedRevision: record.revision,
      });
    } catch (error) {
      if (!isRunnerRevisionMismatchError(error, runnerId)) {
        throw error;
      }
      lastMismatch = error;
    }
  }
  throw lastMismatch instanceof Error
    ? lastMismatch
    : new Error(`Execution runner ${runnerId} revision mismatch after retry`);
}

function isRunnerRevisionMismatchError(error: unknown, runnerId: string): boolean {
  return error instanceof Error && error.message.includes(`Execution runner ${runnerId} revision mismatch`);
}
