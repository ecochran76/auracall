import { describe, expect, it, vi } from 'vitest';
import type { AccountMirrorRefreshResult } from '../src/accountMirror/refreshService.js';
import { createAccountMirrorRefreshToolHandler } from '../src/mcp/tools/accountMirrorRefresh.js';

describe('mcp account_mirror_refresh tool', () => {
  it('requests one explicit refresh through the shared account mirror service', async () => {
    const response: AccountMirrorRefreshResult = {
      object: 'account_mirror_refresh' as const,
      requestId: 'acctmirror_test',
      status: 'completed' as const,
      provider: 'chatgpt' as const,
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      startedAt: '2026-04-29T12:00:00.000Z',
      completedAt: '2026-04-29T12:00:01.000Z',
      dispatcher: {
        key: 'managed-profile:/tmp/default/chatgpt::service:chatgpt',
        operationId: 'op_123',
        blockedBy: null,
      },
      metadataCounts: {
        projects: 1,
        conversations: 2,
        artifacts: 0,
        media: 0,
      },
      mirrorStatus: {
        object: 'account_mirror_status' as const,
        generatedAt: '2026-04-29T12:00:01.000Z',
        entries: [],
        metrics: {
          total: 1,
          eligible: 0,
          delayed: 1,
          blocked: 0,
        },
      },
    };
    const requestRefresh = vi.fn(async () => response);
    const handler = createAccountMirrorRefreshToolHandler({
      service: {
        requestRefresh,
      },
    });

    const result = await handler({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      explicitRefresh: true,
    });

    expect(requestRefresh).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      explicitRefresh: true,
      queueTimeoutMs: undefined,
      queuePollMs: undefined,
    });
    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'account_mirror_refresh',
        requestId: 'acctmirror_test',
        status: 'completed',
        provider: 'chatgpt',
        runtimeProfileId: 'default',
      },
    });
  });
});
