import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
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
        status: 'in_progress',
        model: 'gemini-3-pro',
        output: [],
        metadata: {
          runId: 'resp_create_1',
          runtimeProfile: 'default',
          service: 'gemini',
        },
      });

      const readResponse = await fetch(`http://127.0.0.1:${server.port}/v1/responses/resp_create_1`);
      expect(readResponse.status).toBe(200);
      const reread = (await readResponse.json()) as Record<string, unknown>;
      expect(reread).toMatchObject({
        id: 'resp_create_1',
        object: 'response',
        status: 'in_progress',
        model: 'gemini-3-pro',
      });
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
        metadata: {
          runtimeProfile: 'review',
          service: 'grok',
        },
      });
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
});
