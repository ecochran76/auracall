import { describe, expect, test } from 'vitest';
import {
  buildBrowserWizardConfigPatch,
  mergeWizardConfig,
  pickPreferredBrowserWizardChoiceIndex,
  suggestBrowserWizardProfileName,
  validateBrowserWizardProfileName,
  type BrowserWizardChoice,
  type BrowserWizardConfigOverlay,
} from '../../src/cli/browserWizard.js';
import { materializeConfigV2 } from '../../src/config/migrate.js';

function createChoice(overrides: Partial<BrowserWizardChoice> = {}): BrowserWizardChoice {
  return {
    runtime: 'wsl',
    family: 'chrome',
    managedProfileRoot: '/home/test/.auracall/browser-profiles',
    freshnessMtimeMs: 100,
    freshnessPath: '/home/test/.config/google-chrome/Default/Cookies',
    discovery: {
      userDataDir: '/home/test/.config/google-chrome',
      profileName: 'Default',
      cookiePath: '/home/test/.config/google-chrome/Default/Cookies',
      chromePath: '/usr/bin/google-chrome',
      source: 'wsl',
    },
    ...overrides,
  };
}

describe('suggestBrowserWizardProfileName', () => {
  test('uses default for the primary local or WSL Chrome setup', () => {
    expect(
      suggestBrowserWizardProfileName(
        createChoice({
          runtime: 'local',
          family: 'chrome',
        }),
      ),
    ).toBe('default');
    expect(
      suggestBrowserWizardProfileName(
        createChoice({
          runtime: 'wsl',
          family: 'chrome',
        }),
      ),
    ).toBe('default');
  });

  test('uses runtime-family naming for non-default cases', () => {
    expect(
      suggestBrowserWizardProfileName(
        createChoice({
          runtime: 'windows',
          family: 'chrome',
        }),
      ),
    ).toBe('windows-chrome');
    expect(
      suggestBrowserWizardProfileName(
        createChoice({
          runtime: 'wsl',
          family: 'brave',
        }),
      ),
    ).toBe('wsl-brave');
  });
});

describe('validateBrowserWizardProfileName', () => {
  test('rejects empty names and path-like names', () => {
    expect(validateBrowserWizardProfileName('')).toMatch(/required/i);
    expect(validateBrowserWizardProfileName('.')).toMatch(/must not be "."/i);
    expect(validateBrowserWizardProfileName('windows/chrome')).toMatch(/path separators/i);
    expect(validateBrowserWizardProfileName('windows\\chrome')).toMatch(/path separators/i);
  });

  test('accepts simple profile names', () => {
    expect(validateBrowserWizardProfileName('windows-chrome')).toBeNull();
    expect(validateBrowserWizardProfileName('wsl.chrome')).toBeNull();
  });
});

describe('buildBrowserWizardConfigPatch', () => {
  test('creates a windows profile patch with auto debug-port discovery', () => {
    const patch = buildBrowserWizardConfigPatch({
      target: 'grok',
      profileName: 'windows-chrome',
      setAsDefault: true,
      keepBrowser: true,
      choice: createChoice({
        runtime: 'windows',
        family: 'chrome',
        managedProfileRoot: '/mnt/c/Users/test/AppData/Local/AuraCall/browser-profiles',
        discovery: {
          userDataDir: '/mnt/c/Users/test/AppData/Local/Google/Chrome/User Data',
          profileName: 'Default',
          cookiePath: '/mnt/c/Users/test/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
          chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
          source: 'windows',
        },
      }),
    });

    expect(patch).toEqual({
      version: 2,
      auracallProfile: 'windows-chrome',
      browserFamilies: {
        'windows-chrome': {
          chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
          chromeProfile: 'Default',
          chromeCookiePath: '/mnt/c/Users/test/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
          bootstrapCookiePath: '/mnt/c/Users/test/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
          managedProfileRoot: '/mnt/c/Users/test/AppData/Local/AuraCall/browser-profiles',
          manualLogin: true,
          keepBrowser: true,
          wslChromePreference: 'windows',
          debugPortStrategy: 'auto',
        },
      },
      profiles: {
        'windows-chrome': {
          engine: 'browser',
          browserFamily: 'windows-chrome',
          defaultService: 'grok',
          keepBrowser: true,
          browser: {},
          services: {
            grok: {
              model: 'grok-4.20',
              manualLogin: true,
            },
          },
        },
      },
    });
  });
});

