import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AgentSetupPackageInputSchema,
  type AgentSetupPackageService,
} from '../../projects/agentSetupPackageService.js';

const agentSetupPackageInputShape = AgentSetupPackageInputSchema.shape satisfies z.ZodRawShape;

const agentSetupPackageOutputShape = {
  object: z.literal('auracall_agent_setup_package'),
  agentId: z.string(),
  model: z.string(),
  project: z.record(z.string(), z.unknown()),
  apiKey: z.record(z.string(), z.unknown()),
  clientEnvPath: z.string(),
  restartRequired: z.boolean(),
} satisfies z.ZodRawShape;

const agentSetupHandoffOutputShape = {
  object: z.literal('auracall_agent_setup_handoff'),
  agentId: z.string(),
  model: z.string(),
  project: z.record(z.string(), z.unknown()),
  key: z.record(z.string(), z.unknown()),
  clientEnvPath: z.string(),
  restartRequired: z.boolean(),
  next: z.record(z.string(), z.unknown()),
} satisfies z.ZodRawShape;

export interface RegisterAgentSetupPackageToolDeps {
  service: AgentSetupPackageService;
}

export function registerAgentSetupPackageTool(
  server: McpServer,
  deps: RegisterAgentSetupPackageToolDeps,
): void {
  server.registerTool(
    'agent_setup_package_create',
    {
      title: 'Create AuraCall agent setup package',
      description:
        'Privileged setup helper that ensures a provider project, binds an AuraCall registry agent, issues a scoped API key, and writes a client env handoff file.',
      inputSchema: agentSetupPackageInputShape,
      outputSchema: agentSetupPackageOutputShape,
    },
    createAgentSetupPackageToolHandler(deps.service),
  );

  server.registerTool(
    'agent_setup_handoff_create',
    {
      title: 'Create AuraCall agent setup handoff',
      description:
        'Privileged setup helper that creates a project-bound agent package but returns only non-secret handoff metadata and the generated client env path.',
      inputSchema: agentSetupPackageInputShape,
      outputSchema: agentSetupHandoffOutputShape,
    },
    createAgentSetupHandoffToolHandler(deps.service),
  );
}

export function createAgentSetupPackageToolHandler(service: AgentSetupPackageService) {
  return async (input: unknown) => {
    const payload = AgentSetupPackageInputSchema.parse(input);
    const result = await service.createPackage(payload);
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: `AuraCall agent setup package ready: ${result.agentId} -> ${result.clientEnvPath}. Restart auracall-api.service for systemd to load ${result.apiKey.envPath}.`,
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  };
}

export function createAgentSetupHandoffToolHandler(service: AgentSetupPackageService) {
  return async (input: unknown) => {
    const payload = AgentSetupPackageInputSchema.parse(input);
    const result = await service.createHandoff(payload);
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: `AuraCall agent setup handoff ready: ${result.agentId} -> ${result.clientEnvPath}. Restart ${result.next.restartService ?? 'the API service'} before use.`,
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  };
}
