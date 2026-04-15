import { createExecutionRunnerRecord } from './model.js';
import {
  createExecutionRunnerRecordStore,
  type ExecutionRunnerRecordStore,
  type ExecutionRunnerStoredRecord,
  type ListExecutionRunnerRecordOptions,
} from './runnersStore.js';
import type { ExecutionRunnerRecord } from './types.js';

export interface RegisterExecutionRunnerInput {
  runner: ExecutionRunnerRecord;
}

export interface HeartbeatExecutionRunnerInput {
  runnerId: string;
  heartbeatAt: string;
  expiresAt: string;
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
  recordRunnerActivity(input: RecordExecutionRunnerActivityInput): Promise<ExecutionRunnerStoredRecord>;
}

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
      const record = await requireStoredRunnerRecord(store, input.runnerId);
      const nextRunner = createExecutionRunnerRecord({
        ...record.runner,
        status: 'active',
        startedAt: record.runner.startedAt,
        lastHeartbeatAt: input.heartbeatAt,
        expiresAt: input.expiresAt,
        eligibilityNote: input.eligibilityNote ?? record.runner.eligibilityNote,
      });
      return store.writeRunner(nextRunner, {
        expectedRevision: record.revision,
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

    async recordRunnerActivity(input) {
      const record = await requireStoredRunnerRecord(store, input.runnerId);
      const nextRunner = createExecutionRunnerRecord({
        ...record.runner,
        lastActivityAt: input.activityAt,
        lastClaimedRunId: input.runId,
        eligibilityNote: input.eligibilityNote ?? record.runner.eligibilityNote,
      });
      return store.writeRunner(nextRunner, {
        expectedRevision: record.revision,
        persistedAt: input.activityAt,
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
