#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import net from 'node:net';
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

const PROJECT_NAME = 'Scoped Client Handoff Smoke';
const AGENT_ID = 'pro-extended-chatgpt-soylei-client-handoff-smoke';
const MODEL = `agent:${AGENT_ID}`;
type ResponsesHttpServer = Awaited<ReturnType<typeof createResponsesHttpServer>>;

interface AgentSetupHandoffPayload {
  object?: string;
  agentId?: string;
  model?: string;
  project?: {
    status?: string;
    id?: string | null;
    name?: string | null;
    service?: string;
    runtimeProfile?: string | null;
    created?: boolean;
  };
  key?: {
    keyId?: string;
    envPath?: string;
    apiBaseUrl?: string;
    scopes?: {
      agents?: string[];
      teams?: string[];
      services?: string[];
      runtimeProfiles?: string[];
    };
  };
  clientEnvPath?: string;
  restartRequired?: boolean;
}

interface ModelsPayload {
  data?: Array<{ id?: string }>;
}

interface ResponsePayload {
  id?: string;
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ text?: string }>;
  }>;
}

interface ResponseBatchStatusPayload {
  object?: string;
  id?: string;
  status?: string;
  counts?: {
    total?: number;
    completed?: number;
    failed?: number;
  };
  jobs?: Array<{
    responseId?: string;
    status?: string;
  }>;
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

async function readEnvValues(envPath: string): Promise<Record<string, string>> {
  const raw = await fs.readFile(envPath, 'utf8');
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values[match[1]] = match[2];
  }
  return values;
}

function snapshotAuracallApiEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('AURACALL_API_')) {
      snapshot[key] = process.env[key];
    }
  }
  return snapshot;
}

function restoreAuracallApiEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('AURACALL_API_') && !(key in snapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate a TCP port.')));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function pollResponse(baseUrl: string, responseId: string, apiKey: string): Promise<ResponsePayload> {
  const deadline = Date.now() + 10_000;
  let latest: ResponsePayload | null = null;
  while (Date.now() < deadline) {
    latest = await fetchJson<ResponsePayload>(`${baseUrl}/responses/${responseId}`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });
    if (latest.status === 'completed' || latest.status === 'failed' || latest.status === 'cancelled') {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for response ${responseId}; latest=${JSON.stringify(latest)}`);
}

async function pollBatch(batchUrl: string, batchId: string, apiKey: string): Promise<ResponseBatchStatusPayload> {
  const deadline = Date.now() + 10_000;
  let latest: ResponseBatchStatusPayload | null = null;
  while (Date.now() < deadline) {
    latest = await fetchJson<ResponseBatchStatusPayload>(`${batchUrl}/${batchId}`, {
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

async function createServer(options: {
  port: number;
  config: Record<string, unknown>;
  executedRequests: ExecutionRequest[];
}): Promise<ResponsesHttpServer> {
  return await createResponsesHttpServer(
    { host: '127.0.0.1', port: options.port, backgroundDrainIntervalMs: 25 },
    {
      config: options.config,
      now: () => new Date('2026-05-12T14:00:00.000Z'),
      createProjectEnsureService: (deps: ProjectEnsureServiceDeps = {}) =>
        createDefaultProjectEnsureService({
          ...deps,
          createProjectClient: () => ({
            listProjects: async () => [],
            createProject: async (input) => ({
              id: 'proj_scoped_client_handoff_smoke',
              name: input.name,
              provider: 'chatgpt',
              url: 'https://chatgpt.com/g/g-scoped-client-handoff-smoke',
            }),
          }),
        }),
      executeStoredRunStep: async (request) => {
        options.executedRequests.push(request);
        if (request.model !== MODEL || request.auracall?.agent !== AGENT_ID) {
          throw new Error(`unexpected request identity: ${JSON.stringify(request)}`);
        }
        const hasAttachment = (request.attachments ?? []).length > 0;
        const kind = request.input.toString().includes('Batch') ? 'batch' : 'direct';
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
                        text: `CLIENT_HANDOFF_OK ${kind} attachment=${hasAttachment}`,
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
}

async function main(): Promise<void> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-scoped-client-handoff-smoke-'));
  const envSnapshot = snapshotAuracallApiEnv();
  setAuracallHomeDirOverrideForTest(homeDir);
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const envPath = path.join(homeDir, 'api.env');
  const clientEnvPath = path.join(homeDir, 'clients', 'handoff-smoke.env');
  const fixtureDir = path.join(homeDir, 'fixtures');
  const attachmentPath = path.join(fixtureDir, 'input.md');
  await fs.mkdir(fixtureDir, { recursive: true });
  await fs.writeFile(attachmentPath, '# Input\nScoped client handoff fixture.\n', 'utf8');

  const config = {
    api: {
      auth: {
        required: true,
        keys: [
          {
            id: 'operator',
            secret: 'operator-secret',
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
  let server = await createServer({ port, config, executedRequests });

  try {
    const setup = await fetchJson<AgentSetupHandoffPayload>(`${baseUrl}/agent-setup-handoffs`, {
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
        keyId: 'client-handoff-smoke',
        agentModelSelector: 'chatgpt:pro-extended',
        agentInstructions: 'Exercise the scoped client handoff smoke.',
        services: ['chatgpt'],
        runtimeProfiles: ['wsl-chrome-3'],
        apiBaseUrl: baseUrl,
        envPath,
        clientEnvPath,
      }),
    });
    assertEqual(setup.object, 'auracall_agent_setup_handoff', 'setup handoff object');
    assertEqual(setup.agentId, AGENT_ID, 'setup handoff agent id');
    assertEqual(setup.model, MODEL, 'setup handoff model');
    assertEqual(setup.clientEnvPath, clientEnvPath, 'setup handoff client env path');
    assertEqual(setup.project?.id, 'proj_scoped_client_handoff_smoke', 'setup handoff project id');
    assertEqual(setup.key?.keyId, 'client-handoff-smoke', 'setup handoff key id');
    const setupJson = JSON.stringify(setup);
    if (setupJson.includes('OPENAI_API_KEY') || setupJson.includes('openaiApiKey') || /auracall_[A-Za-z0-9_-]{20,}/.test(setupJson)) {
      throw new Error(`setup handoff leaked secret-bearing fields: ${setupJson}`);
    }

    await server.close();
    const issuedEnv = await readEnvValues(envPath);
    for (const [key, value] of Object.entries(issuedEnv)) {
      process.env[key] = value;
    }
    server = await createServer({ port, config: { ...config, api: undefined }, executedRequests });

    const clientEnv = await readEnvValues(clientEnvPath);
    assertEqual(clientEnv.OPENAI_BASE_URL, baseUrl, 'handoff OPENAI_BASE_URL');
    if (!clientEnv.OPENAI_API_KEY?.startsWith('auracall_')) {
      throw new Error('handoff OPENAI_API_KEY was not a scoped AuraCall key.');
    }
    assertEqual(clientEnv.AURACALL_MODEL, MODEL, 'handoff AURACALL_MODEL');
    assertEqual(clientEnv.AURACALL_STATUS_URL, `http://127.0.0.1:${port}/status`, 'handoff status URL');
    assertEqual(clientEnv.AURACALL_BATCH_URL, `${baseUrl}/response-batches`, 'handoff batch URL');

    const models = await fetchJson<ModelsPayload>(`${clientEnv.OPENAI_BASE_URL}/models`, {
      headers: {
        authorization: `Bearer ${clientEnv.OPENAI_API_KEY}`,
      },
    });
    if (!models.data?.some((entry) => entry.id === clientEnv.AURACALL_MODEL)) {
      throw new Error(`models endpoint did not expose ${clientEnv.AURACALL_MODEL}`);
    }

    const direct = await fetchJson<ResponsePayload>(`${clientEnv.OPENAI_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${clientEnv.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: clientEnv.AURACALL_MODEL,
        input: 'Direct client handoff smoke.',
      }),
    });
    if (!direct.id) throw new Error('direct response did not include an id.');
    const directComplete = await pollResponse(clientEnv.OPENAI_BASE_URL, direct.id, clientEnv.OPENAI_API_KEY);
    assertEqual(directComplete.status, 'completed', 'direct response status');
    assertIncludes(directComplete.output?.[0]?.content?.[0]?.text ?? '', 'CLIENT_HANDOFF_OK direct', 'direct readback');

    const batch = await fetchJson<ResponseBatchStatusPayload>(clientEnv.AURACALL_BATCH_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${clientEnv.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        metadata: {
          workflow: 'scoped-client-handoff-smoke',
        },
        limits: {
          maxConcurrentRuns: 1,
          maxBrowserInteractionsPerMinute: 8,
        },
        requests: [
          {
            model: clientEnv.AURACALL_MODEL,
            input: 'Batch client handoff smoke 1.',
            attachments: [createAttachment('batch-1-input', attachmentPath)],
          },
          {
            model: clientEnv.AURACALL_MODEL,
            input: 'Batch client handoff smoke 2.',
            attachments: [createAttachment('batch-2-input', attachmentPath)],
          },
        ],
      }),
    });
    assertEqual(batch.object, 'response_batch_status', 'batch object');
    if (!batch.id) throw new Error('batch response did not include an id.');
    const batchComplete = await pollBatch(clientEnv.AURACALL_BATCH_URL, batch.id, clientEnv.OPENAI_API_KEY);
    assertEqual(batchComplete.status, 'completed', 'batch status');
    assertEqual(batchComplete.counts?.completed, 2, 'batch completed count');
    assertEqual(executedRequests.length, 3, 'executed request count');

    console.log(
      `scoped-client-handoff smoke: pass port=${port} agent=${AGENT_ID} clientEnv=${clientEnvPath} direct=${direct.id} batch=${batch.id} completed=${batchComplete.counts?.completed}`,
    );
  } finally {
    await server.close();
    restoreAuracallApiEnv(envSnapshot);
    setAuracallHomeDirOverrideForTest(null);
    await fs.rm(homeDir, { recursive: true, force: true });
  }
}

function createAttachment(id: string, filePath: string): NonNullable<ExecutionRequest['attachments']>[number] {
  return {
    id,
    fileName: path.basename(filePath),
    mimeType: 'text/markdown',
    uri: pathToFileURL(filePath).href,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
