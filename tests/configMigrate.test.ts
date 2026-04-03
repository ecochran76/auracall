import { describe, expect, it } from 'vitest';
import { materializeConfigV2, normalizeConfigV1toV2 } from '../src/config/migrate.js';

describe('config migrate bridge helpers', () => {
  it('preserves the runtime-profile browserFamily bridge when normalizing into auracallProfiles', () => {
    const result = normalizeConfigV1toV2({
      profiles: {
        consulting: {
          engine: 'browser',
          browserFamily: 'wsl-chrome-2',
          defaultService: 'chatgpt',
        },
      },
    } as any);

    expect(result.auracallProfiles?.consulting?.browserFamily).toBe('wsl-chrome-2');
    expect(result.auracallProfiles?.consulting?.defaultService).toBe('chatgpt');
  });

  it('accepts target runtimeProfiles during normalization while still materializing legacy auracallProfiles', () => {
    const result = normalizeConfigV1toV2({
      runtimeProfiles: {
        consulting: {
          engine: 'browser',
          browserProfile: 'wsl-chrome-2',
          browser: {
            interactiveLogin: true,
          },
          defaultService: 'chatgpt',
        },
      },
    } as any);

    expect(result.runtimeProfiles?.consulting?.browserProfile).toBe('wsl-chrome-2');
    expect(result.runtimeProfiles?.consulting?.browser?.manualLogin).toBe(true);
    expect(result.auracallProfiles?.consulting?.browserFamily).toBe('wsl-chrome-2');
    expect(result.auracallProfiles?.consulting?.defaultService).toBe('chatgpt');
  });

  it('materializes legacy auracallProfiles back into profiles without losing browserFamily', () => {
    const result = materializeConfigV2({
      version: 2,
      auracallProfiles: {
        consulting: {
          engine: 'browser',
          browserFamily: 'wsl-chrome-2',
          defaultService: 'chatgpt',
        },
      },
    } as any);

    expect(result.version).toBe(2);
    expect(result.profiles?.consulting?.browserFamily).toBe('wsl-chrome-2');
    expect(result.profiles?.consulting?.defaultService).toBe('chatgpt');
  });

  it('can materialize explicit target-shape output for config migrate', () => {
    const result = materializeConfigV2(
      {
        version: 2,
        browserFamilies: {
          consulting: {
            chromePath: '/usr/bin/google-chrome',
          },
        },
        profiles: {
          consulting: {
            engine: 'browser',
            browserFamily: 'consulting',
            defaultService: 'chatgpt',
          },
        },
      } as any,
      { targetShape: true },
    );

    expect(result.version).toBe(3);
    expect(result.browserProfiles?.consulting?.chromePath).toBe('/usr/bin/google-chrome');
    expect(result.runtimeProfiles?.consulting?.browserProfile).toBe('consulting');
    expect(result.runtimeProfiles?.consulting?.browserFamily).toBeUndefined();
    expect(result.browserFamilies).toBeUndefined();
    expect(result.profiles).toBeUndefined();
  });

  it('downgrades target-shaped input to version 2 when compatibility bridge output is requested', () => {
    const result = materializeConfigV2(
      {
        version: 3,
        browserProfiles: {
          consulting: {
            chromePath: '/usr/bin/google-chrome',
          },
        },
        runtimeProfiles: {
          consulting: {
            engine: 'browser',
            browserProfile: 'consulting',
            defaultService: 'chatgpt',
          },
        },
      } as any,
      { targetShape: false },
    );

    expect(result.version).toBe(2);
  });
});
