import { describe, expect, test, vi } from 'vitest';
import type { ResolvedUserConfig } from '../../src/config.js';
import { BrowserService } from '../../src/browser/service/browserService.js';

const sessionMocks = vi.hoisted(() => ({
  resolveBrowserListTarget: vi.fn(async () => ({ host: '127.0.0.1', port: 9222 })),
  pruneRegistry: vi.fn(async () => {}),
}));

vi.mock('../../src/browser/service/session.js', () => ({
  resolveBrowserListTarget: sessionMocks.resolveBrowserListTarget,
  pruneRegistry: sessionMocks.pruneRegistry,
}));

const instanceScannerMocks = vi.hoisted(() => ({
  scanRegisteredInstance: vi.fn(async () => ({
    instance: {
      pid: 9999,
      port: 9222,
      host: '127.0.0.1',
      profilePath: '/tmp/profile',
      profileName: 'Default',
      type: 'chrome',
      launchedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    },
    tabs: [] as Array<{ targetId?: string; url?: string; title?: string; type?: string }>,
  })),
}));

const loggerMessages = vi.hoisted(() => [] as string[]);

vi.mock('../../packages/browser-service/src/service/instanceScanner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/service/instanceScanner.js')>();
  return {
    ...actual,
    scanRegisteredInstance: instanceScannerMocks.scanRegisteredInstance,
  };
});

const stateRegistryMocks = vi.hoisted(() => ({
  listInstances: vi.fn(async () => []),
  listInstancesWithLiveness: vi.fn(async () => []),
  updateInstance: vi.fn(async () => {}),
  registerInstance: vi.fn(async () => {}),
}));

vi.mock('../../packages/browser-service/src/service/stateRegistry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/service/stateRegistry.js')>();
  return {
    ...actual,
    listInstances: stateRegistryMocks.listInstances,
    listInstancesWithLiveness: stateRegistryMocks.listInstancesWithLiveness,
    updateInstance: stateRegistryMocks.updateInstance,
    registerInstance: stateRegistryMocks.registerInstance,
  };
});

vi.mock('../../packages/browser-service/src/processCheck.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/processCheck.js')>();
  return {
    ...actual,
    findChromePidUsingUserDataDir: vi.fn(async () => null),
    isDevToolsResponsive: vi.fn(async () => true),
  };
});

vi.mock('../../src/browser/manualLogin.js', () => ({
  launchManualLoginSession: vi.fn(async () => ({
    chrome: { port: 9222, host: '127.0.0.1' },
    port: 9222,
  })),
}));

