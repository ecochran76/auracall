import { describe, expect, test } from 'vitest';
import {
  resolveBrowserProfileResolution,
  resolveSelectedBrowserProfileResolution,
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
      browserProfileId: null,
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

    expect(result.browserProfile).toMatchObject({
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

  test('drops manual-login profile path when manual login is explicitly disabled', () => {
    const merged = {
      services: {
        chatgpt: { url: 'https://chatgpt.com/' },
      },
      browser: {
        target: 'chatgpt',
      },
    };

    const profile = {
      defaultService: 'chatgpt',
      services: {
        chatgpt: {
          manualLogin: true,
          manualLoginProfileDir: '/tmp/managed/chatgpt',
        },
      },
    };

    const browser = {
      target: 'chatgpt',
      manualLogin: false,
      manualLoginProfileDir: '/tmp/browser-override',
    };

    const result = resolveBrowserProfileResolution({
      merged,
      profileName: 'default',
      profile,
      browser,
    });

    expect(result.serviceBinding.manualLogin).toBe(false);
    expect(result.serviceBinding.manualLoginProfileDir).toBeUndefined();
    expect(result.launchProfile.manualLogin).toBe(false);
    expect(result.launchProfile.manualLoginProfileDir).toBeUndefined();
  });

  test('prefers service-scoped defaults over the legacy root-browser inventory for service binding', () => {
    const merged = {
      model: 'gpt-5.2',
      services: {
        chatgpt: { url: 'https://chatgpt.com/' },
      },
      browser: {
        target: 'chatgpt',
        projectId: 'g-p-root-project',
        projectName: 'Root Project',
        conversationId: 'conv-root',
        conversationName: 'Root Conversation',
        modelStrategy: 'current',
        thinkingTime: 'extended',
        composerTool: 'canvas',
        chatgptToolApproval: 'manual',
      },
    };

    const profile = {
      defaultService: 'chatgpt',
      services: {
        chatgpt: {
          projectId: 'g-p-service-project',
          projectName: 'Service Project',
          conversationId: 'conv-service',
          conversationName: 'Service Conversation',
          modelStrategy: 'select',
          thinkingTime: 'light',
          composerTool: 'deep-research',
          chatgptToolApproval: 'allow-once',
        },
      },
    };

    const browser = {
      target: 'chatgpt',
      projectId: 'g-p-root-project',
      projectName: 'Root Project',
      conversationId: 'conv-root',
      conversationName: 'Root Conversation',
      modelStrategy: 'current',
      thinkingTime: 'extended',
      composerTool: 'canvas',
      chatgptToolApproval: 'manual',
    };

    const result = resolveBrowserProfileResolution({
      merged,
      profileName: 'default',
      profile,
      browser,
    });

    expect(result.serviceBinding).toMatchObject({
      serviceId: 'chatgpt',
      projectId: 'g-p-service-project',
      projectName: 'Service Project',
      conversationId: 'conv-service',
      conversationName: 'Service Conversation',
      modelStrategy: 'select',
      thinkingTime: 'light',
      composerTool: 'deep-research',
      chatgptToolApproval: 'allow-once',
    });
  });

  test('prefers browser-profile keepBrowser over legacy runtime-profile keepBrowser', () => {
    const result = resolveBrowserProfileResolution({
      merged: {
        browserProfiles: {
          default: {
            keepBrowser: false,
          },
        },
        browser: {},
      },
      profileName: 'default',
      profile: {
        browserProfile: 'default',
        keepBrowser: true,
      },
      browser: {},
    });

    expect(result.profileFamily.keepBrowser).toBe(false);
    expect(result.launchProfile.keepBrowser).toBe(false);
  });

  test('prefers browser-profile launch defaults for the narrowed browser-owned field set', () => {
    const result = resolveBrowserProfileResolution({
      merged: {
        browserProfiles: {
          default: {
            chromePath: '/browser/chrome',
            display: ':9.0',
            managedProfileRoot: '/browser/managed',
            debugPort: 45555,
            debugPortStrategy: 'auto',
            debugPortRange: [45550, 45560],
            blockingProfileAction: 'restart-managed',
            remoteChrome: { host: '127.0.0.1', port: 9222 },
            headless: true,
            hideWindow: true,
            serviceTabLimit: 3,
            blankTabLimit: 1,
            collapseDisposableWindows: true,
            wslChromePreference: 'wsl',
          },
        },
        browser: {},
      },
      profileName: 'default',
      profile: {
        browserProfile: 'default',
        browser: {
          chromePath: '/runtime/chrome',
          display: ':0.0',
          managedProfileRoot: '/runtime/managed',
          debugPort: 49999,
          debugPortStrategy: 'fixed',
          debugPortRange: [49990, 50010],
          blockingProfileAction: 'fail',
          remoteChrome: { host: '127.0.0.1', port: 9333 },
          headless: false,
          hideWindow: false,
          serviceTabLimit: 7,
          blankTabLimit: 0,
          collapseDisposableWindows: false,
          wslChromePreference: 'windows',
        },
      },
      browser: {},
    });

    expect(result.browserProfile).toMatchObject({
      chromePath: '/browser/chrome',
      display: ':9.0',
      managedProfileRoot: '/browser/managed',
      debugPort: 45555,
      debugPortStrategy: 'auto',
      debugPortRange: [45550, 45560],
      blockingProfileAction: 'restart-managed',
      remoteChrome: { host: '127.0.0.1', port: 9222 },
      headless: true,
      hideWindow: true,
      serviceTabLimit: 3,
      blankTabLimit: 1,
      collapseDisposableWindows: true,
      wslChromePreference: 'wsl',
    });
    expect(result.launchProfile).toMatchObject({
      chromePath: '/browser/chrome',
      display: ':9.0',
      managedProfileRoot: '/browser/managed',
      debugPort: 45555,
      debugPortStrategy: 'auto',
      blockingProfileAction: 'restart-managed',
      remoteChrome: { host: '127.0.0.1', port: 9222 },
      headless: true,
      hideWindow: true,
      serviceTabLimit: 3,
      blankTabLimit: 1,
      collapseDisposableWindows: true,
      wslChromePreference: 'wsl',
    });
  });

  test('prefers browser-profile source browser and cookie defaults over legacy runtime-profile aliases', () => {
    const result = resolveBrowserProfileResolution({
      merged: {
        browserProfiles: {
          default: {
            sourceProfilePath: '/browser/source',
            sourceProfileName: 'Profile 7',
            sourceCookiePath: '/browser/source/Profile 7/Network/Cookies',
            bootstrapCookiePath: '/browser/source/Profile 7/Network/Cookies',
          },
        },
        browser: {},
      },
      profileName: 'default',
      profile: {
        browserProfile: 'default',
        browser: {
          profilePath: '/runtime/source',
          profileName: 'Profile 2',
          cookiePath: '/runtime/source/Profile 2/Network/Cookies',
          bootstrapCookiePath: '/runtime/source/Profile 2/Network/Cookies',
        },
      },
      browser: {},
    });

    expect(result.browserProfile).toMatchObject({
      sourceProfilePath: '/browser/source',
      sourceProfileName: 'Profile 7',
      sourceCookiePath: '/browser/source/Profile 7/Network/Cookies',
      bootstrapCookiePath: '/browser/source/Profile 7/Network/Cookies',
    });
    expect(result.launchProfile).toMatchObject({
      chromeProfile: 'Profile 7',
      chromeCookiePath: '/browser/source/Profile 7/Network/Cookies',
      bootstrapCookiePath: '/browser/source/Profile 7/Network/Cookies',
    });
  });

  test('merges named browser-family defaults before profile-local browser overrides', () => {
    const result = resolveBrowserProfileResolution({
      merged: {
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
        },
        browserFamilies: {
          'wsl-chrome-2': {
            chromePath: '/usr/bin/google-chrome',
            display: ':0.0',
            profilePath: '/home/test/.config/google-chrome',
            profileName: 'Default',
            cookiePath: '/home/test/.config/google-chrome/Default/Network/Cookies',
            bootstrapCookiePath: '/home/test/.config/google-chrome/Default/Network/Cookies',
            managedProfileRoot: '/home/test/.auracall/browser-profiles',
            wslChromePreference: 'wsl',
            debugPortRange: [45000, 45100],
            serviceTabLimit: 3,
            blankTabLimit: 1,
            collapseDisposableWindows: true,
          },
        },
        browser: {},
      },
      profileName: 'wsl-chrome-2',
      profile: {
        browserFamily: 'wsl-chrome-2',
        defaultService: 'chatgpt',
        browser: {
          serviceTabLimit: 5,
          blankTabLimit: 0,
        },
      },
      browser: {
        target: 'chatgpt',
      },
    });

    expect(result.profileFamily.browserProfileId).toBe('wsl-chrome-2');
    expect(result.browserProfile).toMatchObject({
      chromePath: '/usr/bin/google-chrome',
      display: ':0.0',
      managedProfileRoot: '/home/test/.auracall/browser-profiles',
      sourceProfilePath: '/home/test/.config/google-chrome',
      sourceProfileName: 'Default',
      sourceCookiePath: '/home/test/.config/google-chrome/Default/Network/Cookies',
      bootstrapCookiePath: '/home/test/.config/google-chrome/Default/Network/Cookies',
      wslChromePreference: 'wsl',
      debugPortRange: [45000, 45100],
      serviceTabLimit: 3,
      blankTabLimit: 1,
      collapseDisposableWindows: true,
    });
    expect(result.launchProfile).toMatchObject({
      target: 'chatgpt',
      chromePath: '/usr/bin/google-chrome',
      display: ':0.0',
      managedProfileRoot: '/home/test/.auracall/browser-profiles',
      chromeProfile: 'Default',
      chromeCookiePath: '/home/test/.config/google-chrome/Default/Network/Cookies',
      bootstrapCookiePath: '/home/test/.config/google-chrome/Default/Network/Cookies',
      wslChromePreference: 'wsl',
      serviceTabLimit: 3,
      blankTabLimit: 1,
      collapseDisposableWindows: true,
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

  test('keeps the public browserFamily config key as the bridge into browserProfileId', () => {
    const result = resolveBrowserProfileResolution({
      merged: {
        browserFamilies: {
          consulting: {
            chromePath: '/usr/bin/google-chrome',
          },
        },
      },
      profileName: 'consulting',
      profile: {
        browserFamily: 'consulting',
      },
      browser: {},
    });

    expect(result.profileFamily.browserProfileId).toBe('consulting');
    expect(result.browserProfile.chromePath).toBe('/usr/bin/google-chrome');
  });

  test('can resolve browser profile layers from an explicit agent-aware runtime selection', () => {
    const result = resolveSelectedBrowserProfileResolution({
      merged: {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            display: ':0.0',
          },
          consulting: {
            chromePath: '/opt/google/chrome',
            display: ':1.0',
          },
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
          work: { browserProfile: 'consulting', defaultService: 'grok' },
        },
        agents: {
          analyst: { runtimeProfile: 'work' },
        },
        browser: {},
      },
      browser: {
        target: 'grok',
      },
      explicitAgentId: 'analyst',
    });

    expect(result.runtimeSelection).toMatchObject({
      agent: {
        agentId: 'analyst',
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
        defaultService: 'grok',
        exists: true,
      },
      runtimeProfileId: 'work',
      browserProfileId: 'consulting',
      defaultService: 'grok',
    });
    expect(result.resolution.profileFamily).toMatchObject({
      profileName: 'work',
      browserProfileId: 'consulting',
      defaultService: 'grok',
    });
    expect(result.resolution.browserProfile).toMatchObject({
      chromePath: '/opt/google/chrome',
      display: ':1.0',
    });
    expect(result.resolution.launchProfile).toMatchObject({
      target: 'grok',
      chromePath: '/opt/google/chrome',
      display: ':1.0',
    });
  });

  test('keeps explicit AuraCall runtime profile selection above explicit agent selection in browser profile resolution', () => {
    const result = resolveSelectedBrowserProfileResolution({
      merged: {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
          },
          consulting: {
            chromePath: '/opt/google/chrome',
          },
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
          work: { browserProfile: 'consulting', defaultService: 'grok' },
        },
        agents: {
          analyst: { runtimeProfile: 'work' },
        },
        browser: {},
      },
      browser: {},
      explicitProfileName: 'default',
      explicitAgentId: 'analyst',
    });

    expect(result.runtimeSelection).toMatchObject({
      agent: {
        agentId: 'analyst',
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
        defaultService: 'grok',
        exists: true,
      },
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      defaultService: 'chatgpt',
    });
    expect(result.resolution.profileFamily).toMatchObject({
      profileName: 'default',
      browserProfileId: 'default',
      defaultService: 'chatgpt',
    });
    expect(result.resolution.browserProfile.chromePath).toBe('/usr/bin/google-chrome');
  });

});
