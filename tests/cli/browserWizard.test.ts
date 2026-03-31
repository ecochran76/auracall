import { describe, expect, test } from 'vitest';
import {
  buildBrowserWizardConfigPatch,
  mergeWizardConfig,
  pickPreferredBrowserWizardChoiceIndex,
  suggestBrowserWizardProfileName,
  validateBrowserWizardProfileName,
  type BrowserWizardChoice,
} from '../../src/cli/browserWizard.js';

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
      profiles: {
        'windows-chrome': {
          engine: 'browser',
          defaultService: 'grok',
          keepBrowser: true,
          browser: {
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
          services: {
            grok: {
              model: 'grok-4.1',
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
    const merged = mergeWizardConfig(
      {
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
      },
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
    expect((merged.profiles as Record<string, unknown>)?.['wsl-chrome-2']).toEqual({
      engine: 'browser',
      defaultService: 'grok',
      keepBrowser: true,
      browser: {
        chromePath: '/usr/bin/google-chrome',
        chromeProfile: 'Default',
        chromeCookiePath: '/home/test/.config/google-chrome/Default/Cookies',
        bootstrapCookiePath: '/home/test/.config/google-chrome/Default/Cookies',
        managedProfileRoot: '/home/test/.auracall/browser-profiles',
        manualLogin: true,
        keepBrowser: true,
        wslChromePreference: 'wsl',
      },
      services: {
        grok: {
          model: 'grok-4.1',
          manualLogin: true,
        },
      },
    });
  });
});
