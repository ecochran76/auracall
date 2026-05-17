import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import type { AgentTeamConfigService } from './agentConfigService.js';

export interface ApiKeyIssueInput {
  agentId?: string;
  teamId?: string;
  keyId?: string;
  services?: string[];
  runtimeProfiles?: string[];
  apiBaseUrl?: string;
  envPath?: string;
  clientEnvPath?: string;
  overwrite?: boolean;
}

export interface ApiKeyIssueResult {
  object: 'auracall_api_key_issue';
  keyId: string;
  envPath: string;
  apiBaseUrl: string;
  apiKey: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  model: string;
  clientEnvPath?: string;
  clientEnv?: {
    openaiBaseUrl: string;
    openaiApiKey: string;
    auracallModel: string;
    auracallStatusUrl: string;
    auracallBatchUrl: string;
  };
  scopes: {
    agents: string[];
    teams: string[];
    services: string[];
    runtimeProfiles: string[];
  };
  restartRequired: boolean;
}

export interface ApiKeyDeleteInput {
  keyId: string;
  envPath?: string;
}

export interface ApiKeyDeleteResult {
  object: 'auracall_api_key_delete';
  keyId: string;
  envPath: string;
  deleted: boolean;
  restartRequired: boolean;
  remainingKeyIds: string[];
}

export interface EnvFileState {
  order: string[];
  values: Record<string, string>;
}

export async function deleteApiKey(input: ApiKeyDeleteInput): Promise<ApiKeyDeleteResult> {
  const keyId = normalizeKeyId(input.keyId);
  if (!keyId) {
    throw new Error('keyId is required.');
  }
  const envPath = path.resolve(input.envPath ?? path.join(getAuracallHomeDir(), 'api.env'));
  const state = await readEnvFile(envPath);
  const suffix = toApiAuthEnvSuffix(keyId);
  let deleted = false;

  const keyIds = readDelimitedValueList(state.values.AURACALL_API_KEY_IDS).filter((id) => id !== keyId);
  if ((state.values.AURACALL_API_KEY_IDS ?? '').split(/[,\s]+/).map((id) => id.trim()).filter(Boolean).includes(keyId)) {
    deleted = true;
  }
  if (keyIds.length > 0) {
    state.values.AURACALL_API_KEY_IDS = keyIds.join(',');
  } else {
    delete state.values.AURACALL_API_KEY_IDS;
  }

  const scopedKeys = [
    `AURACALL_API_KEY_${suffix}_ID`,
    `AURACALL_API_KEY_${suffix}`,
    `AURACALL_API_KEY_${suffix}_AGENTS`,
    `AURACALL_API_KEY_${suffix}_TEAMS`,
    `AURACALL_API_KEY_${suffix}_SERVICES`,
    `AURACALL_API_KEY_${suffix}_RUNTIME_PROFILES`,
  ];
  for (const key of scopedKeys) {
    if (Object.prototype.hasOwnProperty.call(state.values, key)) {
      deleted = true;
      delete state.values[key];
    }
  }

  if ((state.values.AURACALL_API_KEY_ID ?? 'env') === keyId || (!state.values.AURACALL_API_KEY_ID && keyId === 'env')) {
    for (const key of [
      'AURACALL_API_KEY_ID',
      'AURACALL_API_KEY',
      'AURACALL_API_KEY_AGENTS',
      'AURACALL_API_KEY_TEAMS',
      'AURACALL_API_KEY_SERVICES',
      'AURACALL_API_KEY_RUNTIME_PROFILES',
    ]) {
      if (Object.prototype.hasOwnProperty.call(state.values, key)) {
        deleted = true;
        delete state.values[key];
      }
    }
  }

  await writeEnvFile(envPath, state);
  return {
    object: 'auracall_api_key_delete',
    keyId,
    envPath,
    deleted,
    restartRequired: deleted,
    remainingKeyIds: readRemainingKeyIds(state.values),
  };
}

