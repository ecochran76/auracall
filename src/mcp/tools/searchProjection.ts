import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type {
  SearchProjectionService,
} from '../../runtime/searchProjectionService.js';

const searchProjectionInputShape = {
  query: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  runtimeProfile: z.string().min(1).optional(),
  tenant: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  fileAvailable: z.boolean().optional(),
  assetAvailability: z.enum(['available', 'unavailable', 'pending']).optional(),
  materialization: z.enum(['active', 'terminal', 'queued', 'running', 'succeeded', 'skipped', 'failed', 'cancelled']).optional(),
  limit: z.number().int().nonnegative().optional(),
  cursor: z.string().min(1).optional(),
} satisfies z.ZodRawShape;

const searchFacetValueShape = z.object({
  value: z.string(),
  count: z.number(),
});

const searchProjectionRowShape = z.object({
  id: z.string(),
  object: z.literal('search_result_row'),
  source: z.enum(['account_mirror', 'run_archive']),
  sourceKind: z.string(),
  kind: z.string(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  provider: z.string().nullable(),
  runtimeProfileId: z.string().nullable(),
  browserProfileId: z.string().nullable(),
  tenant: z.string().nullable(),
  projectId: z.string().nullable(),
  status: z.string().nullable(),
  runtimeState: z.enum(['queued', 'running', 'recovering', 'finalizing', 'stranded', 'terminal']).nullable().optional(),
  sortTime: z.string().nullable(),
  updatedAt: z.string().nullable(),
  itemId: z.string().nullable(),
  counts: z.object({
    messages: z.number().nullable(),
    files: z.number(),
    artifacts: z.number(),
  }),
  links: z.record(z.string(), z.string()),
  metadata: z.record(z.string(), z.unknown()),
});

const searchProjectionOutputShape = {
  object: z.literal('search_results'),
  generatedAt: z.string(),
  query: z.object({
    q: z.string().nullable(),
    provider: z.string().nullable(),
    runtimeProfile: z.string().nullable(),
    tenant: z.string().nullable(),
    kind: z.string().nullable(),
    status: z.string().nullable(),
    fileAvailable: z.boolean().nullable(),
    assetAvailability: z.enum(['available', 'unavailable', 'pending']).nullable(),
    materialization: z.enum(['active', 'terminal', 'queued', 'running', 'succeeded', 'skipped', 'failed', 'cancelled']).nullable(),
    limit: z.number(),
    cursor: z.string().nullable(),
  }),
  rows: z.array(searchProjectionRowShape),
  nextCursor: z.string().nullable(),
  metrics: z.object({
    total: z.number(),
    returned: z.number(),
  }),
  facets: z.object({
    providers: z.array(searchFacetValueShape),
    tenants: z.array(searchFacetValueShape),
    runtimeProfiles: z.array(searchFacetValueShape),
    kinds: z.array(searchFacetValueShape),
    statuses: z.array(searchFacetValueShape),
    assetAvailability: z.array(searchFacetValueShape),
    materialization: z.array(searchFacetValueShape),
  }),
} satisfies z.ZodRawShape;

export function registerSearchProjectionTool(
  server: McpServer,
  deps: { service: SearchProjectionService },
): void {
  server.registerTool(
    'search_projection',
    {
      title: 'Search AuraCall operator projection',
      description:
        'Search the unified AuraCall operator projection across account mirrors and run archive rows without browser work.',
      inputSchema: searchProjectionInputShape,
      outputSchema: searchProjectionOutputShape,
    },
    createSearchProjectionToolHandler(deps),
  );
}

export function createSearchProjectionToolHandler(input: {
  service: SearchProjectionService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(searchProjectionInputShape).parse(rawInput);
    const result = await input.service.search(payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Search projection: ${result.metrics.total} row${result.metrics.total === 1 ? '' : 's'}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}
