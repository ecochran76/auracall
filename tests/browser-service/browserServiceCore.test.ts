import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BrowserService } from '../../packages/browser-service/src/service/browserService.js';
import { createBrowserInteractionGovernor } from '../../packages/browser-service/src/service/interactionGovernor.js';
import type { ResolvedBrowserConfig } from '../../packages/browser-service/src/types.js';
import { DEFAULT_BROWSER_CONFIG } from '../../src/browser/config.js';

const processCheckMocks = vi.hoisted(() => ({
  isDevToolsResponsive: vi.fn(async () => false),
}));

const chromeLifecycleMocks = vi.hoisted(() => ({
  connectToChrome: vi.fn(),
}));

vi.mock('../../packages/browser-service/src/processCheck.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/browser-service/src/processCheck.js')>();
  return {
    ...actual,
    isDevToolsResponsive: processCheckMocks.isDevToolsResponsive,
  };
});

vi.mock('../../packages/browser-service/src/chromeLifecycle.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/browser-service/src/chromeLifecycle.js')>();
  return {
    ...actual,
    connectToChrome: chromeLifecycleMocks.connectToChrome,
  };
});

describe('BrowserService DevTools attachment liveness', () => {
  beforeEach(() => {
    chromeLifecycleMocks.connectToChrome.mockReset();
  });

  test('bounds stalled browser target resolution and reports the active stage', async () => {
    const stages: string[] = [];
    const service = new BrowserService(DEFAULT_BROWSER_CONFIG as ResolvedBrowserConfig, {
      resolveBrowserListTarget: vi.fn(
        () => new Promise<{ host?: string; port?: number } | undefined>(() => undefined),
      ),
      pruneRegistry: vi.fn(async () => {}),
      launchManualLoginSession: vi.fn(),
    });

    await expect(
      Promise.race([
        service.connectDevTools({
          stageTimeoutMs: 25,
          onStage: (stage) => stages.push(stage),
        }),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('test guard elapsed')), 100),
        ),
      ]),
    ).rejects.toThrow(
      'DevTools attachment stage browserDevToolsTargetResolution timed out after 25ms.',
    );
    expect(stages).toEqual(['browserDevToolsTargetResolution']);
    expect(chromeLifecycleMocks.connectToChrome).not.toHaveBeenCalled();
  });

  test('passes attachment bounds and stage reporting into the CDP connection', async () => {
    const stages: string[] = [];
    const abortController = new AbortController();
    chromeLifecycleMocks.connectToChrome.mockRejectedValueOnce(
      new Error('DevTools attachment stage browserDevToolsCdpConnection timed out after 25ms.'),
    );
    const service = new BrowserService(DEFAULT_BROWSER_CONFIG as ResolvedBrowserConfig, {
      resolveBrowserListTarget: vi.fn(async () => ({ host: '127.0.0.1', port: 45015 })),
      pruneRegistry: vi.fn(async () => {}),
      launchManualLoginSession: vi.fn(),
    });

    await expect(
      service.connectDevTools({
        abortSignal: abortController.signal,
        stageTimeoutMs: 25,
        onStage: (stage) => stages.push(stage),
      }),
    ).rejects.toThrow('browserDevToolsCdpConnection');
    expect(stages).toEqual([
      'browserDevToolsTargetResolution',
      'browserDevToolsCdpConnection',
    ]);
    expect(chromeLifecycleMocks.connectToChrome).toHaveBeenCalledWith(
      45015,
      expect.any(Function),
      '127.0.0.1',
      expect.objectContaining({
        abortSignal: abortController.signal,
        timeoutMs: 25,
      }),
    );
  });
});

