import { afterEach, expect, it, vi } from 'vitest';
import { runChatgptDeveloperAppOperationForCli } from '../../src/cli/chatgptDeveloperAppsCommand.js';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it.each(['list', 'test'] as const)('bounds stalled inventory for %s and reports its stage', async (action) => {
  vi.useFakeTimers();
  let failure: unknown;
  const close = vi.fn(async () => undefined);
  const pending = runChatgptDeveloperAppOperationForCli(
    {} as never,
    action === 'list' ? { action } : { action, app: 'fixture', expectedAccount: 'fixture@example.invalid', submit: false, confirmed: false },
    {
      listTimeoutMs: 10,
      closeTimeoutMs: 10,
      createBrowser: async () => ({}) as never,
      createAdapter: () => ({ readState: () => new Promise<never>(() => undefined), close }) as never,
    },
  );
  void pending.catch(error => { failure = error; });
  await vi.advanceTimersByTimeAsync(100);
  expect(failure).toMatchObject({ code: 'developer_app_timeout', stage: 'inventory', timeoutMs: 10 });
  expect(close).toHaveBeenCalledOnce();
});
