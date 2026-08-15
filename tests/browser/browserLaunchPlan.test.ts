import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveBrowserLaunchPlan } from '../../src/browser/service/browserLaunchPlan.js';

describe('resolveBrowserLaunchPlan', () => {
  test('returns an immutable browser launch plan without mutating user configuration', () => {
    const config = {
      auracallProfile: 'work',
      browser: {
        target: 'grok' as const,
        chromePath: '/usr/bin/google-chrome',
        chromeProfile: 'Default',
        managedProfileRoot: '/tmp/auracall-browser-launch-plan',
      },
    };
    const before = structuredClone(config);

    const plan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: config as never },
      intent: { provider: 'grok' },
    });

    expect({
      provider: plan.providerBinding.provider,
      managedDirectory: plan.managedBrowserProfile.directory,
      planFrozen: Object.isFrozen(plan),
      nestedFrozen: Object.isFrozen(plan.managedBrowserProfile),
      inputAfterResolution: config,
    }).toEqual({
      provider: 'grok',
      managedDirectory: '/tmp/auracall-browser-launch-plan/work/grok',
      planFrozen: true,
      nestedFrozen: true,
      inputAfterResolution: before,
    });
  });

  test('resolves explicit AuraCall runtime and browser profile intent without caller-side merging', () => {
    const config = {
      auracallProfile: 'work',
      browser: {
        target: 'chatgpt' as const,
        managedProfileRoot: '/tmp/auracall-browser-launch-plan',
      },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
        work: { browserProfile: 'work-browser', defaultService: 'grok' },
      },
      browserProfiles: {
        default: { chromePath: '/usr/bin/google-chrome' },
        'work-browser': { chromePath: '/opt/work/google-chrome' },
        consulting: {
          chromePath: '/opt/consulting/google-chrome',
          managedProfileRoot: '/tmp/auracall-browser-launch-plan',
        },
      },
      agents: {
        analyst: { runtimeProfile: 'work' },
      },
    };

    const plan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: config as never },
      intent: {
        provider: 'grok',
        runtimeProfileId: 'default',
        browserProfileId: 'consulting',
        agentId: 'analyst',
      },
    });

    expect({
      selection: plan.selection,
      executablePath: plan.launchPolicy.chromePath,
      managedDirectory: plan.managedBrowserProfile.directory,
    }).toEqual({
      selection: {
        auraCallRuntimeProfileId: 'default',
        browserProfileId: 'consulting',
        agentId: 'analyst',
      },
      executablePath: '/opt/consulting/google-chrome',
      managedDirectory: '/tmp/auracall-browser-launch-plan/consulting/grok',
    });
  });

  test('does not let stale flattened browser fields override an explicitly selected browser profile', () => {
    const plan = resolveBrowserLaunchPlan({
      source: {
        kind: 'user-config',
        config: {
          auracallProfile: 'default',
          browser: {
            target: 'chatgpt',
            chromePath: '/stale/default/chrome',
            managedProfileRoot: '/tmp/auracall-browser-launch-plan',
          },
          runtimeProfiles: {
            default: { browserProfile: 'default-browser', defaultService: 'chatgpt' },
            selected: { browserProfile: 'selected-browser', defaultService: 'grok' },
          },
          browserProfiles: {
            'default-browser': { chromePath: '/stale/default/chrome' },
            'selected-browser': {
              chromePath: '/selected/chrome',
              managedProfileRoot: '/tmp/auracall-browser-launch-plan',
            },
          },
        } as never,
      },
      intent: {
        provider: 'grok',
        runtimeProfileId: 'selected',
        browserProfileId: 'selected-browser',
      },
    });

    expect({
      selection: plan.selection,
      browserProfileChromePath: plan.browserProfile.chromePath,
      launchPolicyChromePath: plan.launchPolicy.chromePath,
      managedDirectory: plan.managedBrowserProfile.directory,
    }).toEqual({
      selection: {
        auraCallRuntimeProfileId: 'selected',
        browserProfileId: 'selected-browser',
        agentId: null,
      },
      browserProfileChromePath: '/selected/chrome',
      launchPolicyChromePath: '/selected/chrome',
      managedDirectory: '/tmp/auracall-browser-launch-plan/selected-browser/grok',
    });
  });

  test('resolves session provider intent into the same managed browser launch plan', () => {
    const plan = resolveBrowserLaunchPlan({
      source: {
        kind: 'session-config',
        config: {
          auracallProfileName: 'session-profile',
          target: 'chatgpt',
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Profile 1',
          managedProfileRoot: '/tmp/auracall-browser-launch-plan',
        },
      },
      intent: { provider: 'gemini' },
    });

    expect({
      provider: plan.providerBinding.provider,
      policyTarget: plan.launchPolicy.target,
      managedDirectory: plan.managedBrowserProfile.directory,
      configuredProfileName: plan.managedBrowserProfile.configuredProfileName,
    }).toEqual({
      provider: 'gemini',
      policyTarget: 'gemini',
      managedDirectory: '/tmp/auracall-browser-launch-plan/session-profile/gemini',
      configuredProfileName: 'Profile 1',
    });
  });

  test('binds the selected session provider to its resolved launch URL', () => {
    const plan = resolveBrowserLaunchPlan({
      source: {
        kind: 'session-config',
        config: {
          auracallProfileName: 'session-profile',
          target: 'chatgpt',
          geminiUrl: 'https://gemini.google.com/app/example',
          managedProfileRoot: '/tmp/auracall-browser-launch-plan',
        },
      },
      intent: { provider: 'gemini' },
    });

    expect(plan.providerBinding.serviceUrl).toBe('https://gemini.google.com/app/example');
  });

  test('uses the selected AuraCall runtime profile default and deep-freezes nested arrays', () => {
    const config = {
      auracallProfile: 'work',
      browser: {
        managedProfileRoot: '/tmp/auracall-browser-launch-plan',
        cookieNames: ['__Secure-session'],
        inlineCookies: [{ name: 'test-cookie', value: 'test-value', domain: 'example.com' }],
        remoteChrome: { host: '127.0.0.1', port: 9222 },
      },
      runtimeProfiles: {
        work: { browserProfile: 'consulting', defaultService: 'gemini' },
      },
      browserProfiles: {
        consulting: { debugPortRange: [46000, 46100] },
      },
      services: {
        gemini: { url: 'https://gemini.google.com/app/runtime-default' },
      },
    };

    const plan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: config as never },
    });

    expect({
      provider: plan.providerBinding.provider,
      serviceUrl: plan.providerBinding.serviceUrl,
      target: plan.launchPolicy.target,
      cookieNamesFrozen: Object.isFrozen(plan.launchPolicy.cookieNames),
      portRangeFrozen: Object.isFrozen(plan.browserProfile.debugPortRange),
      inputCookieNamesFrozen: Object.isFrozen(config.browser.cookieNames),
      inlineCookieFrozen: Object.isFrozen(plan.launchPolicy.inlineCookies?.[0]),
      remoteChromeFrozen: Object.isFrozen(plan.launchPolicy.remoteChrome),
      cookieNamesShared: plan.launchPolicy.cookieNames === config.browser.cookieNames,
      inlineCookiesShared: plan.launchPolicy.inlineCookies === config.browser.inlineCookies,
      remoteChromeShared: plan.launchPolicy.remoteChrome === config.browser.remoteChrome,
    }).toEqual({
      provider: 'gemini',
      serviceUrl: 'https://gemini.google.com/app/runtime-default',
      target: 'gemini',
      cookieNamesFrozen: true,
      portRangeFrozen: true,
      inputCookieNamesFrozen: false,
      inlineCookieFrozen: true,
      remoteChromeFrozen: true,
      cookieNamesShared: false,
      inlineCookiesShared: false,
      remoteChromeShared: false,
    });
    expect(() => {
      (plan.launchPolicy.remoteChrome as { port: number }).port = 9333;
    }).toThrow(TypeError);
  });

  test('produces field-for-field equivalent plans for equivalent user and session sources', () => {
    const sharedBrowser = {
      target: 'gemini' as const,
      chromePath: '/opt/google/chrome',
      chromeProfile: 'Profile 2',
      managedProfileRoot: '/tmp/auracall-browser-launch-plan-parity',
      geminiUrl: 'https://gemini.google.com/app/parity',
      targetUrl: 'https://gemini.google.com/app/parity',
      auracallProfileName: 'work',
      projectId: null,
      conversationId: null,
      debugPortRange: [47000, 47100] as [number, number],
    };
    const userPlan = resolveBrowserLaunchPlan({
      source: {
        kind: 'user-config',
        config: {
          auracallProfile: 'work',
          browser: sharedBrowser,
          runtimeProfiles: {
            work: { defaultService: 'gemini' },
          },
          services: {
            gemini: { url: sharedBrowser.geminiUrl },
          },
        } as never,
      },
      intent: { provider: 'gemini' },
    });
    const sessionPlan = resolveBrowserLaunchPlan({
      source: {
        kind: 'session-config',
        config: sharedBrowser,
      },
      intent: { provider: 'gemini' },
    });

    expect(sessionPlan).toEqual(userPlan);
    expect(sessionPlan).not.toBe(userPlan);
    expect(sessionPlan.launchPolicy).not.toBe(userPlan.launchPolicy);
  });

  test('selects the active signed-in managed browser subprofile without changing the configured profile', async () => {
    const managedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-browser-launch-plan-'));
    try {
      const directory = path.join(managedRoot, 'work', 'chatgpt');
      const sourceCookiePath = path.join(managedRoot, 'source', 'Default', 'Network', 'Cookies');
      await fs.mkdir(path.join(directory, 'Default'), { recursive: true });
      await fs.mkdir(path.join(directory, 'Profile 1'), { recursive: true });
      await fs.mkdir(path.dirname(sourceCookiePath), { recursive: true });
      await fs.writeFile(sourceCookiePath, '');
      await fs.writeFile(
        path.join(directory, 'Local State'),
        JSON.stringify({
          profile: {
            last_used: 'Profile 1',
            info_cache: {
              // biome-ignore lint/complexity/useLiteralKeys: quoted Chrome profile key avoids naming-convention diagnostics.
              ['Default']: { user_name: '', is_consented_primary_account: false },
              'Profile 1': {
                user_name: 'signed-in@example.com',
                is_consented_primary_account: true,
              },
            },
          },
        }),
      );

      const plan = resolveBrowserLaunchPlan({
        source: {
          kind: 'session-config',
          config: {
            auracallProfileName: 'work',
            target: 'chatgpt',
            chromeProfile: 'Default',
            chromeCookiePath: sourceCookiePath,
            managedProfileRoot: managedRoot,
          },
        },
      });

      expect(plan.managedBrowserProfile).toMatchObject({
        configuredProfileName: 'Default',
        activeProfileName: 'Profile 1',
      });
      expect(plan.sourceBrowserProfile).toMatchObject({
        name: 'Default',
        cookiePath: sourceCookiePath,
      });
    } finally {
      await fs.rm(managedRoot, { recursive: true, force: true });
    }
  });

  test('preserves browser launch validation errors at the public seam', () => {
    expect(() => resolveBrowserLaunchPlan({
      source: {
        kind: 'user-config',
        config: {
          model: 'Pro',
          browser: {
            target: 'chatgpt',
            chatgptUrl: 'https://chatgpt.com/?temporary-chat=true',
            modelStrategy: 'select',
          },
        } as never,
      },
    })).toThrow(
      'Temporary Chat mode does not expose Pro models in the ChatGPT model picker. ' +
        'Remove "temporary-chat=true" from your browser URL, or use a non-Pro model label (e.g. "Instant").',
    );
  });
});