export async function issueApiKey(
  agentTeamConfigService: AgentTeamConfigService,
  input: ApiKeyIssueInput,
): Promise<ApiKeyIssueResult> {
  if (!input.agentId && !input.teamId) {
    throw new Error('agentId or teamId is required.');
  }
  const catalog = await agentTeamConfigService.effectiveCatalog();
  if (input.agentId && !catalog.agents.some((agent) => agent.id === input.agentId)) {
    throw new Error(`Unknown AuraCall agent: ${input.agentId}`);
  }
  if (input.teamId && !catalog.teams.some((team) => team.id === input.teamId)) {
    throw new Error(`Unknown AuraCall team: ${input.teamId}`);
  }

  const envPath = path.resolve(input.envPath ?? path.join(getAuracallHomeDir(), 'api.env'));
  const apiBaseUrl = input.apiBaseUrl ?? 'http://127.0.0.1:18095/v1';
  const clientEnvPath = input.clientEnvPath ? path.resolve(input.clientEnvPath) : null;
  const keyId = normalizeKeyId(input.keyId ?? input.agentId ?? input.teamId ?? 'agent');
  const suffix = toApiAuthEnvSuffix(keyId);
  const secret = `auracall_${randomBytes(32).toString('base64url')}`;
  const scopes = {
    agents: input.agentId ? [input.agentId] : [],
    teams: input.teamId ? [input.teamId] : [],
    services: input.services ?? [],
    runtimeProfiles: input.runtimeProfiles ?? [],
  };
  const state = await readEnvFile(envPath);
  if (!input.overwrite && state.values[`AURACALL_API_KEY_${suffix}`]) {
    throw new Error(`API key id already exists in ${envPath}: ${keyId}`);
  }

  state.values.AURACALL_API_AUTH_REQUIRED = '1';
  state.values.AURACALL_API_KEY_IDS = appendDelimitedValue(state.values.AURACALL_API_KEY_IDS, keyId);
  state.values[`AURACALL_API_KEY_${suffix}_ID`] = keyId;
  state.values[`AURACALL_API_KEY_${suffix}`] = secret;
  writeOptionalDelimitedValue(state.values, `AURACALL_API_KEY_${suffix}_AGENTS`, scopes.agents);
  writeOptionalDelimitedValue(state.values, `AURACALL_API_KEY_${suffix}_TEAMS`, scopes.teams);
  writeOptionalDelimitedValue(state.values, `AURACALL_API_KEY_${suffix}_SERVICES`, scopes.services);
  writeOptionalDelimitedValue(state.values, `AURACALL_API_KEY_${suffix}_RUNTIME_PROFILES`, scopes.runtimeProfiles);

  await writeEnvFile(envPath, state);

  const team = input.teamId ? catalog.teams.find((entry) => entry.id === input.teamId) : null;
  const model = input.agentId
    ? `agent:${input.agentId}`
    : team?.agentIds[0]
      ? `agent:${team.agentIds[0]}`
      : '';
  const clientEnv = createClientEnv(apiBaseUrl, secret, model);
  if (clientEnvPath) {
    await writeClientEnvFile(clientEnvPath, clientEnv);
  }

  return {
    object: 'auracall_api_key_issue',
    keyId,
    envPath,
    apiBaseUrl,
    apiKey: secret,
    openaiBaseUrl: apiBaseUrl,
    openaiApiKey: secret,
    model,
    ...(clientEnvPath ? { clientEnvPath, clientEnv } : {}),
    scopes,
    restartRequired: true,
  };
}

export async function readEnvFile(envPath: string): Promise<EnvFileState> {
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    const order: string[] = [];
    const values: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match) continue;
      order.push(match[1]);
      values[match[1]] = match[2];
    }
    return { order, values };
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return { order: [], values: {} };
    }
    throw error;
  }
}

export async function writeEnvFile(envPath: string, state: EnvFileState): Promise<void> {
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  const orderedKeys = state.order.filter((key) => Object.prototype.hasOwnProperty.call(state.values, key));
  const keys = [...orderedKeys, ...Object.keys(state.values).filter((key) => !orderedKeys.includes(key))];
  const body = [
    '# AuraCall local API credentials.',
    '# This file is user-scoped runtime state. Do not commit it.',
    ...keys.map((key) => `${key}=${state.values[key] ?? ''}`),
  ].join('\n');
  await fs.writeFile(envPath, `${body}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(envPath, 0o600);
}

export async function writeClientEnvFile(
  envPath: string,
  clientEnv: NonNullable<ApiKeyIssueResult['clientEnv']>,
): Promise<void> {
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  const body = [
    '# AuraCall client handoff.',
    '# This file contains a scoped execution key. Do not commit it.',
    `OPENAI_BASE_URL=${clientEnv.openaiBaseUrl}`,
    `OPENAI_API_KEY=${clientEnv.openaiApiKey}`,
    `AURACALL_MODEL=${clientEnv.auracallModel}`,
    `AURACALL_STATUS_URL=${clientEnv.auracallStatusUrl}`,
    `AURACALL_BATCH_URL=${clientEnv.auracallBatchUrl}`,
  ].join('\n');
  await fs.writeFile(envPath, `${body}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(envPath, 0o600);
}

export function normalizeKeyId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_.@-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
}

export function toApiAuthEnvSuffix(value: string): string {
  return normalizeKeyId(value).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'AGENT';
}

function appendDelimitedValue(existing: string | undefined, next: string): string {
  const values = (existing ?? '').split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
  if (!values.includes(next)) values.push(next);
  return values.join(',');
}

function readDelimitedValueList(value: string | undefined): string[] {
  return (value ?? '').split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function readRemainingKeyIds(values: Record<string, string>): string[] {
  const ids = readDelimitedValueList(values.AURACALL_API_KEY_IDS);
  if (values.AURACALL_API_KEY || values.AURACALL_API_KEY_ID) {
    ids.unshift(values.AURACALL_API_KEY_ID?.trim() || 'env');
  }
  return Array.from(new Set(ids));
}

function writeOptionalDelimitedValue(target: Record<string, string>, key: string, values: string[]): void {
  if (values.length > 0) {
    target[key] = values.join(',');
  } else {
    delete target[key];
  }
}

function createClientEnv(
  apiBaseUrl: string,
  apiKey: string,
  model: string,
): NonNullable<ApiKeyIssueResult['clientEnv']> {
  const baseUrl = apiBaseUrl.replace(/\/+$/, '');
  const rootUrl = baseUrl.endsWith('/v1') ? baseUrl.slice(0, -3) : baseUrl;
  return {
    openaiBaseUrl: baseUrl,
    openaiApiKey: apiKey,
    auracallModel: model,
    auracallStatusUrl: `${rootUrl}/status`,
    auracallBatchUrl: `${baseUrl}/response-batches`,
  };
}
