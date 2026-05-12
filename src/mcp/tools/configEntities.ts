import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  agentConfigUpsertInputSchema,
  agentRegistrySnapshotSchema,
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

const configSnapshotExportInputShape = {
  agents: z.array(z.string().trim().min(1)).optional(),
  teams: z.array(z.string().trim().min(1)).optional(),
  all: z.boolean().optional(),
} satisfies z.ZodRawShape;

const configSnapshotImportInputShape = {
  snapshot: agentRegistrySnapshotSchema,
  dryRun: z.boolean().optional(),
} satisfies z.ZodRawShape;

const configEntityOutputShape = {
  object: z.literal('auracall_config_entity'),
  kind: z.enum(['agent', 'team']),
  action: z.enum(['list', 'upsert', 'delete']),
  id: z.string().nullable(),
  configPath: z.string(),
  registryPath: z.string().nullable(),
  mutationTarget: z.enum(['config', 'registry', 'blocked']).nullable(),
  blockedReason: z.string().nullable(),
  agents: z.array(z.record(z.string(), z.unknown())),
  teams: z.array(z.record(z.string(), z.unknown())),
  conflicts: z.array(z.record(z.string(), z.unknown())),
} satisfies z.ZodRawShape;

const configSnapshotOutputShape = {
  object: z.literal('auracall_agent_registry_snapshot'),
  version: z.literal(1),
  exportedAt: z.string(),
  agents: z.array(z.record(z.string(), z.unknown())),
  teams: z.array(z.record(z.string(), z.unknown())),
} satisfies z.ZodRawShape;

const configSnapshotImportOutputShape = {
  object: z.literal('auracall_agent_registry_snapshot_import'),
  dryRun: z.boolean(),
  importedAgents: z.array(z.string()),
  importedTeams: z.array(z.string()),
  blockedAgents: z.array(z.string()),
  blockedTeams: z.array(z.string()),
  configPath: z.string(),
  registryPath: z.string().nullable(),
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
      description: 'List effective AuraCall agent and team routing entries from config overlays and the user-scoped registry.',
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
        'Create or update one AuraCall registry agent. Agents can bind runtimeProfile, service, model/modelSelector, project, knowledge, and prompt fields.',
      inputSchema: configAgentUpsertInputShape,
      outputSchema: configEntityOutputShape,
    },
    createConfigAgentUpsertToolHandler(service),
  );

  server.registerTool(
    'config_agent_delete',
    {
      title: 'Delete an AuraCall agent config',
      description: 'Disable one AuraCall registry agent. Config-defined overlay agents are pinned and return a blocked mutation result.',
      inputSchema: configDeleteInputShape,
      outputSchema: configEntityOutputShape,
    },
    createConfigAgentDeleteToolHandler(service),
  );

  server.registerTool(
    'config_team_upsert',
    {
      title: 'Create or update an AuraCall team config',
      description: 'Create or update one AuraCall registry team and its agent membership/role config.',
      inputSchema: configTeamUpsertInputShape,
      outputSchema: configEntityOutputShape,
    },
    createConfigTeamUpsertToolHandler(service),
  );

  server.registerTool(
    'config_team_delete',
    {
      title: 'Delete an AuraCall team config',
      description: 'Disable one AuraCall registry team. Config-defined overlay teams are pinned and return a blocked mutation result.',
      inputSchema: configDeleteInputShape,
      outputSchema: configEntityOutputShape,
    },
    createConfigTeamDeleteToolHandler(service),
  );

  server.registerTool(
    'config_snapshot_export',
    {
      title: 'Export AuraCall agents and teams',
      description: 'Export selected effective agents and teams to a reviewable snapshot object.',
      inputSchema: configSnapshotExportInputShape,
      outputSchema: configSnapshotOutputShape,
    },
    createConfigSnapshotExportToolHandler(service),
  );

  server.registerTool(
    'config_snapshot_import',
    {
      title: 'Import AuraCall agents and teams',
      description: 'Import a reviewable agent/team snapshot into the user-scoped registry.',
      inputSchema: configSnapshotImportInputShape,
      outputSchema: configSnapshotImportOutputShape,
    },
    createConfigSnapshotImportToolHandler(service),
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

export function createConfigSnapshotExportToolHandler(service: AgentTeamConfigService) {
  return async (input: unknown) => {
    const payload = z.object(configSnapshotExportInputShape).parse(input ?? {});
    if (!payload.all && !payload.agents?.length && !payload.teams?.length) {
      throw new Error('Select at least one agent/team or set all=true.');
    }
    const snapshot = await service.exportSnapshot({
      agents: payload.all ? undefined : payload.agents,
      teams: payload.all ? undefined : payload.teams,
    });
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: `AuraCall snapshot export: ${snapshot.agents.length} agent(s), ${snapshot.teams.length} team(s).`,
        },
      ],
      structuredContent: snapshot as unknown as Record<string, unknown>,
    };
  };
}

export function createConfigSnapshotImportToolHandler(service: AgentTeamConfigService) {
  return async (input: unknown) => {
    const payload = z.object(configSnapshotImportInputShape).parse(input);
    const result = await service.importSnapshot({
      snapshot: payload.snapshot,
      dryRun: payload.dryRun,
    });
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: `AuraCall snapshot import: ${result.importedAgents.length} agent(s), ${result.importedTeams.length} team(s), ${result.blockedAgents.length + result.blockedTeams.length} blocked.`,
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
    };
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
