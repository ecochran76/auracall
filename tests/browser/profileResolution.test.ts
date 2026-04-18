import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  resolveManagedBrowserLaunchContextFromResolvedConfig,
  resolveBrowserProfileResolution,
  resolveBrowserProfileResolutionFromResolvedConfig,
  resolveSelectedBrowserProfileResolution,
  resolveSessionBrowserLaunchContext,
  resolveUserBrowserLaunchContext,
} from '../../src/browser/service/profileResolution.js';

describe('resolveBrowserProfileResolution', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

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

  test('keeps the current root-browser service default inventory ahead of service-scoped defaults', () => {
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
    };

    const result = resolveBrowserProfileResolution({
      merged,
      profileName: 'default',
      profile,
      browser,
    });

    expect(result.serviceBinding).toMatchObject({
      serviceId: 'chatgpt',
      projectId: 'g-p-root-project',
      projectName: 'Root Project',
      conversationId: 'conv-root',
      conversationName: 'Root Conversation',
      modelStrategy: 'current',
      thinkingTime: 'extended',
      composerTool: 'canvas',
    });
  });

  test('prefers the active signed-in managed subprofile for launchProfile.chromeProfile', async () => {
    const managedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-launch-profile-'));
    cleanup.push(managedRoot);
    const managedProfileDir = path.join(managedRoot, 'wsl-chrome-2', 'chatgpt');
    await fs.mkdir(path.join(managedProfileDir, 'Default'), { recursive: true });
    await fs.mkdir(path.join(managedProfileDir, 'Profile 1'), { recursive: true });
    await fs.writeFile(
      path.join(managedProfileDir, 'Local State'),
      JSON.stringify({
        profile: {
          last_used: 'Profile 1',
          info_cache: {
            Default: {
              name: 'Your Chrome',
              user_name: '',
              is_consented_primary_account: false,
            },
            'Profile 1': {
              name: 'Person 1',
              user_name: 'consult@polymerconsultinggroup.com',
              is_consented_primary_account: true,
            },
          },
        },
      }),
      'utf8',
    );

    const result = resolveBrowserProfileResolutionFromResolvedConfig({
      auracallProfile: 'wsl-chrome-2',
      browser: {
        target: 'chatgpt',
        managedProfileRoot: managedRoot,
        chromeProfile: 'Default',
      },
      target: 'chatgpt',
    });

    expect(result.launchProfile).toMatchObject({
      target: 'chatgpt',
      manualLoginProfileDir: managedProfileDir,
      chromeProfile: 'Profile 1',
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
      serviceTabLimit: 5,
      blankTabLimit: 0,
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
      serviceTabLimit: 5,
      blankTabLimit: 0,
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

  test('builds a reusable launch context directly from resolved user config', () => {
    const result = resolveUserBrowserLaunchContext(
      {
        auracallProfile: 'wsl-chrome-2',
        browser: {
          target: 'chatgpt',
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Default',
          chromeCookiePath: '/home/test/.config/google-chrome/Default/Network/Cookies',
          bootstrapCookiePath: '/home/test/.config/google-chrome/Default/Network/Cookies',
          managedProfileRoot: '/home/test/.auracall/browser-profiles',
          wslChromePreference: 'wsl',
        },
      } as never,
      'chatgpt',
    );

    expect(result.resolvedConfig.target).toBe('chatgpt');
    expect(result.launchProfile).toMatchObject({
      target: 'chatgpt',
      chromePath: '/usr/bin/google-chrome',
      chromeProfile: 'Default',
      manualLoginProfileDir: '/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
      wslChromePreference: 'wsl',
    });
    expect(result.resolution.launchProfile).toEqual(result.launchProfile);
  });

  test('derives managed browser profile identity from resolved browser config', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-managed-launch-'));
    const sourceCookiePath = path.join(tempRoot, 'source', 'Default', 'Network', 'Cookies');
    await fs.mkdir(path.dirname(sourceCookiePath), { recursive: true });
    await fs.writeFile(sourceCookiePath, '');
    const result = resolveManagedBrowserLaunchContextFromResolvedConfig({
      auracallProfile: 'wsl-chrome-2',
      browser: {
        target: 'chatgpt',
        chromePath: '/usr/bin/google-chrome',
        chromeProfile: 'Default',
        chromeCookiePath: sourceCookiePath,
        bootstrapCookiePath: sourceCookiePath,
        managedProfileRoot: path.join(tempRoot, 'managed-root'),
        manualLoginProfileDir: path.join(tempRoot, 'managed-root', 'wsl-chrome-2', 'chatgpt'),
        wslChromePreference: 'wsl',
      },
      target: 'chatgpt',
    });

    expect(result.launchProfile.target).toBe('chatgpt');
    expect(result.managedProfileDir).toBe(path.join(tempRoot, 'managed-root', 'wsl-chrome-2', 'chatgpt'));
    expect(result.defaultManagedProfileDir).toBe(path.join(tempRoot, 'managed-root', 'wsl-chrome-2', 'chatgpt'));
    expect(result.configuredChromeProfile).toBe('Default');
    expect(result.managedChromeProfile).toBe('Default');
    expect(result.bootstrapCookiePath).toBe(sourceCookiePath);
  });

  test('builds a reusable launch context from session config', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-session-launch-'));
    const sourceCookiePath = path.join(tempRoot, 'source', 'Default', 'Network', 'Cookies');
    await fs.mkdir(path.dirname(sourceCookiePath), { recursive: true });
    await fs.writeFile(sourceCookiePath, '');
    const result = resolveSessionBrowserLaunchContext({
      auracallProfileName: 'wsl-chrome-2',
      target: 'chatgpt',
      chromePath: '/usr/bin/google-chrome',
      chromeProfile: 'Profile 1',
      chromeCookiePath: sourceCookiePath,
      bootstrapCookiePath: sourceCookiePath,
      managedProfileRoot: path.join(tempRoot, 'managed-root'),
      manualLoginProfileDir: path.join(tempRoot, 'managed-root', 'wsl-chrome-2', 'chatgpt'),
    });

    expect(result.resolvedConfig.target).toBe('chatgpt');
    expect(result.managedLaunchContext.managedProfileDir).toBe(
      path.join(tempRoot, 'managed-root', 'wsl-chrome-2', 'chatgpt'),
    );
    expect(result.managedLaunchContext.configuredChromeProfile).toBe('Profile 1');
    expect(result.managedLaunchContext.bootstrapCookiePath).toBe(sourceCookiePath);
  });
});
