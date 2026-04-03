import { describe, expect, it } from 'vitest';
import {
  CONFIG_MODEL_BRIDGE_KEYS,
  analyzeConfigModelBridgeHealth,
  getBrowserProfile,
  ensureBrowserProfiles,
  ensureRuntimeProfiles,
  getActiveRuntimeProfile,
  getActiveRuntimeProfileName,
  getBrowserProfiles,
  getBridgeRuntimeProfiles,
  getLegacyRuntimeProfiles,
  getCurrentRuntimeProfiles,
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
      legacyRuntimeProfileIds: [],
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
});
