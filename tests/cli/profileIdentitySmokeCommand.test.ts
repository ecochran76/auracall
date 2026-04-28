import { describe, expect, it } from 'vitest';
import {
  buildProfileIdentitySmokeBatchReport,
  buildProfileIdentitySmokeReport,
  formatProfileIdentitySmokeBatchReport,
  formatProfileIdentitySmokeReport,
  normalizeProfileIdentitySmokeProvider,
  resolveConfiguredProviderIdentity,
  resolveProfileIdentitySmokeBatchExitCode,
  resolveProfileIdentitySmokeExitCode,
  resolveProfileIdentitySmokeTargets,
} from '../../src/cli/profileIdentitySmokeCommand.js';

describe('profile identity smoke CLI helpers', () => {
  it('normalizes provider names', () => {
    expect(normalizeProfileIdentitySmokeProvider('ChatGPT')).toBe('chatgpt');
    expect(normalizeProfileIdentitySmokeProvider('gemini')).toBe('gemini');
    expect(normalizeProfileIdentitySmokeProvider('grok')).toBe('grok');
    expect(() => normalizeProfileIdentitySmokeProvider('claude')).toThrow(
      'Invalid provider "claude". Use "chatgpt", "gemini", or "grok".',
    );
  });

  it('resolves profile identity before global identity', () => {
    const config = {
      activeProfile: 'default',
      services: {
        chatgpt: {
          identity: { email: 'global@example.com' },
        },
      },
      profiles: {
        default: {
          services: {
            chatgpt: {
              identity: { email: 'profile@example.com' },
            },
          },
        },
      },
    };

    expect(
      resolveConfiguredProviderIdentity(config, {
        providerId: 'chatgpt',
        runtimeProfileId: 'default',
      }),
    ).toEqual({
      identity: {
        email: 'profile@example.com',
        source: 'profile',
      },
      serviceAccountId: 'service-account:chatgpt:profile@example.com',
      source: 'profile',
    });
  });

  it('preserves configured account-level identity details', () => {
    const config = {
      activeProfile: 'default',
      profiles: {
        default: {
          services: {
            chatgpt: {
              identity: {
                email: 'profile@example.com',
                accountLevel: 'Pro',
                accountPlanType: 'pro',
                accountStructure: 'personal',
                capabilityProfile: 'chatgpt-pro-unlimited',
                proAccess: 'unlimited-standard-extended',
                deepResearchAccess: 'unlimited',
              },
            },
          },
        },
      },
    };

    expect(
      resolveConfiguredProviderIdentity(config, {
        providerId: 'chatgpt',
        runtimeProfileId: 'default',
      }).identity,
    ).toMatchObject({
      email: 'profile@example.com',
      accountLevel: 'Pro',
      accountPlanType: 'pro',
      accountStructure: 'personal',
      capabilityProfile: 'chatgpt-pro-unlimited',
      proAccess: 'unlimited-standard-extended',
      deepResearchAccess: 'unlimited',
      source: 'profile',
    });
  });

  it('formats account-level identity details when available', () => {
    const report = buildProfileIdentitySmokeReport({
      config: {
        activeProfile: 'default',
        profiles: {
          default: {
            services: {
              chatgpt: {
                identity: { email: 'operator@example.com', accountLevel: 'Pro' },
              },
            },
          },
        },
      },
      target: 'chatgpt',
      runtimeProfileId: 'default',
      actualIdentity: { email: 'operator@example.com', accountLevel: 'Pro', source: 'auth-session' },
      identityStatus: { attempted: true },
      localReport: {},
    });

    expect(formatProfileIdentitySmokeReport(report)).toContain('Account level: expected Pro; actual Pro');
  });

  it('resolves all-bound targets from configured provider identities', () => {
    const config = {
      activeProfile: 'work',
      profiles: {
        work: {
          services: {
            chatgpt: {
              identity: { email: 'consult@example.com' },
            },
            grok: {
              manualLoginProfileDir: '/tmp/grok',
            },
          },
        },
      },
      services: {
        gemini: {
          identity: { email: 'global-gemini@example.com' },
        },
      },
    };

    expect(
      resolveProfileIdentitySmokeTargets(config, {
        allBound: true,
        runtimeProfileId: 'work',
      }),
    ).toEqual(['chatgpt', 'gemini']);
    expect(
      resolveProfileIdentitySmokeTargets(config, {
        all: true,
        runtimeProfileId: 'work',
      }),
    ).toEqual(['chatgpt', 'gemini', 'grok']);
    expect(
      resolveProfileIdentitySmokeTargets(config, {
        explicitTarget: 'grok',
        runtimeProfileId: 'work',
      }),
    ).toEqual(['grok']);
    expect(() =>
      resolveProfileIdentitySmokeTargets(config, {
        explicitTarget: 'grok',
        allBound: true,
        runtimeProfileId: 'work',
      }),
    ).toThrow('Use --target with a single smoke, or --all/--all-bound for a profile-wide smoke.');
  });

  it('falls back to global identity and account id', () => {
    const config = {
      activeProfile: 'default',
      services: {
        gemini: {
          identity: { email: 'global@example.com' },
        },
      },
      profiles: {
        default: {
          services: {},
        },
      },
    };

    expect(
      resolveConfiguredProviderIdentity(config, {
        providerId: 'gemini',
        runtimeProfileId: 'default',
      }),
    ).toEqual({
      identity: {
        email: 'global@example.com',
        source: 'config',
      },
      serviceAccountId: 'service-account:gemini:global@example.com',
      source: 'config',
    });
  });

  it('builds a passing positive report with an in-memory negative check', () => {
    const report = buildProfileIdentitySmokeReport({
      config: {
        activeProfile: 'default',
        profiles: {
          default: {
            services: {
              chatgpt: {
                identity: { email: 'ecochran76@gmail.com' },
              },
            },
          },
        },
      },
      target: 'chatgpt',
      runtimeProfileId: 'default',
      actualIdentity: { email: 'ecochran76@gmail.com', source: 'auth-session' },
      identityStatus: { attempted: true },
      localReport: { managedProfileDir: '/tmp/profile' },
      launchedBrowser: true,
      includeNegative: true,
      generatedAt: '2026-04-26T12:00:00.000Z',
    });

    expect(report.preflight).toMatchObject({ ok: true, reason: null });
    expect(report.negative).toMatchObject({
      requested: true,
      ok: true,
      expectedReason: 'chatgpt_expected_identity_missing',
    });
    expect(resolveProfileIdentitySmokeExitCode(report)).toBe(0);
    expect(formatProfileIdentitySmokeReport(report)).toContain('Profile identity smoke: PASS');
    expect(formatProfileIdentitySmokeReport(report)).toContain('Negative missing-identity check: PASS');
  });

  it('fails when no expected identity is configured', () => {
    const report = buildProfileIdentitySmokeReport({
      config: {
        activeProfile: 'default',
        profiles: {
          default: {
            services: {},
          },
        },
      },
      target: 'grok',
      runtimeProfileId: 'default',
      actualIdentity: { email: 'ez86944@gmail.com' },
      identityStatus: { attempted: true },
      localReport: {},
    });

    expect(report.preflight).toMatchObject({
      ok: false,
      reason: 'grok_expected_identity_missing',
    });
    expect(resolveProfileIdentitySmokeExitCode(report)).toBe(1);
    expect(formatProfileIdentitySmokeReport(report)).toContain('FAIL grok_expected_identity_missing');
  });

  it('builds and formats batch reports', () => {
    const passingReport = buildProfileIdentitySmokeReport({
      config: {
        activeProfile: 'default',
        profiles: {
          default: {
            services: {
              chatgpt: {
                identity: { email: 'ecochran76@gmail.com' },
              },
            },
          },
        },
      },
      target: 'chatgpt',
      runtimeProfileId: 'default',
      actualIdentity: { email: 'ecochran76@gmail.com' },
      identityStatus: { attempted: true },
      localReport: {},
    });
    const failingReport = buildProfileIdentitySmokeReport({
      config: {
        activeProfile: 'default',
        profiles: {
          default: {
            services: {},
          },
        },
      },
      target: 'gemini',
      runtimeProfileId: 'default',
      actualIdentity: { email: 'ecochran76@gmail.com' },
      identityStatus: { attempted: true },
      localReport: {},
    });
    const batch = buildProfileIdentitySmokeBatchReport({
      mode: 'all',
      runtimeProfile: 'default',
      reports: [passingReport, failingReport],
      generatedAt: '2026-04-26T12:00:00.000Z',
    });

    expect(batch.ok).toBe(false);
    expect(batch.targets).toEqual(['chatgpt', 'gemini']);
    expect(resolveProfileIdentitySmokeBatchExitCode(batch)).toBe(1);
    expect(formatProfileIdentitySmokeBatchReport(batch)).toContain('Profile identity smoke batch: FAIL');
    expect(formatProfileIdentitySmokeBatchReport(batch)).toContain('- chatgpt: PASS');
    expect(formatProfileIdentitySmokeBatchReport(batch)).toContain('- gemini: FAIL gemini_expected_identity_missing');
  });
});
