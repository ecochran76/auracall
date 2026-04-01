import { describe, expect, test } from 'vitest';
import { applyBrowserProfileOverrides } from '../../src/browser/service/profileConfig.js';

describe('applyBrowserProfileOverrides', () => {
  test('uses the typed profile resolution seam for browser-family and selected service defaults', () => {
    const merged = {
      auracallProfile: 'windows-chrome-test',
      engine: 'browser',
      services: {
        chatgpt: { url: 'https://chatgpt.com/' },
        gemini: { url: 'https://gemini.google.com/app' },
        grok: { url: 'https://grok.com/' },
      },
    };
    const profile = {
      defaultService: 'grok',
      keepBrowser: true,
      cache: {
        includeHistory: true,
        historyLimit: 200,
      },
      browser: {
        chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
        display: ':0.0',
        profilePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data',
        profileName: 'Default',
        cookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Profile 2/Network/Cookies',
        bootstrapCookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Profile 2/Network/Cookies',
        managedProfileRoot: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
        blockingProfileAction: 'restart-managed',
        wslChromePreference: 'windows',
        debugPort: 45920,
        debugPortRange: [45920, 45940],
        serviceTabLimit: 5,
        blankTabLimit: 0,
        collapseDisposableWindows: false,
      },
      services: {
        grok: {
          url: 'https://grok.com/preview',
          projectId: 'project-123',
          conversationId: 'conv-123',
          modelStrategy: 'current',
          thinkingTime: 'heavy',
          composerTool: 'deep-search',
          manualLogin: true,
          manualLoginProfileDir: '/tmp/managed/grok',
        },
      },
    };
    const browser: Record<string, unknown> = {
      chromeProfile: 'Profile 2',
    };

    applyBrowserProfileOverrides(merged, profile, browser, { overrideExisting: true });

    expect(browser.target).toBe('grok');
    expect(browser.keepBrowser).toBe(true);
    expect(browser.chromePath).toBe('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe');
    expect(browser.display).toBe(':0.0');
    expect(browser.chromeProfile).toBe('Profile 2');
    expect(browser.chromeCookiePath).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Profile 2/Network/Cookies',
    );
    expect(browser.bootstrapCookiePath).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Profile 2/Network/Cookies',
    );
    expect(browser.managedProfileRoot).toBe('/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles');
    expect(browser.blockingProfileAction).toBe('restart-managed');
    expect(browser.debugPort).toBe(45920);
    expect(browser.debugPortRange).toEqual([45920, 45940]);
    expect(browser.wslChromePreference).toBe('windows');
    expect(browser.serviceTabLimit).toBe(5);
    expect(browser.blankTabLimit).toBe(0);
    expect(browser.collapseDisposableWindows).toBe(false);
    expect(browser.chatgptUrl).toBe('https://chatgpt.com/');
    expect(browser.geminiUrl).toBe('https://gemini.google.com/app');
    expect(browser.grokUrl).toBe('https://grok.com/preview');
    expect(browser.projectId).toBe('project-123');
    expect(browser.conversationId).toBe('conv-123');
    expect(browser.modelStrategy).toBe('current');
    expect(browser.thinkingTime).toBe('heavy');
    expect(browser.composerTool).toBe('deep-search');
    expect(browser.manualLogin).toBe(true);
    expect(browser.manualLoginProfileDir).toBe('/tmp/managed/grok');
    expect(browser.cache).toEqual({
      includeHistory: true,
      historyLimit: 200,
    });
  });

  test('prefers an explicit browser target over the profile default service', () => {
    const merged = {
      auracallProfile: 'default',
      engine: 'browser',
      services: {
        chatgpt: { url: 'https://chatgpt.com/' },
        gemini: { url: 'https://gemini.google.com/app' },
        grok: { url: 'https://grok.com/' },
      },
      browser: {
        target: 'chatgpt',
      },
    };
    const profile = {
      defaultService: 'grok',
      services: {
        chatgpt: {
          url: 'https://chatgpt.com/g/example',
          projectId: 'chatgpt-project',
        },
        grok: {
          url: 'https://grok.com/preview',
          projectId: 'grok-project',
        },
      },
    };
    const browser: Record<string, unknown> = {
      target: 'chatgpt',
    };

    applyBrowserProfileOverrides(merged, profile, browser, { overrideExisting: true });

    expect(browser.target).toBe('chatgpt');
    expect(browser.chatgptUrl).toBe('https://chatgpt.com/g/example');
    expect(browser.grokUrl).toBe('https://grok.com/preview');
    expect(browser.projectId).toBe('chatgpt-project');
  });
});
