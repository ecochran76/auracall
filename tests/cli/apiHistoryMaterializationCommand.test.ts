import { describe, expect, test, vi } from 'vitest';
import {
  cancelApiHistoryMaterializationJobForCli,
  createApiHistoryMaterializationJobForCli,
  formatApiHistoryMaterializationJobCliSummary,
  formatApiHistoryMaterializationJobsCliSummary,
  listApiHistoryMaterializationJobsForCli,
  readApiHistoryMaterializationJobForCli,
} from '../../src/cli/apiHistoryMaterializationCommand.js';

describe('api history materialization CLI helpers', () => {
  test('creates and reads history materialization jobs through the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      if (url.pathname === '/v1/account-mirrors/materializations') {
        expect(url.toString()).toBe('http://127.0.0.1:18095/v1/account-mirrors/materializations');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toEqual({ 'content-type': 'application/json' });
        expect(JSON.parse(String(init?.body))).toMatchObject({
          provider: 'chatgpt',
          runtimeProfile: 'default',
          catalogItemId: 'conv_1',
          catalogKind: 'conversations',
          conversationIds: ['conv_1', 'conv_2'],
          refreshSnapshot: true,
          assetKinds: ['artifacts', 'files'],
          maxItems: 2,
          providerWorkTimeoutMs: 30000,
          force: true,
        });
        return new Response(JSON.stringify({
          object: 'history_materialization_job_create_result',
          generatedAt: '2026-05-22T19:30:00.000Z',
          reused: false,
          job: historyJob({ status: 'queued' }),
        }));
      }
      expect(url.toString()).toBe('http://127.0.0.1:18095/v1/account-mirrors/materializations/hmj_test_1');
      return new Response(JSON.stringify(historyJob({ status: 'succeeded' })));
    });

    const created = await createApiHistoryMaterializationJobForCli({
      port: 18095,
      provider: 'chatgpt',
      runtimeProfile: 'default',
      catalogItemId: 'conv_1',
      catalogKind: 'conversations',
      conversationIds: ['conv_1,conv_2'],
      refreshSnapshot: true,
      assetKinds: ['artifacts,files'],
      maxItems: 2,
      providerWorkTimeoutMs: 30000,
      force: true,
    }, fetchImpl as never);
    expect(formatApiHistoryMaterializationJobCliSummary(created)).toContain(
      'History materialization job: hmj_test_1',
    );

    const read = await readApiHistoryMaterializationJobForCli({
      port: 18095,
      id: 'hmj_test_1',
    }, fetchImpl as never);
    expect(formatApiHistoryMaterializationJobCliSummary(read)).toContain('Status: succeeded');
    expect(formatApiHistoryMaterializationJobCliSummary(read)).toContain('Materialized: 1');
  });

  test('lists and cancels history materialization jobs through the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        expect(url.toString()).toBe('http://127.0.0.1:18095/v1/account-mirrors/materializations/hmj_test_1');
        expect(JSON.parse(String(init.body))).toEqual({ action: 'cancel' });
        return new Response(JSON.stringify(historyJob({ status: 'cancelled' })));
      }
      expect(url.toString()).toBe(
        'http://127.0.0.1:18095/v1/account-mirrors/materializations?status=terminal&provider=chatgpt&runtimeProfile=default&sourceType=catalog_item&limit=2',
      );
      return new Response(JSON.stringify({
        object: 'history_materialization_jobs',
        generatedAt: '2026-05-22T19:32:00.000Z',
        status: 'terminal',
        provider: 'chatgpt',
        runtimeProfile: 'default',
        sourceType: 'catalog_item',
        limit: 2,
        jobs: [historyJob({ status: 'succeeded' })],
        metrics: {
          total: 1,
          byStatus: { succeeded: 1 },
          active: 0,
          terminal: 1,
        },
      }));
    });

    const listed = await listApiHistoryMaterializationJobsForCli({
      port: 18095,
      status: 'terminal',
      provider: 'chatgpt',
      runtimeProfile: 'default',
      sourceType: 'catalog_item',
      limit: 2,
    }, fetchImpl as never);
    expect(formatApiHistoryMaterializationJobsCliSummary(listed)).toContain('History materialization jobs: 1 job');
    expect(formatApiHistoryMaterializationJobsCliSummary(listed)).toContain('hmj_test_1 status=succeeded');

    const cancelled = await cancelApiHistoryMaterializationJobForCli({
      port: 18095,
      id: 'hmj_test_1',
    }, fetchImpl as never);
    expect(formatApiHistoryMaterializationJobCliSummary(cancelled)).toContain('Status: cancelled');
  });
});

function historyJob(input: { status: string }) {
  return {
    object: 'history_materialization_job',
    id: 'hmj_test_1',
    source: {
      type: 'catalog_item',
      catalogItemId: 'conv_1',
      catalogKind: 'conversations',
    },
    request: {
      provider: 'chatgpt',
      runtimeProfile: 'default',
      catalogItemId: 'conv_1',
      catalogKind: 'conversations',
    },
    sourceKey: '{}',
    status: input.status,
    createdAt: '2026-05-22T19:30:00.000Z',
    updatedAt: '2026-05-22T19:31:00.000Z',
    startedAt: input.status === 'queued' ? null : '2026-05-22T19:30:01.000Z',
    completedAt: input.status === 'queued' ? null : '2026-05-22T19:31:00.000Z',
    attemptCount: input.status === 'queued' ? 0 : 1,
    result: input.status === 'succeeded'
      ? {
          object: 'history_materialization_result',
          status: 'materialized',
          target: {
            provider: 'chatgpt',
            runtimeProfile: 'default',
            conversationId: 'conv_1',
          },
          metrics: {
            conversations: 1,
            materialized: 1,
            skipped: 0,
            failed: 0,
          },
          message: 'History materialization downloaded 1 asset.',
        }
      : null,
    error: null,
    message: 'History materialization job queued.',
  };
}
