import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  TenantPoolTeamEnsureInputSchema,
  type TenantPoolTeamEnsureService,
} from '../../projects/tenantPoolTeamEnsureService.js';

const tenantPoolTeamEnsureInputShape = TenantPoolTeamEnsureInputSchema.shape satisfies z.ZodRawShape;

const tenantPoolTeamEnsureOutputShape = {
  object: z.literal('auracall_tenant_pool_team_ensure'),
  status: z.enum(['created', 'found', 'blocked']),
  teamId: z.string(),
  projectName: z.string(),
  projectSync: z.literal('none'),
  teamCreated: z.boolean(),
  team: z.object({
    id: z.string(),
    exists: z.boolean(),
    type: z.enum(['workflow', 'dispatch-pool']).nullable(),
    agentIds: z.array(z.string()),
    mutationTarget: z.enum(['config', 'registry', 'blocked']).nullable(),
    blockedReason: z.string().nullable(),
  }),
  members: z.array(z.record(z.string(), z.unknown())),
  warnings: z.array(z.string()),
  blockedReason: z.string().nullable(),
} satisfies z.ZodRawShape;

export interface RegisterTenantPoolTeamEnsureToolDeps {
  service: TenantPoolTeamEnsureService;
}

export function registerTenantPoolTeamEnsureTool(
  server: McpServer,
  deps: RegisterTenantPoolTeamEnsureToolDeps,
): void {
  server.registerTool(
    'tenant_pool_team_ensure',
    {
      title: 'Ensure AuraCall tenant-pool team',
      description:
        'Privileged setup helper that ensures project-bound agents across tenant runtime profiles and creates a dispatch-pool team when it does not already exist.',
      inputSchema: tenantPoolTeamEnsureInputShape,
      outputSchema: tenantPoolTeamEnsureOutputShape,
    },
    createTenantPoolTeamEnsureToolHandler(deps.service),
  );
}

export function createTenantPoolTeamEnsureToolHandler(service: TenantPoolTeamEnsureService) {
  return async (input: unknown) => {
    const payload = TenantPoolTeamEnsureInputSchema.parse(input);
    const result = await service.ensureTeam(payload);
    return {
      isError: result.status === 'blocked',
      content: [
        {
          type: 'text' as const,
          text: `AuraCall tenant-pool team ${result.status}: ${result.teamId}. projectSync=${result.projectSync}.`,
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  };
}
