import { describe, expect, test, vi } from 'vitest';
import { BrowserService } from '../../packages/browser-service/src/service/browserService.js';
import type { ResolvedBrowserConfig } from '../../packages/browser-service/src/types.js';
import { DEFAULT_BROWSER_CONFIG } from '../../src/browser/config.js';

const processCheckMocks = vi.hoisted(() => ({
  isDevToolsResponsive: vi.fn(async () => false),
}));

vi.mock('../../packages/browser-service/src/processCheck.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/processCheck.js')>();
  return {
    ...actual,
    isDevToolsResponsive: processCheckMocks.isDevToolsResponsive,
  };
});

describe('BrowserService core launch port handling', () => {
  test('does not launch a managed profile on an occupied configured fixed port', async () => {
    processCheckMocks.isDevToolsResponsive.mockResolvedValueOnce(true);
    const launchManualLoginSession = vi.fn(async () => ({
      chrome: { port: 45042, host: '127.0.0.1' },
      port: 45042,
    }));
    const service = new BrowserService(
      {
        ...DEFAULT_BROWSER_CONFIG,
        manualLoginProfileDir: '/tmp/auracall/default/grok',
        chromeProfile: 'Default',
        debugPort: 45011,
        debugPortStrategy: 'fixed',
      } as ResolvedBrowserConfig,
      {
        resolveBrowserListTarget: vi.fn(async () => undefined),
        pruneRegistry: vi.fn(async () => {}),
        launchManualLoginSession,
      },
    );

    const target = await service.resolveDevToolsTarget({
      ensurePort: true,
      defaultProfileDir: '/tmp/auracall/default/grok',
      launchUrl: 'https://grok.com/',
    });

    expect(target).toEqual({ host: '127.0.0.1', port: 45042, launched: true });
    expect(launchManualLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userDataDir: '/tmp/auracall/default/grok',
        debugPort: undefined,
        debugPortStrategy: 'auto',
      }),
    );
  });

  test('keeps a configured fixed port when it is not already occupied', async () => {
    processCheckMocks.isDevToolsResponsive.mockResolvedValueOnce(false);
    const launchManualLoginSession = vi.fn(async () => ({
      chrome: { port: 45011, host: '127.0.0.1' },
      port: 45011,
    }));
    const service = new BrowserService(
      {
        ...DEFAULT_BROWSER_CONFIG,
        manualLoginProfileDir: '/tmp/auracall/default/grok',
        chromeProfile: 'Default',
        debugPort: 45011,
        debugPortStrategy: 'fixed',
      } as ResolvedBrowserConfig,
      {
        resolveBrowserListTarget: vi.fn(async () => undefined),
        pruneRegistry: vi.fn(async () => {}),
        launchManualLoginSession,
      },
    );

    await service.resolveDevToolsTarget({
      ensurePort: true,
      defaultProfileDir: '/tmp/auracall/default/grok',
      launchUrl: 'https://grok.com/',
    });

    expect(launchManualLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({
        debugPort: 45011,
        debugPortStrategy: 'fixed',
      }),
    );
  });
});
