import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import {
  assertResponsesHostAllowed,
  createDefaultRuntimeRunServiceStateProbe,
  createResponsesHttpServer,
  serveResponsesHttp,
  terminateSamePortApiServeProcesses,
} from '../src/http/responsesServer.js';
import {
  createAccountMirrorStatusRegistry,
  type AccountMirrorStatusSummary,
} from '../src/accountMirror/statusRegistry.js';
import type {
  AccountMirrorCatalogItemResult,
  AccountMirrorCatalogResult,
} from '../src/accountMirror/catalogService.js';
import type { AccountMirrorCompletionOperation } from '../src/accountMirror/completionService.js';
import type { AccountMirrorSchedulerPassResult } from '../src/accountMirror/schedulerService.js';
import type { AccountMirrorSchedulerPassLedger } from '../src/accountMirror/schedulerLedger.js';
import { resetLiveRuntimeRunServiceStateRegistryForTests } from '../src/runtime/liveServiceStateRegistry.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { writeTaskRunSpecStoredRecord } from '../src/teams/store.js';
import { createTaskRunSpec } from '../src/teams/model.js';
import { createExecutionRunnerControl } from '../src/runtime/runnersControl.js';
import { createExecutionServiceHost } from '../src/runtime/serviceHost.js';
import {
  createExecutionRunnerRecord,
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';
import { AURACALL_STEP_OUTPUT_CONTRACT_VERSION } from '../src/runtime/stepOutputContract.js';
import { createChatgptDeepResearchStatusFixture } from './fixtures/chatgptDeepResearchStatusFixture.js';

vi.setConfig({ testTimeout: 10000 });

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue | undefined };

