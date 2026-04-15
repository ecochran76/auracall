import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { acquireLiveTestLock, releaseLiveTestLock } from './liveLock.js';
import { enqueueLiveConversationCleanup } from './liveConversationCleanup.js';
import { createExecutionRuntimeControl } from '../../src/runtime/control.js';
import { createExecutionServiceHost } from '../../src/runtime/serviceHost.js';
import { createResponsesHttpServer } from '../../src/http/responsesServer.js';
import { createConfiguredStoredStepExecutor } from '../../src/runtime/configuredExecutor.js';
import { resolveConfig } from '../../src/schema/resolver.js';

const execFileAsync = promisify(execFile);
// Stable baseline: default AURACALL_LIVE_TEST=1 covers the Grok solo, two-step,
// and multi-agent cases in this file. Operator/tooling cases below stay opt-in
// extended-matrix coverage behind their dedicated env gates.
const LIVE = process.env.AURACALL_LIVE_TEST === '1';
const TOOLING_LIVE = process.env.AURACALL_TOOLING_LIVE_TEST === '1';
const APPROVAL_LIVE = process.env.AURACALL_APPROVAL_LIVE_TEST === '1';
const REJECTION_LIVE = process.env.AURACALL_REJECTION_LIVE_TEST === '1';
const CANCELLATION_LIVE = process.env.AURACALL_CANCELLATION_LIVE_TEST === '1';
const TSX_BIN = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_ENTRY = path.join(process.cwd(), 'bin', 'auracall.ts');
const SMOKE_TOKEN = 'AURACALL_TEAM_LIVE_SMOKE_OK';
const TWO_STEP_SMOKE_TOKEN = 'AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK';
const MULTI_AGENT_SMOKE_TOKEN = 'AURACALL_MULTI_AGENT_LIVE_SMOKE_OK';
const TOOL_TEAM_SMOKE_TOKEN = 'AURACALL_TOOL_TEAM_LIVE_SMOKE_OK';
const APPROVAL_TEAM_SMOKE_TOKEN = 'AURACALL_TEAM_APPROVAL_LIVE_SMOKE_OK';
const REJECTION_TEAM_SMOKE_TOKEN = 'AURACALL_TEAM_REJECTION_LIVE_SMOKE_OK';
const CANCELLATION_TEAM_SMOKE_TOKEN = 'AURACALL_TEAM_CANCELLATION_LIVE_SMOKE_OK';

type TeamRunLivePayload = {
  taskRunSpec: {
    id: string;
    teamId: string;
  };
  execution: {
    teamId: string;
    taskRunSpecId: string;
    runtimeRunId: string;
    runtimeSourceKind: string;
    runtimeRunStatus: string;
    terminalStepCount: number;
    finalOutputSummary: string | null;
    sharedStateNotes: string[];
    stepSummaries: Array<{
      teamStepOrder: number;
      teamStepStatus: string | null;
      runtimeStepStatus: string | null;
      runtimeProfileId: string | null;
      browserProfileId: string | null;
      service: string | null;
    }>;
  };
};

function hasDisplay(): boolean {
  const display = process.env.DISPLAY;
  return typeof display === 'string' && display.trim().length > 0;
}

