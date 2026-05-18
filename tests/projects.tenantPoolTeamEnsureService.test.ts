import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentTeamConfigService } from '../src/config/agentConfigService.js';
import {
  createProjectEnsureService,
  type ProjectEnsureService,
} from '../src/projects/projectEnsureService.js';
import {
  createTenantPoolTeamEnsureService,
} from '../src/projects/tenantPoolTeamEnsureService.js';

describe('tenant-pool team ensure service', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('ensures per-tenant project agents and creates a dispatch-pool team once', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-tenant-pool-team-'));
    cleanup.push(dir);
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        browserProfiles: {
          'wsl-chrome-1': {},
          'wsl-chrome-2': {},
          'wsl-chrome-3': {},
        },
        runtimeProfiles: {
          'wsl-chrome-1': {
            browserProfile: 'wsl-chrome-1',
            defaultService: 'chatgpt',
          },
          'wsl-chrome-2': {
            browserProfile: 'wsl-chrome-2',
            defaultService: 'chatgpt',
          },
          'wsl-chrome-3': {
            browserProfile: 'wsl-chrome-3',
            defaultService: 'chatgpt',
          },
        },
      }),
      'utf8',
    );
    const agentTeamConfigService = createAgentTeamConfigService({ configPath });
    const createProject = vi.fn(async (input: { name: string }, runtimeProfile: string | null) => ({
      id: `proj_${runtimeProfile ?? 'default'}`,
      name: input.name,
      provider: 'chatgpt' as const,
    }));
    const projectEnsureService = createProjectEnsureService({
      configService: agentTeamConfigService,
      createProjectClient: ({ runtimeProfile }) => ({
        listProjects: async () => [],
        createProject: (input) => createProject(input, runtimeProfile),
      }),
    });
    const service = createTenantPoolTeamEnsureService({
      projectEnsureService,
      agentTeamConfigService,
    });

    const result = await service.ensureTeam({
      teamId: 'che447-chatgpt-pool',
      service: 'chatgpt',
      projectName: 'ChE 4470/5470 Seminar Grading',
      agentModelSelector: 'chatgpt:pro-extended',
      teamDescription: 'Course grading pool across ChatGPT tenants.',
      members: [
        {
          agentId: 'che447-chatgpt-wsl-chrome-1',
          runtimeProfile: 'wsl-chrome-1',
        },
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
      object: 'auracall_tenant_pool_team_ensure',
      status: 'created',
      teamCreated: true,
      team: {
        id: 'che447-chatgpt-pool',
        type: 'dispatch-pool',
        agentIds: [
          'che447-chatgpt-wsl-chrome-1',
          'che447-chatgpt-wsl-chrome-2',
          'che447-chatgpt-wsl-chrome-3',
        ],
        mutationTarget: 'config',
      },
    });
    expect(createProject).toHaveBeenCalledTimes(3);
    const effectiveConfig = await agentTeamConfigService.effectiveConfig();
    expect(effectiveConfig).toMatchObject({
      agents: {
        'che447-chatgpt-wsl-chrome-1': {
          runtimeProfile: 'wsl-chrome-1',
          service: 'chatgpt',
          projectId: 'proj_wsl-chrome-1',
          projectName: 'ChE 4470/5470 Seminar Grading',
          modelSelector: 'chatgpt:pro-extended',
        },
        'che447-chatgpt-wsl-chrome-2': {
          runtimeProfile: 'wsl-chrome-2',
          projectId: 'proj_wsl-chrome-2',
          modelSelector: 'chatgpt:pro-extended',
        },
        'che447-chatgpt-wsl-chrome-3': {
          runtimeProfile: 'wsl-chrome-3',
          projectId: 'proj_wsl-chrome-3',
          modelSelector: 'chatgpt:pro-extended',
        },
      },
      teams: {
        'che447-chatgpt-pool': {
          type: 'dispatch-pool',
          agents: [
            'che447-chatgpt-wsl-chrome-1',
            'che447-chatgpt-wsl-chrome-2',
            'che447-chatgpt-wsl-chrome-3',
          ],
          dispatch: {
            mode: 'next_available',
            projectSync: 'none',
          },
          project: {
            name: 'ChE 4470/5470 Seminar Grading',
            createIfMissing: true,
            sync: 'none',
          },
        },
      },
    });
    expect(result.warnings).toContain(
      'Tenant-pool team "che447-chatgpt-pool" uses projectSync=none; AuraCall will not reconcile project instructions, files, settings, or history between tenants.',
    );
  });

  it('leaves existing dispatch-pool membership unchanged', async () => {
    const service = await createServiceFromConfig({
      teams: {
        'che447-chatgpt-pool': {
          type: 'dispatch-pool',
          agents: ['existing-agent'],
          dispatch: {
            mode: 'next_available',
            projectSync: 'none',
          },
          project: {
            name: 'ChE 4470/5470 Seminar Grading',
            sync: 'none',
          },
        },
      },
    });

    const result = await service.ensureTeam({
      teamId: 'che447-chatgpt-pool',
      service: 'chatgpt',
      projectName: 'ChE 4470/5470 Seminar Grading',
      members: [
        {
          agentId: 'new-agent',
          runtimeProfile: 'wsl-chrome-3',
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'found',
      teamCreated: false,
      team: {
        agentIds: ['existing-agent'],
        mutationTarget: null,
      },
    });
    expect(result.warnings).toContain(
      'Team "che447-chatgpt-pool" already exists, so AuraCall left its membership unchanged instead of rewriting the dispatch pool.',
    );
    expect(await service.readTeamAgentIds()).toEqual(['existing-agent']);
  });

  it('blocks before project mutation when the requested team id is not a dispatch-pool', async () => {
    const ensureProject = vi.fn<ProjectEnsureService['ensureProject']>();
    const service = await createServiceFromConfig(
      {
        teams: {
          'che447-chatgpt-pool': {
            type: 'workflow',
            agents: ['workflow-agent'],
          },
        },
      },
      ensureProject,
    );

    const result = await service.ensureTeam({
      teamId: 'che447-chatgpt-pool',
      service: 'chatgpt',
      projectName: 'ChE 4470/5470 Seminar Grading',
      members: [
        {
          agentId: 'tenant-agent',
          runtimeProfile: 'wsl-chrome-3',
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'blocked',
      blockedReason:
        'Team che447-chatgpt-pool already exists as type "workflow" and cannot be reused as a dispatch-pool team.',
      team: {
        type: 'workflow',
        mutationTarget: 'blocked',
      },
    });
    expect(ensureProject).not.toHaveBeenCalled();
  });

  async function createServiceFromConfig(
    config: Record<string, unknown>,
    ensureProject: ProjectEnsureService['ensureProject'] = vi.fn(async (input) => ({
      object: 'auracall_project_ensure' as const,
      status: 'found' as const,
      service: input.service ?? 'chatgpt',
      runtimeProfile: input.runtimeProfile ?? null,
      projectName: input.projectName,
      project: {
        id: `proj_${input.runtimeProfile ?? 'default'}`,
        name: input.projectName,
        provider: input.service ?? 'chatgpt',
      },
      created: false,
      agent: {
        id: input.agentId ?? 'agent',
        mutationTarget: 'config' as const,
        blockedReason: null,
      },
    })),
  ) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-tenant-pool-existing-'));
    cleanup.push(dir);
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config), 'utf8');
    const agentTeamConfigService = createAgentTeamConfigService({ configPath });
    const service = createTenantPoolTeamEnsureService({
      projectEnsureService: { ensureProject },
      agentTeamConfigService,
    });
    return {
      ensureTeam: service.ensureTeam,
      readTeamAgentIds: async () => {
        const catalog = await agentTeamConfigService.effectiveCatalog();
        return catalog.teams.find((team) => team.id === 'che447-chatgpt-pool')?.agentIds ?? [];
      },
    };
  }
});
