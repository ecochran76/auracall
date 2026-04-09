import { getActiveExecutionRunLease, type ExecutionRuntimeControlContract } from './contract.js';
import { createExecutionRuntimeControl } from './control.js';
import { executeStoredExecutionRunOnce, type ExecuteStoredRunStepResult } from './runner.js';
import type { ExecutionRunStoredRecord } from './store.js';
import type { ExecuteStoredRunStepContext } from './runner.js';
import type { ExecutionRunSourceKind } from './types.js';

export interface DrainStoredExecutionRunsOnceOptions {
  runId?: string;
  sourceKind?: ExecutionRunSourceKind;
  maxRuns?: number;
}

export interface DrainedStoredExecutionRunResult {
  runId: string;
  result: 'executed' | 'skipped';
  reason?: 'not-found' | 'active-lease' | 'no-runnable-step' | 'limit-reached';
  record?: ExecutionRunStoredRecord;
}

export interface DrainStoredExecutionRunsOnceResult {
  ownerId: string;
  expiredLeaseRunIds: string[];
  executedRunIds: string[];
  drained: DrainedStoredExecutionRunResult[];
}

export interface ExecutionServiceHostDeps {
  control?: ExecutionRuntimeControlContract;
  now?: () => string;
  ownerId?: string;
  executeStoredRunStep?: (context: ExecuteStoredRunStepContext) => Promise<ExecuteStoredRunStepResult | void>;
}

export interface ExecutionServiceHost {
  drainRunsOnce(options?: DrainStoredExecutionRunsOnceOptions): Promise<DrainStoredExecutionRunsOnceResult>;
}

export function createExecutionServiceHost(deps: ExecutionServiceHostDeps = {}): ExecutionServiceHost {
  const control = deps.control ?? createExecutionRuntimeControl();
  const now = deps.now ?? (() => new Date().toISOString());
  const ownerId = deps.ownerId ?? 'host:local-service';

  return {
    async drainRunsOnce(options: DrainStoredExecutionRunsOnceOptions = {}) {
      const maxRuns = Math.max(0, options.maxRuns ?? 1);
      const drained: DrainedStoredExecutionRunResult[] = [];
      const expiredLeaseRunIds: string[] = [];
      const executedRunIds: string[] = [];
      let executedCount = 0;

      for (const candidate of await listCandidateRuns(control, options)) {
        if (executedCount >= maxRuns) {
          drained.push({
            runId: candidate.runId,
            result: 'skipped',
            reason: 'limit-reached',
            record: candidate,
          });
          continue;
        }

        let currentRecord = candidate;
        const activeLease = getActiveExecutionRunLease(currentRecord);
        if (activeLease && activeLease.expiresAt <= now()) {
          const expired = await control.expireLeases({
            runId: currentRecord.runId,
            now: now(),
          });
          if (expired && getActiveExecutionRunLease(expired) === null) {
            expiredLeaseRunIds.push(currentRecord.runId);
          }
          currentRecord = expired ?? currentRecord;
        }

        const inspection = await control.inspectRun(currentRecord.runId);
        if (!inspection) {
          drained.push({
            runId: currentRecord.runId,
            result: 'skipped',
            reason: 'not-found',
          });
          continue;
        }

        if (getActiveExecutionRunLease(inspection.record)) {
          drained.push({
            runId: currentRecord.runId,
            result: 'skipped',
            reason: 'active-lease',
            record: inspection.record,
          });
          continue;
        }

        if (!inspection.dispatchPlan.nextRunnableStepId) {
          drained.push({
            runId: currentRecord.runId,
            result: 'skipped',
            reason: 'no-runnable-step',
            record: inspection.record,
          });
          continue;
        }

        const executed = await executeStoredExecutionRunOnce({
          runId: currentRecord.runId,
          ownerId,
          leaseId: `${currentRecord.runId}:lease:${ownerId.replace(/[^a-z0-9:_-]+/gi, '-')}`,
          now,
          control,
          executeStep: deps.executeStoredRunStep,
        });
        executedCount += 1;
        executedRunIds.push(executed.runId);
        drained.push({
          runId: executed.runId,
          result: 'executed',
          record: executed,
        });
      }

      return {
        ownerId,
        expiredLeaseRunIds,
        executedRunIds,
        drained,
      };
    },
  };
}

async function listCandidateRuns(
  control: ExecutionRuntimeControlContract,
  options: DrainStoredExecutionRunsOnceOptions,
): Promise<ExecutionRunStoredRecord[]> {
  if (options.runId) {
    const record = await control.readRun(options.runId);
    return record ? [record] : [];
  }

  const records = await control.listRuns({
    sourceKind: options.sourceKind,
  });
  return records.sort((left, right) => left.bundle.run.createdAt.localeCompare(right.bundle.run.createdAt));
}
