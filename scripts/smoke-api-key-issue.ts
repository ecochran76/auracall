#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';

interface ApiKeyIssuePayload {
  object?: string;
  keyId?: string;
  envPath?: string;
  clientEnvPath?: string;
  apiKey?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  model?: string;
  clientEnv?: {
    openaiBaseUrl?: string;
    openaiApiKey?: string;
    auracallModel?: string;
    auracallStatusUrl?: string;
    auracallBatchUrl?: string;
  };
  restartRequired?: boolean;
  scopes?: {
    agents?: string[];
    services?: string[];
    runtimeProfiles?: string[];
  };
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

async function main(): Promise<void> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-api-key-issue-smoke-'));
  setAuracallHomeDirOverrideForTest(homeDir);
  const envPath = path.join(homeDir, 'api.env');
  const clientEnvPath = path.join(homeDir, 'clients', 'smoke.env');
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
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    { config },
  );

  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const payload = await fetchJson<ApiKeyIssuePayload>(`${baseUrl}/v1/config/api-keys/issue`, {
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
        clientEnvPath,
      }),
    });

    assertEqual(payload.object, 'auracall_api_key_issue', 'response object');
    assertEqual(payload.keyId, 'smoke-client', 'key id');
    assertEqual(payload.model, 'agent:smoke', 'model');
    assertEqual(payload.openaiBaseUrl, 'http://127.0.0.1:18095/v1', 'OpenAI base URL');
    assertEqual(payload.clientEnvPath, clientEnvPath, 'client env path');
    assertEqual(payload.clientEnv?.openaiBaseUrl, 'http://127.0.0.1:18095/v1', 'client OpenAI base URL');
    assertEqual(payload.clientEnv?.openaiApiKey, payload.apiKey, 'client OpenAI API key');
    assertEqual(payload.clientEnv?.auracallModel, 'agent:smoke', 'client model');
    assertEqual(payload.clientEnv?.auracallStatusUrl, 'http://127.0.0.1:18095/status', 'client status URL');
    assertEqual(payload.clientEnv?.auracallBatchUrl, 'http://127.0.0.1:18095/v1/response-batches', 'client batch URL');
    assertEqual(payload.restartRequired, true, 'restart required');
    assertEqual(payload.scopes?.agents?.join(','), 'smoke', 'agent scope');
    assertEqual(payload.scopes?.services?.join(','), 'chatgpt', 'service scope');
    assertEqual(payload.scopes?.runtimeProfiles?.join(','), 'default', 'runtime scope');
    if (!payload.apiKey?.startsWith('auracall_') || payload.openaiApiKey !== payload.apiKey) {
      throw new Error('response did not return one matching AuraCall/OpenAI-compatible secret.');
    }

    const env = await fs.readFile(envPath, 'utf8');
    assertIncludes(env, 'AURACALL_API_AUTH_REQUIRED=1', 'env auth flag');
    assertIncludes(env, 'AURACALL_API_KEY_IDS=smoke-client', 'env key id list');
    assertIncludes(env, 'AURACALL_API_KEY_SMOKE_CLIENT_ID=smoke-client', 'env key id');
    assertIncludes(env, 'AURACALL_API_KEY_SMOKE_CLIENT_AGENTS=smoke', 'env agent scope');
    assertIncludes(env, 'AURACALL_API_KEY_SMOKE_CLIENT_SERVICES=chatgpt', 'env service scope');
    assertIncludes(env, 'AURACALL_API_KEY_SMOKE_CLIENT_RUNTIME_PROFILES=default', 'env runtime scope');
    const clientEnv = await fs.readFile(clientEnvPath, 'utf8');
    assertIncludes(clientEnv, 'OPENAI_BASE_URL=http://127.0.0.1:18095/v1', 'client env base URL');
    assertIncludes(clientEnv, `OPENAI_API_KEY=${payload.apiKey}`, 'client env key');
    assertIncludes(clientEnv, 'AURACALL_MODEL=agent:smoke', 'client env model');
    assertIncludes(clientEnv, 'AURACALL_STATUS_URL=http://127.0.0.1:18095/status', 'client env status URL');
    assertIncludes(clientEnv, 'AURACALL_BATCH_URL=http://127.0.0.1:18095/v1/response-batches', 'client env batch URL');

    console.log(`api-key-issue smoke: pass port=${server.port} env=${envPath} clientEnv=${clientEnvPath} keyId=${payload.keyId} model=${payload.model}`);
  } finally {
    await server.close();
    setAuracallHomeDirOverrideForTest(null);
    await fs.rm(homeDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
