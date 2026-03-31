import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CHATGPT_URL } from '../../src/browser/constants.js';

const profileMocks = vi.hoisted(() => ({
  discoverDefaultBrowserProfile: vi.fn(),
}));

vi.mock('../../src/browser/service/profile.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/browser/service/profile.js')>();
  return {
    ...actual,
    discoverDefaultBrowserProfile: profileMocks.discoverDefaultBrowserProfile,
  };
});

import { resolveBrowserConfig } from '../../src/browser/config.js';

describe('resolveBrowserConfig', () => {
  beforeEach(() => {
    profileMocks.discoverDefaultBrowserProfile.mockReset();
    profileMocks.discoverDefaultBrowserProfile.mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('returns defaults when config missing', () => {
    const resolved = resolveBrowserConfig(undefined);
    expect(resolved.url).toBe(CHATGPT_URL);
    expect(resolved.desiredModel).toBe('Instant');
    const isWindows = process.platform === 'win32';
    expect(resolved.cookieSync).toBe(!isWindows);
    expect(resolved.headless).toBe(false);
    expect(resolved.manualLogin).toBe(true);
    expect(resolved.manualLoginProfileDir).toMatch(/browser-profiles\/default\/chatgpt$/);
    expect(resolved.serviceTabLimit).toBe(3);
    expect(resolved.blankTabLimit).toBe(1);
    expect(resolved.collapseDisposableWindows).toBe(true);
  });

  test('applies overrides', () => {
    const resolved = resolveBrowserConfig({
      url: 'https://example.com',
      timeoutMs: 123,
      inputTimeoutMs: 456,
      cookieSync: false,
      headless: true,
      desiredModel: 'Custom',
      composerTool: 'canvas',
      chromeProfile: 'Profile 1',
      chromePath: '/Applications/Chrome',
      debug: true,
      serviceTabLimit: 5,
      blankTabLimit: 0,
      collapseDisposableWindows: false,
    });
    expect(resolved.url).toBe('https://example.com/');
    expect(resolved.timeoutMs).toBe(123);
    expect(resolved.inputTimeoutMs).toBe(456);
    expect(resolved.cookieSync).toBe(false);
    expect(resolved.headless).toBe(true);
    expect(resolved.desiredModel).toBe('Custom');
    expect(resolved.composerTool).toBe('canvas');
    expect(resolved.chromeProfile).toBe('Profile 1');
    expect(resolved.chromePath).toBe('/Applications/Chrome');
    expect(resolved.debug).toBe(true);
    expect(resolved.serviceTabLimit).toBe(5);
    expect(resolved.blankTabLimit).toBe(0);
    expect(resolved.collapseDisposableWindows).toBe(false);
  });

  test('prefers WSL-discovered Chrome paths when WSL Chrome is requested', () => {
    vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu');
    profileMocks.discoverDefaultBrowserProfile.mockReturnValue({
      userDataDir: '/home/ecochran76/.config/google-chrome',
      profileName: 'Default',
      cookiePath: '/home/ecochran76/.config/google-chrome/Default/Network/Cookies',
      chromePath: '/usr/bin/google-chrome',
      source: 'wsl',
    });

    const resolved = resolveBrowserConfig({
      wslChromePreference: 'wsl',
      chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      chromeCookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
    });

    expect(resolved.chromePath).toBe('/usr/bin/google-chrome');
    expect(resolved.chromeCookiePath).toBe(
      '/home/ecochran76/.config/google-chrome/Default/Network/Cookies',
    );
    expect(resolved.display).toBe(':0.0');
  });

  test('defaults WSL Linux Chrome display to :0.0 when not explicitly configured', () => {
    vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu');
    profileMocks.discoverDefaultBrowserProfile.mockReturnValue({
      userDataDir: '/home/ecochran76/.config/google-chrome',
      profileName: 'Default',
      cookiePath: '/home/ecochran76/.config/google-chrome/Default/Network/Cookies',
      chromePath: '/usr/bin/google-chrome',
      source: 'wsl',
    });

    const resolved = resolveBrowserConfig({
      wslChromePreference: 'wsl',
    });

    expect(resolved.chromePath).toBe('/usr/bin/google-chrome');
    expect(resolved.display).toBe(':0.0');
  });

  test('keeps an explicit display override for WSL Linux Chrome', () => {
    vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu');
    profileMocks.discoverDefaultBrowserProfile.mockReturnValue({
      userDataDir: '/home/ecochran76/.config/google-chrome',
      profileName: 'Default',
      cookiePath: '/home/ecochran76/.config/google-chrome/Default/Network/Cookies',
      chromePath: '/usr/bin/google-chrome',
      source: 'wsl',
    });

    const resolved = resolveBrowserConfig({
      wslChromePreference: 'wsl',
      display: ':1',
    });

    expect(resolved.display).toBe(':1');
  });

  test('keeps an explicit bootstrap cookie path even when WSL runtime Chrome is preferred', () => {
    vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu');
    profileMocks.discoverDefaultBrowserProfile.mockReturnValue({
      userDataDir: '/home/ecochran76/.config/google-chrome',
      profileName: 'Default',
      cookiePath: '/home/ecochran76/.config/google-chrome/Default/Network/Cookies',
      chromePath: '/usr/bin/google-chrome',
      source: 'wsl',
    });

    const resolved = resolveBrowserConfig({
      wslChromePreference: 'wsl',
      chromeCookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
      bootstrapCookiePath:
        '/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies',
    });

    expect(resolved.chromeCookiePath).toBe(
      '/home/ecochran76/.config/google-chrome/Default/Network/Cookies',
    );
    expect(resolved.bootstrapCookiePath).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies',
    );
  });

  test('lets AURACALL_WSL_CHROME override config preference', () => {
    vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu');
    vi.stubEnv('AURACALL_WSL_CHROME', 'wsl');
    profileMocks.discoverDefaultBrowserProfile.mockReturnValue({
      userDataDir: '/home/ecochran76/.config/google-chrome',
      profileName: 'Default',
      cookiePath: '/home/ecochran76/.config/google-chrome/Default/Network/Cookies',
      chromePath: '/usr/bin/google-chrome',
      source: 'wsl',
    });

    const resolved = resolveBrowserConfig({
      wslChromePreference: 'windows',
      chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    });

    expect(resolved.wslChromePreference).toBe('wsl');
    expect(resolved.chromePath).toBe('/usr/bin/google-chrome');
  });

  test('lets AURACALL_BROWSER_PROFILE_DIR override config manual-login profile dir', () => {
    vi.stubEnv('AURACALL_BROWSER_PROFILE_DIR', '/tmp/auracall-profile');

    const resolved = resolveBrowserConfig({
      manualLogin: true,
      manualLoginProfileDir: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default',
    });

    expect(resolved.manualLoginProfileDir).toBe('/tmp/auracall-profile');
  });

  test('normalizes WSL UNC manual-login profile dirs back to Linux paths', () => {
    vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu');

    const resolved = resolveBrowserConfig({
      manualLogin: true,
      manualLoginProfileDir: '\\\\wsl.localhost\\Ubuntu\\home\\ecochran76\\.auracall\\browser-profile-wsl',
    });

    expect(resolved.manualLoginProfileDir).toBe('/home/ecochran76/.auracall/browser-profile-wsl');
  });

  test('derives deterministic managed profile dirs from the browser target', () => {
    const resolved = resolveBrowserConfig({
      target: 'grok',
    });

    expect(resolved.manualLoginProfileDir).toMatch(/browser-profiles\/default\/grok$/);
  });

  test('uses a Windows-backed managed profile root for WSL Windows Chrome by default', () => {
    vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu');

    const resolved = resolveBrowserConfig({
      target: 'grok',
      wslChromePreference: 'windows',
      chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      chromeCookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
    });

    expect(resolved.managedProfileRoot).toBe('/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles');
    expect(resolved.manualLoginProfileDir).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
    );
  });

  test('infers the Windows-backed managed profile root from Windows drive cookie paths too', () => {
    vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu');

    const resolved = resolveBrowserConfig({
      target: 'grok',
      wslChromePreference: 'windows',
      chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      chromeCookiePath: 'C:\\Users\\ecoch\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Network\\Cookies',
    });

    expect(resolved.managedProfileRoot).toBe('/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles');
    expect(resolved.manualLoginProfileDir).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
    );
  });

  test('rejects temporary chat URLs when desiredModel is Pro', () => {
    expect(() =>
      resolveBrowserConfig({
        url: 'https://chatgpt.com/?temporary-chat=true',
        desiredModel: 'Pro',
      }),
    ).toThrow(/Temporary Chat/i);
  });

  test('normalizes debugPortRange', () => {
    const resolved = resolveBrowserConfig({
      debugPortRange: [46010, 46000],
    });
    expect(resolved.debugPortRange).toEqual([46000, 46010]);
  });

  test('rejects invalid debugPortRange', () => {
    expect(() =>
      resolveBrowserConfig({
        debugPortRange: [0, 70000],
      }),
    ).toThrow(/debugPortRange/i);
  });

  test('rejects invalid tab cleanup limits', () => {
    expect(() =>
      resolveBrowserConfig({
        serviceTabLimit: 0,
      }),
    ).toThrow(/serviceTabLimit/i);
    expect(() =>
      resolveBrowserConfig({
        blankTabLimit: -1,
      }),
    ).toThrow(/blankTabLimit/i);
  });
});