describe('BrowserService resolveServiceTarget', () => {
  const baseConfig = {
    browser: {
      manualLoginProfileDir: '/tmp/profile',
      chromeProfile: 'Default',
    },
  } as unknown as ResolvedUserConfig;

  test('matches ChatGPT tabs by domain', async () => {
    loggerMessages.length = 0;
    stateRegistryMocks.listInstancesWithLiveness.mockResolvedValueOnce([]);
    stateRegistryMocks.listInstancesWithLiveness.mockResolvedValueOnce([]);
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce({
      instance: {
        pid: 9999,
        port: 9222,
        host: '127.0.0.1',
        profilePath: '/tmp/profile',
        profileName: 'Default',
        type: 'chrome',
        launchedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      tabs: [
        { targetId: 'chatgpt-1', url: 'https://chatgpt.com/', title: 'ChatGPT', type: 'page' },
        { targetId: 'other', url: 'https://example.com', title: 'Other', type: 'page' },
      ],
    });
    const service = BrowserService.fromConfig(baseConfig);
    const target = await service.resolveServiceTarget({
      serviceId: 'chatgpt',
      configuredUrl: 'https://chatgpt.com/g/abc/project',
      ensurePort: true,
      logger: (message) => loggerMessages.push(message),
    });
    expect(target.tab?.targetId).toBe('chatgpt-1');
    expect(target.tabSelection?.score).toBe(3);
    expect(target.tabSelection?.candidates[0]).toMatchObject({
      selected: true,
      reasons: ['match-url'],
    });
    expect(loggerMessages[0]).toContain('[browser-service] Selected tab=chatgpt-1');
  });

  test('matches Gemini tabs by domain', async () => {
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce({
      instance: {
        pid: 9999,
        port: 9222,
        host: '127.0.0.1',
        profilePath: '/tmp/profile',
        profileName: 'Default',
        type: 'chrome',
        launchedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      tabs: [
        { targetId: 'gemini-1', url: 'https://gemini.google.com/app', title: 'Gemini', type: 'page' },
        { targetId: 'other', url: 'https://example.com', title: 'Other', type: 'page' },
      ],
    });
    const service = BrowserService.fromConfig(baseConfig);
    const target = await service.resolveServiceTarget({
      serviceId: 'gemini',
      configuredUrl: 'https://gemini.google.com/app',
      ensurePort: true,
    });
    expect(target.tab?.targetId).toBe('gemini-1');
    expect(target.tabSelection?.candidates[0]).toMatchObject({
      selected: true,
      reasons: ['match-url'],
    });
  });

  test('matches Grok tabs by domain', async () => {
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce({
      instance: {
        pid: 9999,
        port: 9222,
        host: '127.0.0.1',
        profilePath: '/tmp/profile',
        profileName: 'Default',
        type: 'chrome',
        launchedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      tabs: [
        { targetId: 'grok-1', url: 'https://grok.com/project', title: 'Grok', type: 'page' },
        { targetId: 'other', url: 'https://example.com', title: 'Other', type: 'page' },
      ],
    });
    const service = BrowserService.fromConfig(baseConfig);
    const target = await service.resolveServiceTarget({
      serviceId: 'grok',
      configuredUrl: 'https://grok.com/project',
      ensurePort: true,
    });
    expect(target.tab?.targetId).toBe('grok-1');
    expect(target.tabSelection?.candidates[0]).toMatchObject({
      selected: true,
      reasons: ['match-url'],
    });
  });

  test('prefers the exact configured Grok path over a project-detail tab on the same host', async () => {
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce({
      instance: {
        pid: 9999,
        port: 9222,
        host: '127.0.0.1',
        profilePath: '/tmp/profile',
        profileName: 'Default',
        type: 'chrome',
        launchedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      tabs: [
        { targetId: 'grok-project-detail', url: 'https://grok.com/project/abc123', title: 'Detail', type: 'page' },
        { targetId: 'grok-project-index', url: 'https://grok.com/project', title: 'Projects', type: 'page' },
      ],
    });
    const service = BrowserService.fromConfig(baseConfig);
    const target = await service.resolveServiceTarget({
      serviceId: 'grok',
      configuredUrl: 'https://grok.com/project',
      ensurePort: true,
    });
    expect(target.tab?.targetId).toBe('grok-project-index');
    expect(target.tabSelection?.candidates[0]).toMatchObject({
      selected: false,
      score: 0,
    });
    expect(target.tabSelection?.candidates[1]).toMatchObject({
      selected: true,
      score: 3,
      reasons: ['match-url'],
    });
  });

  test('normalizes legacy id-only tabs to targetId', async () => {
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce({
      instance: {
        pid: 9999,
        port: 9222,
        host: '127.0.0.1',
        profilePath: '/tmp/profile',
        profileName: 'Default',
        type: 'chrome',
        launchedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      tabs: [
        { id: 'legacy-grok-1', url: 'https://grok.com/', title: 'Grok', type: 'page' } as {
          id?: string;
          targetId?: string;
          url?: string;
          title?: string;
          type?: string;
        },
      ],
    });
    const service = BrowserService.fromConfig(baseConfig);
    const target = await service.resolveServiceTarget({
      serviceId: 'grok',
      configuredUrl: 'https://grok.com/',
      ensurePort: true,
    });
    expect(target.tab?.targetId).toBe('legacy-grok-1');
    expect(target.tabSelection?.candidates[0]).toMatchObject({
      selected: true,
      tab: { targetId: 'legacy-grok-1' },
    });
  });

  test('resolveServiceTarget uses the requested service launch profile when scanning fallback tabs', async () => {
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce({
      instance: {
        pid: 9999,
        port: 9222,
        host: '127.0.0.1',
        profilePath: '/tmp/managed-root/mixed/grok',
        profileName: 'Default',
        type: 'chrome',
        launchedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      tabs: [],
    });

    const service = BrowserService.fromConfig(
      {
        auracallProfile: 'mixed',
        browser: {
          target: 'chatgpt',
          managedProfileRoot: '/tmp/managed-root',
          chromeProfile: 'Default',
        },
      } as unknown as ResolvedUserConfig,
      'chatgpt',
    );

    await service.resolveServiceTarget({
      serviceId: 'grok',
      configuredUrl: 'https://grok.com/',
      ensurePort: true,
    });

    expect(instanceScannerMocks.scanRegisteredInstance).toHaveBeenLastCalledWith(
      { registryPath: expect.stringContaining('browser-state.json') },
      '/tmp/managed-root/mixed/grok',
      'Default',
      undefined,
      {},
    );
  });

  test('reports discarded stale registry candidates for the selected port and expected profile', async () => {
    loggerMessages.length = 0;
    stateRegistryMocks.listInstancesWithLiveness.mockResolvedValueOnce([
      {
        instance: {
          pid: 9999,
          port: 9222,
          host: '127.0.0.1',
          profilePath: '/tmp/profile',
          profileName: 'Default',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        alive: false,
        liveness: 'dead-port',
        actualPid: 9999,
      },
      {
        instance: {
          pid: 8888,
          port: 4555,
          host: '127.0.0.1',
          profilePath: '/tmp/profile',
          profileName: 'Default',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        alive: false,
        liveness: 'profile-mismatch',
        actualPid: 7777,
      },
    ] as any);
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce({
      instance: undefined,
      tabs: [],
    } as any);
    const service = BrowserService.fromConfig(baseConfig);
    const target = await service.resolveServiceTarget({
      serviceId: 'chatgpt',
      configuredUrl: 'https://chatgpt.com/',
      ensurePort: true,
      logger: (message) => loggerMessages.push(message),
    });
    expect(target.discardedRegistryCandidates).toEqual([
      expect.objectContaining({
        reason: 'expected-profile-stale',
        liveness: 'profile-mismatch',
        actualPid: 7777,
      }),
      expect.objectContaining({
        reason: 'selected-port-stale',
        liveness: 'dead-port',
        actualPid: 9999,
      }),
    ]);
    expect(loggerMessages.some((message) => message.includes('Discarded registry candidates:'))).toBe(true);
  });

  test('explicit constructor target overrides configured browser target for managed profile resolution', () => {
    const service = BrowserService.fromConfig(
      {
        auracallProfile: 'mixed',
        browser: {
          target: 'chatgpt',
          managedProfileRoot: '/tmp/managed-root',
          chromeProfile: 'Default',
        },
      } as unknown as ResolvedUserConfig,
      'grok',
    );

    expect(service.getConfig().target).toBe('grok');
    expect(service.getConfig().manualLoginProfileDir).toBe('/tmp/managed-root/default/grok');
  });
});
