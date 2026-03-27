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
});
