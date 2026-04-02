import { describe, expect, test } from 'vitest';
import {
  createAuracallBrowserSetupContract,
  defaultSetupVerificationPrompt,
  resolveBrowserSetupTarget,
  resolveSetupVerificationModel,
} from '../../src/cli/browserSetup.js';

describe('resolveBrowserSetupTarget', () => {
  test('uses explicit target when present', () => {
    expect(resolveBrowserSetupTarget({ explicitTarget: 'grok', fallbackTarget: 'chatgpt' })).toBe('grok');
  });

  test('uses aliases when no explicit target is set', () => {
    expect(resolveBrowserSetupTarget({ aliasGemini: true, fallbackTarget: 'chatgpt' })).toBe('gemini');
  });

  test('falls back to configured target when no flag is provided', () => {
    expect(resolveBrowserSetupTarget({ fallbackTarget: 'grok' })).toBe('grok');
  });

  test('rejects conflicting alias and explicit target combinations', () => {
    expect(() =>
      resolveBrowserSetupTarget({ explicitTarget: 'grok', aliasChatgpt: true, fallbackTarget: 'grok' }),
    ).toThrow(/Do not combine --target/i);
  });
});

describe('resolveSetupVerificationModel', () => {
  test('uses service defaults when model was not explicitly requested', () => {
    expect(
      resolveSetupVerificationModel({
        target: 'chatgpt',
        resolvedModel: 'grok-4.1',
        modelSource: 'default',
      }),
    ).toBe('gpt-5.2');
    expect(
      resolveSetupVerificationModel({
        target: 'gemini',
        resolvedModel: 'gpt-5.2',
        modelSource: 'default',
      }),
    ).toBe('gemini-3-pro');
    expect(
      resolveSetupVerificationModel({
        target: 'grok',
        resolvedModel: 'gpt-5.2',
        modelSource: 'default',
      }),
    ).toBe('grok-4.1');
  });

  test('keeps an explicit model when it matches the setup target', () => {
    expect(
      resolveSetupVerificationModel({
        target: 'grok',
        resolvedModel: 'grok-4.1',
        modelSource: 'cli',
      }),
    ).toBe('grok-4.1');
  });

  test('rejects explicit models that point at the wrong browser service', () => {
    expect(() =>
      resolveSetupVerificationModel({
        target: 'grok',
        resolvedModel: 'gpt-5.2',
        modelSource: 'cli',
      }),
    ).toThrow(/targets chatgpt/i);
  });

  test('rejects explicit models that are not browser-service models', () => {
    expect(() =>
      resolveSetupVerificationModel({
        target: 'chatgpt',
        resolvedModel: 'claude-4.5-sonnet',
        modelSource: 'cli',
      }),
    ).toThrow(/only supports ChatGPT, Gemini, or Grok models/i);
  });
});

describe('defaultSetupVerificationPrompt', () => {
  test('uses a short deterministic probe prompt', () => {
    expect(defaultSetupVerificationPrompt('chatgpt')).toBe('ping');
    expect(defaultSetupVerificationPrompt('gemini')).toBe('ping');
    expect(defaultSetupVerificationPrompt('grok')).toBe('ping');
  });
});

