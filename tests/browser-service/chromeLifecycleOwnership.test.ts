import { afterEach, describe, expect, test, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

function createExecFileMock() {
  return vi.fn((_file: string, _args: string[], options: unknown, callback?: (...cbArgs: unknown[]) => void) => {
    const cb = typeof options === 'function' ? options : callback;
    cb?.(null, { stdout: '', stderr: '' });
    return {} as never;
  });
}

async function importChromeLifecycleWithMocks(options: {
  registeredPid?: number | null;
  existingProcess?: { pid: number; port: number; commandLine: string } | null;
}) {
  const execFileMock = createExecFileMock();
  const unregisterInstance = vi.fn(async () => {});
  const registerInstance = vi.fn(async () => {});
  const findActiveInstance = vi.fn(async () => {
    if (!options.registeredPid) {
      return null;
    }
    return {
      pid: options.registeredPid,
      port: 45891,
      host: '127.0.0.1',
      profilePath: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
      profileName: 'Default',
      type: 'chrome' as const,
      launchedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
  });
  const findChromeProcessUsingUserDataDir = vi.fn(async () => options.existingProcess ?? null);
  const isDevToolsResponsive = vi.fn(async () => true);
  const ensureDetachedWindowsLoopbackRelay = vi.fn(async (_port: number, _logger: unknown, relayOptions?: { listenPort?: number }) => ({
    host: '127.0.0.1',
    port: relayOptions?.listenPort ?? 45891,
  }));

  vi.doMock('node:child_process', () => ({
    execFile: execFileMock,
  }));
  vi.doMock('../../packages/browser-service/src/service/stateRegistry.js', () => ({
    findActiveInstance,
    registerInstance,
    unregisterInstance,
  }));
  vi.doMock('../../packages/browser-service/src/processCheck.js', () => ({
    isDevToolsResponsive,
    findChromePidUsingUserDataDir: vi.fn(async () => options.existingProcess?.pid ?? null),
    findChromeProcessUsingUserDataDir,
    findResponsiveWindowsDevToolsPortForUserDataDir: vi.fn(async () => options.existingProcess?.port ?? null),
    isChromeAlive: vi.fn(async () => true),
    probeWindowsLocalDevToolsPort: vi.fn(async () => true),
    isProcessAlive: vi.fn(() => false),
  }));
  vi.doMock('../../packages/browser-service/src/windowsLoopbackRelay.js', () => ({
    ensureDetachedWindowsLoopbackRelay,
    isWindowsLoopbackRemoteHost: vi.fn((host: string) => host === 'windows-loopback'),
    resolveChromeEndpoint: vi.fn(async (host: string, port: number) => ({ host, port })),
    resolveWindowsPowerShellPath: vi.fn(() => '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'),
    WINDOWS_LOOPBACK_REMOTE_HOST: 'windows-loopback',
  }));

  const chromeLifecycle = await import('../../packages/browser-service/src/chromeLifecycle.js');
  return {
    chromeLifecycle,
    execFileMock,
    unregisterInstance,
    registerInstance,
    findActiveInstance,
    findChromeProcessUsingUserDataDir,
    isDevToolsResponsive,
    ensureDetachedWindowsLoopbackRelay,
  };
}

describe('chromeLifecycle ownership', () => {
  test('keeps shutdown ownership when reusing a registry instance started by the current run', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    const { chromeLifecycle, execFileMock, unregisterInstance } = await importChromeLifecycleWithMocks({
      registeredPid: 41234,
    });

    const chrome = await chromeLifecycle.launchChrome(
      {
        chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
        chromeProfile: 'Default',
      } as never,
      '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
      () => undefined,
      {
        registryPath: '/tmp/auracall-browser-state.json',
        ownedPids: new Set([41234]),
      },
    );

    expect(chrome.pid).toBe(41234);
    await chrome.kill();
    expect(unregisterInstance).toHaveBeenCalledWith(
      { registryPath: '/tmp/auracall-browser-state.json' },
      '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
      'Default',
    );
    expect(execFileMock).toHaveBeenCalledWith(
      '/mnt/c/Windows/System32/taskkill.exe',
      ['/PID', '41234', '/T', '/F'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  test('keeps shutdown ownership when re-adopting a live process started by the current run', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    const messages: string[] = [];
    const userDataDir = '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/test/ownership-grok';
    const { chromeLifecycle, execFileMock, registerInstance } = await importChromeLifecycleWithMocks({
      registeredPid: null,
      existingProcess: {
        pid: 42345,
        port: 45891,
        commandLine:
          '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ' +
          '--remote-debugging-port=45891 ' +
          '--user-data-dir=C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\test\\ownership-grok about:blank',
      },
    });

    const chrome = await chromeLifecycle.launchChrome(
      {
        chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
        chromeProfile: 'Default',
      } as never,
      userDataDir,
      (message) => messages.push(message),
      {
        registryPath: '/tmp/auracall-browser-state.json',
        ownedPids: new Set([99999]),
        ownedPorts: new Set([45891]),
      },
    );

    expect(chrome.pid, messages.join('\n')).toBe(42345);
    expect(registerInstance).toHaveBeenCalled();
    await chrome.kill();
    expect(execFileMock).toHaveBeenCalledWith(
      '/mnt/c/Windows/System32/taskkill.exe',
      ['/PID', '42345', '/T', '/F'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  test('still skips shutdown for genuinely reused registry instances', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    const messages: string[] = [];
    const { chromeLifecycle, execFileMock } = await importChromeLifecycleWithMocks({
      registeredPid: 43456,
    });

    const chrome = await chromeLifecycle.launchChrome(
      {
        chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
        chromeProfile: 'Default',
      } as never,
      '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
      (message) => messages.push(message),
      {
        registryPath: '/tmp/auracall-browser-state.json',
        ownedPids: new Set(),
      },
    );

    expect(chrome.pid).toBeUndefined();
    await chrome.kill();
    expect(messages).toContain('Skipping shutdown of reused Chrome instance.');
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
