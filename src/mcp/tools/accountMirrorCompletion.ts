import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createAccountMirrorCompletionService,
  type AccountMirrorCompletionService,
} from '../../accountMirror/completionService.js';
import type { AccountMirrorRefreshService } from '../../accountMirror/refreshService.js';
import type { AccountMirrorStatusRegistry } from '../../accountMirror/statusRegistry.js';

const accountMirrorCompletionStartInputShape = {
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().min(1).optional(),
  maxPasses: z.number().int().positive().max(500).optional(),
} satisfies z.ZodRawShape;

const accountMirrorCompletionStatusInputShape = {
  id: z.string().min(1),
} satisfies z.ZodRawShape;

const accountMirrorCompletionListInputShape = {
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().min(1).optional(),
  status: z.enum(['active', 'queued', 'running', 'completed', 'blocked', 'failed']).optional(),
  activeOnly: z.boolean().optional(),
  limit: z.number().int().positive().max(500).optional(),
} satisfies z.ZodRawShape;

const accountMirrorCompletionOutputShape = {
  object: z.literal('account_mirror_completion'),
  id: z.string(),
  provider: z.enum(['chatgpt', 'gemini', 'grok']),
  runtimeProfileId: z.string(),
  mode: z.enum(['live_follow', 'bounded']),
  phase: z.enum(['backfill_history', 'steady_follow']),
  status: z.enum(['queued', 'running', 'completed', 'blocked', 'failed']),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  nextAttemptAt: z.string().nullable(),
  maxPasses: z.number().nullable(),
  passCount: z.number(),
  lastRefresh: z.unknown().nullable(),
  mirrorCompleteness: z.unknown().nullable(),
  error: z.object({
    message: z.string(),
    code: z.string().nullable(),
  }).nullable(),
} satisfies z.ZodRawShape;

const accountMirrorCompletionListOutputShape = {
  object: z.literal('list'),
  data: z.array(z.object(accountMirrorCompletionOutputShape)),
  count: z.number(),
} satisfies z.ZodRawShape;

export interface RegisterAccountMirrorCompletionToolDeps {
  service?: AccountMirrorCompletionService;
  registry?: AccountMirrorStatusRegistry;
  refreshService?: AccountMirrorRefreshService;
}

export function registerAccountMirrorCompletionTools(
  server: McpServer,
  deps: RegisterAccountMirrorCompletionToolDeps = {},
): void {
  const service = deps.service ?? createAccountMirrorCompletionService({
    registry: requireRegistry(deps.registry),
    refreshService: requireRefreshService(deps.refreshService),
  });
  server.registerTool(
    'account_mirror_completion_start',
    {
      title: 'Start account mirror completion',
      description:
        'Start a nonblocking Aura-Call account mirror completion operation and return an operation id immediately.',
      inputSchema: accountMirrorCompletionStartInputShape,
      outputSchema: accountMirrorCompletionOutputShape,
    },
    async (rawInput: unknown) => {
      const payload = z.object(accountMirrorCompletionStartInputShape).parse(rawInput);
      const result = service.start({
        provider: payload.provider,
        runtimeProfileId: payload.runtimeProfile,
        maxPasses: payload.maxPasses,
      });
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text: `Account mirror completion started: ${result.id}.`,
          },
        ],
        structuredContent: result as typeof result & Record<string, unknown>,
      };
    },
  );
  server.registerTool(
    'account_mirror_completion_list',
    {
      title: 'List account mirror completions',
      description:
        'List persisted Aura-Call account mirror completion operations without touching provider browsers.',
      inputSchema: accountMirrorCompletionListInputShape,
      outputSchema: accountMirrorCompletionListOutputShape,
    },
    async (rawInput: unknown) => {
      const payload = z.object(accountMirrorCompletionListInputShape).parse(rawInput);
      const data = service.list({
        provider: payload.provider,
        runtimeProfileId: payload.runtimeProfile,
        status: payload.status,
        activeOnly: payload.activeOnly,
        limit: payload.limit,
      });
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text: `Account mirror completions: ${data.length}.`,
          },
        ],
        structuredContent: {
          object: 'list',
          data,
          count: data.length,
        },
      };
    },
  );
  server.registerTool(
    'account_mirror_completion_status',
    {
      title: 'Read account mirror completion status',
      description:
        'Read a nonblocking Aura-Call account mirror completion operation by id.',
      inputSchema: accountMirrorCompletionStatusInputShape,
      outputSchema: accountMirrorCompletionOutputShape,
    },
    async (rawInput: unknown) => {
      const payload = z.object(accountMirrorCompletionStatusInputShape).parse(rawInput);
      const result = service.read(payload.id);
      if (!result) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Account mirror completion ${payload.id} was not found.`,
            },
          ],
          structuredContent: {
            object: 'account_mirror_completion_error',
            code: 'account_mirror_completion_not_found',
          },
        };
      }
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text: `Account mirror completion ${result.id}: ${result.status}.`,
          },
        ],
        structuredContent: result as typeof result & Record<string, unknown>,
      };
    },
  );
}

function requireRegistry(value: AccountMirrorStatusRegistry | undefined): AccountMirrorStatusRegistry {
  if (!value) {
    throw new Error('account mirror completion MCP tools require an account mirror status registry');
  }
  return value;
}

function requireRefreshService(value: AccountMirrorRefreshService | undefined): AccountMirrorRefreshService {
  if (!value) {
    throw new Error('account mirror completion MCP tools require an account mirror refresh service');
  }
  return value;
}
