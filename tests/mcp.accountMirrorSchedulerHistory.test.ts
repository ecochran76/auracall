import { describe, expect, it } from 'vitest';
import {
  createAccountMirrorSchedulerHistoryToolHandler,
} from '../src/mcp/tools/accountMirrorSchedulerHistory.js';

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

describe('mcp account_mirror_scheduler_history tool', () => {
  it('reads compact scheduler history from the local API', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe('http://127.0.0.1:18080/v1/account-mirrors/scheduler/history?limit=5');
      return new Response(JSON.stringify(historyPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const handler = createAccountMirrorSchedulerHistoryToolHandler({ fetchImpl });

    const result = await handler({
      port: 18080,
      limit: 5,
    });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Account mirror scheduler history: 1 entries; latest yield none.',
        },
      ],
      structuredContent: {
        host: '127.0.0.1',
        port: 18080,
        history: historyPayload,
      },
    });
  });
});
