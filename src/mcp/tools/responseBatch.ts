import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ExecutionResponseStatusSchema } from '../../runtime/apiSchema.js';
import {
  createResponseBatchService,
  ResponseBatchCreateRequestSchema,
  type ResponseBatchService,
} from '../../runtime/responseBatchService.js';
import { createExecutionResponsesService } from '../../runtime/responsesService.js';

const { dispatchResolution: _dispatchResolution, ...responseBatchCreateInputShape } =
  ResponseBatchCreateRequestSchema.shape satisfies z.ZodRawShape;

const responseBatchStatusInputShape = {
  id: z.string().min(1),
} satisfies z.ZodRawShape;

const responseBatchRuntimeStateSchema = z
  .enum(['queued', 'running', 'recovering', 'finalizing', 'stranded', 'terminal'])
  .nullable()
  .optional();

const responseBatchRuntimeDiagnosticsSummarySchema = z
  .object({
    runtimeState: responseBatchRuntimeStateSchema,
    leaseState: z.enum(['none', 'active', 'released', 'expired', 'mixed']).nullable().optional(),
    lastLeaseEvent: z
      .object({
        type: z.enum(['lease-acquired', 'lease-released']).nullable().optional(),
        createdAt: z.string().nullable().optional(),
        leaseId: z.string().nullable().optional(),
        ownerId: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        releaseReason: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    browserTaskState: z.string().nullable().optional(),
    lastProviderEvidence: z
      .object({
        observedAt: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        source: z.string().nullable().optional(),
        evidenceRef: z.string().nullable().optional(),
        confidence: z.string().nullable().optional(),
        details: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .nullable()
      .optional(),
    terminalTransitionSource: z
      .enum(['step-succeeded', 'step-failed', 'run-cancelled', 'requested-output-policy'])
      .nullable()
      .optional(),
  })
  .nullable()
  .optional();

const responseBatchJobOutputSchema = z.object({
  index: z.number().int().min(0),
  responseId: z.string(),
  model: z.string(),
  agent: z.string().nullable(),
  service: z.string().nullable(),
  runtimeProfile: z.string().nullable(),
  dispatch: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
  status: z.union([ExecutionResponseStatusSchema, z.literal('missing')]),
  completedAt: z.string().nullable(),
  failure: z.unknown().nullable(),
  diagnostics: responseBatchRuntimeDiagnosticsSummarySchema,
  runtimeState: responseBatchRuntimeStateSchema,
});

const responseBatchOutputShape = {
  id: z.string(),
  object: z.literal('response_batch_status'),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'mixed_terminal']),
  dispatch: z.record(z.string(), z.unknown()).nullable().optional(),
  counts: z.record(z.string(), z.number()),
  jobs: z.array(responseBatchJobOutputSchema),
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
