import { describe, expect, test, vi } from 'vitest';
import type { ResolvedUserConfig } from '../../src/config.js';
import { BrowserService } from '../../src/browser/service/browserService.js';
import type {
  BrowserInstance,
  ClassifiedBrowserInstance,
} from '../../packages/browser-service/src/service/stateRegistry.js';
import type { InstanceScanResult } from '../../packages/browser-service/src/service/instanceScanner.js';

function browserInstance(overrides: Partial<BrowserInstance> = {}): BrowserInstance {
  return {
    pid: 9999,
    port: 9222,
    host: '127.0.0.1',
    profilePath: '/tmp/profile',
    profileName: 'Default',
    type: 'chrome',
    launchedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  };
}

function classifiedInstances(instances: ClassifiedBrowserInstance[]): ClassifiedBrowserInstance[] {
  return instances;
}

const sessionMocks = vi.hoisted(() => ({
  resolveBrowserListTarget: vi.fn<() => Promise<{ host?: string; port?: number } | undefined>>(
    async () => ({ host: '127.0.0.1', port: 9222 }),
  ),
  pruneRegistry: vi.fn(async () => {}),
}));

vi.mock('../../src/browser/service/session.js', () => ({
  resolveBrowserListTarget: sessionMocks.resolveBrowserListTarget,
  pruneRegistry: sessionMocks.pruneRegistry,
}));

