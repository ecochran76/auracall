import { describe, expect, it, vi } from 'vitest';
import {
  createSearchProjectionToolHandler,
  registerSearchProjectionTool,
} from '../src/mcp/tools/searchProjection.js';
import type { SearchProjectionService } from '../src/runtime/searchProjectionService.js';

describe('mcp search projection tool', () => {
  it('searches the unified projection through the shared service', async () => {
    const search = vi.fn(async () => ({
      object: 'search_results' as const,
      generatedAt: '2026-05-22T12:00:00.000Z',
      query: {
        q: 'readout',
        provider: 'chatgpt',
        runtimeProfile: 'wsl-chrome-3',
        tenant: null,
        kind: 'artifact',
        status: null,
        fileAvailable: true,
        assetAvailability: 'available' as const,
        materialization: 'succeeded' as const,
        limit: 3,
        cursor: null,
      },
      rows: [
        {
          id: 'archive:generated-artifact:resp_1:file_1',
          object: 'search_result_row' as const,
          source: 'run_archive' as const,
          sourceKind: 'generated_artifact',
          kind: 'artifact',
          title: 'first_pass_readout.json',
          summary: null,
          provider: 'chatgpt',
          runtimeProfileId: 'wsl-chrome-3',
          browserProfileId: null,
          tenant: 'ecochran76@gmail.com',
          projectId: 'Transcripts',
          status: 'succeeded',
          runtimeState: null,
          sortTime: '2026-05-22T12:00:00.000Z',
          updatedAt: '2026-05-22T12:00:00.000Z',
          itemId: 'generated-artifact:resp_1:file_1',
          counts: {
            messages: null,
            files: 0,
            artifacts: 1,
          },
          links: {
            asset: '/v1/archive/items/b64/abc/asset',
          },
          metadata: {
            fileAvailable: true,
            materializationStatus: 'succeeded',
          },
        },
      ],
      nextCursor: null,
      metrics: {
        total: 1,
        returned: 1,
      },
      facets: {
        providers: [{ value: 'chatgpt', count: 1 }],
        tenants: [{ value: 'ecochran76@gmail.com', count: 1 }],
        runtimeProfiles: [{ value: 'wsl-chrome-3', count: 1 }],
        kinds: [{ value: 'artifact', count: 1 }],
        statuses: [{ value: 'succeeded', count: 1 }],
        assetAvailability: [{ value: 'available', count: 1 }],
        materialization: [{ value: 'succeeded', count: 1 }],
      },
    }));
    const handler = createSearchProjectionToolHandler({
      service: { search } satisfies SearchProjectionService,
    });

    const result = await handler({
      query: 'readout',
      provider: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      kind: 'artifact',
      fileAvailable: true,
      assetAvailability: 'available',
      materialization: 'succeeded',
      limit: 3,
    });

    expect(search).toHaveBeenCalledWith({
      query: 'readout',
      provider: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      kind: 'artifact',
      fileAvailable: true,
      assetAvailability: 'available',
      materialization: 'succeeded',
      limit: 3,
    });
    expect(result).toMatchObject({
      content: [
        {
          text: 'Search projection: 1 row.',
        },
      ],
      structuredContent: {
        object: 'search_results',
        metrics: {
          total: 1,
        },
        rows: [
          {
            id: 'archive:generated-artifact:resp_1:file_1',
            metadata: {
              fileAvailable: true,
              materializationStatus: 'succeeded',
            },
          },
        ],
      },
    });
  });

  it('registers the search projection tool with schema metadata', () => {
    const registeredTools: Array<{
      name: string;
      config: { inputSchema?: unknown; outputSchema?: unknown };
      handler: unknown;
    }> = [];
    const server = {
      registerTool: vi.fn((name, config, handler) => {
        registeredTools.push({ name, config, handler });
      }),
    };

    registerSearchProjectionTool(server as never, {
      service: { search: vi.fn() } satisfies SearchProjectionService,
    });

    expect(registeredTools).toHaveLength(1);
    expect(registeredTools[0]?.name).toBe('search_projection');
    expect(registeredTools[0]?.config).toMatchObject({
      title: 'Search AuraCall operator projection',
    });
    expect(registeredTools[0]?.config.inputSchema).toBeTruthy();
    expect(registeredTools[0]?.config.outputSchema).toBeTruthy();
  });
});
