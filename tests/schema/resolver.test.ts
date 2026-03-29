import { describe, it, expect, vi } from 'vitest';
import { resolveConfig } from '../../src/schema/resolver.js';
import * as configModule from '../../src/config.js';

describe('Config Resolver', () => {
  it('should resolve default values when no config/cli provided', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { model: 'gpt-5.2-pro', browser: {} },
      path: '/tmp/config.json',
      loaded: false
    });

    const result = await resolveConfig({});
    
    expect(result.model).toBe('gpt-5.2-pro');
    expect(result.browser.headless).toBe(undefined);
  });

  it('should default browser runs to gpt-5.2-instant when no model is configured', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { browser: {} } as any,
      path: '/tmp/config.json',
      loaded: false,
    });

    const result = await resolveConfig({ engine: 'browser' });

    expect(result.engine).toBe('browser');
    expect(result.model).toBe('gpt-5.2-instant');
  });

  it('should override defaults with file config', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { model: 'gpt-4', browser: { headless: true } },
      path: '/tmp/config.json',
      loaded: true
    });

    const result = await resolveConfig({});
    
    expect(result.model).toBe('gpt-4');
    expect(result.browser.headless).toBe(true);
  });

  it('should override file config with CLI flags', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { model: 'gpt-4', browser: { headless: true } },
      path: '/tmp/config.json',
      loaded: true
    });

    const cliOptions = {
      browserHeadless: false,
      model: 'gpt-5-pro'
    };
    
    const result = await resolveConfig(cliOptions);
    
    expect(result.model).toBe('gpt-5-pro');
    expect(result.browser.headless).toBe(false);
  });

  it('should override project-id from config with CLI flag', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { model: 'gpt-5.2-pro', browser: { projectId: 'CONFIG_ID' } },
      path: '/tmp/config.json',
      loaded: true
    });

    const cliOptions = {
      projectId: 'CLI_ID'
    };
    
    const result = await resolveConfig(cliOptions);

    expect(result.browser.projectId).toBe('CLI_ID');
  });

  it('should apply selected v2 profile browser overrides over browserDefaults', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 2,
        model: 'gpt-5.2-pro',
        browser: {},
        auracallProfile: 'wsl-chrome',
        browserDefaults: {
          chromePath: '/usr/bin/google-chrome',
          chromeCookiePath: '/home/ecochran76/.config/google-chrome/Default/Cookies',
          bootstrapCookiePath: '/home/ecochran76/.config/google-chrome/Default/Cookies',
          managedProfileRoot: '/home/ecochran76/.auracall/browser-profiles',
          wslChromePreference: 'wsl',
          debugPort: 45011,
          serviceTabLimit: 3,
          blankTabLimit: 1,
          collapseDisposableWindows: true,
        },
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        profiles: {
          'windows-chrome-test': {
            engine: 'browser',
            defaultService: 'grok',
            browser: {
              chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
              chromeCookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
              bootstrapCookiePath: '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
              managedProfileRoot: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
              wslChromePreference: 'windows',
              debugPort: 45920,
              serviceTabLimit: 5,
              blankTabLimit: 0,
              collapseDisposableWindows: false,
            },
            services: {
              grok: {
                manualLoginProfileDir: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
              },
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({ profile: 'windows-chrome-test' });

    expect(result.auracallProfile).toBe('windows-chrome-test');
    expect(result.browser.chromePath).toBe('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe');
    expect(result.browser.chromeCookiePath).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
    );
    expect(result.browser.bootstrapCookiePath).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
    );
    expect(result.browser.managedProfileRoot).toBe('/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles');
    expect(result.browser.wslChromePreference).toBe('windows');
    expect(result.browser.manualLoginProfileDir).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
    );
    expect(result.browser.debugPort).toBe(45920);
    expect(result.browser.serviceTabLimit).toBe(5);
    expect(result.browser.blankTabLimit).toBe(0);
    expect(result.browser.collapseDisposableWindows).toBe(false);
  });

  it('should keep CLI browser overrides above selected profile overrides', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 2,
        model: 'gpt-5.2-pro',
        browser: {},
        browserDefaults: {
          chromePath: '/usr/bin/google-chrome',
        },
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        profiles: {
          'windows-chrome-test': {
            engine: 'browser',
            defaultService: 'grok',
            browser: {
              chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
              wslChromePreference: 'windows',
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      profile: 'windows-chrome-test',
      browserChromePath: '/custom/chrome',
      browserWslChrome: 'wsl',
    });

    expect(result.auracallProfile).toBe('windows-chrome-test');
    expect(result.browser.chromePath).toBe('/custom/chrome');
    expect(result.browser.wslChromePreference).toBe('wsl');
  });
});
