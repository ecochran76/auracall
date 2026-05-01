import { describe, expect, it } from 'vitest';
import { createApiStatusToolHandler } from '../src/mcp/tools/apiStatus.js';

const statusPayload = {
  ok: true,
  accountMirrorScheduler: {
    enabled: true,
    state: 'idle',
    dryRun: true,
    lastWakeReason: 'media-generation-settled',
    lastWakeAt: '2026-04-30T12:00:01.000Z',
    operatorStatus: {
      posture: 'backpressured',
      reason: 'minimum interval has not elapsed',
      backpressureReason: 'routine-delayed',
    },
    lastPass: {
      action: 'skipped',
      backpressure: {
        reason: 'routine-delayed',
        message: 'minimum interval has not elapsed',
      },
    },
    history: {
      entries: [
        {
          completedAt: '2026-04-30T11:55:00.000Z',
          selectedTarget: {
            provider: 'chatgpt',
            runtimeProfileId: 'default',
          },
          backpressure: {
            reason: 'yielded-to-queued-work',
          },
          refresh: {
            mirrorCompleteness: {
              remainingDetailSurfaces: {
                total: 4,
              },
            },
            metadataEvidence: {
              attachmentInventory: {
                yieldCause: {
                  ownerCommand: 'media-generation:chatgpt:image',
                },
              },
            },
          },
        },
      ],
    },
  },
};

describe('mcp api_status tool', () => {
  it('reads local API status with compact lazy mirror posture', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe('http://127.0.0.1:18080/status');
      return new Response(JSON.stringify(statusPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const handler = createApiStatusToolHandler({ fetchImpl });

    const result = await handler({
      port: 18080,
      expectedAccountMirrorPosture: 'backpressured',
      expectedAccountMirrorBackpressure: 'routine-delayed',
    });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'AuraCall API 127.0.0.1:18080 is ok; mirror posture backpressured; scheduler state idle.',
        },
      ],
      structuredContent: {
        ok: true,
        host: '127.0.0.1',
        port: 18080,
        scheduler: {
          enabled: true,
          state: 'idle',
          dryRun: true,
          lastWakeReason: 'media-generation-settled',
          lastWakeAt: '2026-04-30T12:00:01.000Z',
          lastAction: 'skipped',
          operatorStatus: {
            posture: 'backpressured',
            reason: 'minimum interval has not elapsed',
            backpressureReason: 'routine-delayed',
          },
          backpressure: {
            reason: 'routine-delayed',
            message: 'minimum interval has not elapsed',
          },
          latestYield: {
            completedAt: '2026-04-30T11:55:00.000Z',
            provider: 'chatgpt',
            runtimeProfileId: 'default',
            queuedOwnerCommand: 'media-generation:chatgpt:image',
            remainingDetailSurfaces: 4,
          },
        },
      },
    });
  });

  it('fails when an expected mirror posture does not match', async () => {
    const handler = createApiStatusToolHandler({
      fetchImpl: async () => new Response(JSON.stringify(statusPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    await expect(handler({
      port: 18080,
      expectedAccountMirrorPosture: 'healthy',
    })).rejects.toThrow(
      'Expected accountMirrorScheduler.operatorStatus.posture to be healthy, got backpressured.',
    );
  });
});
