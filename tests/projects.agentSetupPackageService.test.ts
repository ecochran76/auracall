import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentTeamConfigService } from '../src/config/agentConfigService.js';
import { createAgentSetupPackageService } from '../src/projects/agentSetupPackageService.js';
import type { ProjectEnsureService } from '../src/projects/projectEnsureService.js';

describe('agent setup package service', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('ensures a project, binds an agent, and writes service plus client env files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-agent-setup-package-'));
    cleanup.push(dir);
    const configPath = path.join(dir, 'config.json');
    const envPath = path.join(dir, 'api.env');
    const clientEnvPath = path.join(dir, 'clients', 'grading.env');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        browserProfiles: {
          'wsl-chrome-3': {},
        },
        runtimeProfiles: {
          'wsl-chrome-3': {
            browserProfile: 'wsl-chrome-3',
            defaultService: 'chatgpt',
          },
        },
        agents: {
          'pro-extended-chatgpt-soylei-che4470-seminar-grading': {
            runtimeProfile: 'wsl-chrome-3',
            service: 'chatgpt',
          },
        },
      }),
      'utf8',
    );
    const agentTeamConfigService = createAgentTeamConfigService({ configPath });
    const ensureProject = vi.fn<ProjectEnsureService['ensureProject']>(async (input) => ({
      object: 'auracall_project_ensure',
      status: 'found',
      service: input.service ?? 'chatgpt',
      runtimeProfile: input.runtimeProfile ?? null,
      projectName: input.projectName,
      project: {
        id: 'proj_che447',
        name: input.projectName,
        provider: 'chatgpt',
      },
      created: false,
      agent: {
        id: input.agentId ?? 'missing',
        mutationTarget: 'registry',
        blockedReason: null,
      },
    }));
    const service = createAgentSetupPackageService({
      projectEnsureService: { ensureProject },
      agentTeamConfigService,
    });

    const result = await service.createPackage({
      service: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      projectName: 'ChE 4470/5470 Seminar Grading',
      agentId: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
      agentModelSelector: 'chatgpt:pro-extended',
      keyId: 'che447-grading',
      apiBaseUrl: 'http://auracall.localhost/v1',
      envPath,
      clientEnvPath,
    });

    expect(ensureProject).toHaveBeenCalledWith(expect.objectContaining({
      projectName: 'ChE 4470/5470 Seminar Grading',
      agentId: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
      agentModelSelector: 'chatgpt:pro-extended',
    }));
    expect(result).toMatchObject({
      object: 'auracall_agent_setup_package',
      agentId: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
      model: 'agent:pro-extended-chatgpt-soylei-che4470-seminar-grading',
      clientEnvPath,
      restartRequired: true,
      project: {
        project: {
          id: 'proj_che447',
        },
      },
      apiKey: {
        keyId: 'che447-grading',
        scopes: {
          agents: ['pro-extended-chatgpt-soylei-che4470-seminar-grading'],
          services: ['chatgpt'],
          runtimeProfiles: ['wsl-chrome-3'],
        },
      },
    });
    const env = await fs.readFile(envPath, 'utf8');
    expect(env).toContain('AURACALL_API_KEY_IDS=che447-grading');
    expect(env).toContain('AURACALL_API_KEY_CHE447_GRADING_AGENTS=pro-extended-chatgpt-soylei-che4470-seminar-grading');
    const clientEnv = await fs.readFile(clientEnvPath, 'utf8');
    expect(clientEnv).toContain('OPENAI_BASE_URL=http://auracall.localhost/v1');
    expect(clientEnv).toContain('AURACALL_MODEL=agent:pro-extended-chatgpt-soylei-che4470-seminar-grading');
    expect(clientEnv).toContain('AURACALL_BATCH_URL=http://auracall.localhost/v1/response-batches');
  });
});
