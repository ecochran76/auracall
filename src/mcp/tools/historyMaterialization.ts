import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  HistoryMaterializationJobControlError,
  type HistoryMaterializationService,
} from '../../runtime/historyMaterializationService.js';

const historyMaterializationCreateInputShape = {
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().min(1).optional(),
  browserProfile: z.string().min(1).optional(),
  boundIdentityKey: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  conversationIds: z.array(z.string().min(1)).optional(),
  providerConversationUrl: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  catalogItemId: z.string().min(1).optional(),
  catalogKind: z.enum(['all', 'projects', 'conversations', 'artifacts', 'files', 'media']).optional(),
  archiveItemId: z.string().min(1).optional(),
  reconcile: z.boolean().optional(),
  refreshSnapshot: z.boolean().optional(),
  assetKinds: z.array(z.enum(['artifacts', 'files', 'media', 'all'])).optional(),
  maxItems: z.number().int().nonnegative().max(500).optional(),
  force: z.boolean().optional(),
} satisfies z.ZodRawShape;

const historyMaterializationJobInputShape = {
  id: z.string().min(1),
} satisfies z.ZodRawShape;

const historyMaterializationListInputShape = {
  status: z.enum(['queued', 'running', 'succeeded', 'skipped', 'failed', 'cancelled', 'active', 'terminal']).optional(),
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().min(1).optional(),
  sourceType: z.enum(['conversation', 'catalog_item', 'archive_item', 'reconciliation']).optional(),
  limit: z.number().int().nonnegative().max(500).optional(),
} satisfies z.ZodRawShape;

const historyMaterializationJobShape = z.object({
  object: z.literal('history_materialization_job'),
  id: z.string(),
  source: z.unknown(),
  request: z.unknown(),
  sourceKey: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'skipped', 'failed', 'cancelled']),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  attemptCount: z.number(),
  result: z.unknown().nullable(),
  error: z.object({
    message: z.string(),
    type: z.enum([
      'invalid_request_error',
      'not_found_error',
      'provider_auth_conflict',
      'provider_guard_required',
      'internal_error',
    ]),
    statusCode: z.number(),
  }).nullable(),
  message: z.string(),
});

const historyMaterializationCreateOutputShape = {
  object: z.literal('history_materialization_job_create_result'),
  generatedAt: z.string(),
  reused: z.boolean(),
  job: historyMaterializationJobShape,
} satisfies z.ZodRawShape;

const historyMaterializationListOutputShape = {
  object: z.literal('history_materialization_jobs'),
  generatedAt: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'skipped', 'failed', 'cancelled', 'active', 'terminal']).nullable(),
  provider: z.enum(['chatgpt', 'gemini', 'grok']).nullable(),
  runtimeProfile: z.string().nullable(),
  sourceType: z.enum(['conversation', 'catalog_item', 'archive_item', 'reconciliation']).nullable(),
  limit: z.number(),
  jobs: z.array(historyMaterializationJobShape),
  metrics: z.object({
    total: z.number(),
    byStatus: z.record(z.string(), z.number()),
    active: z.number(),
    terminal: z.number(),
  }),
} satisfies z.ZodRawShape;

export interface RegisterHistoryMaterializationToolsDeps {
  service: HistoryMaterializationService;
}

export function registerHistoryMaterializationTools(
  server: McpServer,
  deps: RegisterHistoryMaterializationToolsDeps,
): void {
  server.registerTool(
    'history_materialization_create',
    {
      title: 'Queue history-backed artifact materialization',
      description:
        'Queue a durable account-history-backed provider materialization job by conversation id, account-mirror catalog item, archive item, or bounded reconciliation pass.',
      inputSchema: historyMaterializationCreateInputShape,
      outputSchema: historyMaterializationCreateOutputShape,
    },
    createHistoryMaterializationCreateToolHandler({ service: deps.service }),
  );
  server.registerTool(
    'history_materialization_jobs',
    {
      title: 'List history-backed materialization jobs',
      description:
        'List durable account-history-backed materialization jobs with optional status, provider, runtime profile, source type, and limit filters.',
      inputSchema: historyMaterializationListInputShape,
      outputSchema: historyMaterializationListOutputShape,
    },
    createHistoryMaterializationJobsToolHandler({ service: deps.service }),
  );
  server.registerTool(
    'history_materialization_job',
    {
      title: 'Read history-backed materialization job',
      description: 'Read one durable account-history-backed materialization job by id.',
      inputSchema: historyMaterializationJobInputShape,
      outputSchema: historyMaterializationJobShape.shape,
    },
    createHistoryMaterializationJobToolHandler({ service: deps.service }),
  );
  server.registerTool(
    'history_materialization_cancel',
    {
      title: 'Cancel history-backed materialization job',
      description: 'Cancel a queued account-history-backed materialization job before provider browser work starts.',
      inputSchema: historyMaterializationJobInputShape,
      outputSchema: historyMaterializationJobShape.shape,
    },
    createHistoryMaterializationCancelToolHandler({ service: deps.service }),
  );
}

export function createHistoryMaterializationCreateToolHandler(input: {
  service: HistoryMaterializationService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(historyMaterializationCreateInputShape).parse(rawInput);
    const result = await input.service.createJob(payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: `History materialization job ${result.job.id}: ${result.job.status}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}

export function createHistoryMaterializationJobsToolHandler(input: {
  service: HistoryMaterializationService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(historyMaterializationListInputShape).parse(rawInput);
    const result = await input.service.listJobs(payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: `History materialization jobs: ${result.metrics.total} job${result.metrics.total === 1 ? '' : 's'}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}

export function createHistoryMaterializationJobToolHandler(input: {
  service: HistoryMaterializationService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(historyMaterializationJobInputShape).parse(rawInput);
    const result = await input.service.readJob(payload.id);
    if (!result) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `History materialization job ${payload.id} was not found.`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: `History materialization job ${result.id}: ${result.status}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}

export function createHistoryMaterializationCancelToolHandler(input: {
  service: HistoryMaterializationService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(historyMaterializationJobInputShape).parse(rawInput);
    try {
      const result = await input.service.cancelJob(payload.id);
      return {
        content: [
          {
            type: 'text' as const,
            text: `History materialization job ${result.id}: ${result.status}.`,
          },
        ],
        structuredContent: result as typeof result & Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof HistoryMaterializationJobControlError) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: error.message,
            },
          ],
        };
      }
      throw error;
    }
  };
}
