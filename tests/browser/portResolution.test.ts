import { describe, expect, test, vi } from 'vitest';
import { resolveBrowserListTarget } from '../../src/browser/service/portResolution.js';

const portResolutionCoreMocks = vi.hoisted(() => ({
  resolveBrowserListTargetCore: vi.fn(async () => undefined),
}));

vi.mock('../../packages/browser-service/src/service/portResolution.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/service/portResolution.js')>();
  return {
    ...actual,
    resolveBrowserListTarget: portResolutionCoreMocks.resolveBrowserListTargetCore,
  };
});

describe('resolveBrowserListTarget', () => {
  test('ignores a stale configured fixed port when the selected target resolves to another managed browser profile', async () => {
    portResolutionCoreMocks.resolveBrowserListTargetCore.mockResolvedValueOnce(undefined);

    await resolveBrowserListTarget(
      {
        auracallProfile: 'default',
        browser: {
          target: 'chatgpt',
          debugPort: 45011,
          manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
        services: {
          chatgpt: {
            manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
          },
          grok: {
            manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
          },
        },
      } as any,
      'chatgpt',
    );

    expect(portResolutionCoreMocks.resolveBrowserListTargetCore).toHaveBeenCalledWith(
      expect.objectContaining({
        profilePath: '/tmp/auracall/browser-profiles/default/chatgpt',
        configuredPort: null,
      }),
    );
  });
});
