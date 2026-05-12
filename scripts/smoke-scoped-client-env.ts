#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

interface ModelsPayload {
  data?: Array<{ id?: string }>;
}

interface ResponsePayload {
  id?: string;
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ text?: string; type?: string }>;
  }>;
}

export interface ScopedClientEnvSmokeInput {
  envPath: string;
  prompt?: string;
  expectedModel?: string;
  expectedOutputIncludes?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  log?: boolean;
}

export interface ScopedClientEnvSmokeResult {
  baseUrl: string;
  model: string;
  responseId: string;
  status: string;
  outputText: string;
}

export async function readEnvValues(envPath: string): Promise<Record<string, string>> {
  const raw = await fs.readFile(envPath, 'utf8');
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values[match[1]] = match[2];
  }
  return values;
}

export async function runScopedClientEnvSmoke(input: ScopedClientEnvSmokeInput): Promise<ScopedClientEnvSmokeResult> {
  const env = await readEnvValues(input.envPath);
  const baseUrl = env.OPENAI_BASE_URL;
  const apiKey = env.OPENAI_API_KEY;
  const model = env.AURACALL_MODEL;
  if (!baseUrl) throw new Error(`${input.envPath} is missing OPENAI_BASE_URL.`);
  if (!apiKey) throw new Error(`${input.envPath} is missing OPENAI_API_KEY.`);
  if (!model) throw new Error(`${input.envPath} is missing AURACALL_MODEL.`);
  if (input.expectedModel && model !== input.expectedModel) {
    throw new Error(`Expected AURACALL_MODEL=${input.expectedModel}, got ${model}.`);
  }

  const models = await fetchJson<ModelsPayload>(`${baseUrl}/models`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });
  if (!models.data?.some((entry) => entry.id === model)) {
    throw new Error(`/v1/models did not expose ${model}.`);
  }

  const created = await fetchJson<ResponsePayload>(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: input.prompt ?? 'AuraCall scoped client smoke. Reply with a concise confirmation.',
    }),
  });
  if (!created.id) throw new Error('/v1/responses did not return a response id.');

  const completed = await pollResponse(baseUrl, created.id, apiKey, input.timeoutMs ?? 60_000, input.pollIntervalMs ?? 500);
  if (completed.status !== 'completed') {
    throw new Error(`Response ${created.id} finished with status ${completed.status ?? 'unknown'}.`);
  }
  const outputText = extractResponseText(completed);
  if (!outputText) throw new Error(`Response ${created.id} completed without assistant text.`);
  if (input.expectedOutputIncludes && !outputText.includes(input.expectedOutputIncludes)) {
    throw new Error(`Response ${created.id} did not include ${input.expectedOutputIncludes}.\n${outputText}`);
  }

  const result = {
    baseUrl,
    model,
    responseId: created.id,
    status: completed.status,
    outputText,
  };
  if (input.log ?? true) {
    console.log(
      `scoped-client-env smoke: pass model=${result.model} response=${result.responseId} chars=${result.outputText.length}`,
    );
  }
  return result;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) as T : {} as T;
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function pollResponse(
  baseUrl: string,
  responseId: string,
  apiKey: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<ResponsePayload> {
  const deadline = Date.now() + timeoutMs;
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
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Timed out waiting for response ${responseId}; latest=${JSON.stringify(latest)}`);
}

function extractResponseText(response: ResponsePayload): string {
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.text) parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function parseArgs(argv: string[]): ScopedClientEnvSmokeInput {
  const input: Partial<ScopedClientEnvSmokeInput> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--prompt') {
      input.prompt = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--expected-model') {
      input.expectedModel = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--expect-output') {
      input.expectedOutputIncludes = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--timeout-ms') {
      input.timeoutMs = Number.parseInt(requireValue(argv, index, arg), 10);
      index += 1;
    } else if (arg === '--quiet') {
      input.log = false;
    } else if (!input.envPath) {
      input.envPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!input.envPath) {
    throw new Error('Usage: pnpm run smoke:scoped-client-env -- <client.env> [--prompt "..."] [--expected-model agent:...]');
  }
  return input as ScopedClientEnvSmokeInput;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runScopedClientEnvSmoke(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
