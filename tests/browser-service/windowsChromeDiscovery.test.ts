import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readDevToolsPort: vi.fn(),
  writeDevToolsActivePort: vi.fn(),
  readChromePid: vi.fn(),
  cleanupStaleProfileState: vi.fn(),
  findChromePidUsingUserDataDir: vi.fn(),
  findChromeProcessUsingUserDataDir: vi.fn(),
  findResponsiveWindowsDevToolsPortForUserDataDir: vi.fn(),
  isDevToolsResponsive: vi.fn(),
  probeWindowsLocalDevToolsPort: vi.fn(),
}));

vi.mock('../../packages/browser-service/src/profileState.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/profileState.js')>();
  return {
    ...actual,
    readDevToolsPort: mocks.readDevToolsPort,
    writeDevToolsActivePort: mocks.writeDevToolsActivePort,
    readChromePid: mocks.readChromePid,
    cleanupStaleProfileState: mocks.cleanupStaleProfileState,
  };
});

vi.mock('../../packages/browser-service/src/processCheck.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/processCheck.js')>();
  return {
    ...actual,
    findChromePidUsingUserDataDir: mocks.findChromePidUsingUserDataDir,
    findChromeProcessUsingUserDataDir: mocks.findChromeProcessUsingUserDataDir,
    findResponsiveWindowsDevToolsPortForUserDataDir: mocks.findResponsiveWindowsDevToolsPortForUserDataDir,
    isDevToolsResponsive: mocks.isDevToolsResponsive,
    probeWindowsLocalDevToolsPort: mocks.probeWindowsLocalDevToolsPort,
  };
});

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe('discoverWindowsChromeDevToolsPort', () => {
  test('discovers an auto-assigned Windows DevTools port from DevToolsActivePort when the requested port is zero', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    mocks.readDevToolsPort.mockResolvedValue(65184);
    mocks.findChromeProcessUsingUserDataDir.mockResolvedValue({
      pid: 333,
      port: 0,
      commandLine: 'chrome --remote-debugging-port=0 --user-data-dir=C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\default\\grok',
    });
    mocks.probeWindowsLocalDevToolsPort.mockResolvedValue(true);

    const { discoverWindowsChromeDevToolsPort } = await import('../../packages/browser-service/src/chromeLifecycle.js');
    const userDataDir = '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok';
    await expect(
      discoverWindowsChromeDevToolsPort({ userDataDir, requestedPort: 0, pid: 333 }),
    ).resolves.toBe(65184);
    expect(mocks.writeDevToolsActivePort).not.toHaveBeenCalled();
    expect(mocks.findResponsiveWindowsDevToolsPortForUserDataDir).not.toHaveBeenCalled();
  });

  test('prefers a discovered responsive Windows port over the advertised command-line port', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    mocks.readDevToolsPort.mockResolvedValueOnce(null).mockResolvedValue(45921);
    mocks.findChromeProcessUsingUserDataDir.mockResolvedValue({
      pid: 222,
      port: 45894,
      commandLine: 'chrome --remote-debugging-port=45894 --user-data-dir=C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\default\\grok',
    });
    mocks.probeWindowsLocalDevToolsPort.mockImplementation(async (port: number) => port === 45921);

    const { discoverWindowsChromeDevToolsPort } = await import('../../packages/browser-service/src/chromeLifecycle.js');
    const userDataDir = '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok';
    await expect(
      discoverWindowsChromeDevToolsPort({ userDataDir, requestedPort: 45894, pid: 222 }),
    ).resolves.toBe(45921);
    expect(mocks.writeDevToolsActivePort).not.toHaveBeenCalled();
    expect(mocks.findResponsiveWindowsDevToolsPortForUserDataDir).not.toHaveBeenCalled();
  });

  test('returns the recorded DevTools port when it is still responsive', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    mocks.readDevToolsPort.mockResolvedValue(45894);
    mocks.findChromeProcessUsingUserDataDir.mockResolvedValue(null);
    mocks.probeWindowsLocalDevToolsPort.mockResolvedValue(true);

    const { discoverWindowsChromeDevToolsPort } = await import('../../packages/browser-service/src/chromeLifecycle.js');
    await expect(
      discoverWindowsChromeDevToolsPort({
        userDataDir: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
        requestedPort: 45894,
      }),
    ).resolves.toBe(45894);
    expect(mocks.findResponsiveWindowsDevToolsPortForUserDataDir).not.toHaveBeenCalled();
  });
});
