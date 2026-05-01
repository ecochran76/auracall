import { describe, expect, it } from 'vitest';
import {
  assertApiStatusBackpressure,
  assertApiStatusSchedulerPosture,
  formatApiStatusCliSummary,
  parseApiStatusAccountMirrorPosture,
  parseApiStatusBackpressureReason,
  readApiStatusForCli,
  summarizeApiStatusPayload,
} from '../../src/cli/apiStatusCommand.js';

const statusPayload = {
  ok: true,
  accountMirrorScheduler: {
    enabled: true,
    state: 'idle',
    dryRun: true,
    lastWakeReason: 'media-generation-settled',
    lastWakeAt: '2026-04-29T12:00:01.000Z',
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
          completedAt: '2026-04-29T11:55:00.000Z',
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

describe('api status CLI helpers', () => {
  it('summarizes account mirror scheduler backpressure from /status', () => {
    const summary = summarizeApiStatusPayload(statusPayload, {
      host: '127.0.0.1',
      port: 18080,
    });

    expect(summary).toMatchObject({
      ok: true,
      host: '127.0.0.1',
      port: 18080,
      scheduler: {
        enabled: true,
        state: 'idle',
        dryRun: true,
        lastWakeReason: 'media-generation-settled',
        lastWakeAt: '2026-04-29T12:00:01.000Z',
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
          completedAt: '2026-04-29T11:55:00.000Z',
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          queuedOwnerCommand: 'media-generation:chatgpt:image',
          remainingDetailSurfaces: 4,
        },
      },
    });
    expect(formatApiStatusCliSummary(summary)).toContain(
      'Latest lazy mirror backpressure: routine-delayed - minimum interval has not elapsed',
    );
    expect(formatApiStatusCliSummary(summary)).toContain(
      'Latest lazy mirror wake: media-generation-settled at 2026-04-29T12:00:01.000Z',
    );
    expect(formatApiStatusCliSummary(summary)).toContain(
      'Account mirror posture: backpressured - minimum interval has not elapsed',
    );
    expect(formatApiStatusCliSummary(summary)).toContain(
      'Latest lazy mirror yield: chatgpt/default at 2026-04-29T11:55:00.000Z queued=media-generation:chatgpt:image remaining=4',
    );
  });

  it('asserts the expected account mirror backpressure reason', () => {
    const summary = summarizeApiStatusPayload(statusPayload, {
      host: '127.0.0.1',
      port: 18080,
    });

    expect(() => assertApiStatusBackpressure(summary, {
      expectedReason: 'routine-delayed',
    })).not.toThrow();
    expect(() => assertApiStatusBackpressure(summary, {
      expectedReason: 'blocked-by-browser-work',
    })).toThrow(
      'Expected accountMirrorScheduler.lastPass.backpressure.reason to be blocked-by-browser-work, got routine-delayed.',
    );
  });

  it('asserts the expected account mirror scheduler posture', () => {
    const summary = summarizeApiStatusPayload(statusPayload, {
      host: '127.0.0.1',
      port: 18080,
    });

    expect(() => assertApiStatusSchedulerPosture(summary, {
      expectedPosture: 'backpressured',
    })).not.toThrow();
    expect(() => assertApiStatusSchedulerPosture(summary, {
      expectedPosture: 'disabled',
    })).toThrow(
      'Expected accountMirrorScheduler.operatorStatus.posture to be disabled, got backpressured.',
    );
  });

  it('reads /status through fetch for installed-runtime smoke use', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe('http://127.0.0.1:18080/status');
      return new Response(JSON.stringify(statusPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await expect(readApiStatusForCli({
      port: 18080,
      timeoutMs: 1000,
    }, fetchImpl)).resolves.toMatchObject({
      scheduler: {
        backpressure: {
          reason: 'routine-delayed',
        },
      },
    });
  });

  it('validates expected backpressure reason names', () => {
    expect(parseApiStatusBackpressureReason('yielded-to-queued-work')).toBe('yielded-to-queued-work');
    expect(() => parseApiStatusBackpressureReason('delayed')).toThrow(
      'Invalid backpressure reason "delayed". Use one of:',
    );
  });

  it('validates expected account mirror posture names', () => {
    expect(parseApiStatusAccountMirrorPosture('disabled')).toBe('disabled');
    expect(parseApiStatusAccountMirrorPosture('backpressured')).toBe('backpressured');
    expect(() => parseApiStatusAccountMirrorPosture('blocked')).toThrow(
      'Invalid account mirror posture "blocked". Use one of:',
    );
  });
});
