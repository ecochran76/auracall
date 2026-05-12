import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createResponseBatchService,
  ResponseBatchCreateRequestSchema,
  type ResponseBatchService,
} from '../../runtime/responseBatchService.js';
import { createExecutionResponsesService } from '../../runtime/responsesService.js';

const responseBatchCreateInputShape = ResponseBatchCreateRequestSchema.shape satisfies z.ZodRawShape;

const responseBatchStatusInputShape = {
  id: z.string().min(1),
} satisfies z.ZodRawShape;

const responseBatchOutputShape = {
  id: z.string(),
  object: z.literal('response_batch_status'),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'mixed_terminal']),
  counts: z.record(z.string(), z.number()),
  jobs: z.array(z.record(z.string(), z.unknown())),
} satisfies z.ZodRawShape;

export interface RegisterResponseBatchToolsDeps {
  service?: ResponseBatchService;
}

export function registerResponseBatchTools(
  server: McpServer,
  deps: RegisterResponseBatchToolsDeps = {},
): void {
  const service = deps.service ?? createResponseBatchService({ responsesService: createExecutionResponsesService() });
  server.registerTool(
    'response_batch_create',
    {
      title: 'Create AuraCall response batch',
      description:
        'Create a pollable batch of durable AuraCall response runs. Each child is a normal response run and can also be read with run_status.',
      inputSchema: responseBatchCreateInputShape,
      outputSchema: responseBatchOutputShape,
    },
    createResponseBatchCreateToolHandler(service),
  );
  server.registerTool(
    'response_batch_status',
    {
      title: 'Read AuraCall response batch status',
      description:
        'Read aggregate status and child response ids for a response batch without resubmitting any prompts.',
      inputSchema: responseBatchStatusInputShape,
      outputSchema: responseBatchOutputShape,
    },
    createResponseBatchStatusToolHandler(service),
  );
}

export function createResponseBatchCreateToolHandler(service: ResponseBatchService) {
  return async (input: unknown) => {
    const payload = ResponseBatchCreateRequestSchema.parse(input);
    const result = await service.createBatch(payload);
    return {
      isError: result.status === 'failed',
      content: [
        {
          type: 'text' as const,
          text: `Response batch ${result.id} is ${result.status}: ${result.counts.total} jobs.`,
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  };
}

export function createResponseBatchStatusToolHandler(service: ResponseBatchService) {
  return async (input: unknown) => {
    const payload = z.object(responseBatchStatusInputShape).parse(input);
    const result = await service.readBatchStatus(payload.id);
    if (!result) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Response batch ${payload.id} was not found.`,
          },
        ],
        structuredContent: {
          id: payload.id,
          object: 'response_batch_status',
          status: 'failed',
          counts: {
            total: 0,
            in_progress: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
            missing: 0,
          },
          jobs: [],
        },
      };
    }
    return {
      isError: result.status === 'failed',
      content: [
        {
          type: 'text' as const,
          text: `Response batch ${result.id} is ${result.status}: ${result.counts.completed}/${result.counts.total} completed.`,
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  };
}