describe('createAuracallBrowserSetupContract', () => {
  test('wraps setup output in a versioned contract', () => {
    const contract = createAuracallBrowserSetupContract(
      {
        target: 'grok',
        initialDoctor: {
          contract: 'auracall.browser-doctor',
          version: 1,
          generatedAt: '2026-03-25T23:00:00.000Z',
          target: 'grok',
          localReport: {
            target: 'grok',
            registryPath: '/tmp/browser-state.json',
            managedProfileRoot: '/tmp/managed',
            managedProfileDir: '/tmp/managed/default/grok',
            chromeProfile: 'Default',
            sourceCookiePath: '/tmp/source/Default/Cookies',
            sourceProfile: {
              userDataDir: '/tmp/source',
              profileName: 'Default',
            },
            managedProfileExists: true,
            managedCookiePath: '/tmp/managed/default/grok/Default/Cookies',
            managedPreferencesPath: '/tmp/managed/default/grok/Default/Preferences',
            managedLocalStatePath: '/tmp/managed/default/grok/Local State',
            chromeGoogleAccount: null,
            registryEntries: [],
            staleRegistryEntries: [],
            legacyRegistryEntries: [],
            managedRegistryEntry: null,
            prunedRegistryEntries: 0,
            prunedRegistryEntryReasons: {},
            warnings: [],
          },
          identityStatus: null,
          runtime: {
            browserTools: null,
            browserToolsError: null,
            selectorDiagnosis: null,
            selectorDiagnosisError: null,
          },
        },
        finalDoctor: null,
        finalDoctorError: null,
        login: {
          status: 'completed',
          exportCookies: false,
          managedProfileSeedPolicy: 'reseed-if-source-newer',
          manualLoginProfileDir: '/tmp/managed/default/grok',
          chromeProfile: 'Default',
          launchTargetUrl: 'https://grok.com/',
          error: null,
        },
        verification: {
          status: 'completed',
          model: 'grok-4.1',
          prompt: 'ping',
          sessionId: 'session-123',
          error: null,
        },
      },
      { generatedAt: '2026-03-25T23:00:05.000Z' },
    );

    expect(contract).toEqual({
      contract: 'auracall.browser-setup',
      version: 1,
      generatedAt: '2026-03-25T23:00:05.000Z',
      target: 'grok',
      status: 'completed',
      initialDoctor: {
        contract: 'auracall.browser-doctor',
        version: 1,
        generatedAt: '2026-03-25T23:00:00.000Z',
        target: 'grok',
        localReport: {
          target: 'grok',
          registryPath: '/tmp/browser-state.json',
          managedProfileRoot: '/tmp/managed',
          managedProfileDir: '/tmp/managed/default/grok',
          chromeProfile: 'Default',
          sourceCookiePath: '/tmp/source/Default/Cookies',
          sourceProfile: {
            userDataDir: '/tmp/source',
            profileName: 'Default',
          },
          managedProfileExists: true,
          managedCookiePath: '/tmp/managed/default/grok/Default/Cookies',
          managedPreferencesPath: '/tmp/managed/default/grok/Default/Preferences',
          managedLocalStatePath: '/tmp/managed/default/grok/Local State',
          chromeGoogleAccount: null,
          registryEntries: [],
          staleRegistryEntries: [],
          legacyRegistryEntries: [],
          managedRegistryEntry: null,
          prunedRegistryEntries: 0,
          prunedRegistryEntryReasons: {},
          warnings: [],
        },
        identityStatus: null,
        runtime: {
          browserTools: null,
          browserToolsError: null,
          selectorDiagnosis: null,
          selectorDiagnosisError: null,
        },
      },
      finalDoctor: null,
      finalDoctorError: null,
      login: {
        status: 'completed',
        exportCookies: false,
        managedProfileSeedPolicy: 'reseed-if-source-newer',
        manualLoginProfileDir: '/tmp/managed/default/grok',
        chromeProfile: 'Default',
        launchTargetUrl: 'https://grok.com/',
        error: null,
      },
      verification: {
        status: 'completed',
        model: 'grok-4.1',
        prompt: 'ping',
        sessionId: 'session-123',
        error: null,
      },
    });
  });

  test('marks the setup contract as failed when a step fails', () => {
    const contract = createAuracallBrowserSetupContract({
      target: 'chatgpt',
      initialDoctor: {
        contract: 'auracall.browser-doctor',
        version: 1,
        generatedAt: '2026-03-25T23:00:00.000Z',
        target: 'chatgpt',
        localReport: {
          target: 'chatgpt',
          registryPath: '/tmp/browser-state.json',
          managedProfileRoot: '/tmp/managed',
          managedProfileDir: '/tmp/managed/default/chatgpt',
          chromeProfile: 'Default',
          sourceCookiePath: null,
          sourceProfile: null,
          managedProfileExists: false,
          managedCookiePath: null,
          managedPreferencesPath: null,
          managedLocalStatePath: null,
          chromeGoogleAccount: null,
          registryEntries: [],
          staleRegistryEntries: [],
          legacyRegistryEntries: [],
          managedRegistryEntry: null,
          prunedRegistryEntries: 0,
          prunedRegistryEntryReasons: {},
          warnings: [],
        },
        identityStatus: null,
        runtime: {
          browserTools: null,
          browserToolsError: null,
          selectorDiagnosis: null,
          selectorDiagnosisError: null,
        },
      },
      login: {
        status: 'failed',
        exportCookies: false,
        managedProfileSeedPolicy: 'force-reseed',
        manualLoginProfileDir: '/tmp/managed/default/chatgpt',
        chromeProfile: 'Default',
        launchTargetUrl: 'https://chatgpt.com/',
        error: 'Chrome launch failed',
      },
      verification: {
        status: 'skipped',
        model: null,
        prompt: null,
        sessionId: null,
        error: null,
      },
    });

    expect(contract.status).toBe('failed');
  });
});
