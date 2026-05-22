import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import { readEnvFile, toApiAuthEnvSuffix } from '../config/apiKeyIssuer.js';

export async function fetchWithLocalApiAuth(
  url: URL,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const response = await fetchImpl(url, init);
  if (response.status !== 401) return response;
  const apiKey = await resolveLocalApiKey();
  if (!apiKey) return response;
  const headers = new Headers(init.headers);
  if (!headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiKey}`);
  }
  return fetchImpl(url, {
    ...init,
    headers,
  });
}

async function resolveLocalApiKey(): Promise<string | null> {
  const envKey = readString(process.env.AURACALL_API_KEY);
  if (envKey) return envKey;
  const envPath = path.join(getAuracallHomeDir(), 'api.env');
  const state = await readEnvFile(envPath);
  const primary = readString(state.values.AURACALL_API_KEY);
  if (primary) return primary;
  const keyIds = (state.values.AURACALL_API_KEY_IDS ?? '')
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  for (const keyId of keyIds) {
    const secret = readString(state.values[`AURACALL_API_KEY_${toApiAuthEnvSuffix(keyId)}`]);
    if (secret) return secret;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