async function runTeamSmoke(input: {
  teamId: string;
  smokeToken: string;
  title: string;
  maxTurns: number;
  objective?: string;
  promptAppend?: string;
  extraArgs?: string[];
}): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      input.teamId,
      input.objective ?? `Reply exactly with: ${input.smokeToken}`,
      '--title',
      input.title,
      '--prompt-append',
      input.promptAppend ?? `Do not use tools. Reply with exactly ${input.smokeToken} and nothing else.`,
      '--max-turns',
      String(input.maxTurns),
      '--json',
      ...(input.extraArgs ?? []),
    ],
    {
      env: {
        ...process.env,
        // biome-ignore lint/style/useNamingConvention: env var name
        ORACLE_NO_BANNER: '1',
        // biome-ignore lint/style/useNamingConvention: env var name
        NODE_NO_WARNINGS: '1',
      },
      timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function assertStoredReadbacks(input: {
  payload: TeamRunLivePayload;
  expectedTimelineSucceededCount: number;
  expectedHandoffConsumedCount?: number;
  expectedExecutedLocalActionCommand?: string;
}) {
  const control = createExecutionRuntimeControl();
  const host = createExecutionServiceHost({
    control,
    ownerId: 'live-test:grok-team',
  });
  const detail = await host.readRecoveryDetail(input.payload.execution.runtimeRunId);

  expect(detail).not.toBeNull();
  expect(detail).toMatchObject({
    runId: input.payload.execution.runtimeRunId,
    sourceKind: 'team-run',
    taskRunSpecId: input.payload.taskRunSpec.id,
  });
  expect(detail?.orchestrationTimelineSummary).not.toBeNull();
  expect(detail?.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
  expect(
    detail?.orchestrationTimelineSummary?.items.filter((item) => item.type === 'step-succeeded').length ?? 0,
  ).toBeGreaterThanOrEqual(input.expectedTimelineSucceededCount);
  if (typeof input.expectedHandoffConsumedCount === 'number') {
    expect(
      detail?.orchestrationTimelineSummary?.items.filter((item) => item.type === 'handoff-consumed').length ?? 0,
    ).toBeGreaterThanOrEqual(input.expectedHandoffConsumedCount);
  }

  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    { control },
  );
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${input.payload.execution.runtimeRunId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{ type: string | null }>;
        } | null;
      };
    };
    expect(body.object).toBe('recovery_detail');
    expect(body.detail).toMatchObject({
      runId: input.payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: input.payload.taskRunSpec.id,
    });
    expect(body.detail.orchestrationTimelineSummary).not.toBeNull();
    expect(body.detail.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
    expect(
      body.detail.orchestrationTimelineSummary?.items.filter((item) => item.type === 'step-succeeded').length ?? 0,
    ).toBeGreaterThanOrEqual(input.expectedTimelineSucceededCount);
    if (typeof input.expectedHandoffConsumedCount === 'number') {
      expect(
        body.detail.orchestrationTimelineSummary?.items.filter((item) => item.type === 'handoff-consumed').length ?? 0,
      ).toBeGreaterThanOrEqual(input.expectedHandoffConsumedCount);
    }

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${input.payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        service?: string | null;
        runtimeProfile?: string | null;
        executionSummary?: {
          localActionSummary?: {
            counts?: {
              executed?: number | null;
            } | null;
            items?: Array<{
              command?: string | null;
              status?: string | null;
            }>;
          } | null;
          orchestrationTimelineSummary?: {
            total: number;
            items: Array<{ type: string | null }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: input.payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: input.payload.execution.runtimeRunId,
        taskRunSpecId: input.payload.taskRunSpec.id,
        service: 'grok',
        runtimeProfile: 'auracall-grok-auto',
      },
    });
    expect(responseBody.metadata?.executionSummary?.orchestrationTimelineSummary).not.toBeNull();
    expect(responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
    expect(
      responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.items.filter(
        (item) => item.type === 'step-succeeded',
      ).length ?? 0,
    ).toBeGreaterThanOrEqual(input.expectedTimelineSucceededCount);
    if (typeof input.expectedHandoffConsumedCount === 'number') {
      expect(
        responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.items.filter(
          (item) => item.type === 'handoff-consumed',
        ).length ?? 0,
      ).toBeGreaterThanOrEqual(input.expectedHandoffConsumedCount);
    }
    if (typeof input.expectedExecutedLocalActionCommand === 'string') {
      expect(responseBody.metadata?.executionSummary?.localActionSummary).not.toBeNull();
      expect(responseBody.metadata?.executionSummary?.localActionSummary?.counts?.executed ?? 0).toBeGreaterThanOrEqual(1);
      expect(
        responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
          (item) =>
            item.command === input.expectedExecutedLocalActionCommand &&
            item.status === 'executed',
        ) ?? false,
      ).toBe(true);
    }
  } finally {
    await server.close();
  }
}

