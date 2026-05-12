#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
import {
  createProjectEnsureService as createDefaultProjectEnsureService,
  type ProjectEnsureServiceDeps,
} from '../src/projects/projectEnsureService.js';
import type { ExecutionRequest } from '../src/runtime/apiTypes.js';

const PROJECT_NAME = 'ChE 4470/5470 Seminar Grading';
const AGENT_ID = 'pro-extended-chatgpt-soylei-che4470-seminar-grading';
const MODEL = `agent:${AGENT_ID}`;

interface ResponseBatchStatusPayload {
  object?: string;
  id?: string;
  status?: string;
  counts?: {
    total?: number;
    completed?: number;
    failed?: number;
    in_progress?: number;
  };
  jobs?: Array<{
    responseId?: string;
    status?: string;
  }>;
}

interface ResponsePayload {
  id?: string;
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ text?: string }>;
  }>;
  metadata?: Record<string, unknown>;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: expected ${expected}.\n${text}`);
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as T;
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function pollBatch(baseUrl: string, batchId: string, apiKey: string): Promise<ResponseBatchStatusPayload> {
  const deadline = Date.now() + 10_000;
  let latest: ResponseBatchStatusPayload | null = null;
  while (Date.now() < deadline) {
    latest = await fetchJson<ResponseBatchStatusPayload>(`${baseUrl}/v1/response-batches/${batchId}`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });
    if (latest.status === 'completed' || latest.status === 'failed' || latest.status === 'cancelled') {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for batch ${batchId}; latest=${JSON.stringify(latest)}`);
}

