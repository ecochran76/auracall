import { describe, expect, test, vi } from 'vitest';
import { __test__ as promptComposer } from '../../src/browser/actions/promptComposer.js';

describe('promptComposer', () => {
  test('does not treat cleared composer + stop button as committed without a new turn', async () => {
    vi.useFakeTimers();
    try {
      const runtime = {
        evaluate: vi
          .fn()
          // Baseline read (turn count)
          .mockResolvedValueOnce({ result: { value: 10 } })
          // Polls (repeat)
          .mockResolvedValue({
            result: {
              value: {
                turnsCount: 10,
                userMatched: false,
                prefixMatched: false,
                lastMatched: false,
                hasNewTurn: false,
                stopVisible: true,
                assistantVisible: false,
                composerCleared: true,
                inConversation: false,
              },
            },
          }),
      } as unknown as { evaluate: (args: { expression: string; returnByValue?: boolean }) => Promise<unknown> };

      const promise = promptComposer.verifyPromptCommitted(runtime as never, 'hello', 150);
      const assertion = expect(promise).rejects.toThrow(/prompt did not appear/i);
      await vi.advanceTimersByTimeAsync(250);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  test('allows prompt match even if baseline turn count cannot be read', async () => {
    const runtime = {
      evaluate: vi
        .fn()
        // Baseline read fails
        .mockRejectedValueOnce(new Error('turn read failed'))
        // First poll shows prompt match (baseline unknown)
        .mockResolvedValueOnce({
          result: {
            value: {
              turnsCount: 1,
              userMatched: true,
              prefixMatched: false,
              lastMatched: true,
              hasNewTurn: false,
              stopVisible: false,
              assistantVisible: false,
              composerCleared: false,
              inConversation: true,
            },
          },
        }),
    } as unknown as { evaluate: (args: { expression: string; returnByValue?: boolean }) => Promise<unknown> };

    await expect(promptComposer.verifyPromptCommitted(runtime as never, 'hello', 150)).resolves.toBe(1);
  });

  test('waits for hot conversation submit readiness until stop state clears', async () => {
    vi.useFakeTimers();
    try {
      const runtime = {
        evaluate: vi
          .fn()
          .mockResolvedValueOnce({ result: { value: { ready: false } } })
          .mockResolvedValueOnce({ result: { value: { ready: false } } })
          .mockResolvedValueOnce({ result: { value: { ready: true } } }),
      } as unknown as { evaluate: (args: { expression: string; returnByValue?: boolean }) => Promise<unknown> };

      const promise = promptComposer.waitForComposerReadyToSubmit(runtime as never, 500);
      await vi.advanceTimersByTimeAsync(250);
      await expect(promise).resolves.toBeUndefined();
      expect((runtime.evaluate as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test('accepts immediate submit readiness when conversation is already settled', async () => {
    const runtime = {
      evaluate: vi.fn().mockResolvedValueOnce({ result: { value: { ready: true } } }),
    } as unknown as { evaluate: (args: { expression: string; returnByValue?: boolean }) => Promise<unknown> };

    await expect(promptComposer.waitForComposerReadyToSubmit(runtime as never, 500)).resolves.toBeUndefined();
    expect((runtime.evaluate as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
