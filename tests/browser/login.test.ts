import { describe, expect, test } from 'vitest';
import { resolveBrowserLoginOptionsFromUserConfig } from '../../src/browser/login.js';

describe('resolveBrowserLoginOptionsFromUserConfig', () => {
  test('derives login prep from the resolved launch profile', () => {
    const options = resolveBrowserLoginOptionsFromUserConfig(
      {
        auracallProfile: 'windows-chrome-test',
        browser: {
          target: 'grok',
          chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
          chromeProfile: 'Default',
          chromeCookiePath:
            '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
          bootstrapCookiePath:
            '/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies',
          managedProfileRoot: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
          debugPortStrategy: 'auto',
          serviceTabLimit: 5,
          blankTabLimit: 0,
          collapseDisposableWindows: false,
        } as never,
      },
      { target: 'grok', managedProfileSeedPolicy: 'reseed-if-source-newer' },
    );

    expect(options).toMatchObject({
      target: 'grok',
      chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      chromeProfile: 'Default',
      manualLoginProfileDir:
        '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
      cookiePath:
        '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
      bootstrapCookiePath:
        '/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies',
      debugPortStrategy: 'auto',
      serviceTabLimit: 5,
      blankTabLimit: 0,
      collapseDisposableWindows: false,
      managedProfileSeedPolicy: 'reseed-if-source-newer',
    });
  });
});
