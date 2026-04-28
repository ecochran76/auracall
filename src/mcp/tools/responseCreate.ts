import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createExecutionResponsesService,
  type ExecutionResponsesService,
} from '../../runtime/responsesService.js';
import type { ExecutionRequest } from '../../runtime/apiTypes.js';

const responseCreateInputShape = {
  model: z.string().min(1),
  input: z.string().min(1),
  instructions: z.string().min(1).nullable().optional(),
  runtimeProfile: z.string().min(1).nullable().optional(),
  agent: z.string().min(1).nullable().optional(),
  service: z.enum(['chatgpt', 'gemini', 'grok']).nullable().optional(),
  transport: z.enum(['api', 'browser', 'auto']).nullable().optional(),
  outputContract: z.string().min(1).nullable().optional(),
  composerTool: z.string().min(1).nullable().optional(),
  deepResearchPlanAction: z.enum(['start', 'edit']).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
} satisfies z.ZodRawShape;

const responseCreateOutputShape = {
  id: z.string(),
  object: z.literal('response'),
  status: z.string(),
  model: z.string().nullable().optional(),
  output: z.array(z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
} satisfies z.ZodRawShape;

export interface RegisterResponseCreateToolDeps {
  responsesService?: Pick<ExecutionResponsesService, 'createResponse'>;
}

export function registerResponseCreateTool(
  server: McpServer,
  deps: RegisterResponseCreateToolDeps = {},
): void {
  const responsesService = deps.responsesService ?? createExecutionResponsesService();
  server.registerTool(
    'response_create',
    {
      title: 'Create Aura-Call response run',
      description:
        'Create one durable Aura-Call response run. Browser-backed ChatGPT requests can pass composerTool and deepResearchPlanAction, then poll the returned id with run_status.',
      inputSchema: responseCreateInputShape,
      outputSchema: responseCreateOutputShape,
    },
    createResponseCreateToolHandler(responsesService),
  );
}

export function createResponseCreateToolHandler(
  responsesService: Pick<ExecutionResponsesService, 'createResponse'>,
) {
  return async (input: unknown) => {
    const textContent = (text: string) => [{ type: 'text' as const, text }];
    const payload = z.object(responseCreateInputShape).parse(input);
    const request: ExecutionRequest = {
      model: payload.model,
      input: payload.input,
      ...(payload.instructions ? { instructions: payload.instructions } : {}),
      ...(payload.metadata ? { metadata: payload.metadata } : {}),
      auracall: {
        ...(payload.runtimeProfile ? { runtimeProfile: payload.runtimeProfile } : {}),
        ...(payload.agent ? { agent: payload.agent } : {}),
        ...(payload.service ? { service: payload.service } : {}),
        ...(payload.transport ? { transport: payload.transport } : {}),
        ...(payload.outputContract ? { outputContract: payload.outputContract } : {}),
        ...(payload.composerTool ? { composerTool: payload.composerTool } : {}),
        ...(payload.deepResearchPlanAction ? { deepResearchPlanAction: payload.deepResearchPlanAction } : {}),
      },
    };
    const result = await responsesService.createResponse(request);
    const line =
      result.status === 'completed'
        ? `Response ${result.id} completed.`
        : `Response ${result.id} is ${result.status}. Poll run_status for updates.`;
    return {
      isError: result.status === 'failed',
      content: textContent(line),
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}
