import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAuracallHomeDir } from '../../auracallHome.js';
import { readApiKeyDiagnosticsFromEnvValues } from '../../config/apiKeyEnvDiagnostics.js';
import { deleteApiKey, issueApiKey, readEnvFile } from '../../config/apiKeyIssuer.js';
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
  clientEnvPath: z.string().trim().min(1).optional(),
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
  clientEnvPath: z.string().optional(),
  clientEnv: z.object({
    openaiBaseUrl: z.string(),
    openaiApiKey: z.string(),
    auracallModel: z.string(),
    auracallStatusUrl: z.string(),
    auracallBatchUrl: z.string(),
  }).optional(),
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

const apiKeyDeleteInputShape = {
  keyId: z.string().trim().min(1),
  envPath: z.string().trim().min(1).optional(),
} satisfies z.ZodRawShape;

const apiKeyDeleteOutputShape = {
  object: z.literal('auracall_api_key_delete'),
  keyId: z.string(),
  envPath: z.string(),
  deleted: z.boolean(),
  restartRequired: z.boolean(),
  remainingKeyIds: z.array(z.string()),
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
        'Create a user-scoped AuraCall API key in ~/.auracall/api.env with optional agent/team/service/runtime-profile scopes and an optional client env handoff file.',
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

  server.registerTool(
    'api_key_delete',
    {
      title: 'Delete an AuraCall API key',
      description:
        'Remove a user-scoped AuraCall API key from ~/.auracall/api.env by key id without reading or returning the secret. Restart auracall-api.service afterward.',
      inputSchema: apiKeyDeleteInputShape,
      outputSchema: apiKeyDeleteOutputShape,
    },
    createApiKeyDeleteToolHandler(),
  );
}

export function createApiKeyIssueToolHandler(agentTeamConfigService: AgentTeamConfigService) {
  return async (input: unknown) => {
    const payload = apiKeyIssueInputSchema.parse(input);
    const structuredContent = await issueApiKey(agentTeamConfigService, payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: structuredContent.clientEnvPath
            ? `Issued AuraCall API key ${structuredContent.keyId} and wrote client handoff ${structuredContent.clientEnvPath}. Restart auracall-api.service for systemd to reload ${structuredContent.envPath}.`
            : `Issued AuraCall API key ${structuredContent.keyId}. Restart auracall-api.service for systemd to reload ${structuredContent.envPath}.`,
        },
      ],
      structuredContent: structuredContent as unknown as Record<string, unknown>,
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

export function createApiKeyDeleteToolHandler() {
  return async (input: unknown) => {
    const payload = z.object(apiKeyDeleteInputShape).parse(input ?? {});
    const structuredContent = await deleteApiKey(payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: structuredContent.deleted
            ? `Deleted AuraCall API key ${structuredContent.keyId} from ${structuredContent.envPath}. Restart auracall-api.service for the change to take effect.`
            : `No AuraCall API key ${structuredContent.keyId} was found in ${structuredContent.envPath}.`,
        },
      ],
      structuredContent: structuredContent as unknown as Record<string, unknown>,
    };
  };
}