async function assertOperatorControlledLiveReadbacks(input: {
  payload: TeamRunLivePayload;
  expectedFinalToken: string;
}) {
  const control = createExecutionRuntimeControl();
  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:grok-approval',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: input.payload.execution.runtimeRunId,
          note: 'human approved team resume',
          guidance: {
            action: 'continue',
            instruction: 'skip the blocked local shell action and continue directly to the final response',
          },
          override: {
            promptAppend: `The human approved skipping the blocked local shell action. Reply exactly with ${input.expectedFinalToken} and nothing else.`,
            structuredContext: {
              approvedToSkipBlockedLocalAction: true,
              finalToken: input.expectedFinalToken,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: input.payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human approved team resume',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: input.payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: input.payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const detailResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${input.payload.execution.runtimeRunId}`);
    expect(detailResponse.status).toBe(200);
    const detailBody = (await detailResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(detailBody.object).toBe('recovery_detail');
    expect(detailBody.detail).toMatchObject({
      runId: input.payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: input.payload.taskRunSpec.id,
    });
    expect(detailBody.detail.orchestrationTimelineSummary).not.toBeNull();
    expect(detailBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human approved team resume',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${input.payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      output?: Array<{
        type?: string | null;
        role?: string | null;
        content?: Array<{
          type?: string | null;
          text?: string | null;
        }>;
      }>;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        service?: string | null;
        runtimeProfile?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              resumedAt?: string | null;
              note?: string | null;
            } | null;
            targetedDrain?: {
              requestedAt?: string | null;
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: input.payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: input.payload.execution.runtimeRunId,
        taskRunSpecId: input.payload.taskRunSpec.id,
        service: 'grok',
        runtimeProfile: 'auracall-grok-auto',
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human approved team resume',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
        },
      },
    });

    const storedRecord = await control.readRun(input.payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(input.expectedFinalToken);
  } finally {
    await server.close();
  }
}

