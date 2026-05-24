import { describe, expect, it, vi } from 'vitest';
import { registerAccountMirrorCompletionTools } from '../src/mcp/tools/accountMirrorCompletion.js';
import type {
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionService,
} from '../src/accountMirror/completionService.js';

describe('mcp account mirror completion tools', () => {
  it('passes full-sweep materialization options to the shared completion service', async () => {
    const operation = accountMirrorCompletionOperation();
    const start = vi.fn(() => operation);
    const tools = new Map<string, (input: unknown) => Promise<unknown>>();
    registerAccountMirrorCompletionTools({
      registerTool: vi.fn((name: string, _config: unknown, handler: (input: unknown) => Promise<unknown>) => {
        tools.set(name, handler);
      }),
    } as never, {
      service: {
        start,
        list: vi.fn(),
        read: vi.fn(),
        control: vi.fn(),
      } satisfies AccountMirrorCompletionService,
    });

    const handler = tools.get('account_mirror_completion_start');
    if (!handler) throw new Error('Expected account_mirror_completion_start tool.');
    const result = await handler({
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      maxPasses: 1,
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media'],
      materializationMaxItems: 2,
      materializationRefreshSnapshot: true,
    });

    expect(start).toHaveBeenCalledWith({
      provider: 'gemini',
      runtimeProfileId: 'auracall-gemini-pro',
      maxPasses: 1,
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media'],
      materializationMaxItems: 2,
      materializationRefreshSnapshot: true,
      materializationForce: undefined,
    });
    expect(result).toMatchObject({
      structuredContent: {
        id: 'acctmirror_mcp_full_sweep',
        sweepMode: 'full_sweep',
      },
    });
  });
});

function accountMirrorCompletionOperation(): AccountMirrorCompletionOperation {
  return {
    object: 'account_mirror_completion',
    id: 'acctmirror_mcp_full_sweep',
    provider: 'gemini',
    runtimeProfileId: 'auracall-gemini-pro',
    mode: 'bounded',
    sweepMode: 'full_sweep',
    phase: 'backfill_history',
    status: 'queued',
    startedAt: '2026-05-23T15:00:00.000Z',
    completedAt: null,
    nextAttemptAt: null,
    maxPasses: 1,
    passCount: 0,
    lastRefresh: null,
    materializationPolicy: 'full_missing_assets',
    materializationAssetKinds: ['media'],
    materializationMaxItems: 2,
    materializationRefreshSnapshot: true,
    materializationForce: false,
    materializationCursor: null,
    mirrorCompleteness: null,
    error: null,
  };
}
