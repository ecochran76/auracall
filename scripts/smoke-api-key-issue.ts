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
  apiKey?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  model?: string;
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
      }),
    });

    assertEqual(payload.object, 'auracall_api_key_issue', 'response object');
    assertEqual(payload.keyId, 'smoke-client', 'key id');
    assertEqual(payload.model, 'agent:smoke', 'model');
    assertEqual(payload.openaiBaseUrl, 'http://127.0.0.1:18095/v1', 'OpenAI base URL');
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

    console.log(`api-key-issue smoke: pass port=${server.port} env=${envPath} keyId=${payload.keyId} model=${payload.model}`);
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
