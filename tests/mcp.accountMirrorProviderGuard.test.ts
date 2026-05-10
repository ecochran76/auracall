import { describe, expect, it } from 'vitest';
import { createAccountMirrorStatusRegistry } from '../src/accountMirror/statusRegistry.js';
import { createAccountMirrorProviderGuardClearToolHandler } from '../src/mcp/tools/accountMirrorProviderGuard.js';

describe('mcp account_mirror_provider_guard_clear tool', () => {
  it('clears a provider guard and applies operator cooldown through the shared registry', async () => {
    const registry = createAccountMirrorStatusRegistry({
      config: {
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            services: {
              gemini: {
                identity: {
                  email: 'ez86944@gmail.com',
                },
              },
            },
          },
        },
      },
      now: () => new Date('2026-05-10T12:00:00.000Z'),
      initialState: {
        'gemini:default': {
          providerGuard: {
            state: 'manual_clear_required',
            kind: 'google-sorry',
            summary: 'Google Sorry page detected.',
            detectedAtMs: Date.parse('2026-05-10T11:55:00.000Z'),
            url: 'https://www.google.com/sorry/index',
            action: 'manual-clear',
          },
          queued: true,
          running: true,
          providerHardStopAtMs: Date.parse('2026-05-11T00:00:00.000Z'),
        },
      },
    });
    const handler = createAccountMirrorProviderGuardClearToolHandler({
      registry,
      now: () => new Date('2026-05-10T12:05:00.000Z'),
    });

    const result = await handler({
      provider: 'gemini',
      runtimeProfile: 'default',
      cooldownMs: 600_000,
    });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'account_mirror_provider_guard_clear',
        kind: 'account-mirror-provider-guard',
        action: 'clear',
        provider: 'gemini',
        runtimeProfileId: 'default',
        cooldownUntil: '2026-05-10T12:15:00.000Z',
        mirrorStatus: {
          provider: 'gemini',
          runtimeProfileId: 'default',
          status: 'delayed',
          reason: 'provider-guard-cooldown',
          mirrorState: {
            queued: false,
            running: false,
          },
          providerGuard: {
            state: 'cooldown',
            kind: 'google-sorry',
            detectedAt: '2026-05-10T11:55:00.000Z',
            clearedAt: '2026-05-10T12:05:00.000Z',
            cooldownUntil: '2026-05-10T12:15:00.000Z',
            action: 'operator-clear',
          },
        },
      },
    });
  });
});
