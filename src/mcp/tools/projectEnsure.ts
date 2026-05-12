import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createProjectEnsureService,
  ProjectEnsureInputSchema,
  type ProjectEnsureService,
} from '../../projects/projectEnsureService.js';

const projectEnsureInputShape = ProjectEnsureInputSchema.shape satisfies z.ZodRawShape;

const projectEnsureOutputShape = {
  object: z.literal('auracall_project_ensure'),
  status: z.enum(['found', 'created', 'missing']),
  service: z.enum(['chatgpt', 'gemini', 'grok']),
  runtimeProfile: z.string().nullable(),
  projectName: z.string(),
  project: z.record(z.string(), z.unknown()).nullable(),
  created: z.boolean(),
  agent: z.record(z.string(), z.unknown()).nullable(),
} satisfies z.ZodRawShape;

export interface RegisterProjectEnsureToolDeps {
  service?: ProjectEnsureService;
}

export function registerProjectEnsureTool(
  server: McpServer,
  deps: RegisterProjectEnsureToolDeps = {},
): void {
  const service = deps.service ?? createProjectEnsureService();
  server.registerTool(
    'project_ensure',
    {
      title: 'Ensure AuraCall provider project',
      description:
        'Find or create a provider project and optionally bind a registry agent to that project. Use before project-scoped response runs.',
      inputSchema: projectEnsureInputShape,
      outputSchema: projectEnsureOutputShape,
    },
    createProjectEnsureToolHandler(service),
  );
}

export function createProjectEnsureToolHandler(service: ProjectEnsureService) {
  return async (input: unknown) => {
    const payload = ProjectEnsureInputSchema.parse(input);
    const result = await service.ensureProject(payload);
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: `AuraCall project ${result.status}: ${result.projectName}.`,
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  };
}