describe('pickPreferredBrowserWizardChoiceIndex', () => {
  test('prefers WSL Chrome over a fresher Windows profile by default on WSL', () => {
    const choices = [
      createChoice({
        runtime: 'wsl',
        freshnessMtimeMs: 100,
      }),
      createChoice({
        runtime: 'windows',
        freshnessMtimeMs: 500,
        managedProfileRoot: '/mnt/c/Users/test/AppData/Local/AuraCall/browser-profiles',
        discovery: {
          userDataDir: '/mnt/c/Users/test/AppData/Local/Google/Chrome/User Data',
          profileName: 'Default',
          cookiePath: '/mnt/c/Users/test/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
          chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
          source: 'windows',
        },
      }),
    ];

    expect(
      pickPreferredBrowserWizardChoiceIndex(choices, {
        configuredChromePath: '/usr/bin/google-chrome',
        wslChromePreference: 'wsl',
      }),
    ).toBe(0);
  });

  test('falls back to configured preference when freshness is tied', () => {
    const choices = [
      createChoice({
        runtime: 'wsl',
        freshnessMtimeMs: 100,
      }),
      createChoice({
        runtime: 'windows',
        freshnessMtimeMs: 100,
        managedProfileRoot: '/mnt/c/Users/test/AppData/Local/AuraCall/browser-profiles',
        discovery: {
          userDataDir: '/mnt/c/Users/test/AppData/Local/Google/Chrome/User Data',
          profileName: 'Default',
          cookiePath: '/mnt/c/Users/test/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
          chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
          source: 'windows',
        },
      }),
    ];

    expect(
      pickPreferredBrowserWizardChoiceIndex(choices, {
        configuredChromePath: null,
        wslChromePreference: 'windows',
      }),
    ).toBe(1);
  });

  test('prefers WSL Chrome over a fresher Windows profile when no explicit preference is set', () => {
    const choices = [
      createChoice({
        runtime: 'wsl',
        freshnessMtimeMs: 100,
      }),
      createChoice({
        runtime: 'windows',
        freshnessMtimeMs: 500,
        managedProfileRoot: '/mnt/c/Users/test/AppData/Local/AuraCall/browser-profiles',
        discovery: {
          userDataDir: '/mnt/c/Users/test/AppData/Local/Google/Chrome/User Data',
          profileName: 'Default',
          cookiePath: '/mnt/c/Users/test/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
          chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
          source: 'windows',
        },
      }),
    ];

    expect(
      pickPreferredBrowserWizardChoiceIndex(choices, {
        configuredChromePath: null,
        wslChromePreference: 'auto',
      }),
    ).toBe(0);
  });
});

describe('mergeWizardConfig', () => {
  test('merges the new wizard profile without clobbering existing config', () => {
    const base: BrowserWizardConfigOverlay = {
      version: 2,
      auracallProfile: 'default',
      browserDefaults: {
        chromePath: '/usr/bin/google-chrome',
      },
      profiles: {
        default: {
          engine: 'browser',
          defaultService: 'chatgpt',
          browser: {
            keepBrowser: false,
          },
        },
      },
    };
    const merged = mergeWizardConfig(
      base,
      buildBrowserWizardConfigPatch({
        target: 'grok',
        profileName: 'wsl-chrome-2',
        setAsDefault: false,
        keepBrowser: true,
        choice: createChoice(),
      }),
    );

    expect(merged.auracallProfile).toBe('default');
    expect(merged.browserDefaults?.chromePath).toBe('/usr/bin/google-chrome');
    expect(merged.profiles?.default?.defaultService).toBe('chatgpt');
    expect((merged.browserFamilies as Record<string, unknown>)?.['wsl-chrome-2']).toEqual({
      chromePath: '/usr/bin/google-chrome',
      chromeProfile: 'Default',
      chromeCookiePath: '/home/test/.config/google-chrome/Default/Cookies',
      bootstrapCookiePath: '/home/test/.config/google-chrome/Default/Cookies',
      managedProfileRoot: '/home/test/.auracall/browser-profiles',
      manualLogin: true,
      keepBrowser: true,
      wslChromePreference: 'wsl',
    });
    expect((merged.profiles as Record<string, unknown>)?.['wsl-chrome-2']).toEqual({
      engine: 'browser',
      browserFamily: 'wsl-chrome-2',
      defaultService: 'grok',
      keepBrowser: true,
      browser: {},
      services: {
        grok: {
          model: 'grok-4.20',
          manualLogin: true,
        },
      },
    });
  });

  test('can materialize wizard output in target-shape mode', () => {
    const merged = mergeWizardConfig(
      {
        version: 2,
        model: 'gpt-5.2',
        browser: {},
        auracallProfile: 'default',
        profiles: {},
      },
      buildBrowserWizardConfigPatch({
        target: 'chatgpt',
        profileName: 'wsl-chrome-2',
        setAsDefault: true,
        keepBrowser: true,
        choice: createChoice({
          runtime: 'wsl',
          family: 'chrome',
          discovery: {
            userDataDir: '/home/test/.config/google-chrome',
            profileName: 'Profile 1',
            cookiePath: '/home/test/.config/google-chrome/Profile 1/Cookies',
            chromePath: '/usr/bin/google-chrome',
            source: 'wsl',
          },
        }),
      }),
    );

    const materialized = materializeConfigV2(merged, { targetShape: true }) as Record<string, unknown>;
    const runtimeProfiles = materialized.runtimeProfiles as Record<string, unknown> | undefined;
    const browserProfiles = materialized.browserProfiles as Record<string, unknown> | undefined;
    const runtimeProfile = runtimeProfiles?.['wsl-chrome-2'] as Record<string, unknown> | undefined;

    expect(browserProfiles?.['wsl-chrome-2']).toEqual({
      chromePath: '/usr/bin/google-chrome',
      chromeProfile: 'Profile 1',
      chromeCookiePath: '/home/test/.config/google-chrome/Profile 1/Cookies',
      bootstrapCookiePath: '/home/test/.config/google-chrome/Profile 1/Cookies',
      managedProfileRoot: '/home/test/.auracall/browser-profiles',
      manualLogin: true,
      keepBrowser: true,
      wslChromePreference: 'wsl',
    });
    expect(runtimeProfile?.browserProfile).toBe('wsl-chrome-2');
    expect(materialized.browserFamilies).toBeUndefined();
    expect(materialized.profiles).toBeUndefined();
  });
});
