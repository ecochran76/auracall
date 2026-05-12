import { describe, expect, it, vi } from 'vitest';
import { createProjectEnsureToolHandler } from '../src/mcp/tools/projectEnsure.js';
import type { ProjectEnsureInput } from '../src/projects/projectEnsureService.js';

describe('mcp project_ensure tool', () => {
  it('ensures a provider project and returns a poll-independent result', async () => {
    const ensureProject = vi.fn(async (input: ProjectEnsureInput) => ({
      object: 'auracall_project_ensure' as const,
      status: 'created' as const,
      service: input.service ?? 'chatgpt',
      runtimeProfile: input.runtimeProfile ?? null,
      projectName: input.projectName,
      project: {
        id: 'proj_created',
        name: input.projectName,
        provider: 'chatgpt' as const,
      },
      created: true,
      agent: {
        id: input.agentId ?? 'agent',
        mutationTarget: 'registry' as const,
        blockedReason: null,
      },
    }));
    const handler = createProjectEnsureToolHandler({ ensureProject });

    const result = await handler({
      service: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      projectName: 'ChE 4470/5470 Seminar Grading',
      agentId: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
      agentModelSelector: 'chatgpt:pro-extended',
    });

    expect(ensureProject).toHaveBeenCalledWith({
      service: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      projectName: 'ChE 4470/5470 Seminar Grading',
      agentId: 'pro-extended-chatgpt-soylei-che4470-seminar-grading',
      agentModelSelector: 'chatgpt:pro-extended',
    });
    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'AuraCall project created: ChE 4470/5470 Seminar Grading.',
        },
      ],
      structuredContent: {
        object: 'auracall_project_ensure',
        status: 'created',
        project: {
          id: 'proj_created',
        },
      },
    });
  });
});
