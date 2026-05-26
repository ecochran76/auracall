import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AccountMirrorCompletionService } from '../../accountMirror/completionService.js';
import {
  createAccountMirrorReconciliationCampaignService,
  type AccountMirrorReconciliationCampaignService,
} from '../../accountMirror/reconciliationCampaignService.js';
import type { AccountMirrorStatusRegistry } from '../../accountMirror/statusRegistry.js';

const accountMirrorReconciliationCreateInputShape = {
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().min(1).optional(),
  identity: z.string().min(1).optional(),
  includeDisabled: z.boolean().optional(),
  maxTargets: z.number().int().positive().max(500).optional(),
  maxActiveTargets: z.number().int().positive().max(100).optional(),
  materializationPolicy: z.enum(['metadata_only', 'recent_missing_assets', 'full_missing_assets']).optional(),
  materializationAssetKinds: z.array(z.enum(['artifacts', 'files', 'media', 'all'])).optional(),
  materializationMaxItems: z.number().int().positive().max(500).optional(),
  dryRun: z.boolean().optional(),
} satisfies z.ZodRawShape;

const accountMirrorReconciliationStatusInputShape = {
  id: z.string().min(1),
} satisfies z.ZodRawShape;

const accountMirrorReconciliationListInputShape = {
  status: z.enum(['active', 'planned', 'queued', 'running', 'idle_waiting', 'paused', 'blocked', 'completed', 'completed_with_skips', 'cancelled', 'failed']).optional(),
  limit: z.number().int().positive().max(500).optional(),
} satisfies z.ZodRawShape;

const accountMirrorReconciliationControlInputShape = {
  id: z.string().min(1),
  action: z.enum(['pause', 'resume', 'cancel', 'run_next_pass', 'run-next-pass']).transform((value) => value === 'run-next-pass' ? 'run_next_pass' : value),
} satisfies z.ZodRawShape;

const accountMirrorReconciliationOutputShape = {
  object: z.literal('account_mirror_reconciliation_campaign'),
  id: z.string(),
  dryRun: z.boolean(),
  status: z.enum(['planned', 'queued', 'running', 'idle_waiting', 'paused', 'blocked', 'completed', 'completed_with_skips', 'cancelled', 'failed']),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  filters: z.unknown(),
  policy: z.unknown(),
  metrics: z.unknown(),
  targets: z.array(z.unknown()),
  events: z.array(z.unknown()),
} satisfies z.ZodRawShape;

const accountMirrorReconciliationListOutputShape = {
  object: z.literal('list'),
  data: z.array(z.object(accountMirrorReconciliationOutputShape)),
  count: z.number(),
} satisfies z.ZodRawShape;

export interface RegisterAccountMirrorReconciliationToolDeps {
  service?: AccountMirrorReconciliationCampaignService;
  registry?: AccountMirrorStatusRegistry;
  completionService?: AccountMirrorCompletionService;
}

export function registerAccountMirrorReconciliationTools(
  server: McpServer,
  deps: RegisterAccountMirrorReconciliationToolDeps = {},
): void {
  const service = deps.service ?? createAccountMirrorReconciliationCampaignService({
    registry: requireRegistry(deps.registry),
    completionService: requireCompletionService(deps.completionService),
  });
  server.registerTool(
    'account_mirror_reconciliation_create',
    {
      title: 'Create account mirror reconciliation campaign',
      description:
        'Create a dry-run or execution multi-tenant account mirror reconciliation campaign.',
      inputSchema: accountMirrorReconciliationCreateInputShape,
      outputSchema: accountMirrorReconciliationOutputShape,
    },
    async (rawInput: unknown) => {
      const payload = z.object(accountMirrorReconciliationCreateInputShape).parse(rawInput);
      const result = await service.create({
        provider: payload.provider,
        runtimeProfileId: payload.runtimeProfile,
        identity: payload.identity,
        includeDisabled: payload.includeDisabled,
        maxTargets: payload.maxTargets,
        maxActiveTargets: payload.maxActiveTargets,
        materializationPolicy: payload.materializationPolicy,
        materializationAssetKinds: payload.materializationAssetKinds,
        materializationMaxItems: payload.materializationMaxItems,
        dryRun: payload.dryRun,
      });
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text: `Account mirror reconciliation campaign ${result.dryRun ? 'planned' : 'started'}: ${result.id}.`,
          },
        ],
        structuredContent: result as typeof result & Record<string, unknown>,
      };
    },
  );
  server.registerTool(
    'account_mirror_reconciliation_list',
    {
      title: 'List account mirror reconciliation campaigns',
      description:
        'List persisted Aura-Call account mirror reconciliation campaigns without touching provider browsers.',
      inputSchema: accountMirrorReconciliationListInputShape,
      outputSchema: accountMirrorReconciliationListOutputShape,
    },
    async (rawInput: unknown) => {
      const payload = z.object(accountMirrorReconciliationListInputShape).parse(rawInput);
      const data = await service.list({
        status: payload.status,
        limit: payload.limit,
      });
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text: `Account mirror reconciliation campaigns: ${data.length}.`,
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
    'account_mirror_reconciliation_control',
    {
      title: 'Control account mirror reconciliation campaign',
      description:
        'Pause, resume, cancel, or advance an Aura-Call account mirror reconciliation campaign.',
      inputSchema: accountMirrorReconciliationControlInputShape,
      outputSchema: accountMirrorReconciliationOutputShape,
    },
    async (rawInput: unknown) => {
      const payload = z.object(accountMirrorReconciliationControlInputShape).parse(rawInput);
      const result = await service.control({
        id: payload.id,
        action: payload.action,
      });
      if (!result) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Account mirror reconciliation campaign ${payload.id} was not found.`,
            },
          ],
          structuredContent: {
            object: 'account_mirror_reconciliation_error',
            code: 'account_mirror_reconciliation_not_found',
          },
        };
      }
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text: `Account mirror reconciliation campaign ${result.id}: ${result.status}.`,
          },
        ],
        structuredContent: result as typeof result & Record<string, unknown>,
      };
    },
  );
  server.registerTool(
    'account_mirror_reconciliation_status',
    {
      title: 'Read account mirror reconciliation campaign status',
      description:
        'Read an Aura-Call account mirror reconciliation campaign by id without touching provider browsers.',
      inputSchema: accountMirrorReconciliationStatusInputShape,
      outputSchema: accountMirrorReconciliationOutputShape,
    },
    async (rawInput: unknown) => {
      const payload = z.object(accountMirrorReconciliationStatusInputShape).parse(rawInput);
      const result = await service.read(payload.id);
      if (!result) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Account mirror reconciliation campaign ${payload.id} was not found.`,
            },
          ],
          structuredContent: {
            object: 'account_mirror_reconciliation_error',
            code: 'account_mirror_reconciliation_not_found',
          },
        };
      }
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text: `Account mirror reconciliation campaign ${result.id}: ${result.status}.`,
          },
        ],
        structuredContent: result as typeof result & Record<string, unknown>,
      };
    },
  );
}

function requireRegistry(value: AccountMirrorStatusRegistry | undefined): AccountMirrorStatusRegistry {
  if (!value) {
    throw new Error('account mirror reconciliation MCP tools require an account mirror status registry');
  }
  return value;
}

function requireCompletionService(value: AccountMirrorCompletionService | undefined): AccountMirrorCompletionService {
  if (!value) {
    throw new Error('account mirror reconciliation MCP tools require an account mirror completion service');
  }
  return value;
}
