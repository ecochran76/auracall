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

  it('normalizes defaultRuntimeProfile into auracallProfile for compatibility consumers', () => {
    const result = normalizeConfigV1toV2({
      version: 3,
      defaultRuntimeProfile: 'consulting',
      runtimeProfiles: {
        consulting: {
          engine: 'browser',
          browserProfile: 'wsl-chrome-2',
          defaultService: 'chatgpt',
        },
      },
    } as any);

    expect(result.defaultRuntimeProfile).toBe('consulting');
    expect(result.auracallProfile).toBe('consulting');
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
        auracallProfile: 'consulting',
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
    expect(result.defaultRuntimeProfile).toBe('consulting');
    expect(result.auracallProfile).toBeUndefined();
    expect(result.browserProfiles?.consulting?.chromePath).toBe('/usr/bin/google-chrome');
    expect(result.runtimeProfiles?.consulting?.browserProfile).toBe('consulting');
    expect(result.runtimeProfiles?.consulting?.browserFamily).toBeUndefined();
    expect(result.browserFamilies).toBeUndefined();
    expect(result.profiles).toBeUndefined();
  });

  it('moves obvious browser-owned runtime overrides into the referenced target browser profile', () => {
    const result = materializeConfigV2(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        browserProfiles: {
          consulting: {
            chromePath: '/usr/bin/google-chrome',
          },
        },
        runtimeProfiles: {
          consulting: {
            engine: 'browser',
            browserProfile: 'consulting',
            keepBrowser: true,
            browser: {
              display: ':0.0',
              wslChromePreference: 'wsl',
            },
            defaultService: 'chatgpt',
          },
        },
      } as any,
      { targetShape: true },
    );

    expect(result.browserProfiles?.consulting).toEqual({
      chromePath: '/usr/bin/google-chrome',
      keepBrowser: true,
      display: ':0.0',
      wslChromePreference: 'wsl',
    });
    expect(result.runtimeProfiles?.consulting?.keepBrowser).toBeUndefined();
    expect(result.runtimeProfiles?.consulting?.browser).toBeUndefined();
  });

  it('preserves service-scoped browser overrides inside the runtime profile during target-shape cleanup when no default service is declared', () => {
    const result = materializeConfigV2(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        browserProfiles: {
          consulting: {
            chromePath: '/usr/bin/google-chrome',
          },
        },
        runtimeProfiles: {
          consulting: {
            engine: 'browser',
            browserProfile: 'consulting',
            browser: {
              display: ':0.0',
              manualLogin: true,
              manualLoginProfileDir: '/tmp/managed/chatgpt',
              modelStrategy: 'current',
            },
          },
        },
      } as any,
      { targetShape: true },
    );

    expect(result.browserProfiles?.consulting).toEqual({
      chromePath: '/usr/bin/google-chrome',
      display: ':0.0',
    });
    expect(result.runtimeProfiles?.consulting?.browser).toEqual({
      manualLogin: true,
      manualLoginProfileDir: '/tmp/managed/chatgpt',
      modelStrategy: 'current',
    });
  });

  it('moves service-scoped browser overrides into the default service config when the target is explicit', () => {
    const result = materializeConfigV2(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
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
            browser: {
              manualLogin: true,
              manualLoginProfileDir: '/tmp/managed/chatgpt',
              modelStrategy: 'current',
              thinkingTime: 'extended',
              composerTool: 'canvas',
            },
          },
        },
      } as any,
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.browser).toEqual({
      manualLogin: true,
      manualLoginProfileDir: '/tmp/managed/chatgpt',
    });
    expect(result.runtimeProfiles?.consulting?.services?.chatgpt).toEqual({
      modelStrategy: 'current',
      thinkingTime: 'extended',
      composerTool: 'canvas',
    });
  });

  it('removes default-equivalent managed profile paths during target-shape cleanup', () => {
    const result = materializeConfigV2(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        browser: {
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
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
            browser: {
              manualLogin: true,
              manualLoginProfileDir: '/tmp/auracall/browser-profiles/consulting/chatgpt',
            },
            services: {
              grok: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/consulting/grok',
              },
            },
          },
        },
      } as any,
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.browser).toEqual({
      manualLogin: true,
    });
    expect(result.runtimeProfiles?.consulting?.services?.grok).toBeUndefined();
  });

  it('preserves external managed profile paths during target-shape cleanup', () => {
    const result = materializeConfigV2(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        browser: {
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
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
            browser: {
              manualLogin: true,
              manualLoginProfileDir: '/tmp/external/chatgpt',
            },
            services: {
              grok: {
                manualLoginProfileDir: '/tmp/external/grok',
              },
            },
          },
        },
      } as any,
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.browser).toEqual({
      manualLogin: true,
      manualLoginProfileDir: '/tmp/external/chatgpt',
    });
    expect(result.runtimeProfiles?.consulting?.services?.grok).toEqual({
      manualLoginProfileDir: '/tmp/external/grok',
    });
  });

  it('preserves conflicting service-scoped values in runtimeProfile.browser during cleanup', () => {
    const result = materializeConfigV2(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
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
            browser: {
              modelStrategy: 'current',
              thinkingTime: 'extended',
            },
            services: {
              chatgpt: {
                modelStrategy: 'select',
              },
            },
          },
        },
      } as any,
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.services?.chatgpt).toEqual({
      modelStrategy: 'select',
      thinkingTime: 'extended',
    });
    expect(result.runtimeProfiles?.consulting?.browser).toEqual({
      modelStrategy: 'current',
    });
  });

  it('downgrades target-shaped input to version 2 when compatibility bridge output is requested', () => {
    const result = materializeConfigV2(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
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
    expect(result.auracallProfile).toBe('consulting');
    expect(result.defaultRuntimeProfile).toBeUndefined();
  });

  it('moves obvious browser-owned runtime overrides into the referenced bridge browser family', () => {
    const result = materializeConfigV2(
      {
        version: 2,
        auracallProfile: 'consulting',
        browserFamilies: {
          consulting: {
            chromePath: '/usr/bin/google-chrome',
          },
        },
        profiles: {
          consulting: {
            engine: 'browser',
            browserFamily: 'consulting',
            keepBrowser: true,
            browser: {
              display: ':0.0',
            },
            defaultService: 'chatgpt',
          },
        },
      } as any,
      { targetShape: false },
    );

    expect(result.browserFamilies?.consulting).toEqual({
      chromePath: '/usr/bin/google-chrome',
      keepBrowser: true,
      display: ':0.0',
    });
    expect(result.profiles?.consulting?.keepBrowser).toBeUndefined();
    expect(result.profiles?.consulting?.browser).toBeUndefined();
  });

  it('moves service-scoped browser overrides into the default service config for bridge-shape cleanup', () => {
    const result = materializeConfigV2(
      {
        version: 2,
        auracallProfile: 'consulting',
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
            browser: {
              manualLogin: true,
              modelStrategy: 'current',
            },
          },
        },
      } as any,
      { targetShape: false },
    );

    expect(result.profiles?.consulting?.browser).toEqual({
      manualLogin: true,
    });
    expect(result.profiles?.consulting?.services?.chatgpt).toEqual({
      modelStrategy: 'current',
    });
  });

  it('removes default-equivalent managed profile paths during bridge-shape cleanup', () => {
    const result = materializeConfigV2(
      {
        version: 2,
        auracallProfile: 'consulting',
        browser: {
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
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
            browser: {
              manualLogin: true,
              manualLoginProfileDir: '/tmp/auracall/browser-profiles/consulting/chatgpt',
            },
            services: {
              gemini: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/consulting/gemini',
              },
            },
          },
        },
      } as any,
      { targetShape: false },
    );

    expect(result.profiles?.consulting?.browser).toEqual({
      manualLogin: true,
    });
    expect(result.profiles?.consulting?.services?.gemini).toBeUndefined();
  });

  it('prunes empty services containers after conservative cleanup', () => {
    const result = materializeConfigV2(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        browser: {
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
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
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/consulting/chatgpt',
              },
            },
          },
        },
      } as any,
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.services).toBeUndefined();
  });

  it('keeps conflicting runtime browser overrides in place during migration cleanup', () => {
    const result = materializeConfigV2(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        browserProfiles: {
          consulting: {
            chromePath: '/usr/bin/google-chrome',
            keepBrowser: false,
            display: ':9.0',
          },
        },
        runtimeProfiles: {
          consulting: {
            engine: 'browser',
            browserProfile: 'consulting',
            keepBrowser: true,
            browser: {
              display: ':0.0',
            },
            defaultService: 'chatgpt',
          },
        },
      } as any,
      { targetShape: true },
    );

    expect(result.browserProfiles?.consulting).toEqual({
      chromePath: '/usr/bin/google-chrome',
      keepBrowser: false,
      display: ':9.0',
    });
    expect(result.runtimeProfiles?.consulting?.keepBrowser).toBe(true);
    expect(result.runtimeProfiles?.consulting?.browser).toEqual({
      display: ':0.0',
    });
  });
});