function requireJsonObject(value: JsonValue | undefined, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} was not a JSON object.`);
  }
  return value;
}

const completeAccountMirror = {
  state: 'complete' as const,
  summary: 'Mirrored metadata indexes are complete within current provider surfaces.',
  remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
  signals: {
    projectsTruncated: false,
    conversationsTruncated: false,
    attachmentInventoryTruncated: false,
    attachmentCursorPresent: false,
  },
};

describe('http responses adapter', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    resetLiveRuntimeRunServiceStateRegistryForTests();
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  const seedPlannedDirectRun = async (
    control: ReturnType<typeof createExecutionRuntimeControl>,
    runId: string,
    createdAt: string,
    prompt: string,
    sourceKind: 'direct' | 'team-run' = 'direct',
  ) => {
    const stepId = `${runId}:step:1`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind,
          sourceId: sourceKind === 'team-run' ? `${runId}:team` : null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: prompt,
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt,
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );
  };

  const createMemorySchedulerLedger = (): AccountMirrorSchedulerPassLedger => {
    const entries: AccountMirrorSchedulerPassResult[] = [];
    const readHistory = async () => ({
      object: 'account_mirror_scheduler_pass_history' as const,
      version: 1 as const,
      updatedAt: entries[0]?.completedAt ?? null,
      limit: 50,
      entries,
    });
    return {
      async appendPass(pass) {
        entries.unshift(pass);
        return readHistory();
      },
      readHistory,
    };
  };

  const waitForPredicate = async (predicate: () => boolean, timeoutMs = 1_000): Promise<void> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (predicate()) return;
      await delay(25);
    }
    expect(predicate()).toBe(true);
  };

  const seedRequestedLocalActionDirectRun = async (
    control: ReturnType<typeof createExecutionRuntimeControl>,
    runId: string,
    createdAt: string,
    sourceKind: 'direct' | 'team-run' = 'direct',
  ) => {
    const stepId = `${runId}:step:1`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind,
          sourceId: sourceKind === 'team-run' ? `${runId}:team` : null,
          status: 'succeeded',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Review one local action request.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Review one local action request.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'queued one local action for later review',
              artifacts: [],
              structuredData: {
                localActionRequests: [
                  {
                    kind: 'shell',
                    summary: 'Run bounded host verification later',
                    command: 'pnpm',
                    args: ['vitest', 'run'],
                  },
                ],
              },
              notes: [],
            },
            completedAt: createdAt,
          }),
        ],
        localActionRequests: [
          {
            id: `${runId}:action:${stepId}:1`,
            teamRunId: runId,
            ownerStepId: stepId,
            kind: 'shell',
            summary: 'Run bounded host verification later',
            command: 'pnpm',
            args: ['vitest', 'run'],
            structuredPayload: {},
            notes: [],
            status: 'requested',
            createdAt,
            approvedAt: null,
            completedAt: null,
            resultSummary: null,
            resultPayload: null,
          },
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: `step.localActionOutcomes.${stepId}`,
              value: {
                ownerStepId: stepId,
                generatedAt: createdAt,
                total: 1,
                counts: {
                  requested: 1,
                  approved: 0,
                  rejected: 0,
                  executed: 0,
                  failed: 0,
                  cancelled: 0,
                },
                items: [
                  {
                    requestId: `${runId}:action:${stepId}:1`,
                    kind: 'shell',
                    status: 'requested',
                    summary: 'Run bounded host verification later',
                    command: 'pnpm',
                    args: ['vitest', 'run'],
                    resultSummary: null,
                  },
                ],
              },
            },
          ],
          notes: ['local action outcomes for requested run: requested=1'],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt,
          }),
          createExecutionRunEvent({
            id: `${runId}:event:${runId}:action:${stepId}:1:requested`,
            runId,
            stepId,
            type: 'note-added',
            createdAt,
            note: 'local action requested: shell',
            payload: {
              requestId: `${runId}:action:${stepId}:1`,
              requestStatus: 'requested',
            },
          }),
        ],
      }),
    );
  };

  const seedPausedHumanEscalationDirectRun = async (
    control: ReturnType<typeof createExecutionRuntimeControl>,
    runId: string,
    createdAt: string,
    pausedAt: string,
    sourceKind: 'direct' | 'team-run' = 'direct',
  ) => {
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind,
          sourceId: sourceKind === 'team-run' ? `${runId}:team` : null,
          status: 'cancelled',
          createdAt,
          updatedAt: pausedAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Resume me.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'First step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'first step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: createdAt,
            completedAt: createdAt,
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'cancelled',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Second step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'paused for human escalation',
              artifacts: [],
              structuredData: {
                humanEscalation: {
                  requestedAt: pausedAt,
                  guidance: {
                    action: 'escalate',
                  },
                },
              },
              notes: ['dependency host-action guidance escalated; runner paused for human input'],
            },
            startedAt: pausedAt,
            completedAt: pausedAt,
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'cancelled',
          artifacts: [],
          structuredOutputs: [
            {
              key: `human.escalation.${stepTwoId}`,
              value: {
                stepId: stepTwoId,
                requestedAt: pausedAt,
                reason: 'dependency-local-action-escalate',
                guidance: {
                  action: 'escalate',
                },
              },
            },
          ],
          notes: ['run paused for human escalation'],
          history: [],
          lastUpdatedAt: pausedAt,
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt,
          }),
          createExecutionRunEvent({
            id: `${runId}:event:${stepTwoId}:human-escalation:${pausedAt}`,
            runId,
            stepId: stepTwoId,
            type: 'note-added',
            createdAt: pausedAt,
            note: 'step paused for human escalation after dependency host-action guidance escalated',
            payload: {
              guidance: {
                action: 'escalate',
              },
            },
          }),
        ],
      }),
    );
  };

  const terminateServeResponsesHttp = async (options: Parameters<typeof serveResponsesHttp>[0]) => {
    const servePromise = serveResponsesHttp({
      executeStoredRunStep: async () => ({
        output: {
          summary: 'test stub executor',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      }),
      ...options,
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    process.emit('SIGINT');
    await servePromise;
  };

  it('creates and retrieves persisted bounded responses', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-08T12:00:00.000Z'),
        generateResponseId: () => 'resp_create_1',
      },
    );

    try {
      const createResponse = await fetch(`http://127.0.0.1:${server.port}/v1/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3-pro',
          input: 'Create a bounded runtime-backed response.',
          instructions: 'Be concise.',
          auracall: {
            runtimeProfile: 'default',
            service: 'gemini',
          },
        }),
      });

      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as Record<string, unknown>;
      expect(created).toMatchObject({
        id: 'resp_create_1',
        object: 'response',
        status: 'completed',
        model: 'gemini-3-pro',
        output: [],
        metadata: {
          runId: 'resp_create_1',
          runtimeProfile: 'default',
          service: 'gemini',
          executionSummary: {
            terminalStepId: 'resp_create_1:step:1',
            completedAt: '2026-04-08T12:00:00.000Z',
            lastUpdatedAt: '2026-04-08T12:00:00.000Z',
            orchestrationTimelineSummary: {
              total: 2,
              items: [
                {
                  type: 'step-started',
                  createdAt: '2026-04-08T12:00:00.000Z',
                  stepId: 'resp_create_1:step:1',
                  note: 'step started by local runner',
                  handoffId: null,
                },
                {
                  type: 'step-succeeded',
                  createdAt: '2026-04-08T12:00:00.000Z',
                  stepId: 'resp_create_1:step:1',
                  note: 'step completed by local runner',
                  handoffId: null,
                },
              ],
            },
            failureSummary: null,
          },
        },
      });

      const readResponse = await fetch(`http://127.0.0.1:${server.port}/v1/responses/resp_create_1`);
      expect(readResponse.status).toBe(200);
      const reread = (await readResponse.json()) as Record<string, unknown>;
      expect(reread).toMatchObject({
        id: 'resp_create_1',
        object: 'response',
        status: 'completed',
        model: 'gemini-3-pro',
      });

      const runStatusResponse = await fetch(`http://127.0.0.1:${server.port}/v1/runs/resp_create_1/status`);
      expect(runStatusResponse.status).toBe(200);
      await expect(runStatusResponse.json()).resolves.toMatchObject({
        id: 'resp_create_1',
        object: 'auracall_run_status',
        kind: 'response',
        status: 'completed',
        completedAt: '2026-04-08T12:00:00.000Z',
        stepCount: 1,
        steps: [
          {
            stepId: 'resp_create_1:step:1',
            status: 'succeeded',
            service: 'gemini',
          },
        ],
        artifactCount: 0,
        metadata: {
          runId: 'resp_create_1',
          runtimeProfile: 'default',
          service: 'gemini',
          model: 'gemini-3-pro',
        },
        lastEvent: {
          type: 'step-succeeded',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('records last runner activity for direct execution on /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runner-activity-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-11T14:10:00.000Z'),
        generateResponseId: () => 'resp_runner_activity_1',
      },
    );

    try {
      const createResponse = await fetch(`http://127.0.0.1:${server.port}/v1/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.2',
          input: 'Advance one direct run.',
          auracall: {
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
        }),
      });

      expect(createResponse.status).toBe(200);

      const statusResponse = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(statusResponse.status).toBe(200);
      const statusPayload = (await statusResponse.json()) as JsonObject;
      expect(statusPayload).toMatchObject({
        runner: {
          id: `runner:http-responses:127.0.0.1:${server.port}`,
          status: 'active',
          lastActivityAt: '2026-04-11T14:10:00.000Z',
          lastClaimedRunId: 'resp_runner_activity_1',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('returns in-progress on create and completes later through background drain when enabled', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-bg-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0, backgroundDrainIntervalMs: 25 },
      {
        now: () => new Date('2026-04-08T12:02:00.000Z'),
        generateResponseId: () => 'resp_create_bg_1',
      },
    );

    try {
      const createResponse = await fetch(`http://127.0.0.1:${server.port}/v1/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.2',
          input: 'Create through background drain.',
          auracall: {
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
        }),
      });

      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as Record<string, unknown>;
      expect(created).toMatchObject({
        id: 'resp_create_bg_1',
        object: 'response',
        status: 'in_progress',
      });

      await delay(100);
      const readResponse = await fetch(`http://127.0.0.1:${server.port}/v1/responses/resp_create_bg_1`);
      expect(readResponse.status).toBe(200);
      const reread = (await readResponse.json()) as Record<string, unknown>;
      expect(reread).toMatchObject({
        id: 'resp_create_bg_1',
        object: 'response',
        status: 'completed',
      });
    } finally {
      await server.close();
    }
  });

  it('delegates concurrent response creates through the queued host drain seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const drainRunIds: string[] = [];
    let responseSequence = 0;
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-08T12:05:00.000Z'),
        generateResponseId: () => `resp_serial_${++responseSequence}`,
        executionHost: {
          async registerLocalRunner() {
            return null;
          },
          async heartbeatLocalRunner() {
            return null;
          },
          async markLocalRunnerStale() {
            return null;
          },
          async drainRunsOnce() {
            throw new Error('unexpected direct drain call');
          },
          async repairStaleHeartbeatLease(runId) {
            return {
              action: 'repair-stale-heartbeat' as const,
              runId,
              status: 'not-found' as const,
              repaired: false,
              reason: `run ${runId} was not found`,
              leaseHealthStatus: null,
              repairPosture: null,
              reconciliationReason: null,
            };
          },
          async claimLocalRunWithSchedulerAuthority(input) {
            return {
              action: input.action,
              runId: input.runId,
              schedulerId: input.schedulerId,
              status: 'blocked' as const,
              claimed: false,
              mutationAllowed: false,
              reason: 'scheduler control is not available in this test host',
              decision: null,
              selectedRunnerId: null,
              localRunnerId: null,
              previousLeaseId: null,
              previousLeaseOwnerId: null,
              newLeaseId: null,
              newLeaseOwnerId: null,
            };
          },
          async controlOperatorAction(input) {
            if (input.kind === 'lease-repair') {
              return {
                kind: input.kind,
                ...(await this.repairStaleHeartbeatLease(input.runId)),
              };
            }
            if (input.kind === 'local-action-control') {
              return {
                kind: input.kind,
                ...(await this.resolveLocalActionRequest(
                  input.runId,
                  input.requestId,
                  input.resolution,
                  input.note ?? null,
                )),
              };
            }
            if (input.kind === 'scheduler-control') {
              return {
                kind: input.kind,
                ...(await this.claimLocalRunWithSchedulerAuthority(input.control)),
              };
            }
            return {
              kind: input.kind,
              ...(await this.controlRun(input.control)),
            };
          },
          async controlRun(input) {
            if (input.action === 'resume-human-escalation') {
              return this.resumeHumanEscalation(input.runId);
            }
            if (input.action === 'drain-run') {
              return this.drainRun(input.runId);
            }
            return this.cancelOwnedRun(input.runId);
          },
          async cancelOwnedRun(runId) {
            return {
              action: 'cancel-run' as const,
              runId,
              status: 'not-found' as const,
              cancelled: false,
              reason: `run ${runId} was not found`,
            };
          },
          async resumeHumanEscalation(runId) {
            return {
              action: 'resume-human-escalation' as const,
              runId,
              status: 'not-found' as const,
              resumed: false,
              reason: `run ${runId} was not found`,
              resumedAt: null,
              resumedStepId: null,
            };
          },
          async drainRun(runId) {
            return {
              action: 'drain-run' as const,
              runId,
              status: 'not-found' as const,
              drained: false,
              reason: `run ${runId} was not found`,
              skipReason: null,
            };
          },
          async resolveLocalActionRequest(runId, requestId, resolution) {
            return {
              action: 'resolve-local-action-request' as const,
              runId,
              requestId,
              resolution,
              status: 'not-found' as const,
              resolved: false,
              reason: `run ${runId} was not found`,
              resolvedAt: null,
              ownerStepId: null,
            };
          },
          async readRecoveryDetail() {
            return null;
          },
          async summarizeLocalClaimState() {
            return null;
          },
          async summarizeRunnerTopology() {
            return {
              localExecutionOwnerRunnerId: null,
              generatedAt: '2026-04-08T12:05:00.000Z',
              runners: [],
              metrics: {
                totalRunnerCount: 0,
                activeRunnerCount: 0,
                staleRunnerCount: 0,
                freshRunnerCount: 0,
                expiredRunnerCount: 0,
                browserCapableRunnerCount: 0,
              },
            };
          },
          async summarizeRecoveryState() {
            return {
              totalRuns: 0,
              reclaimableRunIds: [],
              activeLeaseRunIds: [],
              recoverableStrandedRunIds: [],
              strandedRunIds: [],
              cancelledRunIds: [],
              idleRunIds: [],
              localClaim: null,
              activeLeaseHealth: {
                freshRunIds: [],
                staleHeartbeatRunIds: [],
                suspiciousIdleRunIds: [],
                reasonsByRunId: {},
                metrics: {
                  freshCount: 0,
                  staleHeartbeatCount: 0,
                  suspiciousIdleCount: 0,
                },
              },
              leaseRepair: {
                locallyReclaimableRunIds: [],
                inspectOnlyRunIds: [],
                notReclaimableRunIds: [],
                repairedRunIds: [],
                reasonsByRunId: {},
                metrics: {
                  locallyReclaimableCount: 0,
                  inspectOnlyCount: 0,
                  notReclaimableCount: 0,
                  repairedCount: 0,
                },
              },
              attention: {
                staleHeartbeatInspectOnlyRunIds: [],
                reasonsByRunId: {},
                metrics: {
                  staleHeartbeatInspectOnlyCount: 0,
                },
              },
              cancellation: {
                reasonsByRunId: {},
                metrics: {
                  cancelledCount: 0,
                },
              },
              metrics: {
                reclaimableCount: 0,
                activeLeaseCount: 0,
                recoverableStrandedCount: 0,
                strandedCount: 0,
                cancelledCount: 0,
                idleCount: 0,
                actionableCount: 0,
                nonExecutableCount: 0,
              },
            };
          },
          async drainRunsUntilIdle() {
            throw new Error('unexpected unqueued drain call');
          },
          async drainRunsUntilIdleQueued(options = {}) {
            options.onStart?.();
            if (options.runId) {
              drainRunIds.push(options.runId);
            }
            await delay(25);
            return {
              ownerId: 'host:test-serialized-drain',
              expiredLeaseRunIds: [],
              executedRunIds: [],
              drained: [],
              iterations: 1,
            };
          },
          async waitForDrainQueue() {
            return null;
          },
        },
      },
    );

    try {
      const [firstResponse, secondResponse] = await Promise.all([
        fetch(`http://127.0.0.1:${server.port}/v1/responses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5.2',
            input: 'First request.',
          }),
        }),
        fetch(`http://127.0.0.1:${server.port}/v1/responses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5.2',
            input: 'Second request.',
          }),
        }),
      ]);

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect([...drainRunIds].sort()).toEqual(['resp_serial_1', 'resp_serial_2']);

      const firstPayload = (await firstResponse.json()) as Record<string, unknown>;
      const secondPayload = (await secondResponse.json()) as Record<string, unknown>;
      expect([firstPayload.id, secondPayload.id].sort()).toEqual(['resp_serial_1', 'resp_serial_2']);
      expect(firstPayload.status).toBe('in_progress');
      expect(secondPayload.status).toBe('in_progress');
    } finally {
      await server.close();
    }
  });

  it('stops scheduling background drain after server close', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-bg-close-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let drainCalls = 0;
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0, backgroundDrainIntervalMs: 25 },
      {
        executionHost: {
          async registerLocalRunner() {
            return null;
          },
          async heartbeatLocalRunner() {
            return null;
          },
          async markLocalRunnerStale() {
            return null;
          },
          async drainRunsOnce() {
            throw new Error('unexpected direct drain call');
          },
          async repairStaleHeartbeatLease(runId) {
            return {
              action: 'repair-stale-heartbeat' as const,
              runId,
              status: 'not-found' as const,
              repaired: false,
              reason: `run ${runId} was not found`,
              leaseHealthStatus: null,
              repairPosture: null,
              reconciliationReason: null,
            };
          },
          async claimLocalRunWithSchedulerAuthority(input) {
            return {
              action: input.action,
              runId: input.runId,
              schedulerId: input.schedulerId,
              status: 'blocked' as const,
              claimed: false,
              mutationAllowed: false,
              reason: 'scheduler control is not available in this test host',
              decision: null,
              selectedRunnerId: null,
              localRunnerId: null,
              previousLeaseId: null,
              previousLeaseOwnerId: null,
              newLeaseId: null,
              newLeaseOwnerId: null,
            };
          },
          async controlOperatorAction(input) {
            if (input.kind === 'lease-repair') {
              return {
                kind: input.kind,
                ...(await this.repairStaleHeartbeatLease(input.runId)),
              };
            }
            if (input.kind === 'local-action-control') {
              return {
                kind: input.kind,
                ...(await this.resolveLocalActionRequest(
                  input.runId,
                  input.requestId,
                  input.resolution,
                  input.note ?? null,
                )),
              };
            }
            if (input.kind === 'scheduler-control') {
              return {
                kind: input.kind,
                ...(await this.claimLocalRunWithSchedulerAuthority(input.control)),
              };
            }
            return {
              kind: input.kind,
              ...(await this.controlRun(input.control)),
            };
          },
          async controlRun(input) {
            if (input.action === 'resume-human-escalation') {
              return this.resumeHumanEscalation(input.runId);
            }
            if (input.action === 'drain-run') {
              return this.drainRun(input.runId);
            }
            return this.cancelOwnedRun(input.runId);
          },
          async cancelOwnedRun(runId) {
            return {
              action: 'cancel-run' as const,
              runId,
              status: 'not-found' as const,
              cancelled: false,
              reason: `run ${runId} was not found`,
            };
          },
          async resumeHumanEscalation(runId) {
            return {
              action: 'resume-human-escalation' as const,
              runId,
              status: 'not-found' as const,
              resumed: false,
              reason: `run ${runId} was not found`,
              resumedAt: null,
              resumedStepId: null,
            };
          },
          async drainRun(runId) {
            return {
              action: 'drain-run' as const,
              runId,
              status: 'not-found' as const,
              drained: false,
              reason: `run ${runId} was not found`,
              skipReason: null,
            };
          },
          async resolveLocalActionRequest(runId, requestId, resolution) {
            return {
              action: 'resolve-local-action-request' as const,
              runId,
              requestId,
              resolution,
              status: 'not-found' as const,
              resolved: false,
              reason: `run ${runId} was not found`,
              resolvedAt: null,
              ownerStepId: null,
            };
          },
          async readRecoveryDetail() {
            return null;
          },
          async summarizeLocalClaimState() {
            return null;
          },
          async summarizeRunnerTopology() {
            return {
              localExecutionOwnerRunnerId: null,
              generatedAt: '2026-04-08T12:05:00.000Z',
              runners: [],
              metrics: {
                totalRunnerCount: 0,
                activeRunnerCount: 0,
                staleRunnerCount: 0,
                freshRunnerCount: 0,
                expiredRunnerCount: 0,
                browserCapableRunnerCount: 0,
              },
            };
          },
          async summarizeRecoveryState() {
            return {
              totalRuns: 0,
              reclaimableRunIds: [],
              activeLeaseRunIds: [],
              recoverableStrandedRunIds: [],
              strandedRunIds: [],
              cancelledRunIds: [],
              idleRunIds: [],
              localClaim: null,
              activeLeaseHealth: {
                freshRunIds: [],
                staleHeartbeatRunIds: [],
                suspiciousIdleRunIds: [],
                reasonsByRunId: {},
                metrics: {
                  freshCount: 0,
                  staleHeartbeatCount: 0,
                  suspiciousIdleCount: 0,
                },
              },
              leaseRepair: {
                locallyReclaimableRunIds: [],
                inspectOnlyRunIds: [],
                notReclaimableRunIds: [],
                repairedRunIds: [],
                reasonsByRunId: {},
                metrics: {
                  locallyReclaimableCount: 0,
                  inspectOnlyCount: 0,
                  notReclaimableCount: 0,
                  repairedCount: 0,
                },
              },
              attention: {
                staleHeartbeatInspectOnlyRunIds: [],
                reasonsByRunId: {},
                metrics: {
                  staleHeartbeatInspectOnlyCount: 0,
                },
              },
              cancellation: {
                reasonsByRunId: {},
                metrics: {
                  cancelledCount: 0,
                },
              },
              metrics: {
                reclaimableCount: 0,
                activeLeaseCount: 0,
                recoverableStrandedCount: 0,
                strandedCount: 0,
                cancelledCount: 0,
                idleCount: 0,
                actionableCount: 0,
                nonExecutableCount: 0,
              },
            };
          },
          async drainRunsUntilIdle() {
            drainCalls += 1;
            return {
              ownerId: 'host:test-background-close',
              expiredLeaseRunIds: [],
              executedRunIds: [],
              drained: [],
              iterations: 1,
            };
          },
          async drainRunsUntilIdleQueued(options = {}) {
            options.onStart?.();
            return this.drainRunsUntilIdle(options);
          },
          async waitForDrainQueue() {
            return null;
          },
        },
      },
    );

    await delay(80);
    await server.close();
    const callsAtClose = drainCalls;
    await delay(80);
    expect(drainCalls).toBeGreaterThan(0);
    expect(drainCalls).toBe(callsAtClose);
  });

  it('reports explicit development posture through /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-posture-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        executionHints: { headerNames: string[] };
      } & Record<string, unknown>;
      expect(payload).toMatchObject({
        object: 'status',
        ok: true,
        version: expect.any(String),
        mode: 'development',
        binding: {
          host: '127.0.0.1',
          port: server.port,
          localOnly: true,
          unauthenticated: true,
        },
        compatibility: {
          openai: true,
          chatCompletions: false,
          streaming: false,
          auth: false,
        },
        localClaimSummary: {
          sourceKind: 'direct',
          runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
          selectedRunIds: [],
          blockedRunIds: [],
          notReadyRunIds: [],
          unavailableRunIds: [],
          statusByRunId: {},
          reasonsByRunId: {},
          metrics: {
            selectedCount: 0,
            blockedCount: 0,
            notReadyCount: 0,
            unavailableCount: 0,
          },
        },
        runner: {
          id: `runner:http-responses:127.0.0.1:${server.port}`,
          hostId: `host:http-responses:127.0.0.1:${server.port}`,
          status: 'active',
          lastHeartbeatAt: expect.any(String),
          expiresAt: expect.any(String),
          lastActivityAt: null,
          lastClaimedRunId: null,
        },
        runnerTopology: {
          localExecutionOwnerRunnerId: `runner:http-responses:127.0.0.1:${server.port}`,
          metrics: {
            totalRunnerCount: 1,
            activeRunnerCount: 1,
            staleRunnerCount: 0,
            freshRunnerCount: 1,
            expiredRunnerCount: 0,
            browserCapableRunnerCount: 1,
            displayedRunnerCount: 1,
            omittedRunnerCount: 0,
            omittedStaleRunnerCount: 0,
            omittedExpiredRunnerCount: 0,
          },
          runners: [
            expect.objectContaining({
              runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
              hostId: `host:http-responses:127.0.0.1:${server.port}`,
              status: 'active',
              freshness: 'fresh',
              selectedAsLocalExecutionOwner: true,
            }),
          ],
        },
        backgroundDrain: {
          enabled: false,
          intervalMs: null,
          state: 'disabled',
          paused: false,
          lastTrigger: null,
          lastStartedAt: null,
          lastCompletedAt: null,
        },
        accountMirrorScheduler: {
          enabled: false,
          dryRun: true,
          intervalMs: null,
          state: 'disabled',
          paused: false,
          lastStartedAt: null,
          lastCompletedAt: null,
          lastPass: null,
        },
        routes: {
          recoveryDetailTemplate: '/status/recovery/{run_id}',
          runtimeRunInspection:
            '/v1/runtime-runs/inspect?runId={run_id}|teamRunId={team_run_id}|taskRunSpecId={task_run_spec_id}|runtimeRunId={runtime_run_id}[&runnerId={runner_id}][&probe=service-state][&diagnostics=browser-state][&authority=scheduler]',
          responsesGetTemplate: '/v1/responses/{response_id}',
          accountMirrorStatus:
            '/v1/account-mirrors/status[?provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&explicitRefresh=true]',
          accountMirrorCatalog:
            '/v1/account-mirrors/catalog[?provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&kind=projects|conversations|artifacts|files|media|all][&limit=50]',
          accountMirrorRefresh: '/v1/account-mirrors/refresh',
        },
        accountMirrorStatus: {
          object: 'account_mirror_status',
          metrics: {
            total: 0,
            eligible: 0,
            delayed: 0,
            blocked: 0,
          },
          entries: [],
        },
        executionHints: {
          bodyObject: 'auracall',
        },
      });
      expect(payload.executionHints.headerNames).toEqual([
        'X-AuraCall-Runtime-Profile',
        'X-AuraCall-Agent',
        'X-AuraCall-Team',
        'X-AuraCall-Service',
      ]);
    } finally {
      await server.close();
    }
  });

  it('reports read-only account mirror status from configured runtime profile identities', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-account-mirror-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-29T12:00:00.000Z'),
        config: {
          model: 'gpt-5.2',
          browser: {},
          runtimeProfiles: {
            default: {
              browserProfile: 'default',
              defaultService: 'chatgpt',
              services: {
                chatgpt: {
                  identity: {
                    email: 'ecochran76@gmail.com',
                    accountLevel: 'Business',
                  },
                },
              },
            },
            unbound: {
              browserProfile: 'default',
              defaultService: 'grok',
              services: {
                grok: {},
              },
            },
          },
        },
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/account-mirrors/status`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as AccountMirrorStatusSummary;
      expect(payload).toMatchObject({
        object: 'account_mirror_status',
        generatedAt: '2026-04-29T12:00:00.000Z',
        metrics: {
          total: 2,
          eligible: 1,
          blocked: 1,
        },
      });
      expect(payload.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'chatgpt',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            expectedIdentityKey: 'ecochran76@gmail.com',
            accountLevel: 'Business',
            status: 'eligible',
            reason: 'eligible',
          }),
          expect.objectContaining({
            provider: 'grok',
            runtimeProfileId: 'unbound',
            status: 'blocked',
            reason: 'expected-identity-missing',
          }),
        ]),
      );

      const filteredResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/account-mirrors/status?provider=chatgpt&runtimeProfile=default&explicitRefresh=true`,
      );
      expect(filteredResponse.status).toBe(200);
      const filtered = (await filteredResponse.json()) as AccountMirrorStatusSummary;
      expect(filtered.metrics.total).toBe(1);
      expect(filtered.entries[0]).toMatchObject({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        status: 'eligible',
      });

      const statusResponse = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(statusResponse.status).toBe(200);
      const statusPayload = (await statusResponse.json()) as {
        accountMirrorStatus: AccountMirrorStatusSummary;
      };
      expect(statusPayload.accountMirrorStatus.metrics).toMatchObject({
        total: 2,
        eligible: 1,
        blocked: 1,
      });

      const refreshResponse = await fetch(`http://127.0.0.1:${server.port}/v1/account-mirrors/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'chatgpt',
          runtimeProfile: 'default',
          explicitRefresh: true,
          queueTimeoutMs: 0,
        }),
      });
      expect(refreshResponse.status).toBe(202);
      const refreshPayload = await refreshResponse.json() as {
        object: string;
        status: string;
        provider: string;
        runtimeProfileId: string;
        metadataCounts: Record<string, number>;
        mirrorStatus: AccountMirrorStatusSummary;
      };
      expect(refreshPayload).toMatchObject({
        object: 'account_mirror_refresh',
        status: 'completed',
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        metadataCounts: {
          projects: 0,
          conversations: 0,
          artifacts: 0,
          files: 0,
          media: 0,
        },
      });
      expect(refreshPayload.mirrorStatus.entries[0]).toMatchObject({
        detectedIdentityKey: 'ecochran76@gmail.com',
        mirrorState: expect.objectContaining({
          queued: false,
          running: false,
          lastDispatcherKey: expect.stringContaining('service:chatgpt'),
        }),
      });
    } finally {
      await server.close();
    }
  });

  it('reports read-only account mirror catalog through the API surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-account-mirror-asset-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const cachedAssetPath = path.join(homeDir, 'cache', 'providers', 'chatgpt', 'ecochran76@gmail.com', 'blobs', 'asset.txt');
    await fs.mkdir(path.dirname(cachedAssetPath), { recursive: true });
    await fs.writeFile(cachedAssetPath, 'cached asset body', 'utf8');
    const mirrorCompleteness = {
      state: 'complete' as const,
      summary: 'Mirrored metadata indexes are complete within current provider surfaces.',
      remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
      signals: {
        projectsTruncated: false,
        conversationsTruncated: false,
        attachmentInventoryTruncated: false,
        attachmentCursorPresent: false,
      },
    };
    const catalog: AccountMirrorCatalogResult = {
      object: 'account_mirror_catalog',
      generatedAt: '2026-04-29T12:00:00.000Z',
      kind: 'conversations',
      limit: 2,
      entries: [
        {
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          boundIdentityKey: 'ecochran76@gmail.com',
          status: 'eligible',
          reason: 'eligible',
          mirrorCompleteness,
          manifests: {
            projects: [],
            conversations: [
              { id: 'conv_1', title: 'Conversation 1', provider: 'chatgpt' },
              { id: 'conv_2', title: 'Conversation 2', provider: 'chatgpt' },
            ],
            artifacts: [],
            files: [],
            media: [],
          },
          counts: {
            projects: 0,
            conversations: 2,
            artifacts: 0,
            files: 0,
            media: 0,
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 0,
        conversations: 2,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    };
    const readCatalog = vi.fn(async () => catalog);
    const readItem = vi.fn(async (query: { itemId: string }): Promise<AccountMirrorCatalogItemResult | null> => {
      if (query.itemId === 'asset_1') {
        return {
          object: 'account_mirror_catalog_item',
          generatedAt: '2026-04-29T12:00:00.000Z',
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          boundIdentityKey: 'ecochran76@gmail.com',
          status: 'eligible',
          reason: 'eligible',
          kind: 'files',
          itemId: 'asset_1',
          item: {
            id: 'asset_1',
            name: 'asset.txt',
            mimeType: 'text/plain',
            localPath: cachedAssetPath,
          },
        };
      }
      if (query.itemId !== 'conv_1') return null;
      return {
        object: 'account_mirror_catalog_item',
        generatedAt: '2026-04-29T12:00:00.000Z',
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        boundIdentityKey: 'ecochran76@gmail.com',
        status: 'eligible',
        reason: 'eligible',
        kind: 'conversations',
        itemId: 'conv_1',
        item: { id: 'conv_1', title: 'Conversation 1', provider: 'chatgpt' },
      };
    });
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        accountMirrorCatalogService: {
          readCatalog,
          readItem,
        },
      },
    );

    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/account-mirrors/catalog?provider=chatgpt&runtimeProfile=default&kind=conversations&limit=2`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        object: 'account_mirror_catalog',
        kind: 'conversations',
        limit: 2,
        metrics: {
          targets: 1,
          conversations: 2,
        },
      });
      expect(readCatalog).toHaveBeenCalledWith({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'conversations',
        limit: 2,
      });

      const itemResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/account-mirrors/catalog/items/conv_1?provider=chatgpt&runtimeProfile=default&kind=conversations`,
      );
      expect(itemResponse.status).toBe(200);
      expect(await itemResponse.json()).toMatchObject({
        object: 'account_mirror_catalog_item',
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'conversations',
        itemId: 'conv_1',
        item: {
          title: 'Conversation 1',
        },
      });
      expect(readItem).toHaveBeenCalledWith({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'conversations',
        itemId: 'conv_1',
      });

      const missingResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/account-mirrors/catalog/items/missing?provider=chatgpt&runtimeProfile=default&kind=conversations`,
      );
      expect(missingResponse.status).toBe(404);

      const assetResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/account-mirrors/catalog/items/asset_1/asset?provider=chatgpt&runtimeProfile=default&kind=files`,
      );
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get('content-type')).toContain('text/plain');
      expect(assetResponse.headers.get('cache-control')).toContain('private');
      expect(await assetResponse.text()).toBe('cached asset body');

      const missingAssetResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/account-mirrors/catalog/items/conv_1/asset?provider=chatgpt&runtimeProfile=default&kind=conversations`,
      );
      expect(missingAssetResponse.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('lists account mirror completion operations through the API surface', async () => {
    const operation: AccountMirrorCompletionOperation = {
      object: 'account_mirror_completion',
      id: 'acctmirror_http_list',
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      mode: 'live_follow',
      phase: 'steady_follow',
      status: 'running',
      startedAt: '2026-04-30T12:00:00.000Z',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
      maxPasses: null,
      passCount: 1,
      lastRefresh: null,
      mirrorCompleteness: completeAccountMirror,
      error: null,
    };
    const list = vi.fn(() => [operation]);
    const read = vi.fn(() => operation);
    const start = vi.fn(() => operation);
    const control = vi.fn(() => ({
      ...operation,
      status: 'paused' as const,
    }));
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        accountMirrorCompletionService: {
          start,
          read,
          list,
          control,
        },
      },
    );

    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/account-mirrors/completions?status=active&provider=chatgpt&runtimeProfile=default&limit=5`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        object: 'list',
        count: 1,
        data: [
          {
            id: 'acctmirror_http_list',
            status: 'running',
            mode: 'live_follow',
            phase: 'steady_follow',
          },
        ],
      });
      expect(list).toHaveBeenCalledWith({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        status: 'active',
        activeOnly: undefined,
        limit: 5,
      });

      const statusResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/account-mirrors/completions/acctmirror_http_list`,
      );
      expect(statusResponse.status).toBe(200);
      expect(await statusResponse.json()).toMatchObject({
        id: 'acctmirror_http_list',
      });
      expect(read).toHaveBeenCalledWith('acctmirror_http_list');

      const controlResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/account-mirrors/completions/acctmirror_http_list`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'pause' }),
        },
      );
      expect(controlResponse.status).toBe(200);
      expect(await controlResponse.json()).toMatchObject({
        id: 'acctmirror_http_list',
        status: 'paused',
      });
      expect(control).toHaveBeenCalledWith({
        id: 'acctmirror_http_list',
        action: 'pause',
      });

      const serverStatusResponse = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(serverStatusResponse.status).toBe(200);
      expect(await serverStatusResponse.json()).toMatchObject({
        accountMirrorCompletions: {
          object: 'account_mirror_completion_summary',
          metrics: {
            total: 1,
            active: 1,
            running: 1,
          },
          active: [
            {
              id: 'acctmirror_http_list',
            },
          ],
          recent: [
            {
              id: 'acctmirror_http_list',
            },
          ],
        },
        liveFollow: {
          severity: 'attention-needed',
          activeCompletions: 1,
        },
      });
    } finally {
      await server.close();
    }
  });

  it('reports effective live-follow wake separately from routine mirror eligibility', async () => {
    const config = {
      model: 'gpt-5.2',
      browser: {},
      runtimeProfiles: {
        default: {
          browserProfile: 'default',
          defaultService: 'chatgpt',
          services: {
            chatgpt: {
              identity: {
                email: 'ecochran76@gmail.com',
                accountLevel: 'Business',
              },
              liveFollow: {
                enabled: true,
                mode: 'metadata-first',
                priority: 'background',
              },
            },
          },
        },
      },
    };
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-04-30T12:00:00.000Z'),
      initialState: {
        'chatgpt:default': {
          detectedIdentityKey: 'ecochran76@gmail.com',
          lastAttemptAtMs: Date.parse('2026-04-30T11:50:00.000Z'),
          lastSuccessAtMs: Date.parse('2026-04-30T11:50:00.000Z'),
          metadataCounts: {
            projects: 5,
            conversations: 304,
            artifacts: 532,
            files: 65,
            media: 0,
          },
        },
      },
    });
    const operation: AccountMirrorCompletionOperation = {
      object: 'account_mirror_completion',
      id: 'acctmirror_effective_wake',
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      mode: 'live_follow',
      phase: 'backfill_history',
      status: 'running',
      startedAt: '2026-04-30T11:55:00.000Z',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
      maxPasses: null,
      passCount: 1,
      lastRefresh: null,
      mirrorCompleteness: completeAccountMirror,
      error: null,
    };
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        config,
        accountMirrorStatusRegistry: registry,
        accountMirrorCompletionService: {
          start: vi.fn(() => operation),
          read: vi.fn(() => operation),
          list: vi.fn(() => [operation]),
          control: vi.fn(() => operation),
        },
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(response.status).toBe(200);
      const payload = await response.json() as {
        liveFollow: {
          targets: {
            desired: {
              enabled: number;
            };
            actual: {
              running: number;
            };
            accounts: Array<{
              provider: string;
              runtimeProfileId: string;
              activeCompletionId: string | null;
              nextAttemptAt: string | null;
              routineEligibleAt: string | null;
              activeCompletionNextAttemptAt: string | null;
            }>;
          };
        };
      };
      expect(payload.liveFollow.targets.desired.enabled).toBe(1);
      expect(payload.liveFollow.targets.actual.running).toBe(1);
      const account = payload.liveFollow.targets.accounts[0];
      expect(account).toMatchObject({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        activeCompletionId: 'acctmirror_effective_wake',
        routineEligibleAt: expect.any(String),
        activeCompletionNextAttemptAt: '2026-04-30T12:10:00.000Z',
        nextAttemptAt: '2026-04-30T12:10:00.000Z',
      });
      expect(Date.parse(account.routineEligibleAt ?? '')).toBeGreaterThan(Date.parse(account.nextAttemptAt ?? ''));
    } finally {
      await server.close();
    }
  });

  it('does not report failed completion retry timestamps as active live-follow wake', async () => {
    const config = {
      model: 'gpt-5.2',
      browser: {},
      runtimeProfiles: {
        default: {
          browserProfile: 'default',
          defaultService: 'chatgpt',
          services: {
            chatgpt: {
              identity: {
                email: 'ecochran76@gmail.com',
                accountLevel: 'Business',
              },
              liveFollow: {
                enabled: true,
                mode: 'metadata-first',
                priority: 'background',
              },
            },
          },
        },
      },
    };
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-04-30T12:00:00.000Z'),
      initialState: {
        'chatgpt:default': {
          detectedIdentityKey: 'ecochran76@gmail.com',
          lastAttemptAtMs: Date.parse('2026-04-30T11:50:00.000Z'),
          lastSuccessAtMs: Date.parse('2026-04-30T11:50:00.000Z'),
          metadataCounts: {
            projects: 5,
            conversations: 304,
            artifacts: 532,
            files: 65,
            media: 0,
          },
        },
      },
    });
    const failedOperation: AccountMirrorCompletionOperation = {
      object: 'account_mirror_completion',
      id: 'acctmirror_failed_stale_next',
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      mode: 'live_follow',
      phase: 'backfill_history',
      status: 'failed',
      startedAt: '2026-04-30T11:55:00.000Z',
      completedAt: '2026-04-30T12:05:00.000Z',
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
      maxPasses: null,
      passCount: 0,
      lastRefresh: null,
      mirrorCompleteness: completeAccountMirror,
      error: {
        message: 'collector timed out',
        code: null,
      },
    };
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        config,
        accountMirrorStatusRegistry: registry,
        accountMirrorCompletionService: {
          start: vi.fn(() => failedOperation),
          read: vi.fn(() => failedOperation),
          list: vi.fn((request) => request?.status === 'active' ? [] : [failedOperation]),
          control: vi.fn(() => failedOperation),
        },
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(response.status).toBe(200);
      const payload = await response.json() as {
        liveFollow: {
          targets: {
            actual: {
              running: number;
              attentionNeeded: number;
            };
            accounts: Array<{
              activeCompletionId: string | null;
              activeCompletionNextAttemptAt: string | null;
              nextAttemptAt: string | null;
              routineEligibleAt: string | null;
              actualStatus: string | null;
              phase: string | null;
              passCount: number | null;
            }>;
          };
        };
      };
      const account = payload.liveFollow.targets.accounts[0];
      expect(account).toMatchObject({
        activeCompletionId: null,
        activeCompletionNextAttemptAt: null,
        nextAttemptAt: account.routineEligibleAt,
        actualStatus: 'delayed',
        phase: 'backfill_history',
        passCount: 0,
      });
      expect(account.nextAttemptAt).not.toBe('2026-04-30T12:10:00.000Z');
      expect(payload.liveFollow.targets.actual.running).toBe(0);
      expect(payload.liveFollow.targets.actual.attentionNeeded).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('parks active account mirror completions during server close when supported', async () => {
    const activeOperation: AccountMirrorCompletionOperation = {
      object: 'account_mirror_completion',
      id: 'acctmirror_shutdown_active',
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      mode: 'live_follow',
      phase: 'backfill_history',
      status: 'running',
      startedAt: '2026-04-30T12:00:00.000Z',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
      maxPasses: null,
      passCount: 1,
      lastRefresh: null,
      mirrorCompleteness: completeAccountMirror,
      error: null,
    };
    const prepareForShutdown = vi.fn(() => [{
      ...activeOperation,
      status: 'queued' as const,
    }]);
    const control = vi.fn();
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        accountMirrorCompletionService: {
          start: vi.fn(() => activeOperation),
          read: vi.fn(() => activeOperation),
          list: vi.fn((request) => request?.status === 'active' ? [activeOperation] : []),
          control,
          prepareForShutdown,
        },
      },
    );

    await server.close();

    expect(prepareForShutdown).toHaveBeenCalledTimes(1);
    expect(control).not.toHaveBeenCalled();
  });

  it('falls back to cancelling active account mirror completions during server close', async () => {
    const activeOperation: AccountMirrorCompletionOperation = {
      object: 'account_mirror_completion',
      id: 'acctmirror_shutdown_active_legacy',
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      mode: 'live_follow',
      phase: 'backfill_history',
      status: 'running',
      startedAt: '2026-04-30T12:00:00.000Z',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
      maxPasses: null,
      passCount: 1,
      lastRefresh: null,
      mirrorCompleteness: completeAccountMirror,
      error: null,
    };
    const control = vi.fn(() => ({
      ...activeOperation,
      status: 'cancelled' as const,
      completedAt: '2026-04-30T12:01:00.000Z',
    }));
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        accountMirrorCompletionService: {
          start: vi.fn(() => activeOperation),
          read: vi.fn(() => activeOperation),
          list: vi.fn((request) => request?.status === 'active' ? [activeOperation] : []),
          control,
        },
      },
    );

    await server.close();

    expect(control).toHaveBeenCalledWith({
      id: 'acctmirror_shutdown_active_legacy',
      action: 'cancel',
    });
  });

  it('terminates same-port orphan api serve processes before binding', async () => {
    const procRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-proc-'));
    const operationLockRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-operation-locks-'));
    cleanup.push(procRoot);
    cleanup.push(operationLockRoot);
    await fs.mkdir(path.join(procRoot, '101'));
    await fs.mkdir(path.join(procRoot, '102'));
    await fs.mkdir(path.join(procRoot, '103'));
    await fs.mkdir(path.join(procRoot, '104'));
    await fs.writeFile(
      path.join(procRoot, '101', 'cmdline'),
      ['node', '/home/user/.auracall/user-runtime/node_modules/auracall/dist/bin/auracall.js', 'api', 'serve', '--port', '18095'].join('\0'),
    );
    await fs.writeFile(
      path.join(procRoot, '102', 'cmdline'),
      ['node', '/home/user/.auracall/user-runtime/node_modules/auracall/dist/bin/auracall.js', 'api', 'serve', '--port', '18096'].join('\0'),
    );
    await fs.writeFile(
      path.join(procRoot, '103', 'cmdline'),
      ['node', '/home/user/.auracall/user-runtime/node_modules/auracall/dist/bin/auracall.js', 'api', 'status'].join('\0'),
    );
    await fs.writeFile(
      path.join(procRoot, '104', 'cmdline'),
      ['zsh', '-lc', 'setsid /home/user/.local/bin/auracall api serve --port 18095'].join('\0'),
    );
    await fs.writeFile(
      path.join(operationLockRoot, 'matched.json'),
      JSON.stringify({ ownerPid: 101, key: 'managed-profile:/tmp/profile::service:chatgpt' }),
      'utf8',
    );
    await fs.writeFile(
      path.join(operationLockRoot, 'other.json'),
      JSON.stringify({ ownerPid: 102, key: 'managed-profile:/tmp/profile::service:grok' }),
      'utf8',
    );
    await fs.writeFile(
      path.join(operationLockRoot, 'stale.json'),
      JSON.stringify({ ownerPid: 105, key: 'managed-profile:/tmp/profile::service:gemini' }),
      'utf8',
    );
    const terminated: Array<{ pid: number; signal: NodeJS.Signals }> = [];
    const logs: string[] = [];

    await expect(terminateSamePortApiServeProcesses({
      port: 18095,
      currentPid: 999,
      procRoot,
      operationLockRoot,
      logger: (message) => logs.push(message),
      isProcessAlive: (pid) => pid === 102,
      sleep: async () => undefined,
      terminateProcess: (pid, signal) => {
        terminated.push({ pid, signal });
      },
    })).resolves.toEqual([101]);

    expect(terminated).toEqual([{ pid: 101, signal: 'SIGTERM' }]);
    expect(logs[0]).toContain('Terminated orphan AuraCall api serve process 101 for port 18095');
    await expect(fs.access(path.join(operationLockRoot, 'matched.json'))).rejects.toThrow();
    await expect(fs.access(path.join(operationLockRoot, 'other.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(operationLockRoot, 'stale.json'))).rejects.toThrow();
  });

  it('escalates orphan api serve termination when SIGTERM does not stop the process', async () => {
    const procRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-proc-stubborn-'));
    cleanup.push(procRoot);
    await fs.mkdir(path.join(procRoot, '201'));
    await fs.writeFile(
      path.join(procRoot, '201', 'cmdline'),
      ['node', '/home/user/.auracall/user-runtime/node_modules/auracall/dist/bin/auracall.js', 'api', 'serve', '--port=18095'].join('\0'),
    );
    const terminated: Array<{ pid: number; signal: NodeJS.Signals }> = [];

    await expect(terminateSamePortApiServeProcesses({
      port: 18095,
      currentPid: 999,
      procRoot,
      terminationGraceMs: 0,
      isProcessAlive: () => true,
      sleep: async () => undefined,
      terminateProcess: (pid, signal) => {
        terminated.push({ pid, signal });
      },
    })).resolves.toEqual([201]);

    expect(terminated).toEqual([
      { pid: 201, signal: 'SIGTERM' },
      { pid: 201, signal: 'SIGKILL' },
    ]);
  });

  it('controls account mirror completions through the status preflight path', async () => {
    let operation: AccountMirrorCompletionOperation = {
      object: 'account_mirror_completion',
      id: 'acctmirror_status_control',
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      mode: 'live_follow',
      phase: 'steady_follow',
      status: 'running',
      startedAt: '2026-04-30T12:00:00.000Z',
      completedAt: null,
      nextAttemptAt: '2026-04-30T12:10:00.000Z',
      maxPasses: null,
      passCount: 2,
      lastRefresh: null,
      mirrorCompleteness: completeAccountMirror,
      error: null,
    };
    const control = vi.fn((request: { id: string; action: 'pause' | 'resume' | 'cancel' }) => {
      if (request.id !== operation.id) return null;
      operation = {
        ...operation,
        status: request.action === 'cancel' ? 'cancelled' : request.action === 'pause' ? 'paused' : 'running',
        completedAt: request.action === 'cancel' ? '2026-04-30T12:05:00.000Z' : null,
      };
      return operation;
    });
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        accountMirrorCompletionService: {
          start: vi.fn(() => operation),
          read: vi.fn((id: string) => (id === operation.id ? operation : null)),
          list: vi.fn(() => [operation]),
          control,
        },
      },
    );

    try {
      const pauseResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountMirrorCompletion: {
            id: 'acctmirror_status_control',
            action: 'pause',
          },
        }),
      });
      expect(pauseResponse.status).toBe(200);
      expect(await pauseResponse.json()).toMatchObject({
        controlResult: {
          kind: 'account-mirror-completion',
          id: 'acctmirror_status_control',
          action: 'pause',
          status: 'paused',
        },
        accountMirrorCompletions: {
          metrics: {
            active: 1,
            paused: 1,
          },
          active: [
            {
              id: 'acctmirror_status_control',
              status: 'paused',
            },
          ],
        },
        liveFollow: {
          severity: 'paused',
          pausedCompletions: 1,
        },
      });
      expect(control).toHaveBeenCalledWith({
        id: 'acctmirror_status_control',
        action: 'pause',
      });

      const missingResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountMirrorCompletion: {
            id: 'missing_completion',
            action: 'cancel',
          },
        }),
      });
      expect(missingResponse.status).toBe(404);
      expect(await missingResponse.json()).toMatchObject({
        error: {
          type: 'not_found_error',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('reports dry-run lazy account mirror scheduler passes through /status', async () => {
    const pass: AccountMirrorSchedulerPassResult = {
      object: 'account_mirror_scheduler_pass',
      mode: 'dry-run',
      action: 'dry-run',
      startedAt: '2026-04-29T12:00:00.000Z',
      completedAt: '2026-04-29T12:00:00.000Z',
      selectedTarget: {
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        status: 'eligible',
        reason: 'eligible',
        eligibleAt: '2026-04-29T12:00:00.000Z',
        mirrorCompleteness: completeAccountMirror,
      },
      backpressure: {
        reason: 'none',
        message: null,
      },
      metrics: {
        totalTargets: 1,
        eligibleTargets: 1,
        delayedTargets: 0,
        blockedTargets: 0,
        defaultChatgptEligibleTargets: 1,
        defaultChatgptDelayedTargets: 0,
        inProgressEligibleTargets: 0,
      },
      refresh: null,
      error: null,
    };
    const runOnce = vi.fn(async () => pass);
    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        accountMirrorSchedulerIntervalMs: 25,
        accountMirrorSchedulerDryRun: true,
      },
      {
        accountMirrorSchedulerService: {
          runOnce,
        },
        accountMirrorSchedulerLedger: createMemorySchedulerLedger(),
      },
    );

    try {
      await delay(40);
      const response = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(response.status).toBe(200);
      const payload = await response.json() as {
        accountMirrorScheduler: {
          enabled: boolean;
          dryRun: boolean;
          intervalMs: number;
          state: string;
          paused: boolean;
          lastWakeReason: string | null;
          lastWakeAt: string | null;
          operatorStatus: { posture: string; reason: string; backpressureReason: string | null };
          lastPass: AccountMirrorSchedulerPassResult | null;
          history: {
            object: string;
            entries: AccountMirrorSchedulerPassResult[];
          };
        };
      };
      expect(runOnce).toHaveBeenCalledWith({
        dryRun: true,
      });
      expect(payload.accountMirrorScheduler).toMatchObject({
        enabled: true,
        dryRun: true,
        intervalMs: 25,
        paused: false,
        lastWakeAt: expect.any(String),
        operatorStatus: {
          posture: 'healthy',
          backpressureReason: 'none',
        },
        lastPass: {
          object: 'account_mirror_scheduler_pass',
          mode: 'dry-run',
          action: 'dry-run',
          backpressure: {
            reason: 'none',
          },
          selectedTarget: {
            provider: 'chatgpt',
            runtimeProfileId: 'default',
          },
        },
        history: {
          object: 'account_mirror_scheduler_pass_history',
          entries: expect.arrayContaining([
            expect.objectContaining({
              object: 'account_mirror_scheduler_pass',
              mode: 'dry-run',
              action: 'dry-run',
            }),
          ]),
        },
      });
      expect(['startup-cadence', 'cadence']).toContain(payload.accountMirrorScheduler.lastWakeReason);
      expect(['idle', 'scheduled', 'running']).toContain(payload.accountMirrorScheduler.state);
    } finally {
      await server.close();
    }
  });

  it('reports compact lazy mirror scheduler yield history through the API surface', async () => {
    const yieldedPass: AccountMirrorSchedulerPassResult = {
      object: 'account_mirror_scheduler_pass',
      mode: 'execute',
      action: 'refresh-completed',
      startedAt: '2026-04-29T12:00:00.000Z',
      completedAt: '2026-04-29T12:00:05.000Z',
      selectedTarget: {
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        status: 'eligible',
        reason: 'eligible',
        eligibleAt: '2026-04-29T12:00:00.000Z',
        mirrorCompleteness: completeAccountMirror,
      },
      backpressure: {
        reason: 'yielded-to-queued-work',
        message: 'Mirror refresh yielded between detail reads because browser work queued behind it.',
      },
      metrics: {
        totalTargets: 1,
        eligibleTargets: 1,
        delayedTargets: 0,
        blockedTargets: 0,
        defaultChatgptEligibleTargets: 1,
        defaultChatgptDelayedTargets: 0,
        inProgressEligibleTargets: 1,
      },
      refresh: {
        object: 'account_mirror_refresh',
        requestId: 'acctmirror_yield_1',
        status: 'completed',
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        startedAt: '2026-04-29T12:00:00.000Z',
        completedAt: '2026-04-29T12:00:05.000Z',
        dispatcher: {
          key: 'managed-profile:/tmp/auracall-default-chatgpt::service:chatgpt',
          operationId: 'op_mirror_1',
          blockedBy: null,
        },
        metadataCounts: {
          projects: 2,
          conversations: 6,
          artifacts: 0,
          files: 1,
          media: 0,
        },
        metadataEvidence: {
          identitySource: 'profile-menu',
          projectSampleIds: [],
          conversationSampleIds: [],
          attachmentInventory: {
            nextProjectIndex: 1,
            nextConversationIndex: 3,
            detailReadLimit: 6,
            scannedProjects: 1,
            scannedConversations: 3,
            yielded: true,
            yieldCause: {
              observedAt: '2026-04-29T12:00:04.500Z',
              ownerCommand: 'media-generation:chatgpt:image',
              kind: 'media-generation',
              operationClass: 'exclusive-mutating',
            },
          },
          truncated: {
            projects: false,
            conversations: false,
            artifacts: true,
          },
        },
        mirrorCompleteness: {
          state: 'in_progress',
          summary: 'Attachment inventory has 4 detail surfaces remaining.',
          remainingDetailSurfaces: {
            projects: 1,
            conversations: 3,
            total: 4,
          },
          signals: {
            projectsTruncated: false,
            conversationsTruncated: false,
            attachmentInventoryTruncated: true,
            attachmentCursorPresent: true,
          },
        },
        detectedIdentityKey: 'ecochran76@gmail.com',
        detectedAccountLevel: 'Business',
        mirrorStatus: {
          object: 'account_mirror_status',
          generatedAt: '2026-04-29T12:00:05.000Z',
          metrics: {
            total: 1,
            eligible: 1,
            delayed: 0,
            blocked: 0,
          },
          entries: [],
        },
      },
      error: null,
    };
    const ledger = createMemorySchedulerLedger();
    await ledger.appendPass(yieldedPass);
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      { accountMirrorSchedulerLedger: ledger },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/account-mirrors/scheduler/history?limit=5`);
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toMatchObject({
        object: 'account_mirror_scheduler_history',
        updatedAt: '2026-04-29T12:00:05.000Z',
        latestYield: {
          completedAt: '2026-04-29T12:00:05.000Z',
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          queuedWork: {
            observedAt: '2026-04-29T12:00:04.500Z',
            ownerCommand: 'media-generation:chatgpt:image',
            kind: 'media-generation',
            operationClass: 'exclusive-mutating',
          },
          resumeCursor: {
            nextProjectIndex: 1,
            nextConversationIndex: 3,
          },
          remainingDetailSurfaces: {
            total: 4,
          },
        },
        entries: [
          expect.objectContaining({
            action: 'refresh-completed',
            backpressureReason: 'yielded-to-queued-work',
            yielded: true,
            remainingDetailSurfaces: 4,
          }),
        ],
      });
    } finally {
      await server.close();
    }
  });

  it('pauses, resumes, and manually triggers lazy account mirror scheduler through POST /status', async () => {
    const runOnce = vi.fn(async (input: { dryRun: boolean }): Promise<AccountMirrorSchedulerPassResult> => ({
      object: 'account_mirror_scheduler_pass',
      mode: input.dryRun ? 'dry-run' : 'execute',
      action: input.dryRun ? 'dry-run' : 'refresh-completed',
      startedAt: '2026-04-29T12:00:00.000Z',
      completedAt: '2026-04-29T12:00:00.000Z',
      selectedTarget: {
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        status: 'eligible',
        reason: 'eligible',
        eligibleAt: '2026-04-29T12:00:00.000Z',
        mirrorCompleteness: completeAccountMirror,
      },
      backpressure: {
        reason: 'none',
        message: null,
      },
      metrics: {
        totalTargets: 1,
        eligibleTargets: 1,
        delayedTargets: 0,
        blockedTargets: 0,
        defaultChatgptEligibleTargets: 1,
        defaultChatgptDelayedTargets: 0,
        inProgressEligibleTargets: 0,
      },
      refresh: null,
      error: null,
    }));
    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        accountMirrorSchedulerIntervalMs: 1000,
        accountMirrorSchedulerDryRun: true,
      },
      {
        accountMirrorSchedulerService: {
          runOnce,
        },
        accountMirrorSchedulerLedger: createMemorySchedulerLedger(),
      },
    );

    try {
      const pauseResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountMirrorScheduler: { action: 'pause' },
        }),
      });
      expect(pauseResponse.status).toBe(200);
      const pausedPayload = (await pauseResponse.json()) as {
        accountMirrorScheduler: { state: string };
        controlResult: unknown;
      };
      expect(pausedPayload).toMatchObject({
        accountMirrorScheduler: {
          enabled: true,
          dryRun: true,
          intervalMs: 1000,
          state: 'paused',
          paused: true,
        },
        controlResult: {
          kind: 'account-mirror-scheduler',
          action: 'pause',
          dryRun: true,
        },
      });

      const runOnceResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountMirrorScheduler: { action: 'run-once', dryRun: false },
        }),
      });
      expect(runOnceResponse.status).toBe(200);
      expect(runOnce).toHaveBeenCalledWith({
        dryRun: true,
      });
      const runOncePayload = (await runOnceResponse.json()) as {
        accountMirrorScheduler: { state: string };
        controlResult: unknown;
      };
      expect(runOncePayload).toMatchObject({
        accountMirrorScheduler: {
          enabled: true,
          dryRun: true,
          state: 'paused',
          paused: true,
          lastWakeReason: 'operator-run-once',
          lastWakeAt: expect.any(String),
          operatorStatus: {
            posture: 'paused',
            backpressureReason: null,
          },
          lastStartedAt: expect.any(String),
          lastCompletedAt: expect.any(String),
          lastPass: {
            object: 'account_mirror_scheduler_pass',
            mode: 'dry-run',
            action: 'dry-run',
            backpressure: {
              reason: 'none',
            },
          },
          history: {
            object: 'account_mirror_scheduler_pass_history',
            entries: [
              expect.objectContaining({
                object: 'account_mirror_scheduler_pass',
                mode: 'dry-run',
                action: 'dry-run',
              }),
            ],
          },
        },
        controlResult: {
          kind: 'account-mirror-scheduler',
          action: 'run-once',
          dryRun: true,
        },
      });

      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountMirrorScheduler: { action: 'resume' },
        }),
      });
      expect(resumeResponse.status).toBe(200);
      const resumedPayload = (await resumeResponse.json()) as {
        accountMirrorScheduler: { state: string };
        controlResult: unknown;
      };
      expect(resumedPayload).toMatchObject({
        accountMirrorScheduler: {
          enabled: true,
          dryRun: true,
          intervalMs: 1000,
          paused: false,
        },
        controlResult: {
          kind: 'account-mirror-scheduler',
          action: 'resume',
          dryRun: true,
        },
      });
      expect(['idle', 'scheduled', 'running']).toContain(resumedPayload.accountMirrorScheduler.state);
    } finally {
      await server.close();
    }
  });

  it('allows an execute-enabled manual account mirror scheduler pass through POST /status', async () => {
    const runOnce = vi.fn(async (input: { dryRun: boolean }): Promise<AccountMirrorSchedulerPassResult> => ({
      object: 'account_mirror_scheduler_pass',
      mode: input.dryRun ? 'dry-run' : 'execute',
      action: input.dryRun ? 'dry-run' : 'refresh-completed',
      startedAt: '2026-04-29T12:00:00.000Z',
      completedAt: '2026-04-29T12:00:00.000Z',
      selectedTarget: null,
      backpressure: {
        reason: 'none',
        message: null,
      },
      metrics: {
        totalTargets: 0,
        eligibleTargets: 0,
        delayedTargets: 0,
        blockedTargets: 0,
        defaultChatgptEligibleTargets: 0,
        defaultChatgptDelayedTargets: 0,
        inProgressEligibleTargets: 0,
      },
      refresh: null,
      error: null,
    }));
    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        accountMirrorSchedulerDryRun: false,
      },
      {
        accountMirrorSchedulerService: {
          runOnce,
        },
        accountMirrorSchedulerLedger: createMemorySchedulerLedger(),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountMirrorScheduler: { action: 'run-once', dryRun: false },
        }),
      });
      expect(response.status).toBe(200);
      expect(runOnce).toHaveBeenCalledWith({
        dryRun: false,
      });
      const payload = (await response.json()) as {
        accountMirrorScheduler: { state: string };
        controlResult: unknown;
      };
      expect(payload).toMatchObject({
        accountMirrorScheduler: {
          enabled: false,
          dryRun: false,
          intervalMs: null,
          state: 'disabled',
          paused: false,
          lastWakeReason: 'operator-run-once',
          lastWakeAt: expect.any(String),
          operatorStatus: {
            posture: 'disabled',
            backpressureReason: null,
          },
          lastPass: {
            object: 'account_mirror_scheduler_pass',
            mode: 'execute',
            action: 'refresh-completed',
          },
          history: {
            object: 'account_mirror_scheduler_pass_history',
            entries: [
              expect.objectContaining({
                object: 'account_mirror_scheduler_pass',
                mode: 'execute',
                action: 'refresh-completed',
              }),
            ],
          },
        },
        controlResult: {
          kind: 'account-mirror-scheduler',
          action: 'run-once',
          dryRun: false,
        },
      });
    } finally {
      await server.close();
    }
  });

  it('nudges lazy account mirror follow-up after media generation settles', async () => {
    const pass: AccountMirrorSchedulerPassResult = {
      object: 'account_mirror_scheduler_pass',
      mode: 'dry-run',
      action: 'skipped',
      startedAt: '2026-04-29T12:00:00.000Z',
      completedAt: '2026-04-29T12:00:00.000Z',
      selectedTarget: null,
      backpressure: {
        reason: 'routine-delayed',
        message: 'routine delay',
      },
      metrics: {
        totalTargets: 1,
        eligibleTargets: 0,
        delayedTargets: 1,
        blockedTargets: 0,
        defaultChatgptEligibleTargets: 0,
        defaultChatgptDelayedTargets: 1,
        inProgressEligibleTargets: 0,
      },
      refresh: null,
      error: null,
    };
    const runOnce = vi.fn(async () => pass);
    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        accountMirrorSchedulerIntervalMs: 60_000,
        accountMirrorSchedulerDryRun: true,
      },
      {
        accountMirrorSchedulerService: {
          runOnce,
        },
        accountMirrorSchedulerLedger: createMemorySchedulerLedger(),
        mediaGenerationExecutor: async () => ({
          artifacts: [
            {
              id: 'artifact_followup_1',
              type: 'image',
              mimeType: 'image/png',
            },
          ],
        }),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/media-generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          mediaType: 'image',
          prompt: 'Generate an image of an asphalt secret agent',
          wait: true,
        }),
      });
      expect(response.status).toBe(200);
      await waitForPredicate(() => runOnce.mock.calls.length > 0);
      expect(runOnce).toHaveBeenCalledWith({ dryRun: true });
      const statusResponse = await fetch(`http://127.0.0.1:${server.port}/status`);
      const status = (await statusResponse.json()) as {
        accountMirrorScheduler: {
          lastWakeReason: string | null;
          lastWakeAt: string | null;
          operatorStatus: { posture: string; reason: string; backpressureReason: string | null };
          lastPass: AccountMirrorSchedulerPassResult | null;
        };
      };
      expect(status.accountMirrorScheduler.lastWakeReason).toBe('media-generation-settled');
      expect(status.accountMirrorScheduler.lastWakeAt).toEqual(expect.any(String));
      expect(status.accountMirrorScheduler.operatorStatus).toMatchObject({
        posture: 'backpressured',
        reason: 'routine delay',
        backpressureReason: 'routine-delayed',
      });
      expect(status.accountMirrorScheduler.lastPass).toMatchObject({
        object: 'account_mirror_scheduler_pass',
        backpressure: {
          reason: 'routine-delayed',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('keeps /status local-claim projection scoped to the server local runner even when another eligible runner is fresher', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-runner-scope-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await seedPlannedDirectRun(
      control,
      'status_runner_scope_direct',
      '2026-04-08T16:20:00.000Z',
      'Status runner scope direct',
    );
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:alternate-fresh',
        hostId: 'host:alternate',
        startedAt: '2026-04-08T16:18:00.000Z',
        lastHeartbeatAt: '2026-04-08T16:20:55.000Z',
        expiresAt: '2026-04-08T16:30:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        runnersControl,
        now: () => new Date('2026-04-08T16:21:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status?recovery=1`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      const localRunnerId = `runner:http-responses:127.0.0.1:${server.port}`;

      expect(payload).toMatchObject({
        runner: {
          id: localRunnerId,
          hostId: `host:http-responses:127.0.0.1:${server.port}`,
          status: 'active',
        },
        localClaimSummary: {
          sourceKind: 'direct',
          runnerId: localRunnerId,
          selectedRunIds: ['status_runner_scope_direct'],
          blockedRunIds: [],
          notReadyRunIds: [],
          unavailableRunIds: [],
          statusByRunId: {
            status_runner_scope_direct: 'eligible',
          },
          reasonsByRunId: {},
        },
        recoverySummary: {
          localClaim: {
            runnerId: localRunnerId,
            selectedRunIds: ['status_runner_scope_direct'],
            blockedRunIds: [],
            notReadyRunIds: [],
            unavailableRunIds: [],
            statusByRunId: {
              status_runner_scope_direct: 'eligible',
            },
            reasonsByRunId: {},
          },
          reclaimableRunIds: ['status_runner_scope_direct'],
        },
        runnerTopology: {
          localExecutionOwnerRunnerId: localRunnerId,
          metrics: {
            totalRunnerCount: 2,
            activeRunnerCount: 2,
            staleRunnerCount: 0,
            freshRunnerCount: 2,
            expiredRunnerCount: 0,
            browserCapableRunnerCount: 1,
            displayedRunnerCount: 2,
            omittedRunnerCount: 0,
            omittedStaleRunnerCount: 0,
            omittedExpiredRunnerCount: 0,
          },
          runners: expect.arrayContaining([
            expect.objectContaining({
              runnerId: localRunnerId,
              selectedAsLocalExecutionOwner: true,
              freshness: 'fresh',
            }),
            expect.objectContaining({
              runnerId: 'runner:alternate-fresh',
              selectedAsLocalExecutionOwner: false,
              freshness: 'fresh',
            }),
          ]),
        },
      });

      const alternateRunner = await runnersControl.readRunner('runner:alternate-fresh');
      expect(alternateRunner?.runner.lastClaimedRunId).toBeNull();
      expect(alternateRunner?.runner.lastActivityAt).toBeNull();
    } finally {
      await server.close();
    }
  });

  it('compacts stale runner topology entries on /status unless full topology is requested', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-topology-compact-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const runnersControl = createExecutionRunnerControl();
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:stale-old',
        hostId: 'host:stale-old',
        status: 'stale',
        startedAt: '2026-04-08T16:10:00.000Z',
        lastHeartbeatAt: '2026-04-08T16:10:05.000Z',
        expiresAt: '2026-04-08T16:10:20.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: [],
        browserCapable: true,
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:fresh-alternate',
        hostId: 'host:fresh-alternate',
        startedAt: '2026-04-08T16:19:00.000Z',
        lastHeartbeatAt: '2026-04-08T16:20:55.000Z',
        expiresAt: '2026-04-08T16:30:00.000Z',
        serviceIds: ['grok'],
        runtimeProfileIds: ['grok-runtime'],
        browserProfileIds: ['browser-default'],
        browserCapable: true,
      }),
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        runnersControl,
        now: () => new Date('2026-04-08T16:21:00.000Z'),
      },
    );

    try {
      const compactResponse = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(compactResponse.status).toBe(200);
      const compactPayload = (await compactResponse.json()) as {
        runnerTopology: {
          metrics: Record<string, number>;
          runners: Array<{ runnerId: string }>;
        };
      };
      expect(compactPayload.runnerTopology.metrics).toMatchObject({
        totalRunnerCount: 3,
        staleRunnerCount: 1,
        displayedRunnerCount: 2,
        omittedRunnerCount: 1,
        omittedStaleRunnerCount: 1,
        omittedExpiredRunnerCount: 0,
      });
      expect(compactPayload.runnerTopology.runners.map((runner) => runner.runnerId)).toEqual([
        `runner:http-responses:127.0.0.1:${server.port}`,
        'runner:fresh-alternate',
      ]);

      const fullResponse = await fetch(`http://127.0.0.1:${server.port}/status?runnerTopology=full`);
      expect(fullResponse.status).toBe(200);
      const fullPayload = (await fullResponse.json()) as {
        runnerTopology: {
          metrics: Record<string, number>;
          runners: Array<{ runnerId: string }>;
        };
      };
      expect(fullPayload.runnerTopology.metrics).toMatchObject({
        totalRunnerCount: 3,
        displayedRunnerCount: 3,
        omittedRunnerCount: 0,
      });
      expect(fullPayload.runnerTopology.runners.map((runner) => runner.runnerId)).toEqual([
        `runner:http-responses:127.0.0.1:${server.port}`,
        'runner:fresh-alternate',
        'runner:stale-old',
      ]);
    } finally {
      await server.close();
    }
  });

  it('registers and reports a live persisted runner for api serve status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runner-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let nowValue = new Date('2026-04-11T14:00:00.000Z');
    const runnersControl = createExecutionRunnerControl();
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => nowValue,
        runnersControl,
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { controlResult?: Record<string, unknown> };
      expect(payload).toMatchObject({
        runner: {
          id: `runner:http-responses:127.0.0.1:${server.port}`,
          hostId: `host:http-responses:127.0.0.1:${server.port}`,
          status: 'active',
          lastHeartbeatAt: '2026-04-11T14:00:00.000Z',
          expiresAt: '2026-04-11T14:00:15.000Z',
          lastActivityAt: null,
          lastClaimedRunId: null,
        },
      });

      const storedRunner = await runnersControl.readRunner(`runner:http-responses:127.0.0.1:${server.port}`);
      expect(storedRunner).not.toBeNull();
      expect(storedRunner).toMatchObject({
        runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
        runner: {
          id: `runner:http-responses:127.0.0.1:${server.port}`,
          hostId: `host:http-responses:127.0.0.1:${server.port}`,
          status: 'active',
        },
      });
    } finally {
      nowValue = new Date('2026-04-11T14:00:30.000Z');
      await server.close();
    }
  });

  it('registers config-derived runner capability metadata for api serve', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runner-config-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let nowValue = new Date('2026-04-15T09:00:00.000Z');
    const runnersControl = createExecutionRunnerControl();
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => nowValue,
        runnersControl,
        config: {
          services: {
            chatgpt: {
              identity: {
                email: 'ChatGPT-Operator@Example.COM',
              },
            },
          },
          runtimeProfiles: {
            analyst: {
              engine: 'api',
              defaultService: 'grok',
            },
            default: {
              engine: 'browser',
              defaultService: 'chatgpt',
              browserProfile: 'default',
            },
            'gemini-browser': {
              engine: 'browser',
              browserProfile: 'wsl-chrome-2',
              services: {
                gemini: {
                  url: 'https://gemini.google.com/app',
                  identity: {
                    handle: 'Gemini WSL',
                  },
                },
              },
            },
          },
        },
      },
    );

    try {
      const storedRunner = await runnersControl.readRunner(`runner:http-responses:127.0.0.1:${server.port}`);
      expect(storedRunner).not.toBeNull();
      expect(storedRunner).toMatchObject({
        runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
        runner: {
          serviceIds: ['chatgpt', 'gemini', 'grok'],
          runtimeProfileIds: ['analyst', 'default', 'gemini-browser'],
          browserProfileIds: ['default', 'wsl-chrome-2'],
          serviceAccountIds: [
            'service-account:chatgpt:chatgpt-operator@example.com',
            'service-account:gemini:gemini wsl',
          ],
          browserCapable: true,
          eligibilityNote: 'api serve local runner; service-account affinity partially projected',
        },
      });
    } finally {
      nowValue = new Date('2026-04-15T09:00:30.000Z');
      await server.close();
    }
  });

  it('marks the persisted api serve runner stale on close', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runner-close-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let nowValue = new Date('2026-04-11T14:05:00.000Z');
    const runnersControl = createExecutionRunnerControl();
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => nowValue,
        runnersControl,
      },
    );

    const runnerId = `runner:http-responses:127.0.0.1:${server.port}`;
    nowValue = new Date('2026-04-11T14:05:45.000Z');
    await server.close();

    const storedRunner = await runnersControl.readRunner(runnerId);
    expect(storedRunner).not.toBeNull();
    expect(storedRunner).toMatchObject({
      runnerId,
      runner: {
        id: runnerId,
        status: 'stale',
        lastHeartbeatAt: '2026-04-11T14:05:00.000Z',
        expiresAt: '2026-04-11T14:05:45.000Z',
        lastActivityAt: null,
        lastClaimedRunId: null,
        eligibilityNote: 'api serve shutdown; service-account affinity not projected',
      },
    });
  });

  it('reports live background drain state through /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-drain-state-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    let drainCalls = 0;
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0, backgroundDrainIntervalMs: 25 },
      {
        executionHost: {
          async registerLocalRunner() {
            return null;
          },
          async heartbeatLocalRunner() {
            return null;
          },
          async markLocalRunnerStale() {
            return null;
          },
          async drainRunsOnce() {
            throw new Error('unexpected direct drain call');
          },
          async repairStaleHeartbeatLease(runId) {
            return {
              action: 'repair-stale-heartbeat' as const,
              runId,
              status: 'not-found' as const,
              repaired: false,
              reason: `run ${runId} was not found`,
              leaseHealthStatus: null,
              repairPosture: null,
              reconciliationReason: null,
            };
          },
          async claimLocalRunWithSchedulerAuthority(input) {
            return {
              action: input.action,
              runId: input.runId,
              schedulerId: input.schedulerId,
              status: 'blocked' as const,
              claimed: false,
              mutationAllowed: false,
              reason: 'scheduler control is not available in this test host',
              decision: null,
              selectedRunnerId: null,
              localRunnerId: null,
              previousLeaseId: null,
              previousLeaseOwnerId: null,
              newLeaseId: null,
              newLeaseOwnerId: null,
            };
          },
          async controlOperatorAction(input) {
            if (input.kind === 'lease-repair') {
              return {
                kind: input.kind,
                ...(await this.repairStaleHeartbeatLease(input.runId)),
              };
            }
            if (input.kind === 'local-action-control') {
              return {
                kind: input.kind,
                ...(await this.resolveLocalActionRequest(
                  input.runId,
                  input.requestId,
                  input.resolution,
                  input.note ?? null,
                )),
              };
            }
            if (input.kind === 'scheduler-control') {
              return {
                kind: input.kind,
                ...(await this.claimLocalRunWithSchedulerAuthority(input.control)),
              };
            }
            return {
              kind: input.kind,
              ...(await this.controlRun(input.control)),
            };
          },
          async controlRun(input) {
            if (input.action === 'resume-human-escalation') {
              return this.resumeHumanEscalation(input.runId);
            }
            if (input.action === 'drain-run') {
              return this.drainRun(input.runId);
            }
            return this.cancelOwnedRun(input.runId);
          },
          async cancelOwnedRun(runId) {
            return {
              action: 'cancel-run' as const,
              runId,
              status: 'not-found' as const,
              cancelled: false,
              reason: `run ${runId} was not found`,
            };
          },
          async resumeHumanEscalation(runId) {
            return {
              action: 'resume-human-escalation' as const,
              runId,
              status: 'not-found' as const,
              resumed: false,
              reason: `run ${runId} was not found`,
              resumedAt: null,
              resumedStepId: null,
            };
          },
          async drainRun(runId) {
            return {
              action: 'drain-run' as const,
              runId,
              status: 'not-found' as const,
              drained: false,
              reason: `run ${runId} was not found`,
              skipReason: null,
            };
          },
          async resolveLocalActionRequest(runId, requestId, resolution) {
            return {
              action: 'resolve-local-action-request' as const,
              runId,
              requestId,
              resolution,
              status: 'not-found' as const,
              resolved: false,
              reason: `run ${runId} was not found`,
              resolvedAt: null,
              ownerStepId: null,
            };
          },
          async readRecoveryDetail() {
            return null;
          },
          async summarizeLocalClaimState() {
            return null;
          },
          async summarizeRunnerTopology() {
            return {
              localExecutionOwnerRunnerId: null,
              generatedAt: '2026-04-08T12:05:00.000Z',
              runners: [],
              metrics: {
                totalRunnerCount: 0,
                activeRunnerCount: 0,
                staleRunnerCount: 0,
                freshRunnerCount: 0,
                expiredRunnerCount: 0,
                browserCapableRunnerCount: 0,
              },
            };
          },
          async summarizeRecoveryState() {
            return {
              totalRuns: 0,
              reclaimableRunIds: [],
              activeLeaseRunIds: [],
              recoverableStrandedRunIds: [],
              strandedRunIds: [],
              cancelledRunIds: [],
              idleRunIds: [],
              localClaim: null,
              activeLeaseHealth: {
                freshRunIds: [],
                staleHeartbeatRunIds: [],
                suspiciousIdleRunIds: [],
                reasonsByRunId: {},
                metrics: {
                  freshCount: 0,
                  staleHeartbeatCount: 0,
                  suspiciousIdleCount: 0,
                },
              },
              leaseRepair: {
                locallyReclaimableRunIds: [],
                inspectOnlyRunIds: [],
                notReclaimableRunIds: [],
                repairedRunIds: [],
                reasonsByRunId: {},
                metrics: {
                  locallyReclaimableCount: 0,
                  inspectOnlyCount: 0,
                  notReclaimableCount: 0,
                  repairedCount: 0,
                },
              },
              attention: {
                staleHeartbeatInspectOnlyRunIds: [],
                reasonsByRunId: {},
                metrics: {
                  staleHeartbeatInspectOnlyCount: 0,
                },
              },
              cancellation: {
                reasonsByRunId: {},
                metrics: {
                  cancelledCount: 0,
                },
              },
              metrics: {
                reclaimableCount: 0,
                activeLeaseCount: 0,
                recoverableStrandedCount: 0,
                strandedCount: 0,
                cancelledCount: 0,
                idleCount: 0,
                actionableCount: 0,
                nonExecutableCount: 0,
              },
            };
          },
          async drainRunsUntilIdle() {
            drainCalls += 1;
            await delay(75);
            return {
              ownerId: 'host:test-status-drain',
              expiredLeaseRunIds: [],
              executedRunIds: [],
              drained: [],
              iterations: 1,
            };
          },
          async drainRunsUntilIdleQueued(options = {}) {
            options.onStart?.();
            return this.drainRunsUntilIdle(options);
          },
          async waitForDrainQueue() {
            return null;
          },
        },
      },
    );

    try {
      await delay(35);
      const runningResponse = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(runningResponse.status).toBe(200);
      const runningPayload = (await runningResponse.json()) as JsonObject;
      expect(runningPayload).toMatchObject({
        backgroundDrain: {
          enabled: true,
          intervalMs: 25,
          state: 'running',
          paused: false,
          lastTrigger: 'background-timer',
          lastStartedAt: expect.any(String),
        },
      });

      await delay(90);
      const idleResponse = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(idleResponse.status).toBe(200);
      const idlePayload = (await idleResponse.json()) as JsonObject;
      expect(idlePayload).toMatchObject({
        backgroundDrain: {
          enabled: true,
          intervalMs: 25,
          paused: false,
          lastTrigger: 'background-timer',
          lastStartedAt: expect.any(String),
          lastCompletedAt: expect.any(String),
        },
      });
      expect(['idle', 'scheduled', 'running']).toContain(
        requireJsonObject(idlePayload.backgroundDrain, 'backgroundDrain').state,
      );
      expect(drainCalls).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it('pauses and resumes background drain through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-drain-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'status_pause_resume_run', '2026-04-08T16:10:00.000Z', 'Pause then resume.');

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0, recoverRunsOnStart: false, backgroundDrainIntervalMs: 25 },
      { control },
    );

    try {
      const pauseResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backgroundDrain: { action: 'pause' },
        }),
      });
      expect(pauseResponse.status).toBe(200);
      const pausedPayload = (await pauseResponse.json()) as JsonObject;
      expect(pausedPayload).toMatchObject({
        backgroundDrain: {
          enabled: true,
          intervalMs: 25,
          state: 'paused',
          paused: true,
        },
      });

      await delay(100);
      const pausedRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/status_pause_resume_run`);
      expect(pausedRead.status).toBe(200);
      const pausedReadPayload = (await pausedRead.json()) as Record<string, unknown>;
      expect(pausedReadPayload).toMatchObject({
        id: 'status_pause_resume_run',
        status: 'in_progress',
      });

      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backgroundDrain: { action: 'resume' },
        }),
      });
      expect(resumeResponse.status).toBe(200);
      const resumedPayload = (await resumeResponse.json()) as JsonObject;
      expect(resumedPayload).toMatchObject({
        backgroundDrain: {
          enabled: true,
          intervalMs: 25,
          paused: false,
        },
      });

      await delay(100);
      const resumedRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/status_pause_resume_run`);
      expect(resumedRead.status).toBe(200);
      const resumedReadPayload = (await resumedRead.json()) as Record<string, unknown>;
      expect(resumedReadPayload).toMatchObject({
        id: 'status_pause_resume_run',
        status: 'completed',
      });
    } finally {
      await server.close();
    }
  });

  it('repairs only stale-heartbeat leases through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-stale-heartbeat-repair-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'status_repair_stale', '2026-04-08T16:10:00.000Z', 'Repair stale heartbeat.');
    await control.acquireLease({
      runId: 'status_repair_stale',
      leaseId: 'status_repair_stale:lease:1',
      ownerId: 'runner:missing-stale',
      acquiredAt: '2026-04-08T16:10:00.000Z',
      heartbeatAt: '2026-04-08T16:10:10.000Z',
      expiresAt: '2026-04-08T16:11:00.000Z',
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T16:12:00.000Z'),
      },
    );

    try {
      const repairResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaseRepair: {
            action: 'repair-stale-heartbeat',
            runId: 'status_repair_stale',
          },
        }),
      });
      expect(repairResponse.status).toBe(200);
      const repairPayload = (await repairResponse.json()) as JsonObject;
      expect(repairPayload).toMatchObject({
        controlResult: {
          kind: 'lease-repair',
          action: 'repair-stale-heartbeat',
          runId: 'status_repair_stale',
          status: 'repaired',
          repaired: true,
          leaseHealthStatus: 'stale-heartbeat',
          repairPosture: 'locally-reclaimable',
          reconciliationReason: 'lease owner runner:missing-stale has no persisted runner record',
        },
      });

      const repairedRecord = await control.readRun('status_repair_stale');
      expect(repairedRecord?.bundle.leases[0]?.status).toBe('expired');
      expect(repairedRecord?.bundle.leases[0]?.releaseReason).toBe('lease expired');
    } finally {
      await server.close();
    }
  });

  it('claims a scheduler-authorized local run through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-scheduler-claim-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await seedPlannedDirectRun(control, 'status_scheduler_claim', '2026-04-08T16:10:00.000Z', 'Claim locally.');

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0, recoverRunsOnStart: false },
      {
        control,
        runnersControl,
        now: () => new Date('2026-04-08T16:12:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedulerControl: {
            action: 'claim-local-run',
            runId: 'status_scheduler_claim',
            schedulerId: 'operator:http-test',
          },
        }),
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as JsonObject;
      const localRunnerId = `runner:http-responses:127.0.0.1:${server.port}`;
      expect(payload.controlResult).toMatchObject({
        kind: 'scheduler-control',
        action: 'claim-local-run',
        runId: 'status_scheduler_claim',
        schedulerId: 'operator:http-test',
        status: 'claimed',
        claimed: true,
        selectedRunnerId: localRunnerId,
        newLeaseOwnerId: localRunnerId,
      });
      const stored = await control.readRun('status_scheduler_claim');
      expect(stored?.bundle.leases.find((lease) => lease.status === 'active')).toMatchObject({
        ownerId: localRunnerId,
      });
    } finally {
      await server.close();
    }
  });

  it('rejects suspiciously idle leases on POST /status stale-heartbeat repair', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-stale-heartbeat-repair-reject-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await seedPlannedDirectRun(control, 'status_repair_idle', '2026-04-08T16:10:00.000Z', 'Do not repair idle.');
    await control.acquireLease({
      runId: 'status_repair_idle',
      leaseId: 'status_repair_idle:lease:1',
      ownerId: 'runner:idle-http',
      acquiredAt: '2026-04-08T16:10:00.000Z',
      heartbeatAt: '2026-04-08T16:14:55.000Z',
      expiresAt: '2026-04-08T16:20:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:idle-http',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T16:00:00.000Z',
        lastHeartbeatAt: '2026-04-08T16:14:55.000Z',
        expiresAt: '2026-04-08T16:20:00.000Z',
        lastActivityAt: '2026-04-08T16:09:00.000Z',
        lastClaimedRunId: 'older_run',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        runnersControl,
        now: () => new Date('2026-04-08T16:15:00.000Z'),
      },
    );

    try {
      const repairResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaseRepair: {
            action: 'repair-stale-heartbeat',
            runId: 'status_repair_idle',
          },
        }),
      });
      expect(repairResponse.status).toBe(409);
      const repairPayload = (await repairResponse.json()) as JsonObject;
      expect(repairPayload).toMatchObject({
        error: {
          type: 'invalid_request_error',
          message: 'active lease has no observed runner activity since it was acquired',
        },
      });

      const storedRecord = await control.readRun('status_repair_idle');
      expect(storedRecord?.bundle.leases[0]?.status).toBe('active');
    } finally {
      await server.close();
    }
  });

  it('cancels an active local runner-owned run through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-run-cancel-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'status_cancel_run', '2026-04-08T16:10:00.000Z', 'Cancel me.');

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T16:12:00.000Z'),
      },
    );

    try {
      const runnerId = `runner:http-responses:127.0.0.1:${server.port}`;
      const stepId = 'status_cancel_run:step:1';
      const record = await control.readRun('status_cancel_run');
      await control.persistRun({
        runId: 'status_cancel_run',
        expectedRevision: record!.revision,
        bundle: {
          ...record!.bundle,
          run: {
            ...record!.bundle.run,
            status: 'running',
            updatedAt: '2026-04-08T16:12:00.000Z',
          },
          steps: record!.bundle.steps.map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  status: 'running',
                  startedAt: '2026-04-08T16:12:00.000Z',
                }
              : step,
          ),
        },
      });
      await control.acquireLease({
        runId: 'status_cancel_run',
        leaseId: 'status_cancel_run:lease:runner',
        ownerId: runnerId,
        acquiredAt: '2026-04-08T16:12:00.000Z',
        heartbeatAt: '2026-04-08T16:12:00.000Z',
        expiresAt: '2026-04-08T16:20:00.000Z',
      });

      const cancelResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'cancel-run',
            runId: 'status_cancel_run',
          },
        }),
      });
      expect(cancelResponse.status).toBe(200);
      const cancelPayload = (await cancelResponse.json()) as JsonObject;
      expect(cancelPayload).toMatchObject({
        controlResult: {
          kind: 'run-control',
          action: 'cancel-run',
          runId: 'status_cancel_run',
          status: 'cancelled',
          cancelled: true,
        },
      });

      const storedRecord = await control.readRun('status_cancel_run');
      expect(storedRecord?.bundle.run.status).toBe('cancelled');
      expect(storedRecord?.bundle.sharedState.status).toBe('cancelled');
      expect(storedRecord?.bundle.steps[0]?.status).toBe('cancelled');
      expect(storedRecord?.bundle.leases[0]?.status).toBe('released');
      expect(storedRecord?.bundle.leases[0]?.releaseReason).toBe('cancelled');

      const rereadResponse = await fetch(`http://127.0.0.1:${server.port}/v1/responses/status_cancel_run`);
      expect(rereadResponse.status).toBe(200);
      const rereadPayload = (await rereadResponse.json()) as Record<string, unknown>;
      expect(rereadPayload).toMatchObject({
        id: 'status_cancel_run',
        status: 'cancelled',
        metadata: {
          executionSummary: {
            terminalStepId: 'status_cancel_run:step:1',
            completedAt: '2026-04-08T16:12:00.000Z',
            lastUpdatedAt: '2026-04-08T16:12:00.000Z',
            cancellationSummary: {
              cancelledAt: '2026-04-08T16:12:00.000Z',
              source: 'operator',
              reason: 'run cancelled by service host operator control',
            },
            failureSummary: null,
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces cancelled runs through recovery summary and per-run detail after local cancel', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-run-cancel-recovery-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'status_cancel_recovery', '2026-04-08T16:10:00.000Z', 'Cancel me too.');

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T16:12:00.000Z'),
      },
    );

    try {
      const runnerId = `runner:http-responses:127.0.0.1:${server.port}`;
      const stepId = 'status_cancel_recovery:step:1';
      const record = await control.readRun('status_cancel_recovery');
      await control.persistRun({
        runId: 'status_cancel_recovery',
        expectedRevision: record!.revision,
        bundle: {
          ...record!.bundle,
          run: {
            ...record!.bundle.run,
            status: 'running',
            updatedAt: '2026-04-08T16:12:00.000Z',
          },
          steps: record!.bundle.steps.map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  status: 'running',
                  startedAt: '2026-04-08T16:12:00.000Z',
                }
              : step,
          ),
        },
      });
      await control.acquireLease({
        runId: 'status_cancel_recovery',
        leaseId: 'status_cancel_recovery:lease:runner',
        ownerId: runnerId,
        acquiredAt: '2026-04-08T16:12:00.000Z',
        heartbeatAt: '2026-04-08T16:12:00.000Z',
        expiresAt: '2026-04-08T16:20:00.000Z',
      });

      const cancelResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'cancel-run',
            runId: 'status_cancel_recovery',
          },
        }),
      });
      expect(cancelResponse.status).toBe(200);

      const summaryResponse = await fetch(`http://127.0.0.1:${server.port}/status?recovery=true`);
      expect(summaryResponse.status).toBe(200);
      const summaryPayload = (await summaryResponse.json()) as JsonObject;
      expect(summaryPayload).toMatchObject({
        recoverySummary: {
          cancelledRunIds: ['status_cancel_recovery'],
          cancellation: {
            reasonsByRunId: {
              status_cancel_recovery: 'run cancelled by service host operator control',
            },
            metrics: {
              cancelledCount: 1,
            },
          },
          metrics: {
            cancelledCount: 1,
          },
        },
      });

      const detailResponse = await fetch(
        `http://127.0.0.1:${server.port}/status/recovery/status_cancel_recovery`,
      );
      expect(detailResponse.status).toBe(200);
      const detailPayload = (await detailResponse.json()) as JsonObject;
      expect(detailPayload).toMatchObject({
        detail: {
          runId: 'status_cancel_recovery',
          hostState: 'cancelled',
          cancellation: {
            cancelledAt: '2026-04-08T16:12:00.000Z',
            source: 'operator',
            reason: 'run cancelled by service host operator control',
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('falls back to run timestamps when HTTP recovery detail has no cancellation note event', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-run-cancel-fallback-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'status_cancel_recovery_fallback';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'cancelled',
          createdAt: '2026-04-08T16:10:00.000Z',
          updatedAt: '2026-04-08T16:13:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Read cancelled fallback detail.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'cancelled',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Read cancelled fallback detail.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T16:11:00.000Z',
            completedAt: '2026-04-08T16:13:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'cancelled',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T16:13:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-08T16:10:00.000Z',
          }),
        ],
      }),
    );
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T16:15:00.000Z'),
      },
    );

    try {
      const detailResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${runId}`);
      expect(detailResponse.status).toBe(200);
      const detailPayload = (await detailResponse.json()) as JsonObject;
      expect(detailPayload).toMatchObject({
        detail: {
          runId,
          hostState: 'cancelled',
          cancellation: {
            cancelledAt: '2026-04-08T16:13:00.000Z',
            source: null,
            reason: null,
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('rejects cancelling a run not owned by the local runner through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-run-cancel-reject-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'status_cancel_other_owner', '2026-04-08T16:10:00.000Z', 'Do not cancel.');

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T16:12:00.000Z'),
      },
    );

    try {
      const stepId = 'status_cancel_other_owner:step:1';
      const record = await control.readRun('status_cancel_other_owner');
      await control.persistRun({
        runId: 'status_cancel_other_owner',
        expectedRevision: record!.revision,
        bundle: {
          ...record!.bundle,
          run: {
            ...record!.bundle.run,
            status: 'running',
            updatedAt: '2026-04-08T16:12:00.000Z',
          },
          steps: record!.bundle.steps.map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  status: 'running',
                  startedAt: '2026-04-08T16:12:00.000Z',
                }
              : step,
          ),
        },
      });
      await control.acquireLease({
        runId: 'status_cancel_other_owner',
        leaseId: 'status_cancel_other_owner:lease:runner',
        ownerId: 'runner:someone-else',
        acquiredAt: '2026-04-08T16:12:00.000Z',
        heartbeatAt: '2026-04-08T16:12:00.000Z',
        expiresAt: '2026-04-08T16:20:00.000Z',
      });

      const cancelResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'cancel-run',
            runId: 'status_cancel_other_owner',
          },
        }),
      });
      expect(cancelResponse.status).toBe(409);
      const cancelPayload = (await cancelResponse.json()) as JsonObject;
      expect(cancelPayload).toMatchObject({
        error: {
          type: 'invalid_request_error',
          message: expect.stringContaining('active lease is owned by runner:someone-else'),
        },
      });

      const storedRecord = await control.readRun('status_cancel_other_owner');
      expect(storedRecord?.bundle.run.status).toBe('running');
      expect(storedRecord?.bundle.steps[0]?.status).toBe('running');
      expect(storedRecord?.bundle.leases[0]?.status).toBe('active');
    } finally {
      await server.close();
    }
  });

  it('returns recovery summary from status when requested', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-recovery-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'status_recovery_direct', '2026-04-08T16:00:00.000Z', 'Recover direct');
    await seedPlannedDirectRun(control, 'status_recovery_team', '2026-04-08T16:01:00.000Z', 'Recover team', 'team-run');
    await seedPlannedDirectRun(control, 'status_busy_direct', '2026-04-08T16:02:00.000Z', 'Busy direct');
    await control.acquireLease({
      runId: 'status_busy_direct',
      leaseId: 'status_busy_direct:lease:busy',
      ownerId: 'runner:missing',
      acquiredAt: '2026-04-08T16:02:00.000Z',
      heartbeatAt: '2026-04-08T16:02:00.000Z',
      expiresAt: '2026-04-08T16:10:00.000Z',
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T16:15:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status?recovery=1`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        runner: {
          id: `runner:http-responses:127.0.0.1:${server.port}`,
          hostId: `host:http-responses:127.0.0.1:${server.port}`,
          status: 'active',
          lastHeartbeatAt: expect.any(String),
          expiresAt: expect.any(String),
          lastActivityAt: null,
          lastClaimedRunId: null,
        },
        backgroundDrain: {
          enabled: false,
          intervalMs: null,
          state: 'disabled',
          paused: false,
          lastTrigger: null,
          lastStartedAt: null,
          lastCompletedAt: null,
        },
        localClaimSummary: {
          sourceKind: 'direct',
          runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
          selectedRunIds: ['status_recovery_direct', 'status_busy_direct'],
          blockedRunIds: [],
          notReadyRunIds: [],
          unavailableRunIds: [],
          statusByRunId: {
            status_recovery_direct: 'eligible',
            status_busy_direct: 'eligible',
          },
          reasonsByRunId: {},
          metrics: {
            selectedCount: 2,
            blockedCount: 0,
            notReadyCount: 0,
            unavailableCount: 0,
          },
        },
        recoverySummary: {
          totalRuns: 2,
          reclaimableRunIds: ['status_recovery_direct', 'status_busy_direct'],
          activeLeaseRunIds: [],
          recoverableStrandedRunIds: [],
          strandedRunIds: [],
          idleRunIds: [],
          localClaim: {
            runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
            selectedRunIds: ['status_recovery_direct', 'status_busy_direct'],
            blockedRunIds: [],
            notReadyRunIds: [],
            unavailableRunIds: [],
            statusByRunId: {
              status_recovery_direct: 'eligible',
              status_busy_direct: 'eligible',
            },
            reasonsByRunId: {},
            metrics: {
              selectedCount: 2,
              blockedCount: 0,
              notReadyCount: 0,
              unavailableCount: 0,
            },
          },
          leaseRepair: {
            locallyReclaimableRunIds: ['status_busy_direct'],
            inspectOnlyRunIds: [],
            notReclaimableRunIds: [],
            repairedRunIds: ['status_busy_direct'],
            reasonsByRunId: {
              status_busy_direct: 'active lease owner is unavailable and the lease is expired',
            },
            metrics: {
              locallyReclaimableCount: 1,
              inspectOnlyCount: 0,
              notReclaimableCount: 0,
              repairedCount: 1,
            },
          },
          attention: {
            staleHeartbeatInspectOnlyRunIds: [],
            reasonsByRunId: {},
            metrics: {
              staleHeartbeatInspectOnlyCount: 0,
            },
          },
          metrics: {
            reclaimableCount: 2,
            activeLeaseCount: 0,
            recoverableStrandedCount: 0,
            strandedCount: 0,
            idleCount: 0,
            actionableCount: 2,
            nonExecutableCount: 0,
          },
        },
      });
      expect(payload).not.toHaveProperty('recoverySummary.taskRunSpecId');
      expect(payload).not.toHaveProperty('recoverySummary.orchestrationTimelineSummary');
      expect(payload).not.toHaveProperty('recoverySummary.handoffTransferSummary');
      expect(payload).not.toHaveProperty('recoverySummary.leaseHealth');

      const teamResponse = await fetch(
        `http://127.0.0.1:${server.port}/status?recovery=true&sourceKind=team-run`,
      );
      expect(teamResponse.status).toBe(200);
      const teamPayload = (await teamResponse.json()) as Record<string, unknown>;
      expect(teamPayload).toMatchObject({
        runner: {
          id: `runner:http-responses:127.0.0.1:${server.port}`,
          hostId: `host:http-responses:127.0.0.1:${server.port}`,
          status: 'active',
          lastHeartbeatAt: expect.any(String),
          expiresAt: expect.any(String),
          lastActivityAt: null,
          lastClaimedRunId: null,
        },
        backgroundDrain: {
          enabled: false,
          intervalMs: null,
          state: 'disabled',
          paused: false,
          lastTrigger: null,
          lastStartedAt: null,
          lastCompletedAt: null,
        },
        localClaimSummary: {
          sourceKind: 'direct',
          runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
          selectedRunIds: ['status_recovery_direct', 'status_busy_direct'],
          blockedRunIds: [],
          notReadyRunIds: [],
          unavailableRunIds: [],
          statusByRunId: {
            status_recovery_direct: 'eligible',
            status_busy_direct: 'eligible',
          },
          reasonsByRunId: {},
          metrics: {
            selectedCount: 2,
            blockedCount: 0,
            notReadyCount: 0,
            unavailableCount: 0,
          },
        },
        recoverySummary: {
          totalRuns: 1,
          reclaimableRunIds: ['status_recovery_team'],
          activeLeaseRunIds: [],
          recoverableStrandedRunIds: [],
          strandedRunIds: [],
          idleRunIds: [],
          localClaim: {
            runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
            selectedRunIds: ['status_recovery_team'],
            blockedRunIds: [],
            notReadyRunIds: [],
            unavailableRunIds: [],
            statusByRunId: {
              status_recovery_team: 'eligible',
            },
            reasonsByRunId: {},
            metrics: {
              selectedCount: 1,
              blockedCount: 0,
              notReadyCount: 0,
              unavailableCount: 0,
            },
          },
          leaseRepair: {
            locallyReclaimableRunIds: [],
            inspectOnlyRunIds: [],
            notReclaimableRunIds: [],
            repairedRunIds: [],
            reasonsByRunId: {},
            metrics: {
              locallyReclaimableCount: 0,
              inspectOnlyCount: 0,
              notReclaimableCount: 0,
              repairedCount: 0,
            },
          },
          attention: {
            staleHeartbeatInspectOnlyRunIds: [],
            reasonsByRunId: {},
            metrics: {
              staleHeartbeatInspectOnlyCount: 0,
            },
          },
          metrics: {
            reclaimableCount: 1,
            activeLeaseCount: 0,
            recoverableStrandedCount: 0,
            strandedCount: 0,
            idleCount: 0,
            actionableCount: 1,
            nonExecutableCount: 0,
          },
        },
      });
      expect(teamPayload).not.toHaveProperty('recoverySummary.taskRunSpecId');
      expect(teamPayload).not.toHaveProperty('recoverySummary.orchestrationTimelineSummary');
      expect(teamPayload).not.toHaveProperty('recoverySummary.handoffTransferSummary');
      expect(teamPayload).not.toHaveProperty('recoverySummary.leaseHealth');

      const allResponse = await fetch(`http://127.0.0.1:${server.port}/status?recovery=true&sourceKind=all`);
      expect(allResponse.status).toBe(200);
      const allPayload = (await allResponse.json()) as Record<string, unknown>;
      expect(allPayload).toMatchObject({
        runner: {
          id: `runner:http-responses:127.0.0.1:${server.port}`,
          hostId: `host:http-responses:127.0.0.1:${server.port}`,
          status: 'active',
          lastHeartbeatAt: expect.any(String),
          expiresAt: expect.any(String),
          lastActivityAt: null,
          lastClaimedRunId: null,
        },
        backgroundDrain: {
          enabled: false,
          intervalMs: null,
          state: 'disabled',
          paused: false,
          lastTrigger: null,
          lastStartedAt: null,
          lastCompletedAt: null,
        },
        localClaimSummary: {
          sourceKind: 'direct',
          runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
          selectedRunIds: ['status_recovery_direct', 'status_busy_direct'],
          blockedRunIds: [],
          notReadyRunIds: [],
          unavailableRunIds: [],
          statusByRunId: {
            status_recovery_direct: 'eligible',
            status_busy_direct: 'eligible',
          },
          reasonsByRunId: {},
          metrics: {
            selectedCount: 2,
            blockedCount: 0,
            notReadyCount: 0,
            unavailableCount: 0,
          },
        },
        recoverySummary: {
          totalRuns: 3,
          reclaimableRunIds: ['status_recovery_direct', 'status_recovery_team', 'status_busy_direct'],
          activeLeaseRunIds: [],
          recoverableStrandedRunIds: [],
          strandedRunIds: [],
          idleRunIds: [],
          localClaim: {
            runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
            selectedRunIds: ['status_recovery_direct', 'status_recovery_team', 'status_busy_direct'],
            blockedRunIds: [],
            notReadyRunIds: [],
            unavailableRunIds: [],
            statusByRunId: {
              status_recovery_direct: 'eligible',
              status_recovery_team: 'eligible',
              status_busy_direct: 'eligible',
            },
            reasonsByRunId: {},
            metrics: {
              selectedCount: 3,
              blockedCount: 0,
              notReadyCount: 0,
              unavailableCount: 0,
            },
          },
          leaseRepair: {
            locallyReclaimableRunIds: [],
            inspectOnlyRunIds: [],
            notReclaimableRunIds: [],
            repairedRunIds: [],
            reasonsByRunId: {},
            metrics: {
              locallyReclaimableCount: 0,
              inspectOnlyCount: 0,
              notReclaimableCount: 0,
              repairedCount: 0,
            },
          },
          attention: {
            staleHeartbeatInspectOnlyRunIds: [],
            reasonsByRunId: {},
            metrics: {
              staleHeartbeatInspectOnlyCount: 0,
            },
          },
          metrics: {
            reclaimableCount: 3,
            activeLeaseCount: 0,
            recoverableStrandedCount: 0,
            strandedCount: 0,
            idleCount: 0,
            actionableCount: 3,
            nonExecutableCount: 0,
          },
        },
      });
      expect(allPayload).not.toHaveProperty('recoverySummary.taskRunSpecId');
      expect(allPayload).not.toHaveProperty('recoverySummary.orchestrationTimelineSummary');
      expect(allPayload).not.toHaveProperty('recoverySummary.handoffTransferSummary');
      expect(allPayload).not.toHaveProperty('recoverySummary.leaseHealth');
      expect(allPayload).not.toHaveProperty('localClaimSummary.taskRunSpecId');
      expect(allPayload).not.toHaveProperty('localClaimSummary.orchestrationTimelineSummary');
      expect(allPayload).not.toHaveProperty('localClaimSummary.handoffTransferSummary');
      expect(allPayload).not.toHaveProperty('localClaimSummary.leaseHealth');
      expect(allPayload).not.toHaveProperty('runner.taskRunSpecId');
      expect(allPayload).not.toHaveProperty('runner.orchestrationTimelineSummary');
      expect(allPayload).not.toHaveProperty('backgroundDrain.taskRunSpecId');
      expect(allPayload).not.toHaveProperty('backgroundDrain.orchestrationTimelineSummary');
    } finally {
      await server.close();
    }
  });

  it('reports compact active-lease health aggregates through the recovery summary surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-active-lease-health-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'status_active_stale', '2026-04-08T16:10:00.000Z', 'Inspect active lease');
    await control.acquireLease({
      runId: 'status_active_stale',
      leaseId: 'status_active_stale:lease:busy',
      ownerId: 'runner:missing',
      acquiredAt: '2026-04-08T16:10:00.000Z',
      heartbeatAt: '2026-04-08T16:10:00.000Z',
      expiresAt: '2026-04-08T16:20:00.000Z',
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T16:15:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status?recovery=true`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        recoverySummary: {
          totalRuns: 1,
          reclaimableRunIds: [],
          activeLeaseRunIds: ['status_active_stale'],
          recoverableStrandedRunIds: [],
          strandedRunIds: [],
          idleRunIds: [],
          activeLeaseHealth: {
            freshRunIds: [],
            staleHeartbeatRunIds: ['status_active_stale'],
            suspiciousIdleRunIds: [],
            reasonsByRunId: {
              status_active_stale: 'lease owner runner:missing has no persisted runner record',
            },
            metrics: {
              freshCount: 0,
              staleHeartbeatCount: 1,
              suspiciousIdleCount: 0,
            },
          },
          leaseRepair: {
            locallyReclaimableRunIds: [],
            inspectOnlyRunIds: ['status_active_stale'],
            notReclaimableRunIds: [],
            repairedRunIds: [],
            reasonsByRunId: {
              status_active_stale: 'active lease owner is unavailable but the lease has not expired yet',
            },
            metrics: {
              locallyReclaimableCount: 0,
              inspectOnlyCount: 1,
              notReclaimableCount: 0,
              repairedCount: 0,
            },
          },
          attention: {
            staleHeartbeatInspectOnlyRunIds: ['status_active_stale'],
            reasonsByRunId: {
              status_active_stale: 'active lease owner is unavailable but the lease has not expired yet',
            },
            metrics: {
              staleHeartbeatInspectOnlyCount: 1,
            },
          },
          metrics: {
            reclaimableCount: 0,
            activeLeaseCount: 1,
            recoverableStrandedCount: 0,
            strandedCount: 0,
            idleCount: 0,
            actionableCount: 0,
            nonExecutableCount: 1,
          },
        },
      });
      expect(payload).not.toHaveProperty('recoverySummary.taskRunSpecId');
      expect(payload).not.toHaveProperty('recoverySummary.orchestrationTimelineSummary');
      expect(payload).not.toHaveProperty('recoverySummary.handoffTransferSummary');
      expect(payload).not.toHaveProperty('recoverySummary.leaseHealth');
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded local claim status map when the configured runner record is unavailable', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-local-claim-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(
      control,
      'status_missing_local_runner',
      '2026-04-08T15:00:00.000Z',
      'Expose missing runner local claim status.',
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T15:05:00.000Z'),
        executionHost: createExecutionServiceHost({
          control,
          runnerId: 'runner:missing-http-local',
          ownerId: 'host:http-responses:127.0.0.1:8080',
          now: () => '2026-04-08T15:05:00.000Z',
        }),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        localClaimSummary: {
          sourceKind: 'direct',
          runnerId: 'runner:missing-http-local',
          selectedRunIds: [],
          blockedRunIds: [],
          notReadyRunIds: [],
          unavailableRunIds: ['status_missing_local_runner'],
          statusByRunId: {
            status_missing_local_runner: 'claim-owner-unavailable',
          },
          reasonsByRunId: {
            status_missing_local_runner:
              'runner runner:missing-http-local has no persisted runner record',
          },
          metrics: {
            selectedCount: 0,
            blockedCount: 0,
            notReadyCount: 0,
            unavailableCount: 1,
          },
        },
      });
    } finally {
      await server.close();
    }
  });
  it('returns bounded recovery detail for one run through a separate status route', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-recovery-detail-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'status_detail_busy', '2026-04-08T16:10:00.000Z', 'Inspect busy');
    await control.acquireLease({
      runId: 'status_detail_busy',
      leaseId: 'status_detail_busy:lease:busy',
      ownerId: 'runner:missing',
      acquiredAt: '2026-04-08T16:10:00.000Z',
      heartbeatAt: '2026-04-08T16:10:00.000Z',
      expiresAt: '2026-04-08T16:20:00.000Z',
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T16:15:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status/recovery/status_detail_busy`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        object: 'recovery_detail',
        detail: {
          runId: 'status_detail_busy',
          sourceKind: 'direct',
          taskRunSpecId: null,
          hostState: 'active-lease',
          activeLease: {
            leaseId: 'status_detail_busy:lease:busy',
            ownerId: 'runner:missing',
            expiresAt: '2026-04-08T16:20:00.000Z',
          },
          dispatch: {
            nextRunnableStepId: 'status_detail_busy:step:1',
            runningStepIds: [],
          },
          repair: {
            posture: 'inspect-only',
            reason: 'active lease owner is unavailable but the lease has not expired yet',
            reconciliationStatus: 'missing-runner',
            reconciliationReason: 'lease owner runner:missing has no persisted runner record',
            leaseOwnerId: 'runner:missing',
            leaseExpiresAt: '2026-04-08T16:20:00.000Z',
          },
          leaseHealth: {
            status: 'stale-heartbeat',
            reason: 'lease owner runner:missing has no persisted runner record',
            leaseHeartbeatAt: '2026-04-08T16:10:00.000Z',
            leaseExpiresAt: '2026-04-08T16:20:00.000Z',
            runnerLastHeartbeatAt: null,
            runnerLastActivityAt: null,
          },
          attention: {
            needed: true,
            kind: 'stale-heartbeat-inspect-only',
            reason: 'active lease owner is unavailable but the lease has not expired yet',
          },
          localClaim: {
            runnerId: `runner:http-responses:127.0.0.1:${server.port}`,
            hostId: `host:http-responses:127.0.0.1:${server.port}`,
            status: 'not-ready',
            selected: false,
            reason: 'run is held-by-lease',
            queueState: 'active-lease',
            claimState: 'held-by-lease',
            affinityStatus: 'eligible',
            affinityReason: null,
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('suppresses task-run-spec linkage on direct recovery detail over HTTP', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-recovery-detail-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    await writeTaskRunSpecStoredRecord({
      id: 'task_spec_http_direct_recovery_hidden_1',
      teamId: 'team_template_http_direct_recovery_hidden_1',
      title: 'Do not project direct recovery assignment identity over HTTP',
      objective: 'Recovery detail should keep task spec identity team-run scoped over HTTP.',
      successCriteria: [],
      requestedOutputs: [],
      inputArtifacts: [],
      context: {},
      constraints: {},
      overrides: {},
      turnPolicy: {
        maxTurns: 8,
        stopOnStatus: ['succeeded', 'failed', 'cancelled', 'needs-human'],
        allowTeamInitiatedStop: true,
        allowHumanEscalation: true,
      },
      humanInteractionPolicy: {
        requiredOn: ['needs-approval', 'missing-info', 'needs-human'],
        allowClarificationRequests: true,
        allowApprovalRequests: true,
        defaultBehavior: 'pause',
      },
      localActionPolicy: {
        mode: 'forbidden',
        complexityStage: 'bounded-command',
        allowedActionKinds: [],
        allowedCommands: [],
        allowedCwdRoots: [],
        resultReportingMode: 'summary-only',
      },
      requestedBy: {
        kind: 'service',
        label: 'http responses test',
      },
      trigger: 'service',
      createdAt: '2026-04-12T19:09:00.000Z',
    });

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(
      control,
      'status_detail_direct_task_spec_hidden',
      '2026-04-12T19:10:00.000Z',
      'Do not expose direct recovery assignment identity.',
    );
    const record = await control.readRun('status_detail_direct_task_spec_hidden');
    await control.persistRun({
      runId: 'status_detail_direct_task_spec_hidden',
      expectedRevision: record!.revision,
      bundle: {
        ...record!.bundle,
        run: {
          ...record!.bundle.run,
          taskRunSpecId: 'task_spec_http_direct_recovery_hidden_1',
        },
      },
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-12T19:15:00.000Z'),
      },
    );

    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/status/recovery/status_detail_direct_task_spec_hidden`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        object: 'recovery_detail',
        detail: {
          runId: 'status_detail_direct_task_spec_hidden',
          sourceKind: 'direct',
          taskRunSpecId: null,
          taskRunSpecSummary: null,
          hostState: 'runnable',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces suspiciously-idle attention on bounded recovery detail over HTTP', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-detail-idle-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await seedPlannedDirectRun(
      control,
      'status_detail_idle',
      '2026-04-08T16:10:00.000Z',
      'Keep this lease under inspection.',
    );
    await control.acquireLease({
      runId: 'status_detail_idle',
      leaseId: 'status_detail_idle:lease:idle',
      ownerId: 'runner:idle-http-detail',
      acquiredAt: '2026-04-08T16:10:00.000Z',
      heartbeatAt: '2026-04-08T16:14:55.000Z',
      expiresAt: '2026-04-08T16:20:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:idle-http-detail',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T16:00:00.000Z',
        lastHeartbeatAt: '2026-04-08T16:14:55.000Z',
        expiresAt: '2026-04-08T16:20:00.000Z',
        lastActivityAt: '2026-04-08T16:09:00.000Z',
        lastClaimedRunId: 'run_before_idle_detail',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        runnersControl,
        now: () => new Date('2026-04-08T16:15:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status/recovery/status_detail_idle`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        object: 'recovery_detail',
        detail: {
          runId: 'status_detail_idle',
          hostState: 'active-lease',
          repair: {
            posture: 'not-reclaimable',
            reason: 'active lease is still owned by an active runner',
            reconciliationStatus: 'active-runner',
            reconciliationReason: null,
          },
          leaseHealth: {
            status: 'suspiciously-idle',
            reason: 'active lease has no observed runner activity since it was acquired',
            leaseHeartbeatAt: '2026-04-08T16:14:55.000Z',
            leaseExpiresAt: '2026-04-08T16:20:00.000Z',
            runnerLastHeartbeatAt: '2026-04-08T16:14:55.000Z',
            runnerLastActivityAt: '2026-04-08T16:09:00.000Z',
          },
          attention: {
            needed: true,
            kind: 'suspiciously-idle',
            reason: 'active lease has no observed runner activity since it was acquired',
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded team-run inspection by task run spec id over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-inspect-task-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-14T16:00:00.000Z';
    const teamRunId = 'teamrun_http_inspect_task_1';
    const olderRunId = 'teamrun_http_inspect_task_1';
    const retryRunId = 'teamrun_http_inspect_task_1_retry';
    const taskRunSpecId = 'task_spec_http_inspect_1';
    await writeTaskRunSpecStoredRecord({
      id: taskRunSpecId,
      teamId: 'auracall-solo',
      title: 'Inspect HTTP task',
      objective: 'Reply exactly with OK.',
      successCriteria: ['Reply exactly with OK.'],
      requestedOutputs: [
        {
          kind: 'final-response',
          label: 'final-response',
          format: 'markdown',
          required: true,
          destination: 'response-body',
        },
      ],
      inputArtifacts: [],
      context: {},
      constraints: {},
      overrides: {},
      turnPolicy: {
        maxTurns: 12,
        stopOnStatus: ['succeeded', 'failed', 'cancelled', 'needs-human'],
        allowTeamInitiatedStop: true,
        allowHumanEscalation: true,
      },
      humanInteractionPolicy: {
        requiredOn: ['needs-approval', 'missing-info', 'needs-human'],
        allowClarificationRequests: true,
        allowApprovalRequests: true,
        defaultBehavior: 'pause',
      },
      localActionPolicy: {
        mode: 'forbidden',
        complexityStage: 'bounded-command',
        allowedActionKinds: [],
        allowedCommands: [],
        allowedCwdRoots: [],
        resultReportingMode: 'summary-only',
      },
      requestedBy: null,
      trigger: 'service',
      createdAt,
    });
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: olderRunId,
          sourceKind: 'team-run',
          sourceId: teamRunId,
          taskRunSpecId,
          status: 'failed',
          createdAt,
          updatedAt: '2026-04-14T16:05:00.000Z',
          trigger: 'cli',
          requestedBy: 'auracall teams run',
          entryPrompt: 'Inspect this team run.',
          initialInputs: {},
          sharedStateId: `${olderRunId}:state`,
          stepIds: [`${olderRunId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${olderRunId}:step:1`,
            runId: olderRunId,
            sourceStepId: `${teamRunId}:step:1`,
            agentId: 'auracall-solo:agent:1',
            runtimeProfileId: 'auracall-grok-auto',
            browserProfileId: 'default',
            service: 'grok',
            kind: 'prompt',
            status: 'failed',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect this team run.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-14T16:01:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${olderRunId}:state`,
          runId: olderRunId,
          status: 'failed',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-14T16:05:00.000Z',
        }),
        events: [],
      }),
    );
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'runtime_http_inspect_direct_1',
          sourceKind: 'direct',
          sourceId: null,
          taskRunSpecId,
          status: 'succeeded',
          createdAt: '2026-04-14T16:06:00.000Z',
          updatedAt: '2026-04-14T16:10:00.000Z',
          trigger: 'cli',
          requestedBy: 'operator',
          entryPrompt: 'Direct run with overlapping task spec.',
          initialInputs: {},
          sharedStateId: 'runtime_http_inspect_direct_1:state',
          stepIds: ['runtime_http_inspect_direct_1:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'runtime_http_inspect_direct_1:step:1',
            runId: 'runtime_http_inspect_direct_1',
            sourceStepId: 'runtime_http_inspect_direct_1:step:1',
            agentId: 'auracall-solo:agent:1',
            runtimeProfileId: 'auracall-grok-auto',
            browserProfileId: 'default',
            service: 'grok',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Direct run with overlapping task spec.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            completedAt: '2026-04-14T16:10:00.000Z',
            output: {
              summary: 'direct run done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'runtime_http_inspect_direct_1:state',
          runId: 'runtime_http_inspect_direct_1',
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-14T16:10:00.000Z',
        }),
        events: [],
      }),
    );
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: retryRunId,
          sourceKind: 'team-run',
          sourceId: teamRunId,
          taskRunSpecId,
          status: 'running',
          createdAt: '2026-04-14T16:11:00.000Z',
          updatedAt: '2026-04-14T16:12:00.000Z',
          trigger: 'cli',
          requestedBy: 'auracall teams run',
          entryPrompt: 'Inspect this team run retry.',
          initialInputs: {},
          sharedStateId: `${retryRunId}:state`,
          stepIds: [`${retryRunId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${retryRunId}:step:1`,
            runId: retryRunId,
            sourceStepId: `${teamRunId}:step:1`,
            agentId: 'auracall-solo:agent:1',
            runtimeProfileId: 'auracall-grok-auto',
            browserProfileId: 'default',
            service: 'grok',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect this team run retry.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-14T16:11:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${retryRunId}:state`,
          runId: retryRunId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-14T16:12:00.000Z',
        }),
        events: [],
      }),
    );
    await control.acquireLease({
      runId: retryRunId,
      leaseId: `${retryRunId}:lease:1`,
      ownerId: 'host:http-inspect',
      acquiredAt: '2026-04-14T16:11:00.000Z',
      heartbeatAt: '2026-04-14T16:12:00.000Z',
      expiresAt: '2026-04-14T16:17:00.000Z',
    });

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/team-runs/inspect?taskRunSpecId=${taskRunSpecId}`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        object: string;
        inspection: {
          resolvedBy: string;
          queryId: string;
          matchingRuntimeRunCount: number;
          matchingRuntimeRunIds: string[];
          taskRunSpecSummary: { id: string; teamId: string };
          runtime: { runtimeRunId: string; runtimeRunStatus: string; activeLeaseOwnerId: string | null; teamRunId: string | null };
        };
      };
      expect(payload).toMatchObject({
        object: 'team_run_inspection',
        inspection: {
          resolvedBy: 'task-run-spec-id',
          queryId: taskRunSpecId,
          matchingRuntimeRunCount: 2,
          matchingRuntimeRunIds: [retryRunId, olderRunId],
          taskRunSpecSummary: {
            id: taskRunSpecId,
            teamId: 'auracall-solo',
          },
          runtime: {
            runtimeRunId: retryRunId,
            teamRunId,
            runtimeRunStatus: 'running',
            activeLeaseOwnerId: 'host:http-inspect',
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded team-run inspection by runtime run id over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-inspect-runtime-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-14T16:00:00.000Z';
    const runId = 'teamrun_http_inspect_runtime_1';
    await writeTaskRunSpecStoredRecord({
      id: 'task_spec_http_inspect_runtime_1',
      teamId: 'auracall-two-step',
      title: 'Inspect HTTP runtime',
      objective: 'Finish both steps.',
      successCriteria: ['Finish both steps.'],
      requestedOutputs: [
        {
          kind: 'final-response',
          label: 'final-response',
          format: 'markdown',
          required: true,
          destination: 'response-body',
        },
      ],
      inputArtifacts: [],
      context: {},
      constraints: {},
      overrides: {},
      turnPolicy: {
        maxTurns: 12,
        stopOnStatus: ['succeeded', 'failed', 'cancelled', 'needs-human'],
        allowTeamInitiatedStop: true,
        allowHumanEscalation: true,
      },
      humanInteractionPolicy: {
        requiredOn: ['needs-approval', 'missing-info', 'needs-human'],
        allowClarificationRequests: true,
        allowApprovalRequests: true,
        defaultBehavior: 'pause',
      },
      localActionPolicy: {
        mode: 'forbidden',
        complexityStage: 'bounded-command',
        allowedActionKinds: [],
        allowedCommands: [],
        allowedCwdRoots: [],
        resultReportingMode: 'summary-only',
      },
      requestedBy: null,
      trigger: 'service',
      createdAt,
    });
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: runId,
          taskRunSpecId: 'task_spec_http_inspect_runtime_1',
          status: 'succeeded',
          createdAt,
          updatedAt: '2026-04-14T16:06:00.000Z',
          trigger: 'cli',
          requestedBy: 'auracall teams run',
          entryPrompt: 'Inspect runtime run.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [`${runId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${runId}:step:1`,
            runId,
            sourceStepId: `${runId}:step:1`,
            agentId: 'auracall-two-step:agent:1',
            runtimeProfileId: 'auracall-grok-auto',
            browserProfileId: 'default',
            service: 'grok',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect runtime run.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            completedAt: '2026-04-14T16:06:00.000Z',
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-14T16:06:00.000Z',
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/team-runs/inspect?runtimeRunId=${runId}`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        inspection: {
          resolvedBy: string;
          queryId: string;
          taskRunSpecSummary: { id: string };
          runtime: { runtimeRunId: string; runtimeRunStatus: string; sharedStateStatus: string };
        };
      };
      expect(payload.inspection).toMatchObject({
        resolvedBy: 'runtime-run-id',
        queryId: runId,
        taskRunSpecSummary: {
          id: 'task_spec_http_inspect_runtime_1',
        },
        runtime: {
          runtimeRunId: runId,
          runtimeRunStatus: 'succeeded',
          sharedStateStatus: 'succeeded',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('creates a bounded team run over HTTP and returns inspectable execution links', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-team-create-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        config: {
          defaultRuntimeProfile: 'default',
          services: {
            chatgpt: {
              identity: {
                email: 'operator@example.com',
              },
            },
          },
          browserProfiles: {
            default: {},
          },
          runtimeProfiles: {
            default: { browserProfile: 'default', defaultService: 'chatgpt' },
          },
          agents: {
            analyst: { runtimeProfile: 'default' },
          },
          teams: {
            ops: { agents: ['analyst'] },
          },
        },
        now: () => new Date('2026-04-20T12:00:00.000Z'),
        executeStoredRunStep: async () => ({
          output: {
            summary: 'api-created team run completed',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
          sharedState: {
            structuredOutputs: [
              {
                key: 'response.output',
                value: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'api-created team run completed' }],
                  },
                ],
              },
            ],
          },
        }),
      },
    );

    try {
      const createResponse = await fetch(`http://127.0.0.1:${server.port}/v1/team-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: 'ops',
          objective: 'Produce one API-created team result.',
          title: 'API team create',
          promptAppend: 'Keep it brief.',
          structuredContext: { source: 'http-test' },
          responseFormat: 'markdown',
          outputContract: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
          maxTurns: 2,
        }),
      });

      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as {
        object: string;
        taskRunSpec: {
          id: string;
          teamId: string;
          title: string;
          trigger: string;
          requestedBy: { kind: string; label: string };
          context: { command: string };
          overrides: {
            promptAppend: string;
            structuredContext: { source: string; outputContract: string };
          };
        };
        execution: {
          teamId: string;
          teamRunId: string;
          taskRunSpecId: string;
          runtimeRunId: string;
          runtimeSourceKind: string;
          runtimeRunStatus: string;
          finalOutputSummary: string | null;
          sharedStateStatus: string;
        };
        links: {
          teamInspection: string;
          runtimeInspection: string;
          responseReadback: string;
        };
      };

      expect(created).toMatchObject({
        object: 'team_run',
        taskRunSpec: {
          teamId: 'ops',
          title: 'API team create',
          trigger: 'api',
          requestedBy: {
            kind: 'api',
            label: 'auracall api serve',
          },
          context: {
            command: 'auracall api serve',
          },
          overrides: {
            promptAppend: 'Keep it brief.',
            structuredContext: {
              source: 'http-test',
              outputContract: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
            },
          },
        },
        execution: {
          teamId: 'ops',
          taskRunSpecId: created.taskRunSpec.id,
          teamRunId: expect.stringMatching(/^teamrun_ops_[a-zA-Z0-9_-]+$/),
          runtimeRunId: created.execution.teamRunId,
          runtimeSourceKind: 'team-run',
          runtimeRunStatus: 'succeeded',
          finalOutputSummary: 'api-created team run completed',
          sharedStateStatus: 'succeeded',
        },
      });
      expect(created.taskRunSpec.id).toMatch(/^taskrun_ops_[a-zA-Z0-9_-]+$/);
      expect(created.links.teamInspection).toBe(
        `http://127.0.0.1:${server.port}/v1/team-runs/inspect?teamRunId=${created.execution.teamRunId}`,
      );
      expect(created.links.runtimeInspection).toBe(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runtimeRunId=${created.execution.runtimeRunId}`,
      );
      expect(created.links.responseReadback).toBe(
        `http://127.0.0.1:${server.port}/v1/responses/${created.execution.runtimeRunId}`,
      );

      const teamInspection = await fetch(created.links.teamInspection);
      expect(teamInspection.status).toBe(200);
      const teamInspectionPayload = (await teamInspection.json()) as {
        inspection: {
          resolvedBy: string;
          queryId: string;
          taskRunSpecSummary: { id: string };
          runtime: { runtimeRunId: string; runtimeRunStatus: string };
        };
      };
      expect(teamInspectionPayload.inspection).toMatchObject({
        resolvedBy: 'team-run-id',
        queryId: created.execution.teamRunId,
        taskRunSpecSummary: { id: created.taskRunSpec.id },
        runtime: {
          runtimeRunId: created.execution.runtimeRunId,
          runtimeRunStatus: 'succeeded',
        },
      });

      const runtimeInspection = await fetch(created.links.runtimeInspection);
      expect(runtimeInspection.status).toBe(200);
      const runtimeInspectionPayload = (await runtimeInspection.json()) as {
        inspection: {
          resolvedBy: string;
          queryId: string;
          queryRunId: string;
          matchingRuntimeRunIds: string[];
          runtime: { runId: string; teamRunId: string | null; runStatus: string };
        };
      };
      expect(runtimeInspectionPayload.inspection).toMatchObject({
        resolvedBy: 'runtime-run-id',
        queryId: created.execution.runtimeRunId,
        queryRunId: created.execution.runtimeRunId,
        matchingRuntimeRunIds: [created.execution.runtimeRunId],
        runtime: {
          runId: created.execution.runtimeRunId,
          teamRunId: created.execution.teamRunId,
          runStatus: 'succeeded',
        },
      });

      const readBack = await fetch(created.links.responseReadback);
      expect(readBack.status).toBe(200);
      const readBackPayload = (await readBack.json()) as {
        id: string;
        status: string;
        output: Array<{ type: string; content?: Array<{ type: string; text: string }> }>;
      };
      expect(readBackPayload).toMatchObject({
        id: created.execution.runtimeRunId,
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'api-created team run completed' }],
          },
        ],
      });
    } finally {
      await server.close();
    }
  });

  it('returns team-run create before execution when background drain is enabled', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-team-create-background-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    let allowCompletion = false;
    const stepGate: { unblock?: () => void } = {};
    type ResponseReadbackPayload = {
      status: string;
      output?: Array<{ content?: Array<{ text: string }> }>;
    };
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0, backgroundDrainIntervalMs: 250 },
      {
        config: {
          defaultRuntimeProfile: 'default',
          browserProfiles: {
            default: {},
          },
          runtimeProfiles: {
            default: { browserProfile: 'default', defaultService: 'chatgpt' },
          },
          agents: {
            analyst: { runtimeProfile: 'default' },
          },
          teams: {
            ops: { agents: ['analyst'] },
          },
        },
        now: () => new Date('2026-04-20T12:30:00.000Z'),
        executeStoredRunStep: async () => {
          if (!allowCompletion) {
            await new Promise<void>((resolve) => {
              stepGate.unblock = resolve;
            });
          }
          return {
            output: {
              summary: 'background team run completed',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            sharedState: {
              structuredOutputs: [
                {
                  key: 'response.output',
                  value: [
                    {
                      type: 'message',
                      role: 'assistant',
                      content: [{ type: 'output_text', text: 'background team run completed' }],
                    },
                  ],
                },
              ],
            },
          };
        },
      },
    );

    try {
      const createPromise = fetch(`http://127.0.0.1:${server.port}/v1/team-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: 'ops',
          objective: 'Produce one background-drained team result.',
          responseFormat: 'markdown',
          maxTurns: 2,
        }),
      });
      const createSettled = await Promise.race([
        createPromise.then(() => 'resolved' as const),
        new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100)),
      ]);
      expect(createSettled).toBe('resolved');

      const createResponse = await createPromise;
      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as {
        execution: {
          runtimeRunId: string;
          runtimeRunStatus: string;
          finalOutputSummary: string | null;
          sharedStateStatus: string;
        };
        links: {
          responseReadback: string;
        };
      };
      expect(created.execution).toMatchObject({
        runtimeRunStatus: 'planned',
        finalOutputSummary: null,
        sharedStateStatus: 'active',
      });

      allowCompletion = true;
      stepGate.unblock?.();

      let readBackPayload: ResponseReadbackPayload | null = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const readBack = await fetch(created.links.responseReadback);
        expect(readBack.status).toBe(200);
        readBackPayload = (await readBack.json()) as ResponseReadbackPayload;
        if (readBackPayload?.status === 'completed') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      expect(readBackPayload).toMatchObject({
        status: 'completed',
        output: [
          {
            content: [{ text: 'background team run completed' }],
          },
        ],
      });
    } finally {
      allowCompletion = true;
      stepGate.unblock?.();
      await server.close();
    }
  });

  it('rejects invalid team-run create request bodies over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-team-create-invalid-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/team-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: 'ops' }),
      });
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { type: string; message: string } };
      expect(payload.error.type).toBe('invalid_request_error');
      expect(payload.error.message).toContain('objective');
    } finally {
      await server.close();
    }
  });

  it('creates a team run from a prebuilt flattened taskRunSpec over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-team-create-prebuilt-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const taskRunSpec = createTaskRunSpec({
      id: 'taskrun_ops_prebuilt_http',
      teamId: 'ops',
      title: 'Prebuilt HTTP task spec',
      objective: 'Produce one prebuilt HTTP-created team result.',
      createdAt: '2026-04-21T21:00:00.000Z',
      requestedOutputs: [
        {
          kind: 'final-response',
          label: 'final-response',
          format: 'markdown',
          required: true,
          destination: 'response-body',
        },
      ],
      requestedBy: {
        kind: 'api',
        label: 'external spec author',
      },
      trigger: 'api',
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        config: {
          defaultRuntimeProfile: 'default',
          browserProfiles: {
            default: {},
          },
          runtimeProfiles: {
            default: { browserProfile: 'default', defaultService: 'chatgpt' },
          },
          agents: {
            analyst: { runtimeProfile: 'default' },
          },
          teams: {
            ops: { agents: ['analyst'] },
          },
        },
        now: () => new Date('2026-04-21T21:05:00.000Z'),
        executeStoredRunStep: async () => ({
          output: {
            summary: 'prebuilt http team run completed',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        }),
      },
    );

    try {
      const createResponse = await fetch(`http://127.0.0.1:${server.port}/v1/team-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: 'ops',
          taskRunSpec,
        }),
      });

      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as {
        taskRunSpec: { id: string; title: string; requestedBy: { label: string } };
        execution: { teamId: string; taskRunSpecId: string; runtimeRunStatus: string; finalOutputSummary: string | null };
      };
      expect(created).toMatchObject({
        taskRunSpec: {
          id: 'taskrun_ops_prebuilt_http',
          title: 'Prebuilt HTTP task spec',
          requestedBy: {
            label: 'external spec author',
          },
        },
        execution: {
          teamId: 'ops',
          taskRunSpecId: 'taskrun_ops_prebuilt_http',
          runtimeRunStatus: 'succeeded',
          finalOutputSummary: 'prebuilt http team run completed',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('rejects compact assignment fields mixed with a prebuilt taskRunSpec over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-team-create-prebuilt-conflict-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const taskRunSpec = createTaskRunSpec({
      id: 'taskrun_ops_prebuilt_conflict',
      teamId: 'ops',
      title: 'Prebuilt conflict task spec',
      objective: 'Use the prebuilt objective.',
      createdAt: '2026-04-21T21:00:00.000Z',
    });

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/team-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: 'ops',
          objective: 'Conflicting compact objective.',
          taskRunSpec,
        }),
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { message: string; type: string } };
      expect(payload.error.type).toBe('invalid_request_error');
      expect(payload.error.message).toContain('compact assignment fields');
    } finally {
      await server.close();
    }
  });

  it('rejects direct runtime runs on the team inspection runtime-run-id route', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-inspect-runtime-direct-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const runId = 'direct_http_inspect_runtime_1';
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          taskRunSpecId: null,
          status: 'succeeded',
          createdAt: '2026-04-19T21:20:00.000Z',
          updatedAt: '2026-04-19T21:21:00.000Z',
          trigger: 'cli',
          requestedBy: 'operator',
          entryPrompt: 'Direct run.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [`${runId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${runId}:step:1`,
            runId,
            sourceStepId: `${runId}:step:1`,
            agentId: 'auracall-solo:agent:1',
            runtimeProfileId: 'auracall-grok-auto',
            browserProfileId: 'default',
            service: 'grok',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Direct run.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            completedAt: '2026-04-19T21:21:00.000Z',
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-19T21:21:00.000Z',
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/team-runs/inspect?runtimeRunId=${runId}`,
      );
      expect(response.status).toBe(404);
      const payload = (await response.json()) as {
        error: { message: string; type: string };
      };
      expect(payload).toMatchObject({
        error: {
          message: `Runtime run ${runId} is not a team run.`,
          type: 'not_found_error',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded team-run inspection by team run id over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-inspect-teamrun-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-14T16:00:00.000Z';
    const runtimeRunId = 'runtime_http_inspect_teamrun_1';
    const teamRunId = 'teamrun_http_inspect_teamrun_1';
    await writeTaskRunSpecStoredRecord({
      id: 'task_spec_http_inspect_teamrun_1',
      teamId: 'auracall-two-step',
      title: 'Inspect HTTP team run',
      objective: 'Finish one team run.',
      successCriteria: ['Finish one team run.'],
      requestedOutputs: [
        {
          kind: 'final-response',
          label: 'final-response',
          format: 'markdown',
          required: true,
          destination: 'response-body',
        },
      ],
      inputArtifacts: [],
      context: {},
      constraints: {},
      overrides: {},
      turnPolicy: {
        maxTurns: 12,
        stopOnStatus: ['succeeded', 'failed', 'cancelled', 'needs-human'],
        allowTeamInitiatedStop: true,
        allowHumanEscalation: true,
      },
      humanInteractionPolicy: {
        requiredOn: ['needs-approval', 'missing-info', 'needs-human'],
        allowClarificationRequests: true,
        allowApprovalRequests: true,
        defaultBehavior: 'pause',
      },
      localActionPolicy: {
        mode: 'forbidden',
        complexityStage: 'bounded-command',
        allowedActionKinds: [],
        allowedCommands: [],
        allowedCwdRoots: [],
        resultReportingMode: 'summary-only',
      },
      requestedBy: null,
      trigger: 'service',
      createdAt,
    });
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runtimeRunId,
          sourceKind: 'team-run',
          sourceId: teamRunId,
          taskRunSpecId: 'task_spec_http_inspect_teamrun_1',
          status: 'running',
          createdAt,
          updatedAt: '2026-04-14T16:06:00.000Z',
          trigger: 'cli',
          requestedBy: 'auracall teams run',
          entryPrompt: 'Inspect team run id.',
          initialInputs: {},
          sharedStateId: `${runtimeRunId}:state`,
          stepIds: [`${runtimeRunId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${runtimeRunId}:step:1`,
            runId: runtimeRunId,
            sourceStepId: `${teamRunId}:step:1`,
            agentId: 'auracall-two-step:agent:1',
            runtimeProfileId: 'auracall-grok-auto',
            browserProfileId: 'default',
            service: 'grok',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect team run id.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-14T16:01:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runtimeRunId}:state`,
          runId: runtimeRunId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-14T16:06:00.000Z',
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/team-runs/inspect?teamRunId=${teamRunId}`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        inspection: {
          resolvedBy: string;
          queryId: string;
          taskRunSpecSummary: { id: string };
          runtime: { runtimeRunId: string; teamRunId: string | null; runtimeRunStatus: string };
        };
      };
      expect(payload.inspection).toMatchObject({
        resolvedBy: 'team-run-id',
        queryId: teamRunId,
        taskRunSpecSummary: {
          id: 'task_spec_http_inspect_teamrun_1',
        },
        runtime: {
          runtimeRunId,
          teamRunId,
          runtimeRunStatus: 'running',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('rejects invalid team-run inspection query shape over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-inspect-invalid-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/team-runs/inspect`);
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { type: string; message: string } };
      expect(payload.error.type).toBe('invalid_request_error');
      expect(payload.error.message).toContain('--task-run-spec-id, --team-run-id, or --runtime-run-id');
    } finally {
      await server.close();
    }
  });

  it('supports all runtime lookup keys for bounded runtime queue projection over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'runtime_http_inspect_1';
    const runtimeRunId = runId;
    const teamRunId = 'teamrun_http_runtime_inspect_1';
    const taskRunSpecId = 'task_spec_http_runtime_inspect_1';
    const createdAt = '2026-04-15T12:00:00.000Z';
    const runnerId = 'runner:http-runtime-inspect';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: teamRunId,
          taskRunSpecId,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Inspect runtime queue projection.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [`${runId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${runId}:step:1`,
            runId,
            sourceStepId: 'teamrun_http_runtime_inspect_1:step:1',
            agentId: 'agent:inspect',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect runtime queue projection.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: runnerId,
        hostId: 'host:http-runtime',
        status: 'active',
        startedAt: createdAt,
        lastHeartbeatAt: '2026-04-15T12:01:00.000Z',
        expiresAt: '2099-04-15T12:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control, runnersControl });
    try {
      const testCases = [
        {
          label: 'runId',
          query: `runId=${runId}`,
        },
        {
          label: 'runtimeRunId',
          query: `runtimeRunId=${runtimeRunId}`,
        },
        {
          label: 'teamRunId',
          query: `teamRunId=${teamRunId}`,
        },
        {
          label: 'taskRunSpecId',
          query: `taskRunSpecId=${taskRunSpecId}`,
        },
      ] as const;

      for (const testCase of testCases) {
        const response = await fetch(`http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?${testCase.query}`);
        expect(response.status).toBe(200);
        const payload = (await response.json()) as {
          object: string;
          inspection: {
            resolvedBy: string;
            queryId: string;
            queryRunId: string;
            matchingRuntimeRunCount: number;
            matchingRuntimeRunIds: string[];
            runtime: {
              runId: string;
              teamRunId: string | null;
              queueProjection: {
                queueState: string;
                claimState: string;
                affinity: { status: string };
              };
            };
            runner: { runnerId: string; selectedBy: string; status: string } | null;
          };
        };
        expect(payload).toMatchObject({
          object: 'runtime_run_inspection',
          inspection: {
            resolvedBy:
              testCase.label === 'runId'
                ? 'run-id'
                : testCase.label === 'runtimeRunId'
                  ? 'runtime-run-id'
                  : testCase.label === 'teamRunId'
                    ? 'team-run-id'
                    : 'task-run-spec-id',
            queryId:
              testCase.label === 'runId'
                ? runId
                : testCase.label === 'runtimeRunId'
                  ? runtimeRunId
                  : testCase.label === 'teamRunId'
                    ? teamRunId
                    : taskRunSpecId,
            queryRunId: runId,
            matchingRuntimeRunCount: 1,
            matchingRuntimeRunIds: [runId],
            runtime: {
              runId,
              teamRunId,
              queueProjection: {
                queueState: 'runnable',
                claimState: 'claimable',
                activeLeaseId: null,
                activeLeaseOwnerId: null,
                affinity: {
                  status: 'not-evaluated',
                  requiredService: 'chatgpt',
                  requiredRuntimeProfileId: 'default',
                  requiredBrowserProfileId: null,
                  requiredHostId: null,
                  hostRequirement: 'any',
                  requiredServiceAccountId: null,
                  browserRequired: false,
                  eligibilityNote: null,
                },
              },
            },
            runner: null,
          },
        });
      }

      const runnerResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runId=${runId}&runnerId=${runnerId}`,
      );
      expect(runnerResponse.status).toBe(200);
      const runnerPayload = (await runnerResponse.json()) as {
        object: string;
        inspection: {
          resolvedBy: string;
          queryId: string;
          queryRunId: string;
          matchingRuntimeRunCount: number;
          matchingRuntimeRunIds: string[];
          runtime: {
            runId: string;
            teamRunId: string | null;
            queueProjection: {
              queueState: string;
              claimState: string;
              affinity: { status: string };
            };
          };
          runner: { runnerId: string; selectedBy: string; status: string };
        };
      };
      expect(runnerPayload).toMatchObject({
        object: 'runtime_run_inspection',
        inspection: {
          resolvedBy: 'run-id',
          queryId: runId,
          queryRunId: runId,
          matchingRuntimeRunCount: 1,
          matchingRuntimeRunIds: [runId],
          runtime: {
            runId,
            teamRunId,
            queueProjection: {
              queueState: 'runnable',
              claimState: 'claimable',
              activeLeaseId: null,
              activeLeaseOwnerId: null,
              affinity: {
                status: 'eligible',
                requiredService: 'chatgpt',
                requiredRuntimeProfileId: 'default',
                requiredBrowserProfileId: null,
                requiredHostId: null,
                hostRequirement: 'any',
                requiredServiceAccountId: null,
                browserRequired: false,
                eligibilityNote: null,
              },
            },
          },
          runner: {
            runnerId,
            selectedBy: 'query-runner-id',
            status: 'active',
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('rejects invalid runtime inspection query shape over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-invalid-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/runtime-runs/inspect`);
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { type: string; message: string } };
      expect(payload.error.type).toBe('invalid_request_error');
      expect(payload.error.message).toContain('Provide --run-id, --runtime-run-id, --team-run-id, or --task-run-spec-id.');
    } finally {
      await server.close();
    }
  });

  it('returns honest unavailable service-state posture when the probe is requested but not configured', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-service-state-unavailable-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const runId = 'runtime_http_service_state_unavailable';
    const stepId = `${runId}:step:1`;
    const createdAt = '2026-04-16T18:20:00.000Z';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Probe active service state.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'agent:inspect-service-state',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'chatgpt',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Probe active service state.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: createdAt,
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runId=${runId}&probe=service-state`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        inspection: {
          serviceState: {
            probeStatus: 'unavailable',
            service: 'chatgpt',
            ownerStepId: stepId,
            state: null,
            source: null,
            observedAt: null,
            evidenceRef: null,
            confidence: null,
            reason: 'service-state probe is not configured for chatgpt',
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('returns observed service-state probe payload over HTTP when the live probe is configured', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-service-state-observed-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const runId = 'runtime_http_service_state_observed';
    const stepId = `${runId}:step:1`;
    const createdAt = '2026-04-16T18:25:00.000Z';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Probe active service state.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'agent:inspect-service-state',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'chatgpt',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Probe active service state.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: createdAt,
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        probeRuntimeRunServiceState: async ({ step }) => ({
          service: step.service,
          ownerStepId: step.id,
          state: 'thinking',
          source: 'provider-adapter',
          observedAt: '2026-04-16T18:25:04.000Z',
          evidenceRef: 'chatgpt-placeholder-turn',
          confidence: 'high',
        }),
      },
    );
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runId=${runId}&probe=service-state`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as JsonObject;
      expect(payload).toMatchObject({
        inspection: {
          serviceState: {
            probeStatus: 'observed',
            service: 'chatgpt',
            ownerStepId: stepId,
            state: 'thinking',
            source: 'provider-adapter',
            observedAt: '2026-04-16T18:25:04.000Z',
            evidenceRef: 'chatgpt-placeholder-turn',
            confidence: 'high',
            reason: null,
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('returns observed browser diagnostics over HTTP when the live probe is configured', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-browser-diagnostics-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const runId = 'runtime_http_browser_diagnostics_observed';
    const stepId = `${runId}:step:1`;
    const createdAt = '2026-04-23T18:25:00.000Z';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Probe browser diagnostics.',
          initialInputs: {
            model: 'gemini-3-pro',
            runtimeProfile: 'auracall-gemini-pro',
            service: 'gemini',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'agent:inspect-browser-diagnostics',
            runtimeProfileId: 'auracall-gemini-pro',
            browserProfileId: 'default',
            service: 'gemini',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Probe browser diagnostics.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: createdAt,
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        probeRuntimeRunBrowserDiagnostics: async ({ step }) => ({
          service: step.service,
          ownerStepId: step.id,
          observedAt: '2026-04-23T18:25:04.000Z',
          source: 'browser-service',
          target: {
            host: '127.0.0.1',
            port: 9222,
            targetId: 'gemini-tab-http',
            url: 'https://gemini.google.com/app',
            title: 'Google Gemini',
          },
          document: {
            url: 'https://gemini.google.com/app',
            title: 'Google Gemini',
            readyState: 'complete',
            visibilityState: 'visible',
            focused: true,
            bodyTextLength: 700,
          },
          visibleCounts: {
            buttons: 10,
            links: 2,
            inputs: 0,
            textareas: 0,
            contenteditables: 1,
            modelResponses: 1,
          },
          providerEvidence: {
            hasActiveAvatarSpinner: true,
            hasStopControl: true,
            hasGeneratedMedia: false,
            isGenerating: true,
          },
          screenshot: {
            path: '/tmp/gemini-http-diagnostics.png',
            mimeType: 'image/png',
            bytes: 2048,
          },
        }),
      },
    );
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runId=${runId}&diagnostics=browser-state`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as JsonObject;
      expect(payload).toMatchObject({
        inspection: {
          browserDiagnostics: {
            probeStatus: 'observed',
            service: 'gemini',
            ownerStepId: stepId,
            observedAt: '2026-04-23T18:25:04.000Z',
            source: 'browser-service',
            reason: null,
            target: {
              targetId: 'gemini-tab-http',
              url: 'https://gemini.google.com/app',
            },
            providerEvidence: {
              hasActiveAvatarSpinner: true,
              isGenerating: true,
            },
            screenshot: {
              path: '/tmp/gemini-http-diagnostics.png',
              bytes: 2048,
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('preserves browser operation queue diagnostics through generic response run status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-run-status-browser-queue-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const control = createExecutionRuntimeControl();
    const runId = 'resp_http_browser_queue_1';
    const stepId = `${runId}:step:1`;
    const createdAt = '2026-04-25T18:30:00.000Z';
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Probe queued browser diagnostics.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'auracall-gemini-pro',
            service: 'gemini',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'auracall-gemini-pro',
            browserProfileId: 'default',
            service: 'gemini',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Probe queued browser diagnostics.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: createdAt,
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );
    const latestQueueEvent = {
      event: 'queued' as const,
      at: '2026-04-25T18:30:04.000Z',
      key: `managed-profile:${homeDir}/browser-profiles/auracall-gemini-pro/gemini::service:gemini`,
      operation: null,
      blockedBy: {
        id: 'operation-http-blocker',
        kind: 'media-generation' as const,
        operationClass: 'exclusive-mutating' as const,
        ownerPid: 23456,
        ownerCommand: 'media-generation',
        startedAt: '2026-04-25T18:29:30.000Z',
        updatedAt: '2026-04-25T18:29:30.000Z',
      },
      attempt: 1,
      elapsedMs: 0,
    };

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        probeRuntimeRunBrowserDiagnostics: async ({ step }) => ({
          service: step.service,
          ownerStepId: step.id,
          observedAt: '2026-04-25T18:30:05.000Z',
          source: 'browser-service',
          target: {
            host: '127.0.0.1',
            port: 9222,
            targetId: 'gemini-tab-queue-http',
            url: 'https://gemini.google.com/app',
            title: 'Google Gemini',
          },
          document: {
            url: 'https://gemini.google.com/app',
            title: 'Google Gemini',
            readyState: 'complete',
            visibilityState: 'visible',
            focused: true,
            bodyTextLength: 700,
          },
          visibleCounts: {
            buttons: 10,
            links: 2,
            inputs: 0,
            textareas: 0,
            contenteditables: 1,
            modelResponses: 1,
          },
          providerEvidence: {
            hasActiveAvatarSpinner: true,
            isGenerating: true,
          },
          browserOperationQueue: {
            total: 1,
            latest: latestQueueEvent,
            items: [latestQueueEvent],
          },
        }),
      },
    );
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/runs/${runId}/status?diagnostics=browser-state`,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        id: runId,
        object: 'auracall_run_status',
        kind: 'response',
        browserDiagnostics: {
          probeStatus: 'observed',
          service: 'gemini',
          ownerStepId: stepId,
          browserOperationQueue: {
            total: 1,
            latest: {
              event: 'queued',
              blockedBy: {
                kind: 'media-generation',
                operationClass: 'exclusive-mutating',
                ownerPid: 23456,
              },
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('resolves the running step AuraCall runtime profile before probing ChatGPT service state', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      cwd: '/tmp/auracall-probe-cwd',
      env: { TEST_ENV: '1' },
      resolveConfigImpl: async (cliOptions, cwd, env) => {
        expect(cliOptions).toEqual({ profile: 'work' });
        expect(cwd).toBe('/tmp/auracall-probe-cwd');
        expect(env).toMatchObject({ TEST_ENV: '1' });
        return {
          auracallProfile: 'work',
          services: {
            chatgpt: {
              url: 'https://chatgpt.com/',
            },
          },
        } as never;
      },
      probeChatgptBrowserServiceStateImpl: async (config) => ({
        service: 'chatgpt',
        ownerStepId: null,
        state: config.auracallProfile === 'work' ? 'thinking' : 'unknown',
        source: 'provider-adapter',
        observedAt: '2026-04-16T20:00:04.000Z',
        evidenceRef: 'chatgpt-placeholder-turn',
        confidence: 'high',
      }),
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {} as never,
      runner: null,
      step: {
        id: 'step-chatgpt-1',
        service: 'chatgpt',
        runtimeProfileId: 'work',
      } as never,
    });

    expect(result).toMatchObject({
      state: 'thinking',
      source: 'provider-adapter',
      evidenceRef: 'chatgpt-placeholder-turn',
      confidence: 'high',
    });
  });

  it('resolves the running step AuraCall runtime profile before probing Gemini service state', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      cwd: '/tmp/auracall-probe-cwd',
      env: { TEST_ENV: '1' },
      resolveConfigImpl: async (cliOptions, cwd, env) => {
        expect(cliOptions).toEqual({ profile: 'auracall-gemini-pro' });
        expect(cwd).toBe('/tmp/auracall-probe-cwd');
        expect(env).toMatchObject({ TEST_ENV: '1' });
        return {
          engine: 'browser',
          auracallProfile: 'auracall-gemini-pro',
          services: {
            gemini: {
              url: 'https://gemini.google.com/app',
            },
          },
        } as never;
      },
      probeGeminiBrowserServiceStateImpl: async (config, options) => ({
        service: 'gemini',
        ownerStepId: null,
        state:
          config.auracallProfile === 'auracall-gemini-pro' &&
            options?.prompt === 'Summarize merge sort.'
            ? 'thinking'
            : 'unknown',
        source: 'provider-adapter',
        observedAt: '2026-04-16T22:30:04.000Z',
        evidenceRef: 'gemini-native-prompt-committed',
        confidence: 'medium',
      }),
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {} as never,
      runner: null,
      step: {
        id: 'step-gemini-1',
        service: 'gemini',
        runtimeProfileId: 'auracall-gemini-pro',
        input: {
          prompt: 'Summarize merge sort.',
        },
      } as never,
    });

    expect(result).toMatchObject({
      state: 'thinking',
      source: 'provider-adapter',
      evidenceRef: 'gemini-native-prompt-committed',
      confidence: 'medium',
    });
  });

  it('falls back to transient Gemini executor-owned live state when DOM probing has no signal', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      readLiveRuntimeRunServiceStateImpl: () => ({
        service: 'gemini',
        ownerStepId: 'step-gemini-live-1',
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-17T01:30:00.000Z',
        evidenceRef: 'gemini-web-request-started',
        confidence: 'medium',
      }),
      resolveConfigImpl: async () =>
        ({
          auracallProfile: 'auracall-gemini-pro',
          engine: 'browser',
          services: {
            gemini: {
              url: 'https://gemini.google.com/app',
            },
          },
        }) as never,
      probeGeminiBrowserServiceStateImpl: async () => ({
        service: 'gemini',
        ownerStepId: null,
        state: 'unknown',
        source: 'provider-adapter',
        observedAt: '2026-04-17T01:30:01.000Z',
        evidenceRef: 'gemini-live-probe-no-signal',
        confidence: 'low',
      }),
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {
        record: {
          runId: 'runtime_gemini_live_1',
        },
      } as never,
      runner: null,
      step: {
        id: 'step-gemini-live-1',
        service: 'gemini',
        runtimeProfileId: 'auracall-gemini-pro',
        input: {
          prompt: 'Reply exactly with AURACALL_GEMINI_LIVE_STATE_OK',
        },
      } as never,
    });

    expect(result).toMatchObject({
      state: 'thinking',
      source: 'browser-service',
      evidenceRef: 'gemini-web-request-started',
      confidence: 'medium',
    });
  });

  it('prefers provider-owned Gemini spinner state over transient thinking when visible', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      readLiveRuntimeRunServiceStateImpl: () => ({
        service: 'gemini',
        ownerStepId: 'step-gemini-live-2',
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-17T01:33:00.000Z',
        evidenceRef: 'gemini-web-request-started',
        confidence: 'medium',
      }),
      resolveConfigImpl: async () =>
        ({
          auracallProfile: 'auracall-gemini-pro',
          engine: 'browser',
          services: {
            gemini: {
              url: 'https://gemini.google.com/app',
            },
          },
        }) as never,
      probeGeminiBrowserServiceStateImpl: async () => ({
        service: 'gemini',
        ownerStepId: null,
        state: 'thinking',
        source: 'provider-adapter',
        observedAt: '2026-04-17T01:33:02.000Z',
        evidenceRef: 'gemini-active-avatar-spinner',
        confidence: 'high',
      }),
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {
        record: {
          runId: 'runtime_gemini_live_2',
        },
      } as never,
      runner: null,
      step: {
        id: 'step-gemini-live-2',
        service: 'gemini',
        runtimeProfileId: 'auracall-gemini-pro',
        input: {
          prompt: 'Reply exactly with AURACALL_GEMINI_LIVE_STATE_OK',
        },
      } as never,
    });

    expect(result).toMatchObject({
      state: 'thinking',
      source: 'provider-adapter',
      evidenceRef: 'gemini-active-avatar-spinner',
      confidence: 'high',
    });
  });

  it('prefers transient Grok executor-owned live state before DOM probing', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      readLiveRuntimeRunServiceStateImpl: () => ({
        service: 'grok',
        ownerStepId: 'step-grok-live-1',
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-17T02:30:00.000Z',
        evidenceRef: 'grok-prompt-submitted',
        confidence: 'medium',
      }),
      probeGrokBrowserServiceStateImpl: async () => ({
        service: 'grok',
        ownerStepId: null,
        state: 'unknown',
        source: 'provider-adapter',
        observedAt: '2026-04-17T02:31:00.000Z',
        evidenceRef: 'grok-live-probe-no-signal',
        confidence: 'low',
      }),
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {
        record: {
          runId: 'runtime_grok_live_1',
        },
      } as never,
      runner: null,
      step: {
        id: 'step-grok-live-1',
        service: 'grok',
        runtimeProfileId: 'auracall-grok-auto',
        input: {
          prompt: 'Reply exactly with AURACALL_GROK_LIVE_STATE_OK',
        },
      } as never,
    });

    expect(result).toMatchObject({
      state: 'thinking',
      source: 'browser-service',
      evidenceRef: 'grok-prompt-submitted',
      confidence: 'medium',
    });
  });

  it('prefers provider-owned Grok response state over transient thinking when visible', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      readLiveRuntimeRunServiceStateImpl: () => ({
        service: 'grok',
        ownerStepId: 'step-grok-live-2',
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-17T02:33:00.000Z',
        evidenceRef: 'grok-prompt-submitted',
        confidence: 'medium',
      }),
      probeGrokBrowserServiceStateImpl: async () => ({
        service: 'grok',
        ownerStepId: null,
        state: 'response-incoming',
        source: 'provider-adapter',
        observedAt: '2026-04-17T02:33:02.000Z',
        evidenceRef: 'grok-assistant-visible',
        confidence: 'high',
      }),
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {
        record: {
          runId: 'runtime_grok_live_2',
        },
      } as never,
      runner: null,
      step: {
        id: 'step-grok-live-2',
        service: 'grok',
        runtimeProfileId: 'auracall-grok-auto',
        input: {
          prompt: 'Reply exactly with AURACALL_GROK_LIVE_STATE_OK',
        },
      } as never,
    });

    expect(result).toMatchObject({
      state: 'response-incoming',
      source: 'provider-adapter',
      evidenceRef: 'grok-assistant-visible',
      confidence: 'high',
    });
  });

  it('routes Grok browser-backed runtime profiles through the default service-state probe', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      resolveConfigImpl: async () =>
        ({
          auracallProfile: 'auracall-grok-auto',
          engine: 'browser',
          services: {
            grok: {
              url: 'https://grok.com/',
            },
          },
        }) as never,
      probeGrokBrowserServiceStateImpl: async (config) => ({
        service: 'grok',
        ownerStepId: null,
        state: config.auracallProfile === 'auracall-grok-auto' ? 'response-incoming' : 'unknown',
        source: 'provider-adapter',
        observedAt: '2026-04-17T02:32:00.000Z',
        evidenceRef: 'grok-assistant-visible',
        confidence: 'high',
      }),
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {} as never,
      runner: null,
      step: {
        id: 'step-grok-1',
        service: 'grok',
        runtimeProfileId: 'auracall-grok-auto',
        input: {
          prompt: 'Summarize merge sort.',
        },
      } as never,
    });

    expect(result).toMatchObject({
      state: 'response-incoming',
      source: 'provider-adapter',
      evidenceRef: 'grok-assistant-visible',
      confidence: 'high',
    });
  });

  it('does not probe Grok service state for non-browser runtime profiles', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      resolveConfigImpl: async () =>
        ({
          auracallProfile: 'auracall-grok-auto',
          engine: 'api',
          services: {
            grok: {
              url: 'https://grok.com/',
            },
          },
        }) as never,
      probeGrokBrowserServiceStateImpl: async () => {
        throw new Error('should not probe Grok browser state for API runtime profiles');
      },
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {} as never,
      runner: null,
      step: {
        id: 'step-grok-2',
        service: 'grok',
        runtimeProfileId: 'auracall-grok-auto',
        input: {
          prompt: 'Summarize merge sort.',
        },
      } as never,
    });

    expect(result).toBeNull();
  });

  it('keeps the default service-state probe honest when the resolved runtime profile does not match the running step', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      resolveConfigImpl: async () =>
        ({
          auracallProfile: 'default',
          services: {
            chatgpt: {
              url: 'https://chatgpt.com/',
            },
          },
        }) as never,
      probeChatgptBrowserServiceStateImpl: async () => {
        throw new Error('should not probe mismatched runtime profiles');
      },
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {} as never,
      runner: null,
      step: {
        id: 'step-chatgpt-2',
        service: 'chatgpt',
        runtimeProfileId: 'work',
      } as never,
    });

    expect(result).toBeNull();
  });

  it('keeps the default Gemini service-state probe honest when the resolved runtime profile does not match the running step', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      resolveConfigImpl: async () =>
        ({
          auracallProfile: 'default',
          services: {
            gemini: {
              url: 'https://gemini.google.com/app',
            },
          },
        }) as never,
      probeGeminiBrowserServiceStateImpl: async () => {
        throw new Error('should not probe mismatched Gemini runtime profiles');
      },
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {} as never,
      runner: null,
      step: {
        id: 'step-gemini-2',
        service: 'gemini',
        runtimeProfileId: 'auracall-gemini-pro',
        input: {
          prompt: 'Summarize merge sort.',
        },
      } as never,
    });

    expect(result).toBeNull();
  });

  it('does not probe Gemini service state for non-browser runtime profiles', async () => {
    const probe = createDefaultRuntimeRunServiceStateProbe({
      resolveConfigImpl: async () =>
        ({
          auracallProfile: 'auracall-gemini-pro',
          engine: 'api',
          services: {
            gemini: {
              url: 'https://gemini.google.com/app',
            },
          },
        }) as never,
      probeGeminiBrowserServiceStateImpl: async () => {
        throw new Error('should not probe Gemini browser state for API runtime profiles');
      },
    });
    if (!probe) {
      throw new Error('expected default runtime run service-state probe');
    }

    const result = await probe({
      inspection: {} as never,
      runner: null,
      step: {
        id: 'step-gemini-3',
        service: 'gemini',
        runtimeProfileId: 'auracall-gemini-pro',
        input: {
          prompt: 'Summarize merge sort.',
        },
      } as never,
    });

    expect(result).toBeNull();
  });

  it('evaluates configured service-account affinity on runtime inspection over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-account-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'runtime_http_inspect_account_1';
    const createdAt = '2026-04-15T12:30:00.000Z';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'teamrun_http_runtime_inspect_account_1',
          taskRunSpecId: 'task_spec_http_runtime_inspect_account_1',
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Inspect runtime account affinity.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [`${runId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${runId}:step:1`,
            runId,
            sourceStepId: 'teamrun_http_runtime_inspect_account_1:step:1',
            agentId: 'agent:inspect-account',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect runtime account affinity.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:http-runtime-account-missing',
        hostId: 'host:http-runtime-account',
        status: 'active',
        startedAt: createdAt,
        lastHeartbeatAt: '2026-04-15T12:31:00.000Z',
        expiresAt: '2099-04-15T12:35:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['default'],
        serviceAccountIds: [],
        browserCapable: true,
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:http-runtime-account-match',
        hostId: 'host:http-runtime-account',
        status: 'active',
        startedAt: createdAt,
        lastHeartbeatAt: '2026-04-15T12:31:00.000Z',
        expiresAt: '2099-04-15T12:35:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['default'],
        serviceAccountIds: ['service-account:chatgpt:operator@example.com'],
        browserCapable: true,
      }),
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        runnersControl,
        config: {
          services: {
            chatgpt: {
              identity: {
                email: 'operator@example.com',
              },
            },
          },
          runtimeProfiles: {
            default: {
              engine: 'browser',
              defaultService: 'chatgpt',
              browserProfile: 'default',
            },
          },
        },
      },
    );

    try {
      const missingResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runId=${runId}&runnerId=runner:http-runtime-account-missing`,
      );
      expect(missingResponse.status).toBe(200);
      const missingPayload = (await missingResponse.json()) as Record<string, unknown>;
      expect(missingPayload).toMatchObject({
        inspection: {
          runtime: {
            queueProjection: {
              claimState: 'blocked-affinity',
              affinity: {
                status: 'blocked-mismatch',
                requiredServiceAccountId: 'service-account:chatgpt:operator@example.com',
                eligibilityNote: 'requires configured service account service-account:chatgpt:operator@example.com',
                reason:
                  'runner runner:http-runtime-account-missing does not expose service account service-account:chatgpt:operator@example.com',
              },
            },
          },
        },
      });

      const matchingResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runId=${runId}&runnerId=runner:http-runtime-account-match`,
      );
      expect(matchingResponse.status).toBe(200);
      const matchingPayload = (await matchingResponse.json()) as Record<string, unknown>;
      expect(matchingPayload).toMatchObject({
        inspection: {
          runtime: {
            queueProjection: {
              claimState: 'claimable',
              affinity: {
                status: 'eligible',
                reason: null,
                requiredServiceAccountId: 'service-account:chatgpt:operator@example.com',
                eligibilityNote: 'requires configured service account service-account:chatgpt:operator@example.com',
              },
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('expires an inspected runner heartbeat before evaluating runtime inspection over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-expired-runner-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'runtime_http_inspect_expired_runner';
    const createdAt = '2026-04-15T12:40:00.000Z';
    const runnerId = 'runner:http-runtime-expired';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'teamrun_http_runtime_expired_runner',
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Inspect expired runtime runner.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [`${runId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${runId}:step:1`,
            runId,
            sourceStepId: 'teamrun_http_runtime_expired_runner:step:1',
            agentId: 'agent:inspect-expired-runner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect expired runtime runner.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: runnerId,
        hostId: 'host:http-runtime-expired',
        status: 'active',
        startedAt: createdAt,
        lastHeartbeatAt: '2026-04-15T12:41:00.000Z',
        expiresAt: '2026-04-15T12:42:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const realDateNow = Date.now;
    Date.now = () => new Date('2026-04-15T12:45:00.000Z').getTime();
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      { control, runnersControl },
    );

    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runId=${runId}&runnerId=${runnerId}`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        inspection: {
          runtime: {
            queueProjection: {
              queueState: string;
              claimState: string;
              affinity: { status: string; reason: string | null };
            };
          };
          runner: {
            runnerId: string;
            status: string;
            eligibilityNote: string | null;
          } | null;
        };
      };

      expect(payload.inspection.runtime.queueProjection).toMatchObject({
        queueState: 'runnable',
        claimState: 'blocked-affinity',
        affinity: {
          status: 'blocked-mismatch',
          reason: `runner ${runnerId} heartbeat is not active`,
        },
      });
      expect(payload.inspection.runner).toMatchObject({
        runnerId,
        status: 'stale',
        eligibilityNote: 'runtime inspection liveness sweep',
      });
    } finally {
      Date.now = realDateNow;
      await server.close();
    }
  });

  it('returns read-only scheduler authority on runtime inspection without mutating leases', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-scheduler-authority-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'runtime_http_inspect_scheduler_authority';
    const createdAt = '2026-04-21T15:00:00.000Z';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'teamrun_http_runtime_scheduler_authority',
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Inspect scheduler authority.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [`${runId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${runId}:step:1`,
            runId,
            sourceStepId: 'teamrun_http_runtime_scheduler_authority:step:1',
            agentId: 'agent:inspect-scheduler-authority',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect scheduler authority.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );
    await control.acquireLease({
      runId,
      leaseId: 'lease:http-runtime-scheduler-expired',
      ownerId: 'runner:http-runtime-stale-owner',
      acquiredAt: '2026-04-21T15:00:00.000Z',
      heartbeatAt: '2026-04-21T15:00:00.000Z',
      expiresAt: '2026-04-21T15:00:10.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:http-runtime-stale-owner',
        hostId: 'host:http-runtime-scheduler',
        status: 'stale',
        startedAt: createdAt,
        lastHeartbeatAt: '2026-04-21T15:00:00.000Z',
        expiresAt: '2026-04-21T15:00:10.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:http-runtime-alternate',
        hostId: 'host:http-runtime-scheduler',
        status: 'active',
        startedAt: createdAt,
        lastHeartbeatAt: '2026-04-21T15:00:40.000Z',
        expiresAt: '2099-04-21T15:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });
    const before = await control.readRun(runId);

    const realDateNow = Date.now;
    Date.now = () => new Date('2026-04-21T15:00:45.000Z').getTime();
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      { control, runnersControl },
    );

    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runId=${runId}&runnerId=runner:http-runtime-alternate&authority=scheduler`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        inspection: {
          queryRunId: runId,
          runtime: {
            queueProjection: {
              queueState: 'active-lease',
              activeLeaseId: 'lease:http-runtime-scheduler-expired',
              activeLeaseOwnerId: 'runner:http-runtime-stale-owner',
            },
          },
          schedulerAuthority: {
            runId,
            decision: 'reassignable-after-expired-lease',
            mutationAllowed: false,
            selectedRunnerId: expect.any(String),
            localRunnerId: 'runner:http-runtime-alternate',
            futureMutation: 'scheduler-reassign-expired-lease',
            activeLease: {
              leaseId: 'lease:http-runtime-scheduler-expired',
              ownerId: 'runner:http-runtime-stale-owner',
              ownerStatus: 'stale',
              ownerFreshness: 'stale',
            },
          },
        },
      });

      const after = await control.readRun(runId);
      expect(after?.revision).toBe(before?.revision);
      expect(after?.bundle.leases[0]).toMatchObject({
        id: 'lease:http-runtime-scheduler-expired',
        status: 'active',
      });
    } finally {
      Date.now = realDateNow;
      await server.close();
    }
  });

  it('reports bounded candidate matches for alias-based runtime inspection over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-matches-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const teamRunId = 'teamrun_http_runtime_matches';
    const taskRunSpecId = 'task_spec_http_runtime_matches';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'runtime_http_matches_old',
          sourceKind: 'team-run',
          sourceId: teamRunId,
          taskRunSpecId,
          status: 'planned',
          createdAt: '2026-04-15T12:00:00.000Z',
          updatedAt: '2026-04-15T12:00:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Inspect older runtime queue projection.',
          initialInputs: {},
          sharedStateId: 'runtime_http_matches_old:state',
          stepIds: ['runtime_http_matches_old:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'runtime_http_matches_old:step:1',
            runId: 'runtime_http_matches_old',
            sourceStepId: 'teamrun_http_runtime_matches:step:1',
            agentId: 'agent:inspect',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect older runtime queue projection.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'runtime_http_matches_old:state',
          runId: 'runtime_http_matches_old',
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-15T12:00:00.000Z',
        }),
        events: [],
      }),
    );
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'runtime_http_matches_new',
          sourceKind: 'team-run',
          sourceId: teamRunId,
          taskRunSpecId,
          status: 'planned',
          createdAt: '2026-04-15T12:01:00.000Z',
          updatedAt: '2026-04-15T12:01:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Inspect newer runtime queue projection.',
          initialInputs: {},
          sharedStateId: 'runtime_http_matches_new:state',
          stepIds: ['runtime_http_matches_new:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'runtime_http_matches_new:step:1',
            runId: 'runtime_http_matches_new',
            sourceStepId: 'teamrun_http_runtime_matches:step:1',
            agentId: 'agent:inspect',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect newer runtime queue projection.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'runtime_http_matches_new:state',
          runId: 'runtime_http_matches_new',
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-15T12:01:00.000Z',
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?teamRunId=${teamRunId}`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        object: string;
        inspection: {
          resolvedBy: string;
          queryId: string;
          queryRunId: string;
          matchingRuntimeRunCount: number;
          matchingRuntimeRunIds: string[];
          runtime: {
            runId: string;
            taskRunSpecId: string | null;
          };
        };
      };
      expect(payload).toMatchObject({
        object: 'runtime_run_inspection',
        inspection: {
          resolvedBy: 'team-run-id',
          queryId: teamRunId,
          queryRunId: 'runtime_http_matches_new',
          matchingRuntimeRunCount: 2,
          matchingRuntimeRunIds: ['runtime_http_matches_new', 'runtime_http_matches_old'],
          runtime: {
            runId: 'runtime_http_matches_new',
            taskRunSpecId,
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('resolves task-run-spec runtime inspection against team-run sources only over HTTP', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-task-spec-team-only-'));
    cleanup.push(tmp);
    setAuracallHomeDirOverrideForTest(tmp);

    const control = createExecutionRuntimeControl();
    const taskRunSpecId = 'task_spec_http_runtime_team_only';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'runtime_http_team_task_spec_old',
          sourceKind: 'team-run',
          sourceId: 'teamrun_http_runtime_team_only',
          taskRunSpecId,
          status: 'running',
          createdAt: '2026-04-15T12:50:00.000Z',
          updatedAt: '2026-04-15T12:55:00.000Z',
          trigger: 'cli',
          requestedBy: 'auracall teams run',
          entryPrompt: 'HTTP task-run-spec team source.',
          initialInputs: {},
          sharedStateId: 'runtime_http_team_task_spec_old:state',
          stepIds: ['runtime_http_team_task_spec_old:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'runtime_http_team_task_spec_old:step:1',
            runId: 'runtime_http_team_task_spec_old',
            sourceStepId: 'teamrun_http_runtime_team_only:step:1',
            agentId: 'agent:http-inspect-team-only',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'HTTP task-run-spec team source.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-15T12:51:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'runtime_http_team_task_spec_old:state',
          runId: 'runtime_http_team_task_spec_old',
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-15T12:55:00.000Z',
        }),
        events: [],
      }),
    );

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'runtime_http_direct_task_spec_new',
          sourceKind: 'direct',
          sourceId: null,
          taskRunSpecId,
          status: 'planned',
          createdAt: '2026-04-15T13:00:00.000Z',
          updatedAt: '2026-04-15T13:10:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Direct run should not win HTTP task-run-spec lookup.',
          initialInputs: {},
          sharedStateId: 'runtime_http_direct_task_spec_new:state',
          stepIds: ['runtime_http_direct_task_spec_new:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'runtime_http_direct_task_spec_new:step:1',
            runId: 'runtime_http_direct_task_spec_new',
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Direct run should not win HTTP task-run-spec lookup.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'runtime_http_direct_task_spec_new:state',
          runId: 'runtime_http_direct_task_spec_new',
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-15T13:10:00.000Z',
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?taskRunSpecId=${taskRunSpecId}`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        inspection: {
          resolvedBy: string;
          queryId: string;
          queryRunId: string;
          matchingRuntimeRunCount: number;
          matchingRuntimeRunIds: string[];
          runtime: {
            runId: string;
            teamRunId: string | null;
            taskRunSpecId: string | null;
            sourceKind: string;
            runStatus: string;
          };
        };
      };

      expect(payload.inspection).toMatchObject({
        resolvedBy: 'task-run-spec-id',
        queryId: taskRunSpecId,
        queryRunId: 'runtime_http_team_task_spec_old',
        matchingRuntimeRunCount: 1,
        matchingRuntimeRunIds: ['runtime_http_team_task_spec_old'],
        runtime: {
          runId: 'runtime_http_team_task_spec_old',
          teamRunId: 'teamrun_http_runtime_team_only',
          taskRunSpecId,
          sourceKind: 'team-run',
          runStatus: 'running',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces taskRunSpecId on recovery detail for stored team-run-backed runs', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-recovery-detail-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'status_detail_taskrun_1';
    const stepId = `${runId}:step:1`;

    await writeTaskRunSpecStoredRecord({
      id: 'task_spec_detail_1',
      teamId: 'team_template_detail_1',
      title: 'Inspect persisted recovery task spec',
      objective: 'Verify recovery detail can surface persisted task spec linkage.',
      successCriteria: [],
      requestedOutputs: [
        {
          kind: 'final-response',
          label: 'final answer',
          format: 'markdown',
          required: true,
          destination: 'response-body',
        },
      ],
      inputArtifacts: [
        {
          id: 'artifact_detail_1',
          kind: 'file',
          title: 'Recovery spec',
          path: '/repo/recovery.md',
          uri: null,
          mediaType: null,
          notes: [],
          required: true,
        },
      ],
      context: {},
      constraints: {},
      overrides: {},
      turnPolicy: {
        maxTurns: 12,
        stopOnStatus: ['succeeded', 'failed', 'cancelled', 'needs-human'],
        allowTeamInitiatedStop: true,
        allowHumanEscalation: true,
      },
      humanInteractionPolicy: {
        requiredOn: ['needs-approval', 'missing-info', 'needs-human'],
        allowClarificationRequests: true,
        allowApprovalRequests: true,
        defaultBehavior: 'pause',
      },
      localActionPolicy: {
        mode: 'forbidden',
        complexityStage: 'bounded-command',
        allowedActionKinds: [],
        allowedCommands: [],
        allowedCwdRoots: [],
        resultReportingMode: 'summary-only',
      },
      requestedBy: null,
      trigger: 'service',
      createdAt: '2026-04-11T18:59:00.000Z',
    });

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_recovery_task_1',
          taskRunSpecId: 'task_spec_detail_1',
          status: 'planned',
          createdAt: '2026-04-11T19:00:00.000Z',
          updatedAt: '2026-04-11T19:00:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Inspect task-aware recovery detail.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_recovery_task_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect task-aware recovery detail.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: null,
            startedAt: null,
            completedAt: null,
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-11T19:00:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T19:00:00.000Z',
            note: 'projected from task-aware team-run bundle',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T19:05:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        object: 'recovery_detail',
        detail: {
          runId,
          sourceKind: 'team-run',
          taskRunSpecId: 'task_spec_detail_1',
          taskRunSpecSummary: {
            id: 'task_spec_detail_1',
            teamId: 'team_template_detail_1',
            title: 'Inspect persisted recovery task spec',
            objective: 'Verify recovery detail can surface persisted task spec linkage.',
            createdAt: '2026-04-11T18:59:00.000Z',
            persistedAt: '2026-04-11T18:59:00.000Z',
            requestedOutputCount: 1,
            inputArtifactCount: 1,
          },
          handoffTransferSummary: null,
          hostState: 'runnable',
          dispatch: {
            nextRunnableStepId: `${runId}:step:1`,
            runningStepIds: [],
          },
        },
      });
      const detail = (payload as { detail: Record<string, unknown> }).detail;
      expect(detail).not.toHaveProperty('runtimeProfile');
      expect(detail).not.toHaveProperty('service');
      expect(detail).not.toHaveProperty('stepSummaries');
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded handoff-transfer summary on recovery detail for stored team-run-backed runs', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-recovery-detail-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'status_detail_handoff_transfer_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_recovery_handoff_http_1',
          taskRunSpecId: 'task_spec_detail_handoff_1',
          status: 'planned',
          createdAt: '2026-04-12T17:10:00.000Z',
          updatedAt: '2026-04-12T17:10:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Inspect task-aware recovery detail.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: 'team_run_recovery_handoff_http_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Prepare the transfer.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'prepared',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T17:10:10.000Z',
            completedAt: '2026-04-12T17:10:30.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_recovery_handoff_http_1:step:2',
            agentId: 'engineer',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'runnable',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Consume the transfer.',
              handoffIds: [`${runId}:handoff:${stepTwoId}:1`],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: null,
            startedAt: null,
            completedAt: null,
          }),
        ],
        handoffs: [
          {
            id: `${runId}:handoff:${stepTwoId}:1`,
            teamRunId: runId,
            fromStepId: stepOneId,
            toStepId: stepTwoId,
            fromAgentId: 'orchestrator',
            toAgentId: 'engineer',
            summary: `Planned handoff for ${runId}`,
            artifacts: [],
            structuredData: {
              taskRunSpecId: 'task_spec_detail_handoff_1',
              toRoleId: null,
              taskTransfer: {
                title: 'Drive dependency handoff transfer',
                objective: 'Ensure the next step gets bounded transfer context.',
                successCriteria: ['transfer consumed'],
                requestedOutputs: [
                  {
                    label: 'handoff brief',
                    kind: 'structured-report',
                    destination: 'handoff',
                    required: true,
                  },
                ],
                inputArtifacts: [
                  {
                    id: 'artifact-spec',
                    kind: 'file',
                    title: 'Spec',
                    path: '/repo/spec.md',
                    uri: null,
                  },
                ],
              },
            },
            notes: ['planned handoff derived from team step dependencies'],
            status: 'prepared',
            createdAt: '2026-04-12T17:10:30.000Z',
          },
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [
            {
              key: `step.consumedTaskTransfers.${stepTwoId}`,
              value: {
                ownerStepId: stepTwoId,
                generatedAt: '2026-04-12T17:10:00.000Z',
                total: 1,
                items: [
                  {
                    handoffId: `${runId}:handoff:${stepTwoId}:1`,
                    fromStepId: stepOneId,
                    fromAgentId: 'orchestrator',
                    title: 'Stored HTTP recovery transfer title',
                    objective: 'Stored consumed state should drive HTTP recovery-detail readback.',
                    requestedOutputCount: 6,
                    inputArtifactCount: 2,
                  },
                ],
              },
            },
          ],
          notes: [],
          history: [
            createExecutionRunEvent({
              id: `${runId}:event:${stepOneId}:started`,
              runId,
              stepId: stepOneId,
              type: 'step-started',
              createdAt: '2026-04-12T17:10:05.000Z',
              note: 'http source step started',
            }),
            createExecutionRunEvent({
              id: `${runId}:event:${stepOneId}:completed`,
              runId,
              stepId: stepOneId,
              type: 'step-succeeded',
              createdAt: '2026-04-12T17:10:30.000Z',
              note: 'http source step completed',
            }),
            createExecutionRunEvent({
              id: `${runId}:event:${stepTwoId}:handoff-consumed`,
              runId,
              stepId: stepTwoId,
              type: 'handoff-consumed',
              createdAt: '2026-04-12T17:10:45.000Z',
              note: 'http handoff consumed by downstream step',
              payload: {
                handoffId: `${runId}:handoff:${stepTwoId}:1`,
              },
            }),
            createExecutionRunEvent({
              id: `${runId}:event:operator-note`,
              runId,
              type: 'note-added',
              createdAt: '2026-04-12T17:11:00.000Z',
              note: 'http targeted drain note',
              payload: {
                source: 'operator',
                action: 'drain-run',
              },
            }),
          ],
          lastUpdatedAt: '2026-04-12T17:10:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T17:10:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-12T17:15:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        object: 'recovery_detail',
        detail: {
          runId,
          sourceKind: 'team-run',
          taskRunSpecId: 'task_spec_detail_handoff_1',
          orchestrationTimelineSummary: {
            total: 4,
            items: [
              {
                type: 'step-started',
                createdAt: '2026-04-12T17:10:05.000Z',
                stepId: stepOneId,
                note: 'http source step started',
                handoffId: null,
              },
              {
                type: 'step-succeeded',
                createdAt: '2026-04-12T17:10:30.000Z',
                stepId: stepOneId,
                note: 'http source step completed',
                handoffId: null,
              },
              {
                type: 'handoff-consumed',
                createdAt: '2026-04-12T17:10:45.000Z',
                stepId: stepTwoId,
                note: 'http handoff consumed by downstream step',
                handoffId: `${runId}:handoff:${stepTwoId}:1`,
              },
              {
                type: 'note-added',
                createdAt: '2026-04-12T17:11:00.000Z',
                stepId: null,
                note: 'http targeted drain note',
                handoffId: null,
              },
            ],
          },
          handoffTransferSummary: {
            total: 1,
            items: [
              {
                handoffId: `${runId}:handoff:${stepTwoId}:1`,
                fromStepId: stepOneId,
                fromAgentId: 'orchestrator',
                title: 'Stored HTTP recovery transfer title',
                objective: 'Stored consumed state should drive HTTP recovery-detail readback.',
                requestedOutputCount: 6,
                inputArtifactCount: 2,
              },
            ],
          },
          hostState: 'runnable',
          dispatch: {
            nextRunnableStepId: stepTwoId,
            runningStepIds: [],
          },
        },
      });
      const detail = (payload as { detail: Record<string, unknown> }).detail;
      expect(detail).not.toHaveProperty('runtimeProfile');
      expect(detail).not.toHaveProperty('service');
      expect(detail).not.toHaveProperty('stepSummaries');
    } finally {
      await server.close();
    }
  });

  it('falls back to planned handoff transfer data on HTTP recovery detail when no stored consumed summary exists', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-recovery-detail-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'status_detail_handoff_transfer_fallback_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_recovery_handoff_http_fallback_1',
          taskRunSpecId: 'task_spec_detail_handoff_fallback_1',
          status: 'planned',
          createdAt: '2026-04-14T08:30:00.000Z',
          updatedAt: '2026-04-14T08:30:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Inspect planned handoff fallback HTTP recovery detail.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: 'team_run_recovery_handoff_http_fallback_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Prepare the transfer.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'prepared',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-14T08:30:10.000Z',
            completedAt: '2026-04-14T08:30:30.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_recovery_handoff_http_fallback_1:step:2',
            agentId: 'engineer',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'runnable',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Consume the fallback transfer.',
              handoffIds: [`${runId}:handoff:${stepTwoId}:1`],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: null,
            startedAt: null,
            completedAt: null,
          }),
        ],
        handoffs: [
          {
            id: `${runId}:handoff:${stepTwoId}:1`,
            teamRunId: runId,
            fromStepId: stepOneId,
            toStepId: stepTwoId,
            fromAgentId: 'orchestrator',
            toAgentId: 'engineer',
            summary: `Planned HTTP fallback handoff for ${runId}`,
            artifacts: [],
            structuredData: {
              taskRunSpecId: 'task_spec_detail_handoff_fallback_1',
              toRoleId: null,
              taskTransfer: {
                title: 'Planned HTTP recovery fallback transfer title',
                objective: 'Use planned transfer data when no stored consumed summary exists.',
                successCriteria: ['fallback transfer available'],
                requestedOutputs: [
                  {
                    label: 'planned http handoff brief',
                    kind: 'structured-report',
                    destination: 'handoff',
                    required: true,
                  },
                ],
                inputArtifacts: [
                  {
                    id: 'artifact-http-planned',
                    kind: 'file',
                    title: 'Planned HTTP Spec',
                    path: '/repo/http-planned-spec.md',
                    uri: null,
                  },
                ],
              },
            },
            notes: ['planned handoff derived from team step dependencies'],
            status: 'prepared',
            createdAt: '2026-04-14T08:30:30.000Z',
          },
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-14T08:30:30.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-14T08:30:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-14T08:35:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        object: 'recovery_detail',
        detail: {
          runId,
          sourceKind: 'team-run',
          handoffTransferSummary: {
            total: 1,
            items: [
              {
                handoffId: `${runId}:handoff:${stepTwoId}:1`,
                fromStepId: stepOneId,
                fromAgentId: 'orchestrator',
                title: 'Planned HTTP recovery fallback transfer title',
                objective: 'Use planned transfer data when no stored consumed summary exists.',
                requestedOutputCount: 1,
                inputArtifactCount: 1,
              },
            ],
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('returns 404 for missing recovery detail', async () => {
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status/recovery/missing-run`);
      expect(response.status).toBe(404);
      const payload = (await response.json()) as { error: { message: string } };
      expect(payload.error.message).toContain('Recovery detail for run missing-run was not found');
    } finally {
      await server.close();
    }
  });

  it('rejects status recovery query misuse', async () => {
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/status?sourceKind=team-run&recovery=0`,
      );
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { message: string } };
      expect(payload.error.message).toContain('sourceKind can only be used with recovery=true');
    } finally {
      await server.close();
    }
  });

  it('accepts X-AuraCall headers as bounded execution hints with header precedence', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-08T12:05:00.000Z'),
        generateResponseId: () => 'resp_headers_1',
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AuraCall-Runtime-Profile': 'review',
          'X-AuraCall-Agent': 'planner',
          'X-AuraCall-Team': 'ops',
          'X-AuraCall-Service': 'grok',
        },
        body: JSON.stringify({
          model: 'gpt-5.2',
          input: 'Use headers.',
          auracall: {
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
        }),
      });

      expect(response.status).toBe(200);
      const created = (await response.json()) as Record<string, unknown>;
      expect(created).toMatchObject({
        id: 'resp_headers_1',
        metadata: {
          runId: 'resp_headers_1',
          runtimeProfile: 'review',
          service: 'grok',
        },
      });

      await delay(100);
      const readBack = await fetch(`http://127.0.0.1:${server.port}/v1/responses/resp_headers_1`);
      const reread = (await readBack.json()) as Record<string, unknown>;
      expect(reread).toMatchObject({
        id: 'resp_headers_1',
        metadata: {
          runtimeProfile: 'review',
          service: 'grok',
        },
      });
      expect(['in_progress', 'completed', 'failed']).toContain(reread.status);
    } finally {
      await server.close();
    }
  });

  it('surfaces taskRunSpecId on HTTP response readback for stored team-run-backed records', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_http_team_task_1';
    const stepId = `${runId}:step:1`;

    await writeTaskRunSpecStoredRecord({
      id: 'task_spec_http_1',
      teamId: 'team_template_http_1',
      title: 'Inspect persisted HTTP task spec',
      objective: 'Verify HTTP response readback can surface persisted task spec linkage.',
      successCriteria: [],
      requestedOutputs: [],
      inputArtifacts: [],
      context: {},
      constraints: {},
      overrides: {},
      turnPolicy: {
        maxTurns: 12,
        stopOnStatus: ['succeeded', 'failed', 'cancelled', 'needs-human'],
        allowTeamInitiatedStop: true,
        allowHumanEscalation: true,
      },
      humanInteractionPolicy: {
        requiredOn: ['needs-approval', 'missing-info', 'needs-human'],
        allowClarificationRequests: true,
        allowApprovalRequests: true,
        defaultBehavior: 'pause',
      },
      localActionPolicy: {
        mode: 'forbidden',
        complexityStage: 'bounded-command',
        allowedActionKinds: [],
        allowedCommands: [],
        allowedCwdRoots: [],
        resultReportingMode: 'summary-only',
      },
      requestedBy: null,
      trigger: 'service',
      createdAt: '2026-04-11T18:09:00.000Z',
    });

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_http_task_1',
          taskRunSpecId: 'task_spec_http_1',
          status: 'succeeded',
          createdAt: '2026-04-11T18:10:00.000Z',
          updatedAt: '2026-04-11T18:11:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Complete the task-aware team run.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_http_task_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Complete the task-aware team run.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T18:10:10.000Z',
            completedAt: '2026-04-11T18:11:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-11T18:11:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T18:10:00.000Z',
            note: 'projected from task-aware team-run bundle',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T18:12:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          runId,
          taskRunSpecId: 'task_spec_http_1',
          taskRunSpecSummary: {
            id: 'task_spec_http_1',
            teamId: 'team_template_http_1',
            title: 'Inspect persisted HTTP task spec',
            objective: 'Verify HTTP response readback can surface persisted task spec linkage.',
            createdAt: '2026-04-11T18:09:00.000Z',
            persistedAt: '2026-04-11T18:09:00.000Z',
            requestedOutputCount: 0,
            inputArtifactCount: 0,
          },
          runtimeProfile: 'default',
          service: 'chatgpt',
          executionSummary: {
            stepSummaries: [
              {
                stepId,
                order: 1,
                agentId: 'orchestrator',
                status: 'succeeded',
                runtimeProfileId: 'default',
                browserProfileId: null,
                service: 'chatgpt',
              },
            ],
          },
        },
      });
      expect(payload).not.toHaveProperty('metadata.executionSummary.activeLease');
      expect(payload).not.toHaveProperty('metadata.executionSummary.dispatch');
      expect(payload).not.toHaveProperty('metadata.executionSummary.repair');
      expect(payload).not.toHaveProperty('metadata.executionSummary.leaseHealth');
      expect(payload).not.toHaveProperty('metadata.executionSummary.localClaim');
    } finally {
      await server.close();
    }
  });

  it('suppresses task-run-spec identity on HTTP response readback for direct runs', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_http_direct_task_hidden_1';
    const stepId = `${runId}:step:1`;

    await writeTaskRunSpecStoredRecord({
      id: 'task_spec_http_direct_hidden_1',
      teamId: 'team_template_http_direct_hidden_1',
      title: 'Do not expose direct HTTP response assignment identity',
      objective: 'HTTP response readback should keep assignment identity team-run scoped.',
      successCriteria: [],
      requestedOutputs: [],
      inputArtifacts: [],
      context: {},
      constraints: {},
      overrides: {},
      turnPolicy: {
        maxTurns: 12,
        stopOnStatus: ['succeeded', 'failed', 'cancelled', 'needs-human'],
        allowTeamInitiatedStop: true,
        allowHumanEscalation: true,
      },
      humanInteractionPolicy: {
        requiredOn: ['needs-approval', 'missing-info', 'needs-human'],
        allowClarificationRequests: true,
        allowApprovalRequests: true,
        defaultBehavior: 'pause',
      },
      localActionPolicy: {
        mode: 'forbidden',
        complexityStage: 'bounded-command',
        allowedActionKinds: [],
        allowedCommands: [],
        allowedCwdRoots: [],
        resultReportingMode: 'summary-only',
      },
      requestedBy: null,
      trigger: 'service',
      createdAt: '2026-04-19T22:54:00.000Z',
    });

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          taskRunSpecId: 'task_spec_http_direct_hidden_1',
          status: 'succeeded',
          createdAt: '2026-04-19T22:55:00.000Z',
          updatedAt: '2026-04-19T22:56:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Complete the direct run.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Complete the direct run.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-19T22:55:10.000Z',
            completedAt: '2026-04-19T22:56:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-19T22:56:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-19T22:55:00.000Z',
            note: 'direct runtime record carries a stale task-run-spec id',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-19T22:57:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          runId,
          taskRunSpecId: null,
          taskRunSpecSummary: null,
          runtimeProfile: 'default',
          service: 'chatgpt',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded per-step routing summary on HTTP response readback for mixed-provider team-run-backed records', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_http_step_summary_1';
    const plannerStepId = `${runId}:step:1`;
    const finisherStepId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_http_step_summary_1',
          taskRunSpecId: 'task_spec_http_step_summary_1',
          status: 'succeeded',
          createdAt: '2026-04-13T20:20:00.000Z',
          updatedAt: '2026-04-13T20:21:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Route planner to finisher.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'wsl-chrome-2',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [plannerStepId, finisherStepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: plannerStepId,
            runId,
            sourceStepId: 'team_run_http_step_summary_1:step:1',
            agentId: 'planner',
            runtimeProfileId: 'wsl-chrome-2',
            browserProfileId: 'wsl-chrome-2',
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Plan.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'planned',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-13T20:20:05.000Z',
            completedAt: '2026-04-13T20:20:20.000Z',
          }),
          createExecutionRunStep({
            id: finisherStepId,
            runId,
            sourceStepId: 'team_run_http_step_summary_1:step:2',
            agentId: 'finisher',
            runtimeProfileId: 'auracall-grok-auto',
            browserProfileId: 'default',
            service: 'grok',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [plannerStepId],
            input: {
              prompt: 'Finish.',
              handoffIds: ['handoff:1'],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'finished',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-13T20:20:25.000Z',
            completedAt: '2026-04-13T20:21:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-13T20:21:00.000Z',
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-13T20:21:30.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          runId,
          taskRunSpecId: 'task_spec_http_step_summary_1',
          runtimeProfile: 'wsl-chrome-2',
          service: 'chatgpt',
          executionSummary: {
            stepSummaries: [
              {
                stepId: plannerStepId,
                order: 1,
                agentId: 'planner',
                status: 'succeeded',
                runtimeProfileId: 'wsl-chrome-2',
                browserProfileId: 'wsl-chrome-2',
                service: 'chatgpt',
              },
              {
                stepId: finisherStepId,
                order: 2,
                agentId: 'finisher',
                status: 'succeeded',
                runtimeProfileId: 'auracall-grok-auto',
                browserProfileId: 'default',
                service: 'grok',
              },
            ],
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded input-artifact summary on HTTP response readback for stored team-run-backed records', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_http_input_artifacts_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_http_input_artifacts_1',
          taskRunSpecId: 'task_spec_http_input_artifacts_1',
          status: 'succeeded',
          createdAt: '2026-04-12T15:10:00.000Z',
          updatedAt: '2026-04-12T15:11:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Use the supplied assignment artifacts.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_http_input_artifacts_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Use the supplied assignment artifacts.',
              handoffIds: [],
              artifacts: [
                {
                  id: 'artifact-readme',
                  kind: 'file',
                  path: '/repo/README.md',
                  title: 'README',
                },
                {
                  id: 'artifact-spec',
                  kind: 'url',
                  uri: 'https://example.test/spec',
                  title: 'Spec',
                },
              ],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T15:10:10.000Z',
            completedAt: '2026-04-12T15:11:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T15:11:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T15:10:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-12T15:12:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          executionSummary: {
            inputArtifactSummary: {
              total: 2,
              items: [
                {
                  id: 'artifact-readme',
                  kind: 'file',
                  title: 'README',
                  path: '/repo/README.md',
                  uri: null,
                },
                {
                  id: 'artifact-spec',
                  kind: 'url',
                  title: 'Spec',
                  path: null,
                  uri: 'https://example.test/spec',
                },
              ],
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('prefers a failed step as the terminal HTTP readback step over later succeeded steps', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_http_terminal_failure_precedence_1';
    const failedStepId = `${runId}:step:1`;
    const laterSucceededStepId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_http_terminal_failure_precedence_1',
          taskRunSpecId: 'task_spec_http_terminal_failure_precedence_1',
          status: 'failed',
          createdAt: '2026-04-14T07:55:00.000Z',
          updatedAt: '2026-04-14T07:56:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Prefer the failed step as terminal readback state.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [failedStepId, laterSucceededStepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: failedStepId,
            runId,
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'failed',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'This step failed.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'planner failed',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            failure: {
              code: 'planner_failed',
              message: 'planner failed first',
            },
            startedAt: '2026-04-14T07:55:05.000Z',
            completedAt: '2026-04-14T07:55:20.000Z',
          }),
          createExecutionRunStep({
            id: laterSucceededStepId,
            runId,
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [failedStepId],
            input: {
              prompt: 'This step finished later.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'finisher succeeded later',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-14T07:55:30.000Z',
            completedAt: '2026-04-14T07:56:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'failed',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-14T07:56:00.000Z',
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-14T07:56:30.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        status: 'failed',
        metadata: {
          executionSummary: {
            terminalStepId: failedStepId,
            completedAt: '2026-04-14T07:55:20.000Z',
            failureSummary: {
              code: 'planner_failed',
              message: 'planner failed first',
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('prefers the terminal step input-artifact summary on HTTP response readback', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_http_input_artifacts_terminal_precedence_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_http_input_artifacts_terminal_precedence_1',
          taskRunSpecId: 'task_spec_http_input_artifacts_terminal_precedence_1',
          status: 'succeeded',
          createdAt: '2026-04-12T15:25:00.000Z',
          updatedAt: '2026-04-12T15:26:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Use the terminal step artifacts.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Older step artifacts.',
              handoffIds: [],
              artifacts: [
                {
                  id: 'artifact-older',
                  kind: 'file',
                  path: '/repo/older.md',
                  title: 'Older Artifact',
                },
              ],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'older step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T15:25:10.000Z',
            completedAt: '2026-04-12T15:25:25.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Terminal step artifacts.',
              handoffIds: [],
              artifacts: [
                {
                  id: 'artifact-terminal',
                  kind: 'url',
                  uri: 'https://example.test/terminal',
                  title: 'Terminal Artifact',
                },
              ],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'terminal step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T15:25:30.000Z',
            completedAt: '2026-04-12T15:26:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T15:26:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T15:25:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-12T15:26:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          executionSummary: {
            terminalStepId: stepTwoId,
            inputArtifactSummary: {
              total: 1,
              items: [
                {
                  id: 'artifact-terminal',
                  kind: 'url',
                  title: 'Terminal Artifact',
                  path: null,
                  uri: 'https://example.test/terminal',
                },
              ],
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('falls back to the latest earlier step with input artifacts on HTTP response readback when the terminal step has none', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_http_input_artifacts_fallback_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_http_input_artifacts_fallback_1',
          taskRunSpecId: 'task_spec_http_input_artifacts_fallback_1',
          status: 'succeeded',
          createdAt: '2026-04-14T08:15:00.000Z',
          updatedAt: '2026-04-14T08:16:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Fall back to earlier input artifacts when terminal step has none.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Earlier step with artifacts.',
              handoffIds: [],
              artifacts: [
                {
                  id: 'artifact-fallback',
                  kind: 'file',
                  path: '/repo/fallback.md',
                  title: 'Fallback Artifact',
                },
              ],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'earlier step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-14T08:15:10.000Z',
            completedAt: '2026-04-14T08:15:25.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Terminal step with no artifacts.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'terminal step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-14T08:15:30.000Z',
            completedAt: '2026-04-14T08:16:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-14T08:16:00.000Z',
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-14T08:16:30.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          executionSummary: {
            terminalStepId: stepTwoId,
            inputArtifactSummary: {
              total: 1,
              items: [
                {
                  id: 'artifact-fallback',
                  kind: 'file',
                  title: 'Fallback Artifact',
                  path: '/repo/fallback.md',
                  uri: null,
                },
              ],
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded handoff-transfer summary on HTTP response readback for stored team-run-backed records', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_http_handoff_transfer_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_http_handoff_transfer_1',
          taskRunSpecId: 'task_spec_http_handoff_transfer_1',
          status: 'succeeded',
          createdAt: '2026-04-12T16:10:00.000Z',
          updatedAt: '2026-04-12T16:11:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Consume the incoming handoff transfer.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: 'team_run_http_handoff_transfer_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Prepare the transfer.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'prepared',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T16:10:10.000Z',
            completedAt: '2026-04-12T16:10:30.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: 'team_run_http_handoff_transfer_1:step:2',
            agentId: 'engineer',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Consume the incoming handoff transfer.',
              handoffIds: [`${runId}:handoff:${stepTwoId}:1`],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'consumed handoff transfer',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T16:10:40.000Z',
            completedAt: '2026-04-12T16:11:00.000Z',
          }),
        ],
        handoffs: [
          {
            id: `${runId}:handoff:${stepTwoId}:1`,
            teamRunId: runId,
            fromStepId: stepOneId,
            toStepId: stepTwoId,
            fromAgentId: 'orchestrator',
            toAgentId: 'engineer',
            summary: `Planned handoff for ${runId}`,
            artifacts: [],
            structuredData: {
              taskRunSpecId: 'task_spec_http_handoff_transfer_1',
              toRoleId: null,
              taskTransfer: {
                title: 'Drive dependency handoff transfer',
                objective: 'Ensure the next step gets bounded transfer context.',
                successCriteria: ['transfer consumed'],
                requestedOutputs: [
                  {
                    label: 'handoff brief',
                    kind: 'structured-report',
                    destination: 'handoff',
                    required: true,
                  },
                ],
                inputArtifacts: [
                  {
                    id: 'artifact-spec',
                    kind: 'file',
                    title: 'Spec',
                    path: '/repo/spec.md',
                    uri: null,
                  },
                ],
              },
            },
            notes: ['planned handoff derived from team step dependencies'],
            status: 'prepared',
            createdAt: '2026-04-12T16:10:30.000Z',
          },
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T16:11:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T16:10:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-12T16:12:00.000Z'),
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          executionSummary: {
            handoffTransferSummary: {
              total: 1,
              items: [
                {
                  handoffId: `${runId}:handoff:${stepTwoId}:1`,
                  fromStepId: stepOneId,
                  fromAgentId: 'orchestrator',
                  title: 'Drive dependency handoff transfer',
                  objective: 'Ensure the next step gets bounded transfer context.',
                  requestedOutputCount: 1,
                  inputArtifactCount: 1,
                },
              ],
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('ignores status-only query validation on non-status routes', async () => {
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/models?sourceKind=team-run&foo=bar`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({ object: 'list', data: expect.any(Array) });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded runner failures through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-08T12:10:00.000Z'),
        generateResponseId: () => 'resp_failure_1',
        executeStoredRunStep: async () => {
          throw new Error('runner failed');
        },
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.2',
          input: 'Fail once.',
        }),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: 'resp_failure_1',
        object: 'response',
        status: 'failed',
        model: 'gpt-5.2',
        metadata: {
          executionSummary: {
            terminalStepId: 'resp_failure_1:step:1',
            completedAt: '2026-04-08T12:10:00.000Z',
            lastUpdatedAt: '2026-04-08T12:10:00.000Z',
            failureSummary: {
              code: 'runner_execution_failed',
              message: 'runner failed',
            },
          },
        },
      });

      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/resp_failure_1`);
      const readPayload = (await reread.json()) as Record<string, unknown>;
      expect(readPayload).toMatchObject({
        id: 'resp_failure_1',
        status: 'failed',
        metadata: {
          executionSummary: {
            terminalStepId: 'resp_failure_1:step:1',
            failureSummary: {
              code: 'runner_execution_failed',
              message: 'runner failed',
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('resolves a requested local action through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-local-action-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedRequestedLocalActionDirectRun(control, 'status_local_action_control', '2026-04-11T18:20:00.000Z');

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T18:25:00.000Z'),
      },
    );

    try {
      const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localActionControl: {
            action: 'resolve-request',
            runId: 'status_local_action_control',
            requestId: 'status_local_action_control:action:status_local_action_control:step:1:1',
            resolution: 'approved',
          },
        }),
      });
      expect(resolveResponse.status).toBe(200);
      const resolvePayload = (await resolveResponse.json()) as JsonObject;
      expect(resolvePayload).toMatchObject({
        controlResult: {
          kind: 'local-action-control',
          action: 'resolve-local-action-request',
          runId: 'status_local_action_control',
          requestId: 'status_local_action_control:action:status_local_action_control:step:1:1',
          resolution: 'approved',
          status: 'resolved',
          resolved: true,
          reason: 'local action approved by service host operator control',
          resolvedAt: '2026-04-11T18:25:00.000Z',
          ownerStepId: 'status_local_action_control:step:1',
        },
      });

      const storedRecord = await control.readRun('status_local_action_control');
      expect(storedRecord?.bundle.localActionRequests[0]).toMatchObject({
        status: 'approved',
        approvedAt: '2026-04-11T18:25:00.000Z',
        completedAt: null,
        resultSummary: 'local action approved by service host operator control',
      });

      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/status_local_action_control`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as JsonObject;
      expect(rereadPayload).toMatchObject({
        id: 'status_local_action_control',
        status: 'completed',
        metadata: {
          executionSummary: {
            localActionSummary: {
              ownerStepId: 'status_local_action_control:step:1',
              generatedAt: '2026-04-11T18:25:00.000Z',
              total: 1,
              counts: {
                requested: 0,
                approved: 1,
                rejected: 0,
                executed: 0,
                failed: 0,
                cancelled: 0,
              },
              items: [
                {
                  requestId: 'status_local_action_control:action:status_local_action_control:step:1:1',
                  kind: 'shell',
                  status: 'approved',
                  summary: 'Run bounded host verification later',
                  command: 'pnpm',
                  args: ['vitest', 'run'],
                  resultSummary: 'local action approved by service host operator control',
                },
              ],
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('resolves a requested team-run local action through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-team-local-action-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedRequestedLocalActionDirectRun(
      control,
      'status_team_local_action_control',
      '2026-04-11T18:26:00.000Z',
      'team-run',
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T18:27:00.000Z'),
      },
    );

    try {
      const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localActionControl: {
            action: 'resolve-request',
            runId: 'status_team_local_action_control',
            requestId: 'status_team_local_action_control:action:status_team_local_action_control:step:1:1',
            resolution: 'rejected',
          },
        }),
      });
      expect(resolveResponse.status).toBe(200);
      const resolvePayload = (await resolveResponse.json()) as JsonObject;
      expect(resolvePayload).toMatchObject({
        controlResult: {
          kind: 'local-action-control',
          action: 'resolve-local-action-request',
          runId: 'status_team_local_action_control',
          requestId: 'status_team_local_action_control:action:status_team_local_action_control:step:1:1',
          resolution: 'rejected',
          status: 'resolved',
          resolved: true,
          reason: 'local action rejected by service host operator control',
          resolvedAt: '2026-04-11T18:27:00.000Z',
          ownerStepId: 'status_team_local_action_control:step:1',
        },
      });

      const storedRecord = await control.readRun('status_team_local_action_control');
      expect(storedRecord?.bundle.run.sourceKind).toBe('team-run');
      expect(storedRecord?.bundle.localActionRequests[0]).toMatchObject({
        status: 'rejected',
        approvedAt: null,
        completedAt: '2026-04-11T18:27:00.000Z',
        resultSummary: 'local action rejected by service host operator control',
      });

      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/status_team_local_action_control`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as JsonObject;
      expect(rereadPayload).toMatchObject({
        id: 'status_team_local_action_control',
        status: 'completed',
        metadata: {
          executionSummary: {
            localActionSummary: {
              ownerStepId: 'status_team_local_action_control:step:1',
              generatedAt: '2026-04-11T18:27:00.000Z',
              total: 1,
              counts: {
                requested: 0,
                approved: 0,
                rejected: 1,
                executed: 0,
                failed: 0,
                cancelled: 0,
              },
              items: [
                {
                  requestId: 'status_team_local_action_control:action:status_team_local_action_control:step:1:1',
                  kind: 'shell',
                  status: 'rejected',
                  summary: 'Run bounded host verification later',
                  command: 'pnpm',
                  args: ['vitest', 'run'],
                  resultSummary: 'local action rejected by service host operator control',
                },
              ],
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('rejects resolving a local action request that is already resolved through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-local-action-control-reject-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedRequestedLocalActionDirectRun(control, 'status_local_action_control_reject', '2026-04-11T18:30:00.000Z');
    const record = await control.readRun('status_local_action_control_reject');
    await control.persistRun({
      runId: 'status_local_action_control_reject',
      expectedRevision: record!.revision,
      bundle: {
        ...record!.bundle,
        run: {
          ...record!.bundle.run,
          updatedAt: '2026-04-11T18:31:00.000Z',
        },
        localActionRequests: [
          {
            ...record!.bundle.localActionRequests[0]!,
            status: 'approved',
            approvedAt: '2026-04-11T18:31:00.000Z',
            resultSummary: 'approved shell for later execution',
            resultPayload: { queued: true },
          },
        ],
        sharedState: {
          ...record!.bundle.sharedState,
          structuredOutputs: [
            {
              key: 'step.localActionOutcomes.status_local_action_control_reject:step:1',
              value: {
                ownerStepId: 'status_local_action_control_reject:step:1',
                generatedAt: '2026-04-11T18:31:00.000Z',
                total: 1,
                counts: {
                  requested: 0,
                  approved: 1,
                  rejected: 0,
                  executed: 0,
                  failed: 0,
                  cancelled: 0,
                },
                items: [
                  {
                    requestId: 'status_local_action_control_reject:action:status_local_action_control_reject:step:1:1',
                    kind: 'shell',
                    status: 'approved',
                    summary: 'Run bounded host verification later',
                    command: 'pnpm',
                    args: ['vitest', 'run'],
                    resultSummary: 'approved shell for later execution',
                  },
                ],
              },
            },
          ],
          lastUpdatedAt: '2026-04-11T18:31:00.000Z',
        },
      },
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T18:32:00.000Z'),
      },
    );

    try {
      const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localActionControl: {
            action: 'resolve-request',
            runId: 'status_local_action_control_reject',
            requestId: 'status_local_action_control_reject:action:status_local_action_control_reject:step:1:1',
            resolution: 'rejected',
          },
        }),
      });
      expect(resolveResponse.status).toBe(409);
      const resolvePayload = (await resolveResponse.json()) as JsonObject;
      expect(resolvePayload).toMatchObject({
        error: {
          type: 'invalid_request_error',
          message: expect.stringContaining('is already approved'),
        },
      });
    } finally {
      await server.close();
    }
  });

  it('resumes a paused human-escalation run through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-human-resume-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPausedHumanEscalationDirectRun(
      control,
      'status_resume_human',
      '2026-04-11T19:20:00.000Z',
      '2026-04-11T19:25:00.000Z',
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T19:30:00.000Z'),
      },
    );

    try {
      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'resume-human-escalation',
            runId: 'status_resume_human',
            note: 'human approved resume',
            guidance: {
              action: 'retry-with-guidance',
              instruction: 'continue with the approved path',
            },
            override: {
              promptAppend: 'Retry the resumed step with the approved path.',
              structuredContext: {
                approvedPath: '/repo/approved',
              },
            },
          },
        }),
      });
      expect(resumeResponse.status).toBe(200);
      const resumePayload = (await resumeResponse.json()) as JsonObject;
      expect(resumePayload).toMatchObject({
        controlResult: {
          kind: 'run-control',
          action: 'resume-human-escalation',
          runId: 'status_resume_human',
          status: 'resumed',
          resumed: true,
          reason: 'human approved resume',
          resumedAt: '2026-04-11T19:30:00.000Z',
          resumedStepId: 'status_resume_human:step:2',
        },
      });

      const storedRecord = await control.readRun('status_resume_human');
      expect(storedRecord?.bundle.run.status).toBe('running');
      expect(storedRecord?.bundle.sharedState.status).toBe('active');
      expect(storedRecord?.bundle.steps[1]).toMatchObject({
        id: 'status_resume_human:step:2',
        status: 'runnable',
        completedAt: null,
        output: null,
        failure: null,
      });

      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/status_resume_human`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as JsonObject;
      expect(rereadPayload).toMatchObject({
        id: 'status_resume_human',
        status: 'in_progress',
      });
    } finally {
      await server.close();
    }
  });

  it('rejects resuming a run without paused human escalation through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-human-resume-reject-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'status_resume_human_reject', '2026-04-11T19:35:00.000Z', 'Not paused.');

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T19:36:00.000Z'),
      },
    );

    try {
      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'resume-human-escalation',
            runId: 'status_resume_human_reject',
          },
        }),
      });
      expect(resumeResponse.status).toBe(409);
      const resumePayload = (await resumeResponse.json()) as JsonObject;
      expect(resumePayload).toMatchObject({
        error: {
          type: 'invalid_request_error',
          message: expect.stringContaining('has no cancelled human-escalation step to resume'),
        },
      });
    } finally {
      await server.close();
    }
  });

  it('drains one resumed direct run through POST /status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-drain-run-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPausedHumanEscalationDirectRun(
      control,
      'status_drain_run',
      '2026-04-11T19:40:00.000Z',
      '2026-04-11T19:45:00.000Z',
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T19:50:00.000Z'),
        executeStoredRunStep: async () => ({
          output: {
            summary: 'resumed step completed',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        }),
      },
    );

    try {
      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'resume-human-escalation',
            runId: 'status_drain_run',
            note: 'human approved resume',
          },
        }),
      });
      expect(resumeResponse.status).toBe(200);

      const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'drain-run',
            runId: 'status_drain_run',
          },
        }),
      });
      expect(drainResponse.status).toBe(200);
      const drainPayload = (await drainResponse.json()) as JsonObject;
      expect(drainPayload).toMatchObject({
        controlResult: {
          kind: 'run-control',
          action: 'drain-run',
          runId: 'status_drain_run',
          status: 'executed',
          drained: true,
          reason: 'run executed through targeted host drain',
          skipReason: null,
        },
      });

      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/status_drain_run`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as JsonObject;
      expect(rereadPayload).toMatchObject({
        id: 'status_drain_run',
        status: 'completed',
      });
    } finally {
      await server.close();
    }
  });

  it('resumes and drains one paused team run through the same POST /status controls', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-team-drain-run-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPausedHumanEscalationDirectRun(
      control,
      'status_team_drain_run',
      '2026-04-12T22:30:00.000Z',
      '2026-04-12T22:35:00.000Z',
      'team-run',
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-12T22:40:00.000Z'),
        executeStoredRunStep: async () => ({
          output: {
            summary: 'resumed team step completed',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        }),
      },
    );

    try {
      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'resume-human-escalation',
            runId: 'status_team_drain_run',
            note: 'human approved team resume',
          },
        }),
      });
      expect(resumeResponse.status).toBe(200);
      const resumePayload = (await resumeResponse.json()) as JsonObject;
      expect(resumePayload).toMatchObject({
        controlResult: {
          kind: 'run-control',
          action: 'resume-human-escalation',
          runId: 'status_team_drain_run',
          status: 'resumed',
          resumed: true,
          reason: 'human approved team resume',
          resumedAt: '2026-04-12T22:40:00.000Z',
          resumedStepId: 'status_team_drain_run:step:2',
        },
      });

      const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'drain-run',
            runId: 'status_team_drain_run',
          },
        }),
      });
      expect(drainResponse.status).toBe(200);
      const drainPayload = (await drainResponse.json()) as JsonObject;
      expect(drainPayload).toMatchObject({
        controlResult: {
          kind: 'run-control',
          action: 'drain-run',
          runId: 'status_team_drain_run',
          status: 'executed',
          drained: true,
          reason: 'run executed through targeted host drain',
          skipReason: null,
        },
      });

      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/status_team_drain_run`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as JsonObject;
      expect(rereadPayload).toMatchObject({
        id: 'status_team_drain_run',
        status: 'completed',
        metadata: {
          runId: 'status_team_drain_run',
          executionSummary: {
            operatorControlSummary: {
              humanEscalationResume: {
                resumedAt: '2026-04-12T22:40:00.000Z',
                note: 'human approved team resume',
              },
              targetedDrain: {
                requestedAt: '2026-04-12T22:40:00.000Z',
                status: 'executed',
                reason: 'run executed through targeted host drain',
                skipReason: null,
              },
            },
          },
        },
      });

      const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/status_team_drain_run`);
      expect(recoveryResponse.status).toBe(200);
      const recoveryPayload = (await recoveryResponse.json()) as JsonObject;
      expect(recoveryPayload).toMatchObject({
        object: 'recovery_detail',
        detail: {
          runId: 'status_team_drain_run',
          sourceKind: 'team-run',
          orchestrationTimelineSummary: {
            total: 4,
          },
        },
      });
      expect(
        requireJsonObject(
          requireJsonObject(recoveryPayload.detail, 'detail').orchestrationTimelineSummary,
          'orchestrationTimelineSummary',
        ).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'note-added',
            note: 'human approved team resume',
            stepId: 'status_team_drain_run:step:2',
          }),
          expect.objectContaining({
            type: 'step-started',
            note: 'step started by local runner',
            stepId: 'status_team_drain_run:step:2',
          }),
          expect.objectContaining({
            type: 'step-succeeded',
            note: 'step completed by local runner',
            stepId: 'status_team_drain_run:step:2',
          }),
          expect.objectContaining({
            type: 'note-added',
            note: 'run executed through targeted host drain',
            stepId: null,
          }),
        ]),
      );
    } finally {
      await server.close();
    }
  });

  it('preserves the specific local-claim reason when POST /status targeted drain is skipped', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-drain-skip-reason-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await seedPlannedDirectRun(
      control,
      'status_drain_run_missing_runner',
      '2026-04-15T15:00:00.000Z',
      'Targeted drain should preserve the missing-runner reason.',
    );

    const executionHost = createExecutionServiceHost({
      control,
      runnersControl,
      ownerId: 'host:test',
      runnerId: 'runner:missing-http-drain',
      now: () => '2026-04-15T15:05:00.000Z',
    });

    const drainResult = await executionHost.drainRun('status_drain_run_missing_runner');
    expect(drainResult).toMatchObject({
      action: 'drain-run',
      runId: 'status_drain_run_missing_runner',
      status: 'skipped',
      drained: false,
      reason: 'runner runner:missing-http-drain has no persisted runner record',
      skipReason: 'claim-owner-unavailable',
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        runnersControl,
        executionHost,
        now: () => new Date('2026-04-15T15:05:00.000Z'),
      },
    );

    try {
      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/status_drain_run_missing_runner`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as JsonObject;
      expect(rereadPayload).toMatchObject({
        id: 'status_drain_run_missing_runner',
        status: 'in_progress',
        metadata: {
          executionSummary: {
            operatorControlSummary: {
              targetedDrain: {
                requestedAt: '2026-04-15T15:05:00.000Z',
                status: 'skipped',
                reason: 'runner runner:missing-http-drain has no persisted runner record',
                skipReason: 'claim-owner-unavailable',
              },
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded operator control summary through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-operator-summary-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPausedHumanEscalationDirectRun(
      control,
      'status_operator_summary',
      '2026-04-11T20:00:00.000Z',
      '2026-04-11T20:05:00.000Z',
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T20:10:00.000Z'),
        executeStoredRunStep: async () => ({
          output: {
            summary: 'resumed step completed',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        }),
      },
    );

    try {
      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'resume-human-escalation',
            runId: 'status_operator_summary',
            note: 'human approved resume',
          },
        }),
      });
      expect(resumeResponse.status).toBe(200);

      const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'drain-run',
            runId: 'status_operator_summary',
          },
        }),
      });
      expect(drainResponse.status).toBe(200);

      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/status_operator_summary`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as JsonObject;
      expect(rereadPayload).toMatchObject({
        id: 'status_operator_summary',
        status: 'completed',
        metadata: {
          executionSummary: {
            operatorControlSummary: {
              humanEscalationResume: {
                resumedAt: '2026-04-11T20:10:00.000Z',
                note: 'human approved resume',
              },
              targetedDrain: {
                requestedAt: '2026-04-11T20:10:00.000Z',
                status: 'executed',
                reason: 'run executed through targeted host drain',
                skipReason: null,
              },
            },
          },
        },
      });

      const recoveryRead = await fetch(`http://127.0.0.1:${server.port}/status/recovery/status_operator_summary`);
      expect(recoveryRead.status).toBe(200);
      const recoveryPayload = (await recoveryRead.json()) as JsonObject;
      expect(recoveryPayload).toMatchObject({
        object: 'recovery_detail',
        detail: {
          runId: 'status_operator_summary',
          sourceKind: 'direct',
          orchestrationTimelineSummary: {
            total: expect.any(Number),
          },
        },
      });
      expect(
        requireJsonObject(
          requireJsonObject(recoveryPayload.detail, 'detail').orchestrationTimelineSummary,
          'orchestrationTimelineSummary',
        ).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'note-added',
            note: 'human approved resume',
          }),
          expect.objectContaining({
            type: 'note-added',
            note: 'run executed through targeted host drain',
          }),
        ]),
      );
    } finally {
      await server.close();
    }
  });

  it('updates POST /status runner readback after local-action resolution, resume, and targeted drain', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-operator-runner-sync-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'status_operator_runner_sync';
    await seedPausedHumanEscalationDirectRun(
      control,
      runId,
      '2026-04-19T11:30:00.000Z',
      '2026-04-19T11:35:00.000Z',
      'team-run',
    );

    const pausedRecord = await control.readRun(runId);
    if (!pausedRecord) {
      throw new Error(`expected paused run ${runId}`);
    }
    await control.persistRun({
      runId,
      expectedRevision: pausedRecord.revision,
      bundle: {
        ...pausedRecord.bundle,
        localActionRequests: [
          {
            id: `${runId}:action:${runId}:step:1:1`,
            teamRunId: runId,
            ownerStepId: `${runId}:step:1`,
            kind: 'shell',
            summary: 'Run bounded host verification before resume.',
            command: 'pnpm',
            args: ['vitest', 'run'],
            structuredPayload: {},
            notes: [],
            status: 'requested',
            createdAt: '2026-04-19T11:34:00.000Z',
            approvedAt: null,
            completedAt: null,
            resultSummary: null,
            resultPayload: null,
          },
        ],
      },
    });
    await control.acquireLease({
      runId,
      leaseId: `${runId}:lease:origin`,
      ownerId: 'runner:origin',
      acquiredAt: '2026-04-19T11:34:00.000Z',
      heartbeatAt: '2026-04-19T11:35:00.000Z',
      expiresAt: '2026-04-19T11:36:00.000Z',
    });
    await control.releaseLease({
      runId,
      leaseId: `${runId}:lease:origin`,
      releasedAt: '2026-04-19T11:35:00.000Z',
      releaseReason: 'cancelled',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:origin',
        hostId: 'host:origin',
        status: 'stale',
        startedAt: '2026-04-19T11:25:00.000Z',
        lastHeartbeatAt: '2026-04-19T11:35:00.000Z',
        expiresAt: '2026-04-19T11:35:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        serviceAccountIds: [],
      }),
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        runnersControl,
        now: () => new Date('2026-04-19T11:40:00.000Z'),
        executeStoredRunStep: async () => ({
          output: {
            summary: 'server runner completed resumed team step',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        }),
      },
    );

    try {
      const runnerId = `runner:http-responses:127.0.0.1:${server.port}`;

      const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localActionControl: {
            action: 'resolve-request',
            runId,
            requestId: `${runId}:action:${runId}:step:1:1`,
            resolution: 'rejected',
          },
        }),
      });
      expect(resolveResponse.status).toBe(200);

      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'resume-human-escalation',
            runId,
            note: 'server runner resumed after local-action rejection',
          },
        }),
      });
      expect(resumeResponse.status).toBe(200);

      const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'drain-run',
            runId,
          },
        }),
      });
      expect(drainResponse.status).toBe(200);
      const drainPayload = (await drainResponse.json()) as JsonObject;
      expect(drainPayload).toMatchObject({
        controlResult: {
          kind: 'run-control',
          action: 'drain-run',
          runId,
          status: 'executed',
          drained: true,
          reason: 'run executed through targeted host drain',
          skipReason: null,
        },
        runner: {
          id: runnerId,
          lastClaimedRunId: runId,
        },
      });

      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as JsonObject;
      expect(rereadPayload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          executionSummary: {
            localActionSummary: {
              ownerStepId: `${runId}:step:1`,
              counts: {
                requested: 0,
                approved: 0,
                rejected: 1,
                executed: 0,
                failed: 0,
                cancelled: 0,
              },
            },
            operatorControlSummary: {
              humanEscalationResume: {
                resumedAt: '2026-04-19T11:40:00.000Z',
                note: 'server runner resumed after local-action rejection',
              },
              targetedDrain: {
                requestedAt: '2026-04-19T11:40:00.000Z',
                status: 'executed',
                reason: 'run executed through targeted host drain',
                skipReason: null,
              },
            },
          },
        },
      });

      const storedRunner = await runnersControl.readRunner(runnerId);
      expect(storedRunner?.runner.lastClaimedRunId).toBe(runId);
    } finally {
      await server.close();
    }
  });

  it('projects current local claim on recovery detail after local-action resolution and human resume', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-detail-resumed-claim-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'status_recovery_resumed_claim';
    await seedPausedHumanEscalationDirectRun(
      control,
      runId,
      '2026-04-19T12:20:00.000Z',
      '2026-04-19T12:25:00.000Z',
      'team-run',
    );

    const pausedRecord = await control.readRun(runId);
    if (!pausedRecord) {
      throw new Error(`expected paused run ${runId}`);
    }
    await control.persistRun({
      runId,
      expectedRevision: pausedRecord.revision,
      bundle: {
        ...pausedRecord.bundle,
        localActionRequests: [
          {
            id: `${runId}:action:${runId}:step:1:1`,
            teamRunId: runId,
            ownerStepId: `${runId}:step:1`,
            kind: 'shell',
            summary: 'Validate resumed recovery detail claim projection.',
            command: 'pnpm',
            args: ['vitest', 'run'],
            structuredPayload: {},
            notes: [],
            status: 'requested',
            createdAt: '2026-04-19T12:24:00.000Z',
            approvedAt: null,
            completedAt: null,
            resultSummary: null,
            resultPayload: null,
          },
        ],
      },
    });
    await control.acquireLease({
      runId,
      leaseId: `${runId}:lease:origin`,
      ownerId: 'runner:origin',
      acquiredAt: '2026-04-19T12:24:00.000Z',
      heartbeatAt: '2026-04-19T12:25:00.000Z',
      expiresAt: '2026-04-19T12:26:00.000Z',
    });
    await control.releaseLease({
      runId,
      leaseId: `${runId}:lease:origin`,
      releasedAt: '2026-04-19T12:25:00.000Z',
      releaseReason: 'cancelled',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:origin',
        hostId: 'host:origin',
        status: 'stale',
        startedAt: '2026-04-19T12:15:00.000Z',
        lastHeartbeatAt: '2026-04-19T12:25:00.000Z',
        expiresAt: '2026-04-19T12:25:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['default'],
        serviceAccountIds: [],
        browserCapable: true,
      }),
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        runnersControl,
        now: () => new Date('2026-04-19T12:30:00.000Z'),
      },
    );

    try {
      const runnerId = `runner:http-responses:127.0.0.1:${server.port}`;
      const hostId = `host:http-responses:127.0.0.1:${server.port}`;

      const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localActionControl: {
            action: 'resolve-request',
            runId,
            requestId: `${runId}:action:${runId}:step:1:1`,
            resolution: 'approved',
          },
        }),
      });
      expect(resolveResponse.status).toBe(200);

      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'resume-human-escalation',
            runId,
            note: 'resume for recovery detail local-claim audit',
          },
        }),
      });
      expect(resumeResponse.status).toBe(200);

      const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${runId}`);
      expect(recoveryResponse.status).toBe(200);
      const recoveryPayload = (await recoveryResponse.json()) as JsonObject;
      expect(recoveryPayload).toMatchObject({
        object: 'recovery_detail',
        detail: {
          runId,
          sourceKind: 'team-run',
          hostState: 'runnable',
          activeLease: null,
          dispatch: {
            nextRunnableStepId: `${runId}:step:2`,
            runningStepIds: [],
          },
          repair: null,
          localClaim: {
            runnerId,
            hostId,
            status: 'eligible',
            selected: true,
            reason: null,
            queueState: 'runnable',
            claimState: 'claimable',
            affinityStatus: 'eligible',
            affinityReason: null,
          },
        },
      });
      expect(recoveryPayload.detail).not.toMatchObject({
        activeLease: {
          ownerId: 'runner:origin',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('projects resumed runs into recovery summary local-claim buckets instead of historical paused-owner state', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-summary-resumed-claim-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'status_recovery_summary_resumed_claim';
    await seedPausedHumanEscalationDirectRun(
      control,
      runId,
      '2026-04-19T12:40:00.000Z',
      '2026-04-19T12:45:00.000Z',
      'team-run',
    );

    const pausedRecord = await control.readRun(runId);
    if (!pausedRecord) {
      throw new Error(`expected paused run ${runId}`);
    }
    await control.persistRun({
      runId,
      expectedRevision: pausedRecord.revision,
      bundle: {
        ...pausedRecord.bundle,
        localActionRequests: [
          {
            id: `${runId}:action:${runId}:step:1:1`,
            teamRunId: runId,
            ownerStepId: `${runId}:step:1`,
            kind: 'shell',
            summary: 'Validate resumed recovery summary claim projection.',
            command: 'pnpm',
            args: ['vitest', 'run'],
            structuredPayload: {},
            notes: [],
            status: 'requested',
            createdAt: '2026-04-19T12:44:00.000Z',
            approvedAt: null,
            completedAt: null,
            resultSummary: null,
            resultPayload: null,
          },
        ],
      },
    });
    await control.acquireLease({
      runId,
      leaseId: `${runId}:lease:origin`,
      ownerId: 'runner:origin',
      acquiredAt: '2026-04-19T12:44:00.000Z',
      heartbeatAt: '2026-04-19T12:45:00.000Z',
      expiresAt: '2026-04-19T12:46:00.000Z',
    });
    await control.releaseLease({
      runId,
      leaseId: `${runId}:lease:origin`,
      releasedAt: '2026-04-19T12:45:00.000Z',
      releaseReason: 'cancelled',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:origin',
        hostId: 'host:origin',
        status: 'stale',
        startedAt: '2026-04-19T12:35:00.000Z',
        lastHeartbeatAt: '2026-04-19T12:45:00.000Z',
        expiresAt: '2026-04-19T12:45:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['default'],
        serviceAccountIds: [],
        browserCapable: true,
      }),
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        runnersControl,
        now: () => new Date('2026-04-19T12:50:00.000Z'),
      },
    );

    try {
      const runnerId = `runner:http-responses:127.0.0.1:${server.port}`;

      const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localActionControl: {
            action: 'resolve-request',
            runId,
            requestId: `${runId}:action:${runId}:step:1:1`,
            resolution: 'approved',
          },
        }),
      });
      expect(resolveResponse.status).toBe(200);

      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'resume-human-escalation',
            runId,
            note: 'resume for recovery summary local-claim audit',
          },
        }),
      });
      expect(resumeResponse.status).toBe(200);

      const recoverySummaryResponse = await fetch(
        `http://127.0.0.1:${server.port}/status?recovery=true&sourceKind=all`,
      );
      expect(recoverySummaryResponse.status).toBe(200);
      const recoverySummaryPayload = (await recoverySummaryResponse.json()) as JsonObject;
      expect(recoverySummaryPayload).toMatchObject({
        recoverySummary: {
          reclaimableRunIds: [runId],
          activeLeaseRunIds: [],
          localClaim: {
            sourceKind: 'direct',
            runnerId,
            selectedRunIds: [runId],
            blockedRunIds: [],
            notReadyRunIds: [],
            unavailableRunIds: [],
            statusByRunId: {
              [runId]: 'eligible',
            },
            reasonsByRunId: {},
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('inspects resumed operator-controlled runs against the current queried runner, not the historical paused owner', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-runtime-inspect-resumed-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'runtime_http_inspect_resumed_runner';
    await seedPausedHumanEscalationDirectRun(
      control,
      runId,
      '2026-04-19T12:00:00.000Z',
      '2026-04-19T12:05:00.000Z',
      'team-run',
    );

    const pausedRecord = await control.readRun(runId);
    if (!pausedRecord) {
      throw new Error(`expected paused run ${runId}`);
    }
    await control.persistRun({
      runId,
      expectedRevision: pausedRecord.revision,
      bundle: {
        ...pausedRecord.bundle,
        localActionRequests: [
          {
            id: `${runId}:action:${runId}:step:1:1`,
            teamRunId: runId,
            ownerStepId: `${runId}:step:1`,
            kind: 'shell',
            summary: 'Validate resumed runner inspection.',
            command: 'pnpm',
            args: ['vitest', 'run'],
            structuredPayload: {},
            notes: [],
            status: 'requested',
            createdAt: '2026-04-19T12:04:00.000Z',
            approvedAt: null,
            completedAt: null,
            resultSummary: null,
            resultPayload: null,
          },
        ],
      },
    });
    await control.acquireLease({
      runId,
      leaseId: `${runId}:lease:origin`,
      ownerId: 'runner:origin',
      acquiredAt: '2026-04-19T12:04:00.000Z',
      heartbeatAt: '2026-04-19T12:05:00.000Z',
      expiresAt: '2026-04-19T12:06:00.000Z',
    });
    await control.releaseLease({
      runId,
      leaseId: `${runId}:lease:origin`,
      releasedAt: '2026-04-19T12:05:00.000Z',
      releaseReason: 'cancelled',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:origin',
        hostId: 'host:origin',
        status: 'stale',
        startedAt: '2026-04-19T11:55:00.000Z',
        lastHeartbeatAt: '2026-04-19T12:05:00.000Z',
        expiresAt: '2026-04-19T12:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['default'],
        serviceAccountIds: [],
        browserCapable: true,
      }),
    });
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        runnersControl,
      },
    );

    try {
      const runnerId = `runner:http-responses:127.0.0.1:${server.port}`;
      const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localActionControl: {
            action: 'resolve-request',
            runId,
            requestId: `${runId}:action:${runId}:step:1:1`,
            resolution: 'approved',
          },
        }),
      });
      expect(resolveResponse.status).toBe(200);

      const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runControl: {
            action: 'resume-human-escalation',
            runId,
            note: 'resume for replacement runner inspection',
          },
        }),
      });
      expect(resumeResponse.status).toBe(200);

      const defaultInspectResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runId=${runId}`,
      );
      expect(defaultInspectResponse.status).toBe(200);
      const defaultInspectPayload = (await defaultInspectResponse.json()) as JsonObject;
      expect(defaultInspectPayload).toMatchObject({
        inspection: {
          queryRunId: runId,
          runtime: {
            runId,
            sourceKind: 'team-run',
            runStatus: 'running',
            queueProjection: {
              queueState: 'runnable',
              activeLeaseId: null,
              activeLeaseOwnerId: null,
            },
          },
          runner: null,
        },
      });

      const queriedInspectResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/runtime-runs/inspect?runId=${runId}&runnerId=${runnerId}`,
      );
      expect(queriedInspectResponse.status).toBe(200);
      const queriedInspectPayload = (await queriedInspectResponse.json()) as JsonObject;
      expect(queriedInspectPayload).toMatchObject({
        inspection: {
          queryRunId: runId,
          runtime: {
            runId,
            sourceKind: 'team-run',
            runStatus: 'running',
            queueProjection: {
              queueState: 'runnable',
              claimState: 'claimable',
              activeLeaseId: null,
              activeLeaseOwnerId: null,
              affinity: {
                status: 'eligible',
                requiredService: 'chatgpt',
                requiredRuntimeProfileId: 'default',
              },
            },
          },
          runner: {
            runnerId,
            selectedBy: 'query-runner-id',
            status: 'active',
            lastClaimedRunId: null,
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded skipped targeted-drain summary through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-operator-summary-skipped-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'status_operator_summary_skipped';
    const stepId = `${runId}:step:1`;
    const skippedAt = '2026-04-11T20:15:00.000Z';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt: '2026-04-11T20:14:00.000Z',
          updatedAt: skippedAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Read back skipped operator control.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Read back skipped operator control.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [
            {
              key: `human.resume.${stepId}`,
              value: {
                stepId,
                resumedAt: '2026-04-11T20:14:45.000Z',
                note: 'human approved retry',
                guidance: {
                  action: 'retry-with-guidance',
                },
                override: null,
              },
            },
          ],
          notes: ['run resumed but targeted drain could not claim it'],
          history: [
            createExecutionRunEvent({
              id: `${runId}:event:resume-note`,
              runId,
              stepId,
              type: 'note-added',
              createdAt: '2026-04-11T20:14:45.000Z',
              note: 'human approved retry',
              payload: {
                source: 'operator',
                action: 'resume-human-escalation',
              },
            }),
            createExecutionRunEvent({
              id: `${runId}:event:drain-run:skipped:${skippedAt}`,
              runId,
              type: 'note-added',
              createdAt: skippedAt,
              note: 'runner runner:missing-http-readback has no persisted runner record',
              payload: {
                source: 'operator',
                action: 'drain-run',
                status: 'skipped',
                skipReason: 'claim-owner-unavailable',
              },
            }),
          ],
          lastUpdatedAt: skippedAt,
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T20:14:00.000Z',
          }),
          createExecutionRunEvent({
            id: `${runId}:event:drain-run:skipped:${skippedAt}`,
            runId,
            type: 'note-added',
            createdAt: skippedAt,
            note: 'runner runner:missing-http-readback has no persisted runner record',
            payload: {
              source: 'operator',
              action: 'drain-run',
              status: 'skipped',
              skipReason: 'claim-owner-unavailable',
            },
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T20:16:00.000Z'),
      },
    );

    try {
      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as JsonObject;
      expect(rereadPayload).toMatchObject({
        id: runId,
        status: 'in_progress',
        metadata: {
          executionSummary: {
            operatorControlSummary: {
              humanEscalationResume: {
                resumedAt: '2026-04-11T20:14:45.000Z',
                note: 'human approved retry',
              },
              targetedDrain: {
                requestedAt: skippedAt,
                status: 'skipped',
                reason: 'runner runner:missing-http-readback has no persisted runner record',
                skipReason: 'claim-owner-unavailable',
              },
            },
          },
        },
      });

      const recoveryRead = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${runId}`);
      expect(recoveryRead.status).toBe(200);
      const recoveryPayload = (await recoveryRead.json()) as JsonObject;
      expect(
        requireJsonObject(
          requireJsonObject(recoveryPayload.detail, 'detail').orchestrationTimelineSummary,
          'orchestrationTimelineSummary',
        ).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'note-added',
            note: 'human approved retry',
            stepId,
          }),
          expect.objectContaining({
            type: 'note-added',
            note: 'runner runner:missing-http-readback has no persisted runner record',
            stepId: null,
          }),
        ]),
      );
    } finally {
      await server.close();
    }
  });

  it('prefers the latest operator-control summaries through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-status-operator-summary-precedence-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'status_operator_summary_precedence';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: `${runId}:team`,
          status: 'succeeded',
          createdAt: '2026-04-11T20:20:00.000Z',
          updatedAt: '2026-04-11T20:25:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Read back latest operator control summary.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: `${runId}:source:1`,
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Older paused step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'older step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T20:20:05.000Z',
            completedAt: '2026-04-11T20:21:00.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: `${runId}:source:2`,
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Later resumed step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'later step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T20:24:10.000Z',
            completedAt: '2026-04-11T20:25:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: `human.resume.${stepOneId}`,
              value: {
                stepId: stepOneId,
                resumedAt: '2026-04-11T20:21:05.000Z',
                note: 'older resume note',
                guidance: {
                  action: 'retry-with-guidance',
                },
                override: null,
              },
            },
            {
              key: `human.resume.${stepTwoId}`,
              value: {
                stepId: stepTwoId,
                resumedAt: '2026-04-11T20:24:00.000Z',
                note: 'latest resume note',
                guidance: {
                  action: 'retry-with-guidance',
                },
                override: null,
              },
            },
          ],
          notes: ['multiple operator interventions'],
          history: [
            createExecutionRunEvent({
              id: `${runId}:event:resume-note-older`,
              runId,
              stepId: stepOneId,
              type: 'note-added',
              createdAt: '2026-04-11T20:21:05.000Z',
              note: 'older resume note',
              payload: {
                source: 'operator',
                action: 'resume-human-escalation',
              },
            }),
            createExecutionRunEvent({
              id: `${runId}:event:resume-note-latest`,
              runId,
              stepId: stepTwoId,
              type: 'note-added',
              createdAt: '2026-04-11T20:24:00.000Z',
              note: 'latest resume note',
              payload: {
                source: 'operator',
                action: 'resume-human-escalation',
              },
            }),
            createExecutionRunEvent({
              id: `${runId}:event:drain-run:skipped:2026-04-11T20:21:10.000Z`,
              runId,
              type: 'note-added',
              createdAt: '2026-04-11T20:21:10.000Z',
              note: 'runner runner:missing-http-precedence has no persisted runner record',
              payload: {
                source: 'operator',
                action: 'drain-run',
                status: 'skipped',
                skipReason: 'claim-owner-unavailable',
              },
            }),
            createExecutionRunEvent({
              id: `${runId}:event:drain-run:executed:2026-04-11T20:25:00.000Z`,
              runId,
              type: 'note-added',
              createdAt: '2026-04-11T20:25:00.000Z',
              note: 'run executed through targeted host drain',
              payload: {
                source: 'operator',
                action: 'drain-run',
                status: 'executed',
                skipReason: null,
              },
            }),
          ],
          lastUpdatedAt: '2026-04-11T20:25:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T20:20:00.000Z',
          }),
          createExecutionRunEvent({
            id: `${runId}:event:drain-run:skipped:2026-04-11T20:21:10.000Z`,
            runId,
            type: 'note-added',
            createdAt: '2026-04-11T20:21:10.000Z',
            note: 'runner runner:missing-http-precedence has no persisted runner record',
            payload: {
              source: 'operator',
              action: 'drain-run',
              status: 'skipped',
              skipReason: 'claim-owner-unavailable',
            },
          }),
          createExecutionRunEvent({
            id: `${runId}:event:drain-run:executed:2026-04-11T20:25:00.000Z`,
            runId,
            type: 'note-added',
            createdAt: '2026-04-11T20:25:00.000Z',
            note: 'run executed through targeted host drain',
            payload: {
              source: 'operator',
              action: 'drain-run',
              status: 'executed',
              skipReason: null,
            },
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T20:25:30.000Z'),
      },
    );

    try {
      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as JsonObject;
      expect(rereadPayload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          executionSummary: {
            operatorControlSummary: {
              humanEscalationResume: {
                resumedAt: '2026-04-11T20:24:00.000Z',
                note: 'latest resume note',
              },
              targetedDrain: {
                requestedAt: '2026-04-11T20:25:00.000Z',
                status: 'executed',
                reason: 'run executed through targeted host drain',
                skipReason: null,
              },
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded local-action outcome summary through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const executionHost = createExecutionServiceHost({
      control,
      ownerId: 'host:test',
      now: () => '2026-04-08T12:15:00.000Z',
      executeStoredRunStep: async () => ({
        output: {
          summary: 'request one shell action',
          artifacts: [],
          structuredData: {
            localActionRequests: [
              {
                kind: 'shell',
                summary: 'Run bounded host verification',
                command: 'pnpm',
                args: ['vitest', 'run'],
              },
            ],
          },
          notes: [],
        },
      }),
      executeLocalActionRequest: async ({ request }) => ({
        status: 'executed',
        summary: `executed ${request.kind}`,
        payload: { exitCode: 0 },
      }),
    });

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T12:15:00.000Z'),
        generateResponseId: () => 'resp_local_action_1',
        executionHost,
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.2',
          input: 'Run one bounded host action.',
        }),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: 'resp_local_action_1',
        status: 'completed',
        metadata: {
          executionSummary: {
            terminalStepId: 'resp_local_action_1:step:1',
            localActionSummary: {
              ownerStepId: 'resp_local_action_1:step:1',
              generatedAt: '2026-04-08T12:15:00.000Z',
              total: 1,
              counts: {
                requested: 0,
                approved: 0,
                rejected: 0,
                executed: 1,
                failed: 0,
                cancelled: 0,
              },
              items: [
                {
                  requestId: 'resp_local_action_1:action:resp_local_action_1:step:1:1',
                  kind: 'shell',
                  status: 'executed',
                  summary: 'Run bounded host verification',
                  command: 'pnpm',
                  args: ['vitest', 'run'],
                  resultSummary: 'executed shell',
                },
              ],
            },
          },
        },
      });

      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/resp_local_action_1`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as Record<string, unknown>;
      expect(rereadPayload).toMatchObject({
        id: 'resp_local_action_1',
        status: 'completed',
        metadata: {
          executionSummary: {
            localActionSummary: {
              total: 1,
              counts: {
                executed: 1,
              },
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('prefers the terminal step local-action summary through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-local-action-terminal-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_local_action_terminal_precedence_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: `${runId}:team`,
          status: 'succeeded',
          createdAt: '2026-04-08T14:26:00.000Z',
          updatedAt: '2026-04-08T14:27:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Prefer the terminal step local action summary.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: `${runId}:source:1`,
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Older local action step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'older step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T14:26:05.000Z',
            completedAt: '2026-04-08T14:26:20.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: `${runId}:source:2`,
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Terminal local action step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'terminal step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T14:26:25.000Z',
            completedAt: '2026-04-08T14:27:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: `step.localActionOutcomes.${stepOneId}`,
              value: {
                ownerStepId: stepOneId,
                generatedAt: '2026-04-08T14:26:20.000Z',
                total: 1,
                counts: {
                  requested: 0,
                  approved: 0,
                  rejected: 0,
                  executed: 1,
                  failed: 0,
                  cancelled: 0,
                },
                items: [
                  {
                    requestId: `${runId}:action:${stepOneId}:1`,
                    kind: 'shell',
                    status: 'executed',
                    summary: 'Older shell action.',
                    command: 'pnpm',
                    args: ['vitest', 'run'],
                    resultSummary: 'older shell executed',
                  },
                ],
              },
            },
            {
              key: `step.localActionOutcomes.${stepTwoId}`,
              value: {
                ownerStepId: stepTwoId,
                generatedAt: '2026-04-08T14:27:00.000Z',
                total: 1,
                counts: {
                  requested: 0,
                  approved: 0,
                  rejected: 0,
                  executed: 1,
                  failed: 0,
                  cancelled: 0,
                },
                items: [
                  {
                    requestId: `${runId}:action:${stepTwoId}:1`,
                    kind: 'shell',
                    status: 'executed',
                    summary: 'Terminal shell action.',
                    command: 'node',
                    args: ['-e', "process.stdout.write('ok')"],
                    resultSummary: 'terminal shell executed',
                  },
                ],
              },
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T14:27:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-08T14:26:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-08T14:27:30.000Z'),
      },
    );

    try {
      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as Record<string, unknown>;
      expect(rereadPayload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          executionSummary: {
            terminalStepId: stepTwoId,
            localActionSummary: {
              ownerStepId: stepTwoId,
              generatedAt: '2026-04-08T14:27:00.000Z',
              total: 1,
              counts: {
                requested: 0,
                approved: 0,
                rejected: 0,
                executed: 1,
                failed: 0,
                cancelled: 0,
              },
              items: [
                {
                  requestId: `${runId}:action:${stepTwoId}:1`,
                  kind: 'shell',
                  status: 'executed',
                  summary: 'Terminal shell action.',
                  command: 'node',
                  args: ['-e', "process.stdout.write('ok')"],
                  resultSummary: 'terminal shell executed',
                },
              ],
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded requested-output fulfillment summary through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_requested_outputs_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_requested_outputs_1',
          taskRunSpecId: 'task_spec_requested_outputs_1',
          status: 'succeeded',
          createdAt: '2026-04-11T23:15:00.000Z',
          updatedAt: '2026-04-11T23:16:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Produce the requested outputs.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Produce the requested outputs.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'final-response',
                    label: 'final answer',
                    format: 'markdown',
                    required: true,
                    destination: 'response-body',
                  },
                  {
                    kind: 'artifact-bundle',
                    label: 'work bundle',
                    format: 'bundle',
                    required: true,
                    destination: 'artifact-store',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T23:15:10.000Z',
            completedAt: '2026-04-11T23:16:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [
            {
              id: 'artifact_bundle_1',
              kind: 'bundle',
              title: 'work bundle',
              path: '/tmp/work.zip',
              uri: null,
            },
          ],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Here is the final answer.',
                    },
                  ],
                },
                {
                  type: 'artifact',
                  id: 'artifact_bundle_1',
                  artifact_type: 'file',
                  title: 'work bundle',
                  mime_type: 'application/zip',
                  uri: 'file:///tmp/work.zip',
                  disposition: 'attachment',
                  metadata: null,
                },
              ],
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-11T23:16:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T23:15:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T23:16:00.000Z'),
      },
    );

    try {
      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as Record<string, unknown>;
      expect(rereadPayload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          executionSummary: {
            requestedOutputSummary: {
              total: 2,
              fulfilledCount: 2,
              missingRequiredCount: 0,
              items: [
                {
                  label: 'final answer',
                  kind: 'final-response',
                  format: 'markdown',
                  destination: 'response-body',
                  required: true,
                  fulfilled: true,
                  evidence: 'message',
                },
                {
                  label: 'work bundle',
                  kind: 'artifact-bundle',
                  format: 'bundle',
                  destination: 'artifact-store',
                  required: true,
                  fulfilled: true,
                  evidence: 'artifact',
                },
              ],
            },
            requestedOutputPolicy: {
              status: 'satisfied',
              message: 'all required requested outputs were fulfilled',
              missingRequiredLabels: [],
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('returns failed response readback when required requested outputs are missing', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_requested_outputs_missing_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_requested_outputs_missing_1',
          taskRunSpecId: 'task_spec_requested_outputs_missing_1',
          status: 'succeeded',
          createdAt: '2026-04-11T23:25:00.000Z',
          updatedAt: '2026-04-11T23:26:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Produce the requested outputs.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Produce the requested outputs.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'final-response',
                    label: 'final answer',
                    format: 'markdown',
                    required: true,
                    destination: 'response-body',
                  },
                  {
                    kind: 'artifact-bundle',
                    label: 'work bundle',
                    format: 'bundle',
                    required: true,
                    destination: 'artifact-store',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T23:25:10.000Z',
            completedAt: '2026-04-11T23:26:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Here is the final answer.',
                    },
                  ],
                },
              ],
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-11T23:26:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T23:25:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T23:26:00.000Z'),
      },
    );

    try {
      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as Record<string, unknown>;
      expect(rereadPayload).toMatchObject({
        id: runId,
        status: 'failed',
        metadata: {
          executionSummary: {
            requestedOutputPolicy: {
              status: 'missing-required',
              message: 'missing required requested outputs: work bundle',
              missingRequiredLabels: ['work bundle'],
            },
            failureSummary: {
              code: 'requested_output_required_missing',
              message: 'missing required requested outputs: work bundle',
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('prefers terminal step failure over requested-output fallback through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_failure_precedence_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_failure_precedence_1',
          taskRunSpecId: 'task_spec_failure_precedence_1',
          status: 'failed',
          createdAt: '2026-04-12T00:45:00.000Z',
          updatedAt: '2026-04-12T00:46:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Prefer the explicit terminal failure.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'failed',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Produce the requested outputs.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'artifact-bundle',
                    label: 'work bundle',
                    format: 'bundle',
                    required: true,
                    destination: 'artifact-store',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'failed before producing outputs',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            failure: {
              code: 'terminal_step_failed',
              message: 'terminal step failed before fulfilling outputs',
            },
            startedAt: '2026-04-12T00:45:10.000Z',
            completedAt: '2026-04-12T00:46:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'failed',
          artifacts: [],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Partial assistant output.',
                    },
                  ],
                },
              ],
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T00:46:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T00:45:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-12T00:46:00.000Z'),
      },
    );

    try {
      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as Record<string, unknown>;
      expect(rereadPayload).toMatchObject({
        id: runId,
        status: 'failed',
        metadata: {
          executionSummary: {
            requestedOutputPolicy: {
              status: 'missing-required',
              message: 'missing required requested outputs: work bundle',
              missingRequiredLabels: ['work bundle'],
            },
            failureSummary: {
              code: 'terminal_step_failed',
              message: 'terminal step failed before fulfilling outputs',
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('prefers the terminal step requested-output contract through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_requested_outputs_terminal_precedence_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_requested_outputs_terminal_precedence_1',
          taskRunSpecId: 'task_spec_requested_outputs_terminal_precedence_1',
          status: 'succeeded',
          createdAt: '2026-04-12T00:15:00.000Z',
          updatedAt: '2026-04-12T00:16:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Use the terminal step request contract.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Older step requested an artifact bundle.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'artifact-bundle',
                    label: 'older work bundle',
                    format: 'bundle',
                    required: true,
                    destination: 'artifact-store',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'older step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T00:15:10.000Z',
            completedAt: '2026-04-12T00:15:25.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Terminal step requested only the final response.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'final-response',
                    label: 'terminal answer',
                    format: 'markdown',
                    required: true,
                    destination: 'response-body',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'terminal step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-12T00:15:30.000Z',
            completedAt: '2026-04-12T00:16:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Here is the terminal answer.',
                    },
                  ],
                },
              ],
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-12T00:16:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-12T00:15:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-12T00:16:00.000Z'),
      },
    );

    try {
      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as Record<string, unknown>;
      expect(rereadPayload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          executionSummary: {
            terminalStepId: stepTwoId,
            requestedOutputSummary: {
              total: 1,
              fulfilledCount: 1,
              missingRequiredCount: 0,
              items: [
                {
                  label: 'terminal answer',
                  kind: 'final-response',
                  format: 'markdown',
                  destination: 'response-body',
                  required: true,
                  fulfilled: true,
                  evidence: 'message',
                },
              ],
            },
            requestedOutputPolicy: {
              status: 'satisfied',
              message: 'all required requested outputs were fulfilled',
              missingRequiredLabels: [],
            },
            failureSummary: null,
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('does not treat internal structured outputs as fulfilling a required structured-report request through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_requested_outputs_internal_only_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: 'team_run_requested_outputs_internal_only_1',
          taskRunSpecId: 'task_spec_requested_outputs_internal_only_1',
          status: 'succeeded',
          createdAt: '2026-04-11T23:35:00.000Z',
          updatedAt: '2026-04-11T23:36:00.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Produce the structured report.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            sourceStepId: 'team_run_requested_outputs_internal_only_1:step:1',
            agentId: 'orchestrator',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Produce the structured report.',
              handoffIds: [],
              artifacts: [],
              structuredData: {
                requestedOutputs: [
                  {
                    kind: 'structured-report',
                    label: 'report payload',
                    format: 'json',
                    required: true,
                    destination: 'response-metadata',
                  },
                ],
              },
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T23:35:10.000Z',
            completedAt: '2026-04-11T23:36:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'artifact',
                  id: 'artifact_only_output',
                  artifact_type: 'file',
                  title: 'internal-only artifact',
                  mime_type: 'application/octet-stream',
                  uri: 'file:///tmp/internal-only.bin',
                  disposition: 'attachment',
                  metadata: null,
                },
              ],
            },
            {
              key: `human.resume.${stepId}`,
              value: {
                stepId,
                resumedAt: '2026-04-11T23:35:30.000Z',
                note: 'internal operator resume record',
                guidance: {
                  action: 'retry-with-guidance',
                },
                override: null,
              },
            },
            {
              key: `step.localActionOutcomes.${stepId}`,
              value: {
                ownerStepId: stepId,
                generatedAt: '2026-04-11T23:35:45.000Z',
                total: 1,
                counts: {
                  requested: 0,
                  approved: 0,
                  rejected: 0,
                  executed: 1,
                  failed: 0,
                  cancelled: 0,
                },
                items: [
                  {
                    requestId: `${runId}:action:${stepId}:1`,
                    kind: 'shell',
                    status: 'executed',
                    summary: 'Internal local-action record.',
                    command: 'node',
                    args: ['-e', "process.stdout.write('ok')"],
                    resultSummary: 'internal shell executed',
                  },
                ],
              },
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-11T23:36:00.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T23:35:00.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T23:36:00.000Z'),
      },
    );

    try {
      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as Record<string, unknown>;
      expect(rereadPayload).toMatchObject({
        id: runId,
        status: 'failed',
        metadata: {
          executionSummary: {
            requestedOutputSummary: {
              total: 1,
              fulfilledCount: 0,
              missingRequiredCount: 1,
              items: [
                {
                  label: 'report payload',
                  kind: 'structured-report',
                  format: 'json',
                  destination: 'response-metadata',
                  required: true,
                  fulfilled: false,
                  evidence: null,
                },
              ],
            },
            requestedOutputPolicy: {
              status: 'missing-required',
              message: 'missing required requested outputs: report payload',
              missingRequiredLabels: ['report payload'],
            },
            failureSummary: {
              code: 'requested_output_required_missing',
              message: 'missing required requested outputs: report payload',
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('surfaces bounded provider usage summary through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-11T23:27:00.000Z'),
        executeStoredRunStep: async () => ({
          usage: {
            inputTokens: 70,
            outputTokens: 20,
            reasoningTokens: 3,
            totalTokens: 93,
          },
          output: {
            summary: 'usage recorded',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        }),
      },
    );

    try {
      const created = await fetch(`http://127.0.0.1:${server.port}/v1/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.2',
          input: 'Run once.',
          auracall: {
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
        }),
      });
      expect(created.status).toBe(200);
      const createdPayload = (await created.json()) as Record<string, unknown>;
      expect(createdPayload).toMatchObject({
        metadata: {
          executionSummary: {
            providerUsageSummary: {
              inputTokens: 70,
              outputTokens: 20,
              reasoningTokens: 3,
              totalTokens: 93,
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('prefers the terminal step provider-usage summary through the same responses surface', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'resp_usage_terminal_precedence_1';
    const stepOneId = `${runId}:step:1`;
    const stepTwoId = `${runId}:step:2`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'team-run',
          sourceId: `${runId}:team`,
          status: 'succeeded',
          createdAt: '2026-04-11T23:27:30.000Z',
          updatedAt: '2026-04-11T23:28:30.000Z',
          trigger: 'service',
          requestedBy: 'scheduler',
          entryPrompt: 'Prefer the terminal usage summary.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepOneId, stepTwoId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepOneId,
            runId,
            sourceStepId: `${runId}:source:1`,
            agentId: 'planner',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'analysis',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Older usage step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'older step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T23:27:35.000Z',
            completedAt: '2026-04-11T23:27:50.000Z',
          }),
          createExecutionRunStep({
            id: stepTwoId,
            runId,
            sourceStepId: `${runId}:source:2`,
            agentId: 'finisher',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'synthesis',
            status: 'succeeded',
            order: 2,
            dependsOnStepIds: [stepOneId],
            input: {
              prompt: 'Terminal usage step.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'terminal step done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-11T23:28:00.000Z',
            completedAt: '2026-04-11T23:28:30.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: `step.providerUsage.${stepOneId}`,
              value: {
                ownerStepId: stepOneId,
                generatedAt: '2026-04-11T23:27:50.000Z',
                inputTokens: 30,
                outputTokens: 8,
                reasoningTokens: 1,
                totalTokens: 39,
              },
            },
            {
              key: `step.providerUsage.${stepTwoId}`,
              value: {
                ownerStepId: stepTwoId,
                generatedAt: '2026-04-11T23:28:30.000Z',
                inputTokens: 70,
                outputTokens: 20,
                reasoningTokens: 3,
                totalTokens: 93,
              },
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-11T23:28:30.000Z',
        }),
        events: [
          createExecutionRunEvent({
            id: `${runId}:event:run-created`,
            runId,
            type: 'run-created',
            createdAt: '2026-04-11T23:27:30.000Z',
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
        now: () => new Date('2026-04-11T23:29:00.000Z'),
      },
    );

    try {
      const reread = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(reread.status).toBe(200);
      const rereadPayload = (await reread.json()) as Record<string, unknown>;
      expect(rereadPayload).toMatchObject({
        id: runId,
        status: 'completed',
        metadata: {
          executionSummary: {
            terminalStepId: stepTwoId,
            providerUsageSummary: {
              ownerStepId: stepTwoId,
              generatedAt: '2026-04-11T23:28:30.000Z',
              inputTokens: 70,
              outputTokens: 20,
              reasoningTokens: 3,
              totalTokens: 93,
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('recovers a persisted runnable direct run when startup recovery is enabled', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:00:00.000Z';
    const runId = 'resp_recover_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Recover this run.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Recover this run.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        recoverRunsOnStart: true,
      },
      { control },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        object: 'response',
        status: 'completed',
      });
    } finally {
      await server.close();
    }
  });

  it('keeps startup recovery scoped to the server local runner even when another eligible runner is fresher', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-runner-scope-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const createdAt = '2026-04-08T13:00:00.000Z';
    const runId = 'resp_recover_runner_scope_1';

    await seedPlannedDirectRun(control, runId, createdAt, 'Recover this run with server-owned runner.');
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:alternate-fresh',
        hostId: 'host:alternate',
        startedAt: '2026-04-08T12:58:00.000Z',
        lastHeartbeatAt: '2026-04-08T13:00:55.000Z',
        expiresAt: '2026-04-08T13:10:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        recoverRunsOnStart: true,
      },
      { control, runnersControl },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        object: 'response',
        status: 'completed',
      });

      const localRunnerId = `runner:http-responses:127.0.0.1:${server.port}`;
      const storedRecord = await control.readRun(runId);
      expect(storedRecord?.bundle.leases[0]).toMatchObject({
        ownerId: localRunnerId,
        status: 'released',
        releaseReason: 'completed',
      });

      const localRunner = await runnersControl.readRunner(localRunnerId);
      const alternateRunner = await runnersControl.readRunner('runner:alternate-fresh');
      expect(localRunner?.runner.lastClaimedRunId).toBe(runId);
      expect(localRunner?.runner.lastActivityAt).not.toBeNull();
      expect(alternateRunner?.runner.lastClaimedRunId).toBeNull();
      expect(alternateRunner?.runner.lastActivityAt).toBeNull();
    } finally {
      await server.close();
    }
  });

  it('recovers a persisted runnable direct run through background drain when startup recovery is disabled', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-background-drain-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:05:00.000Z';
    const runId = 'resp_background_recover_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Recover via background drain.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Recover via background drain.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        recoverRunsOnStart: false,
        backgroundDrainIntervalMs: 25,
      },
      { control },
    );

    try {
      await delay(100);
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        object: 'response',
        status: 'completed',
      });
    } finally {
      await server.close();
    }
  });

  it('recovers a persisted runnable team run when startup recovery source is team-run', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-team-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:30:00.000Z';
    const runId = 'team_recover_1';

    await seedPlannedDirectRun(control, runId, createdAt, 'Recover team run on startup', 'team-run');

    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        recoverRunsOnStart: true,
        recoverRunsOnStartSourceKind: 'team-run',
      },
      { control },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        object: 'response',
        status: 'completed',
      });
    } finally {
      await server.close();
    }
  });

  it('does not recover persisted direct runs on startup by default', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T13:10:00.000Z';
    const runId = 'resp_no_recover_1';
    const stepId = `${runId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Stay pending.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Stay pending.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${runId}`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: runId,
        object: 'response',
        status: 'in_progress',
      });
    } finally {
      await server.close();
    }
  });

  it('logs startup recovery summary when enabled', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-logs-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const executableRunId = 'resp_log_recover_1';
    const completedRunId = 'resp_log_norun_1';
    const executableStepId = `${executableRunId}:step:1`;
    const completedStepId = `${completedRunId}:step:1`;

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: executableRunId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'planned',
          createdAt: '2026-04-08T13:20:00.000Z',
          updatedAt: '2026-04-08T13:20:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Run and recover this',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${executableRunId}:state`,
          stepIds: [executableStepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: executableStepId,
            runId: executableRunId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Run and recover this',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${executableRunId}:state`,
          runId: executableRunId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T13:20:00.000Z',
        }),
        events: [],
      }),
    );

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: completedRunId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'succeeded',
          createdAt: '2026-04-08T13:21:00.000Z',
          updatedAt: '2026-04-08T13:21:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Already complete',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: `${completedRunId}:state`,
          stepIds: [completedStepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: completedStepId,
            runId: completedRunId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Already complete',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-08T13:21:00.000Z',
            completedAt: '2026-04-08T13:21:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${completedRunId}:state`,
          runId: completedRunId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-08T13:21:00.000Z',
        }),
        events: [],
      }),
    );

    const logs: string[] = [];
    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        recoverRunsOnStart: true,
        logger: (message) => {
          logs.push(message);
        },
      },
      {
        control,
      },
    );

    try {
      const startupLog = logs.find((entry) => entry.includes('Startup recovery (direct) completed'));
      expect(startupLog).toBeDefined();
      expect(startupLog).toContain(`executed=${executableRunId}`);
      expect(startupLog).toContain('scanned 2 candidate run(s)');
      expect(startupLog).toContain('skips=claim-owner-unavailable:1');
      expect(startupLog).toContain('metrics=deferred-by-budget:0, active-lease:0, stale-heartbeat:0, stranded:0, idle:0');
    } finally {
      await server.close();
    }
  });

  it('logs cap hits when startup recovery is bounded', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-cap-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();

    await Promise.all(
      ['resp_cap_1', 'resp_cap_2'].map(async (runId, index) =>
        control.createRun(
          createExecutionRunRecordBundle({
            run: createExecutionRun({
              id: runId,
              sourceKind: 'direct',
              sourceId: null,
              status: 'planned',
              createdAt: `2026-04-08T14:${20 + index}:00.000Z`,
              updatedAt: `2026-04-08T14:${20 + index}:00.000Z`,
              trigger: 'api',
              requestedBy: null,
              entryPrompt: `Run ${index + 1}`,
              initialInputs: {
                model: 'gpt-5.2',
                runtimeProfile: 'default',
                service: 'chatgpt',
              },
              sharedStateId: `${runId}:state`,
              stepIds: [`${runId}:step:1`],
              policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
            }),
            steps: [
              createExecutionRunStep({
                id: `${runId}:step:1`,
                runId,
                agentId: 'api-responses',
                runtimeProfileId: 'default',
                browserProfileId: null,
                service: 'chatgpt',
                kind: 'prompt',
                status: 'runnable',
                order: 1,
                dependsOnStepIds: [],
                input: {
                  prompt: `Run ${index + 1}`,
                  handoffIds: [],
                  artifacts: [],
                  structuredData: {},
                  notes: [],
                },
              }),
            ],
            sharedState: createExecutionRunSharedState({
              id: `${runId}:state`,
              runId,
              status: 'active',
              artifacts: [],
              structuredOutputs: [],
              notes: [],
              history: [],
              lastUpdatedAt: `2026-04-08T14:${20 + index}:00.000Z`,
            }),
            events: [],
          }),
        ),
      ),
    );

    const logs: string[] = [];
    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        recoverRunsOnStart: true,
        recoverRunsOnStartMaxRuns: 1,
        logger: (message) => {
          logs.push(message);
        },
      },
      {
        control,
      },
    );

    try {
      const startupLog = logs.find((entry) => entry.includes('Startup recovery (direct) completed'));
      expect(startupLog).toBeDefined();
      expect(startupLog).toContain('cap=1 hits reached');
      expect(startupLog).toContain('scanned 2 candidate run(s)');
      expect(startupLog).toContain('limit-reached:1');
      expect(startupLog).toContain('metrics=deferred-by-budget:1, active-lease:0, stale-heartbeat:0, stranded:0, idle:0');
      expect(startupLog).toContain('1 executed');
    } finally {
      await server.close();
    }
  });

  it('logs bounded stale-heartbeat attention when startup recovery leaves inspect-only leases unrepaired', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-attention-log-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'resp_attention_stale', '2026-04-08T14:40:00.000Z', 'Inspect only stale heartbeat');
    await control.acquireLease({
      runId: 'resp_attention_stale',
      leaseId: 'resp_attention_stale:lease:1',
      ownerId: 'runner:missing-attention',
      acquiredAt: '2026-04-08T14:40:00.000Z',
      heartbeatAt: '2026-04-08T14:40:00.000Z',
      expiresAt: '2026-04-08T14:50:00.000Z',
    });

    const logs: string[] = [];
    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        recoverRunsOnStart: true,
        logger: (message) => {
          logs.push(message);
        },
      },
      {
        control,
        now: () => new Date('2026-04-08T14:45:00.000Z'),
      },
    );

    try {
      const startupLog = logs.find((entry) => entry.includes('Startup recovery (direct) completed'));
      expect(startupLog).toBeDefined();
      expect(startupLog).toContain('skips=stale-heartbeat:1');
      expect(startupLog).toContain('attention=stale-heartbeat-inspect-only:1');
    } finally {
      await server.close();
    }
  });

  it('logs bounded suspiciously-idle attention when startup recovery sees idle active leases', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-recovery-idle-attention-log-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    await seedPlannedDirectRun(
      control,
      'resp_attention_idle',
      '2026-04-08T14:40:00.000Z',
      'Inspect suspicious idle lease',
    );
    await control.acquireLease({
      runId: 'resp_attention_idle',
      leaseId: 'resp_attention_idle:lease:1',
      ownerId: 'runner:idle-attention',
      acquiredAt: '2026-04-08T14:40:00.000Z',
      heartbeatAt: '2026-04-08T14:44:55.000Z',
      expiresAt: '2026-04-08T14:50:00.000Z',
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:idle-attention',
        hostId: 'host:http-responses:127.0.0.1:8080',
        startedAt: '2026-04-08T14:30:00.000Z',
        lastHeartbeatAt: '2026-04-08T14:44:55.000Z',
        expiresAt: '2026-04-08T14:50:00.000Z',
        lastActivityAt: '2026-04-08T14:39:00.000Z',
        lastClaimedRunId: 'run_before_idle_attention',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const logs: string[] = [];
    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        recoverRunsOnStart: true,
        logger: (message) => {
          logs.push(message);
        },
      },
      {
        control,
        runnersControl,
        now: () => new Date('2026-04-08T14:45:00.000Z'),
      },
    );

    try {
      const startupLog = logs.find((entry) => entry.includes('Startup recovery (direct) completed'));
      expect(startupLog).toBeDefined();
      expect(startupLog).toContain('skips=active-lease:1');
      expect(startupLog).toContain('attention=suspiciously-idle:1');
    } finally {
      await server.close();
    }
  });

  it('enables startup recovery by default for serveResponsesHttp', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-serve-default-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'serve_recover_default';
    await seedPlannedDirectRun(control, runId, '2026-04-08T15:00:00.000Z', 'Recover by default');

    const logs: string[] = [];
    await terminateServeResponsesHttp({
      host: '127.0.0.1',
      port: 0,
      logger: (message) => logs.push(message),
    });

    const startupLog = logs.find((entry) => entry.includes('Startup recovery (direct) completed'));
    expect(startupLog).toBeDefined();
    expect(startupLog).toContain(`executed=${runId}`);
  });

  it('respects startup recovery opt-out and cap from serveResponsesHttp', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-serve-opts-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await Promise.all([
      seedPlannedDirectRun(control, 'serve_recover_1', '2026-04-08T15:10:00.000Z', 'Recover this one'),
      seedPlannedDirectRun(control, 'serve_recover_2', '2026-04-08T15:11:00.000Z', 'Recover this one too'),
      seedPlannedDirectRun(control, 'serve_recover_3', '2026-04-08T15:12:00.000Z', 'Also recover'),
    ]);

    const logs: string[] = [];
    await terminateServeResponsesHttp({
      host: '127.0.0.1',
      port: 0,
      recoverRunsOnStart: false,
      recoverRunsOnStartMaxRuns: 1,
      logger: (message) => logs.push(message),
    });

    const startupLog = logs.find((entry) => entry.includes('Startup recovery (direct) completed'));
    expect(startupLog).toBeUndefined();

    const capLog = logs.find((entry) => entry.includes('scanned 3 candidate run(s)'));
    expect(capLog).toBeUndefined();
  });

  it('resolves cli-selected runtime profile before serving media generations', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-serve-profile-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    await fs.writeFile(
      path.join(homeDir, 'config.json'),
      JSON.stringify({
        version: 3,
        model: 'gpt-5.2',
        defaultRuntimeProfile: 'default',
        browser: {},
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            defaultService: 'chatgpt',
          },
          work: {
            browserProfile: 'default',
            defaultService: 'gemini',
          },
        },
      }),
    );

    const logs: string[] = [];
    let resolvePort: (port: number) => void = () => {};
    const portPromise = new Promise<number>((resolve) => {
      resolvePort = resolve;
    });
    const servePromise = serveResponsesHttp({
      host: '127.0.0.1',
      port: 0,
      cliOptions: { profile: 'work' },
      recoverRunsOnStart: false,
      logger: (message) => {
        logs.push(message);
        const match = /AuraCall responses server bound on 127\.0\.0\.1:(\d+)/.exec(message);
        if (match) {
          resolvePort(Number(match[1]));
        }
      },
      mediaGenerationExecutor: async () => ({
        model: 'fake-gemini-image',
        artifacts: [],
      }),
    });

    try {
      const port = await portPromise;
      const response = await fetch(`http://127.0.0.1:${port}/v1/media-generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          mediaType: 'image',
          prompt: 'Generate an image of an asphalt secret agent',
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        object: 'media_generation',
        status: 'succeeded',
        metadata: {
          runtimeProfile: 'work',
        },
      });
      expect(logs).toContain('Active AuraCall runtime profile: work');
    } finally {
      process.emit('SIGINT');
      await servePromise;
    }
  });

  it('forwards startup recovery cap to serveResponsesHttp', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-serve-cap-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await Promise.all([
      seedPlannedDirectRun(control, 'serve_cap_1', '2026-04-08T15:20:00.000Z', 'Recover run 1'),
      seedPlannedDirectRun(control, 'serve_cap_2', '2026-04-08T15:21:00.000Z', 'Recover run 2'),
      seedPlannedDirectRun(control, 'serve_cap_3', '2026-04-08T15:22:00.000Z', 'Recover run 3'),
    ]);

    const logs: string[] = [];
    await terminateServeResponsesHttp({
      host: '127.0.0.1',
      port: 0,
      recoverRunsOnStartMaxRuns: 1,
      logger: (message) => logs.push(message),
    });

    const startupLog = logs.find((entry) => entry.includes('Startup recovery (direct) completed'));
    expect(startupLog).toBeDefined();
    expect(startupLog).toContain('cap=1 hits reached');
    expect(startupLog).toContain('1 executed');
  });

  it('forwards team-run startup recovery source filter to serveResponsesHttp', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-serve-team-source-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'serve_team_filter_direct', '2026-04-08T15:30:00.000Z', 'Direct should not recover');
    await seedPlannedDirectRun(
      control,
      'serve_team_filter_team',
      '2026-04-08T15:31:00.000Z',
      'Team should recover',
      'team-run',
    );

    const logs: string[] = [];
    await terminateServeResponsesHttp({
      host: '127.0.0.1',
      port: 0,
      recoverRunsOnStartSourceKind: 'team-run',
      logger: (message) => logs.push(message),
    });

    const startupLog = logs.find((entry) => entry.includes('Startup recovery (team-run) completed'));
    expect(startupLog).toBeDefined();
    expect(startupLog).toContain('executed=serve_team_filter_team');
    expect(startupLog).not.toContain('serve_team_filter_direct');
  });

  it('forwards all-source startup recovery filter to serveResponsesHttp', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-serve-all-source-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'serve_all_filter_direct', '2026-04-08T15:40:00.000Z', 'Direct should recover');
    await seedPlannedDirectRun(
      control,
      'serve_all_filter_team',
      '2026-04-08T15:41:00.000Z',
      'Team should also recover',
      'team-run',
    );

    const logs: string[] = [];
    await terminateServeResponsesHttp({
      host: '127.0.0.1',
      port: 0,
      recoverRunsOnStartSourceKind: 'all',
      logger: (message) => logs.push(message),
    });

    const startupLog = logs.find((entry) => entry.includes('Startup recovery (all) completed'));
    expect(startupLog).toBeDefined();
    expect(startupLog).toContain('executed=serve_all_filter_direct,serve_all_filter_team');
    expect(startupLog).toContain('scanned 2 candidate run(s)');
  });

  it('applies startup recovery cap after widening serveResponsesHttp scope to all sources', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-serve-all-cap-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await seedPlannedDirectRun(control, 'serve_all_cap_direct_1', '2026-04-08T15:50:00.000Z', 'Recover direct 1');
    await seedPlannedDirectRun(
      control,
      'serve_all_cap_team_1',
      '2026-04-08T15:51:00.000Z',
      'Recover team 1',
      'team-run',
    );
    await seedPlannedDirectRun(control, 'serve_all_cap_direct_2', '2026-04-08T15:52:00.000Z', 'Defer one by cap');

    const logs: string[] = [];
    await terminateServeResponsesHttp({
      host: '127.0.0.1',
      port: 0,
      recoverRunsOnStartSourceKind: 'all',
      recoverRunsOnStartMaxRuns: 2,
      logger: (message) => logs.push(message),
    });

    const startupLog = logs.find((entry) => entry.includes('Startup recovery (all) completed'));
    expect(startupLog).toBeDefined();
    expect(startupLog).toContain('scanned 3 candidate run(s)');
    expect(startupLog).toContain('cap=2 hits reached');
    expect(startupLog).toContain('2 executed');
    expect(startupLog).toContain('executed=serve_all_cap_direct_1,serve_all_cap_team_1');
    expect(startupLog).toContain('limit-reached:1');
  });

  it('preserves structured mixed output when a stored run exposes response.output', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const createdAt = '2026-04-08T12:00:00.000Z';
    const stepId = 'resp_seeded_1:step:1';
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'resp_seeded_1',
          sourceKind: 'direct',
          sourceId: null,
          status: 'succeeded',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Seeded output',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          sharedStateId: 'resp_seeded_1:state',
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId: 'resp_seeded_1',
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            input: {
              prompt: 'Seeded output',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'done',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: createdAt,
            completedAt: createdAt,
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'resp_seeded_1:state',
          runId: 'resp_seeded_1',
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [
            {
              key: 'response.output',
              value: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'I created a plan and a canvas.' }],
                },
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'not_output_text', text: 'drop malformed content part' }],
                },
                'drop malformed output item',
                {
                  type: 'artifact',
                  id: 'art_seeded_1',
                  artifact_type: 'canvas',
                  title: 'Seeded Canvas',
                  mime_type: 'text/plain',
                  uri: 'gemini://canvas/seeded',
                  disposition: 'inline',
                },
              ],
            },
          ],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [
          createExecutionRunEvent({
            id: 'resp_seeded_1:event:run-created',
            runId: 'resp_seeded_1',
            type: 'run-created',
            createdAt,
          }),
        ],
      }),
    );

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses/resp_seeded_1`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: 'resp_seeded_1',
        object: 'response',
        status: 'completed',
        model: 'gpt-5.2',
        metadata: {
          runId: 'resp_seeded_1',
          runtimeProfile: 'default',
          service: 'chatgpt',
        },
      });
      expect(payload.output).toEqual([
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'I created a plan and a canvas.' }],
        },
        {
          type: 'artifact',
          id: 'art_seeded_1',
          artifact_type: 'canvas',
          title: 'Seeded Canvas',
          mime_type: 'text/plain',
          uri: 'gemini://canvas/seeded',
          disposition: 'inline',
        },
      ]);
      expect(payload).not.toHaveProperty('output.0.executionSummary');
      expect(payload).not.toHaveProperty('output.0.runtimeProfile');
      expect(payload).not.toHaveProperty('output.0.service');
      expect(payload).not.toHaveProperty('output.1.executionSummary');
      expect(payload).not.toHaveProperty('output.1.taskRunSpecId');
    } finally {
      await server.close();
    }
  });

  it('lists the bounded model catalog', async () => {
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/models`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { object: string; data: Array<{ id: string }> };
      expect(payload.object).toBe('list');
      expect(payload.data.some((entry) => entry.id === 'gpt-5.2')).toBe(true);
      expect(payload.data.some((entry) => entry.id === 'gemini-3-pro')).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('reports development-only posture through the status endpoint', async () => {
    const server = await createResponsesHttpServer(
      {
        host: '127.0.0.1',
        port: 0,
        dashboardUrl: 'http://auracall.localhost/ops/browser',
        publicDashboardUrl: 'https://auracall.ecochran.dyndns.org/ops/browser',
      },
      {
        accountMirrorCompletionService: {
          start: vi.fn(),
          read: vi.fn(() => null),
          list: vi.fn(() => []),
          control: vi.fn(() => null),
        },
      },
    );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, unknown>;
      expect(payload).toMatchObject({
        object: 'status',
        ok: true,
        mode: 'development',
        binding: {
          host: '127.0.0.1',
          localOnly: true,
          unauthenticated: true,
        },
        compatibility: {
          openai: true,
          chatCompletions: false,
          streaming: false,
          auth: false,
        },
        executionHints: {
          bodyObject: 'auracall',
        },
        liveFollow: {
          severity: 'attention-needed',
          schedulerPosture: 'disabled',
        },
      });
      expect((payload.routes as Record<string, unknown>).operatorBrowserDashboard).toBe('/ops/browser');
      expect((payload.routes as Record<string, unknown>).accountMirrorDashboard).toBe('/account-mirror');
      expect((payload.routes as Record<string, unknown>).accountMirrorCatalogItemTemplate).toContain(
        '/v1/account-mirrors/catalog/items/{item_id}',
      );
      expect((payload.routes as Record<string, unknown>).operatorBrowserDashboardUrl).toBe(
        'http://auracall.localhost/ops/browser',
      );
      expect((payload.routes as Record<string, unknown>).publicOperatorBrowserDashboardUrl).toBe(
        'https://auracall.ecochran.dyndns.org/ops/browser',
      );
    } finally {
      await server.close();
    }
  });

  it('serves a read-only browser operator dashboard', async () => {
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/ops/browser`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('cache-control')).toContain('no-store');
      const html = await response.text();
      expect(html).toContain('AuraCall Browser Ops');
      expect(html).toContain('aria-label="AuraCall sections"');
      expect(html).toContain('Account Mirror');
      expect(html).toContain('href="/account-mirror"');
      expect(html).toContain('Agents / Teams');
      expect(html).toContain('<h2>Operations</h2>');
      expect(html).toContain('opsControls');
      expect(html).toContain('opsControlNotice');
      expect(html).toContain('backgroundDrainControls');
      expect(html).toContain('pauseBackgroundDrain');
      expect(html).toContain('resumeBackgroundDrain');
      expect(html).toContain('mirrorSchedulerControls');
      expect(html).toContain('runMirrorScheduler');
      expect(html).toContain('dryRunMirrorScheduler');
      expect(html).toContain('pauseMirrorScheduler');
      expect(html).toContain('resumeMirrorScheduler');
      expect(html).toContain('renderOpsControls');
      expect(html).toContain('controlBackgroundDrain');
      expect(html).toContain('controlMirrorScheduler');
      expect(html).toContain('postStatusControl');
      expect(html).toContain('backgroundDrain: { action }');
      expect(html).toContain('accountMirrorScheduler: { action }');
      expect(html).toContain('/v1/workbench-capabilities');
      expect(html).toContain('diagnostics=browser-state');
      expect(html).toContain('/v1/runs/{run_id}/status');
      expect(html).toContain('Probe Browser State');
      expect(html).toContain('mirrorCatalogProvider');
      expect(html).toContain('mirrorCatalogRuntimeProfile');
      expect(html).toContain('mirrorCatalogKind');
      expect(html).toContain('mirrorCatalogSearch');
      expect(html).toContain('mirrorCatalogWithTranscriptOnly');
      expect(html).toContain('mirrorCatalogLimit');
      expect(html).toContain('loadMirrorCatalog');
      expect(html).toContain('Search Cache');
      expect(html).toContain('mirrorCatalogSummary');
      expect(html).toContain('mirrorCatalogResults');
      expect(html).toContain('mirrorCatalogDetail');
      expect(html).toContain('mirrorCatalogDetailView');
      expect(html).toContain('mirrorCatalogDetailRaw');
      expect(html).toContain('mirrorCatalogRaw');
      expect(html).toContain('/v1/account-mirrors/catalog');
      expect(html).toContain('/v1/account-mirrors/catalog/items/');
      expect(html).toContain('buildMirrorCatalogPath');
      expect(html).toContain('buildMirrorCatalogItemPath');
      expect(html).toContain('initializeMirrorCatalogFiltersFromUrl');
      expect(html).toContain('updateMirrorCatalogUrl');
      expect(html).toContain('window.history.replaceState');
      expect(html).toContain('flattenMirrorCatalogEntries');
      expect(html).toContain('filterMirrorCatalogRows');
      expect(html).toContain('renderMirrorCatalogTable');
      expect(html).toContain('mirrorCatalogItems');
      expect(html).toContain('Transcript');
      expect(html).toContain('renderCatalogTranscriptBadge');
      expect(html).toContain('formatCatalogTranscriptStatus');
      expect(html).toContain('hasCachedCatalogTranscript');
      expect(html).toContain('hasCachedTranscript');
      expect(html).toContain('messageCount');
      expect(html).toContain('withTranscript');
      expect(html).toContain('data-catalog-row-index');
      expect(html).toContain('data-catalog-item-path');
      expect(html).toContain('showMirrorCatalogDetailByIndex');
      expect(html).toContain('showMirrorCatalogDetailByPath');
      expect(html).toContain('renderConversationDetailView');
      expect(html).toContain('renderConversationRelatedItems');
      expect(html).toContain('renderConversationRelatedLink');
      expect(html).toContain('buildRelatedCatalogItemPath');
      expect(html).toContain('data-related-item-path');
      expect(html).toContain('Cached related items');
      expect(html).toContain('target="_blank" rel="noreferrer"');
      expect(html).toContain('renderCachedAssetDetailView');
      expect(html).toContain('renderCatalogItemInspectorFields');
      expect(html).toContain('renderCatalogItemExternalLinks');
      expect(html).toContain('renderCatalogExternalLink');
      expect(html).toContain('Cached item inspector');
      expect(html).toContain('Cached URLs');
      expect(html).toContain('renderCatalogItemPreview');
      expect(html).toContain('resolveCatalogItemPreview');
      expect(html).toContain('buildCatalogItemAssetPath');
      expect(html).toContain('readCatalogPreviewUrl');
      expect(html).toContain('isSafePreviewUrl');
      expect(html).toContain('Cached preview');
      expect(html).toContain('asset-preview');
      expect(html).toContain('/asset?');
      expect(html).toContain('assetStorageRelpath');
      expect(html).toContain('storageRelpath');
      expect(html).toContain('formatCatalogItemSize');
      expect(html).toContain('extractConversationTurns');
      expect(html).toContain('renderChatTurn');
      expect(html).toContain('downloadCurrentMirrorConversationTranscript');
      expect(html).toContain('renderConversationTranscriptMarkdown');
      expect(html).toContain('formatTranscriptFilename');
      expect(html).toContain('Download Transcript.md');
      expect(html).toContain('text/markdown');
      expect(html).toContain('mirrorConversationTranscriptSearch');
      expect(html).toContain('filterCurrentMirrorConversationTranscript');
      expect(html).toContain('clearCurrentMirrorConversationTranscriptSearch');
      expect(html).toContain('normalizeTranscriptSearchTerm');
      expect(html).toContain('Search cached transcript');
      expect(html).toContain('turn.textContent');
      expect(html).toContain('chat-transcript');
      expect(html).toContain('chat-bubble');
      expect(html).toContain('Catalog reads are cache-only');
      expect(html).toContain('Mirror Live Follow');
      expect(html).toContain('mirrorTargetTable');
      expect(html).toContain('mirrorTargetAccounts');
      expect(html).toContain('mirrorAttentionQueue');
      expect(html).toContain('mirrorAttentionItems');
      expect(html).toContain('mirrorActiveCompletionTable');
      expect(html).toContain('mirrorActiveCompletions');
      expect(html).toContain('inspectMirrorCompletion');
      expect(html).toContain('inspectMirrorCompletionById');
      expect(html).toContain('inspectSelectedMirrorCompletion');
      expect(html).toContain('/v1/account-mirrors/completions/');
      expect(html).toContain('mirrorTargets');
      expect(html).toContain('mirrorCompletions');
      expect(html).toContain('mirrorControlNotice');
      expect(html).toContain('setMirrorControlNotice');
      expect(html).toContain('Live Follow Severity');
      expect(html).toContain('Live Follow Targets');
      expect(html).toContain('Next Live-Follow Attempt');
      expect(html).toContain('Routine Crawl Eligible');
      expect(html).toContain('Next Completion Attempt');
      expect(html).toContain("target.activeCompletionNextAttemptAt || 'none'");
      expect(html).toContain("target.routineEligibleAt || 'none'");
      expect(html).not.toContain('Next Wake');
      expect(html).toContain('Desired vs Actual');
      expect(html).toContain('Completion Records');
      expect(html).toContain('formatTargetHealth');
      expect(html).toContain('formatDesiredActualHealth');
      expect(html).toContain('formatCompletionHistory');
      expect(html).toContain('class="badges"');
      expect(html).toContain('badge-bad');
      expect(html).toContain('badge-warn');
      expect(html).toContain('renderBadge');
      expect(html).toContain('renderLiveFollowTargetTable');
      expect(html).toContain('renderAttentionQueue');
      expect(html).toContain('collectAttentionRows');
      expect(html).toContain('renderActiveCompletionTable');
      expect(html).toContain('fillMirrorCompletionId');
      expect(html).toContain('data-completion-id');
      expect(html).toContain('controlMirrorCompletionById');
      expect(html).toContain('data-completion-action');
      expect(html).toContain('completionActionsForStatus');
      expect(html).toContain("status === 'paused'");
      expect(html).toContain('formatMetadataCounts');
      expect(html).toContain('escapeHtml');
      expect(html).toContain('status.liveFollow');
      expect(html).toContain('status.liveFollow.targets');
      expect(html).toContain('severity-attention-needed');
      expect(html).toContain('mirrorCompletionId');
      expect(html).toContain('pauseMirrorCompletion');
      expect(html).toContain("fetch('/status'");
      expect(html).toContain('accountMirrorCompletion: { id, action }');
    } finally {
      await server.close();
    }
  });

  it('serves the browser operator dashboard from the dashboard alias', async () => {
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/dashboard`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('AuraCall Browser Ops');
    } finally {
      await server.close();
    }
  });

  it('serves a read-only account mirror dashboard page', async () => {
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/account-mirror?provider=chatgpt&search=library`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('cache-control')).toContain('no-store');
      const html = await response.text();
      expect(html).toContain('AuraCall Account Mirror');
      expect(html).toContain('href="/account-mirror" aria-current="page"');
      expect(html).toContain('href="/ops/browser"');
      expect(html).toContain('mirrorCatalogProvider');
      expect(html).toContain('initializeMirrorCatalogFiltersFromUrl');
      expect(html).toContain('showMirrorCatalogDetailByIndex');
      expect(html).toContain('showMirrorCatalogDetailByPath');
      expect(html).toContain('renderConversationDetailView');
      expect(html).toContain('downloadCurrentMirrorConversationTranscript');
      expect(html).toContain('filterCurrentMirrorConversationTranscript');
      expect(html).toContain('renderConversationRelatedItems');
      expect(html).toContain('renderCachedAssetDetailView');
      expect(html).toContain('renderCatalogItemPreview');
      expect(html).toContain('buildCatalogItemAssetPath');
      expect(html).toContain('renderCatalogTranscriptBadge');
      expect(html).toContain('mirrorCatalogWithTranscriptOnly');
      expect(html).toContain('/v1/account-mirrors/catalog');
      expect(html).toContain('/v1/account-mirrors/catalog/items/');
    } finally {
      await server.close();
    }
  });

  it('refuses non-loopback bind unless explicitly allowed', () => {
    expect(() => assertResponsesHostAllowed('0.0.0.0', false)).toThrow(/--listen-public/);
    expect(() => assertResponsesHostAllowed('127.0.0.1', false)).not.toThrow();
    expect(() => assertResponsesHostAllowed('0.0.0.0', true)).not.toThrow();
  });

  it('preserves ChatGPT Deep Research review evidence through generic HTTP run status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-deep-research-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const control = createExecutionRuntimeControl();
    const fixture = createChatgptDeepResearchStatusFixture({
      screenshotPath: path.join(homeDir, 'diagnostics', 'chatgpt-deep-research', 'review.png'),
    });
    await control.createRun(fixture.bundle);

    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        control,
      },
    );
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/runs/${fixture.runId}/status`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        id: fixture.runId,
        object: 'auracall_run_status',
        kind: 'response',
        status: 'completed',
        metadata: {
          browserRunSummary: {
            ownerStepId: fixture.stepId,
            tabUrl: fixture.conversationUrl,
            chatgptDeepResearchStage: 'plan-edit-opened',
            chatgptDeepResearchPlanAction: 'edit',
            chatgptDeepResearchModifyPlanLabel: 'Update',
            chatgptDeepResearchReviewEvidence: {
              editTargetKind: 'iframe-coordinate',
              screenshotPath: fixture.screenshotPath,
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });
});
