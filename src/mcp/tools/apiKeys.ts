import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAuracallHomeDir } from '../../auracallHome.js';
import { readApiKeyDiagnosticsFromEnvValues } from '../../config/apiKeyEnvDiagnostics.js';
import type {
  AgentTeamConfigService,
} from '../../config/agentConfigService.js';

const apiKeyIssueInputShape = {
  agentId: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
  keyId: z.string().trim().min(1).optional(),
  services: z.array(z.string().trim().min(1)).optional(),
  runtimeProfiles: z.array(z.string().trim().min(1)).optional(),
  apiBaseUrl: z.string().trim().min(1).optional(),
  envPath: z.string().trim().min(1).optional(),
  overwrite: z.boolean().optional(),
} satisfies z.ZodRawShape;

const apiKeyIssueInputSchema = z.object(apiKeyIssueInputShape).refine(
  (value) => Boolean(value.agentId || value.teamId),
  'agentId or teamId is required.',
);

const apiKeyIssueOutputShape = {
  object: z.literal('auracall_api_key_issue'),
  keyId: z.string(),
  envPath: z.string(),
  apiBaseUrl: z.string(),
  apiKey: z.string(),
  openaiBaseUrl: z.string(),
  openaiApiKey: z.string(),
  model: z.string(),
  scopes: z.object({
    agents: z.array(z.string()),
    teams: z.array(z.string()),
    services: z.array(z.string()),
    runtimeProfiles: z.array(z.string()),
  }),
  restartRequired: z.boolean(),
} satisfies z.ZodRawShape;

const apiKeyDiagnosticsInputShape = {
  envPath: z.string().trim().min(1).optional(),
} satisfies z.ZodRawShape;

const apiKeyDiagnosticsOutputShape = {
  object: z.literal('auracall_agent_registry_diagnostics'),
  ok: z.boolean(),
  envPath: z.string(),
  configPath: z.string(),
  registryPath: z.string().nullable(),
  metrics: z.record(z.string(), z.unknown()),
  apiKeys: z.array(z.record(z.string(), z.unknown())),
  disabledRegistryAgents: z.array(z.string()),
  disabledRegistryTeams: z.array(z.string()),
  conflicts: z.array(z.record(z.string(), z.unknown())),
  configIssues: z.array(z.record(z.string(), z.unknown())),
  issues: z.array(z.record(z.string(), z.unknown())),
} satisfies z.ZodRawShape;

export interface RegisterApiKeyToolsDeps {
  agentTeamConfigService: AgentTeamConfigService;
}

export function registerApiKeyTools(
  server: McpServer,
  deps: RegisterApiKeyToolsDeps,
): void {
  server.registerTool(
    'api_key_issue',
    {
      title: 'Issue an AuraCall API key',
      description:
        'Create a user-scoped AuraCall API key in ~/.auracall/api.env with optional agent/team/service/runtime-profile scopes.',
      inputSchema: apiKeyIssueInputShape,
      outputSchema: apiKeyIssueOutputShape,
    },
    createApiKeyIssueToolHandler(deps.agentTeamConfigService),
  );

  server.registerTool(
    'api_key_diagnostics',
    {
      title: 'Diagnose AuraCall API keys',
      description:
        'Read user-scoped AuraCall API key metadata from ~/.auracall/api.env and report agent/team scope health without exposing secrets.',
      inputSchema: apiKeyDiagnosticsInputShape,
      outputSchema: apiKeyDiagnosticsOutputShape,
    },
    createApiKeyDiagnosticsToolHandler(deps.agentTeamConfigService),
  );
}