async function assertRejectedOperatorControlledLiveReadbacks(input: {
  payload: TeamRunLivePayload;
  expectedFinalToken: string;
}) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(input.payload.execution.runtimeRunId);
  const rejectedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'rejected') ?? null;
  expect(rejectedRequest).not.toBeNull();
  const requestId = rejectedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:grok-rejection',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: input.payload.execution.runtimeRunId,
          note: 'human resumed team run after runtime rejected local action',
          guidance: {
            action: 'continue',
            instruction: 'the local shell action was already rejected by runtime policy; continue directly to the final response',
          },
          override: {
            promptAppend: `The blocked local shell action was already rejected by runtime policy. Reply exactly with ${input.expectedFinalToken} and nothing else.`,
            structuredContext: {
              runtimeRejectedBlockedLocalAction: true,
              finalToken: input.expectedFinalToken,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: input.payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed team run after runtime rejected local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: input.payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: input.payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const detailResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${input.payload.execution.runtimeRunId}`);
    expect(detailResponse.status).toBe(200);
    const detailBody = (await detailResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(detailBody.object).toBe('recovery_detail');
    expect(detailBody.detail).toMatchObject({
      runId: input.payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: input.payload.taskRunSpec.id,
    });
    expect(detailBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed team run after runtime rejected local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${input.payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        service?: string | null;
        runtimeProfile?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              resumedAt?: string | null;
              note?: string | null;
            } | null;
            targetedDrain?: {
              requestedAt?: string | null;
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              approved?: number | null;
              rejected?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
              resultSummary?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: input.payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: input.payload.execution.runtimeRunId,
        taskRunSpecId: input.payload.taskRunSpec.id,
        service: 'grok',
        runtimeProfile: 'auracall-grok-auto',
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed team run after runtime rejected local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              approved: 0,
              rejected: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) =>
          item.requestId === requestId &&
          item.status === 'rejected',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(input.payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'rejected' &&
          request.resultSummary === 'local action rejected because step policy forbids host actions',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(input.expectedFinalToken);
  } finally {
    await server.close();
  }
}

async function assertCancelledOperatorControlledLiveReadbacks(input: {
  payload: TeamRunLivePayload;
  expectedFinalToken: string;
}) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(input.payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:grok-cancellation',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: input.payload.execution.runtimeRunId,
          requestId,
          resolution: 'cancelled',
          note: 'human cancelled requested local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: input.payload.execution.runtimeRunId,
        requestId,
        resolution: 'cancelled',
        status: 'resolved',
        resolved: true,
        reason: 'human cancelled requested local action',
      },
    });

    const resolvedRecord = await control.readRun(input.payload.execution.runtimeRunId);
    expect(
      resolvedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'cancelled' &&
          request.resultSummary === 'human cancelled requested local action',
      ) ?? false,
    ).toBe(true);

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: input.payload.execution.runtimeRunId,
          note: 'human resumed team run after cancelling local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was cancelled; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was cancelled by the operator. Reply exactly with ${input.expectedFinalToken} and nothing else.`,
            structuredContext: {
              cancelledRequestedLocalAction: true,
              finalToken: input.expectedFinalToken,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: input.payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed team run after cancelling local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: input.payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: input.payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const detailResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${input.payload.execution.runtimeRunId}`);
    expect(detailResponse.status).toBe(200);
    const detailBody = (await detailResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(detailBody.object).toBe('recovery_detail');
    expect(detailBody.detail).toMatchObject({
      runId: input.payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: input.payload.taskRunSpec.id,
    });
    expect(detailBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed team run after cancelling local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${input.payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        service?: string | null;
        runtimeProfile?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              resumedAt?: string | null;
              note?: string | null;
            } | null;
            targetedDrain?: {
              requestedAt?: string | null;
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              cancelled?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
              resultSummary?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: input.payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: input.payload.execution.runtimeRunId,
        taskRunSpecId: input.payload.taskRunSpec.id,
        service: 'grok',
        runtimeProfile: 'auracall-grok-auto',
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed team run after cancelling local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              cancelled: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) =>
          item.requestId === requestId &&
          item.status === 'cancelled',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(input.payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'cancelled' &&
          request.resultSummary === 'human cancelled requested local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(input.expectedFinalToken);
  } finally {
    await server.close();
  }
}

(LIVE ? describe : describe.skip)('Grok team live smoke', () => {
  it(
    'executes auracall-solo through the real Grok-backed CLI path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Grok team live smoke (missing DISPLAY for browser-backed Grok run).');
        return;
      }

      await acquireLiveTestLock('grok-browser');
      try {
        const payload = await runTeamSmoke({
          teamId: 'auracall-solo',
          smokeToken: SMOKE_TOKEN,
          title: 'AuraCall team live smoke',
          maxTurns: 1,
        });

        expect(payload.taskRunSpec.teamId).toBe('auracall-solo');
        expect(payload.execution.teamId).toBe('auracall-solo');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('succeeded');
        expect(payload.execution.finalOutputSummary).toBe(SMOKE_TOKEN);
        expect(payload.execution.stepSummaries.length).toBeGreaterThan(0);
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
        });

        await assertStoredReadbacks({
          payload,
          expectedTimelineSucceededCount: 1,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('grok-browser');
      }
    },
    12 * 60 * 1000,
  );

  it(
    'executes auracall-two-step through a real two-step Grok-backed CLI path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Grok two-step live smoke (missing DISPLAY for browser-backed Grok run).');
        return;
      }

      await acquireLiveTestLock('grok-browser');
      try {
        const payload = await runTeamSmoke({
          teamId: 'auracall-two-step',
          smokeToken: TWO_STEP_SMOKE_TOKEN,
          title: 'AuraCall two-step team live smoke',
          maxTurns: 2,
        });

        expect(payload.taskRunSpec.teamId).toBe('auracall-two-step');
        expect(payload.execution.teamId).toBe('auracall-two-step');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('succeeded');
        expect(payload.execution.finalOutputSummary).toBe(TWO_STEP_SMOKE_TOKEN);
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(
          payload.execution.sharedStateNotes.some((note) => note.includes('consumed task transfers')),
        ).toBe(true);
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });

        await assertStoredReadbacks({
          payload,
          expectedTimelineSucceededCount: 2,
          expectedHandoffConsumedCount: 1,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('grok-browser');
      }
    },
    16 * 60 * 1000,
  );

  it(
    'executes auracall-multi-agent through a real planner-to-finisher Grok-backed CLI path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Grok multi-agent live smoke (missing DISPLAY for browser-backed Grok run).');
        return;
      }

      await acquireLiveTestLock('grok-browser');
      try {
        const payload = await runTeamSmoke({
          teamId: 'auracall-multi-agent',
          smokeToken: MULTI_AGENT_SMOKE_TOKEN,
          title: 'AuraCall multi-agent team live smoke',
          maxTurns: 2,
        });

        expect(payload.taskRunSpec.teamId).toBe('auracall-multi-agent');
        expect(payload.execution.teamId).toBe('auracall-multi-agent');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('succeeded');
        expect(payload.execution.finalOutputSummary).toBe(MULTI_AGENT_SMOKE_TOKEN);
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(
          payload.execution.sharedStateNotes.some((note) => note.includes('consumed task transfers')),
        ).toBe(true);
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });

        await assertStoredReadbacks({
          payload,
          expectedTimelineSucceededCount: 2,
          expectedHandoffConsumedCount: 1,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('grok-browser');
      }
    },
    16 * 60 * 1000,
  );

  (TOOLING_LIVE ? it : it.skip)(
    'executes auracall-tooling through a real bounded local-action Grok-backed CLI path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Grok tooling live smoke (missing DISPLAY for browser-backed Grok run).');
        return;
      }

      await acquireLiveTestLock('grok-browser');
      try {
        const payload = await runTeamSmoke({
          teamId: 'auracall-tooling',
          smokeToken: TOOL_TEAM_SMOKE_TOKEN,
          title: 'AuraCall tooling team live smoke',
          maxTurns: 2,
          objective:
            'Use the provided toolEnvelope structured context to request one bounded shell action, then use the resulting tool outcome to return the provided finalToken exactly.',
          promptAppend:
            'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must output only the final token after a successful executed tool outcome.',
          extraArgs: [
            '--structured-context-json',
            JSON.stringify({
              toolEnvelope: {
                kind: 'shell',
                summary: 'Run one bounded deterministic node command',
                command: 'node',
                args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
                structuredPayload: {
                  cwd: process.cwd(),
                },
              },
              finalToken: TOOL_TEAM_SMOKE_TOKEN,
            }),
            '--allow-local-shell-command',
            'node',
            '--allow-local-cwd-root',
            process.cwd(),
          ],
        });

        expect(payload.taskRunSpec.teamId).toBe('auracall-tooling');
        expect(payload.execution.teamId).toBe('auracall-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('succeeded');
        expect(payload.execution.finalOutputSummary).toBe(TOOL_TEAM_SMOKE_TOKEN);
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('local shell action executed: node');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });

        await assertStoredReadbacks({
          payload,
          expectedTimelineSucceededCount: 2,
          expectedHandoffConsumedCount: 1,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('grok-browser');
      }
    },
    16 * 60 * 1000,
  );

  (APPROVAL_LIVE ? it : it.skip)(
    'pauses auracall-tooling for human escalation and resumes/drains it through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Grok approval live smoke (missing DISPLAY for browser-backed Grok run).');
        return;
      }

      await acquireLiveTestLock('grok-browser');
      try {
        const payload = await runTeamSmoke({
          teamId: 'auracall-tooling',
          smokeToken: APPROVAL_TEAM_SMOKE_TOKEN,
          title: 'AuraCall team approval live smoke',
          maxTurns: 2,
          objective:
            'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after human escalation, ignore the blocked local action and return the provided finalToken exactly.',
          promptAppend:
            'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided, finisher must output only the final token.',
          extraArgs: [
            '--structured-context-json',
            JSON.stringify({
              toolEnvelope: {
                kind: 'shell',
                summary: 'Request one intentionally forbidden deterministic node command',
                command: 'node',
                args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
                structuredPayload: {
                  cwd: process.cwd(),
                },
              },
              finalToken: APPROVAL_TEAM_SMOKE_TOKEN,
            }),
          ],
        });

        expect(payload.taskRunSpec.teamId).toBe('auracall-tooling');
        expect(payload.execution.teamId).toBe('auracall-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertOperatorControlledLiveReadbacks({
          payload,
          expectedFinalToken: APPROVAL_TEAM_SMOKE_TOKEN,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('grok-browser');
      }
    },
    20 * 60 * 1000,
  );

  (REJECTION_LIVE ? it : it.skip)(
    'rejects auracall-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Grok rejection live smoke (missing DISPLAY for browser-backed Grok run).');
        return;
      }

      await acquireLiveTestLock('grok-browser');
      try {
        const payload = await runTeamSmoke({
          teamId: 'auracall-tooling',
          smokeToken: REJECTION_TEAM_SMOKE_TOKEN,
          title: 'AuraCall team rejection live smoke',
          maxTurns: 2,
          objective:
            'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is rejected, ignore the blocked local action and return the provided finalToken exactly.',
          promptAppend:
            'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following rejection, finisher must output only the final token.',
          extraArgs: [
            '--structured-context-json',
            JSON.stringify({
              toolEnvelope: {
                kind: 'shell',
                summary: 'Request one intentionally forbidden deterministic node command',
                command: 'node',
                args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
                structuredPayload: {
                  cwd: process.cwd(),
                },
              },
              finalToken: REJECTION_TEAM_SMOKE_TOKEN,
            }),
          ],
        });

        expect(payload.taskRunSpec.teamId).toBe('auracall-tooling');
        expect(payload.execution.teamId).toBe('auracall-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertRejectedOperatorControlledLiveReadbacks({
          payload,
          expectedFinalToken: REJECTION_TEAM_SMOKE_TOKEN,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('grok-browser');
      }
    },
    20 * 60 * 1000,
  );

  (CANCELLATION_LIVE ? it : it.skip)(
    'cancels auracall-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Grok cancellation live smoke (missing DISPLAY for browser-backed Grok run).');
        return;
      }

      await acquireLiveTestLock('grok-browser');
      try {
        const payload = await runTeamSmoke({
          teamId: 'auracall-tooling',
          smokeToken: CANCELLATION_TEAM_SMOKE_TOKEN,
          title: 'AuraCall team cancellation live smoke',
          maxTurns: 2,
          objective:
            'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is cancelled, ignore the cancelled local action and return the provided finalToken exactly.',
          promptAppend:
            'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following cancellation, finisher must output only the final token.',
          extraArgs: [
            '--structured-context-json',
            JSON.stringify({
              toolEnvelope: {
                kind: 'shell',
                summary: 'Request one approval-gated deterministic node command',
                command: 'node',
                args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
                structuredPayload: {
                  cwd: process.cwd(),
                },
              },
              finalToken: CANCELLATION_TEAM_SMOKE_TOKEN,
            }),
            '--allow-local-shell-command',
            'node',
            '--allow-local-cwd-root',
            process.cwd(),
            '--require-local-action-approval',
          ],
        });

        expect(payload.taskRunSpec.teamId).toBe('auracall-tooling');
        expect(payload.execution.teamId).toBe('auracall-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertCancelledOperatorControlledLiveReadbacks({
          payload,
          expectedFinalToken: CANCELLATION_TEAM_SMOKE_TOKEN,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('grok-browser');
      }
    },
    20 * 60 * 1000,
  );
});
