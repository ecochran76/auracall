import { describe, expect, test } from 'vitest';
import {
  resolveBrowserProfileResolution,
  resolveBrowserProfileResolutionFromResolvedConfig,
} from '../../src/browser/service/profileResolution.js';

describe('resolveBrowserProfileResolution', () => {
  test('builds typed resolved profile/browser/service/launch layers from the current merge shape', () => {
    const merged = {
      model: 'grok-4.1',
      services: {
        chatgpt: { url: 'https://chatgpt.com/' },
        gemini: { url: 'https://gemini.google.com/app' },
        grok: { url: 'https://grok.com/' },
      },
      browser: {
        target: 'grok',
      },
    };

    const profile = {
      defaultService: 'grok',
      keepBrowser: true,
      cache: {
        includeHistory: true,
        includeProjectOnlyConversations: true,
        historyLimit: 200,
      },
      browser: {
        chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
        profilePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data',
        profileName: 'Default',
        cookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Profile 2/Network/Cookies',
        bootstrapCookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Profile 2/Network/Cookies',
        managedProfileRoot: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
        wslChromePreference: 'windows',
        debugPort: 45920,
        serviceTabLimit: 5,
        blankTabLimit: 0,
        collapseDisposableWindows: false,
      },
      services: {
        grok: {
          url: 'https://grok.com/preview',
          projectId: 'project-123',
          conversationId: 'conv-123',
          composerTool: 'deep-search',
          manualLoginProfileDir: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
        },
      },
    };

    const browser = {
      target: 'grok',
      chromeProfile: 'Profile 2',
      chromeCookiePath: '/tmp/cookies.db',
      bootstrapCookiePath: '/tmp/bootstrap.db',
      manualLogin: true,
      manualLoginProfileDir: '/tmp/manual-profile',
      thinkingTime: 'heavy',
      modelStrategy: 'current',
      keepBrowser: true,
    };

    const result = resolveBrowserProfileResolution({
      merged,
      profileName: 'windows-chrome-test',
      profile,
      browser,
    });

    expect(result.profileFamily).toEqual({
      profileName: 'windows-chrome-test',
      defaultService: 'grok',
      keepBrowser: true,
      cacheDefaults: {
        store: undefined,
        refresh: undefined,
        includeHistory: true,
        includeProjectOnlyConversations: true,
        historyLimit: 200,
        historySince: undefined,
        cleanupDays: undefined,
        rootDir: undefined,
      },
    });

    expect(result.browserFamily).toMatchObject({
      chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      managedProfileRoot: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
      sourceProfilePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data',
      sourceProfileName: 'Profile 2',
      sourceCookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Profile 2/Network/Cookies',
      bootstrapCookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Profile 2/Network/Cookies',
      wslChromePreference: 'windows',
      debugPort: 45920,
      serviceTabLimit: 5,
      blankTabLimit: 0,
      collapseDisposableWindows: false,
    });

    expect(result.serviceBinding).toEqual({
      serviceId: 'grok',
      serviceUrl: 'https://grok.com/preview',
      urls: {
        chatgpt: 'https://chatgpt.com/',
        gemini: 'https://gemini.google.com/app',
        grok: 'https://grok.com/preview',
      },
      projectId: 'project-123',
      projectName: undefined,
      conversationId: 'conv-123',
      conversationName: undefined,
      model: 'grok-4.1',
      modelStrategy: 'current',
      thinkingTime: 'heavy',
      composerTool: 'deep-search',
      manualLogin: true,
      manualLoginProfileDir: '/tmp/manual-profile',
    });

    expect(result.launchProfile).toMatchObject({
      target: 'grok',
      targetUrl: 'https://grok.com/preview',
      chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      chromeProfile: 'Profile 2',
      chromeCookiePath: '/tmp/cookies.db',
      bootstrapCookiePath: '/tmp/bootstrap.db',
      manualLoginProfileDir: '/tmp/manual-profile',
      managedProfileRoot: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
      debugPort: 45920,
      keepBrowser: true,
      manualLogin: true,
      wslChromePreference: 'windows',
    });
  });

  test('derives a target-scoped launch profile from flattened resolved config', () => {
    const result = resolveBrowserProfileResolutionFromResolvedConfig({
      auracallProfile: 'mixed',
      browser: {
        target: 'chatgpt',
        managedProfileRoot: '/tmp/managed-root',
        chromeProfile: 'Profile 2',
        debugPort: 45555,
        debugPortStrategy: 'auto',
        wslChromePreference: 'windows',
      },
      target: 'grok',
    });

    expect(result.launchProfile).toMatchObject({
      target: 'grok',
      chromeProfile: 'Profile 2',
      manualLoginProfileDir: '/tmp/managed-root/mixed/grok',
      debugPort: 45555,
      debugPortStrategy: 'auto',
      wslChromePreference: 'windows',
    });
  });

  test('falls back cleanly when no profile-level defaults exist', () => {
    const result = resolveBrowserProfileResolution({
      merged: { browser: {} },
      profileName: null,
      profile: {},
      browser: {},
    });

    expect(result.profileFamily.defaultService).toBeNull();
    expect(result.serviceBinding.serviceUrl).toBeNull();
    expect(result.launchProfile.targetUrl).toBeNull();
  });
});
