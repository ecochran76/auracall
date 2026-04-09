import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { assertResponsesHostAllowed, createResponsesHttpServer } from '../src/http/responsesServer.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import {
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

describe('http responses adapter', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

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
    } finally {
      await server.close();
    }
  });

  it('reports explicit development posture through /status', async () => {
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Record<string, any>;
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
        routes: {
          responsesGetTemplate: '/v1/responses/{response_id}',
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

      const readBack = await fetch(`http://127.0.0.1:${server.port}/v1/responses/resp_headers_1`);
      const reread = (await readBack.json()) as Record<string, unknown>;
      expect(reread).toMatchObject({
        id: 'resp_headers_1',
        status: 'completed',
        metadata: {
          runtimeProfile: 'review',
          service: 'grok',
        },
      });
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
      expect(logs.some((entry) => entry.includes('Startup recovery (direct) completed'))).toBe(true);
      expect(logs.some((entry) => entry.includes(`executed=${executableRunId}`))).toBe(true);
      expect(logs.some((entry) => entry.includes('skips=no-runnable-step:3'))).toBe(true);
      expect(logs.some((entry) => entry.includes('scanned 4 candidate run(s)'))).toBe(true);
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
      expect(startupLog).toContain('1 executed');
    } finally {
      await server.close();
    }
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
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

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
      });
    } finally {
      await server.close();
    }
  });

  it('refuses non-loopback bind unless explicitly allowed', () => {
    expect(() => assertResponsesHostAllowed('0.0.0.0', false)).toThrow(/--listen-public/);
    expect(() => assertResponsesHostAllowed('127.0.0.1', false)).not.toThrow();
    expect(() => assertResponsesHostAllowed('0.0.0.0', true)).not.toThrow();
  });
});
