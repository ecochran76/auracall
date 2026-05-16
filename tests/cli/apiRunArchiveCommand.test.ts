import { describe, expect, test, vi } from 'vitest';
import {
  attachApiRunArchiveEvidenceForCli,
  backfillApiRunArchiveForCli,
  formatApiRunArchiveBackfillCliSummary,
  formatApiRunArchiveCliSummary,
  formatApiRunArchiveEvidenceCliSummary,
  formatApiRunArchiveItemCliSummary,
  readApiRunArchiveForCli,
  readApiRunArchiveItemForCli,
} from '../../src/cli/apiRunArchiveCommand.js';

describe('api run archive CLI helpers', () => {
  test('reads archive search with filters from the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe(
        'http://127.0.0.1:18095/v1/archive?kind=upload&provider=chatgpt&runtimeProfile=default&batchId=batch_1&q=packet&limit=3',
      );
      return new Response(JSON.stringify({
        object: 'run_archive',
        generatedAt: '2026-05-16T17:00:00.000Z',
        kind: 'upload',
        limit: 3,
        items: [],
        metrics: {
          total: 0,
          byKind: {},
        },
      }));
    });

    await expect(readApiRunArchiveForCli({
      port: 18095,
      kind: 'upload',
      provider: 'chatgpt',
      runtimeProfile: 'default',
      batchId: 'batch_1',
      query: 'packet',
      limit: 3,
    }, fetchImpl as never)).resolves.toMatchObject({
      object: 'run_archive',
      kind: 'upload',
    });
  });

  test('reads archive item detail and formats compact summaries', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe('http://127.0.0.1:18095/v1/archive/items/response%3Aresp_1');
      return new Response(JSON.stringify({
        object: 'run_archive_item_detail',
        generatedAt: '2026-05-16T17:00:00.000Z',
        item: {
          id: 'response:resp_1',
          object: 'run_archive_item',
          kind: 'response',
          source: 'runtime',
          createdAt: '2026-05-16T17:00:00.000Z',
          updatedAt: '2026-05-16T17:00:00.000Z',
          title: 'Prompt',
          status: 'succeeded',
          provider: 'chatgpt',
          runtimeProfile: 'default',
          browserProfile: null,
          boundIdentityKey: null,
          agentId: 'instant-chatgpt-ecochran76',
          teamId: null,
          responseId: 'resp_1',
          batchId: null,
          batchIndex: null,
          mediaGenerationId: null,
          providerConversationId: 'conv_1',
          providerConversationUrl: 'https://chatgpt.com/c/conv_1',
          artifactId: null,
          fileName: null,
          mimeType: null,
          localPath: null,
          uri: null,
          cacheKey: null,
          checksumSha256: null,
          fileAvailable: null,
          metadata: {},
          links: {},
        },
      }));
    });

    const item = await readApiRunArchiveItemForCli({
      port: 18095,
      id: 'response:resp_1',
    }, fetchImpl as never);

    expect(formatApiRunArchiveItemCliSummary(item)).toContain('Run archive item: response:resp_1');
    expect(formatApiRunArchiveCliSummary({
      object: 'run_archive',
      kind: 'response',
      items: [(item as { item: unknown }).item],
      metrics: { total: 1 },
    })).toContain('response response:resp_1');
  });

  test('requests archive index backfill from the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe('http://127.0.0.1:18095/v1/archive/backfill');
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({
        object: 'run_archive_backfill',
        generatedAt: '2026-05-16T17:00:00.000Z',
        index: {
          updatedAt: '2026-05-16T17:00:00.000Z',
          itemCount: 4,
        },
        metrics: {
          byKind: {},
        },
      }));
    });

    const result = await backfillApiRunArchiveForCli({
      port: 18095,
    }, fetchImpl as never);

    expect(formatApiRunArchiveBackfillCliSummary(result)).toContain('4 items');
  });

  test('attaches caller-owned archive evidence through the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe('http://127.0.0.1:18095/v1/archive/evidence');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({ 'content-type': 'application/json' });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        producer: 'course-agent',
        schema: 'grading-review.v1',
      });
      return new Response(JSON.stringify({
        object: 'run_archive_evidence_result',
        generatedAt: '2026-05-16T17:00:00.000Z',
        evidence: {
          id: 'score_review',
          schema: 'grading-review.v1',
          status: 'pass',
        },
        item: {
          id: 'evidence:score_review',
        },
      }));
    });

    const result = await attachApiRunArchiveEvidenceForCli({
      port: 18095,
      payload: {
        producer: 'course-agent',
        schema: 'grading-review.v1',
        status: 'pass',
      },
    }, fetchImpl as never);

    expect(formatApiRunArchiveEvidenceCliSummary(result)).toContain('Run archive evidence attached: evidence:score_review');
  });
});