export function createApiKeyIssueToolHandler(agentTeamConfigService: AgentTeamConfigService) {
  return async (input: unknown) => {
    const payload = apiKeyIssueInputSchema.parse(input);
    const catalog = await agentTeamConfigService.effectiveCatalog();
    if (payload.agentId && !catalog.agents.some((agent) => agent.id === payload.agentId)) {
      throw new Error(`Unknown AuraCall agent: ${payload.agentId}`);
    }
    if (payload.teamId && !catalog.teams.some((team) => team.id === payload.teamId)) {
      throw new Error(`Unknown AuraCall team: ${payload.teamId}`);
    }

    const envPath = path.resolve(payload.envPath ?? path.join(getAuracallHomeDir(), 'api.env'));
    const apiBaseUrl = payload.apiBaseUrl ?? 'http://127.0.0.1:18095/v1';
    const keyId = normalizeKeyId(payload.keyId ?? payload.agentId ?? payload.teamId ?? 'agent');
    const suffix = toApiAuthEnvSuffix(keyId);
    const secret = `auracall_${randomBytes(32).toString('base64url')}`;
    const scopes = {
      agents: payload.agentId ? [payload.agentId] : [],
      teams: payload.teamId ? [payload.teamId] : [],
      services: payload.services ?? [],
      runtimeProfiles: payload.runtimeProfiles ?? [],
    };
    const state = await readEnvFile(envPath);
    if (!payload.overwrite && state.values[`AURACALL_API_KEY_${suffix}`]) {
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

    const team = payload.teamId ? catalog.teams.find((entry) => entry.id === payload.teamId) : null;
    const model = payload.agentId
      ? `agent:${payload.agentId}`
      : team?.agentIds[0]
        ? `agent:${team.agentIds[0]}`
        : '';
    const structuredContent = {
      object: 'auracall_api_key_issue' as const,
      keyId,
      envPath,
      apiBaseUrl,
      apiKey: secret,
      openaiBaseUrl: apiBaseUrl,
      openaiApiKey: secret,
      model,
      scopes,
      restartRequired: true,
    };
    return {
      content: [
        {
          type: 'text' as const,
          text: `Issued AuraCall API key ${keyId}. Restart auracall-api.service for systemd to reload ${envPath}.`,
        },
      ],
      structuredContent,
    };
  };
}

export function createApiKeyDiagnosticsToolHandler(agentTeamConfigService: AgentTeamConfigService) {
  return async (input: unknown) => {
    const payload = z.object(apiKeyDiagnosticsInputShape).parse(input ?? {});
    const envPath = path.resolve(payload.envPath ?? path.join(getAuracallHomeDir(), 'api.env'));
    const state = await readEnvFile(envPath);
    const diagnostics = await agentTeamConfigService.diagnostics({
      apiKeys: readApiKeyDiagnosticsFromEnvValues(state.values),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: `AuraCall API key diagnostics: ${diagnostics.metrics.warnings} warning(s), ${diagnostics.metrics.apiKeys} key(s), env ${envPath}.`,
        },
      ],
      structuredContent: {
        ...diagnostics,
        envPath,
      },
    };
  };
}

interface EnvFileState {
  order: string[];
  values: Record<string, string>;
}

async function readEnvFile(envPath: string): Promise<EnvFileState> {
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

async function writeEnvFile(envPath: string, state: EnvFileState): Promise<void> {
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  const keys = [...state.order, ...Object.keys(state.values).filter((key) => !state.order.includes(key))];
  const body = [
    '# AuraCall local API credentials.',
    '# This file is user-scoped runtime state. Do not commit it.',
    ...keys.map((key) => `${key}=${state.values[key] ?? ''}`),
  ].join('\n');
  await fs.writeFile(envPath, `${body}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(envPath, 0o600);
}

function normalizeKeyId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_.@-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
}

function toApiAuthEnvSuffix(value: string): string {
  return normalizeKeyId(value).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'AGENT';
}

function appendDelimitedValue(existing: string | undefined, next: string): string {
  const values = (existing ?? '').split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
  if (!values.includes(next)) values.push(next);
  return values.join(',');
}

function writeOptionalDelimitedValue(target: Record<string, string>, key: string, values: string[]): void {
  if (values.length > 0) {
    target[key] = values.join(',');
  } else {
    delete target[key];
  }
}
