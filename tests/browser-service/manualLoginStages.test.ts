import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ResolvedBrowserConfig } from '../../packages/browser-service/src/types.js';
import { DEFAULT_BROWSER_CONFIG } from '../../src/browser/config.js';

const launchMocks = vi.hoisted(() => ({
  launchChrome: vi.fn(),
  openOrReuseChromeTarget: vi.fn(async () => undefined),
  isDevToolsResponsive: vi.fn(async () => true),
  writeChromePid: vi.fn(async () => undefined),
  writeDevToolsActivePort: vi.fn(async () => undefined),
}));

vi.mock('../../packages/browser-service/src/chromeLifecycle.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../packages/browser-service/src/chromeLifecycle.js')
  >();
  return {
    ...actual,
    launchChrome: launchMocks.launchChrome,
    openOrReuseChromeTarget: launchMocks.openOrReuseChromeTarget,
  };
});

vi.mock('../../packages/browser-service/src/processCheck.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../packages/browser-service/src/processCheck.js')
  >();
  return {
    ...actual,
    isDevToolsResponsive: launchMocks.isDevToolsResponsive,
  };
});

vi.mock('../../packages/browser-service/src/profileState.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../packages/browser-service/src/profileState.js')
  >();
  return {
    ...actual,
    writeChromePid: launchMocks.writeChromePid,
    writeDevToolsActivePort: launchMocks.writeDevToolsActivePort,
  };
});

import { launchManualLoginSession } from '../../packages/browser-service/src/manualLogin.js';

describe('manual login preflight stages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('reports debug-port resolution and Chrome launch before awaiting the launcher', async () => {
    const stages: string[] = [];
    launchMocks.launchChrome.mockImplementationOnce(async (
      _config: unknown,
      _userDataDir: unknown,
      _logger: unknown,
      options: { onStage?: (stage: string) => void },
    ) => {
      options.onStage?.('browserChromeRegistryLookup');
      options.onStage?.('browserChromeProcessInspection');
      options.onStage?.('browserChromeProfileCleanup');
      options.onStage?.('browserChromePortProbe');
      options.onStage?.('browserChromeProcessSpawn');
      options.onStage?.('browserChromeDebuggerReadiness');
      throw new Error('stop after stage capture');
    });

    await expect(
      launchManualLoginSession({
        chromePath: '/opt/google/chrome/chrome',
        profileName: 'Default',
        userDataDir: '/tmp/auracall/wsl-chrome-3/chatgpt',
        url: 'https://chatgpt.com/',
        logger: () => undefined,
        baseConfig: DEFAULT_BROWSER_CONFIG as ResolvedBrowserConfig,
        debugPortStrategy: 'auto',
        onStage: (stage) => stages.push(stage),
      }),
    ).rejects.toThrow('stop after stage capture');

    expect(stages).toEqual([
      'browserDebugPortResolution',
      'browserChromeLaunch',
      'browserChromeRegistryLookup',
      'browserChromeProcessInspection',
      'browserChromeProfileCleanup',
      'browserChromePortProbe',
      'browserChromeProcessSpawn',
      'browserChromeDebuggerReadiness',
    ]);
  });

  test('returns endpoint-only blank startup without touching a hung restored tab', async () => {
    launchMocks.launchChrome.mockResolvedValueOnce({
      host: '127.0.0.1', port: 45015, pid: 1234,
      kill: vi.fn(async () => undefined),
    });
    launchMocks.openOrReuseChromeTarget.mockImplementationOnce(() => new Promise<never>(() => {}));
    const result = await Promise.race([
      launchManualLoginSession({
        chromePath: '/opt/google/chrome/chrome', profileName: 'Default',
        userDataDir: '/tmp/auracall/wsl-chrome-3/chatgpt', url: 'about:blank',
        logger: () => undefined, baseConfig: DEFAULT_BROWSER_CONFIG as ResolvedBrowserConfig,
        debugPortStrategy: 'auto',
      }),
      new Promise<'startup-stalled'>((resolve) => setTimeout(() => resolve('startup-stalled'), 100)),
    ]);
    const openedTab = launchMocks.openOrReuseChromeTarget.mock.calls.length;
    launchMocks.openOrReuseChromeTarget.mockReset().mockResolvedValue(undefined);
    expect(result).toMatchObject({ port: 45015, chrome: { pid: 1234 } });
    expect(openedTab).toBe(0);
    expect(launchMocks.launchChrome.mock.calls[0]?.[3]).toMatchObject({ suppressStartupWindow: true });
  });

  test('reports DevTools readiness and login-tab opening after a successful launch', async () => {
    const stages: string[] = [];
    launchMocks.launchChrome.mockResolvedValueOnce({
      host: '127.0.0.1',
      port: 45015,
      pid: 1234,
      kill: vi.fn(async () => undefined),
    });

    await launchManualLoginSession({
      chromePath: '/opt/google/chrome/chrome',
      profileName: 'Default',
      userDataDir: '/tmp/auracall/wsl-chrome-3/chatgpt',
      url: 'https://chatgpt.com/',
      logger: () => undefined,
      baseConfig: DEFAULT_BROWSER_CONFIG as ResolvedBrowserConfig,
      debugPortStrategy: 'auto',
      onStage: (stage) => stages.push(stage),
    });

    expect(stages).toEqual([
      'browserDebugPortResolution',
      'browserChromeLaunch',
      'browserDevToolsReadiness',
      'browserLoginTabOpening',
    ]);
    expect(launchMocks.openOrReuseChromeTarget).toHaveBeenCalledWith(
      45015,
      'https://chatgpt.com/',
      expect.objectContaining({ host: '127.0.0.1' }),
    );
  });
});
