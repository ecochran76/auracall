import { describe, expect, it } from 'vitest';
import {
  assertApiStatusBackpressure,
  formatApiStatusCliSummary,
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
    lastPass: {
      action: 'skipped',
      backpressure: {
        reason: 'routine-delayed',
        message: 'minimum interval has not elapsed',
      },
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
        backpressure: {
          reason: 'routine-delayed',
          message: 'minimum interval has not elapsed',
        },
      },
    });
    expect(formatApiStatusCliSummary(summary)).toContain(
      'Latest lazy mirror backpressure: routine-delayed - minimum interval has not elapsed',
    );
    expect(formatApiStatusCliSummary(summary)).toContain(
      'Latest lazy mirror wake: media-generation-settled at 2026-04-29T12:00:01.000Z',
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
});