async function main(): Promise<void> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-che447-grading-batch-smoke-'));
  setAuracallHomeDirOverrideForTest(homeDir);
  const packetDir = path.join(homeDir, 'grading-packets');
  await fs.mkdir(packetDir, { recursive: true });
  const studentA = path.join(packetDir, 'student-a-packet.md');
  const studentB = path.join(packetDir, 'student-b-packet.md');
  const rubric = path.join(packetDir, 'seminar-rubric.md');
  await fs.writeFile(studentA, '# Student A\nSeminar packet fixture.\n', 'utf8');
  await fs.writeFile(studentB, '# Student B\nSeminar packet fixture.\n', 'utf8');
  await fs.writeFile(rubric, '# Seminar Rubric\nFixture grading rubric.\n', 'utf8');

  const config = {
    api: {
      auth: {
        required: true,
        keys: [
          {
            id: 'operator',
            secret: 'operator-secret',
          },
          {
            id: 'che447-agent',
            secret: 'che447-agent-secret',
            agents: [AGENT_ID],
            services: ['chatgpt'],
            runtimeProfiles: ['wsl-chrome-3'],
          },
        ],
      },
    },
    browserProfiles: {
      'wsl-chrome-3': {},
    },
    runtimeProfiles: {
      'wsl-chrome-3': {
        browserProfile: 'wsl-chrome-3',
        defaultService: 'chatgpt',
      },
    },
  };
  await fs.writeFile(path.join(homeDir, 'config.json'), JSON.stringify(config), 'utf8');

  const executedRequests: ExecutionRequest[] = [];
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0, backgroundDrainIntervalMs: 25 },
    {
      config,
      now: () => new Date(),
      createProjectEnsureService: (deps: ProjectEnsureServiceDeps = {}) =>
        createDefaultProjectEnsureService({
          ...deps,
          createProjectClient: () => ({
            listProjects: async () => [],
            createProject: async (input) => ({
              id: 'proj_che447_seminar_grading',
              name: input.name,
              provider: 'chatgpt',
              url: 'https://chatgpt.com/g/g-che447-seminar-grading',
            }),
          }),
        }),
      executeStoredRunStep: async (request) => {
        executedRequests.push(request);
        const student = request.input.toString().includes('Student B') ? 'Student B' : 'Student A';
        if (request.model !== MODEL || request.auracall?.agent !== AGENT_ID) {
          throw new Error(`unexpected grading request identity: ${JSON.stringify(request)}`);
        }
        if ((request.attachments ?? []).length < 2) {
          throw new Error(`expected grading packet attachments for ${student}`);
        }
        return {
          sharedState: {
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
                        text: `READOUT_OK ${student}: seminar grading fixture completed.`,
                      },
                    ],
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
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const ensure = await fetchJson<{
      object?: string;
      status?: string;
      project?: { id?: string };
      agent?: { id?: string; mutationTarget?: string };
    }>(`${baseUrl}/v1/projects/ensure`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer operator-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        service: 'chatgpt',
        runtimeProfile: 'wsl-chrome-3',
        projectName: PROJECT_NAME,
        agentId: AGENT_ID,
        agentModelSelector: 'chatgpt:pro-extended',
        agentInstructions: 'Grade ChE 4470/5470 seminar packets using the course rubric.',
        agentPostPrompt: 'Return concise JSON and Markdown readout sections.',
        agentMetadata: {
          course: 'ChE 4470/5470',
          workflow: 'seminar-grading',
        },
      }),
    });
    assertEqual(ensure.object, 'auracall_project_ensure', 'project ensure object');
    assertEqual(ensure.status, 'created', 'project ensure status');
    assertEqual(ensure.project?.id, 'proj_che447_seminar_grading', 'project id');
    assertEqual(ensure.agent?.id, AGENT_ID, 'bound agent id');
    assertEqual(ensure.agent?.mutationTarget, 'registry', 'bound agent mutation target');

    const models = await fetchJson<{ data?: Array<{ id?: string }> }>(`${baseUrl}/v1/models`, {
      headers: {
        authorization: 'Bearer che447-agent-secret',
      },
    });
    if (!models.data?.some((entry) => entry.id === MODEL)) {
      throw new Error(`models endpoint did not expose ${MODEL}`);
    }

    const createBatch = await fetchJson<ResponseBatchStatusPayload>(`${baseUrl}/v1/response-batches`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer che447-agent-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        metadata: {
          course: 'ChE 4470/5470',
          workflow: 'seminar-grading',
          smoke: true,
        },
        limits: {
          maxConcurrentRuns: 1,
          maxBrowserInteractionsPerMinute: 8,
        },
        requests: [
          createStudentRequest('Student A', studentA, rubric),
          createStudentRequest('Student B', studentB, rubric),
        ],
      }),
    });
    assertEqual(createBatch.object, 'response_batch_status', 'batch create object');
    assertEqual(createBatch.counts?.total, 2, 'batch total count');
    if (!createBatch.id) throw new Error('batch create response did not include an id.');

    const completed = await pollBatch(baseUrl, createBatch.id, 'che447-agent-secret');
    assertEqual(completed.status, 'completed', 'batch final status');
    assertEqual(completed.counts?.completed, 2, 'completed batch count');
    assertEqual(executedRequests.length, 2, 'executed request count');

    for (const job of completed.jobs ?? []) {
      if (!job.responseId) throw new Error(`batch job missing response id: ${JSON.stringify(job)}`);
      const response = await fetchJson<ResponsePayload>(`${baseUrl}/v1/responses/${job.responseId}`, {
        headers: {
          authorization: 'Bearer che447-agent-secret',
        },
      });
      assertEqual(response.status, 'completed', `child response ${job.responseId} status`);
      const text = response.output?.[0]?.content?.[0]?.text ?? '';
      assertIncludes(text, 'READOUT_OK', `child response ${job.responseId} readout`);
    }

    console.log(
      `che447-grading-batch smoke: pass port=${server.port} project=${ensure.project?.id} agent=${AGENT_ID} batch=${completed.id} completed=${completed.counts?.completed}`,
    );
  } finally {
    await server.close();
    setAuracallHomeDirOverrideForTest(null);
    await fs.rm(homeDir, { recursive: true, force: true });
  }
}

function createStudentRequest(student: string, packetPath: string, rubricPath: string): ExecutionRequest {
  return {
    model: MODEL,
    input: `Grade ${student}'s seminar packet.`,
    attachments: [
      {
        id: `${student.toLowerCase().replace(/\s+/g, '-')}-packet`,
        fileName: path.basename(packetPath),
        mimeType: 'text/markdown',
        uri: pathToFileURL(packetPath).href,
      },
      {
        id: `${student.toLowerCase().replace(/\s+/g, '-')}-rubric`,
        fileName: path.basename(rubricPath),
        mimeType: 'text/markdown',
        uri: pathToFileURL(rubricPath).href,
      },
    ],
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
