import { describe, expect, it, vi } from 'vitest';
import { createAgentSetupPackageToolHandler } from '../src/mcp/tools/agentSetupPackage.js';
import type { AgentSetupPackageService } from '../src/projects/agentSetupPackageService.js';

describe('mcp agent_setup_package_create tool', () => {
  it('creates a composed setup package and returns the client handoff path', async () => {
    const createPackage = vi.fn<AgentSetupPackageService['createPackage']>(async (input) => ({
      object: 'auracall_agent_setup_package',
      agentId: input.agentId,
      model: `agent:${input.agentId}`,
      clientEnvPath: input.clientEnvPath,
      restartRequired: true,
      project: {
        object: 'auracall_project_ensure',
        status: 'created',
        service: input.service,
        runtimeProfile: input.runtimeProfile ?? null,
        projectName: input.projectName,
        project: {
          id: 'proj_created',
          name: input.projectName,
          provider: input.service,
        },
        created: true,
        agent: {
          id: input.agentId,
          mutationTarget: 'registry',
          blockedReason: null,
        },
      },
      apiKey: {
        object: 'auracall_api_key_issue',
        keyId: input.keyId ?? input.agentId,
        envPath: '/home/ecochran76/.auracall/api.env',
        apiBaseUrl: input.apiBaseUrl ?? 'http://127.0.0.1:18095/v1',
        apiKey: 'auracall_secret',
        openaiBaseUrl: input.apiBaseUrl ?? 'http://127.0.0.1:18095/v1',
        openaiApiKey: 'auracall_secret',
        model: `agent:${input.agentId}`,
        clientEnvPath: input.clientEnvPath,
        clientEnv: {
          openaiBaseUrl: input.apiBaseUrl ?? 'http://127.0.0.1:18095/v1',
          openaiApiKey: 'auracall_secret',
          auracallModel: `agent:${input.agentId}`,
          auracallStatusUrl: 'http://127.0.0.1:18095/status',
          auracallBatchUrl: 'http://127.0.0.1:18095/v1/response-batches',
        },
        scopes: {
          agents: [input.agentId],
          teams: [],
          services: [input.service],
          runtimeProfiles: input.runtimeProfile ? [input.runtimeProfile] : [],
        },
        restartRequired: true,
      },
    }));
    const handler = createAgentSetupPackageToolHandler({ createPackage });

    const result = await handler({
      service: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      projectName: 'ChE 4470/5470 Seminar Grading',
      agentId: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
      agentModelSelector: 'chatgpt:pro-extended',
      clientEnvPath: '/home/ecochran76/.auracall/clients/che447-grading.env',
    });

    expect(createPackage).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
      clientEnvPath: '/home/ecochran76/.auracall/clients/che447-grading.env',
    }));
    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'auracall_agent_setup_package',
        agentId: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
        clientEnvPath: '/home/ecochran76/.auracall/clients/che447-grading.env',
      },
    });
    expect(result.content[0]?.text).toContain('AuraCall agent setup package ready');
  });
});
