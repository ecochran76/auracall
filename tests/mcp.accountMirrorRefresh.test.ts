import { describe, expect, it, vi } from 'vitest';
import type { AccountMirrorRefreshResult } from '../src/accountMirror/refreshService.js';
import { createAccountMirrorRefreshToolHandler } from '../src/mcp/tools/accountMirrorRefresh.js';

describe('mcp account_mirror_refresh tool', () => {
  it('requests one explicit refresh through the shared account mirror service', async () => {
    const mirrorCompleteness = {
      state: 'complete' as const,
      summary: 'Mirrored metadata indexes are complete within current provider surfaces.',
      remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
      signals: {
        projectsTruncated: false,
        conversationsTruncated: false,
        attachmentInventoryTruncated: false,
        attachmentCursorPresent: false,
      },
    };
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
        files: 0,
        media: 0,
      },
      metadataEvidence: {
        identitySource: 'profile-menu',
        projectSampleIds: ['project_1'],
        conversationSampleIds: ['conv_1', 'conv_2'],
        truncated: {
          projects: false,
          conversations: false,
          artifacts: false,
        },
      },
      mirrorCompleteness,
      detectedIdentityKey: 'ecochran76@gmail.com',
      detectedAccountLevel: 'Business',
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
