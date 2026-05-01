import { describe, expect, it } from 'vitest';
import {
  formatApiSchedulerHistoryCliSummary,
  readApiSchedulerHistoryForCli,
} from '../../src/cli/apiSchedulerHistoryCommand.js';

const historyPayload = {
  object: 'account_mirror_scheduler_history',
  updatedAt: '2026-05-01T00:37:19.705Z',
  limit: 5,
  latestYield: null,
  yieldEvents: [],
  entries: [
    {
      completedAt: '2026-05-01T00:37:19.705Z',
      startedAt: '2026-05-01T00:34:10.644Z',
      mode: 'execute',
      action: 'refresh-completed',
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      backpressureReason: 'none',
      backpressureMessage: null,
      remainingDetailSurfaces: 67,
      yielded: false,
    },
  ],
};

describe('api scheduler-history CLI helpers', () => {
  it('reads compact scheduler history through fetch', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe('http://127.0.0.1:18080/v1/account-mirrors/scheduler/history?limit=5');
      return new Response(JSON.stringify(historyPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await expect(readApiSchedulerHistoryForCli({
      port: 18080,
      timeoutMs: 1000,
      limit: 5,
    }, fetchImpl)).resolves.toMatchObject({
      host: '127.0.0.1',
      port: 18080,
      history: historyPayload,
    });
  });

  it('formats recent passes and no-yield state', () => {
    const output = formatApiSchedulerHistoryCliSummary({
      host: '127.0.0.1',
      port: 18080,
      history: historyPayload,
    });

    expect(output).toContain('AuraCall account mirror scheduler history (127.0.0.1:18080)');
    expect(output).toContain('Latest yield: none');
    expect(output).toContain(
      '- 2026-05-01T00:37:19.705Z refresh-completed chatgpt/default backpressure=none yielded=false',
    );
  });

  it('formats latest yielded pass details when present', () => {
    const output = formatApiSchedulerHistoryCliSummary({
      host: '127.0.0.1',
      port: 18080,
      history: {
        ...historyPayload,
        latestYield: {
          completedAt: '2026-05-01T00:40:00.000Z',
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          queuedWork: {
            ownerCommand: 'media-generation:chatgpt:image',
          },
          remainingDetailSurfaces: {
            total: 4,
          },
        },
      },
    });

    expect(output).toContain(
      'Latest yield: chatgpt/default at 2026-05-01T00:40:00.000Z queued=media-generation:chatgpt:image remaining=4',
    );
  });
});
