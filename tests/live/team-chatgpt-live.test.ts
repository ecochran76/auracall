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
// Stable baseline: the single-provider ChatGPT team smoke is part of the
// routine live baseline. Approval/cancellation cases remain extended-matrix
// coverage behind explicit opt-in env gates.
const LIVE = process.env.AURACALL_LIVE_TEST === '1';
const CHATGPT_TEAM_LIVE = process.env.AURACALL_CHATGPT_TEAM_LIVE_TEST === '1';
const CHATGPT_APPROVAL_LIVE = process.env.AURACALL_CHATGPT_APPROVAL_LIVE_TEST === '1';
const CHATGPT_CANCELLATION_LIVE = process.env.AURACALL_CHATGPT_CANCELLATION_LIVE_TEST === '1';
const TSX_BIN = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_ENTRY = path.join(process.cwd(), 'bin', 'auracall.ts');
const SMOKE_TOKEN = 'AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK';
const APPROVAL_TOKEN = 'AURACALL_CHATGPT_APPROVAL_TEAM_LIVE_SMOKE_OK';
const CANCELLATION_TOKEN = 'AURACALL_CHATGPT_CANCELLATION_TEAM_LIVE_SMOKE_OK';

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

async function runTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-chatgpt-solo',
      `Reply exactly with: ${SMOKE_TOKEN}`,
      '--title',
      'AuraCall ChatGPT team live smoke',
      '--prompt-append',
      `Do not use tools. Reply with exactly ${SMOKE_TOKEN} and nothing else.`,
      '--max-turns',
      '1',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runApprovalTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-chatgpt-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after human escalation, ignore the blocked local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall ChatGPT approval team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided, finisher must output only the final token.',
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
        finalToken: APPROVAL_TOKEN,
      }),
      '--max-turns',
      '2',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runCancellationTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-chatgpt-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is cancelled, ignore the cancelled local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall ChatGPT cancellation team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following cancellation, finisher must output only the final token.',
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
        finalToken: CANCELLATION_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function assertStoredReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const host = createExecutionServiceHost({
    control,
    ownerId: 'live-test:chatgpt-team',
  });
  const detail = await host.readRecoveryDetail(payload.execution.runtimeRunId);

  expect(detail).not.toBeNull();
  expect(detail).toMatchObject({
    runId: payload.execution.runtimeRunId,
    sourceKind: 'team-run',
    taskRunSpecId: payload.taskRunSpec.id,
  });
  expect(detail?.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
  expect(
    detail?.orchestrationTimelineSummary?.items.filter((item) => item.type === 'step-succeeded').length ?? 0,
  ).toBeGreaterThanOrEqual(1);

  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    { control },
  );
  try {
    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
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
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
    expect(
      recoveryBody.detail.orchestrationTimelineSummary?.items.filter((item) => item.type === 'step-succeeded').length ?? 0,
    ).toBeGreaterThanOrEqual(1);

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
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
          orchestrationTimelineSummary?: {
            total: number;
            items: Array<{ type: string | null }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        service: 'chatgpt',
        runtimeProfile: 'wsl-chrome-2',
      },
    });
    expect(responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
    expect(
      responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.items.filter(
        (item) => item.type === 'step-succeeded',
      ).length ?? 0,
    ).toBeGreaterThanOrEqual(1);
  } finally {
    await server.close();
  }
}

async function assertOperatorControlledReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:chatgpt-approval',
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
          runId: payload.execution.runtimeRunId,
          note: 'human approved chatgpt team resume',
          guidance: {
            action: 'continue',
            instruction: 'skip the blocked local shell action and continue directly to the final response',
          },
          override: {
            promptAppend: `The human approved skipping the blocked local shell action. Reply exactly with ${APPROVAL_TOKEN} and nothing else.`,
            structuredContext: {
              approvedToSkipBlockedLocalAction: true,
              finalToken: APPROVAL_TOKEN,
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
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human approved chatgpt team resume',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
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
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human approved chatgpt team resume',
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

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
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
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        service: 'chatgpt',
        runtimeProfile: 'wsl-chrome-2',
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human approved chatgpt team resume',
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

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(APPROVAL_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertCancelledOperatorControlledReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:chatgpt-cancellation',
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
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'cancelled',
          note: 'human cancelled requested chatgpt local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'cancelled',
        status: 'resolved',
        resolved: true,
        reason: 'human cancelled requested chatgpt local action',
      },
    });

    const resolvedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(
      resolvedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'cancelled' &&
          request.resultSummary === 'human cancelled requested chatgpt local action',
      ) ?? false,
    ).toBe(true);

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed chatgpt team run after cancelling local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was cancelled; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was cancelled by the operator. Reply exactly with ${CANCELLATION_TOKEN} and nothing else.`,
            structuredContext: {
              cancelledRequestedLocalAction: true,
              finalToken: CANCELLATION_TOKEN,
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
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed chatgpt team run after cancelling local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
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
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed chatgpt team run after cancelling local action',
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

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
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
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        service: 'chatgpt',
        runtimeProfile: 'wsl-chrome-2',
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed chatgpt team run after cancelling local action',
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

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'cancelled' &&
          request.resultSummary === 'human cancelled requested chatgpt local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(CANCELLATION_TOKEN);
  } finally {
    await server.close();
  }
}

(LIVE ? describe : describe.skip)('ChatGPT team live smoke', () => {
  (CHATGPT_TEAM_LIVE ? it : it.skip)(
    'executes auracall-chatgpt-solo through the real ChatGPT-backed CLI path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping ChatGPT team live smoke (missing DISPLAY for browser-backed ChatGPT run).');
        return;
      }

      await acquireLiveTestLock('chatgpt-browser');
      try {
        const payload = await runTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-chatgpt-solo');
        expect(payload.execution.teamId).toBe('auracall-chatgpt-solo');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('succeeded');
        expect(payload.execution.finalOutputSummary).toBe(SMOKE_TOKEN);
        expect(payload.execution.stepSummaries.length).toBeGreaterThan(0);
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
        });

        await assertStoredReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('chatgpt-browser');
      }
    },
    12 * 60 * 1000,
  );

  (CHATGPT_APPROVAL_LIVE ? it : it.skip)(
    'pauses auracall-chatgpt-tooling for human escalation and resumes/drains it through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping ChatGPT approval team live smoke (missing DISPLAY for browser-backed ChatGPT run).');
        return;
      }

      await acquireLiveTestLock('chatgpt-browser');
      try {
        const payload = await runApprovalTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-chatgpt-tooling');
        expect(payload.execution.teamId).toBe('auracall-chatgpt-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertOperatorControlledReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('chatgpt-browser');
      }
    },
    20 * 60 * 1000,
  );

  (CHATGPT_CANCELLATION_LIVE ? it : it.skip)(
    'cancels auracall-chatgpt-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping ChatGPT cancellation team live smoke (missing DISPLAY for browser-backed ChatGPT run).');
        return;
      }

      await acquireLiveTestLock('chatgpt-browser');
      try {
        const payload = await runCancellationTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-chatgpt-tooling');
        expect(payload.execution.teamId).toBe('auracall-chatgpt-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertCancelledOperatorControlledReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('chatgpt-browser');
      }
    },
    20 * 60 * 1000,
  );
});
