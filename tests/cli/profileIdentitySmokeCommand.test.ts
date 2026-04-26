import { describe, expect, it } from 'vitest';
import {
  buildProfileIdentitySmokeReport,
  formatProfileIdentitySmokeReport,
  normalizeProfileIdentitySmokeProvider,
  resolveConfiguredProviderIdentity,
  resolveProfileIdentitySmokeExitCode,
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
});