describe('BrowserService core launch port handling', () => {
  test('reattaches to a responsive Chrome process that owns the managed browser profile', async () => {
    processCheckMocks.isDevToolsResponsive.mockResolvedValueOnce(true);
    const launchManualLoginSession = vi.fn();
    const resolveManagedProfileOwner = vi.fn(async () => ({
      host: '127.0.0.1',
      port: 45011,
      pid: 1234,
    }));
    const service = new BrowserService(
      {
        ...DEFAULT_BROWSER_CONFIG,
        manualLoginProfileDir: '/tmp/auracall/wsl-chrome-3/chatgpt',
        chromeProfile: 'Default',
        debugPort: 45011,
        debugPortStrategy: 'fixed',
      } as ResolvedBrowserConfig,
      {
        resolveBrowserListTarget: vi.fn(async () => undefined),
        resolveManagedProfileOwner,
        pruneRegistry: vi.fn(async () => {}),
        launchManualLoginSession,
      },
    );

    const target = await service.resolveDevToolsTarget({
      ensurePort: true,
      defaultProfileDir: '/tmp/auracall/wsl-chrome-3/chatgpt',
      launchUrl: 'https://chatgpt.com/',
    });

    expect(target).toEqual({ host: '127.0.0.1', port: 45011, launched: false });
    expect(resolveManagedProfileOwner).toHaveBeenCalledWith(
      '/tmp/auracall/wsl-chrome-3/chatgpt',
    );
    expect(launchManualLoginSession).not.toHaveBeenCalled();
  });

  test('fails closed when a Chrome process owns the managed browser profile without responsive DevTools', async () => {
    processCheckMocks.isDevToolsResponsive.mockResolvedValueOnce(false);
    const launchManualLoginSession = vi.fn();
    const service = new BrowserService(
      {
        ...DEFAULT_BROWSER_CONFIG,
        manualLoginProfileDir: '/tmp/auracall/wsl-chrome-3/chatgpt',
        chromeProfile: 'Default',
        debugPort: 45011,
        debugPortStrategy: 'fixed',
      } as ResolvedBrowserConfig,
      {
        resolveBrowserListTarget: vi.fn(async () => undefined),
        resolveManagedProfileOwner: vi.fn(async () => ({
          host: '127.0.0.1',
          port: 45011,
          pid: 1234,
        })),
        pruneRegistry: vi.fn(async () => {}),
        launchManualLoginSession,
      },
    );

    await expect(
      service.resolveDevToolsTarget({
        ensurePort: true,
        defaultProfileDir: '/tmp/auracall/wsl-chrome-3/chatgpt',
        launchUrl: 'https://chatgpt.com/',
      }),
    ).rejects.toThrow('already owned by Chrome process 1234');
    expect(launchManualLoginSession).not.toHaveBeenCalled();
  });

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
        blankTabLimit: 0,
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
        blankTabLimit: 0,
      }),
    );
  });

  test('passes the caller abort signal into managed browser launch', async () => {
    const controller = new AbortController();
    const stages: string[] = [];
    const launchManualLoginSession = vi.fn(async () => ({
      chrome: { port: 45011, host: '127.0.0.1' },
      port: 45011,
    }));
    const service = new BrowserService(
      {
        ...DEFAULT_BROWSER_CONFIG,
        manualLoginProfileDir: '/tmp/auracall/wsl-chrome-3/chatgpt',
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
      defaultProfileDir: '/tmp/auracall/wsl-chrome-3/chatgpt',
      launchUrl: 'https://chatgpt.com/',
      abortSignal: controller.signal,
      onStage: (stage) => stages.push(stage),
    });

    expect(launchManualLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: controller.signal,
        onStage: expect.any(Function),
      }),
    );
    expect(stages).toEqual([
      'browserTargetDiscovery',
      'browserDebugPortResolution',
      'browserManualLoginLaunch',
    ]);
  });
});

describe('browser interaction governor', () => {
  test('applies global spacing and action-class cooldowns before browser interactions', async () => {
    let nowMs = 1_000;
    const sleeps: number[] = [];
    const governor = createBrowserInteractionGovernor({
      maxInteractionsPerMinute: 6,
      cooldownsByClass: {
        'conversation-read': 120_000,
      },
      now: () => nowMs,
      sleep: async (ms) => {
        sleeps.push(ms);
        nowMs += ms;
      },
    });

    await governor.beforeInteraction('conversation-read');
    nowMs += 1_000;
    await governor.beforeInteraction('page-refresh');
    nowMs += 1_000;
    await governor.beforeInteraction('conversation-read');

    expect(sleeps).toEqual([9_000, 109_000]);
  });

  test('does not publish late pacing state after a caller aborts admission', async () => {
    let nowMs = 1_000;
    let releaseSleep: (() => void) | undefined;
    const sleep = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSleep = resolve;
        }),
    );
    const governor = createBrowserInteractionGovernor({
      maxInteractionsPerMinute: 6,
      cooldownsByClass: { renavigation: 120_000 },
      now: () => nowMs,
      sleep,
    });
    await governor.beforeInteraction('renavigation');
    const abortController = new AbortController();
    const abortReason = new Error('conversation context deadline expired');
    const abortedAdmission = governor.beforeInteraction('renavigation', abortController.signal);
    await Promise.resolve();
    expect(sleep).toHaveBeenCalledTimes(1);

    abortController.abort(abortReason);
    await expect(abortedAdmission).rejects.toBe(abortReason);
    nowMs += 120_000;
    releaseSleep?.();
    await Promise.resolve();
    await governor.beforeInteraction('renavigation');

    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
