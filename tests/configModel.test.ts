import { describe, expect, it } from 'vitest';
import {
  CONFIG_MODEL_BRIDGE_KEYS,
  analyzeConfigModelBridgeHealth,
  getAgentRuntimeProfile,
  getAgentRuntimeProfileId,
  getBrowserProfile,
  ensureBrowserProfiles,
  ensureRuntimeProfiles,
  getActiveRuntimeProfile,
  getActiveRuntimeProfileName,
  getBrowserProfiles,
  getBridgeRuntimeProfiles,
  getLegacyRuntimeProfiles,
  getCurrentRuntimeProfiles,
  getTargetRuntimeProfiles,
  getPreferredRuntimeProfile,
  getPreferredRuntimeProfileName,
  inspectConfigModel,
  projectConfigModel,
  getRuntimeProfileBrowserProfile,
  getRuntimeProfileBrowserProfileId,
  getRuntimeProfiles,
  setBrowserProfile,
  setRuntimeProfile,
  setRuntimeProfileBrowserProfile,
} from '../src/config/model.js';

describe('config model helpers', () => {
  it('treats browserFamilies as the current browser-profile bridge', () => {
    const config: Record<string, unknown> = {};
    setBrowserProfile(config, 'consulting', { chromePath: '/usr/bin/google-chrome' });

    expect(getBrowserProfiles(config)).toEqual({
      consulting: { chromePath: '/usr/bin/google-chrome' },
    });
    expect(getBrowserProfile(config, 'consulting')).toEqual({
      chromePath: '/usr/bin/google-chrome',
    });
    expect(ensureBrowserProfiles(config)).toBe(config.browserFamilies);
  });

  it('prefers target-shape browser and runtime profiles over bridge keys when both exist', () => {
    const config = {
      browserFamilies: {
        default: { chromePath: '/bridge/chrome' },
      },
      browserProfiles: {
        default: { chromePath: '/target/chrome' },
      },
      profiles: {
        default: { browserFamily: 'bridge-default', defaultService: 'chatgpt' },
      },
      runtimeProfiles: {
        default: { browserProfile: 'target-default', defaultService: 'grok' },
      },
    };

    expect(getBrowserProfiles(config)).toEqual({
      default: { chromePath: '/target/chrome' },
    });
    expect(getCurrentRuntimeProfiles(config)).toEqual({
      default: { browserProfile: 'target-default', defaultService: 'grok' },
    });
    expect(getTargetRuntimeProfiles(config)).toEqual({
      default: { browserProfile: 'target-default', defaultService: 'grok' },
    });
    expect(getRuntimeProfileBrowserProfileId(getCurrentRuntimeProfiles(config).default)).toBe('target-default');
  });

  it('treats profiles as the current runtime-profile bridge and reads browserFamily as the bridge reference', () => {
    const config: Record<string, unknown> = {};
    setBrowserProfile(config, 'consulting', { chromePath: '/usr/bin/google-chrome' });
    const runtimeProfile: Record<string, unknown> = {
      defaultService: 'chatgpt',
    };
    setRuntimeProfileBrowserProfile(runtimeProfile, 'consulting');
    setRuntimeProfile(config, 'consulting', runtimeProfile);

    expect(getRuntimeProfiles(config)).toEqual({
      consulting: {
        defaultService: 'chatgpt',
        browserFamily: 'consulting',
      },
    });
    expect(getRuntimeProfileBrowserProfileId(runtimeProfile)).toBe('consulting');
    expect(getRuntimeProfileBrowserProfile(config, runtimeProfile)).toEqual({
      chromePath: '/usr/bin/google-chrome',
    });
    expect(ensureRuntimeProfiles(config)).toBe(config.profiles);
  });

  it('projects agent inheritance through runtime profiles without reopening browser-profile lookup', () => {
    const config = {
      browserProfiles: {
        default: {},
        consulting: {},
      },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
        work: { browserProfile: 'consulting', defaultService: 'grok' },
      },
      agents: {
        researcher: { runtimeProfile: 'default' },
        analyst: { runtimeProfile: 'work' },
      },
      teams: {
        ops: { agents: ['researcher', 'analyst'] },
      },
    };

    expect(getAgentRuntimeProfileId(config.agents.researcher)).toBe('default');
    expect(getAgentRuntimeProfile(config, config.agents.analyst)).toEqual({
      browserProfile: 'consulting',
      defaultService: 'grok',
    });
    expect(projectConfigModel(config)).toEqual({
      activeRuntimeProfileId: 'default',
      activeBrowserProfileId: 'default',
      browserProfiles: [{ id: 'consulting' }, { id: 'default' }],
      runtimeProfiles: [
        { id: 'default', browserProfileId: 'default', defaultService: 'chatgpt' },
        { id: 'work', browserProfileId: 'consulting', defaultService: 'grok' },
      ],
      agents: [
        { id: 'analyst', runtimeProfileId: 'work', browserProfileId: 'consulting', defaultService: 'grok' },
        { id: 'researcher', runtimeProfileId: 'default', browserProfileId: 'default', defaultService: 'chatgpt' },
      ],
      teams: [{ id: 'ops', agentIds: ['researcher', 'analyst'] }],
    });
  });

  it('prefers legacy auracallProfiles when selecting the active runtime profile bridge', () => {
    const config = {
      auracallProfile: 'legacy',
      profiles: {
        current: { defaultService: 'chatgpt' },
      },
      auracallProfiles: {
        legacy: { defaultService: 'grok' },
      },
    };

    expect(getCurrentRuntimeProfiles(config)).toEqual({
      current: { defaultService: 'chatgpt' },
    });
    expect(getLegacyRuntimeProfiles(config)).toEqual({
      legacy: { defaultService: 'grok' },
    });
    expect(getBridgeRuntimeProfiles(config)).toEqual({
      legacy: { defaultService: 'grok' },
    });
    expect(getActiveRuntimeProfileName(config)).toBe('legacy');
    expect(getActiveRuntimeProfile(config)).toEqual({ defaultService: 'grok' });
  });

  it('prefers defaultRuntimeProfile over auracallProfile for top-level target-shape selection', () => {
    const config = {
      defaultRuntimeProfile: 'work',
      auracallProfile: 'legacy',
      runtimeProfiles: {
        work: { browserProfile: 'default', defaultService: 'chatgpt' },
      },
      auracallProfiles: {
        legacy: { defaultService: 'grok' },
      },
    };

    expect(getActiveRuntimeProfileName(config)).toBe('work');
  });

  it('prefers the explicit current runtime profile over legacy when both shapes exist', () => {
    const config = {
      auracallProfile: 'legacy',
      profiles: {
        work: { defaultService: 'chatgpt' },
      },
      auracallProfiles: {
        legacy: { defaultService: 'grok' },
        work: { defaultService: 'gemini' },
      },
    };

    expect(getPreferredRuntimeProfileName(config, { explicitProfileName: 'work' })).toBe('work');
    expect(getPreferredRuntimeProfile(config, { explicitProfileName: 'work' })).toEqual({
      defaultService: 'chatgpt',
    });
  });

  it('projects the target config model from bridge-key config', () => {
    const config = {
      auracallProfile: 'work',
      browserFamilies: {
        default: { chromePath: '/usr/bin/google-chrome' },
        'wsl-chrome-2': { chromePath: '/usr/bin/google-chrome' },
      },
      profiles: {
        default: { browserFamily: 'default', defaultService: 'chatgpt' },
        work: { browserFamily: 'wsl-chrome-2', defaultService: 'grok' },
      },
    };

    expect(projectConfigModel(config)).toEqual({
      activeRuntimeProfileId: 'work',
      activeBrowserProfileId: 'wsl-chrome-2',
      browserProfiles: [{ id: 'default' }, { id: 'wsl-chrome-2' }],
      runtimeProfiles: [
        { id: 'default', browserProfileId: 'default', defaultService: 'chatgpt' },
        { id: 'work', browserProfileId: 'wsl-chrome-2', defaultService: 'grok' },
      ],
      agents: [],
      teams: [],
    });
  });

  it('builds a shared inspection view for read-only config surfaces', () => {
    const config = {
      auracallProfile: 'work',
      browserFamilies: {
        default: { chromePath: '/usr/bin/google-chrome' },
        'wsl-chrome-2': { chromePath: '/usr/bin/google-chrome' },
      },
      profiles: {
        default: { browserFamily: 'default', defaultService: 'chatgpt' },
        work: { browserFamily: 'wsl-chrome-2', defaultService: 'grok' },
      },
    };

    expect(inspectConfigModel(config)).toEqual({
      activeRuntimeProfileId: 'work',
      activeBrowserProfileId: 'wsl-chrome-2',
      activeDefaultService: 'grok',
      browserProfileIds: ['default', 'wsl-chrome-2'],
      runtimeProfiles: [
        { id: 'default', browserProfileId: 'default', defaultService: 'chatgpt' },
        { id: 'work', browserProfileId: 'wsl-chrome-2', defaultService: 'grok' },
      ],
      agentIds: [],
      teamIds: [],
      legacyRuntimeProfileIds: [],
      targetState: {
        browserProfilesPresent: false,
        runtimeProfilesPresent: false,
      },
      bridgeState: {
        browserProfilesPresent: true,
        auracallRuntimeProfilesPresent: true,
        legacyRuntimeProfilesPresent: false,
      },
      bridgeKeys: CONFIG_MODEL_BRIDGE_KEYS,
      projectedModel: {
        activeRuntimeProfileId: 'work',
        activeBrowserProfileId: 'wsl-chrome-2',
        browserProfiles: [{ id: 'default' }, { id: 'wsl-chrome-2' }],
        runtimeProfiles: [
          { id: 'default', browserProfileId: 'default', defaultService: 'chatgpt' },
          { id: 'work', browserProfileId: 'wsl-chrome-2', defaultService: 'grok' },
        ],
        agents: [],
        teams: [],
      },
    });
  });

  it('analyzes bridge-health from the shared config model seam', () => {
    const config = {
      auracallProfile: 'default',
      browserFamilies: {
        'wsl-chrome-2': {},
        orphaned: {},
      },
      profiles: {
        default: {
          defaultService: 'grok',
        },
        work: {
          browserFamily: 'missing-profile',
          defaultService: 'chatgpt',
        },
        consulting: {
          browserFamily: 'wsl-chrome-2',
          defaultService: 'chatgpt',
        },
      },
      auracallProfiles: {
        legacy: {
          defaultService: 'chatgpt',
        },
      },
    };

    expect(analyzeConfigModelBridgeHealth(config, { explicitProfileName: 'default' })).toEqual({
      ok: false,
      activeAuracallRuntimeProfile: 'default',
      activeBrowserProfile: null,
      targetState: {
        browserProfilesPresent: false,
        runtimeProfilesPresent: false,
      },
      precedence: {
        browserProfiles: 'bridge',
        runtimeProfiles: 'bridge',
        runtimeProfileBrowserProfileReference: 'bridge',
      },
      issueCount: 5,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'legacy-runtime-profiles-present',
          severity: 'info',
        }),
        expect.objectContaining({
          code: 'runtime-profile-missing-browser-profile',
          auracallRuntimeProfile: 'default',
        }),
        expect.objectContaining({
          code: 'runtime-profile-browser-profile-missing',
          auracallRuntimeProfile: 'work',
          browserProfile: 'missing-profile',
        }),
        expect.objectContaining({
          code: 'unused-browser-profile',
          browserProfile: 'orphaned',
        }),
        expect.objectContaining({
          code: 'active-runtime-profile-missing-browser-profile',
          auracallRuntimeProfile: 'default',
        }),
      ]),
    });
  });

  it('reports mixed-key and conflicting dual-read diagnostics when target and bridge definitions disagree', () => {
    const config = {
      auracallProfile: 'default',
      browserFamilies: {
        default: { chromePath: '/bridge/chrome' },
      },
      browserProfiles: {
        default: { chromePath: '/target/chrome' },
      },
      profiles: {
        default: {
          browserFamily: 'bridge-default',
          defaultService: 'chatgpt',
        },
      },
      runtimeProfiles: {
        default: {
          browserProfile: 'target-default',
          browserFamily: 'bridge-default',
          defaultService: 'grok',
        },
      },
    };

    expect(analyzeConfigModelBridgeHealth(config, { explicitProfileName: 'default' })).toEqual({
      ok: false,
      activeAuracallRuntimeProfile: 'default',
      activeBrowserProfile: 'target-default',
      targetState: {
        browserProfilesPresent: true,
        runtimeProfilesPresent: true,
      },
      precedence: {
        browserProfiles: 'target',
        runtimeProfiles: 'target',
        runtimeProfileBrowserProfileReference: 'target',
      },
      issueCount: 7,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'mixed-browser-profile-keys',
          severity: 'info',
        }),
        expect.objectContaining({
          code: 'conflicting-browser-profile-definitions',
          severity: 'warning',
          browserProfile: 'default',
        }),
        expect.objectContaining({
          code: 'mixed-runtime-profile-keys',
          severity: 'info',
        }),
        expect.objectContaining({
          code: 'conflicting-runtime-profile-definitions',
          severity: 'warning',
          auracallRuntimeProfile: 'default',
        }),
        expect.objectContaining({
          code: 'mixed-runtime-profile-browser-reference',
          severity: 'warning',
          auracallRuntimeProfile: 'default',
          browserProfile: 'target-default',
        }),
        expect.objectContaining({
          code: 'runtime-profile-browser-profile-missing',
          severity: 'warning',
          auracallRuntimeProfile: 'default',
          browserProfile: 'target-default',
        }),
        expect.objectContaining({
          code: 'unused-browser-profile',
          severity: 'info',
          browserProfile: 'default',
        }),
      ]),
    });
  });
});
