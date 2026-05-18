import { describe, expect, it, vi } from 'vitest';
import { createTenantPoolTeamEnsureToolHandler } from '../src/mcp/tools/tenantPoolTeamEnsure.js';
import type { TenantPoolTeamEnsureService } from '../src/projects/tenantPoolTeamEnsureService.js';

describe('mcp tenant_pool_team_ensure tool', () => {
  it('ensures a tenant-pool team and surfaces project-sync warnings', async () => {
    const ensureTeam = vi.fn<TenantPoolTeamEnsureService['ensureTeam']>(async (input) => ({
      object: 'auracall_tenant_pool_team_ensure',
      status: 'created',
      teamId: input.teamId,
      projectName: input.projectName,
      projectSync: 'none',
      teamCreated: true,
      team: {
        id: input.teamId,
        exists: true,
        type: 'dispatch-pool',
        agentIds: input.members.map((member) => member.agentId),
        mutationTarget: 'registry',
        blockedReason: null,
      },
      members: input.members.map((member) => ({
        agentId: member.agentId,
        service: member.service ?? input.service,
        runtimeProfile: member.runtimeProfile ?? null,
        project: {
          status: 'found',
          id: `proj_${member.runtimeProfile ?? 'default'}`,
          name: input.projectName,
          created: false,
        },
        agent: {
          id: member.agentId,
          mutationTarget: 'registry',
          blockedReason: null,
        },
      })),
      warnings: [
        `Tenant-pool team "${input.teamId}" uses projectSync=none; AuraCall will not reconcile project instructions, files, settings, or history between tenants.`,
      ],
      blockedReason: null,
    }));
    const handler = createTenantPoolTeamEnsureToolHandler({ ensureTeam });

    const result = await handler({
      teamId: 'che447-chatgpt-pool',
      service: 'chatgpt',
      projectName: 'ChE 4470/5470 Seminar Grading',
      agentModelSelector: 'chatgpt:pro-extended',
      members: [
        {
          agentId: 'che447-chatgpt-wsl-chrome-2',
          runtimeProfile: 'wsl-chrome-2',
        },
        {
          agentId: 'che447-chatgpt-wsl-chrome-3',
          runtimeProfile: 'wsl-chrome-3',
        },
      ],
    });

    expect(ensureTeam).toHaveBeenCalledWith({
      teamId: 'che447-chatgpt-pool',
      service: 'chatgpt',
      projectName: 'ChE 4470/5470 Seminar Grading',
      agentModelSelector: 'chatgpt:pro-extended',
      members: [
        {
          agentId: 'che447-chatgpt-wsl-chrome-2',
          runtimeProfile: 'wsl-chrome-2',
        },
        {
          agentId: 'che447-chatgpt-wsl-chrome-3',
          runtimeProfile: 'wsl-chrome-3',
        },
      ],
    });
    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'AuraCall tenant-pool team created: che447-chatgpt-pool. projectSync=none.',
        },
      ],
      structuredContent: {
        object: 'auracall_tenant_pool_team_ensure',
        status: 'created',
        teamId: 'che447-chatgpt-pool',
        projectSync: 'none',
      },
    });
  });

  it('marks blocked setup results as MCP errors', async () => {
    const ensureTeam = vi.fn<TenantPoolTeamEnsureService['ensureTeam']>(async (input) => ({
      object: 'auracall_tenant_pool_team_ensure',
      status: 'blocked',
      teamId: input.teamId,
      projectName: input.projectName,
      projectSync: 'none',
      teamCreated: false,
      team: {
        id: input.teamId,
        exists: true,
        type: 'workflow',
        agentIds: ['workflow-agent'],
        mutationTarget: 'blocked',
        blockedReason: 'Team is not a dispatch-pool.',
      },
      members: [],
      warnings: [],
      blockedReason: 'Team is not a dispatch-pool.',
    }));
    const handler = createTenantPoolTeamEnsureToolHandler({ ensureTeam });

    const result = await handler({
      teamId: 'che447-chatgpt-pool',
      service: 'chatgpt',
      projectName: 'ChE 4470/5470 Seminar Grading',
      members: [
        {
          agentId: 'che447-chatgpt-wsl-chrome-3',
          runtimeProfile: 'wsl-chrome-3',
        },
      ],
    });

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        status: 'blocked',
        blockedReason: 'Team is not a dispatch-pool.',
      },
    });
  });
});
