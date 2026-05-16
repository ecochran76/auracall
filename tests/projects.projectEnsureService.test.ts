import { describe, expect, it, vi } from 'vitest';
import { createProjectEnsureService } from '../src/projects/projectEnsureService.js';
import type { AgentTeamConfigService } from '../src/config/agentConfigService.js';

describe('project ensure service', () => {
  it('returns an existing project without creating a duplicate', async () => {
    const createProject = vi.fn();
    const service = createProjectEnsureService({
      createProjectClient: () => ({
        listProjects: async () => [
          {
            id: 'proj_che4470',
            name: 'ChE 4470/5470 Seminar Grading',
            provider: 'chatgpt',
            url: 'https://chatgpt.com/g/proj_che4470/project',
          },
        ],
        createProject,
      }),
    });

    await expect(
      service.ensureProject({
        service: 'chatgpt',
        runtimeProfile: 'wsl-chrome-3',
        projectName: 'ChE 4470/5470 Seminar Grading',
      }),
    ).resolves.toMatchObject({
      object: 'auracall_project_ensure',
      status: 'found',
      created: false,
      runtimeProfile: 'wsl-chrome-3',
      project: {
        id: 'proj_che4470',
      },
    });
    expect(createProject).not.toHaveBeenCalled();
  });

  it('creates a missing project and binds a deterministic agent', async () => {
    const upsertAgent = vi.fn(async () => ({
      object: 'auracall_config_entity' as const,
      kind: 'agent' as const,
      action: 'upsert' as const,
      id: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
      configPath: '/tmp/config.json',
      registryPath: '/tmp/registry.sqlite',
      mutationTarget: 'registry' as const,
      blockedReason: null,
      agents: [],
      teams: [],
      conflicts: [],
    }));
    const configService = {
      upsertAgent,
    } as unknown as AgentTeamConfigService;
    const createProject = vi.fn(async () => ({
      id: 'proj_created',
      name: 'ChE 4470/5470 Seminar Grading',
      provider: 'chatgpt' as const,
      url: 'https://chatgpt.com/g/proj_created/project',
    }));
    const service = createProjectEnsureService({
      configService,
      createProjectClient: () => ({
        listProjects: async () => [],
        createProject,
      }),
    });

    await expect(
      service.ensureProject({
        service: 'chatgpt',
        runtimeProfile: 'wsl-chrome-3',
        projectName: 'ChE 4470/5470 Seminar Grading',
        instructions: 'Course grading project.',
        modelLabel: 'ChatGPT Pro',
        memoryMode: 'project',
        agentId: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
        agentModelSelector: 'chatgpt:pro-extended',
        agentDescription: 'ChE seminar grading agent.',
      }),
    ).resolves.toMatchObject({
      status: 'created',
      created: true,
      project: {
        id: 'proj_created',
      },
      agent: {
        id: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
        mutationTarget: 'registry',
      },
    });
    expect(createProject).toHaveBeenCalledWith({
      name: 'ChE 4470/5470 Seminar Grading',
      instructions: 'Course grading project.',
      modelLabel: 'ChatGPT Pro',
      memoryMode: 'project',
    });
    expect(upsertAgent).toHaveBeenCalledWith({
      id: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
      config: expect.objectContaining({
        runtimeProfile: 'wsl-chrome-3',
        service: 'chatgpt',
        projectId: 'proj_created',
        projectName: 'ChE 4470/5470 Seminar Grading',
        modelSelector: 'chatgpt:pro-extended',
      }),
    });
  });

  it('fails project listing with a bounded diagnostic when the browser path stalls', async () => {
    const service = createProjectEnsureService({
      createProjectClient: () => ({
        listProjects: () => new Promise(() => undefined),
        createProject: vi.fn(),
      }),
    });

    await expect(
      service.ensureProject({
        service: 'chatgpt',
        runtimeProfile: 'wsl-chrome-3',
        projectName: 'Lei',
        timeoutMs: 5,
      }),
    ).rejects.toThrow('Project listing timed out after 5ms for chatgpt/wsl-chrome-3.');
  });
});
