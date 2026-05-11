import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  agentConfigUpsertInputSchema,
  createAgentTeamConfigService,
  type AgentTeamConfigService,
  teamConfigUpsertInputSchema,
} from '../../config/agentConfigService.js';
import { AgentConfigSchema, TeamConfigSchema } from '../../schema/types.js';

const configListInputShape = {} satisfies z.ZodRawShape;

const configAgentUpsertInputShape = {
  id: z.string().trim().min(1),
  config: AgentConfigSchema,
} satisfies z.ZodRawShape;

const configTeamUpsertInputShape = {
  id: z.string().trim().min(1),
  config: TeamConfigSchema,
} satisfies z.ZodRawShape;

const configDeleteInputShape = {
  id: z.string().trim().min(1),
} satisfies z.ZodRawShape;

const configEntityOutputShape = {
  object: z.literal('auracall_config_entity'),
  kind: z.enum(['agent', 'team']),
  action: z.enum(['list', 'upsert', 'delete']),
  id: z.string().nullable(),
  configPath: z.string(),
  registryPath: z.string().nullable(),
  agents: z.array(z.record(z.string(), z.unknown())),
  teams: z.array(z.record(z.string(), z.unknown())),
  conflicts: z.array(z.record(z.string(), z.unknown())),
} satisfies z.ZodRawShape;

export interface RegisterConfigEntityToolsDeps {
  service?: AgentTeamConfigService;
}

export function registerConfigEntityTools(
  server: McpServer,
  deps: RegisterConfigEntityToolsDeps = {},
): void {
  const service = deps.service ?? createAgentTeamConfigService();

  server.registerTool(
    'config_entities_list',
    {
      title: 'List configured AuraCall agents and teams',
      description: 'List configured AuraCall agent and team routing entries from the writable user config.',
      inputSchema: configListInputShape,
      outputSchema: configEntityOutputShape,
    },
    createConfigEntitiesListToolHandler(service),
  );

  server.registerTool(
    'config_agent_upsert',
    {
      title: 'Create or update an AuraCall agent config',
      description:
        'Create or update one AuraCall agent. Agents can bind runtimeProfile, service, model/modelSelector, project, knowledge, and prompt fields.',
      inputSchema: configAgentUpsertInputShape,
      outputSchema: configEntityOutputShape,
    },
    createConfigAgentUpsertToolHandler(service),
  );

  server.registerTool(
    'config_agent_delete',
    {
      title: 'Delete an AuraCall agent config',
      description: 'Delete one AuraCall agent from the writable user config.',
      inputSchema: configDeleteInputShape,
      outputSchema: configEntityOutputShape,
    },
    createConfigAgentDeleteToolHandler(service),
  );

  server.registerTool(
    'config_team_upsert',
    {
      title: 'Create or update an AuraCall team config',
      description: 'Create or update one AuraCall team and its agent membership/role config.',
      inputSchema: configTeamUpsertInputShape,
      outputSchema: configEntityOutputShape,
    },
    createConfigTeamUpsertToolHandler(service),
  );

  server.registerTool(
    'config_team_delete',
    {
      title: 'Delete an AuraCall team config',
      description: 'Delete one AuraCall team from the writable user config.',
      inputSchema: configDeleteInputShape,
      outputSchema: configEntityOutputShape,
    },
    createConfigTeamDeleteToolHandler(service),
  );
}

export function createConfigEntitiesListToolHandler(service: AgentTeamConfigService) {
  return async (_input: unknown) => formatResult(await service.list());
}

export function createConfigAgentUpsertToolHandler(service: AgentTeamConfigService) {
  return async (input: unknown) => {
    const payload = agentConfigUpsertInputSchema.parse(input);
    return formatResult(await service.upsertAgent(payload));
  };
}

export function createConfigAgentDeleteToolHandler(service: AgentTeamConfigService) {
  return async (input: unknown) => {
    const payload = z.object(configDeleteInputShape).parse(input);
    return formatResult(await service.deleteAgent(payload.id));
  };
}

export function createConfigTeamUpsertToolHandler(service: AgentTeamConfigService) {
  return async (input: unknown) => {
    const payload = teamConfigUpsertInputSchema.parse(input);
    return formatResult(await service.upsertTeam(payload));
  };
}

export function createConfigTeamDeleteToolHandler(service: AgentTeamConfigService) {
  return async (input: unknown) => {
    const payload = z.object(configDeleteInputShape).parse(input);
    return formatResult(await service.deleteTeam(payload.id));
  };
}

function formatResult(result: Awaited<ReturnType<AgentTeamConfigService['list']>>) {
  const subject = result.id ? `${result.kind} ${result.id}` : 'agents and teams';
  return {
    isError: false,
    content: [
      {
        type: 'text' as const,
        text: `AuraCall config ${result.action}: ${subject}.`,
      },
    ],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}
