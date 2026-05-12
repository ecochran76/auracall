import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAuracallHomeDir } from '../../auracallHome.js';
import { readApiKeyDiagnosticsFromEnvValues } from '../../config/apiKeyEnvDiagnostics.js';
import { issueApiKey, readEnvFile } from '../../config/apiKeyIssuer.js';
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
    const structuredContent = await issueApiKey(agentTeamConfigService, payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Issued AuraCall API key ${structuredContent.keyId}. Restart auracall-api.service for systemd to reload ${structuredContent.envPath}.`,
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
