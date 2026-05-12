#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import OpenAI from 'openai';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';

interface ApiKeyIssuePayload {
  object?: string;
  keyId?: string;
  apiKey?: string;
  model?: string;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
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

async function main(): Promise<void> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-api-key-openai-client-smoke-'));
  const envSnapshot = snapshotAuracallApiEnv();
  setAuracallHomeDirOverrideForTest(homeDir);
  const envPath = path.join(homeDir, 'api.env');
  const config = {
    browserProfiles: { default: {} },
    runtimeProfiles: {
      default: {
        browserProfile: 'default',
        defaultService: 'chatgpt',
      },
    },
    agents: {
      smoke: {
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    },
  };
  await fs.writeFile(path.join(homeDir, 'config.json'), JSON.stringify(config), 'utf8');
  const issuerServer = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      config: {
        ...config,
        api: {
          auth: {
            required: true,
            keys: [{ id: 'operator', secret: 'operator-secret' }],
          },
        },
      },
    },
  );

  try {
    const issueBaseUrl = `http://127.0.0.1:${issuerServer.port}`;
    const issued = await fetchJson<ApiKeyIssuePayload>(`${issueBaseUrl}/v1/config/api-keys/issue`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer operator-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        agentId: 'smoke',
        keyId: 'smoke-client',
        services: ['chatgpt'],
        runtimeProfiles: ['default'],
        envPath,
      }),
    });
    assertEqual(issued.object, 'auracall_api_key_issue', 'issue response object');
    assertEqual(issued.model, 'agent:smoke', 'issued model');
    if (!issued.apiKey?.startsWith('auracall_')) {
      throw new Error('issued key did not include an AuraCall secret.');
    }
    await issuerServer.close();

    const issuedEnv = await readEnvValues(envPath);
    for (const [key, value] of Object.entries(issuedEnv)) {
      process.env[key] = value;
    }

    const clientServer = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0, backgroundDrainIntervalMs: 60_000 },
      {
        config,
        generateResponseId: () => 'openai_client_smoke_resp_1',
        now: () => new Date('2026-05-12T12:00:00.000Z'),
        executeStoredRunStep: async (request) => {
          assertEqual(request.model, 'agent:smoke', 'executor model');
          assertEqual(request.auracall?.agent, 'smoke', 'executor agent');
          return {
            sharedState: {
              structuredOutputs: [
                {
                  key: 'response.output',
                  value: [
                    {
                      type: 'message',
                      role: 'assistant',
                      content: [{ type: 'output_text', text: 'AURACALL_OPENAI_CLIENT_KEY_OK' }],
                    },
                  ],
                },
              ],
            },
            usage: {
              inputTokens: 4,
              outputTokens: 3,
              reasoningTokens: 0,
              totalTokens: 7,
            },
          };
        },
      },
    );

    try {
      const openai = new OpenAI({
        apiKey: issued.apiKey,
        baseURL: `http://127.0.0.1:${clientServer.port}/v1`,
      });
      const completion = await openai.chat.completions.create({
        model: 'agent:smoke',
        messages: [{ role: 'user', content: 'Return the smoke token.' }],
      });
      assertEqual(completion.choices[0]?.message?.content, 'AURACALL_OPENAI_CLIENT_KEY_OK', 'OpenAI client response');
      assertEqual(completion.model, 'agent:smoke', 'OpenAI client model');
      console.log(`api-key-openai-client smoke: pass issuePort=${issuerServer.port} clientPort=${clientServer.port} keyId=${issued.keyId} model=${completion.model}`);
    } finally {
      await clientServer.close();
    }
  } finally {
    restoreAuracallApiEnv(envSnapshot);
    setAuracallHomeDirOverrideForTest(null);
    await fs.rm(homeDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
