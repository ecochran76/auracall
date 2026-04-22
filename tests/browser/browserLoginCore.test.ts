import { describe, expect, it, vi, afterEach } from 'vitest';
import { runBrowserLogin } from '../../packages/browser-service/src/login.js';
import { createBrowserOperationDispatcher } from '../../packages/browser-service/src/service/operationDispatcher.js';

describe('browser-service runBrowserLogin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers and prints the actual launched debug endpoint', async () => {
    const onRegisterInstance = vi.fn(async () => undefined);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runBrowserLogin({
      chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      chromeProfile: 'Default',
      manualLoginProfileDir: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
      loginUrl: 'https://grok.com/',
      loginLabel: 'grok',
      preferCookieProfile: false,
      onRegisterInstance,
      launchManualLoginSession: async () => ({
        chrome: {
          pid: 1234,
          host: 'windows-loopback',
          port: 45920,
          process: { unref: () => undefined },
        },
      }),
    });

    expect(onRegisterInstance).toHaveBeenCalledWith({
      userDataDir: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
      profileName: 'Default',
      port: 45920,
      host: 'windows-loopback',
      pid: 1234,
    });
    expect(consoleSpy).toHaveBeenCalledWith('Debug endpoint: windows-loopback:45920');
  });

  it('passes display through to the manual login launcher', async () => {
    const launchManualLoginSession = vi.fn(async () => ({
      chrome: {
        pid: 4321,
        host: '127.0.0.1',
        port: 45000,
        process: { unref: () => undefined },
      },
    }));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runBrowserLogin({
      chromePath: '/usr/bin/google-chrome',
      chromeProfile: 'Profile 1',
      manualLoginProfileDir: '/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
      display: ':0.0',
      loginUrl: 'https://chatgpt.com/',
      loginLabel: 'chatgpt',
      preferCookieProfile: false,
      launchManualLoginSession,
    });

    expect(launchManualLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({
        display: ':0.0',
      }),
    );
  });

  it('blocks login launch when the managed browser profile already has an active operation', async () => {
    const dispatcher = createBrowserOperationDispatcher({
      isOwnerAlive: () => true,
    });
    const active = await dispatcher.acquire({
      managedProfileDir: '/home/test/.auracall/browser-profiles/default/grok',
      serviceTarget: 'grok',
      kind: 'doctor',
      operationClass: 'exclusive-probe',
      ownerPid: 123,
    });
    const launchManualLoginSession = vi.fn(async () => ({
      chrome: {
        pid: 4321,
        host: '127.0.0.1',
        port: 45000,
        process: { unref: () => undefined },
      },
    }));

    try {
      await expect(
        runBrowserLogin({
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Default',
          manualLoginProfileDir: '/home/test/.auracall/browser-profiles/default/grok',
          loginUrl: 'https://grok.com/',
          loginLabel: 'grok',
          preferCookieProfile: false,
          operationDispatcher: dispatcher,
          launchManualLoginSession,
        }),
      ).rejects.toThrow(/Browser operation busy/);
      expect(launchManualLoginSession).not.toHaveBeenCalled();
    } finally {
      if (active.acquired) {
        await active.release();
      }
    }
  });
});