const instanceScannerMocks = vi.hoisted(() => ({
  scanRegisteredInstance: vi.fn<() => Promise<InstanceScanResult | null>>(async () => ({
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
  listInstances: vi.fn<() => Promise<BrowserInstance[]>>(async () => []),
  listInstancesWithLiveness: vi.fn<() => Promise<ClassifiedBrowserInstance[]>>(async () => []),
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

const manualLoginMocks = vi.hoisted(() => ({
  launchManualLoginSession: vi.fn(async () => ({
    chrome: { port: 9222, host: '127.0.0.1' },
    port: 9222,
  })),
}));

vi.mock('../../src/browser/manualLogin.js', () => ({
  launchManualLoginSession: manualLoginMocks.launchManualLoginSession,
}));

describe('BrowserService resolveServiceTarget', () => {
  const baseConfig = {
    auracallProfile: 'browser-service-test',
    browser: {
      manualLoginProfileDir: '/tmp/profile',
      chromeProfile: 'Default',
    },
  } as unknown as ResolvedUserConfig;

  test('keeps a bounded service-scoped browser mutation history', async () => {
    const service = BrowserService.fromConfig(baseConfig, 'gemini');
    await service.getMutationAuditSink()({
      id: 'mutation-1',
      phase: 'start',
      kind: 'navigate',
      source: 'test:navigate',
      at: '2026-04-23T17:00:00.000Z',
      requestedUrl: 'https://gemini.google.com/app',
      fromUrl: 'about:blank',
      toUrl: null,
      targetId: 'gemini-tab',
      reason: null,
    });

    const sameService = BrowserService.fromConfig(baseConfig, 'gemini');
    expect(sameService.listRecentBrowserMutations()).toEqual([
      expect.objectContaining({
        id: 'mutation-1',
        kind: 'navigate',
        source: 'test:navigate',
        targetId: 'gemini-tab',
      }),
    ]);

    const otherService = BrowserService.fromConfig(baseConfig, 'grok');
    expect(otherService.listRecentBrowserMutations()).toEqual([]);
  });

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

  test('stamps browser process owner attribution after resolving a managed target', async () => {
    stateRegistryMocks.updateInstance.mockClear();
    stateRegistryMocks.listInstancesWithLiveness.mockReset();
    stateRegistryMocks.listInstancesWithLiveness.mockImplementation(async () => []);
    stateRegistryMocks.listInstancesWithLiveness.mockResolvedValueOnce(classifiedInstances([
      {
        instance: browserInstance({
          profilePath: '/tmp/profile',
          profileName: 'Default',
        }),
        alive: true,
        liveness: 'live',
        actualPid: 9999,
      },
    ]));
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce({
      instance: browserInstance({
        profilePath: '/tmp/profile',
        profileName: 'Default',
      }),
      tabs: [{ targetId: 'chatgpt-1', url: 'https://chatgpt.com/', title: 'ChatGPT', type: 'page' }],
    });
    const service = BrowserService.fromConfig(baseConfig, 'chatgpt', {
      browserProcessOwner: {
        owner: {
          kind: 'history_materialization_job',
          id: 'hmj_owner_test',
          provider: 'chatgpt',
          runtimeProfileId: 'wsl-chrome-3',
          browserProfileId: 'wsl-chrome-3',
          sourceType: 'account_library_reconciliation',
          sourceKey: 'source-key',
          reason: 'account-library-file-materialization',
          acquiredAt: '2026-06-05T02:00:00.000Z',
          heartbeatAt: '2026-06-05T02:00:00.000Z',
        },
        operation: {
          kind: 'history_materialization_job',
          id: 'hmj_owner_test',
          provider: 'chatgpt',
          runtimeProfileId: 'wsl-chrome-3',
          browserProfileId: 'wsl-chrome-3',
          sourceType: 'account_library_reconciliation',
          sourceKey: 'source-key',
          reason: 'account-library-file-materialization',
        },
        lease: {
          id: 'history_materialization_job:hmj_owner_test:chatgpt:wsl-chrome-3',
          ownerId: 'hmj_owner_test',
          acquiredAt: '2026-06-05T02:00:00.000Z',
          heartbeatAt: '2026-06-05T02:00:00.000Z',
          expiresAt: null,
          cleanupPolicy: 'history-materialization-provider-work',
        },
      },
    });

    await service.resolveServiceTarget({
      serviceId: 'chatgpt',
      configuredUrl: 'https://chatgpt.com/',
      ensurePort: true,
    });

    expect(stateRegistryMocks.updateInstance).toHaveBeenCalledWith(
      expect.objectContaining({ registryPath: expect.stringContaining('browser-state.json') }),
      '/tmp/profile',
      'Default',
      expect.objectContaining({
        owner: expect.objectContaining({
          id: 'hmj_owner_test',
          heartbeatAt: expect.any(String),
        }),
        operation: expect.objectContaining({
          sourceType: 'account_library_reconciliation',
        }),
        lease: expect.objectContaining({
          ownerId: 'hmj_owner_test',
          heartbeatAt: expect.any(String),
        }),
        services: ['chatgpt'],
      }),
    );
    stateRegistryMocks.listInstancesWithLiveness.mockReset();
    stateRegistryMocks.listInstancesWithLiveness.mockImplementation(async () => []);
  });

  test('passes resolved browser-family display to managed browser launch', async () => {
    sessionMocks.resolveBrowserListTarget.mockResolvedValueOnce(undefined);
    manualLoginMocks.launchManualLoginSession.mockClear();
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce({
      instance: {
        pid: 9999,
        port: 9222,
        host: '127.0.0.1',
        profilePath: '/tmp/gemini-profile',
        profileName: 'Default',
        type: 'chrome',
        launchedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      tabs: [
        { targetId: 'gemini-app', url: 'https://gemini.google.com/app', title: 'Gemini', type: 'page' },
      ],
    });

    const service = BrowserService.fromConfig(
      {
        auracallProfile: 'auracall-gemini-pro',
        browser: {
          target: 'gemini',
          chromePath: '/tmp/chromium-stealthcdp/chrome',
          display: ':10',
          manualLoginProfileDir: '/tmp/gemini-profile',
          chromeProfile: 'Default',
          debugPort: 45019,
        },
      } as unknown as ResolvedUserConfig,
      'gemini',
    );
    const target = await service.resolveServiceTarget({
      serviceId: 'gemini',
      configuredUrl: 'https://gemini.google.com/app',
      ensurePort: true,
    });

    expect(target.port).toBe(9222);
    expect(manualLoginMocks.launchManualLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({
        chromePath: '/tmp/chromium-stealthcdp/chrome',
        display: ':10',
        userDataDir: '/tmp/gemini-profile',
      }),
    );
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

  test('matches Gemini conversation tabs for the configured root app surface', async () => {
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
        {
          targetId: 'gemini-conversation',
          url: 'https://gemini.google.com/app/1ab8bb794846c491',
          title: 'Gemini conversation',
          type: 'page',
        },
        { targetId: 'other', url: 'https://example.com', title: 'Other', type: 'page' },
      ],
    });
    const service = BrowserService.fromConfig(baseConfig);
    const target = await service.resolveServiceTarget({
      serviceId: 'gemini',
      configuredUrl: 'https://gemini.google.com/app',
      ensurePort: true,
    });
    expect(target.tab?.targetId).toBe('gemini-conversation');
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

  test('does not scan a selected DevTools port from a different managed browser profile', async () => {
    loggerMessages.length = 0;
    stateRegistryMocks.listInstancesWithLiveness.mockResolvedValueOnce(classifiedInstances([
      {
        instance: {
          pid: 1111,
          port: 9222,
          host: '127.0.0.1',
          profilePath: '/tmp/managed-root/mixed/gemini',
          profileName: 'Default',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        alive: true,
        liveness: 'live',
        actualPid: null,
      },
      {
        instance: {
          pid: 2222,
          port: 9333,
          host: '127.0.0.1',
          profilePath: '/tmp/managed-root/mixed/grok',
          profileName: 'Default',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        alive: true,
        liveness: 'live',
        actualPid: null,
      },
    ]));
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce({
      instance: {
        pid: 2222,
        port: 9333,
        host: '127.0.0.1',
        profilePath: '/tmp/managed-root/mixed/grok',
        profileName: 'Default',
        type: 'chrome',
        launchedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      tabs: [
        { targetId: 'grok-expected', url: 'https://grok.com/', title: 'Grok', type: 'page' },
      ],
    });

    const service = BrowserService.fromConfig(
      {
        auracallProfile: 'mixed',
        browser: {
          target: 'grok',
          managedProfileRoot: '/tmp/managed-root',
          chromeProfile: 'Default',
        },
      } as unknown as ResolvedUserConfig,
      'grok',
    );

    const target = await service.resolveServiceTarget({
      serviceId: 'grok',
      configuredUrl: 'https://grok.com/',
      ensurePort: true,
      logger: (message) => loggerMessages.push(message),
    });

    expect(target.port).toBe(9333);
    expect(target.tab?.targetId).toBe('grok-expected');
    expect(instanceScannerMocks.scanRegisteredInstance).toHaveBeenLastCalledWith(
      { registryPath: expect.stringContaining('browser-state.json') },
      '/tmp/managed-root/mixed/grok',
      'Default',
      expect.any(Function),
      {},
    );
    expect(loggerMessages.some((message) => message.includes('Ignoring selected DevTools port 9222'))).toBe(true);
  });

  test('fails closed when a selected DevTools port belongs to another managed browser profile', async () => {
    stateRegistryMocks.listInstancesWithLiveness.mockResolvedValueOnce(classifiedInstances([
      {
        instance: {
          pid: 1111,
          port: 9222,
          host: '127.0.0.1',
          profilePath: '/tmp/managed-root/mixed/gemini',
          profileName: 'Default',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        alive: true,
        liveness: 'live',
        actualPid: null,
      },
    ]));

    const service = BrowserService.fromConfig(
      {
        auracallProfile: 'mixed',
        browser: {
          target: 'grok',
          managedProfileRoot: '/tmp/managed-root',
          chromeProfile: 'Default',
        },
      } as unknown as ResolvedUserConfig,
      'grok',
    );

    const scanCountBefore = instanceScannerMocks.scanRegisteredInstance.mock.calls.length;
    await expect(service.resolveServiceTarget({
      serviceId: 'grok',
      configuredUrl: 'https://grok.com/',
      ensurePort: true,
    })).rejects.toThrow('Refusing to use a cross-profile browser target');
    expect(instanceScannerMocks.scanRegisteredInstance).toHaveBeenCalledTimes(scanCountBefore);
  });

  test('reports discarded stale registry candidates for the selected port and expected profile', async () => {
    loggerMessages.length = 0;
    stateRegistryMocks.listInstancesWithLiveness.mockResolvedValueOnce(classifiedInstances([
      {
        instance: browserInstance(),
        alive: false,
        liveness: 'dead-port',
        actualPid: 9999,
      },
      {
        instance: browserInstance({
          pid: 8888,
          port: 4555,
        }),
        alive: false,
        liveness: 'profile-mismatch',
        actualPid: 7777,
      },
    ]));
    instanceScannerMocks.scanRegisteredInstance.mockResolvedValueOnce(null);
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
    expect(service.getConfig().manualLoginProfileDir).toBe('/tmp/managed-root/mixed/grok');
  });
});
