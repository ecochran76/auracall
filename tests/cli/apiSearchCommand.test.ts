import { describe, expect, test, vi } from 'vitest';
import {
  formatApiSearchProjectionCliSummary,
  readApiSearchProjectionForCli,
} from '../../src/cli/apiSearchCommand.js';

describe('api search CLI helpers', () => {
  test('reads search projection with cache and materialization filters', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe(
        'http://127.0.0.1:18095/v1/search?q=readout&provider=chatgpt&runtimeProfile=wsl-chrome-3&tenant=ecochran76%40gmail.com&kind=artifact&status=succeeded&fileAvailable=true&assetAvailability=available&materialization=succeeded&cursor=opaque_1&limit=3',
      );
      return new Response(JSON.stringify({
        object: 'search_results',
        generatedAt: '2026-05-22T12:00:00.000Z',
        query: {
          q: 'readout',
          provider: 'chatgpt',
          runtimeProfile: 'wsl-chrome-3',
          tenant: 'ecochran76@gmail.com',
          kind: 'artifact',
          status: 'succeeded',
          fileAvailable: true,
          assetAvailability: 'available',
          materialization: 'succeeded',
          limit: 3,
          cursor: 'opaque_1',
        },
        rows: [
          {
            id: 'archive:generated-artifact:resp_1:file_1',
            object: 'search_result_row',
            source: 'run_archive',
            sourceKind: 'generated_artifact',
            kind: 'artifact',
            title: 'first_pass_readout.json',
            provider: 'chatgpt',
            runtimeProfileId: 'wsl-chrome-3',
            status: 'succeeded',
            itemId: 'generated-artifact:resp_1:file_1',
            metadata: {
              fileAvailable: true,
              materializationStatus: 'succeeded',
            },
            links: {
              asset: '/v1/archive/items/b64/abc/asset',
            },
          },
        ],
        nextCursor: null,
        metrics: {
          total: 1,
          returned: 1,
        },
        facets: {},
      }));
    });

    const result = await readApiSearchProjectionForCli({
      port: 18095,
      query: 'readout',
      provider: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      tenant: 'ecochran76@gmail.com',
      kind: 'artifact',
      status: 'succeeded',
      fileAvailable: true,
      assetAvailability: 'available',
      materialization: 'succeeded',
      cursor: 'opaque_1',
      limit: 3,
    }, fetchImpl as never);

    expect(result).toMatchObject({
      object: 'search_results',
      metrics: {
        total: 1,
      },
    });
    expect(formatApiSearchProjectionCliSummary(result)).toContain('Search results: 1 row');
    expect(formatApiSearchProjectionCliSummary(result)).toContain(
      'artifact generated-artifact:resp_1:file_1 source=run_archive status=succeeded available=true materialization=succeeded',
    );
  });

  test('retries search projection with the local API key after auth challenge', async () => {
    const previousKey = process.env.AURACALL_API_KEY;
    process.env.AURACALL_API_KEY = 'local-secret';
    try {
      const fetchImpl = vi.fn(async (_url: URL, init?: RequestInit) => {
        if (fetchImpl.mock.calls.length === 1) {
          expect(init?.headers).toBeUndefined();
          return new Response('', { status: 401 });
        }
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer local-secret');
        return new Response(JSON.stringify({
          object: 'search_results',
          generatedAt: '2026-05-22T12:00:00.000Z',
          query: {
            q: null,
            provider: null,
            runtimeProfile: null,
            tenant: null,
            kind: null,
            status: null,
            fileAvailable: null,
            assetAvailability: null,
            materialization: null,
            limit: 1,
            cursor: null,
          },
          rows: [],
          nextCursor: null,
          metrics: {
            total: 0,
            returned: 0,
          },
          facets: {},
        }));
      });

      await expect(readApiSearchProjectionForCli({
        port: 18095,
        limit: 1,
      }, fetchImpl as never)).resolves.toMatchObject({
        object: 'search_results',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      if (previousKey === undefined) {
        delete process.env.AURACALL_API_KEY;
      } else {
        process.env.AURACALL_API_KEY = previousKey;
      }
    }
  });
});
