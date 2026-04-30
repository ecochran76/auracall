import { describe, expect, it } from 'vitest';
import { materializeConfigV2, normalizeConfigV1toV2 } from '../src/config/migrate.js';
import type { OracleConfig } from '../src/config/schema.js';

type ConfigMigrationFixture = Partial<OracleConfig> & Record<string, unknown>;

function configFixture(config: ConfigMigrationFixture): OracleConfig {
  return config as OracleConfig;
}

function normalizeFixture(config: ConfigMigrationFixture, options?: Parameters<typeof normalizeConfigV1toV2>[1]) {
  return normalizeConfigV1toV2(configFixture(config), options);
}

function materializeFixture(config: ConfigMigrationFixture, options?: Parameters<typeof materializeConfigV2>[1]) {
  return materializeConfigV2(configFixture(config), options);
}

describe('config migrate bridge helpers', () => {
  it('preserves the runtime-profile browserFamily bridge when normalizing into auracallProfiles', () => {
    const result = normalizeFixture({
      profiles: {
        consulting: {
          engine: 'browser',
          browserFamily: 'wsl-chrome-2',
          defaultService: 'chatgpt',
        },
      },
    });

    expect(result.auracallProfiles?.consulting?.browserFamily).toBe('wsl-chrome-2');
    expect(result.auracallProfiles?.consulting?.defaultService).toBe('chatgpt');
  });

  it('accepts target runtimeProfiles during normalization while still materializing legacy auracallProfiles', () => {
    const result = normalizeFixture({
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
    });

    expect(result.runtimeProfiles?.consulting?.browserProfile).toBe('wsl-chrome-2');
    expect(result.runtimeProfiles?.consulting?.browser?.manualLogin).toBe(true);
    expect(result.auracallProfiles?.consulting?.browserFamily).toBe('wsl-chrome-2');
    expect(result.auracallProfiles?.consulting?.defaultService).toBe('chatgpt');
  });

  it('normalizes defaultRuntimeProfile into auracallProfile for compatibility consumers', () => {
    const result = normalizeFixture({
      version: 3,
      defaultRuntimeProfile: 'consulting',
      runtimeProfiles: {
        consulting: {
          engine: 'browser',
          browserProfile: 'wsl-chrome-2',
          defaultService: 'chatgpt',
        },
      },
    });

    expect(result.defaultRuntimeProfile).toBe('consulting');
    expect(result.auracallProfile).toBe('consulting');
  });

  it('fills root model and browser defaults from llmDefaults only when those target values are absent', () => {
    const result = normalizeFixture({
      version: 3,
      llmDefaults: {
        model: 'gpt-5.1',
        modelStrategy: 'current',
        defaultProjectName: 'Legacy Project',
        defaultProjectId: 'g-p-legacy-project',
      },
    });

    expect(result.model).toBe('gpt-5.1');
    expect(result.browser).toMatchObject({
      modelStrategy: 'current',
      projectName: 'Legacy Project',
      projectId: 'g-p-legacy-project',
    });
  });

  it('keeps explicit root model and browser defaults ahead of llmDefaults during normalization', () => {
    const result = normalizeFixture({
      version: 3,
      model: 'gpt-5.2',
      browser: {
        modelStrategy: 'select',
        projectName: 'Root Project',
        projectId: 'g-p-root-project',
      },
      llmDefaults: {
        model: 'gpt-5.1',
        modelStrategy: 'current',
        defaultProjectName: 'Legacy Project',
        defaultProjectId: 'g-p-legacy-project',
      },
    });

    expect(result.model).toBe('gpt-5.2');
    expect(result.browser).toMatchObject({
      modelStrategy: 'select',
      projectName: 'Root Project',
      projectId: 'g-p-root-project',
    });
    expect(result.llmDefaults).toMatchObject({
      model: 'gpt-5.1',
      modelStrategy: 'current',
      defaultProjectName: 'Legacy Project',
      defaultProjectId: 'g-p-legacy-project',
    });
  });

  it('materializes legacy auracallProfiles back into profiles without losing browserFamily', () => {
    const result = materializeFixture({
      version: 2,
      auracallProfiles: {
        consulting: {
          engine: 'browser',
          browserFamily: 'wsl-chrome-2',
          defaultService: 'chatgpt',
        },
      },
    });

    expect(result.version).toBe(2);
    expect(result.profiles?.consulting?.browserFamily).toBe('wsl-chrome-2');
    expect(result.profiles?.consulting?.defaultService).toBe('chatgpt');
  });

  it('can materialize explicit target-shape output for config migrate', () => {
    const result = materializeFixture(
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
      },
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
    const result = materializeFixture(
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
      },
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
    const result = materializeFixture(
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
      },
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
    const result = materializeFixture(
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
      },
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.browser).toBeUndefined();
    expect(result.runtimeProfiles?.consulting?.services?.chatgpt).toEqual({
      manualLogin: true,
      manualLoginProfileDir: '/tmp/managed/chatgpt',
      modelStrategy: 'current',
      thinkingTime: 'extended',
      composerTool: 'canvas',
    });
  });

  it('does not auto-relocate root-browser compatibility aliases into service defaults during target-shape cleanup', () => {
    const result = materializeFixture(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        browser: {
          modelStrategy: 'current',
          thinkingTime: 'extended',
          composerTool: 'canvas',
          projectName: 'Root Project',
          projectId: 'g-p-root-project',
          conversationName: 'Root Conversation',
          conversationId: 'conv-root',
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
          },
        },
      },
      { targetShape: true },
    );

    expect(result.browser).toEqual({
      modelStrategy: 'current',
      thinkingTime: 'extended',
      composerTool: 'canvas',
      projectName: 'Root Project',
      projectId: 'g-p-root-project',
      conversationName: 'Root Conversation',
      conversationId: 'conv-root',
    });
    expect(result.runtimeProfiles?.consulting?.services).toBeUndefined();
  });

  it('keeps conflicting managed-profile escape hatches in the runtime browser block during target-shape cleanup', () => {
    const result = materializeFixture(
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
              manualLoginProfileDir: '/tmp/runtime/chatgpt',
            },
            services: {
              chatgpt: {
                manualLogin: false,
                manualLoginProfileDir: '/tmp/service/chatgpt',
              },
            },
          },
        },
      },
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.browser).toEqual({
      manualLogin: true,
      manualLoginProfileDir: '/tmp/runtime/chatgpt',
    });
    expect(result.runtimeProfiles?.consulting?.services?.chatgpt).toEqual({
      manualLogin: false,
      manualLoginProfileDir: '/tmp/service/chatgpt',
    });
  });

  it('removes default-equivalent managed profile paths during target-shape cleanup', () => {
    const result = materializeFixture(
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
      },
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.browser).toBeUndefined();
    expect(result.runtimeProfiles?.consulting?.services?.chatgpt).toEqual({
      manualLogin: true,
    });
    expect(result.runtimeProfiles?.consulting?.services?.grok).toBeUndefined();
  });

  it('preserves external managed profile paths during target-shape cleanup', () => {
    const result = materializeFixture(
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
      },
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.browser).toBeUndefined();
    expect(result.runtimeProfiles?.consulting?.services?.chatgpt).toEqual({
      manualLogin: true,
      manualLoginProfileDir: '/tmp/external/chatgpt',
    });
    expect(result.runtimeProfiles?.consulting?.services?.grok).toEqual({
      manualLoginProfileDir: '/tmp/external/grok',
    });
  });

  it('removes default-equivalent runtime-profile service overrides during target-shape cleanup', () => {
    const result = materializeFixture(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        browserProfiles: {
          consulting: {
            chromePath: '/usr/bin/google-chrome',
          },
        },
        services: {
          chatgpt: {
            modelStrategy: 'current',
            thinkingTime: 'extended',
          },
        },
        runtimeProfiles: {
          consulting: {
            engine: 'browser',
            browserProfile: 'consulting',
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                modelStrategy: 'current',
                thinkingTime: 'extended',
                composerTool: 'canvas',
              },
            },
          },
        },
      },
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.services?.chatgpt).toEqual({
      composerTool: 'canvas',
    });
  });

  it('preserves conflicting service-scoped values in runtimeProfile.browser during cleanup', () => {
    const result = materializeFixture(
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
      },
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
    const result = materializeFixture(
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
      },
      { targetShape: false },
    );

    expect(result.version).toBe(2);
    expect(result.auracallProfile).toBe('consulting');
    expect(result.defaultRuntimeProfile).toBeUndefined();
    expect(result.browserFamilies?.consulting).toEqual({
      chromePath: '/usr/bin/google-chrome',
    });
    expect(result.profiles?.consulting).toEqual({
      engine: 'browser',
      browserFamily: 'consulting',
      defaultService: 'chatgpt',
    });
    expect(result.browserProfiles).toBeUndefined();
    expect(result.runtimeProfiles).toBeUndefined();
  });

  it('treats target-shaped definitions as authoritative when writing compatibility bridge output', () => {
    const result = materializeFixture(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        browserFamilies: {
          consulting: {
            chromePath: '/bridge/chrome',
          },
        },
        browserProfiles: {
          consulting: {
            chromePath: '/target/chrome',
          },
        },
        profiles: {
          consulting: {
            engine: 'browser',
            browserFamily: 'bridge-profile',
            defaultService: 'chatgpt',
          },
        },
        runtimeProfiles: {
          consulting: {
            engine: 'browser',
            browserProfile: 'target-profile',
            defaultService: 'grok',
          },
        },
      },
      { targetShape: false },
    );

    expect(result.browserFamilies?.consulting).toEqual({
      chromePath: '/target/chrome',
    });
    expect(result.profiles?.consulting).toEqual({
      engine: 'browser',
      browserFamily: 'target-profile',
      defaultService: 'grok',
    });
    expect(result.browserProfiles).toBeUndefined();
    expect(result.runtimeProfiles).toBeUndefined();
  });

  it('keeps browser-owned keepBrowser on the bridge browser family when writing compatibility output', () => {
    const result = materializeFixture(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        browserProfiles: {
          consulting: {
            chromePath: '/usr/bin/google-chrome',
            keepBrowser: true,
          },
        },
        runtimeProfiles: {
          consulting: {
            engine: 'browser',
            browserProfile: 'consulting',
            defaultService: 'chatgpt',
          },
        },
      },
      { targetShape: false },
    );

    expect(result.browserFamilies?.consulting).toEqual({
      chromePath: '/usr/bin/google-chrome',
      keepBrowser: true,
    });
    expect(result.profiles?.consulting).toEqual({
      engine: 'browser',
      browserFamily: 'consulting',
      defaultService: 'chatgpt',
    });
  });

  it('backfills llmDefaults project and model defaults from root browser state for compatibility bridge output', () => {
    const result = materializeFixture(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        model: 'gpt-5.2',
        browser: {
          modelStrategy: 'current',
          projectName: 'Legacy Project',
          projectId: 'g-p-legacy-project',
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
          },
        },
      },
      { targetShape: false },
    );

    expect(result.llmDefaults).toEqual({
      model: 'gpt-5.2',
      modelStrategy: 'current',
      defaultProjectName: 'Legacy Project',
      defaultProjectId: 'g-p-legacy-project',
    });
  });

  it('preserves explicit llmDefaults during compatibility bridge materialization', () => {
    const result = materializeFixture(
      {
        version: 3,
        defaultRuntimeProfile: 'consulting',
        model: 'gpt-5.2',
        browser: {
          modelStrategy: 'current',
          projectName: 'Root Project',
          projectId: 'g-p-root-project',
        },
        llmDefaults: {
          model: 'gpt-5.1',
          modelStrategy: 'select',
          defaultProjectName: 'Pinned Legacy Project',
          defaultProjectId: 'g-p-pinned-project',
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
          },
        },
      },
      { targetShape: false },
    );

    expect(result.llmDefaults).toEqual({
      model: 'gpt-5.1',
      modelStrategy: 'select',
      defaultProjectName: 'Pinned Legacy Project',
      defaultProjectId: 'g-p-pinned-project',
    });
  });

  it('moves obvious browser-owned runtime overrides into the referenced bridge browser family', () => {
    const result = materializeFixture(
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
      },
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
    const result = materializeFixture(
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
      },
      { targetShape: false },
    );

    expect(result.profiles?.consulting?.browser).toBeUndefined();
    expect(result.profiles?.consulting?.services?.chatgpt).toEqual({
      manualLogin: true,
      modelStrategy: 'current',
    });
  });

  it('removes default-equivalent managed profile paths during bridge-shape cleanup', () => {
    const result = materializeFixture(
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
      },
      { targetShape: false },
    );

    expect(result.profiles?.consulting?.browser).toBeUndefined();
    expect(result.profiles?.consulting?.services?.chatgpt).toEqual({
      manualLogin: true,
    });
    expect(result.profiles?.consulting?.services?.gemini).toBeUndefined();
  });

  it('removes default-equivalent runtime-profile service overrides during bridge-shape cleanup', () => {
    const result = materializeFixture(
      {
        version: 2,
        auracallProfile: 'consulting',
        browserFamilies: {
          consulting: {
            chromePath: '/usr/bin/google-chrome',
          },
        },
        services: {
          grok: {
            modelStrategy: 'current',
          },
        },
        profiles: {
          consulting: {
            engine: 'browser',
            browserFamily: 'consulting',
            defaultService: 'grok',
            services: {
              grok: {
                modelStrategy: 'current',
                composerTool: 'deep-search',
              },
            },
          },
        },
      },
      { targetShape: false },
    );

    expect(result.profiles?.consulting?.services?.grok).toEqual({
      composerTool: 'deep-search',
    });
  });

  it('prunes empty services containers after conservative cleanup', () => {
    const result = materializeFixture(
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
      },
      { targetShape: true },
    );

    expect(result.runtimeProfiles?.consulting?.services).toBeUndefined();
  });

  it('keeps conflicting runtime browser overrides in place during migration cleanup', () => {
    const result = materializeFixture(
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
      },
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
